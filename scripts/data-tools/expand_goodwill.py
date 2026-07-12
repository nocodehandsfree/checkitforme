"""EXPAND Goodwill: import locator locations we don't have yet — RETAIL STORES ONLY.

The hours harvest indexed Goodwill's full network (gw_state.json) but only fetched details for
stores already in our DB. This fetches details for the locator phones NOT in our DB, keeps only
those with a real "Retail Store" service (donation-drop-off-only sites are NOT shoppable -> skip),
and writes complete import records (name/address/coords/phone/hours) to gw_new.json.

Integrity: donation-only -> skipped. Permanently closed (LocationClosedDate) -> skipped (we don't
add dead stores). Retail store with no published hours -> imported without hours (still callable).
Run: GWNONCE=<valid nonce> python3 expand_goodwill.py   then dry-run import gw_new.json.
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, sys, time

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
GW = "https://www.goodwill.org"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

def curl(url, referer=None):
    cmd = ["curl", "-s", "--max-time", "60", "-A", UA]
    if referer: cmd += ["-H", f"Referer: {referer}"]
    cmd.append(url)
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else None

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def norm(p):
    d = re.sub(r"\D", "", str(p or "")); return d[-10:] if len(d) >= 10 else None

def fresh_nonce():
    if os.environ.get("GWNONCE"): return os.environ["GWNONCE"]
    html = curl(f"{GW}/locator/")
    m = re.search(r'"nonce":"([0-9a-f]+)"', html or "")
    if not m: sys.exit("no nonce");
    return m.group(1)

nonce = fresh_nonce()
def api(action, params):
    global nonce
    for attempt in (1, 2):
        q = "&".join(f"{k}={v}" for k, v in {**params, "action": action, "security": nonce}.items())
        raw = curl(f"{GW}/wp-admin/admin-ajax.php?{q}", referer=f"{GW}/locator/")
        if (raw or "").strip() == "-1":
            if attempt == 1: nonce = fresh_nonce(); continue
            sys.exit("nonce rejected — rerun with GWNONCE=<valid>")
        try:
            d = json.loads(raw)
            if d.get("success"): return d["data"]["data"]
        except Exception: pass
    return None

def to24(t):
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", (t or "").strip(), re.I)
    if not m: return None
    h, mi, ap = int(m.group(1)), m.group(2), m.group(3).upper()
    if ap == "PM" and h != 12: h += 12
    if ap == "AM" and h == 12: h = 0
    return f"{h:02d}:{mi}"

# existing phones
allphones = set(); off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        p = norm(r.get("phone"))
        if p: allphones.add(p)
    off += len(rows)
    if len(rows) < 20000: break

st = json.load(open("gw_state.json"))
idx = st["index"]
unmatched = [(ph, v) for ph, v in idx.items() if ph not in allphones]
print("unmatched Goodwill locator phones to classify:", len(unmatched))

cache = json.load(open("gw_expand_details.json")) if os.path.exists("gw_expand_details.json") else {}
records = []; retail = 0; donation_only = 0; closed = 0
for i, (ph, v) in enumerate(unmatched):
    lid = v["lid"]
    if lid not in cache:
        rows = api("gwlf_get_location_details", {"locationId": lid, "lat": v["lat"], "lng": v["lng"]})
        cache[lid] = rows or []
        time.sleep(0.25)
        if i % 25 == 0:
            json.dump(cache, open("gw_expand_details.json", "w"))
            print(f"details {i}/{len(unmatched)} retail={retail} donation_only={donation_only}", flush=True)
    rows = cache[lid]
    svc = next((x for x in rows if x.get("ServiceName") == "Retail Store"), None)
    if not svc:
        donation_only += 1; continue
    if svc.get("LocationClosedDate"):
        closed += 1; continue
    hours = {}
    anyh = False
    for d in DAYS:
        o, c = to24(svc.get(f"{d}OpeningTime")), to24(svc.get(f"{d}ClosingTime"))
        if o and c: hours[d.lower()] = f"{o}-{c}"; anyh = True
        else: hours[d.lower()] = "closed"
    rec = {
        "chain": "Goodwill", "category": "thrift",
        "name": (svc.get("LocationName") or "").strip() or "Goodwill",
        "address": (svc.get("LocationStreetAddress1") or "").strip(),
        "city": (svc.get("LocationCity1") or "").strip(),
        "state": (svc.get("LocationState1") or "").strip(),
        "zip": (svc.get("LocationPostal1") or "").strip(),
        "lat": svc.get("LocationLatitude1"), "lng": svc.get("LocationLongitude1"),
        "phone": ph, "sellsPacks": True, "hasKiosk": False,
        "stockStatus": "unverified",
    }
    if anyh: rec["hours"] = hours
    records.append(rec); retail += 1
json.dump(cache, open("gw_expand_details.json", "w"))
json.dump(records, open("gw_new.json", "w"))
print(f"classified: retail(new importable)={retail} donation_only={donation_only} closed={closed}")
print(f"wrote gw_new.json: {len(records)} new Goodwill retail stores ({sum(1 for r in records if 'hours' in r)} with hours)")

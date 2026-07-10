"""FREE Goodwill hours harvest via goodwill.org's own locator API (no search spend).

Flow: pull our no-hours Goodwill rows (with lat/lng/phone) from staging -> greedy-sweep the
locator API (gwlf_get_locations) around our stores building a phone-keyed index -> for each
phone match, gwlf_get_location_details -> "Retail Store" service hours -> emit hb-format JSON
batches into $OUT (default gwout/) for the standard `agg_hobby.py --apply` write path.

Resumable: progress in gw_state.json (index + details cache); re-run continues.
Token: ADMIN_TOKEN env or .atok in cwd. curl subprocess ONLY (python http is proxy-blocked).
Politeness: ~4 req/s to goodwill.org.
"""
import json, os, re, subprocess, sys, time

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = os.environ.get("OUT", "gwout")
GW = "https://www.goodwill.org"
STATE = "gw_state.json"
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

def norm_phone(p):
    d = re.sub(r"\D", "", str(p or ""))
    return d[-10:] if len(d) >= 10 else None

def fresh_nonce():
    # GWNONCE env overrides: the locator page cache can serve a nonce that admin-ajax rejects ("-1")
    # while an older one still validates. Grab a working one from a browser/session if needed.
    if os.environ.get("GWNONCE"): return os.environ["GWNONCE"]
    html = curl(f"{GW}/locator/")
    m = re.search(r'"nonce":"([0-9a-f]+)"', html or "")
    if not m: sys.exit("could not extract locator nonce")
    return m.group(1)

def to24(t):
    t = (t or "").strip()
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", t, re.I)
    if not m: return None
    h, mi, ap = int(m.group(1)), m.group(2), m.group(3).upper()
    if ap == "PM" and h != 12: h += 12
    if ap == "AM" and h == 12: h = 0
    return f"{h:02d}:{mi}"

# ---- load state
state = {"index": {}, "details": {}, "queried": []}
if os.path.exists(STATE):
    state = json.load(open(STATE))
queried = set(map(tuple, state["queried"]))

def save_state():
    state["queried"] = [list(q) for q in queried]
    json.dump(state, open(STATE, "w"))

# ---- our no-hours Goodwill stores with coords
def hashours(h):
    if not h or h in ("", "null", "{}"): return False
    try:
        hj = json.loads(h) if isinstance(h, str) else h
        return isinstance(hj, dict) and any(v for v in hj.values())
    except Exception: return False

chains = admin_get("/api/admin/table-dump?name=chains&limit=5000")["rows"]
gw_chains = {c["id"] for c in chains if (c.get("name") or "").strip().lower() == "goodwill"}
stores = []; off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        if r.get("chainId") in gw_chains and r.get("active") is not False and not hashours(r.get("hours")):
            ph = norm_phone(r.get("phone"))
            if ph and r.get("lat") and r.get("lng"):
                stores.append({"id": r["id"], "ph": ph, "lat": float(r["lat"]), "lng": float(r["lng"])})
    off += len(rows)
    if len(rows) < 20000: break
print(f"our Goodwill stores needing hours (phone+coords): {len(stores)}")

nonce = fresh_nonce()

def api(action, params):
    global nonce
    for attempt in (1, 2):
        q = "&".join(f"{k}={v}" for k, v in {**params, "action": action, "security": nonce}.items())
        raw = curl(f"{GW}/wp-admin/admin-ajax.php?{q}", referer=f"{GW}/locator/")
        if (raw or "").strip() == "-1":            # WP nonce rejected
            if attempt == 1: nonce = fresh_nonce(); continue
            sys.exit("nonce rejected twice — get a valid one (browser devtools) and rerun with GWNONCE=<nonce>")
        try:
            d = json.loads(raw)
            if d.get("success"): return d["data"]["data"]
        except Exception: pass
    return None

# fail fast if the nonce doesn't validate before a long run
if api("gwlf_get_locations", {"lat": 33.749, "lng": -84.388, "radius": 5, "cats": ""}) is None:
    sys.exit("self-test query returned nothing — aborting before the sweep")
print("nonce self-test OK")

# ---- phase 1: greedy sweep to build phone index
t0 = time.time()
for i, s in enumerate(stores):
    if s["ph"] in state["index"]: continue
    key = (round(s["lat"], 1), round(s["lng"], 1))
    if key in queried: continue
    locs = api("gwlf_get_locations", {"lat": s["lat"], "lng": s["lng"], "radius": 50, "cats": ""})
    if locs is None: continue          # transient failure: leave this cell unqueried for the next run
    queried.add(key)
    for L in locs or []:
        p = norm_phone(L.get("LocationPhoneOffice"))
        if p and p not in state["index"]:
            state["index"][p] = {"lid": L["LocationId"], "lat": L["LocationLatitude1"],
                                 "lng": L["LocationLongitude1"], "closed": bool(L.get("LocationClosedDate"))}
    if i % 25 == 0:
        save_state()
        print(f"sweep {i}/{len(stores)} index={len(state['index'])} elapsed={int(time.time()-t0)}s", flush=True)
    time.sleep(0.25)
save_state()
matched = [s for s in stores if s["ph"] in state["index"]]
print(f"sweep done: index={len(state['index'])} matched by phone: {len(matched)}/{len(stores)}")

# ---- phase 2: details -> retail hours
results = []
for i, s in enumerate(matched):
    hit = state["index"][s["ph"]]
    lid = hit["lid"]
    if lid not in state["details"]:
        rows = api("gwlf_get_location_details", {"locationId": lid, "lat": s["lat"], "lng": s["lng"]})
        state["details"][lid] = rows or []
        time.sleep(0.25)
        if i % 25 == 0:
            save_state()
            print(f"details {i}/{len(matched)}", flush=True)
    svc = None
    for row in state["details"][lid]:
        if (row.get("ServiceName") or "") == "Retail Store": svc = row; break
    out = {"id": s["id"]}
    if hit["closed"]:
        for d in DAYS: out[d.lower()] = "closed"      # API says location closed -> deactivate path
    elif not svc:
        for d in DAYS: out[d.lower()] = "unknown"     # no retail service listed -> don't guess
    else:
        for d in DAYS:
            o, c = to24(svc.get(f"{d}OpeningTime")), to24(svc.get(f"{d}ClosingTime"))
            out[d.lower()] = f"{o}-{c}" if o and c else ("closed" if svc.get(f"{d}OpeningTime") in (None, "", "Closed") else "unknown")
    results.append(out)
save_state()

os.makedirs(OUT, exist_ok=True)
CH = 500
for b in range(0, len(results), CH):
    json.dump(results[b:b + CH], open(f"{OUT}/hb_gw{b // CH}.json", "w"))
withdata = sum(1 for r in results if any(v not in ("unknown",) for k, v in r.items() if k != "id"))
allclosed = sum(1 for r in results if all(v == "closed" for k, v in r.items() if k != "id"))
print(f"wrote {len(results)} results to {OUT}/ ({withdata} with data, {allclosed} closed-location)")
print(f"unmatched (no phone hit in locator index): {len(stores) - len(matched)}")

"""VALIDATE + import net-new hobby shops harvested from cardshophub (csh_new_raw.jsonl).

Same integrity discipline as the thrift expansion:
  - US only (addressCountry US + valid 2-letter state)
  - real dialable local line (10-digit, NOT toll-free) — required, no phone => not callable => drop
  - non-empty name AND address
  - dedupe by phone (global) AND by (house-number, city, state) vs existing hobby-family stores,
    so a shop we already carry under a different phone is not duplicated
New shops import under chain 'Independent Card Shop' (category hobby), matching our existing 4,119.
Run: python3 apply_hobby_expansion.py [--apply]   (DRY default)
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, sys, time

DRY = "--apply" not in sys.argv
BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
SRC = os.environ.get("SRC", "csh_new_raw.jsonl")
US = {'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
      'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
      'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'}
TOLLFREE = {"800", "888", "877", "866", "855", "844", "833", "822"}
HOBBY_CHAINS = {"Independent Card Shop", "Comic Book Shop", "Burbank Sportscards", "PokeMall TCG",
                "Cards and Coffee", "Cash Cards Unlimited", "CoreTCG", "LA Sports Cards"}

def req(method, path, data=None):
    cmd = ["curl", "-s", "--max-time", "180", "-X", method,
           "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}"]
    if data is not None:
        cmd += ["-H", "content-type: application/json", "-d", json.dumps(data)]
    cmd.append(BASE + path)
    for _ in range(4):
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        try: return json.loads(out)
        except Exception: time.sleep(2)
    raise SystemExit("api not responding")

def norm(p):
    d = re.sub(r"\D", "", str(p or "")); return d[-10:] if len(d) >= 10 else None

def akey(street, city, state):
    num = (re.match(r"\s*(\d+)", street or "") or [None, ""])[1] if street else ""
    return (num, re.sub(r"[^a-z]", "", (city or "").lower()), (state or "").upper())

allphones = set(); alladdr = set(); off = 0
chains = req("GET", "/api/admin/table-dump?name=chains&limit=5000")["rows"]
cname = {c["id"]: (c.get("name") or "") for c in chains}
while True:
    rows = req("GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        p = norm(r.get("phone"))
        if p: allphones.add(p)
        if cname.get(r.get("chainId")) in HOBBY_CHAINS:
            city = (r.get("location") or "").split(",")[0].strip()
            alladdr.add(akey(r.get("address"), city, r.get("state")))
    off += len(rows)
    if len(rows) < 20000: break
print("existing phones:", len(allphones), "| existing hobby-family addresses:", len(alladdr))

drops = {k: 0 for k in ("no_store", "non_us", "no_phone", "toll_free", "bad_state",
                        "no_name", "no_address", "dupe_phone", "dupe_address")}
seen = set(); seen_addr = set(); out = []
for line in open(SRC):
    try: rec = json.loads(line)
    except Exception: continue
    if rec.get("skip") or not rec.get("name"): drops["no_store"] += 1; continue
    country = (rec.get("country") or "US").upper()
    st = (rec.get("state") or "").strip().upper()
    if country not in ("US", "USA", "UNITED STATES") or st not in US:
        drops["non_us" if st not in US else "non_us"] += 1; continue
    ph = norm(rec.get("phone"))
    if not ph: drops["no_phone"] += 1; continue
    if ph[:3] in TOLLFREE: drops["toll_free"] += 1; continue
    if not (rec.get("name") or "").strip(): drops["no_name"] += 1; continue
    if not (rec.get("address") or "").strip(): drops["no_address"] += 1; continue
    if ph in allphones or ph in seen: drops["dupe_phone"] += 1; continue
    ak = akey(rec.get("address"), rec.get("city"), st)
    if ak in alladdr or ak in seen_addr: drops["dupe_address"] += 1; continue
    seen.add(ph); seen_addr.add(ak)
    item = {"chain": "Independent Card Shop", "category": "hobby",
            "name": rec["name"].strip(), "address": rec["address"].strip(),
            "city": (rec.get("city") or "").strip(), "state": st, "zip": (rec.get("zip") or "").strip(),
            "lat": rec.get("lat"), "lng": rec.get("lng"),
            "phone": ph, "sellsPacks": True, "hasKiosk": False, "stockStatus": "unverified"}
    if rec.get("hours"): item["hours"] = rec["hours"]
    out.append(item)

print(f"{'DRY' if DRY else 'APPLY'} — net-new hobby shops: {len(out)} | with hours: {sum(1 for r in out if 'hours' in r)}")
print("dropped:", drops)
if out:
    for r in out[:4]:
        print("  ", r["name"][:34], "|", r["city"], r["state"], "|", r["phone"], "|", ("hours" if "hours" in r else "no-hours"))
if DRY:
    print("\ndry-run — rerun with --apply to import")
    sys.exit(0)

ins = upd = dea = ski = 0
for i in range(0, len(out), 500):
    r = req("POST", "/api/stores/import", {"stores": out[i:i + 500]})
    ins += r.get("inserted", 0); upd += r.get("updated", 0); dea += r.get("deactivated", 0); ski += r.get("skipped", 0)
print(f"import result: inserted={ins} updated={upd} deactivated={dea} skipped={ski}")
json.dump({"phones": [r["phone"] for r in out]}, open("hobby_expansion_applied.json", "w"))

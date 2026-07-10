"""EXPAND Salvation Army: import satruck store locations we don't have yet.

Uses the sa_zips.json cache from the hours harvest. Keeps STORE-type locations whose phone is
NOT in our DB, parses hours with the same conservative parser, writes sa_new.json.
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, importlib.util

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# reuse the hours parser from the harvester
spec = importlib.util.spec_from_file_location("hsa_src", os.path.join(os.path.dirname(__file__), "harvest_salvationarmy.py"))
src = open(spec.origin).read().split("# ---- our SA rows")[0]
ns = {}; exec(src, ns)
parse_hours = ns["parse_hours"]; DAYS = ns["DAYS"]

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def norm(p):
    d = re.sub(r"\D", "", str(p or "")); return d[-10:] if len(d) >= 10 else None

allphones = set(); off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        p = norm(r.get("phone"))
        if p: allphones.add(p)
    off += len(rows)
    if len(rows) < 20000: break

cache = json.load(open("sa_zips.json"))
seen = set(); records = []
for locs in cache.values():
    for L in locs:
        if "STORE" not in (L.get("TypeName") or ""): continue
        ph = norm(L.get("ContactPhone"))
        if not ph or ph in allphones or ph in seen: continue
        seen.add(ph)
        zc = re.sub(r"\D", "", str(L.get("Zip") or ""))[:5]
        rec = {"chain": "Salvation Army", "category": "thrift",
               "name": (L.get("Name") or "Salvation Army").strip(),
               "address": (L.get("Address1") or "").strip(), "city": (L.get("City") or "").strip(),
               "state": (L.get("State") or "").strip(), "zip": zc,
               "lat": L.get("Latitude"), "lng": L.get("Longitude"),
               "phone": ph, "sellsPacks": True, "hasKiosk": False, "stockStatus": "unverified"}
        h = parse_hours(L.get("Hours") or "")
        if h: rec["hours"] = h
        records.append(rec)
json.dump(records, open("sa_new.json", "w"))
print("new Salvation Army stores:", len(records), "| with hours:", sum(1 for r in records if "hours" in r))

"""EXPAND hobby: harvest the Wizards Play Network store locator (local game/TCG stores).

WPN's public GraphQL (api.tabletop.wizards.com) exposes storesByLocation(lat,lng,maxMeters) with
name / postalAddress / phone / coords / website (no hours). We sweep a national point grid (one
representative store coord per 3-digit zip prefix in our base), paginate each, dedupe by WPN store id.

Writes wpn_new_raw.jsonl. apply_hobby_expansion.py gates + dedupes (phone + address vs our hobby
stores, big-box/kiosk filter) and imports net-new under 'Independent Card Shop'.
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, time
from collections import Counter

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
GQL = "https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql"
OUT = os.environ.get("OUT", "wpn_new_raw.jsonl")
QUERY = ("query getStoresByLocation($latitude: Float!, $longitude: Float!, $maxMeters: Int!, "
         "$pageSize: Int, $page: Int){ storesByLocation(input:{latitude:$latitude, longitude:$longitude, "
         "maxMeters:$maxMeters, pageSize:$pageSize, page:$page}){ stores{ id name postalAddress latitude "
         "longitude phoneNumber website } pageInfo{ page pageSize totalResults } } }")

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def gql(lat, lng, meters, page, pagesize=200):
    body = {"query": QUERY, "variables": {"latitude": lat, "longitude": lng, "maxMeters": meters,
                                          "pageSize": pagesize, "page": page}}
    tmp = "wpn_body.json"; open(tmp, "w").write(json.dumps(body))
    for _ in range(3):
        out = subprocess.run(["curl", "-s", "--max-time", "45", "-A", UA,
                              "-H", "Content-Type: application/json", "-H", "Origin: https://locator.wizards.com",
                              "-H", "Referer: https://locator.wizards.com/", "-X", "POST", GQL,
                              "--data-binary", "@" + tmp], capture_output=True, text=True).stdout
        try:
            d = json.loads(out).get("data", {}).get("storesByLocation")
            if d is not None: return d
        except Exception: pass
        time.sleep(1)
    return None

# national point grid: one representative store coord per 3-digit zip prefix in our base
byprefix = {}
off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        z = re.sub(r"\D", "", str(r.get("zip") or ""))[:3]
        if len(z) == 3 and r.get("lat") and r.get("lng"):
            byprefix.setdefault(z, (float(r["lat"]), float(r["lng"])))
    off += len(rows)
    if len(rows) < 20000: break
points = list(byprefix.values())
print("national point grid (one per 3-digit zip prefix):", len(points))

seen_ids = set(); done_pts = set()
if os.path.exists(OUT):
    for line in open(OUT):
        try:
            o = json.loads(line)
            if o.get("_pt_done"): done_pts.add(tuple(o["_pt_done"]))
            elif o.get("id"): seen_ids.add(o["id"])
        except Exception: pass
print("resumed: points done", len(done_pts), "stores so far", len(seen_ids))

out = open(OUT, "a")
for i, (lat, lng) in enumerate(points):
    key = (round(lat, 4), round(lng, 4))
    if key in done_pts: continue
    page = 0
    while True:
        d = gql(lat, lng, 60000, page)
        if not d: break
        for s in d["stores"]:
            if s["id"] in seen_ids: continue
            seen_ids.add(s["id"])
            out.write(json.dumps(s) + "\n")
        pi = d["pageInfo"]
        if (pi["page"] + 1) * pi["pageSize"] >= pi["totalResults"]: break
        page += 1
        time.sleep(0.1)
    out.write(json.dumps({"_pt_done": list(key)}) + "\n"); out.flush()
    if i % 50 == 0:
        print(f"{i}/{len(points)} points | unique WPN stores: {len(seen_ids)}", flush=True)
    time.sleep(0.12)
print(f"done: unique WPN stores: {len(seen_ids)}")

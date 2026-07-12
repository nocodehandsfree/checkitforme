"""List active stores of a chain TYPE that have no hours, from the live DB (source of truth).

Usage: python3 hobby_nohours.py [Hobby|Thrift|...]   (default Hobby)
Token: reads ADMIN_TOKEN env var, else a `.atok` file in cwd.
⚠️ curl subprocess ONLY — python urllib/requests are blocked by this env's agent proxy
   (they fail in a way that looks like the site is down; it isn't).
"""
import json, csv, os, subprocess, sys
BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TYPE = sys.argv[1] if len(sys.argv) > 1 else "Hobby"

def get(path):
    out = subprocess.run(
        ["curl", "-s", "--max-time", "180",
         "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def rows_of(d):
    return d if isinstance(d, list) else d.get("rows", d.get("data", []))

chains = rows_of(get("/api/admin/table-dump?name=chains&limit=5000"))
ctype = {c["id"]: (c.get("type") or "") for c in chains}
cname = {c["id"]: c.get("name") for c in chains}

def hashours(h):
    if not h or h in ("", "null", "{}"): return False
    try:
        hj = json.loads(h) if isinstance(h, str) else h
        return isinstance(hj, dict) and any(v for v in hj.values())
    except Exception:
        return False

rows_out = []; off = 0; total = 0; nohours = 0; by_state = {}
while True:
    rows = rows_of(get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}"))
    if not rows: break
    for r in rows:
        if r.get("active") is False: continue
        cid = r.get("chainId")
        if ctype.get(cid) != TYPE: continue
        total += 1
        if hashours(r.get("hours")): continue
        nohours += 1
        st = r.get("state") or "?"; by_state[st] = by_state.get(st, 0) + 1
        ph = r.get("phone"); has_ph = bool(ph) and not str(ph).startswith("nophone:")
        loc = r.get("location") or ""; city = loc.split(",")[0].strip() if loc else ""
        rows_out.append({"id": r.get("id"), "name": r.get("name"), "address": r.get("address") or "",
                         "city": city, "state": st, "phone": ph if has_ph else "", "chain": cname.get(cid, "")})
    off += len(rows)
    if len(rows) < 20000: break

out = f"{TYPE.lower().replace(' ', '_')}_nohours.csv"
print(f"active {TYPE} stores: {total} | without hours: {nohours} | with real phone: {sum(1 for r in rows_out if r['phone'])}")
print("top states:", sorted(by_state.items(), key=lambda x: -x[1])[:12])
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["id", "name", "address", "city", "state", "phone", "chain"])
    w.writeheader(); w.writerows(rows_out)
print("wrote", out, ":", len(rows_out))

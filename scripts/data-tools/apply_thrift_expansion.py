"""VALIDATE + import new thrift stores harvested by expand_{goodwill,savers,salvationarmy}.py.

Loads gw_new.json / sv_new.json / sa_new.json, enforces integrity, dedupes by phone across the
files and against the live DB, then POSTs to /api/stores/import ({stores:[...]}) — DRY by default.

INTEGRITY GATES (a store we can't stand behind is not added):
  - real dialable local line: 10-digit, NOT toll-free (800/888/877/866/855/844/833/822) — a national
    call center is not "a human at THAT store" (prime directive). Toll-free rows -> dropped.
  - valid 2-letter US state; non-empty name AND address (no address = unusable) -> dropped.
  - dedupe by phone (cross-file + vs live DB) so a re-run can't create duplicates.
Run: python3 apply_thrift_expansion.py [--apply]
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, sys

DRY = "--apply" not in sys.argv
BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
US = {'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
      'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
      'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'}
TOLLFREE = {"800", "888", "877", "866", "855", "844", "833", "822"}

def req(method, path, data=None):
    cmd = ["curl", "-s", "--max-time", "180", "-X", method,
           "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}"]
    if data is not None:
        cmd += ["-H", "content-type: application/json", "-d", json.dumps(data)]
    cmd.append(BASE + path)
    return json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)

def norm(p):
    d = re.sub(r"\D", "", str(p or "")); return d[-10:] if len(d) >= 10 else None

# live DB phones (fresh)
allphones = set(); off = 0
while True:
    rows = req("GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        p = norm(r.get("phone"))
        if p: allphones.add(p)
    off += len(rows)
    if len(rows) < 20000: break

STATEFIX = {"PENNSYLVANIA": "PA", "PE": "PA"}  # observed dirty codes; extend if needed
def clean_state(s):
    s = (s or "").strip().upper()
    return s if s in US else STATEFIX.get(s, "")

def valid(rec, drops):
    ph = norm(rec.get("phone"))
    if not ph: drops["no_phone"] += 1; return None
    if ph[:3] in TOLLFREE: drops["toll_free"] += 1; return None
    st = clean_state(rec.get("state"))
    if not st: drops["bad_state"] += 1; return None
    if not (rec.get("name") or "").strip(): drops["no_name"] += 1; return None
    if not (rec.get("address") or "").strip(): drops["no_address"] += 1; return None
    rec = dict(rec); rec["phone"] = ph; rec["state"] = st
    return rec

drops = {k: 0 for k in ("no_phone", "toll_free", "bad_state", "no_name", "no_address", "dupe")}
seen = set(); out = []; by = {}
for fn in ("gw_new.json", "sv_new.json", "sa_new.json"):
    if not os.path.exists(fn): continue
    for rec in json.load(open(fn)):
        v = valid(rec, drops)
        if not v: continue
        if v["phone"] in allphones or v["phone"] in seen: drops["dupe"] += 1; continue
        seen.add(v["phone"]); out.append(v)
        by[v["chain"]] = by.get(v["chain"], 0) + 1

print(f"{'DRY' if DRY else 'APPLY'} — valid new stores: {len(out)} | by chain: {by}")
print(f"dropped: {drops}")
print(f"with hours: {sum(1 for r in out if 'hours' in r)}")
if out:
    print("samples:")
    for r in out[:4]:
        print("  ", r["chain"], "|", r["name"][:34], "|", r.get("city"), r["state"], "|", r["phone"])
if DRY:
    print("\ndry-run — rerun with --apply to import")
    sys.exit(0)

ins = upd = dea = ski = 0
for i in range(0, len(out), 500):
    r = req("POST", "/api/stores/import", {"stores": out[i:i + 500]})
    ins += r.get("inserted", 0); upd += r.get("updated", 0); dea += r.get("deactivated", 0); ski += r.get("skipped", 0)
print(f"import result: inserted={ins} updated={upd} deactivated={dea} skipped={ski}")
json.dump({"phones": [r["phone"] for r in out]}, open("thrift_expansion_applied.json", "w"))

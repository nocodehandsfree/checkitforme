"""Brand-carries accuracy pass (One Piece / Topps) — idempotent; run per environment.

Enforces two rules from docs/team/data/handoffs/brand-accuracy-2026-07-11.md:
1. KIOSK-ONLY stores (hasKiosk=true, sellsPacks=false) carry "Pokemon TCG" ONLY — a Pokémon vending
   machine sells Pokémon, never One Piece/Topps/Lorcana.
2. Chain shelf carries = CONFIRMED evidence only (`data/source/chain-scoring-2026-06/
   chain_products_merged.csv`, owner's certainty rule: likely = HOLD). Kroger banners inherit Kroger
   (confirmed OP+Sports). Albertsons banners inherit Sports only (OP just "likely"). Corrections are
   applied by exact id, only to rows whose current carries over-claim; minimal kiosk rows untouched.

Usage: python3 fix_brand_carries.py [--apply]   (DRY default)
Env: BASE (default staging; set https://checkitforme.com ONLY at promote with owner approval),
     ADMIN_TOKEN or .atok in cwd. curl subprocess ONLY.
"""
import json, os, subprocess, sys, time

DRY = "--apply" not in sys.argv
BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# Evidence-confirmed shelf carries per chain (vocabulary matches the stored labels).
FIX = {
    "Dollar General":  "Pokemon TCG,Magic: The Gathering,Yu-Gi-Oh",
    "Dollar Tree":     "Pokemon TCG,Magic: The Gathering,Yu-Gi-Oh",
    "Family Dollar":   "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows,Yu-Gi-Oh",
    "Five Below":      "Pokemon TCG,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows,Yu-Gi-Oh",
    "Safeway":         "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Jewel-Osco":      "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Acme":            "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Shaw's":          "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Tom Thumb":       "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Randalls":        "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Star Market":     "Pokemon TCG,Magic: The Gathering,NeeDoh (Schylling),Sports Cards (Topps/Panini),Squishmallows",
    "Gelson's":        "Pokemon TCG",
    "Books-A-Million": "Pokemon TCG,Magic: The Gathering,Yu-Gi-Oh",
}
OVERCLAIM = ("one piece", "topps", "sports cards", "lorcana", "magic")
MINIMAL = {"Pokemon TCG", "Pokémon"}

def get(p):
    for _ in range(4):
        out = subprocess.run(["curl", "-s", "--max-time", "150", "-H", f"x-admin-token: {TOK}",
                              "-H", f"User-Agent: {UA}", BASE + p], capture_output=True, text=True).stdout
        try: return json.loads(out)
        except Exception: time.sleep(2)
    raise SystemExit("api down")

def post(body):
    tmp = "fbc_body.json"; open(tmp, "w").write(json.dumps(body))
    out = subprocess.run(["curl", "-s", "--max-time", "120", "-X", "POST", "-H", f"x-admin-token: {TOK}",
                          "-H", f"User-Agent: {UA}", "-H", "content-type: application/json",
                          "--data-binary", "@" + tmp, BASE + "/api/stores/patch"], capture_output=True, text=True).stdout
    os.unlink(tmp)
    return json.loads(out)

chains = {c["id"]: (c.get("name") or "") for c in get("/api/admin/table-dump?name=chains&limit=5000")["rows"]}
name2id = {v: k for k, v in chains.items()}
kiosk_only = []           # rule 1 targets
shelf = {}                # (chain,new) -> ids  (rule 2 targets)
pv_stray = []             # Pokemon Vending rows flagged as shelf
off = 0
while True:
    rows = get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        if r.get("active") is False: continue
        cur = (r.get("carries") or "")
        nm = chains.get(r.get("chainId"), "")
        if r.get("hasKiosk") is True and r.get("sellsPacks") is False:
            if cur.strip() not in MINIMAL and any(k in cur.lower() for k in OVERCLAIM):
                kiosk_only.append(r["id"])
            continue
        if nm == "Pokemon Vending" and r.get("sellsPacks") is not False:
            pv_stray.append(r["id"]); continue
        if nm in FIX and cur != FIX[nm] and cur.strip() not in MINIMAL and any(k in cur.lower() for k in OVERCLAIM):
            shelf.setdefault((nm, FIX[nm]), []).append(r["id"])
    off += len(rows)
    if len(rows) < 20000: break

print(f"{'DRY' if DRY else 'APPLY'} @ {BASE}")
print(f"rule1 kiosk-only rows over-claiming -> 'Pokemon TCG': {len(kiosk_only)}")
for (nm, new), ids in sorted(shelf.items()): print(f"rule2 {nm}: {len(ids)} rows")
print(f"Pokemon Vending stray shelf rows: {len(pv_stray)}")
if DRY: sys.exit(0)

patched = 0
for i in range(0, len(kiosk_only), 400):
    patched += post({"where": {"ids": kiosk_only[i:i + 400]}, "set": {"carries": "Pokemon TCG"}}).get("patched", 0)
for (nm, new), ids in shelf.items():
    for i in range(0, len(ids), 400):
        patched += post({"where": {"ids": ids[i:i + 400]}, "set": {"carries": new}}).get("patched", 0)
if pv_stray:
    patched += post({"where": {"ids": pv_stray}, "set": {"carries": "Pokémon", "sellsPacks": False, "hasKiosk": True}}).get("patched", 0)
print("patched:", patched)

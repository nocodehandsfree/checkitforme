"""Sync LEARNED chain-nav fields PROD -> STAGING (fixes "mapped on prod, gray COMING SOON on staging").

Nav is learned from real calls on prod; staging's curation copy goes stale. Reads prod chains, copies the
nav/tree fields to staging via POST /api/admin/chains/nav-sync (keyed by NAME; the endpoint SKIPS the
curated DIRECT_DEFAULT_CHAINS so the independent/co-op direct default is never clobbered).

Tokens: STAGING token in `.atok`, PROD token in `.atok_prod` (both from Railway). curl subprocess ONLY.
Run: python3 sync_nav_prod_to_staging.py [--apply]   (DRY default)
NOTE: needs the nav-sync endpoint deployed on staging (ships with this branch).
"""
import json, os, subprocess, sys, time
APPLY = "--apply" in sys.argv
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
NAV = ["navStatus", "navRecipe", "navType", "navSeconds", "ringsDirect", "treeStatus", "treeNote",
       "phoneTreeDefault", "dtmfShortcut", "answerPath", "avgTreeSeconds", "treeLearnedAt", "treeVerifiedAt"]

def get(base, tok, path):
    for _ in range(4):
        out = subprocess.run(["curl", "-s", "--max-time", "150", "-H", f"x-admin-token: {tok}",
                              "-H", f"User-Agent: {UA}", base + path], capture_output=True, text=True).stdout
        try: return json.loads(out)
        except Exception: time.sleep(2)
    raise SystemExit(f"api down: {base}")

def post(base, tok, path, body):
    tmp = "navsync_body.json"; open(tmp, "w").write(json.dumps(body))
    out = subprocess.run(["curl", "-s", "--max-time", "180", "-X", "POST", "-H", f"x-admin-token: {tok}",
                          "-H", f"User-Agent: {UA}", "-H", "content-type: application/json",
                          "--data-binary", "@" + tmp, base + path], capture_output=True, text=True).stdout
    os.unlink(tmp)
    return json.loads(out)

stag_tok = open(".atok").read().strip()
prod_tok = open(".atok_prod").read().strip()
prod = get("https://checkitforme.com", prod_tok, "/api/admin/table-dump?name=chains&limit=5000")["rows"]
payload = [{"name": c["name"], **{k: c.get(k) for k in NAV}} for c in prod if c.get("name")]
print(f"prod chains: {len(payload)} -> POST nav-sync ({'APPLY' if APPLY else 'DRY'})")
res = post("https://staging.checkitforme.com", stag_tok, "/api/admin/chains/nav-sync",
           {"chains": payload, "dryRun": not APPLY})
print("result:", json.dumps(res))

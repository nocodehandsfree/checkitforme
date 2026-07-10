import json, urllib.request, sys
DRY = "--apply" not in sys.argv
ENVS = []
if "--stag" in sys.argv: ENVS=[("STAGING","https://staging.checkitforme.com")]
elif "--prod" in sys.argv: ENVS=[("PROD","https://checkitforme.com")]
else: ENVS=[("STAGING","https://staging.checkitforme.com"),("PROD","https://checkitforme.com")]
TOK=open("/tmp/.atok").read().strip()
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
def req(base,method,p,data=None):
    h={"x-admin-token":TOK,"User-Agent":UA}; body=None
    if data is not None: body=json.dumps(data).encode(); h["content-type"]="application/json"
    return json.load(urllib.request.urlopen(urllib.request.Request(base+p,data=body,method=method,headers=h),timeout=180))
def direct(c): return c.get("ringsDirect") is True or c.get("navType")=="direct" or c.get("answerPath")=="direct_human"
for env,base in ENVS:
    ch=req(base,"GET","/api/admin/table-dump?name=chains&limit=5000"); ch=ch if isinstance(ch,list) else ch.get("rows",[])
    bad=[c for c in ch if direct(c) and c.get("avgTreeSeconds") not in (None,0)]
    print(f"\n=== {env}: {len(bad)} direct-ring chains to null ===")
    for c in bad: print(f"   id={c['id']:<4} avgTree={c.get('avgTreeSeconds')} {c.get('name')}")
    if DRY: continue
    for c in bad:
        row=req(base,"PATCH",f"/api/chains/{c['id']}",{"avgTreeSeconds":0})  # 0 -> stored as NULL by the endpoint
        ok=row.get("avgTreeSeconds") in (None,0)
        print(f"   nulled id={c['id']} {c['name']} -> ok={ok}")
    # verify
    ch2=req(base,"GET","/api/admin/table-dump?name=chains&limit=5000"); ch2=ch2 if isinstance(ch2,list) else ch2.get("rows",[])
    left=[c for c in ch2 if direct(c) and c.get("avgTreeSeconds") not in (None,0)]
    print(f"   {env} remaining after cleanup: {len(left)}")
print(f"\n{'DRY-RUN (add --apply, optionally --stag/--prod)' if DRY else 'APPLY complete.'}")

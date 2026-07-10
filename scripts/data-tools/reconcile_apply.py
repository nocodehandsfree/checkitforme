import json, urllib.request, sys
DRY = "--apply" not in sys.argv
TOK=open("/tmp/.atok").read().strip()
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
def req(base,method,p,data=None):
    h={"x-admin-token":TOK,"User-Agent":UA}; body=None
    if data is not None: body=json.dumps(data).encode(); h["content-type"]="application/json"
    return json.load(urllib.request.urlopen(urllib.request.Request(base+p,data=body,method=method,headers=h),timeout=180))
def chains(base):
    d=req(base,"GET","/api/admin/table-dump?name=chains&limit=5000")
    rows=d if isinstance(d,list) else d.get("rows",d.get("data",[]))
    return {c.get("name"):c for c in rows}
STAG="https://staging.checkitforme.com"; PROD="https://checkitforme.com"

# name -> desired field values.  Split by env.
PLAN = {
 STAG: {
   "Aldi":            {"muted": True},               # owner: cannot call Aldi directly
   "Pokemon Vending": {"muted": True},               # owner: "isnt something you can call"
   "GameStop":        {"type":"Other","stockCheckMethod":"site","isMSRP":True},  # owner: MSRP retailer -> site-check, not callable (hobby=callable, retail-MSRP=site)
 },
 PROD: {
   "Goodwill":        {"type":"Thrift","muted":False,"stockCheckConfidence":"spotty","isMSRP":False},
   "Unique":          {"type":"Thrift","muted":False,"stockCheckConfidence":"spotty","isMSRP":False},
   "Savers":          {"stockCheckConfidence":"spotty","isMSRP":False},
   "Salvation Army":  {"stockCheckConfidence":"spotty","isMSRP":False},
   "Spencer's":       {"muted":True,"stockCheckMethod":"site"},  # match staging source-of-truth
   "Pokemon Vending": {"muted":True},
 },
}
ENVNAME={STAG:"STAGING",PROD:"PROD"}
ONLY = None
if "--stag" in sys.argv: ONLY=STAG
if "--prod" in sys.argv: ONLY=PROD
for base,plan in PLAN.items():
    if ONLY is not None and base!=ONLY: continue
    cur=chains(base)
    print(f"\n===== {ENVNAME[base]} =====")
    for name,fields in plan.items():
        c=cur.get(name)
        if not c:
            print(f"  {name!r}: ABSENT — skip"); continue
        cid=c["id"]
        changes={k:v for k,v in fields.items() if (c.get(k) if c.get(k) is not None else None)!=v}
        if not changes:
            print(f"  {name!r} (id={cid}): already correct"); continue
        deltas=", ".join(f"{k}: {c.get(k)!r}->{v!r}" for k,v in changes.items())
        print(f"  {name!r} (id={cid}): {deltas}")
        if not DRY:
            row=req(base,"PATCH",f"/api/chains/{cid}",changes)
            ok=all(row.get(k)==v for k,v in changes.items())
            print(f"      APPLIED ok={ok}")
print(f"\n{'DRY-RUN (no writes). add --apply to execute.' if DRY else 'APPLY complete.'}")

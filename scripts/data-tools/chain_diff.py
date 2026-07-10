import json, urllib.request
TOK=open("/tmp/.atok").read().strip()
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
def get(base,p):
    return json.load(urllib.request.urlopen(urllib.request.Request(base+p,headers={"x-admin-token":TOK,"User-Agent":UA}),timeout=180))
def chains(base):
    d=get(base,"/api/admin/table-dump?name=chains&limit=5000")
    rows=d if isinstance(d,list) else d.get("rows",d.get("data",[]))
    return {c.get("name"):c for c in rows}
STAG="https://staging.checkitforme.com"; PROD="https://checkitforme.com"
s=chains(STAG); p=chains(PROD)
print(f"staging chains: {len(s)}   prod chains: {len(p)}")
FIELDS=["type","muted","phoneTreeDefault","dtmfShortcut","answerPath","callTarget","ringsDirect","stockCheckMethod","stockCheckConfidence","isMSRP","repackOnly"]
allnames=sorted(set(s)|set(p))
only_s=[n for n in allnames if n in s and n not in p]
only_p=[n for n in allnames if n in p and n not in s]
print(f"\n=== ONLY on STAGING ({len(only_s)}) ===")
for n in only_s: print(f"  {n!r:32} type={s[n].get('type')} muted={s[n].get('muted')}")
print(f"\n=== ONLY on PROD ({len(only_p)}) ===")
for n in only_p: print(f"  {n!r:32} type={p[n].get('type')} muted={p[n].get('muted')}")
print("\n=== FIELD DIFFS (present on both, values differ) ===")
for n in allnames:
    if n not in s or n not in p: continue
    diffs=[]
    for f in FIELDS:
        sv=s[n].get(f); pv=p[n].get(f)
        if (sv or None)!=(pv or None): diffs.append(f"{f}: stag={sv!r} prod={pv!r}")
    if diffs:
        print(f"  {n!r}")
        for d in diffs: print(f"      {d}")

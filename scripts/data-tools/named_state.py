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
# any chain matching these substrings + explicit names
NAMED=["Aldi","Buc-ee","Microcenter","Micro Center","Pokemon Vending","Pokémon Vending","Savers","Salvation Army",
       "Goodwill","Unique","Marshalls","GameStop","Spencer","Vending","Kiosk"]
def match(n):
    nl=(n or "").lower()
    return any(k.lower() in nl for k in NAMED)
names=sorted(set([n for n in s if match(n)]) | set([n for n in p if match(n)]))
F=["type","muted","stockCheckMethod","isMSRP","stockCheckConfidence","callTarget","repackOnly"]
print(f"{'CHAIN':30} {'ENV':4} " + " ".join(f"{f[:9]:>9}" for f in F))
for n in names:
    for env,d in [("STAG",s),("PROD",p)]:
        c=d.get(n)
        if not c:
            print(f"{n[:30]:30} {env:4}  (absent)"); continue
        print(f"{n[:30]:30} {env:4} " + " ".join(f"{str(c.get(f))[:9]:>9}" for f in F))
    print()

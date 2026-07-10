import json, urllib.request, csv
BASE="https://staging.checkitforme.com"; TOK=open("/tmp/.atok").read().strip()
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(BASE+path,headers={"x-admin-token":TOK,"User-Agent":UA}),timeout=180))
chains=get("/api/admin/table-dump?name=chains&limit=5000")
chains=chains if isinstance(chains,list) else chains.get("rows",chains.get("data",[]))
ctype={c["id"]:(c.get("type") or "") for c in chains}
cname={c["id"]:c.get("name") for c in chains}
def hashours(h):
    if not h or h in ("","null","{}"): return False
    try:
        hj=json.loads(h) if isinstance(h,str) else h
        return isinstance(hj,dict) and any(v for v in hj.values())
    except: return False
rows_out=[]; off=0; hobby=0; hobby_nohours=0; by_state={}
while True:
    d=get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")
    rows=d if isinstance(d,list) else d.get("rows",d.get("data",[]))
    if not rows: break
    for r in rows:
        if r.get("active") is False: continue
        cid=r.get("chainId")
        if ctype.get(cid)!="Hobby": continue
        hobby+=1
        if hashours(r.get("hours")): continue
        hobby_nohours+=1
        st=r.get("state") or "?"; by_state[st]=by_state.get(st,0)+1
        ph=r.get("phone"); has_ph=bool(ph) and not str(ph).startswith("nophone:")
        # location "City, ST"
        loc=r.get("location") or ""; city=loc.split(",")[0].strip() if loc else ""
        rows_out.append({"id":r.get("id"),"name":r.get("name"),"address":r.get("address") or "",
                         "city":city,"state":st,"phone":ph if has_ph else "","chain":cname.get(cid,"")})
    off+=len(rows)
    if len(rows)<20000: break
print(f"active Hobby stores: {hobby} | without hours: {hobby_nohours} | with real phone: {sum(1 for r in rows_out if r['phone'])}")
print("top states:", sorted(by_state.items(),key=lambda x:-x[1])[:12])
with open("hobby_nohours.csv","w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=["id","name","address","city","state","phone","chain"]); w.writeheader(); w.writerows(rows_out)
print("wrote hobby_nohours.csv:", len(rows_out))

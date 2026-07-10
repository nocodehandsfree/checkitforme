import json, re, sys, glob, os, time, urllib.request
DRY = "--apply" not in sys.argv
BASE="https://staging.checkitforme.com"; TOK=open("/tmp/.atok").read().strip()
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
def req(method,path,data=None):
    h={"x-admin-token":TOK,"User-Agent":UA}; body=None
    if data is not None: body=json.dumps(data).encode(); h["content-type"]="application/json"
    return json.load(urllib.request.urlopen(urllib.request.Request(BASE+path,data=body,method=method,headers=h),timeout=180))
DAYS=["mon","tue","wed","thu","fri","sat","sun"]
OUT="/tmp/claude-0/-home-user-fungibles/435aa2c1-0a08-5649-af28-4b5c8cf05bfe/scratchpad/hobbyout"

def canon_day(v):
    v=str(v or "").strip().lower()
    if v in ("closed",""): return None
    if v=="unknown": return "?"
    m=re.match(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", v)
    if not m: return None
    o,c=m.group(1).zfill(5), m.group(2).zfill(5)
    if c=="24:00": c="00:00"
    return [o,c]

# merge all batch files by id (last write wins on dup id)
merged={}
files=sorted(glob.glob(f"{OUT}/hb*.json"))
for f in files:
    try: arr=json.load(open(f))
    except Exception as e: print("skip",f,e); continue
    for row in arr:
        rid=row.get("id")
        if rid is None: continue
        merged[int(rid)]={d:canon_day(row.get(d)) for d in DAYS}

updates={}  # id -> canonical hours json string
deactivate=[]; skipped_unknown=0; mixed=0
for rid,days in merged.items():
    known=[d for d in DAYS if isinstance(days[d],list)]
    unknown=[d for d in DAYS if days[d]=="?"]
    closed=[d for d in DAYS if days[d] is None]
    if len(unknown)==7:
        skipped_unknown+=1; continue                 # no data -> leave on fallback
    if len(closed)==7:
        deactivate.append(rid); continue             # permanently closed
    if unknown: mixed+=1
    clean={d:(None if days[d] in (None,"?") else days[d]) for d in DAYS}  # unknown day -> closed (safe direction)
    updates[rid]=json.dumps(clean, separators=(",",":"))

print(f"{'DRY' if DRY else 'APPLY'} — files:{len(files)}  ids:{len(merged)}  import:{len(updates)}  deactivate:{len(deactivate)}  skip-unknown:{skipped_unknown}  (mixed known+unknown:{mixed})")

# group ids by identical hours json to cut call count
groups={}
for rid,hj in updates.items(): groups.setdefault(hj,[]).append(rid)
print(f"distinct hours patterns: {len(groups)}")
if DRY:
    print("sample updates:")
    for rid in list(updates)[:3]: print("  ",rid,"->",updates[rid])
    print("deactivate ids:", deactivate[:20], "..." if len(deactivate)>20 else "")
    sys.exit(0)

ts=int(time.time())
patched=0
for hj,ids in groups.items():
    for i in range(0,len(ids),400):
        chunk=ids[i:i+400]
        req("POST","/api/stores/patch", {"where":{"ids":chunk}, "set":{"hours":hj, "hoursUpdatedAt":ts}})
        patched+=len(chunk)
print("patched hours:", patched)
if deactivate:
    res=req("POST","/api/stores/patch", {"where":{"ids":deactivate}, "set":{"active":False}})
    print("deactivated perm-closed:", json.dumps(res))
# record which ids we've handled this run (so re-runs are idempotent / resumable)
json.dump({"updated":list(updates), "deactivated":deactivate, "ts":ts},
          open("/tmp/claude-0/-home-user-fungibles/435aa2c1-0a08-5649-af28-4b5c8cf05bfe/scratchpad/hobby_applied.json","w"))

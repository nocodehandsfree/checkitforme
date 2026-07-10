#!/usr/bin/env python3
"""Sync all LOCKED phone-tree mappings from prod -> staging (or any pair), with corrected
learned-step timing (each DTMF press fires at its learned atSec, not a flat 2s).

WHY THIS EXISTS: prod and staging are SEPARATE databases. Mappings are created on the prod
admin, so staging never sees them and "performs differently" (e.g. a chain mapped on prod shows
up unmapped on staging). Run this after any mapping work to make staging mirror prod exactly.

Usage:  RAILWAY_API_TOKEN=... python3 voice-caller/scripts/sync-mappings.py [--dry]
Reads each service's ADMIN_TOKEN from Railway. Matches chains by name (id fallback).
"""
import os, sys, json, urllib.request

PROJECT="889e332c-30fe-46e9-a18e-d8de4f7523aa"; ENV="7cbf9327-357a-415e-9031-d1609aead2b4"
SRC_SVC="d363a982-e918-4433-b175-defe8faf0ec9"; SRC="https://checkitforme.com"           # prod
DST_SVC="8165df7a-3bdf-41a5-bdce-24883633a096"; DST="https://staging.checkitforme.com"   # staging
FIRST_AT, GAP = 2, 3
DRY = "--dry" in sys.argv
TOKEN = os.environ.get("RAILWAY_API_TOKEN")
if not TOKEN: sys.exit("set RAILWAY_API_TOKEN")

def railvar(svc, name):
    q='{ variables(projectId: "%s", environmentId: "%s", serviceId: "%s") }'%(PROJECT,ENV,svc)
    req=urllib.request.Request("https://backboard.railway.app/graphql/v2",data=json.dumps({"query":q}).encode(),
        headers={"Authorization":"Bearer %s"%TOKEN,"Content-Type":"application/json","User-Agent":"curl/8"})
    return json.load(urllib.request.urlopen(req))["data"]["variables"].get(name)

def api(base, tok, method, path, body=None):
    req=urllib.request.Request(base+path,data=(json.dumps(body).encode() if body is not None else None),
        headers={"x-admin-token":tok,"Content-Type":"application/json","User-Agent":"curl/8"},method=method)
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: return {"_err":e.code,"_body":e.read().decode()[:160]}

def recompute_dtmf(recipe):
    """Press each digit at its LEARNED atSec (strictly increasing); early-barge cadence as fallback."""
    ps=[s for s in (recipe.get('steps') or []) if s.get('action')=='press' and s.get('value')]
    if not ps: return ''
    out=[]; prev=-1
    for i,s in enumerate(ps):
        dig=''.join(ch for ch in str(s['value']) if ch in '0123456789*#')
        if not dig: continue
        at=int(round(s['atSec'])) if isinstance(s.get('atSec'),(int,float)) and s['atSec']>=FIRST_AT else FIRST_AT+i*GAP
        if at<=prev: at=prev+GAP
        prev=at; out.append('%s@%d'%(dig,at))
    return ','.join(out)

SA=railvar(SRC_SVC,"ADMIN_TOKEN"); DA=railvar(DST_SVC,"ADMIN_TOKEN")
src=api(SRC,SA,"GET","/api/admin/trainer/list").get('chains',[])
dst=api(DST,DA,"GET","/api/admin/trainer/list").get('chains',[])
by_name={(c.get('name') or '').strip().lower():c for c in dst}; by_id={c.get('id'):c for c in dst}
mapped=[c for c in src if c.get('navRecipe') and c.get('navStatus')=='locked']
print("source locked mappings:%d  | dest chains:%d  | dry=%s"%(len(mapped),len(dst),DRY))
synced=unmatched=err=0
for c in mapped:
    name=(c.get('name') or '').strip().lower()
    tgt=by_id.get(c['id']) if (c['id'] in by_id and (by_id[c['id']].get('name') or '').strip().lower()==name) else by_name.get(name)
    if not tgt: unmatched+=1; print("  UNMATCHED:",c.get('name')); continue
    if DRY: synced+=1; continue
    r=api(DST,DA,"POST","/api/admin/trainer/lock",{"chainId":tgt['id'],"recipe":c['navRecipe'],"confidence":c.get('navConfidence') or 90})
    if "_err" in r or not r.get("ok"): err+=1; print("  LOCK ERR",c.get('name'),r); continue
    d=recompute_dtmf(c['navRecipe'])
    if d:
        pr=api(DST,DA,"PATCH","/api/chains/%d"%tgt['id'],{"dtmfShortcut":d})
        if "_err" in pr: err+=1; print("  PATCH ERR",c.get('name'),pr); continue
    synced+=1
print("synced:%d  unmatched:%d  errors:%d"%(synced,unmatched,err))

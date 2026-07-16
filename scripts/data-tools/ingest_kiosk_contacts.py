"""Ingest owner's Google response for the verified-kiosk groceries: phone + hours per store.

Response line:  <stagingId> | (408) 287-5377 | Mon-Fri 6am-12am; Sat-Sun 5am-1am
                <stagingId> | NOTFOUND
Hours spec: ';'-separated segments, each "<DayRange> <open>-<close>" with grouped days
(Mon-Fri / Sat-Sun / Mon-Sun / single Day). "open 24 hours" -> "24h". 12am close = midnight wrap.

WHY BOTH ENVS DIRECTLY: retailer `phone` is the store-sync JOIN KEY (rows are matched across envs
by phone), so a phone edit can never ride the sync — patching staging alone would make the next sync
tick insert a DUPLICATE row on prod and tombstone the old one. So we patch PROD FIRST (matched by
externalStoreId), then staging; by the time the sync tick fires, both sides carry the same key.
`hours` is in the never-sync set (learned lane) — same reason it must be written to both directly.

Usage: python3 ingest_kiosk_contacts.py <response.txt> [--apply]   (DRY default; staging-only with --staging-only)
Tokens: .atok (staging) + .atok_prod (prod) in cwd, or ADMIN_TOKEN/ADMIN_TOKEN_PROD env. curl only.
"""
import json, os, re, subprocess, sys, tempfile, time

DRY = "--apply" not in sys.argv
STG_ONLY = "--staging-only" in sys.argv
SRC = [a for a in sys.argv[1:] if not a.startswith("--")][0]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
STG = "https://staging.checkitforme.com"
PRD = "https://checkitforme.com"
tok_s = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
tok_p = None if STG_ONLY else (os.environ.get("ADMIN_TOKEN_PROD") or open(".atok_prod").read().strip())
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DA = {"mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3, "thurs": 3, "fri": 4, "sat": 5, "sun": 6}

def req(base, tok, method, path, data=None):
    cmd = ["curl", "-s", "--max-time", "180", "-X", method, "-H", f"x-admin-token: {tok}", "-H", f"User-Agent: {UA}"]
    tmp = None
    if data is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(data, tmp); tmp.close()
        cmd += ["-H", "content-type: application/json", "--data-binary", "@" + tmp.name]
    cmd.append(base + path)
    try:
        for _ in range(4):
            out = subprocess.run(cmd, capture_output=True, text=True).stdout
            try: return json.loads(out)
            except Exception: time.sleep(2)
        raise SystemExit(f"api down: {base}{path}")
    finally:
        if tmp: os.unlink(tmp.name)

def t24(s):
    """'6am'/'12am'/'10:30pm' -> 'HH:MM'. 12am->00:00, 12pm->12:00."""
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", s.strip().lower())
    if not m: return None
    h, mi, ap = int(m.group(1)), m.group(2) or "00", m.group(3)
    if h == 12: h = 0
    if ap == "pm": h += 12
    return f"{h:02d}:{mi}"

def parse_hours(spec):
    """'Mon-Fri 6am-12am; Sat-Sun open 24 hours' -> {"mon":[o,c]|"24h",...} or None if unparseable."""
    out = {}
    for seg in spec.split(";"):
        seg = seg.strip()
        if not seg: continue
        m = re.match(r"([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?\s+(.*)", seg)
        if not m: return None
        d1 = DA.get(m.group(1).lower()[:4].rstrip("s") if m.group(1).lower()[:4] in ("tues", "thur") else m.group(1).lower()[:3])
        d2 = DA.get((m.group(2) or m.group(1)).lower()[:3])
        rest = m.group(3).strip().lower()
        if d1 is None or d2 is None: return None
        if "24 hour" in rest or rest == "24h": val = "24h"
        elif rest in ("closed",): val = None
        else:
            tm = re.match(r"(.+?)\s*-\s*(.+)", rest)
            if not tm: return None
            o, c = t24(tm.group(1)), t24(tm.group(2))
            if not o or not c: return None
            val = [o, c]
        for d in range(d1, d2 + 1): out[DAYS[d]] = val
    return out if len(out) == 7 else None  # every day must be covered — partial weeks stay unwritten

def norm_phone(s):
    d = re.sub(r"\D", "", s)
    if len(d) == 10: return "+1" + d
    if len(d) == 11 and d.startswith("1"): return "+" + d
    return None

rows, notfound, bad = {}, [], []
for ln in open(SRC):
    ln = ln.strip()
    if not ln or "|" not in ln: continue
    parts = [p.strip() for p in ln.split("|")]
    sid = int(re.sub(r"\D", "", parts[0]) or 0)
    if not sid: bad.append(ln); continue
    if len(parts) < 3 or parts[1].upper() == "NOTFOUND": notfound.append(sid); continue
    ph = norm_phone(parts[1]); hrs = parse_hours(parts[2])
    if not ph: bad.append(f"bad phone: {ln}"); continue
    rows[sid] = {"phone": ph, **({"hours": json.dumps(hrs)} if hrs else {})}
    if not hrs: bad.append(f"hours unparsed (phone still taken): {ln}")

print(f"{'DRY' if DRY else 'APPLY'} | parsed {len(rows)} stores, {len(notfound)} NOTFOUND, {len(bad)} flagged")
for b in bad: print("  !", b)
if not rows: sys.exit(0)

# staging id -> externalStoreId -> prod id (kiosk rows all carry externalStoreId from the TPCi import)
stg_all = {}
off = 0
while True:
    rs = req(STG, tok_s, "GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rs: break
    for r in rs: stg_all[r["id"]] = r
    off += len(rs)
    if len(rs) < 20000: break
ext = {sid: stg_all[sid].get("externalStoreId") for sid in rows if sid in stg_all}
missing_ext = [sid for sid, e in ext.items() if not e]
if missing_ext: print("  ! staging rows lacking externalStoreId (staging-only patch):", missing_ext)

prod_by_ext = {}
if not STG_ONLY:
    off = 0
    while True:
        rs = req(PRD, tok_p, "GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
        if not rs: break
        for r in rs:
            if r.get("externalStoreId"): prod_by_ext[r["externalStoreId"]] = r["id"]
        off += len(rs)
        if len(rs) < 20000: break

plan = []
for sid, patch in rows.items():
    pid = prod_by_ext.get(ext.get(sid)) if not STG_ONLY else None
    plan.append((sid, pid, patch))
    print(f"  {sid} -> prod {pid or '—'} : {patch['phone']} {'+hours' if 'hours' in patch else ''}")
if DRY: sys.exit(0)

done_p = done_s = 0
for sid, pid, patch in plan:  # PROD FIRST (see header), staging second
    if pid: done_p += req(PRD, tok_p, "POST", "/api/stores/patch", {"where": {"ids": [pid]}, "set": patch}).get("patched", 0)
for sid, pid, patch in plan:
    done_s += req(STG, tok_s, "POST", "/api/stores/patch", {"where": {"ids": [sid]}, "set": patch}).get("patched", 0)
print(f"patched: prod {done_p}, staging {done_s}")

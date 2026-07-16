"""Ingest owner's Google response for the verified-kiosk groceries: phone + hours per store.

Response line:  <id> | (830) 772-5100 | Mon-Sun 6am-11pm      (or:  <id> | NOTFOUND)
Sent-box line:  <id> | <name> | <address>, <city>, <ST> <zip>  (the box the owner googled from)

IDENTITY RULE (GOTCHAS 2026-07-16): kiosk row ids are NOT stable across time — the vending overlay
rewrites row identities when TPCi relocates machines. The response id is only used to look up the
SENT box line; the write target is found by NORMALIZED ADDRESS + STATE + chain-name token in the
LIVE data of each env, independently. No address-verified match -> that number is skipped and listed.

Phones also can't ride store-sync (phone IS the cross-env join key) and hours are never-sync, so both
envs are patched directly: PROD FIRST, then staging (so the sync tick can never mint a dupe row).

Usage: python3 ingest_kiosk_contacts.py <response.txt> <sent_box.txt> [--apply] [--staging-only]
Tokens: .atok / .atok_prod in cwd (or ADMIN_TOKEN / ADMIN_TOKEN_PROD env). curl subprocess ONLY.
"""
import json, os, re, subprocess, sys, tempfile, time

DRY = "--apply" not in sys.argv
STG_ONLY = "--staging-only" in sys.argv
pos = [a for a in sys.argv[1:] if not a.startswith("--")]
SRC, SENT = pos[0], pos[1]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
ENVS = [("prod", "https://checkitforme.com", (os.environ.get("ADMIN_TOKEN_PROD") or open(".atok_prod").read().strip()))] if not STG_ONLY else []
ENVS += [("staging", "https://staging.checkitforme.com", (os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()))]
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DA = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}

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
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", s.strip().lower())
    if not m: return None
    h, mi, ap = int(m.group(1)), m.group(2) or "00", m.group(3)
    if h == 12: h = 0
    if ap == "pm": h += 12
    return f"{h:02d}:{mi}"

def parse_hours(spec):
    """'Mon-Fri 6am-12am; Sat-Sun open 24 hours' -> hours JSON string, or None if unparseable."""
    out = {}
    for seg in spec.split(";"):
        seg = seg.strip()
        if not seg: continue
        m = re.match(r"([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?\s+(.*)", seg)
        if not m: return None
        d1 = DA.get(m.group(1).lower()[:3]); d2 = DA.get((m.group(2) or m.group(1)).lower()[:3])
        if d1 is None or d2 is None: return None
        rest = m.group(3).strip().lower()
        if "24" in rest and "am" not in rest and "pm" not in rest: val = "24h"
        elif rest == "closed": val = None
        else:
            tm = re.match(r"(.+?)\s*-\s*(.+)", rest)
            if not tm: return None
            o, c = t24(tm.group(1)), t24(tm.group(2))
            if not o or not c: return None
            val = [o, c]
        for d in range(d1, d2 + 1): out[DAYS[d]] = val
    return json.dumps(out) if len(out) == 7 else None  # whole week or nothing

def norm(a): return re.sub(r"[^a-z0-9]", "", (a or "").lower())

def norm_phone(s):
    d = re.sub(r"\D", "", s)
    if len(d) == 10: return "+1" + d
    if len(d) == 11 and d.startswith("1"): return "+" + d
    return None

def name_token(name):
    """Chain token from the sent name: leading tokens until >=4 chars ('H-E-B'->'h-e-b', 'H Mart X'->'h mart')."""
    toks, acc = name.split(), []
    for t in toks:
        acc.append(t)
        if len("".join(acc)) >= 4: break
    return " ".join(acc).lower()

# sent box: id -> (name, address-part, state)
sent = {}
for ln in open(SENT):
    if not re.match(r"\s*\d+\s*\|", ln): continue
    i, name, addr = [p.strip() for p in ln.split("|", 2)]
    stm = re.search(r",\s*([A-Z]{2})\s+\d{5}", addr)
    street = addr.split(",")[0].strip()
    sent[int(i)] = (name, street, stm.group(1) if stm else None)

# response: id -> (phone, hoursjson)
todo, notfound, bad = {}, [], []
for ln in open(SRC):
    ln = ln.strip()
    if not ln or "|" not in ln: continue
    parts = [p.strip() for p in ln.split("|")]
    sid = int(re.sub(r"\D", "", parts[0]) or 0)
    if not sid or sid not in sent: bad.append("id not in sent box: " + ln); continue
    if len(parts) < 3 or parts[1].upper() == "NOTFOUND": notfound.append(sid); continue
    ph = norm_phone(parts[1])
    if not ph: bad.append("bad phone: " + ln); continue
    todo[sid] = (ph, parse_hours(parts[2]))

print(f"{'DRY' if DRY else 'APPLY'} | {len(todo)} stores, {len(notfound)} NOTFOUND, {len(bad)} bad")
for b in bad: print("  !", b)
missing = [i for i in sent if i not in todo and i not in notfound]
if missing: print(f"  ! {len(missing)} sent ids came back with NO line: {missing[:20]}")

for env, base, tok in ENVS:
    rows, off = [], 0
    while True:
        rs = req(base, tok, "GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
        if not rs: break
        rows += rs; off += len(rs)
        if len(rs) < 20000: break
    by_addr = {}
    for r in rows:
        if r.get("address") and r.get("active") is not False:
            by_addr.setdefault((norm(r["address"]), r.get("state")), []).append(r)
    ok = skip = already = 0
    plan = []
    for sid, (ph, hrs) in todo.items():
        name, street, st = sent[sid]
        tokn = name_token(name)
        cands = [r for r in by_addr.get((norm(street), st), []) if tokn in (r.get("name") or "").lower()]
        if not cands:
            print(f"  {env} SKIP {sid} '{name}' — no live row at '{street}, {st}'"); skip += 1; continue
        r = cands[0]
        if r.get("phone") == ph and (hrs is None or r.get("hours") == hrs): already += 1; continue
        patch = {"phone": ph, **({"hours": hrs} if hrs else {})}
        plan.append((r["id"], patch)); ok += 1
    print(f"{env}: {ok} to write, {already} already right, {skip} skipped (no address match)")
    if DRY: continue
    n = 0
    for rid, patch in plan:
        n += req(base, tok, "POST", "/api/stores/patch", {"where": {"ids": [rid]}, "set": patch}).get("patched", 0)
    print(f"{env}: patched {n}")
print("\nDRY — nothing written" if DRY else "\nDONE")

"""Fix the 2026-07-16 kiosk phone misdial: phones were applied by DB id, but a concurrent import
re-bound kiosk row identities (same id -> different physical store), so numbers landed on wrong rows.

Ground truth = the OWNER'S BOX LINES (street address the number was googled for). Per environment:
  1. any row now holding one of the stamped phones whose ADDRESS doesn't match that phone's box
     address -> reverted to its synthetic key (nophone:<chain-slug>:<externalStoreId>) + hours nulled
     (these kiosk rows had no hours before).
  2. the phone+hours are re-applied to the row whose address DOES match the box line (if found).
Idempotent; address match is normalized (case/punct/suite). DRY by default.

LESSON ENCODED: never patch kiosk rows by bare DB id across time — ids are only stable within one
read-modify-write pass. Key on address (or verify identity at write time).

Usage: python3 fix_kiosk_misdial.py [--apply]
Tokens: .atok / .atok_prod in cwd. curl subprocess ONLY.
"""
import json, re, subprocess, sys, tempfile, time

DRY = "--apply" not in sys.argv
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
ENVS = [("staging", "https://staging.checkitforme.com", open(".atok").read().strip()),
        ("prod", "https://checkitforme.com", open(".atok_prod").read().strip())]

# The owner's box lines that were applied (phone -> the address it belongs to).
# (phone, address, state, hours, required-name-token) — token guards against plaza address
# collisions (2225 Plaza Pkwy is both the FoodMaxx and a GameStop; the number is the supermarket's).
DATA = [
    ("+14082875377", "1539 Parkmoor Ave",      "CA", "Mon-Fri 6am-12am; Sat-Sun 5am-12am", "foodmaxx"),
    ("+15102931911", "27300 Hesperian Blvd",   "CA", "Mon-Fri 6am-12am; Sat-Sun 5am-12am", "foodmaxx"),
    ("+15104378000", "3000 E 9th St",          "CA", "Mon-Sun 6am-10pm",                   "foodmaxx"),
    ("+12095309677", "2225 Plaza Pkwy",        "CA", "Mon-Fri 6am-12am; Sat-Sun 5am-1am",  "foodmaxx"),
    ("+12096322022", "2467 Geer Rd",           "CA", "Mon-Fri 6am-12am; Sat-Sun 24h",      "foodmaxx"),
    ("+13037454592", "2751 S Parker Rd",       "CO", "Mon-Sun 9am-9pm",                    "h mart"),
    ("+17377176900", "11301 Lakeline Blvd",    "TX", "Mon-Sun 8am-10pm",                   "h mart"),
    ("+19723239700", "2625 Old Denton Rd",     "TX", "Mon-Sun 8am-11pm",                   "h mart"),
    ("+19728810300", "3320 K Ave",             "TX", "Mon-Sun 8am-10pm",                   "h mart"),
    ("+17202875341", "5036 W 92nd Ave",        "CO", "Mon-Sun 9am-9pm",                    "h mart"),
]
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DA = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}

def t24(s):
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", s.strip().lower())
    if not m: return None
    h, mi, ap = int(m.group(1)), m.group(2) or "00", m.group(3)
    if h == 12: h = 0
    if ap == "pm": h += 12
    return f"{h:02d}:{mi}"

def parse_hours(spec):
    out = {}
    for seg in spec.split(";"):
        seg = seg.strip()
        m = re.match(r"([A-Za-z]+)(?:\s*-\s*([A-Za-z]+))?\s+(.*)", seg)
        d1, d2 = DA[m.group(1).lower()[:3]], DA[(m.group(2) or m.group(1)).lower()[:3]]
        rest = m.group(3).strip().lower()
        if "24" in rest and "am" not in rest and "pm" not in rest: val = "24h"
        else:
            tm = re.match(r"(.+?)\s*-\s*(.+)", rest)
            val = [t24(tm.group(1)), t24(tm.group(2))]
        for d in range(d1, d2 + 1): out[DAYS[d]] = val
    return json.dumps(out)

def norm(a): return re.sub(r"[^a-z0-9]", "", (a or "").lower())

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
        import os
        if tmp: os.unlink(tmp.name)

for env, base, tok in ENVS:
    print(f"\n==== {env} ====")
    chains = {c["id"]: (c.get("name") or "") for c in req(base, tok, "GET", "/api/admin/table-dump?name=chains&limit=5000")["rows"]}
    rows, off = [], 0
    while True:
        rs = req(base, tok, "GET", f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
        if not rs: break
        rows += rs; off += len(rs)
        if len(rs) < 20000: break
    by_phone = {}
    for r in rows: by_phone.setdefault(r.get("phone"), []).append(r)
    by_addr = {}
    for r in rows:
        if r.get("address"): by_addr.setdefault((norm(r["address"]), r.get("state")), []).append(r)

    fixes = []  # (rowId, patch, why)
    for phone, addr, st, hrs, tok2 in DATA:
        want = (norm(addr), st)
        holders = by_phone.get(phone, [])
        target = next((r for r in by_addr.get(want, []) if r.get("active") is not False and tok2 in (r.get("name") or "").lower()), None)
        for h in holders:
            if (norm(h.get("address")), h.get("state")) == want: continue  # phone already on the right row
            slug = re.sub(r"[^a-z0-9]+", "-", chains.get(h.get("chainId"), "store").lower())
            key = f"nophone:{slug}:{h.get('externalStoreId') or h['id']}"
            fixes.append((h["id"], {"phone": key, "hours": None}, f"REVERT {phone} off '{h.get('name')}' ({h.get('address')}) -> {key}"))
        on_target = target and target.get("phone") == phone
        if target and not on_target:
            fixes.append((target["id"], {"phone": phone, "hours": parse_hours(hrs)}, f"APPLY {phone} -> '{target.get('name')}' ({target.get('address')}, {target.get('state')})"))
        elif not target:
            print(f"  ! no {tok2} row at '{addr}, {st}' — phone {phone} ({tok2}) left unapplied here")
    for _, _, why in fixes: print("  " + why)
    if DRY: continue
    n = 0
    # reverts first so a phone never sits on two rows (unique-key safety), then applies
    for rid, patch, why in sorted(fixes, key=lambda f: 0 if f[1]["phone"].startswith("nophone:") else 1):
        n += req(base, tok, "POST", "/api/stores/patch", {"where": {"ids": [rid]}, "set": patch}).get("patched", 0)
    print(f"  patched {n} rows")
print("\nDRY — nothing written" if DRY else "\nDONE")

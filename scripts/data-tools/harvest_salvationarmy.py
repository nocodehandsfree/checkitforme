"""FREE Salvation Army store hours harvest via satruck.org's own locations API.

Flow: pull our no-hours Salvation Army rows (zip+phone) from staging -> GET
satruck.org/apiservices/pickup/donategoods/locations?Type=3&ZipCode=<zip> per unique zip ->
match by phone -> conservatively parse the free-text Hours ("Monday - Saturday: 10am-6pm") ->
emit hb-format JSON into $OUT (default saout/) for `agg_hobby.py --apply`.
Unparseable hours stay "unknown" — never guess. Days the chain's text omits = closed.
Resumable: API responses cached in sa_zips.json.
Token: ADMIN_TOKEN env or .atok in cwd. curl subprocess ONLY (python http is proxy-blocked).
"""
import json, os, re, subprocess, time

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = os.environ.get("OUT", "saout")
CACHE = "sa_zips.json"
API = "https://satruck.org/apiservices/pickup/donategoods/locations?Type=3&otid=0&ZipCode="
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAYIDX = {"monday": 0, "mon": 0, "tuesday": 1, "tue": 1, "tues": 1, "wednesday": 2, "wed": 2,
          "thursday": 3, "thu": 3, "thur": 3, "thurs": 3, "friday": 4, "fri": 4,
          "saturday": 5, "sat": 5, "sunday": 6, "sun": 6}

def curl(url):
    p = subprocess.run(["curl", "-s", "--max-time", "60", "-A", UA, url], capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else None

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def norm_phone(p):
    d = re.sub(r"\D", "", str(p or ""))
    return d[-10:] if len(d) >= 10 else None

TIME = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)"
TIMESPAN = TIME + r"\s*(?:-|–|to)\s*" + TIME
DAYTOKEN = r"(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?"
DAYRANGE = rf"({DAYTOKEN})\s*(?:-|–|through|thru|to)\s*({DAYTOKEN})"

def to24(h, m, ap):
    h = int(h); m = m or "00"
    if ap == "pm" and h != 12: h += 12
    if ap == "am" and h == 12: h = 0
    return f"{h:02d}:{m}"

def daykey(tok):
    return DAYIDX.get(tok[:3])  # first 3 letters uniquely identify the day

def parse_hours(text):
    """Salvation Army free-text hours -> per-day dict; None if nothing confidently parsed.

    Handles labels ('Store Hours:'), '|'-separated sections (donation-only sections dropped),
    days-first AND time-first orders, 'TO' separators, minute-less times, 'Closed Sunday'.
    A bare time with no day anywhere = ambiguous -> None (never guess).
    """
    text = (text or "").strip().lower()
    if not text: return None
    # keep sections that are about the store; drop donation-center-only sections
    sections = [s for s in text.split("|")
                if "donation" not in s or "store" in s]
    out = [None] * 7; found = False
    for section in sections:
        section = re.sub(r"^[^:]*hours\s*:", " ", section)  # strip 'Store & Donation Hours:' labels
        section_found_before = found
        for seg in re.split(r"[,;.\n]+", section):
            seg = seg.strip()
            if not seg: continue
            days = None
            m = re.search(DAYRANGE, seg)
            if m:
                a, b = daykey(m.group(1)), daykey(m.group(2))
                if a is not None and b is not None:
                    days = list(range(a, b + 1)) if a <= b else list(range(a, 7)) + list(range(0, b + 1))
            else:
                toks = [daykey(t) for t in re.findall(DAYTOKEN, seg)]
                toks = [t for t in toks if t is not None]
                if toks: days = toks
            if days is None: continue
            if "closed" in seg:
                for d in days: out[d] = "closed"
                found = True; continue
            tm = re.search(TIMESPAN, seg)
            if not tm: continue
            span = f"{to24(tm.group(1), tm.group(2), tm.group(3))}-{to24(tm.group(4), tm.group(5), tm.group(6))}"
            for d in days: out[d] = span
            found = True
        if not (found and not section_found_before):
            # section fallback: '10 am - 7 pm, Mon - Sat' (comma separates time from days) —
            # exactly one timespan + one day-range in the whole section pairs them safely
            spans = re.findall(TIMESPAN, section)
            ranges = re.findall(DAYRANGE, section)
            if len(spans) == 1 and len(ranges) == 1:
                a, b = daykey(ranges[0][0]), daykey(ranges[0][1])
                if a is not None and b is not None:
                    span = f"{to24(*spans[0][:3])}-{to24(*spans[0][3:])}"
                    for d in (range(a, b + 1) if a <= b else list(range(a, 7)) + list(range(0, b + 1))):
                        out[d] = span
                    found = True
    if not found: return None
    if not any(isinstance(v, str) and "-" in v for v in out if v):
        # only 'closed' fragments parsed ('...10-8 Closed Sunday' with am/pm-less times we skip) —
        # an all-closed result from TEXT is always a partial parse, never a real closure. No guessing,
        # and NEVER deactivate a store off parsed prose.
        return None
    return {DAYS[i]: (out[i] if out[i] else "closed") for i in range(7)}  # unmentioned = closed

# ---- our SA rows without hours
def hashours(h):
    if not h or h in ("", "null", "{}"): return False
    try:
        hj = json.loads(h) if isinstance(h, str) else h
        return isinstance(hj, dict) and any(v for v in hj.values())
    except Exception: return False

chains = admin_get("/api/admin/table-dump?name=chains&limit=5000")["rows"]
target = {c["id"] for c in chains if (c.get("name") or "").strip().lower() == "salvation army"}
stores = []; off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        if r.get("chainId") in target and r.get("active") is not False and not hashours(r.get("hours")):
            ph = norm_phone(r.get("phone")); z = re.sub(r"\D", "", str(r.get("zip") or ""))[:5]
            if ph: stores.append({"id": r["id"], "ph": ph, "zip": z})
    off += len(rows)
    if len(rows) < 20000: break
print("our Salvation Army stores needing hours:", len(stores))

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
zips = sorted({s["zip"] for s in stores if len(s["zip"]) == 5})
print("unique zips to query:", len(zips))
for i, z in enumerate(zips):
    if z in cache: continue
    raw = curl(API + z)
    try:
        d = json.loads(raw)
        cache[z] = d.get("RetVal", {}).get("Locations", []) if d.get("Success") else []
    except Exception:
        cache[z] = []
    if i % 25 == 0:
        json.dump(cache, open(CACHE, "w"))
        print(f"zips {i}/{len(zips)}", flush=True)
    time.sleep(0.25)
json.dump(cache, open(CACHE, "w"))

by_phone = {}
for locs in cache.values():
    for L in locs:
        if "STORE" not in (L.get("TypeName") or ""): continue
        p = norm_phone(L.get("ContactPhone"))
        if p and p not in by_phone: by_phone[p] = L.get("Hours") or ""
print("store locations indexed by phone:", len(by_phone))

results = []; parsed = 0; unparsed = 0
for s in stores:
    if s["ph"] not in by_phone: continue
    h = parse_hours(by_phone[s["ph"]])
    if h is None:
        unparsed += 1
        results.append({"id": s["id"], **{d: "unknown" for d in DAYS}})
    else:
        parsed += 1
        results.append({"id": s["id"], **h})
os.makedirs(OUT, exist_ok=True)
json.dump(results, open(f"{OUT}/hb_sa0.json", "w"))
print(f"matched: {len(results)}/{len(stores)} (parsed hours: {parsed}, unparseable->unknown: {unparsed}) -> {OUT}/hb_sa0.json")

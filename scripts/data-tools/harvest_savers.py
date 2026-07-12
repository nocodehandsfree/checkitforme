"""FREE Savers/Value Village/Unique hours harvest from stores.savers.com store pages.

Flow: sitemap (665 store pages) -> fetch each -> parse telephone + day-hours JSON -> match our
Savers/Unique no-hours rows by phone -> emit hb-format JSON into $OUT (default svout/) for
`agg_hobby.py --apply`. Resumable: pages cached in sv_pages.json.
Token: ADMIN_TOKEN env or .atok in cwd. curl subprocess ONLY (python http is proxy-blocked).
"""
import json, os, re, subprocess, time

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = os.environ.get("OUT", "svout")
CACHE = "sv_pages.json"
DAYS = [("mon", "Monday"), ("tue", "Tuesday"), ("wed", "Wednesday"), ("thu", "Thursday"),
        ("fri", "Friday"), ("sat", "Saturday"), ("sun", "Sunday")]

def curl(url, binary=False):
    p = subprocess.run(["curl", "-sL", "--max-time", "60", "-A", UA, url],
                       capture_output=True, text=not binary)
    return p.stdout if p.returncode == 0 else None

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def norm_phone(p):
    d = re.sub(r"\D", "", str(p or ""))
    return d[-10:] if len(d) >= 10 else None

# ---- store page list from sitemap
raw = curl("https://stores.savers.com/sitemap/sitemap.xml.gz", binary=True)
import gzip
try: xml = gzip.decompress(raw).decode()
except Exception: xml = raw.decode(errors="ignore")
urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if u.endswith(".html")]
print("store pages in sitemap:", len(urls))

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}

def parse_page(html):
    ph = None
    m = re.search(r'telephone"\s*:\s*"([^"]+)"', html)
    if m: ph = norm_phone(m.group(1))
    hours = {}
    for key, day in DAYS:
        m = re.search(r'"%s"\s*:\s*(\[[^\]]*\])' % day, html)
        if not m:
            hours[key] = "unknown"; continue
        try: spans = json.loads(m.group(1))
        except Exception: hours[key] = "unknown"; continue
        if not spans:
            hours[key] = "closed"; continue
        o, c = spans[0].get("open"), spans[0].get("close")
        hours[key] = f"{o}-{c}" if o and c else "unknown"
    return ph, hours

for i, u in enumerate(urls):
    if u in cache: continue
    html = curl(u)
    if not html: continue
    ph, hours = parse_page(html)
    cache[u] = {"ph": ph, "hours": hours}
    if i % 50 == 0:
        json.dump(cache, open(CACHE, "w"))
        print(f"pages {i}/{len(urls)}", flush=True)
    time.sleep(0.2)
json.dump(cache, open(CACHE, "w"))
by_phone = {v["ph"]: v["hours"] for v in cache.values() if v.get("ph")}
print("pages fetched:", len(cache), "| with phone:", len(by_phone))

# ---- our Savers + Unique rows without hours
def hashours(h):
    if not h or h in ("", "null", "{}"): return False
    try:
        hj = json.loads(h) if isinstance(h, str) else h
        return isinstance(hj, dict) and any(v for v in hj.values())
    except Exception: return False

chains = admin_get("/api/admin/table-dump?name=chains&limit=5000")["rows"]
target = {c["id"] for c in chains if (c.get("name") or "").strip().lower() in ("savers", "unique", "value village")}
stores = []; off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        if r.get("chainId") in target and r.get("active") is not False and not hashours(r.get("hours")):
            ph = norm_phone(r.get("phone"))
            if ph: stores.append({"id": r["id"], "ph": ph})
    off += len(rows)
    if len(rows) < 20000: break
print("our Savers/Unique stores needing hours:", len(stores))

results = []
for s in stores:
    h = by_phone.get(s["ph"])
    if h: results.append({"id": s["id"], **h})
os.makedirs(OUT, exist_ok=True)
json.dump(results, open(f"{OUT}/hb_sv0.json", "w"))
print(f"matched by phone: {len(results)}/{len(stores)} -> {OUT}/hb_sv0.json")

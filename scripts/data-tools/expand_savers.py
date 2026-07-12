"""EXPAND Savers/Value Village/Unique: import US store-locator pages we don't have yet.

Re-parses stores.savers.com store pages for full records (brand -> chain, name, address, coords,
phone, per-day hours), keeps US stores whose phone is NOT already in our DB, writes sv_new.json.
Brand from the page URL: savers->Savers, valuevillage->Value Village, unique->Unique.
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, gzip, time

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
DAYS = [("mon", "Monday"), ("tue", "Tuesday"), ("wed", "Wednesday"), ("thu", "Thursday"),
        ("fri", "Friday"), ("sat", "Saturday"), ("sun", "Sunday")]
US = {'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
      'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
      'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'}
BRAND = {"valuevillage": "Value Village", "savers": "Savers", "unique": "Unique", "villagedes": "Value Village"}

def curl(url, binary=False):
    p = subprocess.run(["curl", "-sL", "--max-time", "60", "-A", UA, url], capture_output=True, text=not binary)
    return p.stdout if p.returncode == 0 else None

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def norm(p):
    d = re.sub(r"\D", "", str(p or "")); return d[-10:] if len(d) >= 10 else None

# existing phones
allphones = set(); off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        p = norm(r.get("phone"))
        if p: allphones.add(p)
    off += len(rows)
    if len(rows) < 20000: break
print("existing phones:", len(allphones))

raw = curl("https://stores.savers.com/sitemap/sitemap.xml.gz", binary=True)
try: xml = gzip.decompress(raw).decode()
except Exception: xml = raw.decode(errors="ignore")
urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if u.endswith(".html")]

cache = json.load(open("sv_pages_full.json")) if os.path.exists("sv_pages_full.json") else {}

def parse(html, url):
    ph = None
    m = re.search(r'telephone"\s*:\s*"([^"]+)"', html)
    if m: ph = norm(m.group(1))
    hours = {}
    for key, day in DAYS:
        m = re.search(r'"%s"\s*:\s*(\[[^\]]*\])' % day, html)
        if not m: hours[key] = "unknown"; continue
        try: spans = json.loads(m.group(1))
        except Exception: hours[key] = "unknown"; continue
        if not spans: hours[key] = "closed"; continue
        o, c = spans[0].get("open"), spans[0].get("close")
        hours[key] = f"{o}-{c}" if o and c else "unknown"
    name = None; addr = {}
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try: d = json.loads(m.group(1))
        except Exception: continue
        for it in (d if isinstance(d, list) else [d]):
            a = it.get("address") or {}
            if a.get("streetAddress"):
                addr = {"street": a.get("streetAddress"), "city": a.get("addressLocality"),
                        "state": a.get("addressRegion"), "zip": a.get("postalCode")}
            if it.get("name") and not name: name = it["name"]
    parts = url.split("stores.savers.com/")[1].split("/")
    brand = BRAND.get(re.sub(r"[^a-z]", "", parts[2].split("-")[0]) if len(parts) > 2 else "", "Savers")
    return {"ph": ph, "hours": hours, "addr": addr, "brand": brand,
            "state": (parts[0].upper() if parts else ""), "city": parts[1] if len(parts) > 1 else ""}

for i, u in enumerate(urls):
    if u in cache: continue
    html = curl(u)
    if not html: continue
    cache[u] = parse(html, u)
    if i % 50 == 0:
        json.dump(cache, open("sv_pages_full.json", "w")); print(f"pages {i}/{len(urls)}", flush=True)
    time.sleep(0.2)
json.dump(cache, open("sv_pages_full.json", "w"))

records = []; by_brand = {}
for u, v in cache.items():
    st = (v.get("state") or "").upper()
    if st not in US: continue
    ph = v.get("ph")
    if not ph or ph in allphones: continue
    a = v.get("addr") or {}
    rec = {"chain": v["brand"], "category": "thrift",
           "name": (v.get("name") if v.get("name") else f"{v['brand']} {a.get('city') or v.get('city')}"),
           "address": a.get("street") or "", "city": a.get("city") or "", "state": a.get("state") or st,
           "zip": a.get("zip") or "", "phone": ph, "sellsPacks": True, "hasKiosk": False,
           "stockStatus": "unverified"}
    hv = v.get("hours") or {}
    if any(x not in ("unknown",) for x in hv.values()): rec["hours"] = hv
    records.append(rec); by_brand[v["brand"]] = by_brand.get(v["brand"], 0) + 1
# name cleanup: JSON-LD name is often "About Savers Thrift Store in City, ST" -> normalize
for r in records:
    r["name"] = re.sub(r"^About\s+", "", r["name"]).strip()
json.dump(records, open("sv_new.json", "w"))
print("new US Savers-family stores:", len(records), "| by brand:", by_brand)
print("with hours:", sum(1 for r in records if "hours" in r))

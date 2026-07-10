"""EXPAND hobby: harvest cardshophub.com shop pages -> import records for shops we don't have.

cardshophub lists ~6,672 individual card/TCG shop pages, each with clean Store JSON-LD
(name, full address, geo, phone, openingHoursSpecification). This fetches them all (resumable),
parses complete records, and writes csh_new_raw.jsonl. apply_hobby_expansion.py then gates +
dedupes + imports the net-new under the 'Independent Card Shop' chain.

Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY (python http is proxy-blocked here).
"""
import json, os, re, subprocess, time

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
SITEMAP = "https://cardshophub.com/sitemap.xml"
OUT = os.environ.get("OUT", "csh_new_raw.jsonl")
DAYMAP = {"monday": "mon", "tuesday": "tue", "wednesday": "wed", "thursday": "thu",
          "friday": "fri", "saturday": "sat", "sunday": "sun"}

def curl(url):
    p = subprocess.run(["curl", "-s", "--max-time", "45", "-A", UA, url], capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else None

# shop pages = /states/<st>/<city>/<shop>/  (8 path segments)
sm = curl(SITEMAP) or ""
urls = re.findall(r"<loc>([^<]+)</loc>", sm)
shops = [u for u in urls if u.rstrip("/").count("/") == 6 and "/states/" in u]  # .../states/st/city/shop
print("shop pages in sitemap:", len(shops))

done = set()
if os.path.exists(OUT):
    for line in open(OUT):
        try: done.add(json.loads(line)["url"])
        except Exception: pass
print("already harvested:", len(done))

def to_hours(spec):
    if not isinstance(spec, list): spec = [spec] if spec else []
    h = {}
    for s in spec:
        if not isinstance(s, dict): continue
        dows = s.get("dayOfWeek")
        if isinstance(dows, str): dows = [dows]
        o, c = s.get("opens"), s.get("closes")
        if not (o and c and dows): continue
        for d in dows:
            k = DAYMAP.get(str(d).split("/")[-1].strip().lower())
            if k: h[k] = f"{o[:5]}-{c[:5]}"
    return h or None

out = open(OUT, "a")
ok = 0; nostore = 0
for i, u in enumerate(shops):
    if u in done: continue
    html = curl(u)
    if not html:
        time.sleep(0.5); continue
    store = None
    for b in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try: d = json.loads(b)
        except Exception: continue
        for it in (d if isinstance(d, list) else [d]):
            if it.get("@type") == "Store": store = it
    if not store:
        nostore += 1
        out.write(json.dumps({"url": u, "skip": "no-store-ld"}) + "\n")
        continue
    a = store.get("address") or {}
    g = store.get("geo") or {}
    rec = {"url": u, "name": store.get("name"), "phone": store.get("telephone"),
           "address": a.get("streetAddress"), "city": a.get("addressLocality"),
           "state": a.get("addressRegion"), "zip": a.get("postalCode"),
           "country": a.get("addressCountry"),
           "lat": g.get("latitude"), "lng": g.get("longitude"),
           "hours": to_hours(store.get("openingHoursSpecification"))}
    out.write(json.dumps(rec) + "\n"); out.flush(); ok += 1
    if i % 100 == 0:
        print(f"{i}/{len(shops)} parsed={ok} no-store={nostore}", flush=True)
    time.sleep(0.15)
print(f"done: parsed={ok} no-store={nostore}")

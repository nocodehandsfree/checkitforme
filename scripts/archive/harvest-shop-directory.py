#!/usr/bin/env python3
"""Harvest cardshophub.com shop pages -> JSONL of the JSON-LD Store record.
Resumable (skips URLs already in the output), polite (delay + backoff on non-200).
Usage: harvest.py <url_list_file> <out.jsonl> [state_filter] [delay_s]
"""
import sys, json, re, time, os
import urllib.request, urllib.error

url_file, out_file = sys.argv[1], sys.argv[2]
state_filter = sys.argv[3] if len(sys.argv) > 3 else ""   # e.g. "/states/ca/"
delay = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
PROXY = os.environ.get("HTTPS_PROXY", "http://127.0.0.1:42849")
opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": PROXY, "http": PROXY}))

urls = [u.strip() for u in open(url_file) if u.strip()]
if state_filter:
    urls = [u for u in urls if state_filter in u]

done = set()
if os.path.exists(out_file):
    for line in open(out_file):
        try: done.add(json.loads(line)["url"])
        except Exception: pass
print(f"targets={len(urls)} already_done={len(done)} delay={delay}", flush=True)

LD_RE = re.compile(r'<script id="shop-json-ld"[^>]*>(.*?)</script>', re.S)
out = open(out_file, "a")
ok = fail = 0
for i, u in enumerate(urls):
    if u in done:
        continue
    body = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with opener.open(req, timeout=25) as r:
                body = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** attempt); continue
            fail += 1; break
        except Exception:
            time.sleep(1.5 * (attempt + 1)); continue
    if not body:
        fail += 1
        time.sleep(delay); continue
    m = LD_RE.search(body)
    if not m:
        fail += 1; time.sleep(delay); continue
    try:
        d = json.loads(m.group(1))
    except Exception:
        fail += 1; time.sleep(delay); continue
    addr = d.get("address", {}) or {}
    geo = d.get("geo", {}) or {}
    rec = {
        "name": d.get("name"),
        "streetAddress": addr.get("streetAddress"),
        "city": addr.get("addressLocality"),
        "state": addr.get("addressRegion"),
        "zip": addr.get("postalCode"),
        "phone": d.get("telephone"),
        "lat": geo.get("latitude"),
        "lng": geo.get("longitude"),
        "desc": (d.get("description") or "")[:200],
        "url": u,
    }
    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    out.flush()
    ok += 1
    if ok % 50 == 0:
        print(f"  {ok} ok / {fail} fail  ({i+1}/{len(urls)})", flush=True)
    time.sleep(delay)
print(f"DONE ok={ok} fail={fail}", flush=True)

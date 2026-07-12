"""EXPAND thrift with a NEW chain: Habitat for Humanity ReStore (~900 US stores).

habitat.org's ReStore finder (/local/restore?zip=NNNNN) returns the ~10 nearest ReStores as
'address-listing' article blocks (name, phone, full address). We sweep a national zip spread
(one representative zip per 3-digit prefix present in our store base) and dedupe by phone.
No hours in this source -> stores added with phone+address; hours backfilled later by a wave.

Writes hab_new_raw.jsonl. apply_thrift_expansion.py (add 'Habitat ReStore' to THRIFT_CHAINS) gates
+ imports. Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, time
from collections import Counter

BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = os.environ.get("OUT", "hab_new_raw.jsonl")

def curl(url):
    p = subprocess.run(["curl", "-sL", "--max-time", "45", "-A", UA, url], capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else None

def admin_get(path):
    out = subprocess.run(["curl", "-s", "--max-time", "180",
                          "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}", BASE + path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

# national zip spread: one representative (most common) zip per 3-digit prefix in our store base
byprefix = {}
off = 0
while True:
    rows = admin_get(f"/api/admin/table-dump?name=retailers&limit=20000&offset={off}")["rows"]
    if not rows: break
    for r in rows:
        z = re.sub(r"\D", "", str(r.get("zip") or ""))[:5]
        if len(z) == 5: byprefix.setdefault(z[:3], Counter())[z] += 1
    off += len(rows)
    if len(rows) < 20000: break
zips = sorted({c.most_common(1)[0][0] for c in byprefix.values()})
print("national zip spread (one per 3-digit prefix):", len(zips))

done_zips = set()
by_phone = {}
if os.path.exists(OUT):
    for line in open(OUT):
        try:
            o = json.loads(line)
            if o.get("_zip_done"): done_zips.add(o["_zip_done"])
            elif o.get("phone"): by_phone[o["phone"]] = o
        except Exception: pass
print("resumed: zips done", len(done_zips), "restores so far", len(by_phone))

def field(html, cls):
    m = re.search(r'<span class="%s">([^<]*)</span>' % cls, html)
    return (m.group(1).strip() if m else "")

out = open(OUT, "a")
for i, z in enumerate(zips):
    if z in done_zips: continue
    html = curl(f"https://www.habitat.org/local/restore?zip={z}")
    if not html:
        time.sleep(0.5); continue
    for a in re.findall(r'<article class="address-listing[^"]*">(.*?)</article>', html, re.S):
        nm = re.search(r'address-listing__heading">\s*<span>([^<]*)</span>', a)
        ph = re.search(r'\((\d{3})\)\s?(\d{3})-(\d{4})', a)
        if not (nm and ph): continue
        phone = "".join(ph.groups())
        if phone in by_phone: continue
        rec = {"chain": "Habitat ReStore", "category": "thrift",
               "name": nm.group(1).strip(),
               "address": field(a, "address-line1"), "city": field(a, "locality"),
               "state": field(a, "administrative-area"), "zip": field(a, "postal-code"),
               "phone": phone, "sellsPacks": True, "hasKiosk": False, "stockStatus": "unverified"}
        by_phone[phone] = rec
        out.write(json.dumps(rec) + "\n")
    out.write(json.dumps({"_zip_done": z}) + "\n"); out.flush()
    if i % 50 == 0:
        print(f"{i}/{len(zips)} zips | unique ReStores: {len(by_phone)}", flush=True)
    time.sleep(0.2)
print(f"done: unique ReStores found: {len(by_phone)}")

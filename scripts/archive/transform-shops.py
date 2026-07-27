#!/usr/bin/env python3
"""Transform harvested cardshophub JSONL -> importStores StoreIn[] JSON.
Filters: must have phone + lat/lng; drops big chains (avoid clobbering existing chains);
dedups by phone digits. All shops share one 'Independent Card Shop' chain (category hobby)."""
import sys, json, re

infile, outfile = sys.argv[1], sys.argv[2]

# Names that are NOT independent hobby shops — skip so we never re-chain existing rows.
BIG = re.compile(r"\b(gamestop|target|walmart|walgreens|cvs|best buy|barnes|meijer|kroger|"
                 r"five below|toys ?r ?us|costco|sam'?s club|dollar (tree|general)|family dollar|"
                 r"7.?eleven|macy|kohl'?s|micro center|book.?a.?million)\b", re.I)

def carries_for(name, desc):
    t = (name + " " + desc).lower()
    out = []
    if "sport" in t: out += ["Sports Cards (Topps/Panini)"]
    if any(w in t for w in ["tcg", "pokemon", "pokémon", "magic", "yugioh", "yu-gi-oh", "one piece", "lorcana", "trading card", "game"]):
        out += ["Pokémon", "Magic: The Gathering", "One Piece TCG", "Yu-Gi-Oh"]
    if not out:
        out = ["Pokémon", "Sports Cards (Topps/Panini)"]
    # de-dup preserving order
    seen, res = set(), []
    for c in out:
        if c not in seen: seen.add(c); res.append(c)
    return res

seen_phones = set()
out = []
kept = skip_nophone = skip_nogeo = skip_big = skip_dup = 0
for line in open(infile):
    line = line.strip()
    if not line: continue
    d = json.loads(line)
    name = (d.get("name") or "").strip()
    phone = d.get("phone")
    lat, lng = d.get("lat"), d.get("lng")
    if not name: continue
    if BIG.search(name): skip_big += 1; continue
    if not phone: skip_nophone += 1; continue
    if lat is None or lng is None: skip_nogeo += 1; continue
    key = re.sub(r"\D", "", str(phone))
    if len(key) < 10: skip_nophone += 1; continue
    if key in seen_phones: skip_dup += 1; continue
    seen_phones.add(key)
    rec = {
        "chain": "Independent Card Shop",
        "name": name[:120],
        "category": "hobby",
        "address": d.get("streetAddress") or None,
        "city": d.get("city") or None,
        "state": d.get("state") or None,
        "zip": d.get("zip") or None,
        "lat": round(float(lat), 6), "lng": round(float(lng), 6),
        "phone": str(phone),
        "carries": carries_for(name, d.get("desc") or ""),
        "sellsPacks": True,
        "tier": 3,
    }
    out.append(rec); kept += 1

json.dump(out, open(outfile, "w"), ensure_ascii=False, indent=1)
print(f"kept={kept}  skip: nophone={skip_nophone} nogeo={skip_nogeo} bigchain={skip_big} dup={skip_dup}")
print(f"-> {outfile}")

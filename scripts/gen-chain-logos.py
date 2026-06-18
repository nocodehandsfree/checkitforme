import os
DIR="/home/user/fungibles/voice-caller/public/logos/chains"
FONT="-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
FILL="#ECECF4"
def esc(s): return s.replace('&','&amp;')
def wordmark(slug,name):
    w=name.split()
    if len(w)==1 or len(name)<=11: lines=[name]
    else:
        best=None
        for k in range(1,len(w)):
            l1,l2=' '.join(w[:k]),' '.join(w[k:]); s=abs(len(l1)-len(l2))
            if best is None or s<best[0]: best=(s,l1,l2)
        lines=[best[1],best[2]]
    longest=max(len(l) for l in lines)
    fs=max(26,min(70,int(360/max(longest,1))))
    if len(lines)==1:
        body=(f'<text x="120" y="120" font-size="{fs}" fill="{FILL}" font-family="{FONT}" '
              f'font-weight="800" text-anchor="middle" dominant-baseline="central" '
              f'letter-spacing="-0.5">{esc(lines[0])}</text>')
    else:
        dy=fs*0.58
        body=(f'<text font-size="{fs}" fill="{FILL}" font-family="{FONT}" font-weight="800" '
              f'text-anchor="middle" dominant-baseline="central" letter-spacing="-0.5">'
              f'<tspan x="120" y="{120-dy:.0f}">{esc(lines[0])}</tspan>'
              f'<tspan x="120" y="{120+dy:.0f}">{esc(lines[1])}</tspan></text>')
    open(f"{DIR}/{slug}.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">{body}</svg>')
    print("  wrote",slug,lines,"fs",fs)

LOGOS={"woodman_s_market":"Woodman's Market","lucky_supermarkets":"Lucky Supermarkets",
 "foodmaxx":"FoodMaxx","metro_market":"Metro Market","stop_and_shop":"Stop & Shop",
 "pak_n_save":"Pak N Save","payless_foods":"Payless Foods","uwajimaya":"Uwajimaya","h_mart":"H Mart"}
for slug,name in LOGOS.items(): wordmark(slug,name)

# Pokeball mark for Pokemon Vending kiosks (transparent, no box)
POKE='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<defs><clipPath id="c"><circle cx="120" cy="120" r="90"/></clipPath></defs>
<g clip-path="url(#c)">
<rect x="0" y="0" width="240" height="120" fill="#EE1515"/>
<rect x="0" y="120" width="240" height="120" fill="#F6F6F8"/>
<rect x="0" y="108" width="240" height="24" fill="#171722"/>
</g>
<circle cx="120" cy="120" r="90" fill="none" stroke="#171722" stroke-width="9"/>
<circle cx="120" cy="120" r="29" fill="#F6F6F8" stroke="#171722" stroke-width="9"/>
<circle cx="120" cy="120" r="12" fill="#fff" stroke="#171722" stroke-width="5"/>
</svg>'''
open(f"{DIR}/pokemon_vending.svg","w").write(POKE)
print("  wrote pokemon_vending (pokeball)")

# Check — Style Guide

The single visual source of truth for **checkitforme.com** ("Check") and its admin/vertical
surfaces — the **elevated / soft-depth** skin the live site runs. Every spec here is extracted 1:1
from the approved master boards in this folder: **`comps/WEBSITE_COMPS.dc.html`** (the site) and
**`comps/ADMIN_COMPS.dc.html`** (the admin) — this guide and those boards reference each other; the
guide is the words for what the boards show. Standing rule (owner): every NEW admin feature gets
comped in `ADMIN_COMPS.dc.html` FIRST, then built. The old self-contained bundle `NEW_CHECK_COMPS.html` was a generated duplicate and is
retired to `docs/archive/`.

**This doc is one of three that reference each other — keep them in sync:**
- **Look** (this file): type, color, spacing, the raised/carved depth system, components.
- **Words**: `docs/design/copy/COPY_STYLE_GUIDE.md` owns every string a customer reads. Where the
  comp board's baked-in copy predates that pass, the copy guide wins — this doc never overrides it.
- **Brand mark + colors**: `docs/design/brand/BRAND.md`.
- **Live-vs-comp proof** (screenshots): `docs/specs/design-gap/inventory.html`.

**What "live" means here.** The elevated skin renders under `?skin=v2` and is being promoted to the
default; a "v3" you may hear about is a service-worker/cache-version bump (the fix for stale v1
sticking through Cloudflare), **not** a new skin. When this doc and the live `?skin=v2` site
disagree, fix whichever is wrong and note it. Open reconciliation items are tracked as votable
bullets in `docs/team/design/checkpoint.md`.

---

## 1. The one idea

**No hairline borders. Depth does the separating.**

Every element is **raised** (vertical gradient + drop shadow + 1px inner top highlight), **carved**
(flat dark fill + inset shadow), or — only as chrome on a verdict wash — **glass** (translucent +
faint border). If you're typing `border: 1px solid` on a card, you're in the old skin.

```css
/* RAISED — pills, cards, keys, tiles, day/poll buttons */
background: linear-gradient(180deg, #2E2E35 0%, #25252B 100%);   /* pill chrome    */
background: linear-gradient(180deg, #2D2D34 0%, #27272D 100%);   /* row cards      */
background: linear-gradient(180deg, #31313A 0%, #28282E 100%);   /* active keys    */
box-shadow: 0 8px 16px -8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.1);

/* CARVED — wells, inputs, tracks, message wells, strips */
background: #1B1B20;                       /* in-card wells  */
background: #17171C;                       /* page strips    */
box-shadow: inset 0 2px 6px rgba(0,0,0,.45);

/* GLASS — chrome on a verdict wash only */
background: rgba(255,255,255,.07);
border: 1px solid rgba(255,255,255,.14);
box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
```

**Pressable things get a press state:** `style-active` → `transform: translateY(2-3px)` + reduced
shadow. Buttons look raised, never like form depressions (see the P6b poll keys).

## 2. Surfaces

| Token | Value | Use |
|---|---|---|
| Page | `#1D1D22` | Phone/page background |
| Big card | `#26262B` | Main card, sheets, pop-ups — radius 26–30 |
| Row card | `linear-gradient(180deg,#2D2D34,#27272D)` | Store rows, list items, bubbles, feed cards |
| Well | `#1B1B20` | Inputs, slider/S2 tracks, message wells (inside cards) |
| Strip | `#17171C` | Ticker, footer, photo letterbox (on page bg) |
| Ring fill | `#20202A` / `#23232A` | Inside capsule CTAs / inside selection rings |
| Logo slot | `#1F1F25` (chain art) · `linear-gradient(145deg,#34343D,#23232B)` embossed (wordmark initials) | 38–56px tiles |
| Board bg | `#08090D` | Presentation canvas only |

Big-card shadow `0 24px 48px -12px rgba(0,0,0,.7)` · row-card shadow
`0 8px 14px -8px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07)`.

## 3. Color

- **UI green `#4ADE80`** — success, active icons, CTA ring, links/actions (Resend, Change number).
  Brand-mark green `#4CF286` on the wordmark only. Green CTA ring:
  `linear-gradient(120deg, #5BEA93 0%, #19B145 55%, #0B5A2C 100%)`.
- **Accent yellow `#FFCB05`** (per vertical; Pokémon default) — hero word, Map pill, selection
  rings, call CTA, Post pill, selected calendar day, secondary action links (Change, + 5 more),
  account icon set. Accent ring: `linear-gradient(120deg,#FFE066 0%,#FFCB05 55%,#8A6D00 100%)`.
  **Muted-yellow selection** (plan tiers — must not fight a green CTA on the same screen): ring
  `linear-gradient(120deg,rgba(255,203,5,.5),rgba(255,203,5,.22) 55%,rgba(138,109,0,.4))`, fill
  `#26251E`, glow `rgba(255,203,5,.18)`.
- **Verdict tones** — in stock `#4ADE80` · out `#EF4444` (`#FF7B7B` on wash) · unclear `#FBBF24` ·
  restock-soon `#F59E0B`. **Over-retail prices are `#F59E0B`** (alarming, never error-red).
  Page washes fade to `#1D1D22` at 460px: in `#266440` · out `#6B2427` · unclear `#6C5419`.
- Text: primary `#fff` · body `rgba(255,255,255,.72–.85)` · muted `#8A8A96` · tertiary `#7C7C88` ·
  faint `#5C5C68`/`#6B6B7B` · embossed idle `#CDCDD8`/`#B9B9C4`.
- One accent per element. Icon sets on a screen are uniform (account = all yellow — no purple/gold mix).

## 4. Type — Inter

**Inter only** (Google Fonts, weights 400/500/600/700/800/900), antialiased,
`font-family: Inter, -apple-system, system-ui, sans-serif`.

| Role | Spec |
|---|---|
| Hero / verdict title | 30px / 900 / −1px |
| Verdict price | 34px / 900 / −1.2px |
| Modal / pop-up title | 19–21px / 900 / −.4px (long titles drop to 16.5px — NEVER wrap a heading) |
| Sheet & page titles | 20px / 800 / −.3px |
| Card question title | 24px / 900 / −.6px |
| Row / store name | 14–15px / 700, truncate with ellipsis |
| Body / transcript | 15–16px / 500 |
| Meta / addresses / subs | 11–13px / 600 muted |
| Eyebrow | 10–10.5px / 700 / +.15em UPPERCASE |
| CTA label | 12.5–13px / 800 / +.13–.14em UPPERCASE |
| Badge / chip | 8–9.5px / 900 / +.05–.08em UPPERCASE |
| Set code strip | 11.5px / 800 + 10.5px / 600 muted date |

Rules: inputs never under 16px (iOS zoom). Headings and feature lines never break to two lines —
shorten the copy or the font, never wrap. Price units lowercase (`$49.99/mo`, `/yr`).

## 5. Components

### 5.1 S2 store-type switcher — main nav (locked)
One carved track (`#1B1B20`, inset `0 2px 6px rgba(0,0,0,.5)`, radius 999, 5px padding), active key
raised inside (active `flex:1.4`, others `flex:1`). Labels locked: **Retail · Thrift · Hobby ·
Kiosk**. **Launch state ships Retail + Kiosk only** (active `flex:1.2`) and grows into the full
track as verticals open. Icons all 14px, 2px stroke, **`var(--accent)` (the vertical's brand accent) when active** / `#7C7C88` idle — active tabs ride the accent so Retail + Kiosk read the same as Hobby + Thrift (shipped: commit 5bcb734; was green in the original comp):
storefront · tag · **trading cards** (two fanned cards, pokéball on the front card) · **kiosk**
(awning booth: canopy + body + screen + slot).

### 5.2 Capsule CTA (ring style)
2.5px gradient ring around a dark capsule (`#20202A`, padding 14px 24px), label 13/800 tracked caps
+ trailing → arrow. Green ring = primary; accent(yellow) ring = the call action ("CHECK THIS
STORE"). Glow `0 12px 28px -8px` in the ring color at ~.45.

### 5.3 Signature animations (do not lose)
```css
@keyframes ckWave  { 0%,100%{opacity:.15} 50%{opacity:1} }   /* call CTA sound waves  */
@keyframes ckShine { 0%{left:-45%} 55%,100%{left:110%} }      /* CTA shine sweep       */
@keyframes ckGlow  { 0%,100%{opacity:.4} 50%{opacity:1} }     /* RESULT dot breathing  */
```
- **Live-call phone**: two arcs (`M14.05 6A5 5 0 0 1 18 10` / `M14.05 2a9 9 0 0 1 8 7.94`) on the
  phone icon, `ckWave 1.5s`, second arc delayed .35s.
- **Shine**: absolutely-positioned 45%-wide diagonal white-green gradient strip inside the capsule
  (`position:relative; overflow:hidden` on the capsule), `ckShine 2.8s` — CHECK ANOTHER STORE.
- **RESULT chip**: dot gets `box-shadow: 0 0 8px <verdict>` + `ckGlow 2s`.

### 5.4 Pills & toasts
Raised gradient pills on dark pages; **glass on any verdict wash**. RESULT chip border tints to the
verdict. **Bottom notification (the pill)** — one look for every notification (owner 07-11 comp):
a capsule that slides up from the bottom edge, holds ~2.4s, slides away. **Always gray**
`linear-gradient(180deg,#2E2E35,#25252B)`, white `rgba(255,255,255,.92)` 14.5/800, radius 999,
one line + ellipsis, centered, with a **thin glowing white outline that softly pulses** around it
(box-shadow, ~2.6s). **Never green, never accent.** `.tneutral/.taccent` are retired no-ops.
**Copy law — notifications are fragments, not sentences: no periods and no commas, ever** (both
languages; decimals `4.00` and thousands `1,000` are protected). Enforced at render by `pillCopy()`
so future copy can't break it. e.g. `The store is closed` · `No one picked up we will try again`.

### 5.5 Selection ring
Selected row/tile/day = 1.5–2px accent-gradient ring wrapper, inner fill `#23232A` (green ring for
positive picks like BEST price). Plan tiers use the **muted** yellow (§3).

### 5.6 Store rows & logo slots
38–56px logo slot + name (700, truncates) + meta line + right cell: miles, quoted price, or a
**status icon chip** (§5.7). Chain logos from `checkitforme.com/logos/chains/*.png` on `#1F1F25`;
independent shops get the embossed tile with 2-letter 900-weight initials — never a fake logo.

### 5.7 Status icon set (one language everywhere)
26px circle, 15% tinted bg, 2.2–2.8px stroke icon: **✓ green** in stock · **✕ red + "Out" label** ·
**truck amber + day label** ("Tue") restocking · **? amber-bold** unclear. Used in YOUR HUNT rows,
the P6b poll keys (34px), and the calls-by-day list (24px). Never plain colored dots.

### 5.8 Verdict pages
Wash from status bar (§3) → glass pills → glowing RESULT chip → verdict title (30/900, verdict
color) → price if quoted (34/900) → **max two lines** of sentence, tokens bold — format:
`{Store} has a {Set} {Product}. It's {$X over retail}.` (over-retail in `#F59E0B`) → green shine
CTA → timeline + conversation → verdict line ("In stock. Confirmed.") → in-stock actions (§5.9) →
YOUR HUNT (logo tiles + status chips, BEST ring) → restock row → "N checks used" → footer.
**Couldn't tell** adds the 4-key poll: raised buttons directly on the page (no wrapping box),
status icons + labels, press-down states.

### 5.9 In-stock actions
Retail flow: green capsule **SHARE YOUR SCORE** (opens OS share sheet) + 2-up raised cards
**Too far?** (Runnr grabs it) and **Grabbed it?** (Post your score), green 32px icon tiles.
Hobby flow: **only** the full-width "Too far?" row. Shown on every in-stock result.

### 5.10 Calls-by-day pop-over
Calendar card (`#26262B` radius 22): raised nav keys, **selected day = Check-green `#4ADE80` raised
key** (shipped: commit 977cbc7; was accent-yellow in the original comp — green reads cleaner and
doesn't fight the accent), today = 1.5px white outline, past/future muted. Day list card: back key + centered date, rows =
raised store rows with 24px status chips + time; selected call gets the accent ring.

### 5.11 Pop-ups vs bottom sheets
Store call sheets + plans = **bottom sheets** (rounded top corners, 40×5 grabber). Log-in, verify,
restock dialogs, calls-by-day, and all My-checks screens = **centered pop-ups** (big card radius
26 over `rgba(5,6,9,.66)`, no grabber). Never put a grabber on a pop-up.

### 5.12 Forms & errors
Inputs are carved wells (radius 14, padding 14–15px 16px, 16px/500 text, italic muted
placeholders). Error = 2px red ring (`#FF9B9B→#EF4444→#7F1D1D`) around the well + one short line
directly under it, left-aligned: 13px alert icon + 12.5/600 `#FF7B7B`. Never floating/centered
error text. Option pickers (days, poll) are **raised buttons** that light up (`#4ADE80` text +
green glow when on) — never carved form fields. Links inside sentences get
`text-decoration: underline dashed rgba(74,222,128,.55); text-underline-offset: 4px`.
**Login/verify = phone number only** (🇺🇸 +1 field, no email — phone IS the login; owner-confirmed).
Waitlist / add-a-store forms = **email only** (they promise an email). No generic "phone or email"
contact field.

### 5.13 Set & era merchandising (hobby)
- **Era step**: era logos sit **directly on the page**, big (~82% card width), raised by stacked
  drop-shadows — no button chrome. Press dips them (`translateY(3px) scale(.97)`), then sets load.
- **Set banners**: the full marketing art fills the tile (`object-fit:cover`, height ~112px) — the
  logo is already in the art; never overlay a second logo, never gray it out. `JUST DROPPED` chip
  top-right ON the art. Below: one small strip (≈25% of tile): set code left (`ME05` 11.5/800),
  date right (`Jul 2026` 10.5/600 muted). No set names — the banner says it.
- **Product page**: banner takes over the card top (full-bleed, radius 26 top, back key floating
  on it). Product rows: carved 38px icon tile + name + retail price. Product-type icon set
  (20px, 1.7px stroke, `#CDCDD8`): booster box (display w/ packs) · ETB (3D cube) · booster bundle
  (quadrant box + center diamond) · premium collection (wide box + sparkle) · 3-pack blister ·
  mini tin (rounded, lid line) · sleeved booster.

### 5.14 Footer (locked)
On the `#17171C` strip, **one centered, unified cluster — desktop = mobile** (shipped: commit
9a39fd4; the original comp split wordmark-left / socials-right). Links on one line —
`Scores About FAQ Contact Terms Privacy` 13/600 muted, EN dropdown pill, then wordmark + ©2026 and
the Discord/X 36px raised circles, all centered. Tight: padding ~22px 18px.
**Terms and Privacy are two separate links, no `Legal`** (owner 07-11 — reversed the earlier collapse;
lays out better as two). A **light hairline** `border-top:1px solid rgba(255,255,255,.07)` sits at the
footer's top edge so it reads as a footer, over the otherwise transparent/blended background.

### 5.15 Scores ("Scores from the hunt")
Yellow trophy + 21/900 title + accent **Post** pill (camera icon, `#FFE066→#FFCB05`, dark text).
Empty state: dashed carved panel (1.5px dashed `rgba(255,255,255,.13)`), trophy, "Be the first to
post a score" 17/800, "…and get a free check." muted, Post capsule. Feed: raised cards — 38px logo
tile + `@handle · Store` + location/region + age, full-bleed photo on `#17171C`, heart + count +
caption.

### 5.16 Runnr (hand off to a driver)
Header `Runnr · hand off to a driver` + "5 quick steps" sub. Job chip: product icon tile + item ×
qty + `Store → drop-off` + glass `IN STOCK` chip. 5-step rail: 30px nodes (done = green outline ✓,
active = solid green + `0 0 0 5px rgba(74,222,128,.14)` halo, idle = carved grey; connector 2px,
green when done), step cards raised (idle at 50% opacity). Bonus stepper: carved well, $ 25/800 +
raised −/+ keys. Copy stays lean: "A one-time card covers item + tax + shipping." Message well =
carved, links green. Driver preview on near-black `#141419`; Apple-Pay key white. Rating stars
26px, green lit. Footer: "Powered by Fungibles · runner.fungibles.com".

### 5.17 Zones (My Zones — check a whole area) (owner 07-11 comp)
**Locked frame, not a page.** Every zone screen is one fixed full-viewport flex column: header pinned
top, **only the middle scrolls**, action bar pinned bottom — nothing bleeds under the header. The app's
**global header + support bubble are hidden** in zones (`body.zoning`); the frame carries its own header
(back · centered title · credits pill on the right). List = New-zone button + zone cards + footer at the
end of the scroll. Create = locked search/radius sub-header + scrolling store list + **basket bar that
rides up from the bottom** as you pick stores (removable store chips + name field + Save). Run report is
the same frame (pinned header, scrolling results). **Zone card:** name + kebab, status pill (green
"N in stock" / grey "Not checked yet"), "N stores · ago", up to 4 logo tiles + "+N", "Check this zone". **Build:** search a
ZIP/town, radius ring (1·2·5·10 mi), list or map. **Load every store in the radius regardless of
open/closed** — closed ones show a `closed` tag but are still selectable (you build a zone once, call it
whenever). **Add all** is one button with two states: once every in-radius store is picked it flips to
**Remove all** (red-tinted) so a tap clears them back out. **No price and no check-count anywhere in the
zone flow** — not on the card, not on the confirm (owner 07-11). **Confirm sheet:** if any store is
closed, warn which ones by name and reassure `We can still call the N that are open` (amber panel);
closed stores are **skipped server-side** so no check is wasted. Title `Check N open stores?`, button
`Check all N`. Out of checks → the pill says so and the buy sheet opens (single checks and sweeps both
pre-flight affordability before starting).

### 5.18 Toolbox rest
Wells/slider (24px white thumb, green glow) · search inputs · call timeline (2px line, 3 dots,
green → verdict; STAFF muted / CHECK AI green bubble labels) · art placeholders (45° stripes
`#2B2B33/#25252C` + mono label) unchanged from the board.

## 6. Radii
**pill/capsule/track 999 · phone 40 · big card/pop-up 26 · sheet top 28 · row card 13–14 ·
tile/banner 16 · poll/day key 11–14 · selection ring = inner + 2 · logo slot 11–15 · nav key 11.**

## 7. Dev notes baked into the board
- **Price aggregation** (purple DEV NOTE card next to P6): one row per store+product; every
  completed check upserts verdict/quote/timestamp — latest wins; BEST = lowest fresh (≤7d)
  in-stock quote, ties → nearest; stale quotes grey to "Last seen $X · date"; sort = in stock
  (price asc) → restock known → unchecked (distance) → out.
- Launch nav = Retail + Kiosk (P1); full S2 is the expansion state.
- In-stock action rules per flow: §5.9.
- No env/staging chrome ever ships in UI (see L1c).

## 8. Don'ts
- No hairline borders on cards/rows (glass chrome on washes is the only bordered thing).
- No two-line headings, buttons, or feature lines. Ever.
- No dark pills on washes — glass only. No grabbers on pop-ups.
- No green selection ring next to a green CTA — use the muted yellow.
- No colored dots for status — the icon set (§5.7) everywhere.
- No overlaying logos on set art, no graying the banners, no repeating the set name under it.
- No recolored controls per vertical; no purple accents on account screens; no emoji in UI.
- No hand-drawn store logos; icons stay in the 2px-stroke inline set.

---

_Owned by Design. Screens: `comps/WEBSITE_COMPS.dc.html` + `comps/ADMIN_COMPS.dc.html`. Words:
`docs/design/copy/COPY_STYLE_GUIDE.md`._

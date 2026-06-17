# Chain logos — one renderer, one QA wall

**Owner:** Check - Logo/Brand Dev. **QA URL:** checkitforme.com/logo-wall.

## How it works
Every chain logo on every surface — the consumer store list (`checkit.html`), the admin
(`app.html`), and the wall (`/logo-wall`) — renders through **one** component:

- `public/logos/logo-tile.js` — `LogoTile.tile(info, size)` (the rules + markup)
- `public/logos/logo-tile.css` — the look (`.lt-*`, sized by one `--lt-size` knob)

It's **inlined** into all three at serve time (server `page()` + `/logo-wall`), so "fixed on the
wall" == fixed in the app and admin. No copies, no drift. `info` comes from `chainLogoInfo()` in
`src/server.ts` and ships to clients as `logoUrl / logoWide / logoDark / logoWordmark`.

## The rules (owner spec)
1. **Uniform size** — every tile is the same square; every mark fills the same box.
2. **Mark-only** — when we show an image it's a brand mark (square-ish). Wordmark assets don't get
   squished; they render as text instead.
3. **Long, mark-less name → balanced two lines.** Barnes & Noble is custom: "Barnes"/"Noble" stacked
   with the "&" to the right at word size.
4. **Short name → one large line.**

## Picking image vs text
Driven by `public/logos/chains/_meta.json` per file: `w` (wide wordmark) `d` (dark ink). Default:
**wide → text wordmark, square → mark image.** Override per file with `"m"`:
- `"m":"mark"` — force the image (it's a real mark even if wide).
- `"m":"text"` — force the balanced text (ignore the image).

## Open requests
**Brand-mark assets to source (owner)** — these render as legible-but-small text today because the
only asset is a long wordmark. A clean transparent **mark** PNG (square) would render bigger/sharper:
Burlington (the "B"), Dick's Sporting Goods, Academy Sports + Outdoors, Books-A-Million,
Ollie's Bargain Outlet, Office Depot/OfficeMax, Blain's Farm & Fleet. (The wall tags every text
tile — pick any others you'd rather see as a mark.) Drop the PNG at
`public/logos/chains/<slug>.png` and set `"m":"mark"` in `_meta.json`.

**Slug/name reconciliation (Data Dev)** — the wall's "Unmapped assets" section lists logo files no
chain name resolves to (e.g. a slug/name drift). The fix is a chain name or slug change **requested
from Data Dev** — Logo/Brand never edits store data.

# Store logos — the one doc (read this first)

Canonical doc for **retail-chain store logos**: where they live, how every surface is
supposed to render them, how to add or fix one, and **how they're actually processed**
(removing white, sourcing the real logo, etc.). If you touch logos anywhere — consumer
site, admin, store data, or the asset files — start here.

> Not this doc: `brands.ts` / `/logos/<brand>.png` are the **product-brand** logos for the
> white-label sites (PokéCheck, Topps, One Piece, NeeDoh). Different system. This doc is only
> the **retail-store chain** logos at `/logos/chains/`.

---

## 1. The source of truth (the whole point)

There is **one** source of truth and nothing may hardcode or duplicate a logo:

- **Files:** `public/logos/chains/<slug>.png` — one transparent PNG per chain.
- **Metadata:** `public/logos/chains/_meta.json` — per file `{ "w": 0|1, "d": 0|1 }`
  (`w:1` = wide wordmark, `d:1` = needs a light plate). 
- **Resolver:** `chainLogoInfo(name)` in `src/server.ts` maps a store/chain **name → logo file**
  and returns `{ url, wide, dark }`.
- **Live tracker:** `public/logos/chains/STATUS.md` (which chains are done/approved).
- **Design rules for an asset:** `public/logos/chains/README.md` (the 8 rules + new-store steps).

**Rule:** every surface asks the server for the logo by store/chain — it never embeds its own
copy. Add or fix a logo in exactly one place (the file + `_meta.json`) and it propagates.

---

## 2. How a surface is supposed to get a logo (the contract)

The resolver is denormalized onto every store by three endpoints — each store object carries
`logoUrl` / `logoWide` / `logoDark`:

| Endpoint | Feeds | `server.ts` |
|---|---|---|
| `/pub/stores` | consumer list + the admin's logo loader | ~`:660` |
| `/pub/stores/near` | consumer "near me" list | ~`:724` |
| `/app/history` | consumer "recent calls" / results | ~`:1614` |

`/logo-wall` (`server.ts` ~`:576`) renders the **entire** registry at once. It is a **QA page
only** — **never fetch it from an app**; it is not a data source.

**Render contract for any surface:** read the store's `logoUrl`. If present → `<img src=logoUrl>`
(respect `logoWide`/`logoDark` for sizing/plate). If absent → the shared **text wordmark**
fallback (`storeWordmark` on the consumer site), *not* a bespoke icon.

### Who pulls from it today
| Surface | Pulls from source of truth? | How |
|---|---|---|
| Consumer site (list, near-me, results) | ✅ | `checkit.html` → `logoUrl`, else `storeWordmark` |
| Logo wall (`/logo-wall`) | ✅ | renders the registry (QA only) |
| **Admin** (`app.html`) | ❌ **not yet** | see §5 |

---

## 3. Performance rules (the source of truth must NOT slow anything down)

The registry is authoritative, but surfaces must stay fast:

1. **Per-store URL only — never bulk-load.** A surface loads the logos for the rows it's
   actually showing, via the per-store `logoUrl`. No surface renders the whole logo wall.
2. **Lazy-load images:** `<img loading="lazy" decoding="async">` so off-screen rows don't fetch
   until scrolled into view.
3. **Logos are static PNGs** served with cache headers + a `?v=N` cache-bust (bumped in
   `chainLogoInfo` when an asset changes). The browser/CDN caches them after first paint.
4. **The name→file resolve is already cached** server-side (~60s) and attached per-store, so
   there is no per-logo recompute at render time.
5. **Keep images as static files. Do NOT store image blobs in a database** — that's slower, not
   faster. If we ever want to skip even the request-time resolve at scale, denormalize just the
   **pointer** (resolved filename + `w`/`d` flags) onto the chain record in the DB at
   import/write time and read that column in `/pub/stores`. The files stay the source of truth;
   the DB only caches the pointer — it never becomes a second source.

---

## 4. What a good logo asset looks like (summary)

Full rules + the step-by-step for a new chain live in `public/logos/chains/README.md`. In short:

1. **Use the REAL logo** (official vector / app icon / owner file) — never a made-up font.
2. **Mark-only** when a brand has an icon (CVS heart, Best Buy tag, Burlington heart-B…); drop
   taglines ("Sporting Goods", "Hardware", "Farm & Fleet"…).
3. **No white** — no white background, **no white box/border**, and no white inside letter holes.
4. **No boxes** unless the box truly *is* the brand (Best Buy tag, Aldi/Dick's storefront block).
5. **Long mark-less names → two balanced lines** of their real lettering.
6. **Readable on the dark grey** — keep brand color, lighten it if it's too dark.
7. **Uniform size**, fill the tile, but margin so nothing clips/cuts off.
8. **Verify at the true 46px tile size** (use `/logo-wall`), not a blown-up preview.

---

## 5. Admin: render the real logos (current gap + the task)

The admin is the only surface not showing real logos, and it's a near-miss:

- `loadLogos()` already pulls `/pub/stores` into a `LOGOS` map (`app.html:1296`, runs at startup).
- `storeTile(id,name)` (`app.html:1298`) already renders the real logo — **but nothing calls it**
  (dead code; `LOGOS` ends up unused).
- The store rows (`app.html:1491`) render the store **name as text** + a generic **type icon**
  (`storeTypeIco()` → `cart`/`box`/`store`). Phone Trees / Mute / Statuses / Voice lists
  (`app.html:1590`) render **names only**.

**Task (client-only, contained to `app.html`):**
1. Render the leading visual via **`storeTile(id, name)`** in every section that lists a store or
   chain (store list, Phone Trees, Mute, Statuses, Voice pickers) — not the generic type icon.
2. Keep the `cart/box/store` chip only as a small secondary label if useful; the **logo** leads.
3. Make the no-logo fallback match the consumer's text wordmark, not the 2-letter monogram.
4. Honor the **performance rules** in §3 (lazy `<img>`, only on-screen rows, no bulk load).

**Acceptance:** a chain that has a logo file shows that exact logo in the consumer list, the logo
wall, **and** every admin section that lists it — and the admin still scrolls smoothly.

---

## 6. How logos are actually processed (and why "remove the white border" is NOT a render fix)

A white border/background is **baked into the PNG pixels**. You **cannot** strip it in CSS/HTML at
render time — the admin/consumer just draws the file as-is. Fixing it means **reprocessing the
asset file** and replacing it in `public/logos/chains/`. This is the **logo-asset lane's job**, not
the admin's. If a logo has a white border, the admin should file it to the asset owner, not try to
fix it in the UI.

**The pipeline (run offline on the file, in a scratch dir — not committed):**

- **Tooling:** [`sharp`](https://sharp.pixelplumbing.com/) (Node image lib) — or ImageMagick. Work
  in a scratch folder (e.g. `/tmp/markwork/`), never in the repo, then copy the final PNG in.
- **Remove a white background/border:** make white pixels transparent.
  - *Outer white only (keeps white inside letters):* **flood-fill from the image borders**, turning
    connected near-white pixels (`min(R,G,B) > ~205`) to alpha 0. Stops at the colored logo edge.
  - *Colored wordmark with white in the letter holes too:* **global near-white removal**
    (any pixel `min(R,G,B) > ~205` → alpha 0).
- **Trim** to the alpha bounding box, then add a small uniform margin (so nothing clips on the tile's
  rounded corners), and resize onto a clean canvas.
- **Recolor / lighten** if the brand color is too dark on the grey (sample the hex, blend toward white).
- **Source a clean original** when the existing asset is low-res: official **vector** (Wikimedia
  Commons SVG, rendered at high density with `sharp`) or the **app icon**
  (iTunes Search API → `artworkUrl512`), then strip white + trim as above.
- **Ship it:** save `<slug>.png`, set/confirm `_meta.json` (`w`/`d`), **bump the `?v=` cache** in
  `chainLogoInfo`, push to the deploy branch, and QA on `/logo-wall` at true tile size.

Removing white is image processing on the asset, full stop — there is no render-time toggle for it.

---

## 7. File map
- `public/logos/chains/<slug>.png` — the logo assets (source of truth).
- `public/logos/chains/_meta.json` — per-file wide/plate flags.
- `public/logos/chains/README.md` — asset design rules + new-store steps (detail).
- `public/logos/chains/STATUS.md` — which chains are done/approved.
- `src/server.ts` — `chainLogoInfo()`, `/pub/stores*`, `/app/history`, `/logo-wall`, the `?v=` cache.
- `public/checkit.html` — consumer render (`logoUrl` else `storeWordmark`).
- `public/app.html` — admin (`loadLogos`/`LOGOS`/`storeTile` — see §5).

# Chain Logo Playbook — design rules + new-store process

How chain logos are made for the store list / wall. Assets live at
`voice-caller/public/logos/chains/<slug>.png` (transparent PNG) + `_meta.json`
(`{w,d}` per file: `w:1` = wide wordmark, `d:1` = needs a light plate — rarely used).
They render on the consumer list, admin, and `/logo-wall` from these exact files.

Page background is **dark grey** (the tile ≈ `#191920`). The store-list tile is
**46px**, logo renders at **42px** inside it.

---

## Design rules (distilled from owner feedback)

**1. Use the REAL logo — never make one up.**
- Use their actual asset: the official **app-icon** (Apple iTunes Search API →
  `artworkUrl512`) or a file the owner sends. Attached files can be read off disk
  with a shell tool even when too large to preview — pull the real file.
- If you genuinely can't get the asset, **ask** — don't render your own font version.
- Use their real lettering / font / color. Don't substitute a generic font.

**2. Mark over wordmark — and mark ONLY (no words).**
- If the brand has a recognizable icon, use **only** the mark: Burlington = the
  heart-B · Best Buy = the yellow tag · CVS = the heart (not "CVS"/"CVS Health") ·
  Family Dollar = the family-circle · QFC = the Q-with-crown · Marshalls/Menards = "M".
- Drop sub-text & taglines: "Hardware" (Ace) · "Sporting Goods" (Dunham's) ·
  "Farm & Fleet" (Blain's) · "computers & electronics" (Micro Center) ·
  "OfficeMax" (Office Depot) · the shopping cart (Kroger).

**3. No white — anywhere.**
- No white background and **no white box** behind a logo. Everything is transparent
  on the grey page.
- Remove white **inside** letters too (the holes/counters), not just the outer bg.
  (TJ Maxx, Vons, Meijer, Acme, Gelson's, Shaw's, Randalls all had this.)

**4. No boxes unless the box IS the brand.**
- Marks float directly on the grey. A rounded colored chip is a last resort, only
  when the symbol is light AND the color is core identity — and even then, prefer floating.

**5. Long, mark-less names → their real lettering on two balanced lines.**
- Short name → one line. Use THEIR letters, not a made-up render where possible
  (split the real wordmark at the word gap).
- Custom layouts the owner has set: **B&N** = light-gray "B"/"N" + **gold "&"**, no box ·
  **Food 4 Less** = FOOD/LESS stacked with the **4 to the right** · **HomeGoods** = keep
  the roof over the words · **H Mart** = "H" above "MART".

**6. Readable on dark = right color.**
- Keep the brand color, but if it's dark/low-contrast on the grey, **sample the exact
  hex and lighten it** until it reads (e.g., Ross blue `#0f7fca` → `#74b5e0`).
- Light/white marks are fine as-is. Lighten dark ones (Gelson's, Marshalls, Randalls,
  Kohl's, Tom Thumb).

**7. Uniform size, big, no clipping, no cut-offs.**
- Every logo the **same size** (normalize to the same fill on a 256 canvas, centered).
- Fill the tile — don't leave the mark tiny in the middle — but keep a small margin so
  nothing clips on the rounded corners or cuts a letter off.

**8. Verify at the TRUE render size.**
- Always check at the real 46px-tile size, not a blown-up contact sheet (that mistake
  hid how small things actually were).

---

## Steps when a new store/chain comes in

1. **Name → slug** — exact chain name from Data Dev → `chainSlug()`. If a logo won't
   resolve, request the name/slug fix from Data Dev (never edit store data here).
2. **Source the real logo** — official app icon (iTunes Search API) or an owner file.
   Never a self-rendered font.
3. **Pick the treatment** — mark-only if they have a mark; otherwise their real
   wordmark, split onto two balanced lines if long, one line if short.
4. **Strip all white** — background + letter-holes → transparent PNG (sharp: flood the
   border for white-bg marks, or keep-only-the-colored-ink for colored wordmarks).
5. **Drop taglines / extra words.**
6. **Color/contrast** — keep the brand color; if it's too dark on grey, sample the hex
   and lighten (blend toward white) until readable.
7. **Crop with margin** — never cut off a letter.
8. **Normalize** to the standard size (same fill as every other mark), centered.
9. **Save** `<slug>.png` + set `_meta.json` (`w:0` square / `w:1` wide).
10. **Preview at true render size**, bump the `?v=` cache in `chainLogoInfo`
    (`server.ts`), push to the deploy branch, and QA on `checkitforme.com/logo-wall`.

**Tools:** `sharp` (Node) for all processing; iTunes Search API for app-icon marks;
the file lives in `public/logos/chains/`. Rendering size knobs: `.store .ic` (tile)
and `.store .ic img` in `public/checkit.html`.

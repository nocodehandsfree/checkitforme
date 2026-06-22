# Design — onboarding & handoff

**Read this first if you're doing any design/brand work (incl. building the style guide).**
It maps every visual asset in the repo so you never hunt for a logo, image, or icon.

---

## 0. Brand source of truth
- **`docs/brand/`** — the brand pack:
  - `CHECK_BRAND_STYLE_GUIDE.md` — the approved brand mark spec (mark geometry, colors, glow, clear space, do/don't). **This is canonical.**
  - `check-brandmark.svg` — the vector mark.
  - `checkbrandpack.zip` — full export pack (transparent PNGs 16→2048 in `png/`).
- **Brand name:** Check (consumer site = checkitforme.com).
- **Mark:** circular green checkmark used as the **C** in "Check".
- **Colors:** primary `#4CF286` · highlight `#75F18F` · glow `#19B145` · dark bg `#08090D`.

> The old `docs/business/BRAND.md` was removed — `docs/brand/CHECK_BRAND_STYLE_GUIDE.md` replaces it.

---

## 1. Where every visual asset lives (all under `voice-caller/`)

| Asset | Location |
|---|---|
| **Brand marks (live)** | `public/logos/` → `check-brandmark.svg`, `check-icon.png`, `check-mark.png`, `check.png`, `checkitforme.png`, `fcheck.png` |
| **Brand PNG exports** | `public/logos/brand/` (1024, 2048) + full set in `docs/brand/checkbrandpack.zip` |
| **Vertical / product brand logos** | `public/logos/` → `needoh.png`, `onepiece.png`, `topps.png`, `fungibles*.png` |
| **Store / chain logos (~94)** | `public/logos/chains/` — one file per chain (png/webp/svg); `_meta.json` maps slugs |
| **Product / OG / social images** | `public/og/` → `poke.png` (Pokémon), `onepiece.png`, `topps.png`, `needoh.png`, `runner.png` |
| **Lucide icons** | Used by **name** in `public/app.html` (admin) — sourced from the Lucide library, **not** stored as files. Search `lucide` in `app.html` for the set in use. |

## 2. Where the design *renders*
| Surface | File / URL |
|---|---|
| Consumer site | `public/checkit.html` → checkitforme.com |
| Admin dashboard | `public/app.html` → caller.fungibles.com / admin.checkitforme.com |
| Live style guide page | `public/style.html` → style.fungibles.com |
| Status / system pages | `public/status.html`, `public/system.html` |

## 3. Existing style/visual docs
- `docs/design/ADMIN_STYLE_GUIDE.md` — admin UI patterns.
- `docs/design/FONT_STYLE_GUIDE.md` — typography.
- `docs/design/LOGO_RENDERING.md` → points to `docs/STORE_LOGOS.md`.
- `docs/STORE_LOGOS.md` — how chain logos are produced & rendered (data-dev owns the assets).

---

## 4. Your task (style-guide build)
1. Use `docs/brand/CHECK_BRAND_STYLE_GUIDE.md` as the brand foundation; pull live colors/components from `public/style.html`, `checkit.html`, `app.html`.
2. Produce the **full style guide** (brand mark, color system, typography, components/buttons/cards, status pills, store-logo treatment, icon usage).
3. Put the deliverable in **`docs/design/`** (e.g. `STYLE_GUIDE.md` + any assets).
4. **Update this handoff doc** with a link to the finished guide + anything you reorganized.
5. **The owner must approve the guide before it's final** — do not mark it done until approved.

---

_Last updated: brand pack added to `docs/brand/`; design docs consolidated under `docs/design/`._

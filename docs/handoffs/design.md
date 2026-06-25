# Design — onboarding & handoff

**Read this first if you're doing any design/brand work (incl. building the style guide).**
It maps every visual asset in the repo so you never hunt for a logo, image, or icon.

---

## ▶ START HERE (fresh or resumed CD session)
1. **Branch check — you MUST be on `claude/checkitforme-website-takeover-pagiis` (staging).**
   You're on the right branch if `docs/brand/` has files **and** `public/logos/` has 100+ files.
   If `docs/brand/` is empty or you see old logos, you're on `main`/prod — STOP and
   `git checkout claude/checkitforme-website-takeover-pagiis`. (main is stale; never design from it.)
2. **Live render to pull from:** `https://staging.checkitforme.com` — NOT `checkitforme.com` (prod).
3. **The finished style guide lives at → `voice-caller/docs/design/STYLE_GUIDE.md`** (put any image
   assets next to it in `docs/design/`). This is its single home.
   - **Resuming?** If `docs/design/STYLE_GUIDE.md` exists, that's the prior session's work — read it
     and continue from there. If it doesn't exist yet, build it per **§4** below.
4. **Commit + push to the staging branch as you go** — never keep the guide only in chat memory, or
   it's lost when the session ends. Then update §4's link.
5. Owner approves before it's final.

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

## 3. Style/visual docs — READ THE STYLE GUIDE FIRST
- **`docs/design/STYLE_GUIDE.md` — the single visual source of truth (brand mark, color, type,
  components, verdict tones, logo treatment, icons). READ THIS BEFORE DESIGNING.**
  PDF version for sharing: **`docs/design/Check_Style_Guide.pdf`**.
- `docs/design/ADMIN_STYLE_GUIDE.md` — admin UI patterns.
- `docs/design/FONT_STYLE_GUIDE.md` — typography.
- `docs/design/LOGO_RENDERING.md` → points to `docs/STORE_LOGOS.md`.
- `docs/STORE_LOGOS.md` — how chain logos are produced & rendered (data-dev owns the assets).

---

## 4. Style-guide status
**Built ✅ → `docs/design/STYLE_GUIDE.md`** (+ shareable `Check_Style_Guide.pdf`). Covers brand mark,
color system, typography, components/buttons/cards, verdict tones, store-logo treatment, icon usage.

- **⚠️ Pending owner (Fungie) approval — not final yet.**
- **⚠️ Verify-against-live caveat:** the first draft was built from `docs/brand/CHECK_BRAND_STYLE_GUIDE.md`
  + the in-repo `public/checkit.html`/`app.html`, **not** a live fetch of `staging.checkitforme.com`.
  Do one pass against the live staging site before approval in case staging has drifted.
- When you change live styles, update `STYLE_GUIDE.md` to match and **commit** (don't let it drift).

## 5. Style-guide build steps (reference)
1. Use `docs/brand/CHECK_BRAND_STYLE_GUIDE.md` as the brand foundation; pull live colors/components from `public/style.html`, `checkit.html`, `app.html`.
2. Produce the **full style guide** (brand mark, color system, typography, components/buttons/cards, status pills, store-logo treatment, icon usage).
3. Put the deliverable in **`docs/design/`** (e.g. `STYLE_GUIDE.md` + any assets).
4. **Update this handoff doc** with a link to the finished guide + anything you reorganized.
5. **The owner must approve the guide before it's final** — do not mark it done until approved.

---

_Last updated: brand pack added to `docs/brand/`; design docs consolidated under `docs/design/`._

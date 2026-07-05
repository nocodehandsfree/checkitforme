# Check — Style Guide (the one folder)

Everything brand, design, and copy lives here. This is the record of truth. If you're making
anything a customer sees — a screen, a button, a logo, a line of copy — read the relevant file
below and use only what's defined. Never invent colors, fonts, spacing, or voice; if the system
doesn't cover it, propose an addition, don't guess.

Verify visible work on **staging.checkitforme.com** first (staging-first), then promote to prod.

---

## The three guides

| File | Owns | Read it when |
|---|---|---|
| **`BRAND.md`** | The mark, the color palette, the logo pack, the favicon/app-icon. | Placing the logo, picking a green, exporting an icon. |
| **`STYLE_GUIDE.md`** | The look: type scale, color/opacity, spacing, radii, the raised/carved/glass depth system, component patterns (site + admin). | Building or restyling any UI. |
| **`COPY_STYLE_GUIDE.md`** | The voice: the persona, the rules, the spine lines, banned words. | Writing any word a human reads. |

## The comps (the approved picture)

- **`NEW_CHECK_COMPS.html`** — the master design board, self-contained, open in any browser.
- **`NEW_CHECK_COMPS.dc.html`** — the editable source for that board.
- `STYLE_GUIDE.md` is extracted 1:1 from this board. Board and guide must agree.
- Render them offline (CDN is blocked in agent sandboxes): `tsx scripts/render-comps.ts board`.
- `vendor/` — vendored React + fonts so the board renders truthfully offline. Don't delete.

## Raw brand assets (in this folder)

- `check-brandmark.svg` — the vector mark.
- `checkbrandpack.zip` — the full export pack (SVG + PNG 16→2048).

## Where the LIVE served assets are (don't duplicate them here)

These are the files the site actually loads — the source of truth for what ships:

- **Favicon / app icon:** `public/logos/check-icon.png` (linked from `checkit.html` + `app.html`).
- **Brand mark (served):** `public/logos/check-brandmark.svg`
- **PNG exports:** `public/logos/brand/check-brandmark-{1024,2048}.png`

## Not in this folder (on purpose)

- **Retail-chain store logos** (Target, Walmart, …) are a *different* system — the data/ops pipeline
  at `docs/STORE_LOGOS.md` and `public/logos/chains/`. This folder is the **Check** brand only.
- **Approved in-flight copy edits** (`COPY_CHANGES_APPROVED.md`) live on the **prod branch** as
  Website's ship list, not on staging.

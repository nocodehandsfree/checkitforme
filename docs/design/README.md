# design/ — EVERYTHING design: brand, look, comps, copy voice. Nothing design lives anywhere else.
| Where | What |
|---|---|
| `brand/` | **The logo.** Wordmark "Check" = the green ✓ mark as the C + "heck" (the site footer logo). Mark alone: `brand/check-brandmark.svg`. Full export pack: `brand/checkbrandpack.zip`. The favicon (`public/logos/check-icon.png`) is the app icon ONLY — never an in-page logo. Colors + geometry rules: `brand/BRAND.md`. |
| `STYLE_GUIDE.md` | The look: type, color, spacing, raised/carved depth system, components. References the one comp + the copy voice; they reference back. |
| `comps/` | The one approved design board: `NEW_CHECK_COMPS.dc.html` (the visual comp). View: `tsx scripts/render-comps.ts board`. See `comps/README.md`. (The old `NEW_CHECK_COMPS.html` bundle is retired to `docs/archive/`.) |
| `copy/` | `COPY_STYLE_GUIDE.md` — the voice: how we write. Owns every customer-facing string. |

Live-vs-comp proof (screenshots of the shipped `?skin=v2` site next to each spec): `../specs/design-gap/inventory.html`.

Retail-chain store logos (Target, Walmart…) are **store data**, not brand → `docs/data/store-logos.md`.

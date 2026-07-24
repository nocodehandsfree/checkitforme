# design/ — EVERYTHING design: brand, look, comps, copy voice. Nothing design lives anywhere else.
| Where | What |
|---|---|
| `brand/` | **The logo.** Wordmark "Check" = the green ✓ mark as the C + "heck" (the site footer logo). Mark alone: `brand/check-brandmark.svg`. Full export pack: `brand/checkbrandpack.zip`. The favicon (`public/logos/check-icon.png`) is the app icon ONLY — never an in-page logo. Colors + geometry rules: `brand/BRAND.md`. |
| `STYLE_GUIDE.md` | The look: type, color, spacing, raised/carved depth system, components. References the one comp + the copy voice; they reference back. |
| `comps/` | One active board: `ADMIN_COMPS.dc.html` (the admin). **Standing rule: every NEW admin feature is comped in `ADMIN_COMPS.dc.html` first, then built.** The consumer site is FROZEN post-rebuild — its reference is the LIVE SITE, snapshotted in `comps/../truth/`; the old consumer boards (`WEBSITE_COMPS`, `MY_ZONES_COMP`) are retired to `docs/archive/`. See `comps/README.md`. |
| `copy/` | `COPY_STYLE_GUIDE.md` — the voice: how we write. Owns every customer-facing string. |
| `emails/` | Rendered email design mocks (the look). Email **build specs** live in `specs/alerts/`. |

Live-vs-comp proof (screenshots of the shipped site next to each spec): `../specs/design-gap/inventory.html`.

Retail-chain store logos (Target, Walmart…) are **store data**, not brand → `docs/data/store-logos.md`.

---
name: build-on-brand
description: >-
  Load BEFORE building or changing ANYTHING a user sees — the consumer website
  (public/checkit.html), the admin dashboard (public/app.html), transactional or
  alert emails, or the chat/call UI. Triggers on any UI/UX or copy work: new
  screen, component, button, sheet, toast/pill, icon, layout, color, font, or any
  user-facing string (English or Spanish). It routes you to the design + copy
  authorities and the right comp board so you match the system instead of
  freestyling. Not for backend-only or data-only work with no rendered surface.
---

# Build on brand

Nothing visual or written ships without the guides. This skill is a map, not the
content — open the docs it points at; they are the single source of truth.

## 🚫 HARD GATE — THE LIVE SITE IS THE RECORD OF TRUTH (owner, 2026-08-05)
**Render the page you are about to change and LOOK at it. Match that.** The comps drifted from what
the sites actually render, so a comp is no longer the reference for a screen that already exists —
the owner ruled this after an agent built off the live Admin because the comp was wrong.

- **A page that already exists (consumer site OR Admin)** → render the REAL page and copy it. Boot
  the local server and `./node_modules/.bin/tsx scripts/render-comps.ts url <local url> <name>`, or
  for the frozen consumer pages use the snapshots in `docs/design/truth/*.html`. Open the image.
- **A screen that does NOT exist yet** → that is the only case a comp is the reference. Admin board:
  `render-comps.ts board`, then OPEN the PNGs in `loops/site-redesign/render/board-*.png`.
- **The edit gate enforces looking:** an Edit to `public/app.html` is BLOCKED until a real render has
  run (it writes `.claude/state/comp-rendered`). Never touch that file by hand — run the render.

Either way it is a PICTURE, not text: a text search comes back nearly empty, and trusting that
emptiness is exactly how off-brand screens keep shipping (2026-07-02 paint-not-structure; the
2026-07-18 landing cycle; the zones report). For every piece on your screen, name what you are
copying from the image. Can't see it there? You're inventing — STOP.

## Read first, in this order (don't skip)
1. **`docs/design/STYLE_GUIDE.md`** — the look: every token, type size, radius, depth, component rule.
2. **`docs/design/copy/COPY_STYLE_GUIDE.md`** — the words. Owns EVERY customer-facing string. On any
   wording conflict, the copy guide wins over a comp.
3. **The matching reference** (`docs/design/comps/`, see its `README.md`):
   - Website / `public/checkit.html` → FROZEN post-rebuild; reference is the LIVE SITE, snapshotted in `docs/design/truth/`
   - Admin / `public/app.html` → **`ADMIN_COMPS.dc.html`**
4. **`docs/design/brand/BRAND.md`** — logo, brandmark, colors/geometry. **`docs/design/emails/`** for
   email mocks (email must be TABLE HTML + inline styles — flex/grid never render in mail).

## Non-negotiables
- **Match the guide, don't freestyle.** The guide beats what's currently in the code. Think the guide
  is wrong? Flag it, don't invent. NEVER re-introduce a reverted design.
- **A live page the owner has personally shaped BEATS an older comp** (owner, 07-30 — sub-lines were
  re-added to a deliberately stripped dashboard because a board still showed them). When the live
  page and the board disagree, ask in one line; never treat the older drawing as an order.
- **Use the existing icons/components.** No invented tokens, colors, sizes, or spacing —
  `scripts/qa-design.ts` (in `bash scripts/test-all.sh`) fails on off-system values and banned terms.
- **Copy laws (from CLAUDE.md — memorize):** no dashes inside a sentence · no bad line wraps · **every
  string ships its Spanish in the SAME commit**, length-checked so it can't break layout · bottom
  notifications = ONE line, GRAY pill, never green, both languages.
- **Admin has its own grammar:** five page types (LIVE · REPORT · LOG · CRUD · CONSOLE) + one report
  grammar (range · hero · wells · one list · footnote). Build a new admin section by picking a page
  type, not inventing a layout. **Every NEW admin feature gets comped in `ADMIN_COMPS.dc.html` FIRST,
  then built** (owner standing rule). The consumer site is frozen — match the live-site truth snapshot, not a board.

## Drift-prone facts (recheck, don't trust this line)
- Comp filenames + boards: `ls docs/design/comps/` (post-rebuild: `ADMIN_COMPS` is the one active board
  + `vendor/`; the old consumer boards `WEBSITE_COMPS`/`MY_ZONES_COMP` are in `docs/archive/`).
- Admin copy has its own guide now: `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`. Recheck: `ls docs/design/copy/`.
- The redesign ("v2") is now the unconditional render — there is no `?skin=` preview gate anymore
  (full list: `docs/shared/GOTCHAS.md`). Recheck: `grep -n "data-skin" public/checkit.html`.

When done, verify on staging like a real user and report per the `ship-it` skill.

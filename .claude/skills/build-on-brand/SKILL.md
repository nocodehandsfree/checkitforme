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

## 🚫 HARD GATE — RENDER the comp and LOOK before you write one line of UI
**A comp is a rendered picture, not text. You cannot grep it, skim it, or read the style guide's
written list instead.** A text search of a comp file comes back nearly empty — and letting that
emptiness convince you "there's no comp for this" is EXACTLY how off-brand screens keep shipping
(2026-07-02 paint-not-structure; the 2026-07-18 landing cycle; the zones report). Render it to an
image and open the image. One command; it removes every excuse:

- **Website / consumer pages** → `./node_modules/.bin/tsx scripts/render-comps.ts board`
  then OPEN the PNGs in `loops/site-redesign/render/board-*.png`.
- **Admin pages** → `node scripts/admin-preview.mjs <section> out.png 390`, then open the PNG.
- **My Zones / zone-report flow** → boot the local server, then `node scripts/zones-preview.mjs`
  (usage in the script header) → open `shots/*.png`.

Then, for every piece on your screen, name which comp element you're copying from the rendered
image. Can't see it there? You're inventing — STOP. Rendering takes one command; guessing costs a
whole cycle of the owner's money. "The written list was enough" and "grep came back empty" are the
two lies that failed — never trust either. Render, and look.

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
  (see the `known-problems` skill). Recheck: `grep -n "data-skin" public/checkit.html`.

When done, verify on staging like a real user and report per the `ship-it` skill.

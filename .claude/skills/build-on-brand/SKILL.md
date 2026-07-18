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

## 🚫 HARD GATE — do this BEFORE you write one line of UI
**Open the comp file and name the element you are lifting.** Not the style guide's written
component list — the actual comp (`WEBSITE_COMPS.dc.html` / `ADMIN_COMPS.dc.html`). The guides are
PROSE DESCRIBING the comps; the comp is the source of truth. Building from the prose is exactly how
you invent a button, badge, or font that doesn't exist and ship a page that looks nothing like the
site (it happened — a whole landing-page cycle wasted, 2026-07-18).

Before coding, for every piece on your screen, answer: **"which comp element is this, and did I open
the file and copy it?"** Can't point to the comp element? You're inventing — STOP and open the file.
"The written list was enough" is the exact lie that failed. It is never enough. Open the comp.

## Read first, in this order (don't skip)
1. **`docs/design/STYLE_GUIDE.md`** — the look: every token, type size, radius, depth, component rule.
2. **`docs/design/copy/COPY_STYLE_GUIDE.md`** — the words. Owns EVERY customer-facing string. On any
   wording conflict, the copy guide wins over a comp.
3. **The matching comp board** (`docs/design/comps/`, see its `README.md`):
   - Website / `public/checkit.html` → **`WEBSITE_COMPS.dc.html`**
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
  then built** (owner standing rule). Same for the site + `WEBSITE_COMPS.dc.html`.

## Drift-prone facts (recheck, don't trust this line)
- Comp filenames + boards: `ls docs/design/comps/` (as of 2026-07-11: WEBSITE_COMPS, ADMIN_COMPS,
  MY_ZONES_COMP + vendor/).
- There is **no** `COPY_STYLE_GUIDE_ADMIN.md` yet — admin copy follows the main copy guide until Copy
  writes it. Recheck: `ls docs/design/copy/`.
- The redesign ("v2") is now the unconditional render — there is no `?skin=` preview gate anymore
  (see the `known-problems` skill). Recheck: `grep -n "data-skin" public/checkit.html`.

When done, verify on staging like a real user and report per the `ship-it` skill.

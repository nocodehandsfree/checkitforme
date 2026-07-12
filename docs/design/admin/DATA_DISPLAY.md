# Admin data-display system — how dense data gets laid out (2026-07-12)

The comps define the LOOK. This doc defines the METHOD for laying out real, dense, API-fed data
on every Admin page — including pages the comps never covered. When a comp exists, the comp wins
the look and this doc wins the data layout. When no comp exists, this doc IS the spec.
Words/typography: `docs/design/copy/` (admin copy guide). Tokens/colors: `docs/design/STYLE_GUIDE.md`.

## 1. Every page is ONE archetype — classify before you build
- **Dashboard** — a few numbers that answer "is it healthy? what needs me?" Tiles carry DATA
  (a number, a state, a delta). A tile that only links somewhere already on the nav is BANNED —
  delete it, the nav is the link. (The God View "Calc" square is the named example.)
- **List/Registry** (stores, chains, users, mapped trees) — many rows, each row = one entity +
  status badges. The row answers "which one do I care about?"; everything else lives in the sheet.
- **Log/Feed** (calls, tickets, events) — time-ordered rows, newest first, day-grouped.
- **Detail sheet** (one store / one call / one user) — opened FROM a list or log; all depth here:
  full fields, transcript, actions. Every sheet dismisses obviously (grabber + swipe + scrim tap).
- **Editor/CRUD** (plans, copy, workflows, settings) — form fields + explicit Save per block,
  current value always visible, sync state shown.
- **Report** (calc, costs, coverage) — read-only numbers with comparisons; no actions mixed in.
A page trying to be two archetypes gets SPLIT (summary tiles on top may crown a list/log — that
is the only sanctioned mix).

## 2. The row contract (lists + logs, the 90% case)
- Mobile-first: one row = ONE line if it fits, two max. Lead visual (logo/icon) → primary name →
  1-3 badges → ONE right-aligned fact (the sortable one: date, count, seconds). Everything else →
  the detail sheet. NEVER stack 4+ facts into a row.
- Badges are the vocabulary for states (muted, reliable, mapped, direct…): one shape, filled from
  the color roles below, max 3 per row; more states than 3 → the sheet shows the rest.
- Numbers right-align in columns; dates are relative ("3h ago") in rows, absolute in sheets.
- Empty state = one gray sentence + the one action that fills it. Loading = skeleton rows, no spinners.

## 3. Component uniformity — one of each, ever
ONE dropdown, ONE radio/segment control, ONE toggle, ONE text field, ONE button set (primary/
ghost/danger), ONE tile, ONE badge, ONE sheet, ONE table/row kit — defined once as CSS classes at
the top of app.html and REUSED. Building a page never means styling a new control; if a page needs
a control that doesn't exist, add it to the kit first (one place), then use it. Same paddings, same
radii, same font sizes everywhere — a dropdown on Plans and a dropdown on Chains must be pixel-identical.

## 4. Type + color discipline
- Type scale: exactly 4 sizes (page title / section head / body / meta) from the admin copy guide.
  If a size isn't one of the 4, it's wrong.
- Color = MEANING, never decoration: green = good/live, red = bad/danger, yellow = attention,
  accent = interactive, gray = everything else. A color that isn't carrying one of those meanings
  is gray. Page-specific palettes are BANNED — cohesion comes from boring color use.

## 5. Mobile rules (the owner runs this from a phone)
- Base layout = 390px wide. Wider screens ADD columns; nothing is designed desktop-first.
- No horizontal scroll anywhere, ever. A table that can't fit becomes rows + sheet.
- Tap targets ≥ 44px; sticky elements only the nav; sheets never trap (see archetype rule).

## 6. Gap protocol (pages/elements the comps never designed)
1. Classify the page (§1) and build it FROM THESE RULES with the comp's visual language.
2. If it's genuinely novel (a layout no archetype covers), STOP on that page: write the gap +
   what you need in your checkpoint for CD, and move on. Never improvise a new pattern silently.
3. Keep a running page inventory in your checkpoint: page → archetype → comp? → status.

## Provenance
Owner ruling 2026-07-12 (the night the reskin-only redesign was reverted). Sibling docs:
comps in `docs/design/comps/`, look in `STYLE_GUIDE.md`, words in `copy/`. Re-verify the God View
tile rule and archetype list against the live Admin nav when pages are added.

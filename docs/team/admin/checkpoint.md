# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-17 (frog loop, ongoing) — 47e3a9a + 0cfbf48 live
- Restock = one honest empty state (no zero-well theater) · Store intel sub + coverage paragraph
  folded, "Magic Magic" dupe fixed (prodIcon) · Plans bundles one line, sync pills only when
  pending, compact "● pending" · Policy plans-mirror = one peek row · statuses sheet sub no longer
  parrots the title. Sheets audited: workflow/user/money/status — on scale (20/800 + 12/600).
- Loop armed at 5m per owner; iterating page-by-page under the frog lens until the hour closes.

## 2026-07-17 (cohesion marathon, /loop) — ONE KIT EVERYWHERE (3d2a2b4 + a770427, live)
- Purple chip defaults + hairline outlines purged app-wide: .pill/.chip-sm/.upill/.tag-verified/
  .chip-type = borderless tints · .stat = God-view vital chrome · persona picker chips match ·
  search Filters/multiselects, category chips, day pills, carry rows, chain-sheet keys, mapped
  chips, sticon keys, import textarea, map frame, disclosure keys, ABCD cards, agent chat — all on
  the depth system. Fonts verified: 34 hero · 30 secondary · 22 stat · 20 title (ONE per page;
  designer step label now 17) · 12.5 sub. Only Calc keeps its own look (needs a comp).
- All 22 sections re-rendered + eyeballed · 13/13 drive checks × 3 runs · gates green each ship.

## 2026-07-17 (round four) — CALC FIELDS + iOS TINT POKE + last headers (756c1e0, live)
- **iOS tint fix shipped, needs the owner's phone verdict:** pushState drops Safari's sampled bar
  tint and it never resamples in-page (site lesson 07-14, closeSupport). showSection now fires the
  same poke (re-assert root color + 1px scroll nudge) after every page switch. NOT verified — only
  his phone can.
- Calc: every money field = ONE carved well (border-in-border gone); workbench otherwise untouched
  (owner: fields only — full Calc redesign still needs a comp).
- Kiosk intel / Designer / Categories join title+subhead. All 22 sections now share the format.

## 2026-07-17 rounds two + three (9c3514c, cda51ab): directional copy → died or ⓘ (then owner
reversed ⓘ on headers → subs), info RAISED / forms CARVED, chevrons fixed, testing log icons,
Plans header + single-well fields, queues as rows. Detail: git log.

## 2026-07-17 — four-page polish (086236d): Alerts/Policy/Designer/Feedback rebuilt to grammar,
save pills on every silent toggle, preview-harness stubs added. Detail: git log.

## 2026-07-17 — Testing/Feedback staging source SHIPPED · design audit delivered, awaiting go-ahead
- **Live on THE Admin (ffa130f, verified end to end):** Testing + Feedback carry a "Live site /
  Staging site" k-filter pill. Root cause of "my Fun calls are missing": rehearsal calls + feedback
  taps land in the STAGING service's DB; the Admin reads prod. Staging reads ride the root-domain
  admin cookie (shared SESSION_SECRET) through a CORS gate in server.ts scoped to
  https://admin.checkitforme.com. Review/correct writes hit the source the row came from. Feedback
  badge stays live-only. Staging 401 → inline "sign in on staging once" empty state, never the
  global auth gate.
- **PM note:** the CORS middleware (src/server.ts, ABOVE the /api auth gate) is on staging and rides
  the next promote — a no-op on prod (Admin is same-origin there). Nothing waits on it.
- **Live-listen answered:** owner's phone is in COMP_PHONES → comp accounts ALWAYS get live audio +
  hang-up when signed in; the Policy box only turns it on for every customer. checkit.html:5085.

## 2026-07-16 — EMAIL RENDERING: SOLVED + OWNER SIGNED OFF ("lock it in") — do NOT re-litigate
The laws live as the comment block at the color constants in `src/alerts.ts` — read them before
touching ANY email color. Short version: authored flat-black design; a `u + .body` stylesheet (only
Gmail matches it) swaps `em-*` elements to a light base Gmail auto-darkens. All 6 designs approved;
owner trims shipped; from-name "Check It For Me" live. Full history: git log around 07-16.
- OPEN ASK (no-spend): Gmail avatar brandmark via a Google account for noreply@ (human phone-verify).
- Server-side email changes are STAGING-ONLY until PM's next promote.

### Alert system (reference — src/alerts.ts + calls/notify.ts + calls/service.ts)
Events: restock/auto_check (text|email) · store_added/waitlist/confirm_email (email) · instock_owner.
Body editable in Admin ▸ Alerts ({token} + **bold**, generic across 4 brands). Bilingual via
accounts.language. confirm-gate + HMAC unsubscribe. FROM noreply@ (Brevo id 3).
POST-PROMOTE TODO: re-set owner's email on PROD (/api/admin/users/phone:+13106662331/email).

### ⚠ OWNER'S OPEN ASKS (cross-lane, unfinished)
1. Store LOGOS on the WEBSITE alerts view (Webbie; skipped in email on purpose).
2. Copper: fold tightened restock/auto_check wording into COPY_STYLE_GUIDE.md.
3. Webbie: My Checks email row + alerts slide-up (?alerts=1) + email-edit UI; waitlist signup UI.

### ⚖️ OWNER RULING 07-13 — THE design bar (Admin pages)
Hero answers the page in ONE number/word + honest spark (HIDE until real data — never fake). Color
w/ intent (iOS-Settings: calm rows, ONE tinted icon; vitals ALWAYS colored). Copy = nouns + numbers;
explainers live in the SHEET sub. Page title 20px/800.

### KIT (defined once in app.html <style>; comps ADMIN_COMPS.dc.html)
.peek (+pk-*) · ONE sheet openSheet/closeSheet/sheetFromHolder (website physics) · carved inputs +
selects · ghost = raised key · .k-switch/.k-filter/.k-key/.k-cta/.k-badge/.k-danger · report grammar
.k-range/hero/wells/pills · .k-eyebrow/title/sub/note · .slogo.emboss · srcApi/srcPicker (call-data
source). Harness: `node scripts/admin-preview.mjs <section> out.png 390`. Safari chrome: html bg
#1D1D22 + apple metas + safe-area padding.

### Carried backlog (non-redesign)
- Premium toggle matrix in Plans (backend done, UI missing) — fold into a plans pass.
- Workflows env picker Prod|Staging (comp 1e env track; srcApi + CORS now exist — half the work done).
- Per-customer account view (docs/specs/admin-user-view.md; users sheet can host it).
- test-all: only pre-existing consumer qa-design baseline items are expected fails.

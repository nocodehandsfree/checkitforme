# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-17 — CHAINS PAGE REDESIGNED (e5c4f1d, live)
Full frog pass on the messiest page (comp 2e). Killed the phantom "Could not load" 6-stat wall → one
slim mapped-progress bar ("120 of 131 mapped · 92%", the page's real story, fails silent not red).
Green overload fixed: mapped = quiet gray (norm), UNMAPPED = amber (the exception the operator hunts).
ABCD "how a call flows" demoted from prime top space to a footnote peek at the list bottom. Search up
top, two filter pills one row. Verified: 7/7 chains interactions + gates green. tr_stats→tr_progress;
preview rig stubs /api/admin/trainer/list.

## 2026-07-17 — SLIDE-UP TRANSPARENCY FIX (f7bbe69, live — NEEDS OWNER PHONE VERDICT)
Applied design lane's /sheetpeek variant E (owner-proven on device). The full-screen rgba `.sheet-scrim`
behind every sheet was THE thing killing iOS scroll-edge glass → bars died on any slide-up open, never
recovered without refresh. **Scrim element deleted.** Dim now = `body.sheetopen header/#grpnav/.subnav2/
main{filter:brightness(.45)}` — content darkens, nothing covers the page, root colour never changes.
Tap-outside-close moved to a capture-phase document listener; grabber + swipe-down unchanged; chrome
poke removed (glass never dies now). Verified headless: no scrim in DOM, filter dims/clears, tap-out
closes, tap-in keeps open, root bg constant, 13/13 sheet interactions, gates green.
- **NEXT SURFACE (one-per-push, owner's rule):** `#iconpick` status-icon modal still uses a fixed
  rgba(0,0,0,.62)+blur backdrop (line ~664) — same swap to filter-dim when owner oks this one.

## 2026-07-17 — ADMIN COHESION + FROG PASSES (through 8d477a7, live)
One kit app-wide (borderless-tinted chips / raised stats / carved inputs; purple + hairlines dead),
designed empty states (dashed panel + tinted icon + non-wrapping headline), Plans one-line bundles,
Alerts cut to one screen (chips · ping · 5 message rows · one Sends row→sheet). **Admin now
self-hosts Inter** (was falling back to system font on blocked networks — same bug the site fixed
07-14; preview rig now serves /fonts so renders are truthful). Detail: git log.

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

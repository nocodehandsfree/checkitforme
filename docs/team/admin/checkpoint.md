# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-17 (round three) — ONE LAYOUT LAW, EVERY PAGE (cda51ab, live)
- Owner's rulings baked in: NO tooltips on section headers → title + short sub everywhere · info is
  RAISED, forms are CARVED (k-well now matches God-view .v) · selects show their chevron (pill
  gradient painted OVER the chevron layer — first bg-image is topmost; fixed) · Designer step label
  = the name only (rail is the position).
- Alerts: rollup table killed; send pills Sent/Stubbed/Test honest colors. Testing log: §5.7 icon
  chip right, date+time + Script N meta, yellow letter retired. Plans: hero card → title + sync
  sub + one Publish CTA; priceInput/numInput = ONE carved well (double-chrome + dashed rows gone).
  Chains: count in the sub. Store intel: MSRP coverage moved up into the report block.
- Snapshot sweep of all 22 sections: on-pattern except OUTLIERS for separate sessions —
  (1) **Calc**: own visual language, purple accents, bordered chips, dense workbench → needs a comp;
  (2) **iOS tint on Admin pages**: blind spot, PM wont-fixed the site variant 07-16 (git: tinttest
  1-7, 'Safari never resamples in-page'); needs an owner phone loop, one change per push.
- Gates green · 13/13 drive checks · live sha = tested sha.

## 2026-07-17 (round two) — DIRECTIONAL COPY OFF EVERY PAGE (9c3514c, live)
- Owner's law: data stays on the page, directions become a tap-ⓘ bubble or die. Page subs fold into
  a gray ⓘ on the title (Alerts, Policy, Feedback, Testing, Workflows, Statuses, Chains, Store
  intel, Restock, App, Add, Fun). Chrome notes deleted. Designer step subs + in-step hints ride ⓘ
  (dead elements des_lane_note / sb_delta_hint / rot_script_note removed). Policy queue rows =
  title + count. Fun's second card titled (Charlie). `.goto` was browser-purple outside .drow —
  now a global green rule. Gates green, 13/13 drive checks, live sha matches.
- Pops note: ship-admin.sh's post-deploy `grep grpnav` verify races Cloudflare and cries wolf —
  deploy succeeds (ui-version confirms). Worth a retry loop in the script.

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

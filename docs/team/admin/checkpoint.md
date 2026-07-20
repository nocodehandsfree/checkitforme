# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-19 — KIOSK receipts: full detail + real cadence
- **Root cause (owner: receipts show 1 pack):** parser (src/gmail-receipts.ts) grabbed only the FIRST
  line item; schema stored a single product+total. Fixed: parseReceipt now captures ALL items +
  subtotal/tax/itemCount; kiosk_receipts got items/subtotal/tax/item_count cols (guarded ALTER in
  bootstrap). Admin receipts view (loadReceipts/rcptSheet) lists every pack + subtotal/tax/total.
  Parser test (scripts/test-receipt.ts) 15/15 incl. the owner's 3-item receipt (prices sum to subtotal).
- **Cadence (owner: :03&:33 looks hardcoded):** it was crowd-report-sourced. Owner's real model = anchor
  to the hit minute, every 30 min (5:14 hit → :14 & :44), holds Sun→Sun until restock. Added
  refreshFromHit(txnAt) in Admin, shown on each receipt. Works on existing rows (txnAt already stored).
- **⚠️ PM: promote wanted** — the parser + schema half is server-side (rides the promote train). Admin
  display shipped now and degrades gracefully (old rows show single product; cadence works from txnAt).
  Full item list only appears for NEW receipts parsed AFTER the promote. Historical rows stay 1-item
  (we didn't store raw email). Kiosk-ROW refreshSummary is still crowd-sourced — switching it to
  receipt-derived needs a machine↔kiosk link (data-model follow-up, not done).

## 2026-07-18 — CALC full overhaul + accuracy fix (owner review, SHIPPED to Admin)
Owner tore into the Calc: jargon, missing COGS, numbers that don't line up. Rebuilt, then corrected:
- **⚠️ Charlie has TWO cost components: ElevenLabs voice + Claude Sonnet brain** (src/voice/prompts.ts
  `llm:'claude-sonnet-4-6'`). I WRONGLY dropped the brain line in the first pass (misread owner's "haven't
  paid Anthropic YET" as "no Anthropic cost") — restored it. Do NOT remove it again; owner not billed yet
  (free credits / may pass through the EL invoice) but it's real. calcCompute charlie lane = voice + brain.
  With brain back, a typical Bravo menu call ≈ 5¢ (matches owner's remembered number). Dropped per-call
  "overhead" (folded to monthly COGS). Delta kept (parked; default lane Charlie).
- Claude rate is an ESTIMATE ($0.0002/s); cost doc also cites $0.0004/s — OPEN: confirm vs real EL+Anthropic bill.
- Hero chip was "70s call" (total nav+talk) → now "50s menu + 20s talk" (owner confused it for nav). Inputs cleaned.
- Concurrency 20k→3 assumes calls SPREAD evenly; batched restock alerts spike it. Note added + busy-hour editable.
  OPEN: owner to say if checks fire spread or batched.
- **Real COGS in per-check.** New calcCogs(): Railway/Helicone/TiDB/Twilio-number (editable $/mo card) +
  the ElevenLabs plan fee, summed ÷ month's checks → "Monthly bills" line in the per-check buildup.
- **Jargon killed.** "peak/sustained/burst" → "calls at once, busy hour" + plan chip "runs N at once, up
  to M in a rush". Driven by CHECKS (owner's unit) with revenue shown; busy-hour share + avg call length
  are editable so nothing is a black box. reach default 45→85. CALC.conc = {daysPerMonth,busyHourFrac,avgCallMin}.
- **Margin fix:** margin-per-check now uses all-in perCheck (was raw call), so it matches the hero.
  Plans ROI headers plain (all used / typical); PAYG ROI table added.
- Copy per COPY_STYLE_GUIDE_ADMIN (terse, tooltips gloss jargon, no em-dash prose). tsc + glass + design
  + full test-all green; drove the checks slider 20k→800k (all-in $0.038→$0.036, plan Creator→Scale).
- LESSON: Admin/app.html is MY lane, ships autonomously (merge staging → ship-admin.sh). Don't wait for "ship it".

## 2026-07-17 — DESIGNER polish + GLASS HARDENED (75cbe8c / aea3701, live)
- **Sheet-glass LOCKED:** scripts/qa-admin-glass.mjs asserts all 11 variant-H invariants (in test-all);
  any revert of the tint fails the ship. Variant H = absolute page-layer sheets (iOS glass ghosts rows
  under the bar), owner-verified "works well". Detail: git log + design 07-17c.
- **Designer step 2 (Voice feel):** wrapping sliders → clean rows + green-filled tracks (sbFill). Gates green.

## 2026-07-17 — CHAINS PAGE REDESIGNED (e5c4f1d, live)
Frog pass on comp 2e: phantom "Could not load" wall → one slim mapped-progress bar (fails silent not
red); mapped=gray, UNMAPPED=amber; ABCD demoted to footnote peek; report broken down by store category
(fleet total + per-type bar). Verified + gates green. tr_stats→tr_progress; preview rig stubs by type.

## 2026-07-17 — ADMIN COHESION + FROG PASSES (through 8d477a7, live)
One kit app-wide (borderless-tinted chips / raised stats / carved inputs; purple + hairlines dead),
designed empty states, Plans one-line bundles, Alerts cut to one screen. **Admin self-hosts Inter**
(was falling back to system font on blocked networks; preview rig serves /fonts). Detail: git log.

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

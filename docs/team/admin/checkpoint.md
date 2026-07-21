# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-19 — KIOSK receipts: full detail + real cadence
- **Root cause (owner: receipts show 1 pack):** parser (src/gmail-receipts.ts) grabbed only the FIRST
  line item; schema stored a single product+total. Fixed: parseReceipt now captures ALL items +
  subtotal/tax/itemCount; kiosk_receipts got items/subtotal/tax/item_count cols (guarded ALTER in
  bootstrap). Admin receipts view lists every pack + subtotal/tax/total. Parser test
  (scripts/test-receipt.ts) 15/15 incl. the owner's 3-item receipt.
- **Cadence (owner: :03&:33 looks hardcoded):** real model = anchor to the hit minute, every 30 min
  (5:14 hit → :14 & :44), holds Sun→Sun until restock. refreshFromHit(txnAt) in Admin, shown per receipt.
- **⚠️ PM: promote wanted** — parser + schema half is server-side. Admin display shipped now and
  degrades gracefully (old rows stay 1-item; we didn't store raw email). Kiosk-ROW refreshSummary is
  still crowd-sourced — switching to receipt-derived needs a machine↔kiosk link (follow-up, not done).

## 2026-07-18 — CALC full overhaul + accuracy fix (owner review, SHIPPED to Admin)
- **⚠️ Charlie has TWO cost components: ElevenLabs voice + Claude Sonnet brain** (src/voice/prompts.ts).
  I WRONGLY dropped the brain line once (misread owner's "haven't paid Anthropic YET") — restored.
  Do NOT remove it again; owner not billed yet but it's real. calcCompute charlie lane = voice + brain;
  typical Bravo menu call ≈ 5¢ (matches owner's number). Per-call "overhead" folded into monthly COGS.
- Claude rate is an ESTIMATE ($0.0002/s); cost doc also cites $0.0004/s — OPEN: confirm vs real bill.
- Hero chip "50s menu + 20s talk" (was "70s call", owner confused it for nav). Concurrency 20k→3
  assumes calls SPREAD evenly — OPEN: owner to say if checks fire spread or batched (busy-hour editable).
- **Real COGS in per-check:** calcCogs() = Railway/Helicone/TiDB/Twilio-number (editable $/mo card) +
  EL plan fee, summed ÷ month's checks → "Monthly bills" line. Margin-per-check uses all-in perCheck.
- **Jargon killed** (owner's unit = CHECKS): "runs N at once, up to M in a rush"; busy-hour share +
  avg call length editable. CALC.conc = {daysPerMonth,busyHourFrac,avgCallMin}. reach default 45→85.
- LESSON: Admin/app.html is MY lane, ships autonomously (merge staging → ship-admin.sh). Don't wait
  for "ship it".

## Shipped + verified earlier (detail lives in git log, not here)
- **07-17 Sheet-glass LOCKED:** qa-admin-glass.mjs asserts all 11 variant-H invariants (in test-all);
  any revert of the tint fails the ship.
- **07-17 Chains page redesigned** (comp 2e: mapped-progress bar, UNMAPPED amber, per-type report).
- **07-17 Admin cohesion pass** (one kit app-wide; Admin self-hosts Inter — was falling back on
  blocked networks).
- **07-17 Testing/Feedback "Live / Staging site" filter pill** (Fun calls land in staging's DB;
  staging reads ride the root-domain admin cookie through a CORS gate in server.ts).
- **07-16 EMAIL RENDERING SOLVED + owner signed off — do NOT re-litigate.** Laws live in the comment
  block at the color constants in `src/alerts.ts` — read before touching ANY email color.

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
.k-range/hero/wells/pills · .k-eyebrow/title/sub/note · .slogo.emboss · srcApi/srcPicker. Harness:
`node scripts/admin-preview.mjs <section> out.png 390`. Safari chrome: html bg #1D1D22 + apple metas.

### Carried backlog (non-redesign)
- Premium toggle matrix in Plans (backend done, UI missing) — fold into a plans pass.
- Workflows env picker Prod|Staging (comp 1e env track; srcApi + CORS exist — half done).
- Per-customer account view (docs/specs/admin-user-view.md; users sheet can host it).

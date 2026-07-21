# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** `public/app.html` — THE one Admin (reads live PROD data; edits are LIVE for real
   operations immediately — touch customer-visible data only when the task says so). Admin screens
   ship autonomously: merge staging → `bash scripts/ship-admin.sh` — never wait for a promote.
   Server-side halves ride the promote train: leave `PM: promote wanted` here and move on.
2. The CALLING ENGINE (`src/voice/`) is FROZEN — machine-blocked. Store call-settings (mute/method/
   recipes) change only through the existing guarded endpoints with the reason stamped — never a new
   writer, never force past the mapped-chain flip-guard without a PM/owner box.
3. **ADDITIVE:** build from the KIT (defined once in app.html) — pick one of the five page types
   (LIVE · REPORT · LOG · CRUD · CONSOLE), comp FIRST on `ADMIN_COMPS.dc.html`, copy per
   `COPY_STYLE_GUIDE_ADMIN.md`, the 07-13 design-bar ruling governs every page.
4. **Done** = drive it (`node scripts/admin-preview.mjs <section>`) + `qa-admin-glass` stays green
   (the sheet recipe is pinned — never revert it) + push + ship-admin + Done Report (Built/Drove/Left).
5. Never run the full suite unprompted, never in background.

## 2026-07-19 — ALERTS: every customer message editable + In-stock Admin alert
- Added the messages the owner ALREADY WROTE to Admin ▸ Alerts using the REAL approved copy (grepped,
  not invented): Share·in-stock (share.msg2), Share·referral (ref.msg2), Share·zone (zones.sharemsg2),
  In-stock alert email (approved EMAIL_DESIGN). Same full editor + test-send as every other message.
  Owner ping renamed → "In-stock Admin alert" (Off/Email/Text; "all in-stock alerts system-wide → owner acct").
- Editable NOW w/o a release: defaults baked in AL_DEFAULTS (app.html), overrides read from live
  alerts_json via /api/settings, save PATCHes alerts_json (accepts any key). Ships via ship-admin.
- **⚠️ PM: promote wanted** — SENDS honoring edits + the share-text /api/alerts/test are server-side.
  In-stock email test works now; share-text tests fire post-release. STILL NOT WIRED: the SITE
  (checkit.html tf keys share.msg2/ref.msg2/zones.sharemsg2) + zone render (server.ts) read the
  hardcoded copy, NOT alerts_json — a customer's edit won't show on the site until that's wired.
- launch-gate admin.spec.ts fixed to grouped tabs + markers (tr_stats→tr_progress, +feedback/settings); drove green live.
- 🔴 LESSON: NEVER invent copy. Approved strings already exist in code — grep + reuse. Invented defaults
  twice, owner caught both. Find the real thing before writing anything.

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

## 2026-07-18 — CALC overhaul + accuracy fix (SHIPPED to Admin)
- **⚠️ Charlie has TWO cost components: ElevenLabs voice + Claude Sonnet brain** (src/voice/prompts.ts).
  I WRONGLY dropped the brain once — RESTORED. Do NOT remove again (owner not billed by Anthropic YET
  but it's real). Typical Bravo menu call ≈ 5¢. Claude rate is an ESTIMATE ($0.0002/s; doc also says
  $0.0004/s) — OPEN: confirm vs real bill.
- Real COGS folded into per-check (calcCogs: Railway/Helicone/TiDB/Twilio# + EL plan ÷ checks); jargon
  killed (drives by CHECKS: "runs N at once, up to M in a rush"); reach default 45→85. Concurrency 20k→3
  assumes calls SPREAD — OPEN: owner to say spread vs batched (busy-hour editable).

## Shipped + verified earlier (detail lives in git log, not here)
- **07-17 Sheet-glass LOCKED** (qa-admin-glass: 11 invariants; any tint revert fails the ship) ·
  Chains page redesigned (comp 2e) · Admin cohesion (one kit; self-hosts Inter) · Testing/Feedback
  "Live / Staging" filter pill (Fun calls land in staging's DB; CORS gate in server.ts).
- **07-16 EMAIL RENDERING SOLVED + owner signed off — do NOT re-litigate.** Laws live at the color
  constants in `src/alerts.ts` — read before touching ANY email color.

### Alert system (reference — src/alerts.ts + calls/notify.ts + server.ts)
Sent events (alerts_json, editable): restock/auto_check (text|email) · store_added/waitlist/confirm_email
(email) · instock_owner (email). NEW editable share texts (07-19): instock_share/referral/zone_instock
(sms) — site wiring pending. Bilingual via accounts.language; confirm-gate + HMAC unsubscribe; FROM noreply@.
POST-PROMOTE TODO: re-set owner's email on PROD (/api/admin/users/phone:+13106662331/email).

### ⚠ OWNER'S OPEN ASKS (cross-lane, unfinished)
1. Store LOGOS on the WEBSITE alerts view (Webbie; skipped in email on purpose).
2. Copper: fold tightened restock/auto_check wording into COPY_STYLE_GUIDE.md.
3. Webbie: My Checks email row + alerts slide-up (?alerts=1) + email-edit UI; waitlist signup UI.

### Design bar (07-13 ruling) + KIT
Hero = ONE number/word + honest spark (hide until real data). Color w/ intent; copy = nouns+numbers,
explainers in the SHEET sub; title 20px/800. KIT (app.html <style>; comps ADMIN_COMPS.dc.html): .peek
(+pk-*) · ONE sheet openSheet/closeSheet/sheetFromHolder · carved inputs · ghost=raised key · report
grammar .k-range/hero/wells/pills · .k-eyebrow/title/sub/note · srcApi/srcPicker. html bg #1D1D22.

### Carried backlog
- Premium toggle matrix in Plans (backend done, UI missing). Workflows env picker Prod|Staging (half done).
- Per-customer account view (docs/specs/admin-user-view.md; users sheet can host it).

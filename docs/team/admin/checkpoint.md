# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** `public/app.html` — THE one Admin (reads live PROD data; edits are LIVE for real
   operations immediately — touch customer-visible data only when the task says so). Admin screens
   ship autonomously: merge staging → `bash scripts/ship-admin.sh` — never wait for a promote.
   Server-side halves ride the promote train: leave `PM: promote wanted` here and move on.
2. The CALLING ENGINE (`src/voice/`) is FROZEN — machine-blocked. Store call-settings change only
   through the existing guarded endpoints with the reason stamped — never a new writer.
3. **ADDITIVE:** build from the KIT (defined once in app.html) — pick one of the five page types
   (LIVE · REPORT · LOG · CRUD · CONSOLE), comp FIRST on `ADMIN_COMPS.dc.html`, the 07-13 bar governs.
4. **Done** = drive it (`node scripts/admin-preview.mjs <section>`) + `qa-admin-glass` stays green
   (sheet recipe pinned — never revert) + push + ship-admin + Done Report (Built/Drove/Left).
5. Never run the full suite unprompted, never in background.
6. **ANSWER-FIRST means ANSWER — do NOT build until told.** Owner says "answer first" / asks a
   question = reply and STOP. Building unasked burns his money and he called it out (07-22). Wait.

## 2026-07-22 — Support surface + call-transcript UI (SHIPPED to Admin + PROMOTED to prod)
- Support screen: Live/Staging source picker (srcApi) so staging chats show. Chats list now shows the
  REAL first message (was "(no messages)" — read a field the API doesn't send), a "Check status" label
  when a status-page chat has no typed text, and the account (email/phone) instead of a flat "Guest".
- Mark resolved / Reopen in the chat drawer → new `POST /api/support/chats/:id/status` (green dot).
  Escalated chats stay the ladder's. app.html LIVE via ship-admin; server halves promoted to prod (main).
- Call transcripts (Feedback / Calls / live) now reuse the WEBSITE's `.ctlv2-bub` cards via the shared
  `bubbles()` — CHECK AI green / STAFF gray, full-width. CSS copied verbatim from checkit.html. One
  transcript look everywhere, never a second UI.
- **OPEN — owner decision, NOT built:** hide simulated (`sim_`) poll rows from the Feedback review queue.
  They have no store + no transcript = the "Unknown store / We said — / no transcript" clutter. Awaiting yes/no.
- One REAL Fun-store call transcript looked cut off ("about to call… sit tight" then "…help.") — a call-
  engine capture gap → Echo's frozen lane; flag if owner wants it chased. Not mine.
- Support server work (account/source/pageUrl/checkId stamping) is the Support agent's, already on prod.

## 2026-07-19 — ALERTS editor + KIOSK receipts (shipped; detail in git)
- Every customer message editable in Admin ▸ Alerts (REAL approved copy, grepped not invented); overrides
  live in alerts_json via /api/settings. ⚠️ PM promote note: the SITE still reads hardcoded
  share.msg2/ref.msg2/zones.sharemsg2 — a customer's edit won't show on the site until that's wired (Webbie).
- Kiosk receipts: parseReceipt captures ALL items + subtotal/tax; Admin lists every pack; cadence anchors
  to the hit minute every 30 min. 🔴 LESSON: NEVER invent copy — grep + reuse (owner caught invented defaults twice).

## 2026-07-18 — CALC (shipped)
- Charlie = ElevenLabs voice + Claude Sonnet brain (src/voice/prompts.ts) — do NOT drop the brain again.
  Real COGS folded into per-check. OPEN: confirm the Claude rate vs a real bill; owner to say spread vs batched.

### Reference (read before touching)
- **Alerts** (src/alerts.ts + calls/notify.ts + server.ts): events in alerts_json, bilingual via
  accounts.language, confirm-gate + HMAC unsubscribe, FROM noreply@. Email colors LOCKED — do not re-litigate.
  POST-PROMOTE TODO: re-set owner's email on PROD (/api/admin/users/phone:+13106662331/email).
- **07-17 Sheet-glass LOCKED** (qa-admin-glass: 11 invariants; any tint revert fails the ship).
- **Design bar (07-13) + KIT** (app.html <style>; comps ADMIN_COMPS.dc.html): hero = ONE number/word +
  honest spark; .peek (+pk-*) · ONE sheet openSheet/closeSheet/sheetFromHolder · carved inputs · ghost=raised
  key · report grammar .k-range/hero/wells/pills · .k-eyebrow/title/sub/note · srcApi/srcPicker. html bg #1D1D22.

### ⚠ Owner open asks (cross-lane) + carried backlog
1. Store LOGOS on the WEBSITE alerts view (Webbie). 2. Copper: fold restock/auto_check wording into COPY guide.
3. Webbie: My Checks email row + alerts slide-up (?alerts=1) + email-edit UI; waitlist signup UI.
- Premium toggle matrix in Plans (backend done, UI missing) · Workflows env picker Prod|Staging (half done) ·
  Per-customer account view (docs/specs/admin-user-view.md; users sheet can host it).

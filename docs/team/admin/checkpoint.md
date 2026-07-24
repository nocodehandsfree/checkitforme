# ADMIN — checkpoint (current state)

> System: the one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via
> `bash scripts/ship-admin.sh` (never waits on a promote); server halves ride the promote train.
> Charter + standing rules: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## 2026-07-22 — Support surface + call-transcript UI (SHIPPED to Admin + PROMOTED to prod)
- Support screen: Live/Staging source picker (srcApi) so staging chats show. Chats list shows the REAL
  first message, a "Check status" label when a status-page chat has no typed text, and the account
  (email/phone) instead of a flat "Guest".
- Mark resolved / Reopen in the chat drawer → `POST /api/support/chats/:id/status` (green dot).
- Call transcripts (Feedback / Calls / live) reuse the site's `.ctlv2-bub` cards via shared `bubbles()` —
  CHECK AI green / STAFF gray, full-width, CSS copied verbatim from checkit.html. One transcript look
  everywhere, never a second UI.
- **OPEN — owner decision, NOT built:** hide simulated (`sim_`) poll rows from the Feedback review
  queue (no store + no transcript = clutter). Awaiting yes/no.
- One REAL Fun-store transcript looked cut off ("about to call… sit tight" then "…help.") — a call-engine
  capture gap. Now tracked as the call/log investigation (STATE.md, voice-calls lane).

## 2026-07-19 — Alerts editor + Kiosk receipts (shipped; detail in git)
- Every customer message editable in Admin ▸ Alerts (REAL approved copy, grepped not invented);
  overrides live in `alerts_json` via `/api/settings`. ⚠️ The SITE still reads hardcoded
  share/referral/zones messages — a customer's edit won't show on the site until that's wired (site lane).
- Kiosk receipts: parseReceipt captures ALL items + subtotal/tax; cadence anchors to the hit minute.
- LESSON: NEVER invent copy — grep + reuse (owner caught invented defaults twice).

## Reference (read before touching)
- **Alerts** (src/alerts.ts + calls/notify.ts): events in `alerts_json`, bilingual via
  accounts.language, confirm-gate + HMAC unsubscribe, FROM noreply@. Email colors LOCKED.
  POST-PROMOTE TODO: re-set owner's email on PROD (`/api/admin/users/phone:+13106662331/email`).
- **07-17 Sheet-glass LOCKED** (`qa-admin-glass`: 11 invariants; any tint revert fails the ship).
- **Design bar (07-13) + KIT** (app.html <style>; comps `ADMIN_COMPS.dc.html`): hero = ONE number/word
  + honest spark; `.peek`; ONE sheet openSheet/closeSheet; carved inputs; report grammar `.k-range`/
  hero/wells/pills; `.k-eyebrow`/title/sub/note; srcApi/srcPicker. html bg #1D1D22.

## Open (the Admin cleanup + audit queue is in docs/tasks/INDEX.md)
- 22 page-cleanups (one per Admin page) + the 18 audit findings (wiring/comp/copy/cut) are queued.
  Headline owner-gated fix: one shell-level Live/Staging switch every page honors (`admin-audit-env-switch`).
- Owner open asks: store LOGOS on the site alerts view (site lane) · premium toggle matrix in Plans
  (backend done, UI missing) · per-customer account view (`docs/specs/admin-user-view.md`; users sheet
  can host it) · answer-first means ANSWER — do NOT build until told.

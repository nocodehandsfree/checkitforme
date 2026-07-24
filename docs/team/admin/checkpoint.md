# ADMIN — checkpoint (current state)

> System: the one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via
> `bash scripts/ship-admin.sh` (never waits on a promote); server halves ride the promote train.
> Charter + standing rules: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## 2026-07-23 — Admin design system, TASK 1 (built + shipped to THE Admin preview for owner review)
- SPEC saved: `docs/team/admin/SPEC.md` (six-size type scale + 22-page verdicts; supersedes round-1 CD comps).
- Task 1 in `public/app.html`, ADDITIVE (new `.ds-*` classes + a scoped `.ds`; the 22 pages untouched):
  · Six type classes 28/22/15/14/12 (nothing under 12px) + `.ds-num` mono. Verified EXACT via computed styles.
  · One control set: green pill toggle, `.act`/`.ghost`/`.ds-danger`, 44px inputs w/ caption labels, chips (status + lane), (i) info.
  · Lucide reuses the existing `LUCIDE` set via a new `dsIco()` at 1.75 stroke; added settings-2/workflow/flask-conical/plus-circle.
  · Live/Staging toggle (carved track, STYLE_GUIDE 5.1) wired to the existing `CALL_SRC` read-routing, Live default. Per owner feedback it now shows ONLY inside the preview; the real admin keeps its clock (switch goes global once he blesses it), and it was shrunk.
  · Hidden `/#preview` route (NOT in NAV_GROUPS) now renders the cleaned LIVE page master (SPEC page 1: checks row, four-caller scoreboard, exceptions, funnel, reports) with sample data.
- Proof: Chromium render at iPhone width (normal admin = clock, no switch; preview = Live page + switch); `qa-admin-glass` 11/0; copy-gate clean.
- SHIPPED to THE Admin via ship-admin (override); owner reviews on his phone at `admin.checkitforme.com/#preview`. His real 22 screens are untouched. Also on branch `claude/admin-design-system-spec-mgthjd` + draft PR #91. STOP for his verdict on the Live page before the other 5 masters.
- OWNER-BLESSED the switch global: Live/Staging switch now shows in the header on EVERY page (clock removed), wired to `CALL_SRC` read-routing; the per-page src dropdowns (Users/Feedback/Testing/Chats) are gone (`srcPicker` returns ''). Verified in Chromium: shows + flips on a normal page.
- MAPPING page (Chains) per owner, round 2 (I misread twice first time): picker uses `logoTile` (chains=custom logo, hobby/thrift=type icon) not initials; `.slogo img` now `max-width %` so WIDE wordmarks scale to fit the tile (were cut off with fixed 42/44px in the 38px tile). Added a store-type filter AND KEPT the mapped/unmapped filter (owner meant relabel "Mapped + not"->"All", not delete) + the per-row mapped/unmapped text. Top report = % of stores mapped BY RATING (tier rows), not one number. Feedback nav count badge removed. Verified: real-logo screenshot (wide logos fit), by-rating report + filter in Chromium, qa-glass 11/0. NEXT: same logo fix on the other admin store lists.
- MASTER SWITCH now routes ALL reads: `api()` sends GET to the staging service when CALL_SRC==='staging' (was only the 4 srcApi pages); writes always stay prod. Verified in Chromium (mocked fetch): staging+GET->staging, staging+POST->prod, live+GET->prod. Fixes "switch does nothing on Calls/Restock".
- COPY/ICON/SPACING sweep (whole admin). 6-agent AUDIT found 98; tracked in `docs/team/admin/copy-icon-audit.md`. WAVES 1-3: ~94 applied + shipped (safe copy: dev-speak/dashes/raw values gone, real feature names; icons emoji/unicode/legacy/inline-SVG -> Lucide via dsIco/lucideSvg + an additive `emptyState` lucide flag; safe sub-12px bumps). Wave 3 CRAFTED by a 6-agent workflow with JS-safety guards, applied unique-only, qa-glass 11/0 + smoke clean each wave (2 apostrophe JS breaks from an early bulk pass caught + fixed). REMAINING = 24 bigger reworks in the audit doc's MANUAL section ((i) sheets, GTM 11-name taxonomy collapse, Designer voice-model dropdown, Kiosk raw-JSON gate, Fun/Chains raw-state maps, Add import warning + Spanish). NAV icons stay (owner keeps the nav).

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

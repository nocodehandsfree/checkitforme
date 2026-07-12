# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-11 late session — ADMIN REDESIGN to CD's board (in flight, phases 1-3 SHIPPED to staging)

**The board:** `docs/design/comps/ADMIN_COMPS.dc.html` (landed via owner upload after CD's connector
502'd; sha256-verified against CD's split parts; committed). Five page types: LIVE · REPORT · LOG ·
CRUD · CONSOLE. Standing rule recorded in comps/README + STYLE_GUIDE: comp first, then build.

**Shipped (verified by Playwright screenshots at 390px, admin host, local boot + real API):**
- Phase 1 — skin + shell: raised/carved tokens (#1D1D22 page, raised gradient cards, carved wells,
  key pills, gradient-ring CTA, gray glowing toast pill), brandmark+"heck"+ADMIN header w/ live clock,
  carved group track (active group grows + shows name), raised section pills (active glows green).
- Phase 2 — Live page (board 1b): 3 vitals (Checks today big · Reach 30d · Credits left) + peek rows
  (Money→Calc, pulse, call time+cost, call health, credits w/ bar) + reusable bottom sheet
  (`peekOpen`/`peekClose` moves report bodies in/out so loader ids keep working). Accordions gone.
- Phase 3 — Calls = LOG (board 1c/1d): day groups (Today/Yesterday/weekday), raised rows, status
  chips, SHOW 50 MORE key (floating pager deleted), call sheet w/ verdict glow dot + timeline
  (dialed/reached/verdict from navSeconds/callSeconds) + transcript bubbles + FIX THE VERDICT →
  new `PATCH /api/results/:id/verdict` (validated + tested; sets confirmed + statusKey).
- Sweep: tooltips ⓘ gray not purple; subnav purple → green; goto links green.

**Still open on the redesign (next phases):**
1. Workflows CRUD rows + edit sheet (board 1e/1f) — skin carried the current cards; anatomy not comp yet.
   Env picker Prod|Staging BLOCKED: no cross-env API exists — needs DevOps before it can be honest.
2. Support exact report grammar order (hero → wells → chips → list; current is close).
3. Intel pages (retailers/restock/kiosk) to the REPORT grammar; App settings to CONSOLE toggles.
4. Zones leaves the admin per board section map (~30 refs); engine stays.
5. CD flagged: COPY_STYLE_GUIDE_ADMIN.md doesn't exist — Copper's lane.
- **Drive staging.admin like a user after deploy** (local visual pass done; staging drive pending).

**Test state:** tsc 0 · app.html </script>=2 + node --check OK · qa-round6/qa-gating fail on
pre-session baseline (legacy) · **qa-design (checkit.html token audit) fails on WEBSITE colors —
not admin's diff; Webbie's recent pushes introduced off-system hexes. Flag to Webbie.**

## Earlier 2026-07-11 (same day, shipped + promoted)
- **Delta lane:** all-8-calls-ran-Charlie root cause fixed (bridgeStoreCall lane routing, f61bed2);
  classifier = groq:llama-3.3-70b (free-Gemini 429 was the "unclear" bug); wrapNo clip; deltatap
  audio fork + barge <Stop>; voice tuning both lanes (no dashes spoken, set example, hello nudge,
  restock-day push). **Delta round 2 by owner still owed — reminder armed.** Known edge: barged
  Delta call reopened >15min later shows in_progress (session expired; accepted).
- **Alert emails** rebuilt to Design mock w/ Outlook VML (tests sent; owner must confirm in Outlook).
- **SMS A2P runbook:** set TWILIO_MESSAGING_SERVICE_SID when approval lands → Alerts test →
  Twilio console (30034 = not active yet).
- **Support tab** shipped + promoted; stats read the live backend shape (conversations/tickets/
  byMaxTier/estCostUsd; absent stats hide). Contract: docs/specs/support-agent/admin-panel-contract.md.
- **Owner batch promoted:** logo→God View, Schedules gone, Plans-loading fix (calcRenderPlans shadow),
  hobby/thrift icons match site, GTM restore-bar X (POST /api/gtm/dismiss-defaults).

**OPEN (priority order):**
1. Finish redesign phases above, then drive staging + promote when owner approves the look.
2. Owner: Delta test round 2 (Fun store, staging) → tune from feedback.
3. Owner: confirm alert-email rendering in Outlook.
4. A2P approval day → SMS end-to-end per runbook.
5. Premium toggle matrix in Plans (qa-admin-plans lives here) · per-customer account view (specs) ·
   dashboard hero done via redesign.

**Delegated (track):** Data Dev — null stale avgTreeSeconds on ~30 direct chains. Mapping — 13
"attempted" re-runs. Webbie — qa-design off-system colors in checkit.html. **Do not chase:** owner's
laptop Safari stuck on old staging design (cache).

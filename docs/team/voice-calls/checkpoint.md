# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-26 THE MAP IS VERSIONED KNOWLEDGE (built, tests green, NOT yet driven on a real call)
- `src/calls/mapgraph.ts` + `map-capture.ts` + `sweep.ts`; full story in `04-map-graph.md`.
- Every mapping call writes a VERSION with its evidence; confidence is computed (calls × stores × days
  × agreement × age), never typed. A changed route waits for approval; the same route again just raises
  confidence. Nothing is deleted — replaced versions retire.
- **Steps now fire on the RECORDING they follow** (`afterPrompt`), learned free on the mapping call.
  Learned seconds stay as the floor + backstop, so listening can only delay a step, never lose it.
  Reaches the live call via the route-keyed `stageNavPromptPlan` (the flat "word@seconds" can't carry it).
- **Drift on every real check, $0**: recordings played, when each step fired, clock-fallback used, human
  reached. Drift drops confidence and files a review item with the call attached.
- Boot backfill carries the 87 locked recipes in as version 1 — honestly "observed once"; the 16
  key-hammer routes start ≤30 "needs review" and queue up, as do the 46 unproven directs.
- API: `/api/admin/map/graph` · `/map/chain/:id` · `/map/unknowns` · `/map/version/:id/approve|reject` ·
  `/map/sweep{,/start,/stop,/queue}`. Screens belong to Admin — this side serves data only.
- **BUG FIXED:** `lockRecipeToChain` wrote a bare digit into `dtmfShortcut`; the bridge only understands
  "2@8,2@16" and plays NOTHING without a time — so every chain locked by the mapper/batch pressed
  nothing live (HomeGoods, Big 5, B&N, GameStop, Kohl's, Staples…). Both writers use `recipeToDtmf` now.
  Tests: 43 unit + 35 real-DB e2e + 13 endpoint drives (+ listen-nav 15, bridge 13).
- **NEXT, morning 07-27:** `POST /api/admin/map/sweep/start {maxCalls}` — east→west, budget-capped (250
  calls, ~8.6c each). Prove the 46 directs → unmapped → re-verify; reach a human, hang up, keep the
  perfect recipe. NOT verified: any live call; the queue against real store rows.

## 07-26 THE CALL RECEIPT — LIVE ON STAGING (owner-ordered; runtime spec 02-spec-runtime-echo.md)
- Every bridged call writes a timeline + seconds + cost. `GET /api/calls/:id/receipt` (admin-gated).
  `events.ts` PURE · `cost.ts` in MICRODOLLARS · `receipt-store.ts` the only db file. Table
  `call_events` + roll-ups on `call_results`; `room` is the join key. `docs/specs/call-receipt/README.md`.
- Charlie seconds split talking / listening / DEAD AIR (derived, so the parts can't disagree with the bill).
- **DRIVEN (Fun store, call 191):** 16s call, 13s billed = 0 talking + 6 listening + 6 dead air; 4.0¢.
- **NOT verified live:** post-close db read + verdict line (fix `54130824`) — re-drive one Fun call.
- **FOUND, not built:** admin `/api/call-now` still rides the OLD direct path (no room, no receipt);
  `/pub/check-live` IS covered. Delta re-synthesizes its 10 clips every call (~6.9c) — cache them.

## Voice/tuning + engine state (verified live on staging 07-21/07-24)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register · greet-back HARD RULE · set + package question · restock ask on any
  no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Ringback identified by tone frequencies (Goertzel 350/440/480/620) so the billed agent never opens on
  a ringing line; 6 rings = hang up. Flag `listen_nav` (off|all|chains) = `target,cvs` on staging, PROD
  UNFLAGGED. Old nav lines STILL in `prompts.ts:82-88`.

## OPEN
1. **MONEY (07-24):** Charlie **$0.00183/s** (20s = 3.7c), bills per SECOND and meters SILENCE — only
   CLOSING the socket saves. Twilio WHOLE MINUTES ($0.0140/min); its speech recognition $0.02/15s =
   NEVER on a live check; fork $0.0044/min PER STREAM. Baseline 5.2c; 116 calls → 32 answers. Rates in
   `src/calls/cost.ts`, override via setting `call_rates`.
2. **NEXT BUILD: keep Charlie off the line when no human is talking.** Joins ~17s early on CVS; sits
   through a 25s clerk walk-away; emits EMPTY turns (~12s dead air/call). Muting saves $0; reopening
   orphans the transcript. Stitching is the work — the receipt MEASURES the prize (`avoidableSecs`).
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Delta (`tapedeck.ts`) is NOT vapour: it dials, plays clips, classifies, hands the SAME call to
  Charlie. Shelved only for want of a stop-talking ear — listen-nav's detector is one.
- Owner drive-test on staging still owed; then the Fun hammer-test + a zone sweep on the new nav.

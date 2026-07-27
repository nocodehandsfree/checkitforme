# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## Voice/tuning + engine state (verified live 07-21/07-24)
- Default agent both envs **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register, max one "!" · greet-back HARD RULE · set + package question · restock
  ask on any no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Ringback identified by its published tone frequencies (Goertzel 350/440/480/620, median >= .45) so the
  agent never opens on a ringing line; 6 unanswered rings = hang up.

## 07-26 THE CALL RECEIPT — on staging (owner-ordered; spec `02-spec-runtime-echo.md`)
**Full detail: `docs/specs/call-receipt/README.md`. Read it before touching any of this.**
- Every bridged call writes a timeline + seconds + cost. `GET /api/calls/:id/receipt`. `events.ts` PURE
  · `cost.ts` MICRODOLLARS · `receipt-store.ts` the only db file. `call_events` + roll-up cols on
  `call_results`; **`room` is the join key** — providerCallId gets replaced mid-call.
- **ADDIE'S CONTRACT: EventKind is a CLOSED 16** — finer detail goes in `detail`, never a 17th kind.
  `lane` = the route that ACTUALLY ran. **Unmeasured = NULL, never 0.** Charlie seconds split talking /
  listening / DEAD AIR; dead air DERIVED so parts can't disagree with the bill.
- **NO CONVERSATION AUDIO on any path, ever — transcript only. Menu recordings are separate and fine.**
- **DRIVEN (Fun 191/192):** whole timeline read off DISK with the verdict line; 3 defects caught+fixed.
- **NOT verified live: the Addie rename** (`91450a52`). FIRST THING: one Fun call → confirm
  `live:false`, a `verdict` line, lane `direct`. Rows 191/192 predate it → null cols.
- **FOUND, not built:** admin `/api/call-now` still rides the OLD direct path — no room, no receipt
  (GTM `cheap-lane-wiring`). Every Delta call re-synthesizes its 10 clips (~6.9¢) — cache them → ~$0.

## 07-26 THE MAP IS VERSIONED KNOWLEDGE (built, tests green, NOT driven on a real call yet)
**Full detail: `04-map-graph.md`.** `src/calls/mapgraph.ts` + `map-capture.ts` + `sweep.ts`.
- Every mapping call writes a VERSION with its evidence; confidence is COMPUTED (calls × stores × days
  × agreement × age), never typed. A changed route waits for approval, the same route again only raises
  confidence, replaced versions retire. Backfill carries the 87 locked recipes in as v1 ("observed
  once"); the 16 hammer routes start ≤30 "needs review" and queue up, as do 46 unproven directs.
- **Steps now fire on the RECORDING they follow** (`afterPrompt`), learned free on the mapping call;
  learned seconds stay as floor + backstop, so listening can only delay a step, never lose it.
- **Drift on every real check, $0:** recordings played, when each step fired, clock-fallback used, human
  reached. Drift drops confidence and files a review item with the call attached.
- API for Addie (data only): `/api/admin/map/graph` · `/map/chain/:id` · `/map/unknowns` ·
  `/map/version/:id/approve|reject` · `/map/sweep{,/start,/stop,/queue}`.
- **BUG FIXED:** `lockRecipeToChain` wrote a bare digit into `dtmfShortcut`; the bridge only understands
  "2@8,2@16" and plays NOTHING without a time — every chain locked by the mapper/batch pressed nothing
  live (HomeGoods, Big 5, B&N, GameStop, Kohl's…). Both writers use `recipeToDtmf`. Tests 43 + 35 + 13.

## OPEN (priority order)
0. **MORNING 07-27: `POST /api/admin/map/sweep/start {maxCalls}`** — east→west, capped at 250 calls
   (~8.6c each). Prove the 46 directs → unmapped → re-verify. Reach a human, hang up, keep the perfect
   recipe. NOT verified: any live call on the new map; the queue against real store rows.
1. **MONEY, MEASURED (07-24):** Charlie **$0.00183/s** (20s = 3.7c), billed per SECOND, meters SILENCE —
   only CLOSING the socket saves. Twilio WHOLE MINUTES ($0.0140/min); its speech recognition $0.02/15s =
   NEVER on a live check. Baseline 5.2c; 116 calls → 32 answers. Rates in `src/calls/cost.ts`.
2. **NEXT BUILD: keep Charlie off the line when no human is talking.** Joins ~17s early on CVS; sits
   through a 25s clerk walk-away; emits EMPTY turns (~12s dead air/call, likely the 26% "couldn't tell").
   Muting saves $0 — only CLOSING the socket does, and reopening orphans the transcript. The receipt
   MEASURES the prize (`charlieSilentSeconds`). Then the owner drive-test + a zone sweep on the new nav.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Delta (`tapedeck.ts`) is NOT vapour: it dials, plays clips, classifies, hands the SAME live call to
  Charlie (`deltaBarge`). Shelved only for want of a stop-talking ear — listen-nav's detector is one.

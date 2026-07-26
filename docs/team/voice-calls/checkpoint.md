# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-26 THE MAP IS NOW VERSIONED KNOWLEDGE (built, tests green, NOT yet driven on a real call)
- `src/calls/mapgraph.ts` + `map-capture.ts` + `sweep.ts`; full story in `04-map-graph.md`.
- Every mapping call writes a VERSION with its evidence. Confidence is computed (calls × stores ×
  days × agreement × age), never typed. A new route ≠ auto-live: it waits for approval; the same
  route again just raises confidence. Nothing is deleted — replaced versions retire.
- **Steps now fire on the RECORDING they follow** (`afterPrompt`), learned free on the mapping call.
  Learned seconds stay as the floor + backstop, so listening can only delay a step, never lose it.
- **Drift on every real check, $0**: recordings played, when each step fired, clock-fallback used,
  human reached. Drift drops confidence and files a review item with the call attached.
- Backfill at boot carries today's 87 locked recipes in as version 1 — honestly: "observed once",
  and the 16 key-hammer routes start at ≤30 "needs review" and land in the queue.
- Admin API: `/api/admin/map/graph` · `/map/chain/:id` · `/map/unknowns` · `/map/version/:id/approve`
  · `/map/sweep{,/start,/stop,/queue}`. Screens belong to Admin — this side serves data only.
- **BUG FIXED en route:** `lockRecipeToChain` wrote a bare digit ("4") into `dtmfShortcut`; the live
  bridge only understands "2@8,2@16" and plays NOTHING without a time — so every chain locked by the
  mapper/batch pressed nothing on live checks (HomeGoods, Big 5, B&N, GameStop, Kohl's, Staples,
  Burlington, Family Dollar, Academy, Marshalls…). Both writers now use `recipeToDtmf`.
- Tests: 43 unit + 35 real-DB e2e + 13 endpoint drives; existing listen-nav (15) + bridge (13) green.
  NOT verified: any live phone call, and the sweep queue against real store rows (local DB has none).

## NEXT (the morning of 07-27): the east→west sweep
- `POST /api/admin/map/sweep/start {maxCalls}` — east coast first, budget-capped (default 250 calls,
  ~8.6c each on Twilio speech). Order: prove the 46 "answers directly" chains → unmapped → re-verify.
- Goal per the owner: reach a human, hang up, keep only the perfect recipe. Watch `/map/sweep`.

## 07-25 LISTENING NAV (still the live behaviour, now with the recording plan on top)
- `src/calls/listen-nav.ts`: steps fire when the recording stops talking (burst >=900ms then >=700ms
  pause off the live-listen fork), clock fallback at learned+15s, delivered by Twilio call-update.
  $0 — no STT, no model. Flag = setting `listen_nav` (off | all | chain list). PROD UNFLAGGED.
  DRIVEN 07-25: Target Topanga 2@16s + 2@23s, human 27s. CVS Mulholland no@16s, general@41s, human.

## Voice/tuning state (verified live on staging 07-21 late)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt
  rules verified live: no dashes spoken · greet-back HARD RULE · set + package question · restock ask
  on any no · voicemail status · echo gate 520/150. Shipment TIME capture still NOT live-verified.
- Ringback identified by tone frequencies (Goertzel 350/440/480/620) so the billed agent never opens
  on a ringing line; 6 unanswered rings = hang up.

## MONEY, MEASURED (unchanged)
- Charlie $0.00159/s (20s talk = 3.2c). Twilio bills WHOLE MINUTES ($0.0140/$0.0280/$0.0420). Twilio
  speech recognition $0.02 per 15s (~8.6c/call) — mapping lane only, NEVER on a live check. Baseline
  good check = 4.7c. 116 real-store calls delivered 32 answers = 3.6 paid attempts per answer.
- **Still open (owner spec, not built):** keep Charlie off the line when no human is talking — joins
  ~17s early on CVS, sits through a 25s clerk walk-away, burns a median 27s on unanswered calls, and
  emits empty turns (~12s dead air/call). EL meters SILENCE, so only CLOSING the socket saves money;
  reopening orphans the transcript. Stitching is the work.

## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Map on PROD; learned nav syncs prod→staging every 3 min. Independents/co-ops default DIRECT in code.

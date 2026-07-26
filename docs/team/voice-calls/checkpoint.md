# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## Voice/tuning + engine state (verified live 07-21/07-24)
- Default agent both envs **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register, max one "!" · greet-back HARD RULE · set + package question · restock
  ask on any no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median >= .45) so the agent never opens on a ringing line;
  6 unanswered rings = hang up.

## 07-26 THE CALL RECEIPT — on staging (owner-ordered; spec `02-spec-runtime-echo.md`)
**Full detail: `docs/specs/call-receipt/README.md`. Read it before touching any of this.**
- Every bridged call writes a timeline + seconds + cost. `GET /api/calls/:id/receipt`. `events.ts`
  PURE (sink-registered like tapedeck's finalize) · `cost.ts` MICRODOLLARS · `receipt-store.ts` the
  only db file. `call_events` + roll-up cols on `call_results`; **`room` is the join key** —
  providerCallId gets replaced mid-call.
- **ADDIE'S CONTRACT (07-26 late): EventKind is a CLOSED 16.** Finer detail goes in `detail`, NEVER a
  17th kind. `lane` = the route that ACTUALLY ran (`actualLane()` off what fired), planned lane in the
  `dialed` detail. **Unmeasured = NULL, never 0.** ringSeconds measured DURING billing (toneShare
  >= .45 inbound) — a transferred desk ringing was booked as listening. Charlie seconds split
  talking / listening / DEAD AIR; dead air DERIVED so parts can't disagree with the bill.
- **NO CONVERSATION AUDIO on any path, ever — transcript only. Menu recordings are separate and fine.**
- **DRIVEN (Fun store 191/192):** dial→ring→answered→person→agent joined→voicemail→end, read back off
  DISK with the verdict line. 3 defects the live calls caught+fixed. 63 + 15 + 13 tests green.
- **NOT verified live: the Addie rename** (`91450a52`, deploying at handoff). FIRST THING: one Fun
  call → confirm `live:false`, a `verdict` line, lane `direct`. Rows 191/192 predate it → null cols.
- **FOUND, not built:** `/api/call-now` (admin) still rides the OLD direct path — no room, no receipt
  (GTM `cheap-lane-wiring`); consumer `/pub/check-live` IS covered. Every Delta call re-synthesizes
  its 10 clips (~456 chars ≈ 6.9¢, dearer than a 20s Charlie) — cache the finite set → ~$0.

## OPEN (priority order)
0. **LISTENING NAV LIVE (07-25).** Steps fire when the recording STOPS TALKING (>=900ms burst, >=700ms
   pause off the live fork), eligible learned-12s, clock fallback learned+15s, via Twilio call-update.
   $0 added. Flag `listen_nav` (off|all|chains) covers single + schedules + ZONES from one call site.
   `target,cvs` staging, PROD UNFLAGGED. Old nav lines STILL in `prompts.ts:82-88` + `{{phone_tree}}`.
1. **MONEY, MEASURED (07-24):** Charlie 723 credits/min = **$0.00183/s** ($22/145,094 credits), 20s =
   3.7c, per SECOND, meters SILENCE — only CLOSING the socket saves. Twilio WHOLE MINUTES up
   ($0.0140/min); its speech recognition $0.02/15s = NEVER on a live check; fork $0.0044/min PER STREAM
   (a menu call runs two). Baseline 5.2c. 116 calls → 32 answers = 3.6 attempts/answer. Rates now live
   in `src/calls/cost.ts`, Admin-overridable via setting `call_rates`.
2. Mapper: TARGET DONE (70 stores/24 states; `externalStoreId` >=3000 = no guest-service option, person
   on 3). Time-to-human 30–45s vs navSeconds 16. Chain row UNTOUCHED. Walmart + CVS still to sample.
   `report-target-trees-2026-07-24.md`.
3. **NEXT BUILD: keep Charlie off the line when no human is talking.** Joins ~17s before the CVS human
   says hello (fires on "Transferring you now"); sits through the clerk walking away (25s, Target);
   emits EMPTY turns (~12s dead air/call, likely the 26% "couldn't tell" rate). Muting saves $0 — only
   CLOSING the socket does, and reopening makes a 2nd conversation id that orphans the transcript.
   Stitching is the work; the receipt now MEASURES the prize (`charlieSilentSeconds`).
4. Owner drive-test 07-27 once Mapper has reaped stores; then Fun hammer-test + a zone sweep.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
  Rapid deploys mid-incident split the evidence: check WHICH build served a call.
- Delta (`src/calls/tapedeck.ts`) is NOT vapour: it dials, plays clips, classifies, tells "hold on,
  let me check" from dead air, and hands the SAME live call to Charlie (`deltaBarge`). Shelved only for
  want of a reliable pickup/stop-talking ear — which listen-nav's detector now is. Keep the name.

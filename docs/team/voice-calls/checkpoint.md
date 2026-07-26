# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## Voice/tuning + engine state (verified live on staging 07-21/07-24)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register, max one "!" · greet-back HARD RULE · set + package question · restock
  ask on any no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median >= 0.45) so the billed agent never opens on a ringing
  line; 6 unanswered rings = hang up. (5d56acc6, afd7262a, 6c488e43)

## 07-26 THE CALL RECEIPT — LIVE ON STAGING (owner-ordered; runtime spec 02-spec-runtime-echo.md)
- Every bridged call writes a timeline + seconds + cost. `GET /api/calls/:id/receipt` (admin-gated).
  `events.ts` PURE (sink-registered like tapedeck's finalize) · `cost.ts` rates in MICRODOLLARS ·
  `receipt-store.ts` the only db file. Table `call_events` + roll-up cols on `call_results`. `room` is
  the join key — providerCallId gets replaced mid-call. Doc: `docs/specs/call-receipt/README.md`.
- Charlie seconds split talking / listening / DEAD AIR. Speaking = real playout ms; listening = store
  frames over the ear's own VOICE_THRESH; dead air DERIVED so the parts can't disagree with the bill.
- **DRIVEN (Fun store, call 191):** dial→ring 1s→answered 2s→person 3s→agent joined 3s→voicemail 15s→
  agent left 15s→end 16s. 13s billed = 0 talking + 6 listening + 6 dead air; 4.0¢. Two defects the live
  call caught+fixed: replay read the stale in-memory copy after a call ended (db once closed now), and
  the three parts rounded apart. 53 tests; listen-nav 15 + bridge 13 green. NO behaviour change.
- **NOT verified live:** the post-close db read + the verdict line (fix pushed `54130824`, deploy
  hadn't landed at handoff — re-drive one Fun call and confirm `live:false` + an `inventory_status` row).
- **FOUND, not built:** `/api/call-now` (admin) still rides the OLD direct path — no room, no receipt
  (same gap as GTM `cheap-lane-wiring`); consumer `/pub/check-live` IS on the bridge and covered. And
  every Delta call re-synthesizes its 10 clips (~456 chars ≈ 6.9¢/call, dearer than a 20s Charlie; EL
  30d TTS = 10,734 credits) — caching the finite clip set → ~$0. Next cost win.

## OPEN (priority order)
0. **LISTENING NAV LIVE (07-25, staging).** Each mapped step fires when the recording STOPS TALKING
   (burst >=900ms then >=700ms pause off the live-listen fork), eligible learned-12s, clock fallback
   learned+15s, delivered by Twilio call-update (the fork survives TwiML replacement). $0 added. Flag
   `listen_nav` (off|all|chains); one call site covers single + schedules + ZONES. `target,cvs` on
   staging, PROD UNFLAGGED. Old nav lines STILL in `prompts.ts:82-88` + `{{phone_tree}}`.
1. **MONEY, MEASURED (07-24):** Charlie 723 credits/min = **$0.00183/s** ($22/145,094 credits); 20s =
   3.7c. Bills per SECOND and meters SILENCE — only CLOSING the socket saves. Twilio WHOLE MINUTES up
   ($0.0140/min); its speech recognition $0.02/15s = NEVER on a live check; fork $0.0044/min PER STREAM
   (a menu call runs two). Baseline 5.2c. 116 calls → 32 answers = 3.6 paid attempts per answer.
   Rates live in `src/calls/cost.ts`; Admin can override via setting `call_rates`.
2. Mapper: TARGET DONE (70 stores/24 states; `externalStoreId` >=3000 = no guest-service option, person
   on 3). Time-to-human 30–45s vs navSeconds 16. Chain row UNTOUCHED. Walmart + CVS still to sample.
   `report-target-trees-2026-07-24.md`.
3. **NEXT BUILD: keep Charlie off the line when no human is talking.** Joins ~17s before the CVS human
   says hello (fires on the "Transferring you now" recording); sits through the clerk walking away
   (25s, Target); emits EMPTY turns (~12s dead air/call, likely the 26% "couldn't tell" rate). Muting
   saves $0 — only CLOSING the socket does, and reopening makes a 2nd conversation id that orphans the
   transcript. Stitching is the work; the receipt now MEASURES the prize (`avoidableSecs`).
4. Owner drive-test on staging; then the Fun hammer-test + a zone sweep on the new nav.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
  Rapid deploys mid-incident split the evidence: check WHICH build served a call.
- Delta (`src/calls/tapedeck.ts`) is NOT vapour: it dials, plays clips, classifies, tells "hold on,
  let me check" from dead air, and hands the SAME live call to Charlie (`deltaBarge`). Shelved only
  for want of a reliable pickup/stop-talking ear — which listen-nav's detector now is. Owner: keep
  the name; Delta = the admission controller.

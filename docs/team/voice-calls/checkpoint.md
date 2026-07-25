# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-24 WHY MENU CALLS FAILED (fixed by OPEN 0; detail in the reports)
- Heard live 07-24: CVS said "no" at 26s BEFORE the healthcare question so the menu looped; Walmart
  pressed 9 at 4s inside the greeting; Target pressed 2@8/2@16 where the store asks for a department
  at once. ONE chain recipe does NOT fit the individual stores. ZONES ride the SAME path (a zone
  store dials `bridgeStoreCall` like a single check, server.ts:3667).

## Voice/tuning state (verified live on staging 07-21 late)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (29s re-clone; old Branson kept for a
  one-move revert), speed 0.85, persona off. Prompt rules verified live: no dashes spoken · one
  register, max one "!" · greet-back HARD RULE · set + package question · restock ask on any no ·
  voicemail status · echo gate 520/150. Shipment TIME capture still NOT live-verified.

## 07-24 late — engine fixes LIVE on staging (owner .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median >= 0.45) so the billed agent never opens on a ringing
  line; 6 unanswered rings = hang up. Log: "Ringing the front desk…" (n:6) live; charge note only when
  actually charged.

## OPEN (priority order)
0. **LISTENING NAV IS BUILT + PROVEN LIVE (07-25, staging).** `src/calls/listen-nav.ts`: each mapped
   step fires when the recording STOPS TALKING (burst >=900ms then >=700ms pause on the live-listen
   fork), eligible from learned-12s, clock fallback at learned+15s, delivered by Twilio call-update
   (the `<Start><Stream>` fork survives replacement). $0 added — no STT, no model. Opening TwiML ends
   in a dead-man `<Connect>`. Flag = setting `listen_nav` (off | all | chain list) via Admin PATCH
   /api/settings {listenNav}. Single checks, schedules AND ZONES ride the same call site
   (server.ts:3667 -> bridgeStoreCall), so one flag covers all three.
   **DRIVEN: Target Topanga** 2@16s (learned 8s) + 2@23s, human 27s, verdict w/ product detail.
   **CVS Mulholland** no@16s (learned 26s — the exact failure), front@26s, general@41s, menu done 41s
   vs mapped 48s, transferred, human said "nothing came in". Measured: Target 13.9c, CVS 8.0c — BOTH
   from TALK time (clerk walked away 25s; transfer hold), nav itself 0c, so the next lever is
   hold-handback, not the menu. tsc + 15 new tests + 13 bridge tests green; live bug caught + fixed
   (stale fallback timer fired the next step early). PROD UNFLAGGED. `report-listening-nav-2026-07-25.md`.
1. ROOT CAUSE (now fixed by 0): a model DID listen — the ELEVENLABS AGENT itself, from pickup. Its
   nav lines are STILL in `prompts.ts:82-88` + `{{phone_tree}}`; phoneTreeDefault is plain English
   because it was written FOR the agent. Walked back by `7f67f5a1` (06-22 timer) -> `9f78b95c` (07-23
   recipe = one nav source) -> `b1290194`/`5d56acc6` (07-24 ear deaf). Bravo was SPECED 06-18 as
   "cheap STT -> Haiku picks the word -> cheap TTS. loop." for $0.013, never built. Detail:
   `report-how-nav-used-to-work-2026-07-24.md`, `report-abc-lanes-2026-07-24.md`.
   **MONEY, MEASURED 07-24. Charlie: creator $22 = 145,094 credits; 48,627 credits over 67.2 agent min
   = 723 credits/min = $0.00183/s. 20s talk = 3.7c (Calc says 2.8c, the code's 1200/min says 6.1c —
   both wrong); EL does NOT round to the minute. Baseline check = 1.4c line + 3.7c + 0.1c = 5.2c;
   $22 covers ~600 checks/mo. Charlie on a 40s menu = 7.3c, so nav MUST stay free. Twilio
   speech-recognition = $0.02/15s (~8.6c/call, $55.98 MTD) — NEVER on a live check; our fork $0.0044/min.**
2. Mapper: TARGET DONE (70 stores/24 states — stores vary, `externalStoreId` >=3000 = no guest-service
   option, person on 3). Time-to-human 30–45s vs navSeconds 16. Chain row UNTOUCHED. Walmart + CVS
   still to sample. `report-target-trees-2026-07-24.md`. **Twilio bills WHOLE MINUTES rounded up**
   (7–60s=$0.0140, 62–113s=$0.0280, 125–161s=$0.0420) — Calc charged per second AND counted listening
   as free; Admin has the fix order.
3. Owner drive-test on staging: nobody-answers logs the ring step, costs under a penny, no agent time.
   Then the Fun hammer-test + a zone sweep on the new nav.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
  Rapid deploys mid-incident split the evidence: check WHICH build served a call. Delta SHELVED.

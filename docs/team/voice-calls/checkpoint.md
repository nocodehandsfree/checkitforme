# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-24 WHY MENU CALLS FAIL (detail in the reports below)
- We own a LISTENING navigator (`navigator.ts`) wired ONLY to the Admin Tree Trainer. LIVE checks
  replay the recipe on a STOPWATCH and drift when a greeting differs.
- Heard live 07-24: CVS says "no" at 26s, BEFORE the healthcare-provider question, so the menu loops;
  Walmart presses 9 at 4s inside the greeting; Target presses 2@8/2@16 where the store asks for a
  department at once. ONE chain recipe does NOT fit the individual stores.
- ZONES ride the SAME path — a zone store dials `bridgeStoreCall` exactly like a single check
  (server.ts:3667), so whatever lands on live checks lands on zones, cost per store included.

## Voice/tuning state (verified live on staging 07-21 late)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (29s re-clone; old Branson kept for a
  one-move revert), speed 0.85, persona off. Prompt rules verified live: no dashes spoken · one
  register, max one "!" · greet-back HARD RULE · set + package question · restock ask on any no ·
  voicemail status · echo gate 520/150. Shipment TIME capture still NOT live-verified.

## 07-24 late — engine fixes LIVE on staging (owner-authorized .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median share >= 0.45) so the billed agent never opens on a
  ringing line; 6 unanswered ring bursts = hang up. Log: "Ringing the front desk…" step (n:6) live;
  closing line = REAL status, charge note only when actually charged.

## OPEN (priority order)
1. **ROOT CAUSE — the owner is right, a model DID listen: the ELEVENLABS AGENT itself, from pickup.**
   Its nav instructions are STILL in `prompts.ts:82-88` ("say the menu word — 'No'/'Front'/'General'")
   + `{{phone_tree}}`; phoneTreeDefault is plain English because it was written FOR the agent to read.
   Walked back by three cost fixes: `7f67f5a1` (06-22, Polly words on a TIMER, "no agent during nav")
   -> `9f78b95c` (07-23, one nav source = the recipe) -> `b1290194`/`5d56acc6` (07-24, ear deaf through
   the recipe). Now NOTHING listens, so the timer drifts and CVS says "no" before the question.
   **THE FIX = COUNT PROMPTS, NOT SECONDS.** The bridge already streams AND analyses store audio from
   pickup (Goertzel + VAD), so firing step N after the Nth speech burst costs $0 — no STT, no LLM, no
   agent. Recipe becomes "2 after prompt 1, 2 after prompt 2"; the mapper already records exactly that
   (`reactivePress`, navigator.ts:337). Timer = FALLBACK, store facts (Target `externalStoreId`) = 3rd
   layer. Proof + the 5 cost layers:
   Reports: `report-how-nav-used-to-work-2026-07-24.md` + `report-abc-lanes-2026-07-24.md` (Bravo was
   SPECED 06-18 as "cheap STT -> **Haiku** picks the word -> cheap TTS. loop." for $0.013; `7f67f5a1`
   shipped a TIMER 4 days later, 07-02 made it doctrine "No AI"). NOT BUILT — prompt-boundary accuracy
   untested.
   **MONEY, ALL MEASURED 07-24. Charlie: creator $22 = 145,094 credits; 48,627 credits over 67.2 agent
   min = 723 credits/min = $0.00183/s. 20s talk = 3.7c (Calc says 2.8c, the code's 1200/min says 6.1c
   — both wrong); EL does NOT round to the minute. Real check = 1.4c line + 3.7c + 0.1c = 5.2c, ALREADY
   0.2c over the ceiling; $22 covers ~600 checks/mo. Charlie on a 40s menu = 7.3c of agent time alone,
   so nav MUST stay free. Twilio speech-recognition = $0.02/15s interval (~8.6c/call, $55.98 MTD) —
   NEVER on a live check; the audio fork we already run is $0.0044/min.**
2. Mapper: TARGET DONE (70 stores/24 states — stores vary, `externalStoreId` >=3000 = no guest-service
   option, person on 3; 73 CA rows lack a number -> DD). Time-to-human 30–45s vs navSeconds 16. Chain
   row UNTOUCHED. Detail: `report-target-trees-2026-07-24.md`. Walmart + CVS still to sample.
   **Twilio bills WHOLE MINUTES rounded up** (7–60s=$0.0140, 62–113s=$0.0280, 125–161s=$0.0420) —
   Calc charges per second AND counts listening as free. Both wrong; Admin has the fix order.
3. Owner drive-test on staging: nobody-answers logs the ring step, costs under a penny, no agent
   time, nothing in the charge slot. Then the Fun hammer-test + a zone sweep.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
  Rapid deploys mid-incident split the evidence: check WHICH build served a call. Delta SHELVED.

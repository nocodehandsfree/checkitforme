# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-24 WHY MENU CALLS FAILED (fixed by OPEN 0)
- Heard live: CVS said "no" at 26s BEFORE the healthcare question so the menu looped; Walmart pressed
  9 at 4s inside the greeting; Target pressed 2@8/2@16 where the store asks for a department at once.
  ONE chain recipe does NOT fit the individual stores.

## Voice/tuning state (verified live on staging 07-21 late)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (29s re-clone; old Branson kept for a
  one-move revert), speed 0.85, persona off. Prompt rules verified live: no dashes spoken · one
  register, max one "!" · greet-back HARD RULE · set + package question · restock ask on any no ·
  voicemail status · echo gate 520/150. Shipment TIME capture still NOT live-verified.

## 07-24 late — engine fixes LIVE on staging (owner .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median >= 0.45) so the billed agent never opens on a ringing
  line; 6 unanswered rings = hang up. Log: "Ringing the front desk…" (n:6) live.

## OPEN (priority order)
0. **LISTENING NAV BUILT + PROVEN LIVE (07-25, staging).** `src/calls/listen-nav.ts`: each mapped step
   fires when the recording STOPS TALKING (burst >=900ms then >=700ms pause, read off the live-listen
   fork), eligible from learned-12s, clock fallback at learned+15s, delivered by Twilio call-update
   (the `<Start><Stream>` fork survives replacement). $0 added — no STT, no model. Opening TwiML ends
   in a dead-man `<Connect>`. Flag = setting `listen_nav` (off | all | chain list) via Admin
   PATCH /api/settings {listenNav}; single checks, schedules AND ZONES share one call site
   (server.ts:3667), so one flag covers all three. PROD UNFLAGGED.
   **DRIVEN:** Target Topanga 2@16s (learned 8s) + 2@23s, human 27s, verdict w/ product detail. CVS
   Mulholland no@16s (learned 26s — the exact failure), front@26s, general@41s, menu done 41s vs
   mapped 48s, human said "nothing came in". tsc + 15 new tests + 13 bridge tests green; live bug
   caught + fixed (stale fallback timer fired the next step early).
   `report-listening-nav-2026-07-25.md`.
1. ROOT CAUSE (fixed by 0): a model DID listen — the ELEVENLABS AGENT itself, from pickup. Its nav
   lines are STILL in `prompts.ts:82-88` + `{{phone_tree}}`. Walked back by `7f67f5a1` (06-22 timer)
   -> `9f78b95c` (07-23) -> `b1290194`/`5d56acc6` (07-24). Bravo was SPECED 06-18 as a Haiku listening
   loop, never built. See `report-how-nav-used-to-work-2026-07-24.md` + `report-abc-lanes-2026-07-24.md`.
   **MONEY, MEASURED: Charlie $0.00159/s (924 credits for 88s of known calls; creator $22 = 145,094
   credits). 20s talk = 3.2c, 30s = 4.8c. EL bills per SECOND and meters SILENCE as its own line.
   Twilio bills WHOLE MINUTES rounded up ($0.0140 / $0.0280 / $0.0420 measured). Twilio speech
   recognition $0.02 per 15s (~8.6c/call) — NEVER on a live check. Our audio fork $0.0044/min.
   Baseline good check = 1.4c line + 3.2c Charlie + 0.1c = 4.7c. Real-world: 116 real-store calls
   delivered only 32 answers = 3.6 paid attempts per answer.**
2. Mapper: TARGET DONE (70 stores/24 states — stores vary; `externalStoreId` >=3000 = no guest-service
   option, person on 3). Time-to-human 30–45s vs navSeconds 16. Chain row UNTOUCHED. Walmart + CVS
   still to sample. `report-target-trees-2026-07-24.md`. Admin has the Calc fix order.
3. **NEXT BUILD (owner hands a spec to a fresh agent): keep Charlie off the line when no human is
   talking.** Waste measured 07-25: joins ~17s before the CVS human says hello (fired on the
   "Transferring you now" recording); sits through the clerk walking away (25s, Target); and still
   burns a median 27s on calls NOBODY ANSWERED. EL meters SILENCE as its own line so muting saves $0 —
   only CLOSING the socket stops it, and reopening makes a 2nd conversation id that orphans the
   transcript/verdict. Stitching is the work. Also: Charlie emits EMPTY turns (two nulls + 9s silence,
   07-25 CVS) = ~12s dead air/call, likely driving the 26% "couldn't tell" rate.
4. Owner drive-test on staging; then the Fun hammer-test + a zone sweep on the new nav.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
  Rapid deploys mid-incident split the evidence: check WHICH build served a call. Delta SHELVED.

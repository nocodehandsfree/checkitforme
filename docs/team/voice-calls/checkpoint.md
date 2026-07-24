# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-24 THE ANSWER TO "WHY DO MENU CALLS FAIL": we already own a LISTENING navigator
- `src/calls/navigator.ts` (works) walks a menu by HEARING it: Twilio `<Gather input="speech">` + an
  LLM per step, `listenFirst` acts when the menu asks for input, LIVE_HUMAN_RE spots a person. Wired
  ONLY to the Admin Tree Trainer (`/api/admin/trainer/*`). NOTHING WAS DELETED.
- LIVE checks do NOT use it — they replay the recipe on a STOPWATCH (`<Pause>/<Say>/<Play digits>`
  before `<Connect>`): the documented "cheap until human" design, not a regression. The trainer
  reaches a human reliably (navLog: CVS [60,58,58], Walgreens [34], Target [16], Walmart [10]);
  live calls fire blind and drift whenever a store's greeting differs from the mapped one.
- Confirmed wrong for the OWNER'S stores (heard live 07-24): CVS says "no" at 26s, before the
  healthcare-provider question, so the menu loops. Walmart presses 9 at 4s inside the greeting,
  hitting an extension nobody answers. Target presses 2@8/2@16 where the store asks for a department
  at once. ONE chain recipe does NOT fit the individual stores.
- ZONES ride the SAME path — a zone store dials `bridgeStoreCall` exactly like a single check
  (server.ts:3667), so whatever lands on live checks lands on zones, cost per store included.

## Voice/tuning state (verified live on staging 07-21 late)
- Default agent both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (29s re-clone; old Branson kept for a
  one-move revert), speed 0.85, persona off. Prompt rules verified live: no dashes spoken · one
  register, max one "!" · greet-back HARD RULE · set + package question · restock ask on any no ·
  voicemail status · echo gate 520/150.

## 07-24 late — engine fixes LIVE on staging (owner-authorized .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published
  tone frequencies (Goertzel 350/440/480/620, median share >= 0.45) so the billed agent never opens
  on a ringing line; 6 unanswered ring bursts = hang up. Log: "Ringing the front desk…" step (n:6)
  live; closing line = REAL status, charge note only when actually charged.

## OPEN (priority order)
1. **LIVE LISTENING NAV — NOT a drop-in. Owner wants it built; exact spec below.**
   navigator.ts drives its OWN Twilio call, NOT the bridge. Pointing live checks at it as-is LOSES
   live listen, transcript relay, the verdict/charging path, and its confirm mode gives no in-stock
   verdict — same regression class as the reverted native-EL path. CORRECT BUILD: keep the bridge,
   move the LISTENING BRAIN onto the fork audio we now have from pickup (`<Start><Stream>` ->
   /twilio-media). (a) fork audio -> a cheap NON-Twilio STT; (b) reuse navigator.ts logic verbatim
   (parseMenuOptions, listenFirst/askedForInput, LIVE_HUMAN_RE, ROUTING_RE); (c) fire reactively via
   Twilio REST call-update TwiML, not the pre-scheduled plan; (d) recipe = FALLBACK when STT is
   silent. Flag-gated, CVS first, owner listening.
   **COST CORRECTION (real bills 07-24): "STT is a fraction of a cent" is WRONG for Gather — Twilio
   speech-recognition is $0.02 per 15s INTERVAL, min 1 per `<Gather>`. Today: $8.98 STT vs $2.09
   line over 104 trainer calls (~4.3 intervals each = 8.6¢/call, past the 5¢ ceiling on its own);
   month to date $55.98. NEVER put `<Gather input="speech">` on a live check.** That is why step (a)
   says non-Twilio: the fork itself measured $0.0044/min. Price the STT BEFORE building.
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
- Rapid deploys mid-incident split the evidence: check WHICH build served a call. Delta SHELVED.

# VOICE-CALLS — checkpoint (current state)

> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-24 THE ANSWER TO "WHY DO MENU CALLS FAIL": we already own a LISTENING navigator
- `src/calls/navigator.ts` (40KB, works) drives a call through a menu by HEARING it: Twilio
  `<Gather input="speech">` + an LLM decides each step, `listenFirst` acts the moment the menu asks
  for input, LIVE_HUMAN_RE spots a real person. It is wired ONLY to the Admin Tree Trainer
  (`/api/admin/trainer/*` -> placeNavCall). NOTHING WAS DELETED.
- LIVE checks do NOT use it. They replay the recorded recipe on a STOPWATCH via TwiML
  `<Pause>`/`<Say>`/`<Play digits>` before `<Connect>`. That is the documented design
  ("everything cheap until human"), not a regression.
- THAT is why the owner remembers it working every time: the trainer listens and reaches a human
  reliably (navLog seconds-to-human: CVS [60,58,58], Walgreens [34], Target [16], Walmart [10]).
  Live calls fire blind and drift whenever a store's greeting differs from the mapped one.
- Confirmed stale/wrong for the OWNER'S stores (he listened live 07-24): CVS says "no" at 26s,
  before the healthcare-provider question, so the menu loops. Walmart presses 9 at 4s, inside the
  greeting, and lands on an extension nobody answers. Target presses 2@8/2@16 on a store that asks
  for a department immediately. One chain recipe does NOT fit the individual stores.

## Voice/tuning state (verified live on staging 07-21 late)
- Agent default both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (clean 29s re-clone). Old Branson
  kept for one-move revert. Speed 0.85 (workflow tuning + vt_speed). Persona off.
- Prompt rules verified live: no dashes spoken · one register, max one "!" · greet-back HARD RULE ·
  set question · package question · restock-day ask on any no · voicemail status · echo gate 520/150.

## 07-24 late — engine fixes LIVE on staging (owner-authorized .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback now identified by its
  published tone frequencies (Goertzel 350/440/480/620, median share >= 0.45), so the billed
  agent never opens on a ringing line. Ring bursts counted; 6 unanswered = hang up.
- Log: "Ringing the front desk…" step (n:6) live + persisted; closing line = the REAL status;
  charge note only when actually charged.

## OPEN (priority order)
1. **LIVE LISTENING NAV — NOT a drop-in. Owner wants it built; here is the exact spec.**
   navigator.ts drives its OWN Twilio call (`Url:` webhook + `<Gather input="speech">`), NOT the
   bridge. Routing live checks at it as-is LOSES: live listen, live transcript relay, the
   call_results/verdict/charging path, and its confirm mode only says answered-vs-redirect (no
   in-stock verdict). That is the SAME regression class as the reverted native-EL path.
   CORRECT BUILD: keep the bridge; move the LISTENING BRAIN onto the fork audio we now have from
   pickup (<Start><Stream> -> /twilio-media). Steps: (a) stream fork audio to a cheap STT;
   (b) reuse navigator.ts menu logic verbatim (parseMenuOptions, listenFirst/askedForInput,
   LIVE_HUMAN_RE, ROUTING_RE) to decide the next word/digit; (c) fire it reactively via Twilio
   REST call-update TwiML instead of the pre-scheduled <Pause>/<Say> plan; (d) keep the recipe as
   the FALLBACK when STT is silent. Flag-gated, CVS first, owner listening. Cost: ~30s of STT is
   a fraction of a cent, so the 5-cent ceiling holds; agent still joins only on a real human.
2. Mapper: sample 5 Target + Walmart + CVS stores. Does ONE chain recipe fit all stores, or do
   they vary? If they vary, hand back; do not average it away.
3. Owner drive-test on staging: nobody-answers should log the ring step, cost under a penny, no
   agent time, nothing in the charge slot.
4. Status hammer-test on Fun, then a zone sweep (zones use the SAME engine as a single check).

## Traps
- Never run the full suite for a small change. Never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Rapid deploys mid-incident split the evidence: check WHICH build served a call before blaming code.
- Delta SHELVED (built, tests green, zero stores). Charlie for all.

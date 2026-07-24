# VOICE-CALLS — checkpoint (current state)

> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute)
Never change a setting behind Admin's back; if Admin can show it, the change goes THROUGH Admin data.

## 07-24 WHY MENU CALLS FAIL: we already own a LISTENING navigator
- `src/calls/navigator.ts` walks a menu by HEARING it (Twilio `<Gather input="speech">` + an LLM per
  step; `listenFirst` acts when the menu asks for input; LIVE_HUMAN_RE spots a person). Wired ONLY to
  the Admin Tree Trainer (`/api/admin/trainer/*` → placeNavCall). Nothing deleted. LIVE checks replay
  the recipe on a STOPWATCH instead (`<Pause>/<Say>/<Play digits>` before `<Connect>`) — the documented
  "cheap until human" design, not a regression — so they drift when a greeting differs.
- **NEXT MOVE (owner leaning yes, not started): reuse navigator.ts on LIVE Bravo chains.** Flag-gated,
  CVS first, owner listening. Do NOT rebuild from scratch. Do NOT ship without his word.

## 07-24 — TARGET: 70 stores called, 24 states. THE STORE NUMBER IS THE FLAG → nothing changed
- Menu shape splits on `retailers.externalStoreId` (Target's own store #), **blind test 11/11**:
  **#≥3000 = shape B** (small format, NO guest service desk: "electronics 1, food and beverage 2
  [, general merchandise 3]" — person on 3) · **#<3000 = shape A** ("guest service desk … press 2",
  extras appended at 3+, **2 never moves**). Every shape B found is ≥3200; highest A is 2889. 111 of
  1,300 numbered Targets are ≥3000 (8.5%, matches the 4/59 random rate). ~73 rows have NO store # —
  DD gap-fill from Target's locator.
- **ROI: the Calc page is WRONG.** Twilio bills WHOLE MINUTES rounded up ($0.014/min) — today's 104
  real bills: 7–60s → $0.0140 (n=74) · 62–113s → $0.0280 (n=15) · 125–161s → $0.0420 (n=15). Calc
  charges per second so it under-counts. With 20s talk it's a **cliff at 60s total**: ≤60s = 4.3¢,
  61–120s = 5.7¢. **Nav must finish ≤40s**, not the 70s Calc allows (Target 30/33/36/40s fit, Granada
  45s doesn't). Charlie's per-sec rates UNVERIFIED — no Charlie call placed.
- 0 is INVALID in the department list (3 bad = "Goodbye") but makes Target RE-READ it (free ~10s retry,
  no redial); 0 at the FIRST menu works in 50–73s but failed at 2 stores and 73s = 5.7¢. navSeconds 16
  vs real 30–45s. 104 calls = $2.09. Chain row UNTOUCHED. `report-target-trees-2026-07-24.md`.

## Voice/tuning state (verified live on staging 07-21 late)
- Agent default both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (clean 29s re-clone; old Branson kept
  for a one-move revert). Speed 0.85 (workflow tuning + vt_speed). Persona off. Prompt rules verified live: no dashes spoken · one register, max one "!" · greet-back HARD RULE · set
  + package question · restock-day ask on any no · voicemail status · echo gate 520/150. Shipment TIME
  capture ("tomorrow around 2 PM" → `shipment_time_heard`) still NOT live-verified.
- Mapping 99.9% covered, data intact (HT/BL mapped Jun 25, B&N Jul 10). Map on PROD.

## 07-24 late — engine fixes LIVE on staging (owner-authorized .unlock; 5d56acc6, afd7262a, 6c488e43)
- Dead VAD gate fixed (hadDtmf/hadSay survive TwiML build). Ringback identified by its published tone
  frequencies (Goertzel 350/440/480/620, median share >= 0.45) so the billed agent never opens on a
  ringing line; 6 unanswered ring bursts = hang up.
- Log: "Ringing the front desk…" step (n:6) live; closing line = REAL status, charge note only when charged.

## OPEN (priority order)
1. **DECISION PENDING (owner leaning yes):** reuse navigator.ts on LIVE Bravo chains. Flag-gated, CVS
   first, owner listening. Do NOT rebuild from scratch, do NOT ship without his word.
2. Mapper: Target DONE (store # predicts the menu). Walmart + CVS still to sample — same question,
   same rule: if stores vary, hand back, do not average it away.
3. Owner drive-test on staging: nobody-answers logs the ring step, costs under a penny, no agent time.
   Then the status hammer-test on Fun + a zone sweep (zones use the SAME engine as a single check).
4. Self-learning corpus pass = first post-launch build (above Delta).

## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Rapid staging deploys mid-incident split the evidence: check WHICH deployment served a call before
  blaming code. Delta SHELVED (tests green, zero stores) — Charlie for all.

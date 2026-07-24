# VOICE-CALLS — checkpoint (current state)

> System: the calling engine + voice tuning + phone-tree mapping (call lanes, workflows/routing,
> bridge plumbing, verdicts, call cost, chain nav recipes). `src/voice/` is FROZEN (machine-blocked).
> Charter: `handoff.md` + `MAPPING-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute)
Never change a setting behind Admin's back; if Admin can show it, the change goes THROUGH Admin data.

## 07-24 — TARGET: 59 stores called, 24 states. ONE menu, 93% the same → nothing changed
- First menu identical everywhere (1 hours · 2 department · 3 pharmacy [· 4 optical]); digits buffer
  during the greeting. Department list: **shape A, 55/59 — `2 = guest service desk`**, extras appended
  at 3+ (food, apparel, HR, Starbucks) and 2 NEVER moves. **Shape B, 4/59 — no desk option at all,
  `2 = food and beverage`, person on 3**: Mission Hills · Victory Blvd NoHo · UCSD Price Center ·
  Cambridge St Boston (3 of 4 small-format; we hold no size/format field to predict them).
- 0 is INVALID in the department list; an invalid press makes Target RE-READ the whole list (free
  retry ~10s, no redial), 3 bad entries = "Goodbye". 0 at the FIRST menu works in 50–73s, failed at 2.
- Real time-to-human on the right key: 30 · 33 · 36 · 40 · 45s — navSeconds 16 is 15–30s early (locked
  07-10 off two runs that heard NOTHING back and ended `done`, never `human`).
- The angle: the store READS its list out loud, so `parseMenuOptions` can match "guest service … 2"
  as plain text — zero AI, cheap lane, self-corrects on shape B. Unpriced: Twilio speech recognition
  on a live check. Write-up + 4 ways to apply it: `report-target-trees-2026-07-24.md`.
- Target chain row UNTOUCHED (navRecipe/navSeconds/answerPath/phoneTreeDefault); no other chain called.

## 07-24 — "system is down" night: RESOLVED (full story in git log 793f663/30af536)
- Broken engine build reverted 01:31 UTC; engine bytes == baseline verified; prompt self-heals on
  boot; nav rows + phones intact both envs; prod consumer never affected. Call screen no longer sits
  on "It's ringing" (ANSWERED → "We've connected"); LISTEN-FROM-PICKUP shipped + proven live.

## Voice/tuning state (verified live on staging 07-21 late)
- Agent default both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (clean 29s re-clone; old Branson kept
  for a one-move revert). Speed 0.85 (workflow tuning + vt_speed). Persona off.
- Prompt rules verified live: no dashes spoken · one register, max one "!" · greet-back HARD RULE ·
  set question · package question · restock-day ask on any no · voicemail status · echo gate 520/150.
- Shipment TIME capture ("tomorrow around 2 PM" → `shipment_time_heard`) still NOT live-verified.

## Mapping — 99.9% covered; data intact 07-24 (the "weekend rewrite" was a timestamp misread).
Map on PROD (staging hand-edits overwritten).

## 07-24 late — VAD dead-gate fix LIVE on staging (owner-authorized, .unlock flow, 5d56acc6)
- "Charlie listening to phone trees": every gate version read ctx.dtmf/ctx.say, which takeBridgeDtmf/
  Say CONSUME at TwiML build — always empty by media time, so the ear armed on every timerless nav
  chain. Fix: setBridgeContext stamps hadDtmf/hadSay (never consumed) and the ear's no-nav-plan test
  reads those; rides with the smart-join (earArmed) line. tsc + 13 tests green.

## OPEN (priority order)
1. OWNER drive-test: one Target or CVS check on staging, 60–90s. Expect ring ~3s, the REAL menu
   audible, steps advancing, agent talks to the human. Closes 07-23 + proves listen-from-pickup.
2. Status hammer-test on Fun (staging), then the queued CVS/Walgreens zone run (owner listens).
3. Call/log investigation: a real Fun-store transcript came back cut off — chase the capture gap.
4. SMART JOIN restored (owner-named): ear DEAF through the recipe, arms at last-step+2s, Charlie
   joins only on a real voice, give-up at max(earFrom, learned)+20s, never billed. NOT live-fired —
   the owner's next Target/CVS call proves it (watch /pub/bridge-debug for EAR). Prod on promote.

## Traps
- Never run the full suite for a small change. Never deploy while the owner is mid-test-call.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Rapid staging deploys mid-incident split the evidence: check WHICH deployment served a given call
  before blaming code (deploy created 01:30:56 went live 01:31:41 — his tests predated it).
- Delta SHELVED (built, tests green, zero stores). Charlie for all.

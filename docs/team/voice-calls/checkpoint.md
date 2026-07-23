# VOICE-CALLS — checkpoint (current state)

> System: the calling engine + voice tuning + phone-tree mapping (call lanes, workflows/routing,
> bridge plumbing, verdicts, call cost, chain nav recipes). `src/voice/` is FROZEN (machine-blocked).
> Charter: `handoff.md` + `MAPPING-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute)
Never change a setting behind Admin's back. It happened twice (persona off via API on staging only;
Branson HD set as default while Admin showed old Branson) — owner rightly furious. If Admin can show it,
the change goes THROUGH Admin data so the screen always matches.

## 07-21 — instant-connect incident + recovery (READ FIRST)
- The 07-20 "first-word capture" made Charlie talk over greeting recordings at B&N / Hot Topic /
  BoxLunch in the owner's zone test. Trust damage severe. Rolled back (8b4b6d7 / 2593e1b).
- Calling code VERIFIED back to July-18 state. Only 3 protective deltas remain, none touch connect
  timing: CVS say-plan VAD exclusion, zones dial the single-check engine, post-call shipment-time capture.
- STILL BROKEN — mapping DATA not code: B&N stamped "ring varies" (kills press-0@6s + 29s timer → VAD
  trips on the recording); HT/BoxLunch "answers directly". Restore = mapping (map on PROD, nav syncs down).

## Voice/tuning state (verified live on staging 07-21 late)
- Agent default both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (clean 29s re-clone). Old Branson kept
  for one-move revert. Speed 0.85 (workflow tuning + vt_speed). Persona off.
- Prompt rules verified live: no dashes spoken · one register, max one "!", never on goodbye · greet-back
  HARD RULE · set question · package question · restock-day ask on any no · voicemail status · echo gate 520/150.
- NEW 07-20: shipment TIME capture ("tomorrow around 2 PM" → `shipment_time_heard` + consumer card). NOT live-verified.

## Mapping — 99.9% covered, go-live ready, nothing running
- 110,516 / 110,622 stores front-end callable. Last 0.1% = 7 micro-chains (~105 stores) whose loaded
  numbers were Google answer-box fabrications, quarantined to `nophone` both envs (a DATA gap, not nav).
  Real numbers (owner pulls from chain locators/Maps pins, DD ingests) → Mapper takes ONE pass.
- Engine LIVE on prod: no-downgrade guard + skip-rings-direct; independents/co-ops = DIRECT in code
  (boot backfill; nav-sync skips them); daily cap 60. Map on PROD — hand-set staging nav is overwritten in 3 min.

## OPEN (priority order)
1. Owner verifies after a mapping-data restore: one B&N + one Hot Topic staging call — agent waits
   through the recording silently (the steady-state gate).
2. Status hammer-test on Fun (staging): yes+detail · no→restock-day (with TIME) · sold-out · voicemail ·
   Spanish · silent pickup. Then zones again (CVS/Walgreens run is queued — owner listens).
3. **Call/log investigation (STATE.md work stream):** a real Fun-store transcript came back cut off —
   chase the call-engine capture gap in the call log. Design only near the engine; nothing ships without the owner's word.
4. First-word capture REAL fix (listen-then-talk gate) — DESIGN ONLY. Bail enforcement (voicemail/IVR
   caps) — policy UI exists, live wiring off; A2P: set TWILIO_MESSAGING_SERVICE_SID when approval lands.

## Traps
- Never run the full suite for a small change (orphans servers/browsers, burns compute; stop = `scripts/kill-tests.sh`).
- Owner's live-transcript stall = usually HIS signal dropping. Verify on a strong-signal call first.
- Never deploy while the owner is mid-test-call (rollouts killed two live calls). Prompt edits reach the
  agent only via push. #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Delta SHELVED (built, tests green, zero stores). Charlie for all.

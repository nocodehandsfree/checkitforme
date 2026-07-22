# Check - Voice — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-21 — the instant-connect incident + recovery (READ FIRST, new Echo)
- **What happened:** the 07-20 "first-word capture" (connect agent at answer on stores that LOOK
  direct) made Charlie talk over greeting recordings at B&N / Hot Topic / BoxLunch in the owner's
  10-store zone test. Trust damage severe. PM rolled it back (8b4b6d7); a parallel Echo session
  also reverted its own engine changes to 2593e1b (see its receipts below).
- **Calling code VERIFIED back to July-18 state** (file-by-file diff). Only 3 code deltas remain,
  none touch connect timing: CVS say-plan VAD exclusion (protective), zone calls dial the
  single-check engine (protective), shipment-time capture (post-call only).
- **STILL BROKEN — mapping DATA, not code:** chain phone-menu records rewritten 07-20/21.
  B&N stamped "ring varies" (kills its press-0@6s + 29s timer → falls to VAD → VAD trips on the
  recording). HT/BoxLunch stamped "answers directly". Restore = Mapper's lane; PM has the boxed
  prompt (restore PROD first — nav syncs prod→staging). The 18 big-box site→call flips are
  DELIBERATE + owner-verified: leave them.
- **ADMIN IS THE RECORD OF TRUTH — owner law, absolute:** never change a setting behind Admin's
  back. It happened twice (persona off via API on staging only; Branson HD set as agent default
  while Admin's checkbox showed old Branson) — owner rightly furious. If Admin can show it, the
  change goes THROUGH Admin data so the screen always matches. Owner is syncing Admin himself:
  persona OFF on Branson Global + Branson HD checked; confirmed those saves stick.

## Receipts from the parallel Echo session (kept — investigate before touching Bravo/CVS)
- 770ffa0 (VAD-on-voice-nav gate) flip-flopped: reverted 23:51, reapplied 07-21 06:29. CAUTION:
  ctx.dtmf/ctx.say may be NULLED at TwiML build (takeBridgeDtmf/Say) → the gate may check
  already-consumed fields. NOT live-verified. Bare talk-cap TimeLimit also chops tree calls.
- Bravo say-plan runs as TwiML BEFORE <Connect> → no media stream during nav (nothing to hear
  until it ends). Reconcile with CHEAP_NAV_ARCHITECTURE.md before coding. attachListenFork
  (bridge-place.ts) exists dormant. Owner: NEVER raise call cost; mapped A/B/C lanes ARE the product.
- Owner's standing orders: call log shows EVERY step + seconds · live audio the whole call ·
  ASK HIM before changing the engine; never deploy while he's mid-call · verify any CVS fix with
  ONE daytime call he can hear.

## Voice/tuning state (verified live on staging 07-21 late)
- Voice: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** = agent default both envs (clean 29s re-clone;
  owner: "sounded pretty good"). Old Branson `6HjmwcEkrRm46qtsvp9k` kept for one-move revert.
  vt_voice_pool pointed at old Branson → the mismatch the owner is fixing in Admin.
- Speed 0.85 both envs (workflow tuning + vt_speed). Persona off (staging copy; owner syncing Admin).
- Prompt tweaks ALL verified still live post-rollback: no dashes spoken · one register, max one
  "!", never on goodbye · greet-back HARD RULE · set question ("…Like Chaos Rising?") · package
  question ("does that come in a pack? or like a box?") · restock-day ask on any no · voicemail
  status · soft-timeout off (-1) · echo gate 520/150.
- NEW 07-20: **shipment TIME capture** — "tomorrow around 2 PM" → shipment_time_heard column +
  consumer card "A shipment lands tomorrow around 2 PM." (ES same commit). NOT live-verified.

## OPEN (priority order)
1. **Wait for Mapper's data restore**, then owner verifies: one B&N + one Hot Topic call from
   staging — agent waits through the recording silently. That's the steady-state gate.
2. Owner's status hammer-test on Fun (staging): yes+detail · no→restock-day (now with TIME) ·
   let-me-check · sold-out · doesn't-carry · voicemail · Spanish · silent pickup. Then zones again.
3. First-word capture REAL fix (listen-then-talk gate: connect muted at answer, buffer, speak only
   after a human) — DESIGN ONLY, nothing ships without the owner's explicit word.
4. Self-learning corpus pass = first post-launch build (above Delta); corpus capture running.
5. Bail enforcement (voicemail/IVR caps) — policy UI exists, live wiring off. A2P day: set
   TWILIO_MESSAGING_SERVICE_SID when approval lands (error 30034 = not active yet).

## Traps (full list handoff.md §5 + GOTCHAS)
- **Never run the full test suite for a small change** — orphans servers/browsers, burns the
  owner's compute (07-20 incident). One relevant unit test; stop button = scripts/kill-tests.sh.
- Owner's live-transcript stall = usually HIS signal dropping (page falls back to end-of-call
  load). Verify on a strong-signal call before treating as a bug.
- Admin edits write PROD data; staging tests read STAGING; vt_* keys do NOT auto-sync — keep both
  in step and Admin's screen ALWAYS matching (law above).
- Prompt edits reach the talking agent only via push — automatic on boot, never assume otherwise.
- Never deploy while the owner is mid-test-call (rollouts killed two live calls).
- Echo gate is ear-tuned: phantom "Clerk:" lines echoing agent words → raise 520 toward 700.

**Delta: SHELVED** (built, 37 tests green, zero stores). **Boundaries:** consumer UI = Webbie ·
Admin screens = Addie · spoken copy = Copper · mapping/nav data = Mapper (FROZEN without owner's
word). Voice owns: call brains, workflows/routing, bridge plumbing, verdicts, call cost.

# VOICE-CALLS — checkpoint (current state)

> System: the calling engine + voice tuning + phone-tree mapping (call lanes, workflows/routing,
> bridge plumbing, verdicts, call cost, chain nav recipes). `src/voice/` is FROZEN (machine-blocked).
> Charter: `handoff.md` + `MAPPING-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute)
Never change a setting behind Admin's back. If Admin can show it, the change goes THROUGH Admin data
so the screen always matches.

## 07-24 — "system is down" night: root cause + evidence (READ FIRST)
- The prior session's engine build (9f78b95 era) broke tree calls: the agent joined mute (skip-turn
  loop; EL convs show 0–3 empty msgs) or never joined at all. Every owner test 00:48–01:23 UTC ran
  on THAT build. The revert (793f663) only went LIVE at 01:31 UTC — after his testing window.
- The EL agent prompt is re-pushed from prompts.ts on every boot ("[boot] agent brain synced"), so
  the broken build's prompt damage self-healed when the revert deployed. Verified live prompt is
  byte-identical to baseline prompts.ts.
- Post-revert verified tonight: engine bytes == baseline 30af536 (whole src/ diffs clean) · chain nav
  rows intact BOTH envs (Target `2@8,2@16` · Walmart `9@4` · CVS voice 67s · Walgreens `0@8..32`, all
  locked) · store phones staging==prod · Twilio: every call ANSWERED, zero rang-out · bridge debug on
  the 01:44 Target call armed "connect at 16s" correctly. PROD consumer site never affected.
- Owner's two post-revert tests died at 10s and 48s: HE hung up pre-join, because the call screen sat
  on "It's ringing" in silence for the whole menu walk (presses/say run inside TwiML; voice chains
  stream no audio until nav ends). Fix shipped via the .unlock flow: checkit.html now advances to
  "We've connected" on carrier ANSWERED and "Working through the menu…" 6s later. Verdicts stay
  transcript-only ("Nobody answered" cannot be faked by the flag).
- Twilio numbers 19–79s on the broken night = calls navigating then sitting mute, NOT ringing out.
- 02:4x LISTEN-FROM-PICKUP shipped + PROVEN (owner-named, .unlock src/voice): the <Start><Stream>
  fork to /twilio-media rides the INLINE TwiML in bridge-place.ts (real calls never fetch
  /twiml/bridge — it is a fallback; first attempt there did nothing). Driven live on a Fun call:
  Twilio stream-started callback logged, fork frames (inbound+outbound) from pickup, bridge takeover
  clean, no doubled audio (bridgeLiveRooms mute). Ring tone back, dies at first real frame.
  NOTE: listen-through-nav died 07-17 with the inline-TwiML no-cutoffs change, NOT on 07-23.

## Voice/tuning state (verified live on staging 07-21 late)
- Agent default both envs: **Branson HD `1P1JhCcLzeMmkvLi1BkG`** (clean 29s re-clone). Old Branson
  kept for one-move revert. Speed 0.85 (workflow tuning + vt_speed). Persona off.
- Prompt rules verified live: no dashes spoken · one register, max one "!" · greet-back HARD RULE ·
  set question · package question · restock-day ask on any no · voicemail status · echo gate 520/150.
- Shipment TIME capture ("tomorrow around 2 PM" → `shipment_time_heard`) still NOT live-verified.

## Mapping — 99.9% covered; data verified intact 07-24
- 110,516 / 110,622 stores front-end callable. Last 0.1% = 7 micro-chains (~105 stores) quarantined
  `nophone` (a DATA gap, not nav). Map on PROD — hand-set staging nav is overwritten in 3 min.

## OPEN (priority order)
1. OWNER drive-test: one Target or CVS check on staging, 60–90s. Expect: ring tone ~3s, then the
   REAL store menu audible, presses/words heard, steps advancing, agent talks to the human. Closes
   the 07-23 emergency AND proves listen-from-pickup.
2. Status hammer-test on Fun (staging), then the queued CVS/Walgreens zone run (owner listens).
3. Call/log investigation (STATE.md): a real Fun-store transcript came back cut off — chase the
   capture gap. Design only near the engine; nothing ships without the owner's word.
4. First-word capture REAL fix (listen-then-talk gate) — DESIGN ONLY. Bail enforcement wiring off;
   A2P: set TWILIO_MESSAGING_SERVICE_SID when approval lands.

## Traps
- Never run the full suite for a small change. Never deploy while the owner is mid-test-call.
- Owner's live-transcript stall = usually HIS signal dropping; verify on a strong-signal call first.
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Rapid staging deploys mid-incident split the evidence: check WHICH deployment served a given call
  before blaming code (deploy created 01:30:56 went live 01:31:41 — his tests predated it).
- Delta SHELVED (built, tests green, zero stores). Charlie for all.

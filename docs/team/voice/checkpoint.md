# Check - Voice — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-21 — HANDOFF: engine reverted to pre-session state on owner's order. DEMO IS TODAY.
- **STATE: the calling engine (bridge.ts, bridge-place.ts, service.ts, server.ts, test-bridge.ts) is
  EXACTLY commit 2593e1b** — every change from this Echo session is reverted, including a brief
  agent-from-answer experiment that raised Bravo cost (owner: NEVER raise call cost; the A/B/C
  mapped lanes ARE the product). Only kept: workflow-truth's package-wording assert updated to the
  owner's own 07-18 reword (suite was failing on pre-reword copy).
- **Facts for the next owner of this lane (with receipts):**
  · 07-20 8:54p CVS zone call billed ~16¢, EL joined at 0s. 770ffa0 (07-20 23:11) claimed to fix a
    VAD-on-voice-nav bug; 8671855 (23:51) reverted it — the website session's checkpoint ADMITS the
    flip-flop. CAUTION: this session found ctx.dtmf/ctx.say are NULLED at TwiML build
    (takeBridgeDtmf/Say), so 770ffa0's gate may check already-consumed fields. NOT live-verified.
    Investigate before trusting either version. Bare talk-cap TimeLimit also chops tree calls.
  · 07-21 11:51p CVS call (24-HOUR store per owner): joined ~74s, first transcript line was CVS's
    main greeting, "couldn't tell". Ran on since-reverted code — NOT evidence about today's engine.
  · Bravo say-plan runs as TwiML BEFORE <Connect> → no media stream during nav (nothing to hear or
    transcribe until it ends). Owner says listening + full call log worked before; reconcile with
    docs/finance/CHEAP_NAV_ARCHITECTURE.md (design: nav broker rides the OPEN stream) BEFORE coding.
  · Pieces that exist: attachListenFork (bridge-place.ts, listen-from-answer, EL-native path) ·
    live step ladder derives from transcript lines (checkit.html ~5460, labels incl "Transferring
    to the front") · r170 server steps[] on /pub/result.
- **Owner's standing orders:** call log shows EVERY step + seconds (8-step ladder) · live audio in
  Safari the whole call · never raise call cost · use the mapped lanes exactly as designed · ASK
  HIM before changing anything; never deploy while he's mid-call. Verify any fix with ONE daytime
  CVS call he can hear. This chat is done; a fresh agent takes the lane.

## 2026-07-20 — voice A/B in flight
- Owner gave a clean 29s Branson recording; re-cloned via /api/voices/clone → **Branson HD =
  `1P1JhCcLzeMmkvLi1BkG`**. Set ACTIVE on BOTH prod + staging (`/api/voices/active`).
- **REVERT if HD is worse:** set active back to the old good clone **Branson = `6HjmwcEkrRm46qtsvp9k`**
  (still in the EL account) on both envs. That's the one-move undo.
- Speed now 0.85 on both envs (workflow tuning + vt_speed). First-word capture (connectOnHuman:false
  on direct stores) + package-line reword ("does that come in a pack? or like a box?") shipped + promoted.

## 2026-07-17 — Charlie tuning week DONE on staging; next = owner hammer-tests, then promote + prod data capture

**Phase:** owner finishing iOS tint with Webbie, then "test the hell out of calls" on the Fun store
(staging), then PROMOTE and start real production store calls to capture data. Launch lane = Charlie.

**Charlie state — everything below LIVE on staging, tsc + suites green:**
- Persona "13y old excited" on Branson Global (both DBs); role clamp appended to EVERY persona
  (personas set vibe, never role — the "I'm about to call the store" narration bug is dead).
- Greet-back ("oh hi Bob") = HARD RULE and PROVEN in a text run of the composed prompt: name present
  → "Oh hi Bob!" fires. The only gap is physics: the first ~0.5s of pickup audio predates the media
  stream, so a name in the very first beat never reaches the brain (see hearing, below).
- Hearing: bridge calls carry INLINE TwiML (no answer-time webhook fetch → stream opens at answer);
  echo gate retuned (BARGE 900→520, tail 250→150ms — it was eating real clerk words in the 350-900
  energy band); agent breaks silence at ~2s on a quiet pickup. Transcripts now capture nearly the
  whole greeting; residual loss ≈ first half-second (WS handshake). Full fix = re-architect answer
  flow; parked post-launch.
- Wording: owner's package question, punctuation shaped so TTS doesn't crescendo; natural variation
  rule (never same phrasing twice, always concrete examples, never a dash); restock-day push restored
  on the LIVE path (was hardcoded ""); voicemail-that-answers stamps "voicemail" (NOT YET verified by
  a live call); voice steadied (stability .5, speed .93) — titrating by owner's ear.
- ANTI-REVERT RAILS (why fixes stopped melting): boot pushes the canonical prompt to the env's EL
  agent on EVERY server start (code deploy = talking agent updated, staging AND prod) ·
  test-workflow-truth (Admin settings must land on the real call, 15 asserts) · live-view browser
  LOCK at phone size (transcript renders + reachable, no early finalize, verdict paints) — all in
  test-all. Flight recorder: page posts live-call play-by-play → GET /api/admin/live-debug.

**PROMOTE-DAY NOTES (PM runs it, owner's word):** everything rides the whole-staging promote. Prod EL
agent gets the new brain automatically at first prod boot. After promote the Admin-vs-staging mirror dance ends.

**OPEN (priority order):**
1. Owner hammer-test round on Fun (staging): the full script list (handoff.md §3), MVP store dress
   rehearsal, then promote.
2. SELF-LEARNING = first post-launch build (ABOVE Delta): mine the call corpus (~110 calls) into a
   phrasing/mishear/conditions library. Corpus capture already running.
3. First-0.5s pickup audio: parked post-launch. 4. Bail enforcement — UI only, live wiring off.
5. A2P day: set TWILIO_MESSAGING_SERVICE_SID when approval lands (error 30034 = not active yet).

**Delta: SHELVED** (built, 37 tests green, zero stores; full state in git log 07-15/16).

**Traps (full list handoff.md §5):** prompt edits reach the live agent ONLY via deploy/boot · NEVER
merge/deploy while the owner is mid-call · Admin edits write PROD data, staging tests read STAGING ·
phantom "Clerk:" echo lines → BARGE_THRESH 520 too low, raise toward 700.

**Boundaries:** consumer live-call UI/scroll/tint = Webbie · Admin screens = Addie · spoken copy =
Copper's guide. Voice owns: call brains, workflows/routing, bridge plumbing, verdicts, call cost.

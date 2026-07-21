# Check - Voice — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-21 — LIVE nav play-by-play (tree stores no longer sit blank)
- Owner: a Bravo/Alpha call showed nothing on the live view for its whole ~30-80s menu walk (agent
  joins only at the human), so he thought CVS was broken and hung up at 30s. FIX (server-only):
  `scheduleNavRelay` in `/twiml/bridge` relays the menu nav into the listen room as synthetic lines
  the page ALREADY renders — Menu badge → "Listening to the menu…", each say word → "Working through
  the menu…", transfer word → "Transferred". Zero agent cost (agent still joins at the human);
  live-only (never persisted, saved transcript unchanged). Timers cleared on relayEnd + terminal
  bridge-status. NO checkit.html change (dodges the agent on that page).
- Proven: tsc clean; `scratchpad/nav-stage.test.mjs` runs the REAL page stageForLines against the
  emitted lines (menu→4, no/front→5, general→6, human→7, ask→8) all PASS. NOT driven on a live CVS
  call (needs a real store to answer) — owner to place one CVS check and watch it light up from pickup.

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

**PROMOTE-DAY NOTES (PM runs it, owner's word):** everything above rides the whole-staging promote.
Prod EL agent gets the new brain automatically at first prod boot (no manual push step). Fun store on
prod already routes to Branson Global. After promote: owner tweaks in Admin hit prod data directly —
the Admin-edits-vs-staging-DB mirroring dance ENDS.

**OPEN (priority order):**
1. Owner hammer-test round on Fun (staging): yes+detail · no→restock-day · "let me check" walk-away ·
   sold-out · doesn't-carry · too-busy · voicemail (verifies the new stamp) · name-a-beat-in greeting
   ("Fun store, this is Bob speaking" → hi Bob) · Spanish · silent pickup. MVP store for real-number
   dress rehearsal. Then promote.
2. SELF-LEARNING = first post-launch build (ABOVE Delta): mine call corpus (~110 calls and growing)
   into phrasing/mishear/conditions library + owner's master-account front-end flag (backend mine,
   button Webbie). Corpus capture already running (transcripts+verdicts+timing on every call).
3. First-0.5s pickup audio (name-first greetings): real-store greetings are long so impact is small;
   re-architecture parked post-launch.
4. Bail enforcement (voicemail/IVR caps) — policy UI exists, live enforcement NOT wired, switch off.
5. A2P day: set TWILIO_MESSAGING_SERVICE_SID when approval lands (error 30034 = not active yet).

**Delta: SHELVED** (built, 37 tests green, zero stores; full state in git log 07-15/16). Barge scope =
off-script question + dragging hold; known ceiling: can't catch its own confident mislabels.

**Traps (full list handoff.md §5):** prompt edits reach the live agent ONLY via push — now automatic
on boot, but NEVER assume a repo edit spoke until a deploy/boot happened · confirm the staging deploy
before a test round; NEVER merge/deploy while the owner is mid-call (rollouts killed two live test
calls) · Admin edits write PROD data while staging tests read STAGING data (until promote, mirror on
request) · echo-gate thresholds are ear-tuned: if phantom "Clerk:" lines echo the agent's own words,
BARGE_THRESH 520 is too low — raise toward 700 · DELTA_FU_DEFAULTS in app.html mirrors tapedeck.ts.

**Boundaries:** consumer live-call UI/scroll/tint = Webbie · Admin screens = Addie · spoken copy =
Copper's guide. Voice owns: call brains, workflows/routing, bridge plumbing, verdicts, call cost.

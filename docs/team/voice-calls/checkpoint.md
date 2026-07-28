# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, on staging. READ IT FIRST.
> §3 GATE ZERO IS ALL THAT IS LEFT AND IT NEEDS A PHONE. Both §6 shapes are BUILT; the gate picks
> which runs, not whether to build. `scripts/gate-zero.ts` arms + scores the six calls.
- **§4/5 Delta is ONE CLIP through the bridge.** Charlie PREWARMS behind it on a DEDICATED joining
  agent, I/O shut till it ends; early clerk speech → `pending[]`, released whole. `clip-cache.ts` μ-law
  8kHz cached (~7¢/call). Ends on `mark` · own length (8 B/ms) · `agentPlayingUntil` → backstop. Warms
  2s BEFORE the end; `prewarmTimer` MUST stay OUT of `clipTimers` or a short clip leaves no agent.
- **§5/6 HOLD.** `ConversationEar`: QUIET · MUSIC · RINGING-after-a-person = TRANSFER, BACKDATED. Both
  shapes built, neither chosen: `gate` (default) · `reopen` (the ONLY thing that stops the meter).
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT ON CODE.** `brain.ts` = streaming
  chat-completions on **Sonnet 4.6** (owner-approved). ⚠️ The provider REFUSES a custom brain on an
  INSTANT VOICE CLONE and Branson/HD/Fungie are all clones; it WAS accepted with a premade voice, so
  the build is right. `ELEVENLABS_OURBRAIN_AGENT_ID` unset till the owner settles the voice.
- **§8 DROPPED CALL.** `call_dropped` + Spanish together. Hang up, say NOTHING. Never charged. **Never
  written `completed`** — the only status the one-hour block matches, VERIFIED on a real db. Back
  <2min opens `RECONNECT_OPENER` (+ `_ES`).
- **§9 RECEIPT.** Charlie SEGMENTS (billed = SUM of open stretches, never first-open→last-close, or
  closing him for a hold reads FREE) · `brain` · `navOutcome` · `mapVersion` · `holdSeconds` MEASURED.
- **§10.** `navPlanFromVersion`: presses, words, anchors off ONE version; `stageNavPromptPlan` DELETED
  (keyed on step SHAPE, expired, died on restart, could mix versions live). Gives the runtime STORE
  EXCEPTIONS. `reportCallDrift` + callId ALREADY wired — do not rebuild it. **§2.4** the OLD direct
  lane writes a thin receipt too.
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are
`cheapBridgeAll` **THE BIG ONE: OFF = nothing above runs; every check takes the old path** ·
`stopKeysOnHuman` (ON) · `ourBrain` (blocked, §7) · `closeAgentOnHold` (OFF till Gate Zero). **Every
guessed number is in `src/calls/tuning.ts`** (`call_tuning`, each with its reason + safe bounds).
- Agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` "— joining mid call" joins AFTER Delta's clip. Staging
  `ELEVENLABS_MIDCALL_AGENT_ID`; **PROD NOT SET**. Rebuild `scripts/make-midcall-agent.ts`.
- Secret `check_brain_key` proves the provider is calling our brain; twin = Railway `BRAIN_API_KEY`
  (**staging only — REMOVED from prod**: unset = closed; a promote must not arm it silently).
- **NO VOICE = NO CHECK** — refused loudly. Any other fallback stamps `fellBackToOldPath`.
## 07-28 MAPPING CALLS NOW HAVE AN EAR (2 real CVS calls drove it)
- Alhambra 11654 → person 91s ("this is Catalina"), map 65→95. Mulholland 1 → 84s and that 84 was a
  LIE: hold music, nobody spoke. The nav lane is Twilio speech-gather only, which returns "" for
  silence, hold music AND a ringing desk — deaf, and the bridge's ear was never wired to it.
- `PickupEar` (listen-nav, pure): quiet · ringing (published tone frequencies; `toneShare` moved here
  from the LOCKED bridge) · music (sound that never breaks) · voice (has gaps). **Judges nothing until
  a full 3s window** — earlier made 3s of music read "hello". WIPED on the transfer line so the menu's
  own voice is never the person. Nav opens a `<Start><Stream>` fork keyed on the session id (survives
  TwiML replacement, set once); a call whose fork dies behaves exactly as before.
- No-words human ONLY if the ear heard somebody. Transfer wait 40s → **70s while audibly still ringing**
  (Alhambra 10s vs Mulholland 27s — the ring is the store's). `greetingFrom()` takes only THIS turn's
  words, never a routing line. **Time-to-human is what the paid agent joins on — guard it.**
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = a REAL ws provider + a real carrier socket, 38 asserts. + 44
  runtime-spec · 52 listen-nav · 13 dropped-call (REAL db) · 63 receipt · 62 mapgraph · 90 map-e2e ·
  49 map-sim · 13 bridge. `navPlanFromVersion` on staging's REAL Target + CVS = byte-identical to the
  chain rows, so no live route moved.
- **NOT VERIFIED: THE BRIDGE ON A REAL PHONE CALL** (Fun store rings the OWNER'S phone). Needed: clip
  audible, no double greeting, no talk-over, receipt = 3 `charlie_join` + `mapVersion` + `holdSeconds`.
## Engine (live 07-21/24) — Branson HD `1P1JhCcLzeMmkvLi1BkG`, 0.85, persona off. Echo gate 520/150.
6 rings = hang up. **Charlie $0.00183/s, per SECOND, meters SILENCE.** Twilio WHOLE MINUTES. 5.2c base.
## Traps — never the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/*` is admin-gated as a whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta (`tapedeck.ts`)
  STAYS in the tree and still works — no store points at it.
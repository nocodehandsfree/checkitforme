# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, on staging. READ IT FIRST.
> §3 GATE ZERO IS THE ONLY THING LEFT AND IT NEEDS A PHONE. Both §6 shapes are BUILT; the gate picks
> which runs, not whether to build. `scripts/gate-zero.ts` arms + scores the six calls.
- **§4/5 Delta is ONE CLIP through the bridge.** On a real person the clip plays out the media stream,
  Charlie PREWARMS behind it on a DEDICATED joining agent, I/O shut until it ends; early clerk speech
  → `pending[]`, released whole. `clip-cache.ts` = μ-law 8kHz + cached (~7¢/call). Ends on Twilio
  `mark` · its own length (8 B/ms) · `agentPlayingUntil`; all miss → backstop. He warms 2s BEFORE the
  clip ends (a real clip = **5.1s**, he bills from socket open); `prewarmTimer` MUST stay OUT of
  `clipTimers` or a short clip leaves the clerk with no agent at all.
- **§5/6 HOLD.** `ConversationEar` (pure) hears QUIET · MUSIC (speech has gaps; music does not) · a
  RINGING LINE after a person = TRANSFER. Holds BACKDATED to when they actually went. **Both shapes
  built, neither chosen:** `gate` (default) and `reopen` (closes the session — the ONLY thing that
  stops the meter). Coming back he is told of the gap via `contextual_update`, never spoken aloud.
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT ON CODE.** `brain.ts` = a streaming
  chat-completions endpoint on **Sonnet 4.6** (owner-approved; a cheaper substitute is HIS call, not a
  workaround). ⚠️ The provider REFUSES a custom brain on an INSTANT VOICE CLONE and Branson/Branson
  HD/Fungie are all clones; the same agent WAS accepted with a premade voice, so the build is right.
  `ELEVENLABS_OURBRAIN_AGENT_ID` stays unset until the owner settles the voice.
  **The route is the only one NOT behind the admin login** — the provider does not sign requests, so
  the secret proves the caller and shape+replay+ceiling+whitelist prove the request.
- **§8 DROPPED CALL.** Status `call_dropped` + its Spanish together. Hang up, say NOTHING. Never
  charged. **Never written `completed`** — the only status the one-hour block matches, VERIFIED
  against a real db. Calling back <2min opens `RECONNECT_OPENER` (+ `_ES`); past that, normal.
- **§9 RECEIPT.** Charlie SEGMENTS (billed = SUM of open stretches, never first-open→last-close, or
  closing him for a hold reads FREE) · `brain` · `navOutcome` · `mapVersion` · `holdSeconds` MEASURED
  at last, not permanently null (`startMeter` flips null→a real 0).
- **§10 gaps closed.** `navPlanFromVersion`: presses, words and anchors off ONE version —
  `stageNavPromptPlan` DELETED (keyed on step SHAPE, expired, died on restart, could mix versions
  live). Gives the runtime STORE EXCEPTIONS. `looksLikeAPerson` stops keypad tones going into a live
  ear. `reportCallDrift` + callId ALREADY wired. **§2.4** the OLD direct lane writes a receipt too.
## SWITCHES + WHAT WE CREATED IN THE ACCOUNTS — do not delete these wondering what they are
`cheapBridgeAll` **THE BIG ONE: OFF = nothing above runs; every check takes the old path** ·
`stopKeysOnHuman` (ON) · `ourBrain` (blocked, §7) · `closeAgentOnHold` (OFF until Gate Zero). **Every
guessed number lives in `src/calls/tuning.ts`** (`call_tuning`, each with its reason + safe bounds).
- ElevenLabs agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` "— joining mid call" joins AFTER Delta's clip.
  Staging `ELEVENLABS_MIDCALL_AGENT_ID`; **PROD NOT SET**. Rebuild: `scripts/make-midcall-agent.ts`.
- ElevenLabs secret `check_brain_key` = proves the provider is calling our brain endpoint; its twin
  is Railway `BRAIN_API_KEY` (**staging only — REMOVED from prod**: unset = closed, and a promote must
  not arm it silently). Rebuild: `scripts/make-ourbrain-agent.ts`.
- **NO VOICE = NO CHECK** — refused loudly, never run the old way; `resolveWorkflow` fills the default
  in so the case cannot arise. Any other fallback stamps `fellBackToOldPath` on its receipt.
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = a REAL ws server as the provider + a real socket as the carrier,
  both wires watched, 38 asserts. + 44 runtime-spec · 33 listen-nav · 13 dropped-call (REAL db) · 63
  receipt · 55 mapgraph · 64 map-e2e · 13 bridge. `navPlanFromVersion` on staging's REAL Target + CVS
  = byte-identical to the chain rows, so no live route moved.
- **NOT VERIFIED: ANY REAL PHONE CALL** (the Fun store rings the OWNER'S phone). Needed: clip audible,
  no double greeting, no talk-over, receipt = 3 `charlie_join` + `mapVersion` + a real `holdSeconds`.
## Engine state (live 07-21/07-24) — Branson HD `1P1JhCcLzeMmkvLi1BkG`, 0.85, persona off
- Echo gate 520/150. Ringback by published tone frequencies; 6 rings = hang up. **Charlie
  $0.00183/s, per SECOND, meters SILENCE.** Twilio WHOLE MINUTES. 5.2c. Rates `src/calls/cost.ts`.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/*` is admin-gated as a whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta (`tapedeck.ts`)
  STAYS in the tree and still works — no store points at it.
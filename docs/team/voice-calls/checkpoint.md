# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, on staging. READ IT FIRST.
> §3 GATE ZERO IS THE ONLY THING LEFT AND IT NEEDS A PHONE. Both §6 shapes are BUILT; the gate picks
> which one runs, it does not decide whether to build. `scripts/gate-zero.ts` arms + scores the 6 calls.
- **§4/5 Delta is ONE CLIP through the bridge.** On a real person the clip plays out the media stream,
  Charlie PREWARMS behind it on a DEDICATED joining agent, I/O shut until it ends; early clerk speech
  → the existing `pending[]`, released whole. `clip-cache.ts` = μ-law 8kHz + cached (~7¢/call saved).
  Ends on Twilio `mark` · its own length (8 B/ms) · `agentPlayingUntil`; all miss → backstop +4s. He
  warms 2s BEFORE the clip ends (a real clip = **5.1s**, and he bills from socket open); `prewarmTimer`
  is kept OUT of `clipTimers` or a short clip leaves the clerk with NO agent at all.
- **§5/6 HOLD.** `ConversationEar` (pure, in listen-nav) hears QUIET · MUSIC (speech always has gaps;
  music never does) · a RINGING LINE after a person = TRANSFER. Holds are BACKDATED to when they
  actually went. **Both shapes built, neither chosen:** `gate` (default, cannot change what the store
  hears) and `reopen` (closes the session — the ONLY thing that stops the meter). On the way back he
  is told about the gap via `contextual_update`, never spoken aloud; >20s warns it may be someone new.
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT ON CODE.** `src/calls/brain.ts` is a streaming
  chat-completions endpoint (Groq llama-3.3-70b, via Helicone so the cost lands with everything else).
  **PROVEN live: first words 1.0s.** ⚠️ The provider REFUSES a custom brain on an INSTANT VOICE CLONE
  and Branson/Branson HD/Fungie are all clones. The same agent WAS accepted with a premade voice, so
  the build is right. Owner must choose: pay for a professional clone, or change the calling voice.
  Until then `ELEVENLABS_OURBRAIN_AGENT_ID` stays unset and every call uses the hosted model.
- **§8 DROPPED CALL.** Status `call_dropped` + its Spanish shipped together. Hang up, say NOTHING.
  Never charged. **Never written `completed`** — that is the only status the one-hour block matches,
  VERIFIED against a real db through the real query. Calling back <15min opens "I just got
  disconnected" (`RECONNECT_OPENER`, + `_ES`); past that the line has no shelf life and reverts.
- **§9 RECEIPT.** Charlie SEGMENTS (billed = SUM of open stretches, never first-open→last-close, or
  closing him for a hold reads as FREE) · `brain` · `navOutcome` · `mapVersion` · `holdSeconds` finally
  MEASURED not permanently null (`startMeter` flips null→a real 0).
- **§10 gaps closed.** `navPlanFromVersion`: presses, words and anchors off ONE version —
  `stageNavPromptPlan` DELETED (keyed on step SHAPE, 10min expiry, died on restart, could mix two
  versions live). Gives the runtime STORE EXCEPTIONS. `looksLikeAPerson` stops keypad tones going
  into a live ear. `reportCallDrift` + callId were ALREADY wired — do not rebuild them.
- **§2.4** the OLD direct lane now writes a thin receipt too, so no call is invisible.
## SWITCHES (Admin → Global → How calls are made) — all one tap, no deploy
`cheapBridgeAll` **THE BIG ONE: OFF = none of the above runs, every check takes the old path** ·
`stopKeysOnHuman` (ON) · `ourBrain` (blocked, see §7) · `closeAgentOnHold` (OFF until Gate Zero).
Staging `ELEVENLABS_MIDCALL_AGENT_ID` = `agent_2301kyk2rwgyfg8r50xk9enqwy2r`. **PROD NOT SET.**
Clip ONLY when `opts.voiceId` is set (workflow strip) so clip voice == agent voice.
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = a REAL ws server as the provider + a real socket as the carrier,
  both wires watched, 38 asserts. + 33 listen-nav · 30 runtime-spec · 13 dropped-call (REAL db) · 63
  receipt · 55 mapgraph · 64 map-e2e · 13 bridge. `ulaw_8000` proven live; `navPlanFromVersion` on
  staging's REAL Target + CVS = byte-identical to the chain rows, so no live route moved.
- **NOT VERIFIED: ANY REAL PHONE CALL.** The Fun store rings the OWNER'S phone. Needed: clip audible,
  no double greeting, no talk-over, receipt shows 3 `charlie_join` + `mapVersion` + a real
  `holdSeconds`. Fun 106361 is on "Branson Global" (moved off the old whole-call Delta).
## Engine state (verified live 07-21/07-24)
- Default agent both envs **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Echo gate
  520/150. Ringback by published tone frequencies (Goertzel, median >= .45); 6 rings = hang up.
- **MONEY (07-24):** Charlie **$0.00183/s**, per SECOND, meters SILENCE. Twilio WHOLE MINUTES. 5.2c
  baseline. Rates `src/calls/cost.ts`. Receipt contract: `docs/specs/call-receipt/`.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/*` is admin-gated as a whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- Old whole-call Delta (`tapedeck.ts`) STAYS in the tree and still works — no store points at it.

# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, on staging. READ IT FIRST.
> §3 GATE ZERO IS ALL THAT IS LEFT AND IT NEEDS A PHONE. Both §6 shapes BUILT; the gate picks which one
> runs, not whether to build. `scripts/gate-zero.ts` arms + scores the six calls.
- **§4/5 Delta is ONE CLIP** through the bridge; Charlie PREWARMS behind it on a DEDICATED joining agent, I/O shut till it ends, early speech → `pending[]` released whole. `clip-cache.ts` μ-law 8kHz cached (~7¢/call).
  Ends on `mark` · own length · playout clock → backstop. Warms 2s before the end, and `prewarmTimer`
  MUST stay OUT of `clipTimers` or a short clip leaves the clerk with NO agent at all.
- **§5/6 HOLD.** `ConversationEar`: QUIET · MUSIC · TRANSFER · dead air · line-gone (reported, not heard),
  BACKDATED. Both shapes built, NEITHER chosen: `gate` (default) · `reopen` (the only real saving).
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT CODE.** Streaming chat-completions on **Sonnet 4.6**.
  ⚠️ They REFUSE a custom brain on an INSTANT VOICE CLONE and Branson/HD/Fungie all are; a premade voice
  WAS accepted, so the build is right. Only route NOT behind the admin login: the secret proves the
  caller, shape+replay+ceiling+whitelist the request. `..._OURBRAIN_AGENT_ID` unset till he decides.
- **§8/9.** `call_dropped` + Spanish: hang up, say NOTHING, never charged, **never `completed`** (the only
  status the one-hour block matches — VERIFIED on a real db); same customer+store+product back <2min →
  `RECONNECT_OPENER`, never automatic. Receipt adds Charlie SEGMENTS (billed = SUM of open stretches,
  else closing him reads FREE) · `brain` · `navOutcome` · `holdSeconds` · **the TRANSCRIPT is OURS**,
  live per line (rule 2), text only. **§10** one version in, one plan out; `stageNavPromptPlan` DELETED.
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are.
`cheapBridgeAll` **THE BIG ONE: OFF = nothing above runs; every check takes the old path** ·
`stopKeysOnHuman` (ON) · `ourBrain` (blocked §7) · `closeAgentOnHold` (OFF till Gate Zero). **Every
guessed number is in `src/calls/tuning.ts`** (`call_tuning`, with reasons + bounds). Agent
`agent_2301kyk2rwgyfg8r50xk9enqwy2r` "— joining mid call" = staging `ELEVENLABS_MIDCALL_AGENT_ID`,
**PROD NOT SET** (`scripts/make-midcall-agent.ts`). Secret `check_brain_key` ↔ Railway `BRAIN_API_KEY`
(**staging only, REMOVED from prod**: unset = closed, a promote must not arm it). **NO VOICE = NO
CHECK**, refused loudly; any other fallback stamps `fellBackToOldPath`.
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
- **DRIVEN:** `test-delta-clip.ts` = a REAL ws server as provider + real socket as carrier, both wires
  watched, 38 asserts. + 6 GATES · 53 runtime-spec · 52 listen-nav · 15 dropped-call (REAL db) · 63
  receipt · 55 mapgraph · 64 map-e2e · 13 bridge. tsc clean. `navPlanFromVersion` on staging's REAL
  Target + CVS = byte-identical. `test-spec-line-by-line.ts`: 90 pass, 1 FAIL (7.12 salvage, NOT built), 10 need a phone.
- **NOT VERIFIED: ANY REAL PHONE CALL** (Fun rings the OWNER'S phone): clip audible, no double greeting,
  no talk-over, receipt = 3 `charlie_join` + `mapVersion` + a real `holdSeconds`. **STILL OPEN: cost
  per delivered answer** (§11) — needs real calls, deliberately not marked done.
## CROSS-CHECK — nobody marks their own homework (owner, 07-28). **Echo's audit of §10: all six of
Mapper's items present** (graph · store exceptions · language · hour+dow · failed attempts · callId on
observations), ONE ear, drift reported ONCE. Clean. **Mapper owes the reverse audit of §§2/4/5/6/7/8/9.**
## Engine state — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs, 07-28) · echo gate 520/150 ·
ringback by published tone frequencies, 6 rings = hang up · **Charlie $0.00183/s per SECOND, meters
SILENCE** · Twilio WHOLE MINUTES · 5.2c baseline · `src/calls/cost.ts` · `docs/specs/call-receipt/`.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/*` is admin-gated whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta STAYS in the tree.
- Admin's Live/Staging switch drives the VOICE WORKFLOW on reads **and** writes (`vtApi`, app.html);
  every other setting still edits Live only. Before 07-28 the Designer saved to Live from either side.

# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, on staging. READ IT FIRST.
> §3 GATE ZERO IS ALL THAT IS LEFT AND IT NEEDS A PHONE. Both §6 shapes BUILT; the gate picks which one
> runs, not whether to build. `scripts/gate-zero.ts` arms + scores the six calls.
- **§4/5 Delta is ONE CLIP**; Charlie prewarms behind it on a dedicated joining agent, early speech →
  `pending[]`. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent.
- **§5/6 HOLD.** `ConversationEar`: QUIET · MUSIC · TRANSFER · dead air · line-gone, BACKDATED. Both
  shapes built, NEITHER chosen: `gate` (default) · `reopen` (the only real saving).
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT CODE.** ⚠️ They REFUSE a custom brain on an
  INSTANT VOICE CLONE and Branson/HD/Fungie all are; a premade voice WAS accepted, so the build is
  right. Only route NOT behind the admin login. `..._OURBRAIN_AGENT_ID` unset till he decides.
- **§8/9.** `call_dropped`: **never written `completed`** — the only status the one-hour block matches,
  VERIFIED on a real db. Receipt bills Charlie as the SUM of open stretches, else closing him for a
  hold reads FREE. **The TRANSCRIPT is OURS**; `transcriptPatch` stops the provider overwriting it.
- **ONE QUESTION, THEN WRAP, BOTH LANES.** `declaresOneTurn` (tapedeck): an EMPTY `followups.type`
  means set+format folded into the `set` line. Clip lane skips clip 2; live agent gets
  `oneTurnFollowup`/`oneTurnShipmentDay`, on the bridge AND the old direct path.
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are.
`cheapBridgeAll` **THE BIG ONE: OFF = nothing above runs, every check takes the old path** ·
`stopKeysOnHuman` ON · `ourBrain` blocked §7 · `closeAgentOnHold` OFF till Gate Zero. **Every guessed
number is in `src/calls/tuning.ts`.** Agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` "— joining mid call"
= staging `ELEVENLABS_MIDCALL_AGENT_ID`, **PROD NOT SET**. Secret `check_brain_key` ↔ Railway
`BRAIN_API_KEY` (**staging only, REMOVED from prod**). **NO VOICE = NO CHECK**, refused loudly.
## 07-28 MAPPING CALLS NOW HAVE THE EAR — the SHARED one (2 real CVS calls drove it)
- Alhambra 11654 → 91s ("this is Catalina"), 65→95. Mulholland 1 → 84s and that 84 was a LIE: hold
  music, nobody spoke. **A `PickupEar` was built here and DELETED the same night — §10 says ONE shared
  Ear. Do not build it again.** `navigator` opens the same `<Start><Stream>` fork and feeds
  `PromptDetector` + `ConversationEar` (`navMediaFeed`); fork dies → behaves exactly as before.
- The Ear is a **VETO, never a green light**: words AND not-music/not-quiet. Ring frequencies are in
  the LOCKED bridge, so a ringing desk can still look like a voice; a veto cannot invent a person.
- **Anchors come off the Ear's recording count** (`earPrompts`) so what we learn and what the runtime
  fires on cannot disagree. `greetingFrom()` = THIS turn's words, never a routing line.
  `looksLikeDirectPickup()` = a store that already played a recording does not answer direct.
- **SPOKEN menus captured** (`parseSpokenOptions`) — CVS reads departments aloud and we kept nothing.
  Chain row adds first/best/saved seconds + calls + stores; `chainDetail.calls` = every call
  turn-by-turn. **Comp 2g exists; app.html NOT built yet.**
- **PM: bail's else-branch blind-joins Charlie on a stopwatch if bail is off** (locked bridge; owner has it). `.unlock` is blocked by the sprawl gate.
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = REAL ws provider + real carrier socket, 38 asserts. + 53
  runtime-spec · 33 listen-nav · 15 dropped-call (REAL db) · 63 receipt · 62 mapgraph · 90 map-e2e ·
  76 map-sim · 13 bridge. tsc clean. `navPlanFromVersion` on staging's REAL Target + CVS =
  byte-identical. `test-spec-line-by-line.ts`: 1 FAIL (7.12 salvage, NOT built). 
- **NOT VERIFIED: ANY REAL PHONE CALL** (Fun rings the OWNER'S phone): clip audible, no double
  greeting, no talk-over, receipt = 3 `charlie_join` + `mapVersion` + a real `holdSeconds`. **STILL
  OPEN: cost per delivered answer** (§11) — needs real calls, deliberately not marked done.
## CROSS-CHECK — nobody marks their own homework (owner, 07-28). **Echo's audit of §10: all six of
Mapper's items present**, ONE ear, drift reported ONCE. Clean. **Mapper's audit of §§0-9+12: DONE —
`scripts/test-spec-sweep.ts` = 85 pass, 0 fail, 9 named as needing a phone; proved it BITES first
(second listener · stale unlock · a dialer with no receipt each took the number down).**
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by
published tone frequencies, 6 rings = hang up · **Charlie $0.00183/s per SECOND, meters SILENCE** ·
Twilio WHOLE MINUTES · 5.2c baseline · `src/calls/cost.ts` · `docs/specs/call-receipt/`.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/*` is admin-gated whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta STAYS in the tree.
- Admin's Live/Staging switch drives the VOICE WORKFLOW on reads **and** writes (`vtApi`, app.html);
  every other setting still edits Live only. Before 07-28 the Designer saved to Live from either side.

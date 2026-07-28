# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, ON for staging. READ IT FIRST.
> **ON for staging** (`cheapBridgeAll`). §3's six calls are all that is left and they need his phone; `scripts/gate-zero.ts` arms + scores them.
- **§4/5 Delta is ONE CLIP**; Charlie prewarms behind it on a dedicated joining agent, early speech →
  `pending[]`. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent.
- **§5/6 HOLD.** `ConversationEar`: QUIET · MUSIC · TRANSFER · dead air · line-gone, BACKDATED. Both shapes
  still built; **`reopen` ALWAYS runs** (owner picked it 07-28; `gate` is now dead weight).
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT CODE.** ⚠️ They REFUSE a custom brain on an INSTANT
  VOICE CLONE and Branson/HD/Fungie all are; a premade voice WAS accepted, so the build is right. Only route
  NOT behind the admin login. `..._OURBRAIN_AGENT_ID` unset till he decides.
- **§8/9.** `call_dropped`: **never written `completed`**, the only status the one-hour block matches (VERIFIED
  on a real db). Charlie is billed as the SUM of open stretches, else closing him for a hold reads FREE.
  **The TRANSCRIPT is OURS**; `transcriptPatch` stops the provider overwriting it.
- **ONE QUESTION, THEN WRAP, BOTH LANES.** `declaresOneTurn` (tapedeck): an EMPTY `followups.type` means set+format folded into the `set` line. Clip lane skips clip 2; live agent gets `oneTurnFollowup`/`oneTurnShipmentDay`, on the bridge AND the old direct path.
  Branson Global carries his two lines; both say **WORD FOR WORD**, because told to ask "in your own natural voice" the agent rewrote his restock line and lost the day and the time (real Fun call 07-28).
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are.
`cheapBridgeAll` **THE BIG ONE: OFF = every check takes the old path. ON for STAGING 07-28**, prod OFF till
a promote · `ourBrain` blocked §7, renamed **Charlie on Anthropic API**, moved to Calls ▸ App.
**`stopKeysOnHuman` + `closeAgentOnHold` ARE NO LONGER SWITCHES** (owner 07-28): forced true in `getPolicy`
AFTER the merge, because both saved blobs carry false. **Every guessed number is in `src/calls/tuning.ts`.**
Agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` "— joining mid call" = staging `ELEVENLABS_MIDCALL_AGENT_ID`,
**PROD NOT SET**. `check_brain_key` ↔ Railway `BRAIN_API_KEY` (staging only). **NO VOICE = NO CHECK.**
## 07-28 THE LIVE/STAGING SWITCH STEERS THE CALL FLAGS, reads AND writes (`envApi`, app.html)
- `ENV_FLAGS` (app.html) **must equal** `KEEP_LOCAL_FLAGS` (settings-sync) or the prod mirror stomps a staging
  test inside a minute; a spec check compares the lists. Everything else on Policy still reads+writes LIVE
  (the 07-24 brand-toggle snap-back). Driven: `qa-admin-env-switch.mjs`, 21 asserts.
- **PM: `/api/admin/receipt/:room` returns seconds+cost NULL for an ATTACHED call** (the roll-up is stamped on the call row); `/api/calls/:id/receipt` is full. One envelope, two answers.
## 07-28 MAPPING CALLS NOW HAVE THE EAR — the SHARED one (2 real CVS calls drove it)
- Mulholland 1 → 84s and that 84 was a LIE: hold music, nobody spoke. **A `PickupEar` was built here and
  DELETED the same night; §10 says ONE shared Ear, do not build it again.** `navigator` forks the same
  `<Start><Stream>` into `PromptDetector` + `ConversationEar`; fork dies → same as before. The Ear is a
  **VETO, never a green light**: words AND not-music/not-quiet, and it cannot invent a person.
- **Anchors come off the Ear's recording count** (`earPrompts`) so what we learn and what the runtime fires on
  cannot disagree. `greetingFrom()` = THIS turn's words. `looksLikeDirectPickup()` = a store that already
  played a recording does not answer direct. **SPOKEN menus captured** (`parseSpokenOptions`); `chainDetail.calls`
  = every call turn-by-turn. **Comp 2g SHIPPED** (chain → Mapping calls), 15 asserts.
- **PM: bail's else-branch blind-joins Charlie on a stopwatch if bail is off** (locked bridge; owner has it). `.unlock` is blocked by the sprawl gate.
## 07-28 CHAIN PAGE REBUILD: comps + strings DONE, **PARKED ON HIS GO**. `docs/specs/mapping-admin/plan.md`
is the whole box; strings in `copy.md`; comps 2f rev + 2h/2i/2j/2k.
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = REAL ws provider + real carrier socket, 38 asserts. + 53 runtime-spec ·
  33 listen-nav · 15 dropped-call (REAL db) · 63 receipt · 62 mapgraph · 90 map-e2e · 76 map-sim · 13 bridge ·
  15 mapping-calls + 21 env-switch (Chromium). tsc clean. `test-spec-line-by-line.ts`: 95/96, 1 FAIL (7.12).
- **REAL STAGING-SITE CHECK 07-28 (me, Fun store):** `/pub/check` → `bridge:<room>`, receipt = 14 events,
  dial 0s · ring 15s · person 19s · `charlie_leave` strategy **reopen** · hangup 20s, 1.7¢. The line hung up
  ~5s in: NO conversation, verdict `nobody_answered`, transfer detector fired TWICE inside one second.
- **REAL FUN CALLS 07-28 (owner):** waits for his greeting, asks ONCE, got "next Tuesday", wrapped in 28s, transcript rendered. **KNOWN, HE CHOSE TO LEAVE IT:** the held greeting flushes to the agent WITH the answer, so both land as ONE `user_transcript` ("This is Bob.Um, I'm sorry, we don't."); the name at the START needs OUR OWN speech-to-text (we hold sound, not words) = a pause + a cost per call.
  **STILL OPEN: cost per delivered answer** (§11), and 3 `charlie_join` + a real `holdSeconds` on a call.
- **Gate Zero reads the PROVIDER's own per-call cost now** (`metadata.charging`, voice vs brain split) and SUMS
  every conversation the call opened, because a held call closes one and opens another. Proven on my staging
  call: 2 conversations, 10 credits, while the account total moved 0.
## CROSS-CHECK (owner 07-28). **Echo's audit of §10: all six of Mapper's items present**, ONE ear, drift reported ONCE. **Mapper's audit of §§0-9+12: `test-spec-sweep.ts` = 85 pass, 0 fail, 9 need a phone.**
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c
baseline · `src/calls/cost.ts` · `docs/specs/call-receipt/`.
## Traps — never run the full suite for a small change; never deploy while he is mid-test-call.
- `/api/*` is admin-gated whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta STAYS in the tree.

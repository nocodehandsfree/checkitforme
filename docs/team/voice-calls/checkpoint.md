# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## 07-28 THE LIVE CALL RUNTIME — ALL of `docs/specs/live-call-runtime/` built, ON for staging. READ IT FIRST.
> §3's six calls are all that is left and they need his phone; `scripts/gate-zero.ts` arms + scores them.
- **§4/5 Delta is ONE CLIP**; Charlie prewarms behind it, early speech → `pending[]`. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent.
- **§5/6 HOLD.** `ConversationEar`: QUIET · MUSIC · TRANSFER · dead air · line-gone, BACKDATED. **`reopen`
  ALWAYS runs** (owner picked it 07-28; `gate` is dead weight).
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT CODE.** ⚠️ They REFUSE a custom brain on an INSTANT
  VOICE CLONE and Branson/HD/Fungie all are. Only route NOT behind the admin login; `..._OURBRAIN_AGENT_ID` unset.
- **§8/9.** `call_dropped`: **never written `completed`**, the only status the one-hour block matches.
  Charlie is billed as the SUM of open stretches. **The TRANSCRIPT is OURS** (`transcriptPatch`).
- **ONE QUESTION, THEN WRAP, BOTH LANES.** `declaresOneTurn` (tapedeck): an EMPTY `followups.type` means set+format folded into the `set` line. Clip lane skips clip 2; live agent gets `oneTurnFollowup`/`oneTurnShipmentDay`, on the bridge AND the old direct path. Branson Global's two lines both say **WORD FOR WORD**: told to ask "in your own natural voice" the agent rewrote his restock line and lost the day and the time (real Fun call 07-28).
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are.
`cheapBridgeAll` **THE BIG ONE: OFF = every check takes the old path. ON for STAGING 07-28**, prod OFF till
a promote · `ourBrain` blocked §7, renamed **Charlie on Anthropic API**, moved to Calls ▸ App.
**`stopKeysOnHuman` + `closeAgentOnHold` ARE NO LONGER SWITCHES**: forced true in `getPolicy` AFTER the
merge, because both saved blobs carry false. **Every guessed number is in `src/calls/tuning.ts`.** Agent
`agent_2301kyk2rwgyfg8r50xk9enqwy2r` = staging `ELEVENLABS_MIDCALL_AGENT_ID`, **PROD NOT SET**.
`check_brain_key` ↔ Railway `BRAIN_API_KEY` (staging only). **NO VOICE = NO CHECK.**
## 07-28 THE LIVE/STAGING SWITCH STEERS THE CALL FLAGS, reads AND writes (`envApi`, app.html)
- `ENV_FLAGS` (app.html) **must equal** `KEEP_LOCAL_FLAGS` (settings-sync) or the prod mirror stomps a staging
  test inside a minute; a spec check compares the lists. Everything else on Policy still reads+writes LIVE
  (the 07-24 brand-toggle snap-back). Driven: `qa-admin-env-switch.mjs`, 21 asserts.
- **PM: `/api/admin/receipt/:room` returns seconds+cost NULL for an ATTACHED call** (the roll-up is stamped on the call row); `/api/calls/:id/receipt` is full. One envelope, two answers.
## 07-28 MAPPING CALLS NOW HAVE THE EAR — the SHARED one (2 real CVS calls drove it)
- **A `PickupEar` was built here and DELETED the same night; §10 says ONE shared Ear, do not build it again.**
  `navigator` forks the same `<Start><Stream>` into `PromptDetector` + `ConversationEar`. The Ear is a
  **VETO, never a green light**, and it cannot invent a person.
- **Anchors come off the Ear's recording count** (`earPrompts`). `greetingFrom()` = THIS turn's words;
  `looksLikeDirectPickup()` = a store that already played a recording does not answer direct. **Comp 2g
  SHIPPED**, 15 asserts.
- **PM: bail's else-branch blind-joins Charlie on a stopwatch if bail is off** (locked bridge; owner has it). `.unlock` is blocked by the sprawl gate.
## 07-29 CHAIN PAGE REBUILD, **BUILDING**. `docs/specs/mapping-admin/plan.md` = the box, `copy.md` = every
string (**a control panel talks to nobody**), comps 2f rev + 2h/2i/2j/2k. Steps 1-4 SHIPPED to Admin:
- **`menuStillTalking`** (navigator): the MODEL's "human" is not proof. Tarzana's "A healthcare provider."
  was the recording's own tail and it became a store recipe. Vetoes ONLY that shape (nothing of ours fired
  · 2+ recordings played · no handoff announced · words are not a person). 7 asserts cover every exit.
- **NAV TIME ≠ time to Staff.** `navSecondsOf` (handoff measured, else last step) is for READING;
  `seconds` stays what `connectAtSecFor` opens Charlie on, or he joins a ringing desk. `reachedPct` added.
- Page: nav hero · nav cost (line + FORK, `forkPerMinUsd` now pulled from cost.ts, was counted 0) ·
  ladder ends "Rings the desk" · ONE source so 67 vs 62 is gone · Versions → **Recipes** (Tree Recipe vN,
  nav time, locked date, set aside behind a key). **LEFT: 2h conditions · 2j · 2k · re-listen · bin CVS junk.**
## VERIFIED / NOT VERIFIED
- **DRIVEN:** `test-delta-clip.ts` = REAL ws provider + real carrier socket, 38 asserts. + 53 runtime-spec ·
  33 listen-nav · 15 dropped-call (REAL db) · 63 receipt · 62 mapgraph · 90 map-e2e · **83 map-sim** · 13
  bridge · 15 mapping-calls + 12 chain-page + 21 env-switch (Chromium). tsc clean. line-by-line 95/96.
- **REAL STAGING-SITE CHECK 07-28 (me, Fun store):** 14 events, dial 0s · ring 15s · person 19s · `charlie_leave` **reopen** · hangup 20s, 1.7¢. Line hung up ~5s in, so NO conversation.
- **REAL FUN CALLS 07-28 (owner):** waits for his greeting, asks ONCE, got "next Tuesday", wrapped in 28s.
  **KNOWN, HE CHOSE TO LEAVE IT:** the held greeting flushes WITH the answer so both land as ONE
  `user_transcript`; the name at the START needs OUR OWN speech-to-text = a pause + a cost per call.
  **STILL OPEN: cost per delivered answer** (§11), and 3 `charlie_join` + a real `holdSeconds` on a call.
- **Gate Zero reads the PROVIDER's own per-call cost** (`metadata.charging`), SUMMED over every conversation the call opened.
## CROSS-CHECK (owner 07-28). **Echo's audit of §10: all six of Mapper's items present**, ONE ear, drift reported ONCE. **Mapper's audit of §§0-9+12: `test-spec-sweep.ts` = 85 pass, 0 fail, 9 need a phone.**
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c
baseline · `src/calls/cost.ts` · `docs/specs/call-receipt/`.
## Traps — never run the full suite for a small change; never deploy while he is mid-test-call.
- `/api/*` is admin-gated whole — a route for a THIRD PARTY must be exempted or it 401s silently.
- Auto-nav 0-hammers when it can't parse → FALSE "no human". Old whole-call Delta STAYS in the tree.

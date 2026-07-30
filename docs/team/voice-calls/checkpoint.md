# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## THE LIVE CALL RUNTIME — all of `docs/specs/live-call-runtime/` built, ON for staging. READ THAT SPEC FIRST; this file is only traps + what is open. §3's six calls need HIS phone (`scripts/gate-zero.ts`).
- **Delta is ONE CLIP**, Charlie prewarms behind it. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent. **NO VOICE = NO CHECK.**
- **HOLD: `reopen` ALWAYS runs**. **THE FLAP IS DEAD** (receipt 199: 10 false transfers on a direct dial). ONE 20ms frame declared a transfer; BOTH edges need a RUN — `transferToneMs` 600 (a real burst is 2000) · `backVoiceMs` 400, in `tuning.ts`. **A transfer ALSO opens `hold_start`**; **`charlie_join` fires ONCE**.
- **§7 BRAIN — BUILT, BLOCKED ON A VOICE DECISION, NOT CODE.** ⚠️ They REFUSE a custom brain on an INSTANT VOICE CLONE and Branson/HD/Fungie all are. Only route NOT behind the admin login; `..._OURBRAIN_AGENT_ID` unset.
- `call_dropped` is **never written `completed`** (the only status the one-hour block matches); Charlie bills as the SUM of open stretches. **`rollupFromRow` is the ONLY reader of a stamped call row**, both receipt routes use it.
- **ONE QUESTION, BOTH LANES.** `declaresOneTurn` (tapedeck): an EMPTY `followups.type` = set+format folded into the `set` line. Branson Global's lines say **WORD FOR WORD** or the agent rewrites them and loses the day.
## 07-29 THE READER RULE WAS HALF-WIRED. Three of five finalize paths passed `needSecond ? second : null`, false exactly when the live read had an opinion, so live=IN + reader=OUT became a green AND a charge. **`consensusFor` reconciles ALWAYS**; **spec gate 4 FAILS THE PUSH** otherwise. `Test — One Question` (Branson HD, Fun store) = THE WORKFLOW HIS SIX CALLS RUN; `scripts/make-test-workflow.ts` is the definition AND the writer. **`vt_*` is staging-only.**
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS — do not delete these wondering what they are.
`cheapBridgeAll` **THE BIG ONE: OFF = every check takes the old path. ON for STAGING**, prod OFF till a promote · `ourBrain` blocked §7 (**Charlie on Anthropic API**) · `askForTransfer` ON. **`stopKeysOnHuman` + `closeAgentOnHold` ARE NO LONGER SWITCHES**: forced true in `getPolicy` AFTER the merge, because both saved blobs carry false. **Every guessed number is in `src/calls/tuning.ts`.** Agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` = staging `ELEVENLABS_MIDCALL_AGENT_ID`, **PROD NOT SET**; `check_brain_key` ↔ `BRAIN_API_KEY` (staging only).
**`ENV_FLAGS` (app.html) must equal `KEEP_LOCAL_FLAGS` (settings-sync)** or the prod mirror stomps a staging test inside a minute; a spec check compares the lists. **A NEW call flag goes in BOTH.**
## 07-30 THE WRONG-DEPARTMENT SAVE — SHIPPED, `askForTransfer` DEFAULT ON, Calls ▸ App (comp 1i). Rule in
`prompts.ts` on `{{ask_for_transfer}}` (kiosk shape); BOTH lanes read the ONE switch. **Wrong department is WORDS,
never the Ear (§10)**: `heardWrongDepartment` (pure, beside its rule) read where the voicemail phrases are →
`unknown`+`wrongDepartment:true` → `learnFromReceipt` kind `wrong-department` + decay. THREE GAPS CLOSED: **a
hand-over is ALWAYS a new person** (the 20s stopwatch left Charlie mid-answer with a stranger) · **the gap note
was NEVER sent on a reopen** (the branch returned first) · **a SILENT hand-over** (no ringback = a quiet pause to
the ear) is caught because he ASKED to be put through — `askedToBePutThrough` in prompts.ts is the ONE copy, read
by the bridge AND the scorecard. Gates **O.5 · O.6 · O.7**; **7.1b fixed** (it grepped `'ourBrain',`).
## 07-30 TESTING = CHARLIE BEHAVIOR, **THREE rows, ONLY Charlie** (he rewrote it line by line). Lists EVERY
staging check (`config.staging.on` in `/api/admin/test-calls`), 10 a page. **Meter stopped · Transfer requested ·
Re-asked after transfer.** DELETED, and do NOT put them back: `asked_once` (the workflow locks one question),
`mapping_held` + `no_keypad_at_person` — **OWNER RULE: walking a menu is not a test, it works or the check fails,
and the check failing IS the report.** A row belongs here only if a WORKING check could hide it from him. Copy is
ASSERTED in `test-behaved.ts`. Steps = **Staff greeting · Charlie joined · Charlie dropped · Charlie left · Check
ended**, ONE fact per line. Cost = **Menu Nav (Alpha|Bravo|None) · Charlie · Total**, no info bubbles. **BUG
FIXED: `callSeconds` is only written by the OLD path, so every new-engine check printed 0s; `rollupFromRow` reads
the last step.** **NEXT ECHO: run the test calls WITH him, §5 ladder + §6 handoff in `echo-wrong-department-save.md`. Six calls PLUS the transfer piece.** Testing lists his OWN checks on LIVE too now (staging: everything · elsewhere: owner-only stores OR his account). **PM: promote wanted — the engine + the server half of Testing are staging-only; 139 commits ride along.**
## THE ONE EAR — **a `PickupEar` was built here and DELETED the same night; §10 says never build a second.** It is a **VETO, never a green light**, cannot invent a person, and anchors come off its own recording count.
- **PM: bail's else-branch blind-joins Charlie on a stopwatch if bail is off** (locked bridge; owner has it). **`.unlock` WORKS** — the sprawl gate only hooks Write, so `printf 'src/voice/**\n' > .unlock` opens it; fix that scope ONLY, then DELETE it.
## 07-30 CHAIN PAGE + RE-LISTEN: BUILT + SHIPPED. Box `docs/specs/mapping-admin/plan.md`, strings `copy.md` (**a control panel talks to nobody**), comps 2f rev + 2h/2i/2j/2k.
- **`menuStillTalking`**: the MODEL's "human" is NOT proof (Tarzana's "A healthcare provider." was a recording's tail and became a store recipe). **NAV TIME ≠ time to Staff:** `navSecondsOf` is for READING; `seconds` is what `connectAtSecFor` opens Charlie on. A ring-ended call writes `seconds: null` ON PURPOSE = no timer. **Never let a ring moment become `seconds`.**
- **A RING-ENDED CALL IS A GOOD MAP, NOT A MISS** — `endedOnRing` (set in `finish` off `status==="mapped"`; `s.status` is already "done" by then, so it MUST travel on its own). FOUR readers guessed off `reachedHuman` and read a perfect re-listen as a failure: `navSecondsOf` · `trendOf` · `scoreConfidence` · the recent-fails flag. **`reachedPctOf` counts ONLY calls that waited for Staff** → null, never a false 0%.
- **RE-LISTEN** (`relisten`): walks the KNOWN route, **hangs up on the SECOND REAL RING** (`ConversationEar.rings`), never asks, IS lockable. **EVERY call feeds the map** — `recordNavCall` from `finish`; sweep + mapper pass `callerRecords:true`.
- **CVS (chain 5) DONE + PROVEN 07-30, seven real checks to Lanett (11373).** Final two: 49s + 58s → **nav 54s, an AVERAGE** (`Math.min` was wrong; a check must NUDGE, not overwrite) · v1 · Review empty · menu 4 clean lines. **THE PAGE HAS TWO COPIES OF EVERY RULE** (`versionNavSecs` + `menuLadder`): fix a mapgraph reader → grep app.html.
- **THE CLOCK IS GONE FROM A RE-LISTEN.** It ran the route as ONE timed block, listener opened only at the END (4-line menu recorded as 1 line); firing on recorded seconds then walked AHEAD of a late menu. Now: ordinary gather loop, steps fired from `navTurn`, cue = the prompt naming our word else `isMenuLine`/`looksLikeQuestion`; `isReprompt` REPEATS the last answer. **Never re-introduce `atSec >=`.**
- **A BARGE CUTS THE RECORDING MID-SENTENCE**; the tail returns as a stray line, so it is JOINED to the previous store line: within `TAIL_SEC` 5 (measured: a tail is ≤4s out, the next prompt ≥9s), ≤`TAIL_WORDS` 14, not a menu, not the handoff. **Punctuation cannot be the test** — the same tail came back with and without a "?".
- **AN OFFER TO CONNECT IS NOT THE HANDOFF.** "just say what you'd like to do and I can connect you" tripped `ROUTING_RE` mid menu and a re-listen hung up one answer short. `routeUnfinished` gates that branch: while a step is still owed, the menu cannot be finished with us. Re-listen only; the live path is untouched.
- **SCREEN WORDS COME FROM Statuses, NOWHERE ELSE.** A check we ended reads **Admin hung up** (`endedOnRing` rides the run log → `MapCall`), never "nobody picked up". Menu ladder takes the NEWEST check, never the longest. "observed once"/"observed multiple times" + `confColor` DELETED from every screen; "needs review" stays.
- **NEXT: Walgreens (chain 10), NOT a re-listen.** Live v1 is the hammer route `press 0 ×4`. Re-map fresh, 9 stores, ALL Pacific. Keypad, so it proves the ladder prints **ALPHA**; CVS proved BRAVO.
## VERIFIED / NOT VERIFIED · **RAILWAY:** `deploymentCancel` on a wedged deploy errors once, retry lands; pushes queue and build one at a time.
- **DRIVEN 07-30:** 131 map-sim · 69 delta-clip (REAL ws + real carrier socket, incl. the SILENT hand-over) · 65
  prompts · 60 behaved · 100 map-e2e (2 PRE-EXISTING fails, Chains work) · 43 listen-nav · 72 receipt · 13 bridge
  · 9 runtime-gates. tsc + spec gates clean. **line-by-line 99/101** (7.12 only).
- **07-30 LIVE ON STAGING:** the wrong-department switch reads ON; the Fun store's rendered instructions carry the rule; flipping it OFF makes them say never ask; left ON. Checks 204/205 clean.
- **STILL OPEN, needs REAL CUSTOMER checks:** §11 cost per delivered answer · a real `holdSeconds` > 0. **7.12 NOT
  BUILT.** **NOT PROVEN, needs HIS phone:** the save with a real human saying "this is the pharmacy". All else is.
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c base ·
**all FOUR dial paths open a receipt** (bridge-place · navigator · tapedeck · native `direct:<id>`).
## Traps — never run the full suite for a small change; never deploy while he is mid-test-call. `/api/*` is
admin-gated whole (a THIRD-PARTY route must be exempted or it 401s silently). Auto-nav 0-hammers when it cannot
parse → FALSE "no human". Old whole-call Delta STAYS in the tree.

# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## THE LIVE CALL RUNTIME — all of `docs/specs/live-call-runtime/` built, ON for staging. READ THAT SPEC FIRST; this file is only traps + what is open. §3's six calls need HIS phone (`scripts/gate-zero.ts`).
- **Delta is ONE CLIP**, Charlie prewarms behind it. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent. **NO VOICE = NO CHECK.**
- **HOLD: `reopen` ALWAYS runs**. **THE FLAP IS DEAD** (receipt 199: 10 false transfers on a direct dial). ONE 20ms frame declared a transfer; BOTH edges need a RUN — `transferToneMs` 600 (a real burst is 2000) · `backVoiceMs` 400, in `tuning.ts`. **A transfer ALSO opens `hold_start`**; **`charlie_join` fires ONCE**. **07-31 TIMER AUDIT: NOTHING ends a mid-check hold** — only `maxCallSeconds` (300 on staging, ridden to Twilio as `timeLimitSec`). `holdMaxSeconds` (Admin "Hold max seconds", 60; code fallback 45) is **NOT a hang-up** — it OPENS Charlie when no human was ever heard. `ivrMaxSeconds` (90) is **WIRED TO NOTHING** — a dead Admin box. `ringMaxSeconds` 35 is the ONLY real give-up. **PM: owner wants a hold hang-up; number undecided (I proposed 90s).**
- **§7 BRAIN — BLOCKED BY *THEM*, PROVEN 07-31, NOT OUR CONFIG.** custom LLM + an INSTANT clone is refused on agent CREATE **and** UPDATE (`custom_llm_not_allowed_in_with_agent_with_ivc_voice`); the SAME setting is accepted instantly with a `premade` OR `professional` voice — so it is the VOICE, nothing else. Branson HD is `cloned`, `is_allowed_to_fine_tune:false`. Plain `/v1/text-to-speech` with it returns audio (200), so building the talking ourselves keeps the voice. Creator plan: `professional_voice_limit:1`, `voice_limit:30`. **Owner emailed them to lift it**; else PVC (30 min + the real speaker verifying) or we own the conversation. Only route NOT behind the admin login; `..._OURBRAIN_AGENT_ID` unset.
- `call_dropped` is **never written `completed`** (the only status the one-hour block matches); Charlie bills as the SUM of open stretches. **`rollupFromRow` is the ONLY reader of a stamped call row**, both receipt routes use it.
- **ONE QUESTION, BOTH LANES.** `declaresOneTurn` (tapedeck): an EMPTY `followups.type` = set+format folded into the `set` line. Branson Global's lines say **WORD FOR WORD** or the agent rewrites them and loses the day.
## 07-29 THE READER RULE WAS HALF-WIRED. Three of five finalize paths passed `needSecond ? second : null`, false exactly when the live read had an opinion, so live=IN + reader=OUT became a green AND a charge. **`consensusFor` reconciles ALWAYS**; **spec gate 4 FAILS THE PUSH** otherwise. `Test — One Question` (Branson HD, Fun store) = THE WORKFLOW HIS SIX CALLS RUN; `scripts/make-test-workflow.ts` is the definition AND the writer. **`vt_*` is staging-only.**
## SWITCHES + WHAT WE MADE IN THE ACCOUNTS. Do not delete these wondering what they are. `cheapBridgeAll` **THE BIG ONE: OFF = every check takes the old path. ON for STAGING**, prod OFF till a promote · `ourBrain` blocked §7 (**Charlie on Anthropic API**) · `askForTransfer` ON. **`stopKeysOnHuman` + `closeAgentOnHold` ARE NO LONGER SWITCHES**: forced true in `getPolicy` AFTER the merge, because both saved blobs carry false. **Every guessed number is in `src/calls/tuning.ts`.** Agent `agent_2301kyk2rwgyfg8r50xk9enqwy2r` = staging `ELEVENLABS_MIDCALL_AGENT_ID`, **PROD NOT SET**; `check_brain_key` ↔ `BRAIN_API_KEY` (staging only).
**`ENV_FLAGS` (app.html) must equal `KEEP_LOCAL_FLAGS` (settings-sync)** or the prod mirror stomps a staging test inside a minute; a spec check compares the lists. **A NEW call flag goes in BOTH.**
## 07-30 THE WRONG-DEPARTMENT SAVE: SHIPPED, `askForTransfer` DEFAULT ON, Calls ▸ App (comp 1i). Rule in
`prompts.ts` on `{{ask_for_transfer}}`; BOTH lanes read the ONE switch. **Wrong department is WORDS, never the Ear
(§10)**: `heardWrongDepartment` → `unknown`+`wrongDepartment:true` → `learnFromReceipt` + decay. **A hand-over is
ALWAYS a new person** · the gap note must survive a reopen · a SILENT hand-over is caught because he ASKED
(`askedToBePutThrough` is the ONE copy, read by the bridge AND the scorecard). Gates **O.5 · O.6 · O.7**.
## 07-30 TESTING = CHARLIE BEHAVIOR, **THREE rows, ONLY Charlie**: Meter stopped · Transfer requested · Re-asked
after transfer. Lists EVERY staging check, 10 a page. DELETED, do NOT restore: `asked_once`, `mapping_held`,
`no_keypad_at_person` — **OWNER RULE: walking a menu is not a test; the check failing IS the report.** A row
belongs only if a WORKING check could hide it from him. Copy ASSERTED in `test-behaved.ts`. Steps = Staff greeting
· Charlie joined · dropped · left · Check ended. Cost = Menu Nav · Charlie · Total. **`callSeconds` is OLD-path
only, so `rollupFromRow` reads the last step.** **NEXT ECHO: the test calls WITH him** (`echo-wrong-department-
save.md`, six checks plus the transfer piece). **PM: promote wanted — the engine + Testing's server half are
staging-only.**
## THE ONE EAR — **a `PickupEar` was built here and DELETED the same night; §10 says never build a second.** A **VETO, never a green light**; anchors come off its own recording count. **PM: bail's else-branch blind-joins Charlie on a stopwatch if bail is off** (locked bridge). **`.unlock` WORKS**: the sprawl gate only hooks Write, so `printf 'src/voice/**\n' > .unlock` opens it; fix that scope ONLY, then DELETE it.
## 07-30 CHAIN PAGE + RE-LISTEN: SHIPPED. Box `docs/specs/mapping-admin/plan.md`, strings `copy.md`, comps 2f rev + 2h/2i/2j/2k. **`menuStillTalking`**: the MODEL's "human" is NOT proof (Tarzana's "A healthcare provider." was a recording's tail and became a store recipe). **NAV TIME ≠ time to Staff:** `navSecondsOf` is for READING; `seconds` is what `connectAtSecFor` opens Charlie on. A ring-ended call writes `seconds: null` ON PURPOSE = no timer. **Never let a ring moment become `seconds`.**
- **A RING-ENDED CHECK IS A GOOD MAP, NOT A MISS:** `endedOnRing` (set in `finish` off `status==="mapped"`; `s.status` is already "done", so it MUST travel on its own). FOUR readers guessed off `reachedHuman` and read a perfect re-listen as a failure: `navSecondsOf` · `trendOf` · `scoreConfidence` · the recent-fails flag. **`reachedPctOf` counts ONLY checks that waited for Staff** → null, never a false 0%.
- **RE-LISTEN** (`relisten`): walks the KNOWN route, **hangs up on the SECOND REAL RING** (`ConversationEar.rings`), never asks, IS lockable. **EVERY call feeds the map** — `recordNavCall` from `finish`; sweep + mapper pass `callerRecords:true`.
## 07-30 ONE BEHAVIOUR FOR EVERY MAPPING CHECK (owner: "every time we try back it needs to be working the exact
same way"). `navInitialTwiml`'s timed block is **DELETED** (pauses + speech, listener opened only at the END, so a
speed-up check recorded almost none of the menu). EVERY plan walks the gather loop from `navTurn`; `relisten`'s
other meanings (ring hang-up, `seconds:null`, never ask) are untouched. **ONE step may fire on the clock**:
`early`, set by `planFor` for a `barge` experiment only, `if (step?.early && atSec >= (step.at ?? 0))`, asserted
ONCE by map-sim. `routeUnfinished` lost its relisten gate; the dead recovery block is gone. **AN EARLY STEP CAN
ONLY FIRE WHEN WE ARE LISTENING**: live 07-30, "at 9s" landed at 17s, the first turn past it. The bisection now
measures turn boundaries, not mid-recording barges. That is the price of one behaviour, and it is his call.
- **CVS (chain 5) DONE + PROVEN 07-30, seven real checks to Lanett (11373):** 49s + 58s → **nav 54s, an AVERAGE** (`Math.min` was wrong; a check must NUDGE). **THE PAGE HAS TWO COPIES OF EVERY RULE** (`versionNavSecs` + `menuLadder`): fix a mapgraph reader → grep app.html.
- **THE CUE IS THE PROMPT, NEVER THE CLOCK:** the prompt naming our word, else `isMenuLine`/`looksLikeQuestion`; `isReprompt` REPEATS the last answer. Firing on recorded seconds walked AHEAD of a late menu and answered the wrong question.
- **ANSWERING OVER A RECORDING CUTS IT MID-SENTENCE**; the tail returns as a stray line, so it is JOINED to the previous store line: within `TAIL_SEC` 5, ≤`TAIL_WORDS` 14, not a menu, not the handoff. **Punctuation cannot be the test.**
- **AN OFFER TO CONNECT IS NOT THE HANDOFF.** "just say what you'd like to do and I can connect you" tripped `ROUTING_RE` mid menu and a check hung up one answer short. `routeUnfinished`: while a step is owed, the menu cannot be finished with us. Mapping only; the live path is untouched.
- **SCREEN WORDS COME FROM Statuses, NOWHERE ELSE.** A check we ended reads **Admin hung up** (`endedOnRing` rides the run log → `MapCall`). Menu ladder takes the NEWEST check. "observed once" + `confColor` DELETED; "needs review" stays.
## 07-30 THE CHAIN PAGE, HIS FOUR (shipped to Admin). **Mapping calls → Mapped checks**; the gain sits on EACH
check card against the check before it, off NAV time (`gainByCheck`/`checkNavSecs`), never on the vitals. The date
beside the menu is `lastVerified` (the live version's `approvedAt`) labelled **Locked**, the Recipes sheet's word
for the same stamp. **MODEL COLOURS = ONE SOURCE, `LANE_C`**: Alpha `#818CF8` · Bravo `#38BDF8` · Direct
`#6B6B7B`, one cool band, **needs review `--red`**, nothing warm in the model set (Alpha was gold, the same colour
as needs review). STYLE_GUIDE §3 + comp 2g. **RECORDING BUILT + PROVEN 23:30:** every mapping check records (`Record:"true"`), `callSid` rides run log + evidence, `/api/admin/map/play/:callSid` streamed 418KB real audio; a line's play seeks its second, stops at the next line, no sid = no button. **NIGHT MENU MET LIVE 23:29** (Victory Blvd,
"pharmacy is currently closed"): the check FAILED and changed nothing. Caveat: reason said "not faster" not "wrong menu" — the reset emptied evidence, no held greeting to compare; the first clean daytime check restores that.
**NEXT: morning →** `mapper/start {chainId:5}` drives all three stages, owner looks. Then Walgreens (10): ALPHA.
## VERIFIED / NOT VERIFIED (Railway trap: `deploymentCancel` on a wedged deploy errors once, retry lands)
- **DRIVEN 07-30:** 196 map-sim · 62 mapgraph · 100 map-e2e (2 PRE-EXISTING fails) · tsc clean. **REAL CHECKS:** Victory Blvd walked clean (graded pass, 47s); the night check failed and touched nothing.
- **STILL OPEN:** §11 cost per delivered answer · real `holdSeconds` > 0 · 7.12 · the save with a real human.
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c base ·
**all FOUR dial paths open a receipt** (bridge-place · navigator · tapedeck · native `direct:<id>`). Traps: never
run the full suite for a small change; never deploy mid test check; `/api/*` is admin-gated whole (a THIRD-PARTY
route must be exempted or it 401s silently); auto-nav 0-hammers when it cannot parse → FALSE "no human"; old
whole-call Delta STAYS in the tree.

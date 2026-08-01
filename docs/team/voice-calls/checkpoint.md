# VOICE-CALLS — checkpoint (current state)
> Calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked; owner
> task + repo-root `.unlock`). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines. **LAW: Admin is the record of truth.**
## THE LIVE CALL RUNTIME — all of `docs/specs/live-call-runtime/` built, ON for staging. READ THAT SPEC FIRST; this file is only traps + what is open. §3's six calls need HIS phone (`scripts/gate-zero.ts`).
- **Delta is ONE CLIP**, Charlie prewarms behind it. **`prewarmTimer` MUST stay OUT of `clipTimers`** or a short clip leaves NO agent. **NO VOICE = NO CHECK.**
- **HOLD: `reopen` ALWAYS runs**. **THE FLAP IS DEAD** (receipt 199). `transferToneMs` 600 · `backVoiceMs` 400 in `tuning.ts`. **A transfer ALSO opens `hold_start`**; **`charlie_join` fires ONCE**. **NOTHING ends a mid-check hold** but `maxCallSeconds` (300 staging); `holdMaxSeconds` OPENS Charlie, never hangs up; `ivrMaxSeconds` wired to NOTHING; `ringMaxSeconds` 35 is the only give-up. **PM: owner wants a hold hang-up; number undecided (90s proposed).**
- **§7 BRAIN — BLOCKED BY *THEM*** (custom LLM + instant clone refused; premade/professional voice accepted → it is the VOICE). Owner emailed to lift; else PVC or we own the talking. `/v1/text-to-speech` with Branson HD returns 200.
- `call_dropped` **never written `completed`**; **`rollupFromRow` is the ONLY reader of a stamped call row**. **ONE QUESTION, BOTH LANES** (`declaresOneTurn`); Branson Global's lines WORD FOR WORD.
- 07-29 reader rule: **`consensusFor` reconciles ALWAYS**; spec gate 4 fails the push otherwise. `Test — One Question` = his six calls' workflow. **`vt_*` staging-only.**
- SWITCHES: `cheapBridgeAll` ON staging, prod OFF till promote · `askForTransfer` ON · `stopKeysOnHuman`/`closeAgentOnHold` forced true in `getPolicy`. **`ENV_FLAGS` (app.html) must equal `KEEP_LOCAL_FLAGS`** or the mirror stomps staging in a minute. Numbers in `src/calls/tuning.ts`.
- Wrong-department save SHIPPED 07-30 (gates O.5-O.7). 07-31 owner test: **NEVER ask the provider if a check is alive** — `getReceipt` + `transcriptOf` answer `/pub/live/:cid`; hand-over verb rule tightened. Driven: delta-clip 72, prompts 78, behaved 38.
- THE ONE EAR: a VETO, never a green light; §10 says never build a second. `.unlock` scope trick: sprawl gate hooks Write only; open ONLY the named scope, then DELETE it.
## CHUNK 1 — ROUNDS 1-3 BUILT (08-01), HANDED OFF for the PM's blind milestone-1 audit
**Round 3 (the last in this chat), all six fixed and driven:** (R3-1) the Staff hello is never a menu line (handoff cut inclusive; else strictly before the person) — a no-menu store locks on the spot through the ONE `lockStore` helper, a proven door with nothing to settle locks WITHOUT dialing, no settle call can hang up on Staff, no junk menu-changed rows off two hellos. (R3-2) the direct-proving sweep: the ask is scaffolding, not a menu action; the wrong direct label clears WHOLE (`ringsDirect` + `answerPath`) so the mapper accepts the handoff; locked never downgraded — the endless false-flag loop is dead. (R3-3) the held recipe's doors are exempt from the spent-ask block — a re-map never burns its own proven door. (R3-4) a door is QUESTION + OPTION: dead records carry their question (old bare entries still load), the block fires only at that question or blind — no false store exhaustion. (R3-5) a menu heard once renders NO review card (appears at two); the condition fold scans newest-first, cap 100. (R3-6) sweep pass-2 re-queues closed-store mapping chains; proving wait 180s > the 165s call cap; `MapRecipe.seconds` honestly `number|null` (no fabricated 0; the frozen converter gets only steps); a crashed run visible one boot (behavioral); an ask with no answer NEVER grades pass; copy.md rows fixed; dead proving key dropped.
**Held for the owner's word (PM's own scoping):** item 4 — live customer checks still fire locked
recipes on elapsed seconds (`bridge-place.ts`/`bridge.ts`, machine-locked; the menu-words way exists
but defaults off) and their records still call dial-to-person "nav" — flipping it changes the cost
buckets, his call. And the two pre-existing whole-journey rig failures (a changed route waits for
approval vs R2's hands-free rule) — re-run 08-01, still the same two, untouched.
**The 13, in the PM's order:** (1) the dead door is the option WE picked, the ask ledger is per
store+door (`nav_confirm_asked_doors`, spoken asks only), dead doors durable (`map_doors_dead`), the
store held — fresh store only when every door is burnt or nobody answers. (2) grading's second pass
shape: Staff answered and replied — direct-pickup chains pass, and a no-menu store locks on the
answer alone. (3) silence is never an answer: 12 quiet seconds end the check unresolved, the door's
ask spent. (5) `toneShare` copied byte-for-byte into listen-nav (the one Ear's home; runtime-gates
9/9 green) and fed at the bridge's 0.45 bar — rings count for REAL; the ring hang-up arms on an
announced OR silent handoff (route finished + first ring stamps the handoff moment); the cadence
clock survives only as the no-tone stand-in. (6) proven-at-three: the bar is `call_results.confirmed`
true/false through the receipt hook, the ledger is a union, `provenStores`/`chainDetail` read it, a
pinned-store run's answer joins it, reset clears it. (7) the sweep's direct-proving call is grade-
gated before every write. (8) a lost carrier callback is closed by a one-shot per-call backstop;
words-said compares the WORDS (a re-say can no longer stand in for an answer never spoken). (9) no
free text on mapping rows ("the call never connected"; graph edges person|ring|failed; a failed
check never reads reached-Staff; a transfer nobody answered is a failure; the Map button pre-stamp
is gone). (10) menu-changed files fold by menu identity so heard-twice really fires; conditions
readable in `chainDetail` (real at 2); the 24h gate compares the real label (`24h`). (11) mapping
nav-finished stamps at the handoff (first-write-wins; pickup-only stores fall back); the speed win's
seconds backfill is gone. (12) `Set aside` deleted everywhere (the words are `Not used`), the live
card speaks Mapping menu/Optimizing speed, `copy.md` reconciled (flagged for his blessing). (13) a
crashed run saves its final state instead of vanishing; resume delay 180s (RULES 9 updated); all
five mapping rigs wired into `test-all.sh`. (14) behavior tests grew: the fold rules driven against
a real database (fail writes nothing · staged waits for the lock · a plain Admin pass teaches the
map), the ledger, the condition fold, rings on synthetic frames, every grading shape. Honesty note:
a share of map-sim is still source-text asserts (rendering + wiring shapes); behavior coverage now
carries the engine's laws.
**DRIVEN 08-01 (final, all five rigs + gates):** map-sim **309/309** · resume **20/20** · mapgraph 62/62 · map-api 14/14 · runtime-gates 9/9 · e2e 100/102 (ONLY the two held for the owner) · tsc clean. NOT verified: a real phone call — the owner tests once at the end (R6). Side branch `claude/mapping-engine-contract-wecvcy` only; nothing merges to staging without his "clear".
**Round 1 (superseded where round 2 says otherwise):** stage machine `map | speed | locked | stopped`, LEARN MENU FIRST always (held recipe = door steering only); wording settles (`sameWording`, menu lines to the handoff) → store locked + chain LIVE in one stroke (`approved_at` = the day the map succeeded); no prove dialing. Speed: same store, `shorten | cutin`, NO CLOCK anywhere (`early` = first chunk of the step's own recording; `saidWasTail` guards); wins write immediately, losses to `map_never`. Grading: the SEVEN reasons; unmatched greeting files `menu-changed`, quarantined; a mid-run menu change STOPS the run (chunk 2 wires the auto re-map). Failed checks fold nowhere; stage rides RAW. DELETED: listen-first · the Re-map button + route branch (`trainer/document` stamps no stage) · binary barge · `needs-review`. Old saved runs resume coerced (prove→map, barge→cutin).
- **OPEN — chunk 2 (self-healing, fresh chat)**: mute/unmute loop, pooled re-map jobs, chain-level menu change (3 stores → fall back to full words), conditions as discovered VERSIONS + boundary learning (R4; the hard-coded day/9pm/Spanish trio still lives in app.html), auto re-map on menu-changed ×2. **Chunk 3**: the screens (R5; stage headers, "slower", fail pills, Menu doors, timeline, "Recipe winner" removal) — re-read against the contract, the old screens list is stale (PM's note).
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c base ·
**all FOUR dial paths open a receipt** (bridge-place · navigator · tapedeck · native `direct:<id>`). Traps: never
run the full suite for a small change; never deploy mid test check; `/api/*` is admin-gated whole (a THIRD-PARTY
route must be exempted or it 401s silently); auto-nav 0-hammers when it cannot parse → FALSE "no human"; old
whole-call Delta STAYS in the tree.

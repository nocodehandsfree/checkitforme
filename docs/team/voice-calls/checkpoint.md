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
## CHUNK 1 — ROUNDS 1-6 BUILT (08-01), HANDED OFF for the PM's blind milestone-1 audit
**Held for the owner's word (PM's own scoping):** item 4 — live customer checks still fire locked
recipes on elapsed seconds (`bridge-place.ts`/`bridge.ts`, machine-locked; the menu-words way exists
but defaults off) and their records still call dial-to-person "nav" — flipping it changes the cost
buckets, his call. And the two pre-existing whole-journey rig failures (a changed route waits for
approval vs R2's hands-free rule) — re-run 08-01, still the same two, untouched.
**STILL SOURCE-TEXT (not in this task's scope):** voice-judge 15 · map-sim 47 · mapper-resume 4.
**NOTED, NOT FIXED:** on a check walking a saved route, the plan branch answers a prompt that reads
as a question before the person judge is consulted, so Staff who answer early on a mapped route can
be pressed at. Out of scope for phase 1 — PM: decide in phase 2.
**Phase 1, closed (08-01).** Charlie joins on the check's OWN record; graded when it ends, off his report. The department is his word (wrong department → redirect; otherwise Staff engaged → answered), never the in-stock reading. A mapping check NEVER takes a transfer (`neverTakeAHandover`, owner-named `src/voice/**` unlock, opened and deleted in that task) — customer checks still ride them, byte-identical. Seven practice checks written first and failing first; the leftovers (`GOING_TO_LOOK`, `SENT_AWAY`, `HUMAN_RE`, `LIVE_HUMAN_RE`, `looksLikeLivePerson`, `REDIRECT_RE`) are DELETED, and `navigator._test` lets a scripted check drive the real engine.
in the same task).** Riding a hand-over got a good answer from a desk we cannot name or route to, so
mapping saw an engaged person with no wrong-department report and locked the wrong desk. Mapping's
hand-off now sends `neverTakeAHandover: true` (server.ts `setMappingHandoff`); the ONE place in
bridge.ts that sets `expectHandover` off Staff's own offer skips it when that flag is set, and tells
Charlie on the existing note channel to thank them and end the check. Flag absent = every customer
check, transfers still ridden, byte-identical. `heardWrongDepartment` untouched. Mapping's dead-choice
+ same-store retry were already built and were NOT rebuilt. **NOT DRIVEN:** the branch inside the
engine needs a live provider connection to reach; its two inputs (`heardWrongDepartment` handingOver,
and the flag) and mapping's whole outcome ARE driven.
**PHASE 2 — THE SELF-HEALING LOOP (08-02, `src/calls/healing.ts`, driven by `scripts/test-healing.ts`).**
ONE STORE MUTES: new `retailers.muted/mutedReason/mutedAt` — NEVER `active` (owner removed it by hand),
and NEVER SYNCED (owner 08-02: a push from staging, where nothing is muted, would un-mute live stores;
each side mutes and heals itself). Hand control in Admin's stores section, the SAME words as the chain
(Mute / Unmute), `POST /api/stores/mute`. A customer check whose route we hold led to nobody →
`learnFromReceipt` reports it up, the store mutes itself and files ONE job; THE MUTED STORE IS THE JOB,
so pooling is true by construction. Muted = off the consumer list, `triggerCall`/`bridgeCheckCall`
refuse the dial itself (one guard, not five), zone quote excludes it, zone run skips it with the reason,
Admin + customer schedules skip it, and `autoCheckPaused` fires the moment (customer · store · reason) —
NO email copy written, that is another agent's. Re-map succeeds → `lockStore` unmutes, closes the filing
and writes the ONE history line; no new status word, the check is an ordinary mapping check. Three stores
of a chain off the website = the chain's menu changed: the chain is NEVER muted, its shortcut is cleared
so checks fall back to the careful full words, ONE run per chain relearns it. `healOnce()` dials inside
the mapper's own daily cap and starts NOTHING on its own. "needs review" is gone everywhere (the
confidence label is now `not proven`).
**RING FIX (08-02, owner):** the ring is EVIDENCE, not an override — it no longer answers ahead of the store's remembered lines, so a desk that rings out and drops us back into the menu is caught (practice check 4b drives it) instead of opening Charlie onto a recording.
**AUDIT FIXES (08-02):** (a) `healOnce()` is now registered beside every other piece of self-running work in server.ts, under the same single-leader `withLock`, every ten minutes — no new watcher, no poller: it reads the jobs, obeys the mapper's own daily cap, starts at most one run per chain, and does nothing when nothing is waiting. The list empties itself. (b) R3 sweep finished: `/pub/store/:id`, `/pub/stock/store/:id`, the nearby-stock feed, best-bet and the rural fallback all drop a muted store — driven end to end in test-map-api (its page 404s while muted and comes straight back after a re-map).
**STILL OPEN in phase 2:** the chains list's red alert icon + "Menu changed" filter read `chainsWithAMenuChange()` but are NOT wired into app.html — chunk 3 owns those screens.
**DRIVEN 08-02 (after the audit):** healing **47/47** · practice-checks 46/46 · voice-judge 48/48 · listen-nav 43/43 · map-sim 331/331 · resume 20/20 · mapgraph 62/62 · map-api **20/20** · bridge 13/13 · map-e2e 100/102 (the two known) · tsc clean.
NOT verified: a real phone call — none of this has run against a live store. Side branch `claude/mapping-engine-contract-wecvcy` only; NOTHING merges to staging (the owner is testing; a restart kills a live check).
- **OPEN — chunk 2 (self-healing, fresh chat)**: mute/unmute loop, pooled re-map jobs, chain-level menu change (3 stores → fall back to full words), conditions as discovered VERSIONS + boundary learning (R4; the hard-coded day/9pm/Spanish trio still lives in app.html), auto re-map on menu-changed ×2. **Chunk 3**: the screens (R5; stage headers, "slower", fail pills, Menu doors, timeline, "Recipe winner" removal) — re-read against the contract, the old screens list is stale (PM's note).
## Engine — Branson HD `1P1JhCcLzeMmkvLi1BkG` speed 0.91 (BOTH envs) · echo gate 520/150 · ringback by published
tone frequencies, 6 rings = hang up · **Charlie $0.00183/s, meters SILENCE** · Twilio WHOLE MINUTES · 5.2c base ·
**all FOUR dial paths open a receipt** (bridge-place · navigator · tapedeck · native `direct:<id>`). Traps: never
run the full suite for a small change; never deploy mid test check; `/api/*` is admin-gated whole (a THIRD-PARTY
route must be exempted or it 401s silently); auto-nav 0-hammers when it cannot parse → FALSE "no human"; old
whole-call Delta STAYS in the tree.

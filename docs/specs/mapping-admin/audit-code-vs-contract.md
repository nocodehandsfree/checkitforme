# Chunk-1 audit, round 2: the engine vs build-contract.md (PM · 08-01 · branch `claude/mapping-engine-contract-wecvcy` @6d4dd120)

Round-2 verify: three blind readers over the mapper's 12 fix commits, plus the PM driving every rig.
Rigs (PM-run): map-sim 296/296 · resume 17/17 · mapgraph 62/62 · map-api 14/14 · all five now wired
into `test-all.sh` · map-e2e still 100/102 (same 2 pre-existing approval-flow fails as staging —
owner call at chunk 2) · typecheck clean. Item 4 (live checks answer on a clock) verified UNTOUCHED,
as ordered — still waiting on the owner's word.

## Round-2 verdict per item
- **FIXED (9): items 1, 3, 5, 7, 8, 9, 11, 13, 14.** Wrong desk burns the PICKED door, per-door ask
  ledger, store held, dead doors durable + mechanically blocked (`navigator.ts:852-866,1051-1083`,
  `mapper.ts:172-179,598-604`). Silence is not an answer (`navigator.ts:692-703`). Rings are really
  detected (tone frames feed the counter, `server.ts:7163`, `navigator.ts:206-207`,
  `listen-nav.ts:340-351`); hang-up at two rings; silent handoff stamps the handoff off the first
  ring. Sweep honors the grade — fail writes nothing (`sweep.ts:140-144`). Words-said compares the
  actual words; lost carrier callbacks get a backstop grade (`navigator.ts:1129-1152`). No free text
  on mapping rows; "nobody answered" impossible when Staff answered; pre-stamp gone
  (`mapgraph.ts:1263-1273`, `server.ts:6295-6301`). Mapping nav time ends at the handoff
  (first-write-wins stamp, `navigator.ts:243-247`); the backfilled unmeasured number is gone. Crash
  keeps the run's state with its reason on the live card (`mapper.ts:690-698`); drain overlap closed
  (180s resume vs 150s max check). Fold rules now driven behaviorally in the rig (~156 behavioral
  assertions; grade gating + what-a-fail-may-write really executed).
- **PARTLY (3): items 2, 6, 10.** Direct pickup now PASSES grading (`map-capture.ts:159`) but still
  cannot LOCK — see R3-1. Proven-at-three: real answer required, union not overwrite, a reader flips
  `fullyProven` at three (`mapgraph.ts:1344-1361,1587`) — but it is display-only and the no-traffic
  hand-dial rule has no code (`sweep.ts:85-106`). Heard-twice: tolerant fold works
  (`mapgraph.ts:990-999`) and the API says `real:true` at two — but NO screen reads it; the review
  list still renders once-heard rows identically.
- **Skipped as ordered (1): item 4** — unchanged end to end (`recipe.ts:39-70`,
  `bridge-place.ts:142-163`, `service.ts:396-403`).

## ROUND 3 (short, ordered; all evidence at @6d4dd120)
R3-1. **Direct-answer stores: pass but never lock, and the engine now troubles Staff.** The
  lock-on-the-spot branch requires no heard menu lines, but the person's own hello is counted as a
  menu line (`mapper.ts:229-234` cutoff `transferAtSec ?? humanAtSec` with `<=`; greeting pushed AT
  `humanAtSec`, `navigator.ts:653,717`), so the branch is unreachable (`mapper.ts:586-595`). The run
  then makes up to 5 settle calls that each hang up on a real person (`navigator.ts:511-516`,
  violating the run's own no-Staff rule) and can file junk "menu changed" rows from two different
  hellos. Fix shape: exclude the Staff greeting from menu lines (strict `<`, or cut at ring/handoff
  only) so the on-the-spot lock fires; settle listens must not dial at all when the store is direct.
R3-2. **The direct-proving side job false-flags every direct chain, forever.** Its "did we act on a
  menu" test counts the product QUESTION as an action (`sweep.ts:152` counts every us-step; the
  ask-scaffold exclusion from `map-capture.ts` is not applied), so a passing direct call always takes
  the has-a-menu branch: stamps `ringsDirect:false, navStatus:"review"` (even over locked), files a
  false review item, the mapper then refuses the chain (`mapper.ts:397` still sees `direct_human`),
  and the next sweep re-queues it — an endless loop. Fix: reuse the scaffold exclusion; never stamp
  over locked; repair the stamp when mapping refuses.
R3-3. **Re-mapping a proven chain burns its own best door.** The winning door's ask is durably spent
  (`nav_confirm_asked_doors` never expires), so a re-map is told "doors that worked: X" and "never
  choose X" in the same breath, refuses twice, and fails the store (`mapper.ts:486-487,506-513`).
  Fix: a proven door is exempt from the once-per-door block (proof already exists), or re-proving
  clears that door's spent ask.
R3-4. **Dead-door block is a value match anywhere in the tree** (`navigator.ts:853-857`) — "1" dead
  at level 2 blocks "1" at level 1 and can falsely exhaust a store. Scope the block to the menu level
  (door = question + option, not option alone).
R3-5. **Heard-twice must change something the owner can see:** the review list should render a
  once-heard row muted (or not at all) and flip at two — the `real` flag exists, no screen reads it;
  also the fold scans only 20 open rows unordered (`mapgraph.ts:991-994`) — order + raise or page.
R3-6. Small, same pass: sweep pass-2 re-queue text mismatch silently drops closed-store mapping
  chains (`sweep.ts:252` vs `mapper.ts:472`) · proving-call cap 120s vs call cap 165s loses late
  proofs (`sweep.ts:39`) · ring-ended win persists a fabricated `seconds: 0` on the map version
  (`trainer-batch.ts:90`, `mapper.ts:302`) — write null · crashed-run trace erased at next boot
  (`mapper.ts:123`) — keep it visible one boot, and cover the crash path behaviorally · silent-confirm
  pass/fail disagreement (`grade:"pass"` on `status:"failed"`, pollutes ring variance) · copy.md
  still SPECIFIES `set aside` (line 143) and `Hung up, nobody picked up` (141) against its own
  08-01 note — fix the table rows · `prove` key is dead in the check-card header map.

## Standing owner decisions (unchanged)
Item 4: live checks still answer on a stopwatch; the listen-for-menu-words path exists but defaults
off. · map-e2e's 2 pre-existing fails assert the OLD wait-for-approval behavior R2 retires. · No lock
of the mapping surfaces until the owner names the live page the record of truth (contract line 135).

## How to use this
Round 3 = R3-1 to R3-6, one at a time, each proven by a driven check or on the page before the next.
R3-1/R3-2 are the gate: until they land, any chain whose stores answer directly cannot finish and
real Staff get hung up on. The contract is the law; this list is the gap between law and this branch.

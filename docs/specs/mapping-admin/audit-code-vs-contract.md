# MILESTONE 1 (the engine) — PM audit, fix pass 2 vs build-contract.md (PM · 08-01 · branch `claude/mapping-engine-contract-wecvcy` @6d4dd120)

The project is THREE milestones: 1 engine · 2 self-healing · 3 screens. Everything in this
file is MILESTONE 1. Fix-pass-2 verify: three blind readers over the mapper's 12 fix commits, plus the PM driving every rig.
Rigs (PM-run): map-sim 296/296 · resume 17/17 · mapgraph 62/62 · map-api 14/14 · all five now wired
into `test-all.sh` · map-e2e still 100/102 (same 2 pre-existing approval-flow fails as staging —
owner call at chunk 2) · typecheck clean. Item 4 (live checks answer on a clock) verified UNTOUCHED,
as ordered — still waiting on the owner's word.

## Fix pass 2 — verdict per item
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

## Fix pass 3 — verdict (three blind readers + PM-run rigs · @c39df451)
Rigs: map-sim 309/309 · resume 20/20 · mapgraph 62/62 · map-api 14/14 · map-e2e 100/102 (same 2
pre-existing) · tsc clean. **All NINE older fixes still hold (regression spot-check passed).**
- **FIXED: R3-4** (dead door = question + option, durable and scoped) · **R3-5** (once-heard menus
  hidden until heard twice; fold ordered, cap 100) · **R3-6 b/c/d/e/f/g** (late-proof cap, null not
  zero, crash visible one boot, silent-confirm fails, copy.md table clean, dead key gone).
- **PARTLY — the three gate items, one shared root left:** the engine still sometimes takes STAFF'S
  OWN SPEECH for the store's menu. R3-1: core cut fixed (strict < humanAtSec, on-the-spot lock works,
  locked direct runs make zero extra checks) BUT Staff saying "sure, one moment" matches the handoff
  pattern and stamps a handoff AFTER the person — the hello re-counts as a menu line and the settle
  listens hang up on up to 5 real people again (`navigator.ts:675-682`, `mapper.ts:249-259,637`).
  R3-2: scaffold excluded, locked never overwritten, refusal loop closed BUT the "sounds like a
  recording" test counts the person's hello/answer (no cut at humanAtSec) so a passing direct chain
  is misfiled as a greeting chain — a bogus recipe can auto-activate and re-stamp live behavior
  (`sweep.ts:151,161`, `mapgraph.ts:709`). R3-3: exemption works UNLESS the winning word was
  shortened — exemption keys on recipe values, the ledger on the full phrase as asked
  (`mapper.ts:532-538` vs `navigator.ts:1097-1108`).

## FIX PASS 4 — the LAST milestone-1 list (fresh chat; evidence at @c39df451)
F4-1 (GATES THE MILESTONE). **Staff's voice is never the store's menu — close all four faces:**
  (a) never stamp a handoff line at or after `humanAtSec` (`navigator.ts:675-682`), and make
  `menuLinesOf` cut at the EARLIER of handoff/person, strict (`mapper.ts:249-259`);
  (b) the sweep's recording test cuts at `humanAtSec` so a person's hello/answer never counts
  (`sweep.ts:151,161`) — no greeting recipe may auto-activate onto a direct chain;
  (c) stamp `humanAtSec` at the line that TRIGGERED person-detection, not the turn the detector
  fired, so a long hello can't slip under the cut (`navigator.ts:52-65` + reachHuman);
  (d) a redirect can never fire on Staff's ANSWER: after the ask, nothing burns a door — today
  "over in the toy aisle" matches the redirect pattern and durably kills the RIGHT door chain-wide
  with no clear path (`navigator.ts:71`, `mapper.ts:181-195`); also add an Admin clear for
  `map_doors_dead` / `nav_confirm_asked_doors`.
F4-2. **Door bookkeeping matches itself:** the proven-door exemption must exempt the door AS THE
  LEDGER KEYS IT (full phrase and its shortened winner both); record the question on the ask ledger
  so spent doors are level-scoped like dead doors (`navigator.ts:1101-1106`, `mapper.ts:538-540`).
F4-3. **Sweep bookkeeping:** prove-direct calls carry a stage (or exemption) so the carrier-end
  path can't stamp review on the chain (`navigator.ts:1186`); a closed-store mapping run ends
  "skipped" not "failed" so pass 2 re-queues it (`sweep.ts:235,264`, `mapper.ts:510`); the mapper's
  own wait deadline gets the same +30s margin the sweep got (`mapper.ts:595`).
F4-4. Nit: `conditions[].real` has no reader — drop the field or read it (`mapgraph.ts:1391`).

## Standing owner decisions (unchanged)
Item 4: live checks still answer on a stopwatch; the listen-for-menu-words path exists but defaults
off — one small task, fresh chat, owner unlock. · map-e2e's 2 pre-existing fails assert the OLD
wait-for-approval behavior R2 retires. · No lock of the mapping surfaces until the owner names the
live page the record of truth.

## How to use this
Fix pass 4 = F4-1 to F4-4 in a FRESH chat (the round-1-to-3 chat is heavy and handed off): checkout
branch `claude/mapping-engine-contract-wecvcy`, work F4 in order, one item per commit, each proven
by a driven check or rig test before the next. F4-1 gates the milestone: until its four faces close,
direct-answer chains still hang up on real people or get misfiled. The PM re-audits blind after the
push; MILESTONE 1 closes on that audit. The contract is the law.

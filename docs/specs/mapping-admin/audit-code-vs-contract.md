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

## Fix pass 4 — verdict (two blind readers + PM-run rigs · @f64c468b)
Rigs: map-sim 324/324 · resume 20/20 · mapgraph 62/62 · map-api 14/14 · map-e2e 100/102 (same 2
pre-existing) · tsc clean. **FIXED: F4-2, F4-3, F4-4** (door bookkeeping matches itself; sweep
bookkeeping all three; once-heard rows filtered server-side) and the ten-point regression sweep all
holds. **F4-1 STILL LEAKS — the milestone stays open.** The person-stamp lands late and everything
keys off it: a long hello that dodges both person-detectors leaves Staff's words dated before the
person (`navigator.ts:491-502` back-dates only the NEWEST line), so the hang-up-on-Staff settle
cascade survives (verified with concrete call scripts); a greeting chain with no routing phrase
loops the same way even with detection right; the mapper cannot express greeting-then-transfer so a
settled 0-step route locks `ringsDirect:true` (`navigator.ts:1001`, `trainer-batch.ts:55,130`);
"sure, one moment" from a wrong desk counts as an ANSWER and proves the wrong door
(`navigator.ts:727-730`); one background call can still auto-activate a first version and re-stamp
a chain (`mapgraph.ts:709,907-938`); the reset endpoint exists (`server.ts:6453`) but NO Admin
button calls it, and it wipes the chain's whole history — no doors-only clear.

## Fix pass 5 — verdict (two blind readers + PM-run rigs · @7a6d2205)
Rigs all green, PM-run: voice-judge 25/25 · map-sim 330/330 · resume 20/20 · mapgraph 62/62 ·
map-api 14/14 · e2e 100/102 (same 2 pre-existing) · tsc clean. Twelve-point regression sweep holds.
**BUILT AND REAL:** the one earpiece decider exists and the five named paths ask it; a listening
check with nothing to walk is refused before it dials; a store with no menu locks with no extra
call; greeting-then-transfer is its own kind and Charlie's join differs from direct; both chain-page
buttons (Start over · Free doors) wired and scoped right. **NOT CLOSED:** in leftover spots old code
still acts WITHOUT asking the earpiece, and when the engine is unsure it keeps walking instead of
going quiet — so Alpha can still press keys at a person in rare shapes, and Staff who says "one
moment" can still be hung up on at 12 seconds.

## FIX PASS 6 — BACK TO THE SPEC (same mapper chat · evidence @7a6d2205)
**The spec never gave mapping a voice of its own. Mapping talks to machines; Charlie talks to
people. The proving check puts CHARLIE on the call — the same Charlie every live check uses — and
mapping's homegrown way of asking Staff is DELETED, not repaired.**
0. THE BIG ONE. The proving check joins Charlie exactly like a live check does (the bridge that
   already exists). Charlie asks about Pokémon, handles "one moment", survives holds — all already
   built and being tuned by Echo. Mapping DELETES its own asking: the spoken question, the
   answer-listening, the 12-second silence rule, the waiting words, the "answered" classification
   (`navigator.ts:719-776`, the ask scaffold, `confirmResult`) — mapping only records what Charlie
   reports back (asked · answer heard · yes/no · wrong department). Everything Staff-conversation
   leaves this engine permanently.
1. Alpha and Bravo act ONLY on the earpiece's word — nobody presses, nobody speaks until the
   earpiece says a machine is talking; unsure = stay silent and listen. Remove the three leftover
   self-deciders: the direct-pickup overrule (`navigator.ts:808`), the auto-escape person-words
   (`navigator.ts:989`), the model declaring "human" + raw handoff stamp bypassing the earpiece
   (`navigator.ts:941` → `:540-544`).
2. Unsure can never become "machine" through a side door: remove the hard-coded "it kept talking"
   inputs (`mapper.ts:270`, `navigator.ts:1070`, `sweep.ts:164`); reset the pause memory per new
   voice (`navigator.ts:799,805`).
3. Evidence order: a person-shaped line ("this is Maria", "how can I help") beats "we are inside
   the menu we hold" (`listen-nav.ts:327-329`); a real counted ring beats a word-match to the
   remembered menu.
4. The person's clock starts at the person's first word (`listen-nav.ts:378`) — Charlie's join
   feeds off this number.
5. Two flags tests assert but nothing reads: first-call-never-hangs-up (`hangUpAllowed`) and
   file-a-new-menu (`unknownLine`) — wire them for real.
6. The store's remembered lines must be available during the FIRST mapping run's listens
   (`mapgraph.ts:1378-1399` — read the run's own held lines, not only a locked map).
7. Sweep truth: a short recording ("Please hold.") must not prove a chain "Staff answer directly"
   (`sweep.ts:160-178,224-231`); greeting evidence must not ride labeled "direct"
   (`map-capture.ts:55`); "Please hold." must still arm the handoff clock (`navigator.ts:739-741`).
8. Free doors reaches a live run too (`mapper.ts:169-196` — the run's memory re-writes the
   cleared lists).
One spec, nine items, one commit each, each proven on the pretend calls in the rigs first (plus:
instant pickup no ring · voicemail saying "hello?" · menu dumps to the operator mid-walk · two
Staff on one check). Push, stop; PM audits blind. MILESTONE 1 closes on that audit.

## Standing owner decisions (unchanged)
Live checks still answer on a stopwatch (listen-for-menu-words defaults off) — one small task,
owner unlock. · e2e's 2 pre-existing fails assert the OLD wait-for-approval behavior R2 retires. ·
No lock of the mapping surfaces until the owner names the live page the record of truth.

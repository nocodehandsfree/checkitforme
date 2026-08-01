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

## FIX PASS 5 — reframed: one design change + hard rules (same mapper chat · evidence @f64c468b)
Patching faces has failed twice; build it structurally.
F5-1 (GATES, with F5-2). **ONE JUDGE. Build a single shared "recording or person?" decider that
  every path asks — the menu-line cut, the person stamp, the redirect test, the sweep's recording
  test, the settle compare. Kill the six scattered private opinions (LIVE_HUMAN_RE at
  `navigator.ts:58-65`, looksLikeDirectPickup, ROUTING_RE stamping, REDIRECT_RE classify, sweep
  heardRecording, personLineAtSec) — they may remain as EVIDENCE the judge weighs, never as
  deciders.** The judge weighs five layers in order, first confident answer wins:
  (1) THE STORE'S OWN REMEMBERED MENU — recordings repeat verbatim, people never do; from call 2 on,
  compare against this store's stored opening lines (the fingerprint we already keep) — match =
  recording; no match = person OR a new condition (file it, never guess person into the map). This
  also solves greeting-then-transfer chains: the recording matches its own script, the human after
  the ring does not. (2) POSITION on a mapped chain: before the handoff = recording, after the ring
  = person (owner law). (3) THE WORDS: press/option/listen-to/para-español/menu-has-changed =
  recording; a reply to OUR words, or a short post-ring utterance = person. (4) THE PAUSE TEST when
  still unsure: stay silent ~2s — a recording keeps reading, a person stops or says "hello?".
  (5) STILL UNSURE = PERSON (owner law; every default flips this way). The judge dates the person
  from the FIRST line of their speech (walk back; a tail-joined hello SPLITS, never drags the stamp
  onto a store line). "One moment"/"sure, one second" after the ask is WAITING — not an answer, not
  a redirect. And the FIRST call to a brand-new store is pure listening: record everything, hang up
  on nothing that might be a person; after it the store's menu is on file for layer 1 forever.
F5-2 (GATES, with F5-1). **Troubling Staff must be structurally impossible on listen-only checks:**
  a listen-only check whose plan has no steps NEVER dials (it can never arm its ring hang-up —
  `navigator.ts:624-637,533-538`); a store whose route has no menu steps needs NO wording-settle
  (nothing to settle — the proving call is the settle). These two rules end both hang-up loops even
  when detection is wrong.
F5-3. **Greeting-then-transfer is expressible by the mapping run:** a settled route with zero
  answers but real pre-person store lines locks as `greeting`, never as direct
  (`navigator.ts:1001`, `map-capture.ts:55`, `trainer-batch.ts:55,130`) — else the paid agent
  opens on a recording.
F5-4. **A first version from ONE background call can never re-stamp how a chain answers:**
  type-gate auto-activation (`mapgraph.ts:709,722-725,907-938`).
F5-5. **The Admin clear:** wire a button to the reset (`server.ts:6453`) and add a doors-only clear
  (`map_doors_dead` + `nav_confirm_asked_doors`) that leaves versions, proof, and history alone.

## Standing owner decisions (unchanged)
Live checks still answer on a stopwatch (listen-for-menu-words defaults off) — one small task,
owner unlock. · map-e2e's 2 pre-existing fails assert the OLD wait-for-approval behavior R2
retires. · No lock of the mapping surfaces until the owner names the live page the record of truth.

## How to use this
Fix pass 5 = F5-1 to F5-5, SAME mapper chat, same branch `claude/mapping-engine-contract-wecvcy`:
one item per commit, each driven on a rig — including the exact call scripts in the fix-pass-4
verdict above — before the next. F5-1 + F5-2 gate the milestone. PM audits blind after the push;
MILESTONE 1 closes on that audit. The contract is the law.

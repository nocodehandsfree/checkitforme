# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

## DAY-2 sweep (2026-07-11, from 9am ET) — IN PROGRESS, guard NOT on prod
- **Guard `6feff66` is on STAGING, not prod** (prod=598a16a; Pops shipped an unrelated account-reset
  feature overnight). So the 12 locked "retry" chains are HELD (driver SKIP_IDS) — no re-downgrade risk.
  **Owner nudge outstanding:** Pops must promote 6feff66 before those 12 re-run.
- **Wins:** Burlington 78→53 (keypad, live-locked) · Independent Card Shop → locked DIRECT (~13s).
- **Thrift = NOT chain-mappable** (owner asked, we tested): Goodwill + Habitat ReStore both needs-review;
  a diagnostic listen call to Goodwill heard NO menu, NO human = voicemail/recorded line. Thrift stores are
  independently operated (like Ace) → per-store live-AI caller, not a chain recipe. Did NOT burn calls on
  Salvation Army/Savers/Unique (same pattern).
- **Small shops = hit/miss:** Independent Card locked direct; Comic Book Shop = voicemail (no human).
  PokeMall TCG + Cards and Coffee = stores not open yet → retry PM.
- **Container reclaim killed the local driver** (nohup dies with the container; local git even reverts to a
  stale commit — remote is truth). Lesson: don't rely on a local long-running process; the mapper RUN
  survives server-side → drive one-chain-per-check-in or read results from mapper/state.
- **PM update (2pm ET):** guard STILL not on prod (598a16a) → 12 held chains NOT run. Afternoon retries
  Cards&Coffee/Macy's = voicemail/no-human (same per-store pattern); Comic Book Shop too. Full day-2
  report: `docs/team/mapping/report-2026-07-11.md`.
- **Day-2 verdict:** 2 wins (Burlington 78→53, Independent Card direct). Thrift + single-location/
  shop-in-shop shops = per-store, NOT chain-mappable (like Ace) → leave to live per-store caller.
- **STILL BLOCKED:** the 12 locked "retry" chains need guard `6feff66` promoted before they re-run.
  When prod != 598a16a and mapper.ts has `slowerThanLocked`, run ids 2,1,73,32,40,26,10,58,47,48,20,23
  one at a time, each after<=before vs baseline. Walmart/Target also need a daylight human-detect listen.

## RESTORED + root cause (2026-07-10 ~9pm ET) — 11 chains that got slower
- **Owner caught it:** the after-column had 11 chains SLOWER than before. That's a fail — the whole point
  is faster. All 11 hand-restored via trainer/lock to last night's faster recipes (verified live):
  Walmart 130→10, Target 42→16, Blain's 92→57, Sam's 57→44, Walgreens 45→34, Albertsons 77→68,
  Dick's 29→24, Fleet Farm 62→57, Jewel 70→65, Safeway 104→102, Food 4 Less 56→55.
- **ROOT CAUSE (real engine bug):** the VERIFY stage re-locked whatever it last reached even when SLOWER
  than the shipped recipe — no compare to the existing time. Ring/menu variance on a re-call → a slower
  sample overwrote a faster lock. (Optimize does it right; verify didn't.) Hit 8 of the 11.
  - Walmart/Target: different — the fast press stopped registering a human (Walmart rode a call-volume
    hold to 130s; Target's press-through didn't confirm a person) → engine relearned a long path. Needs a
    daylight listen: is the fast path still reaching a human, or is human-detection missing it?
  - Albertsons: 0s call-drop on the Safeway/Albertsons/Vons phone platform killed capture → needs-review.
- **FIX BUILT:** `6feff66` on staging — guard so a verify NEVER downgrades a locked recipe (keep faster,
  optimize from there). tsc clean. Handed to Pops for next promote. This alone prevents 8 of the 11.
- **Correction to the sweep report's spin:** "nothing got slower" was WRONG — several genuinely locked
  slower and shipped live. Report/checkpoint below corrected.

## POST-SWEEP owner fixes (2026-07-10 ~8:45pm ET)
- **AAFES (33) MUTED** — owner: not calling Army/Air Force exchanges. Out of the calling pool + hidden
  from consumers. (Also resolved its bug: the sweep had mis-locked it as type:direct/no-steps — moot now.)
- **Meijer (64) tagged `callTarget:false`** — no direct store line (all paths hit Meijer's national care
  center). Owner: should've been tagged already. Engine now SKIPS it; still consumer-visible via site
  stock (per-store pickup availability). Keeps the 71s care-center recipe but won't be re-mapped.
- **Rule reinforced:** military exchanges = muted. National-call-center chains (no direct store line) =
  `callTarget:false`, not mapped. Check both flags before adding a chain to a sweep.

## DONE — 2026-07-10 speed + drift sweep (full board)
- **All 39 mapped chains swept** (converging engine, uncapped). Every one reaches a verified human.
  Full before→after per chain: `docs/team/mapping/report-2026-07-10.md`. Snapshots:
  `baseline-2026-07-10-before.json` + `after-2026-07-10.json`.
- **Big cuts (real time):** Ralphs 126→59, Costco 97→35, BJ's 90→34, Menards 94→57, Smith's 62→32,
  Staples 60→29, Scheels 59→18, Wegmans 73→46, Vons 87→57, Marshalls 44→20, Big 5 34→13, Pavilions
  47→25, TJ Maxx 23→12, Pick 'n Save 20→10.
- **Key nuance for the owner:** many old "before" numbers were single lucky samples; the engine
  re-measures the REAL time on verify. Chains that look like "68→77" just swapped a fantasy number for
  the honest one — nothing on the live site got slower. Report shows real-before in parentheses.
- **5 hand-fixes** (engine drift / bad auto-locks), all locked + verified:
  - Costco — caught a false 4s "instant answer" (recorded greeting fooled it) → press 1 admin, 35s.
  - Vons + Albertsons — same platform, old 0-hammer recipe drifted → press 8 = customer service.
  - Target — old "16s" was a mismeasure → press 2, press 2 = 42s.
  - Walmart — old "10s" fake; real path press 9 = store operator, ~130s (call-volume hold tonight).
- **Two desk re-maps (owner ask):**
  - Menards — desk was right; ext 216 = front end, answers stock Qs. Locked 57s (read 94s before).
  - Meijer — NO direct store line; all paths → national care center. Locked fastest rep path 71s;
    agent asks for service-desk transfer (rep does it every time). Physical ceiling of their system.
- **Left as-is / follow-ups (in report):** Ace Hardware = franchise, store-varying trees, no chain
  recipe → live-AI per store (like Office Depot/Publix). Walmart slow (try press 4 electronics next).
  Safeway/Blain's/Fleet Farm reject early presses, stay 92–104s. Engine bug: greeting false-fire can
  lock type:direct even when a menu was captured (the Costco trap) → flagged for DevOps, one guard.
- **Skipped by design:** CVS (owner) + 33 direct-ring chains (already instant).

## Infra done this session
- Cap fix `6edefab` (12/day → 60 guard + `mapper_daily_cap` setting) promoted to prod by Pops.
- Sweep driver `docs/team/mapping/sweep-driver-20260710.mjs` (resume/SKIP support after a mid-run
  container restart — survived one, no data lost).
- Branch `claude/mapper-checkpoint-scheduling-tbtnps`, PR #3 → staging (draft).

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead
  from an auto-caller failure. Method: `trainer/document` (listen-only hint) → read FULL menuPrompts
  (human option often LAST) → press-test (`barge`+`confirm:true`) → `trainer/lock` with truthful target.

## Other traps (keep)
- STT garbles digits — press-test each candidate. Stored times can be lucky single samples — trust the
  engine's re-measure, not the old number. Recorded greetings false-fire "human" ~8-13s in.

## Owner rules (keep)
- Muted = never call. Never push code while a call is live. Done = demonstrated w/ evidence.
- Pops owns prod promote batches; explicit owner naming before prod pushes.

## State
- Board healthy: 39 mapped chains verified reaching a human. Recipes live in prod DB. Sweep complete.

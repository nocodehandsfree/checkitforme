# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

## State (2026-07-11 eve) — sweep COMPLETE, nothing pending
- Board healthy: **39 mapped chains verified reaching a human.** Recipes live in prod DB.
- Both mapper fixes LIVE on prod (`25be309`, owner promoted): no-downgrade guard `6feff66` +
  skip-rings-direct `52d2c77`. Guard PROVEN in prod (Safeway/Kohl's/Jewel/Dick's re-measured slower
  and KEPT their faster locks).
- 12 held "retry" chains re-run under the guard: only Kohl's improved (67→62); rest held at floor.
  Full table: `report-2026-07-11.md`.
- Next mapper work is owner-directed. OPEN QUESTION from owner: why did some stores' time-to-human
  get LONGER — bring numbers (which stores, seconds added, cost impact), not a story.

## Independents / co-ops = DIRECT (owner correction 2026-07-11)
- Thrift banners + local card/hobby shops answer DIRECTLY — mark DIRECT, never tree-map them.
  Curated `DIRECT_DEFAULT_CHAINS` + boot backfill (`0b8d077`) enforces it; don't hand-lock (boot
  overwrites). 10 locked DIRECT incl. Goodwill, Ace, Habitat ReStore, Salvation Army, Savers.
- A no-answer call ≠ "no human path" — it's just nobody picked up that minute.
- For Data Dev: default independent/single-location chains to DIRECT at import.

## Sweep results (2026-07-10/11, detail in reports/)
- Big cuts: Ralphs 126→59, Costco 97→35, BJ's 90→34, Menards 94→57, Burlington 78→53, Staples
  60→29, Scheels 59→18, Marshalls 44→20, Walmart 130→10, Target 42→16 (post-restore).
- Root-cause fixed: VERIFY could re-lock a SLOWER sample over a faster recipe (hit 11 chains,
  owner caught it, all hand-restored). Guard `6feff66` prevents recurrence — verify never downgrades.
- Old "before" numbers were often lucky single samples; trust the engine's re-measure.
- AAFES **MUTED** (owner: never call military exchanges). Meijer `callTarget:false` (national call
  center only — check both flags before adding a chain to a sweep). CVS skipped by owner.
- Ace/Office Depot/Publix: franchise/store-varying trees → live per-store caller, no chain recipe.

## Infra
- Daily cap: 12/day hard-code replaced by 60 runaway-guard + `mapper_daily_cap` setting (prod).
- Sweep driver `sweep-driver-20260710.mjs` (resume/SKIP after container restart). Container reclaim
  kills local nohup processes — the mapper RUN survives server-side; drive per-check-in, remote is truth.

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead
  from an auto-caller failure. Method: `trainer/document` (listen-only) → read FULL menuPrompts
  (human option often LAST) → press-test (`barge`+`confirm:true`) → `trainer/lock` truthful target.

## Other traps (keep)
- STT garbles digits — press-test each candidate. Recorded greetings false-fire "human" ~8-13s in.

## Owner rules (keep)
- Muted = never call. Never push code while a call is live. Done = demonstrated w/ evidence.
- Pops owns prod promote batches; explicit owner naming before prod pushes.

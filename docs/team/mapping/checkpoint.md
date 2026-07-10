# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

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

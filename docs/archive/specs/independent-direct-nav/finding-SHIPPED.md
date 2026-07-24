# Independents + co-ops default to DIRECT (no chain-level tree) — built by DD 2026-07-10

## What was wrong
Nav is modeled per-CHAIN (one recipe for every store). Correct for corporate chains with one uniform
tree (Walmart, Kroger, CVS). WRONG for **independents** (each store its own) and **co-ops** (Ace
Hardware: ~4,800 independently-run stores). Ace carried a single learned tree — `answerPath=simple_ivr`,
`dtmfShortcut=4@10`, `avgTreeSeconds=10` — applied to ALL Ace stores. On every Ace that rings straight to
a human, that armed the connect-timer and **muted the agent 10s while a person was already on the line**
(silent-agent bug). It also wasted tree-mapper calls on menu-less shops and mis-read un-answered calls.

## What DD built (done)
- **Live staging data patched** (API): 14 present chains (Goodwill, Salvation Army, Savers, Unique,
  Habitat ReStore, Independent Card Shop, Comic Book Shop, Cards and Coffee, PokeMall TCG, Cash Cards
  Unlimited, CoreTCG, LA Sports Cards, Burbank Sportscards, **Ace Hardware**) set to
  `ringsDirect=true` + `answerPath=direct_human`; Ace's chain tree cleared (dtmf/avgTreeSeconds nulled,
  "Press 4" kept only as a note). Connect-timer verified disarmed on all 14. Snapshot for revert:
  `scratchpad/nav_snapshot_before.json`.
- **Durable code** (branch `claude/hobby-hours-backfill-eexkg0`): curated `DIRECT_DEFAULT_CHAINS` +
  `isDirectDefaultChain()` + `backfillDirectChains()` boot pass in `src/db/import-data.ts` (enforces
  direct every boot so a re-learned tree can't creep back), wired in `bootstrap.ts` after
  `backfillChainTypes`, and a direct default at import in `stores-import.ts`. `npx tsc --noEmit` clean.

## Detection rule (decided): explicit curated list — NOT store-count or type
Store-count fails immediately (Independent Card Shop has 6,697 stores but is per-location). The curated
set is the source of truth, same pattern as `CHAIN_TYPES`. Add new independents/co-ops there.

## Ace Hardware — the co-op answer (owner asked)
No uniform tree exists and calling all ~4,800 to find out is not worth it. So: **default every Ace store
DIRECT** (agent stays live, never muted; a store that does have a menu degrades to a live agent, not a
broken call), and **learn nav PER STORE from organic calls** — zero upfront spend. The "Press 4" note is
preserved for a future per-store system.

## Hand-offs
- **Mapper:** tree-mapper must SKIP any chain with `ringsDirect=true`/`answerPath=direct_human`. Don't
  hand-lock these (the curated list + boot pass owns it now — that's also why the earlier hand-locks
  weren't sticking on staging). Real fix for co-ops = per-store nav (backend), which DD recommends.
- **DevOps:** ensure the learned-nav prod→staging refresh does NOT clobber these curated chains — either
  exclude `DIRECT_DEFAULT_CHAINS`, or guarantee it runs before `backfillDirectChains` (currently placed
  after `backfillChainTypes` on boot so it wins). Treat these chains' direct flag as CURATED, not learned.

# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.
> (Full history in git + report-2026-07-10.md / report-2026-07-11.md / unmapped-audit-2026-07-11.md.)

## GO-LIVE READINESS (2026-07-11 night) — owner's "still gray" list resolved
- **The gray was STAGING, not a mapping gap.** All the owner's listed chains are mapped + `callReady:true`
  on PROD (verified via checkitforme.com/pub/stores/near). Staging shows them gray because staging's DB
  doesn't carry the mapping fields — **mapping is decoupled from staging by design.**
- **→ HANDED TO DATA DEV (owner routed):** sync of chain mapping fields (navStatus/navRecipe/navType/navSeconds/
  ringsDirect/treeStatus/phoneTreeDefault/dtmfShortcut/answerPath/avgTreeSeconds/tree*At) PROD→STAGING so
  the staging site matches for pre-launch validation. Must NOT be clobbered by the staging→prod store sync.
- **Mapped TODAY (were stuck/unmapped, now locked live):** Walmart(2) review→locked 10s · Office Depot(67)
  had NO recipe → mapped, direct ~16s · Family Dollar(28) → mapped keypad 40s (the store-inconsistency
  didn't block it this run).
- **Mariano's(63) verified DIRECT** (listen: human @9s, no menu) — the direct lock is correct. Academy is
  keypad (press 2), also correct. Owner's "can't call direct" hunch was outdated for these.

## Engine state (LIVE on prod 25be309)
- No-downgrade guard (`6feff66`) + skip-rings-direct (`52d2c77`) promoted + verified. Guard proven: verify
  re-measures that come in slower KEEP the faster lock (Safeway/Kohl's/Jewel/Dick's held vs 36-111s reads).
- Independents/co-ops = DIRECT, handled in code (DIRECT_DEFAULT_CHAINS + boot backfill, 0b8d077). Boot pass
  overwrites hand-locks → don't hand-lock independents. Tree-mapper SKIPS ringsDirect/answerPath=direct_human.
- Ace = co-op, per-store nav is the long-term fix (backend ask), never one chain tree.

## Open / handed off
- **Data Dev:** prod→staging mapping sync + Food 4 Less kiosk-only flag fix (owner handed off). **Admin:** "Can't map" 3rd state + reason display
  (spec in unmapped-audit-2026-07-11.md). **Data Dev:** already filtered board endpoint 130→97, merged
  H Mart, CVS-at-Target is intentional muted quarantine — done. Muted reasons (Amazon/Best Buy/Micro
  Center = "online only", Aldi = "no store line") to populate.
- The 12 already-optimized chains are at their floor; guard protects them. No open sweep.

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead from an
  auto-caller failure. Method: `trainer/document` → read FULL menuPrompts (human option often LAST) →
  press-test (`barge`+`confirm:true`) → `trainer/lock`. No-answer ≠ unmappable (it may just ring direct).

## Other traps (keep)
- STT garbles digits — press-test each candidate. Recorded greetings false-fire "human" ~8-13s in (can
  mis-lock type:direct). Stored times can be lucky single samples — trust the engine's re-measure.
- **Mapping data lives on PROD, not staging** — a mapped chain looks gray on staging until synced.

## Owner rules (keep)
- Muted = never call. Never push code while a call is live. Done = demonstrated w/ evidence.
- Independents/single-location = DIRECT (no tree). Military exchanges = muted. National-call-center /
  online-only = callTarget:false, not mapped. Pops owns prod promotes; explicit owner naming for prod pushes.

## State
- Board: real multi-store chains mapped + optimized; independents direct; muted/malls/online excluded.
  Recipes live in prod DB. Prod is go-live ready for mapping; staging needs the one sync.

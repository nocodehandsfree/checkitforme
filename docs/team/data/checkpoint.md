# Check - Data — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, ≤80 lines. Prune finished
> items (history lives in git). Access token: Railway staging `ADMIN_TOKEN` → scratchpad `.atok`.

## KEY FACTS / DECISIONS (written nowhere else — do NOT re-learn the hard way)
- **ENV:** staging & prod are SEPARATE deploys/DBs. **Staging = source of truth**; prod catches up on
  staging→prod push. One admin reads live PROD. Stores auto-propagate via the store API; CHAINS/mapping do NOT.
- **PROMOTION RULE (field-scoped):** CURATED promote staging→prod = `muted`, `sellsPacks`/callable, `hasKiosk`,
  `carries`, `phone`, `address`, new stores, catalog. LEARNED never promote (refresh prod→staging) =
  `navRecipe`, `avgTreeSeconds`, `navSeconds`, `ringsDirect`, `treeStatus`, `dtmfShortcut`/`answerPath`/
  `phoneTreeDefault`, call history, verified hours. Every promote = DRY-RUN first. DevOps owns the sync tool.
- **SINGLE SOURCE OF TRUTH:** every surface reads the canonical store API — no parallel lists.
- **BOOT BACKFILLS (`import-data.ts`, run in `bootstrap.ts`):** `backfillChainTypes()` fill-only re-derives
  `chain.type` from `CHAIN_TYPES` (brand NOT in table → reverts to "Other" every deploy; fix = add to the table).
  `backfillDirectChains()` (NEW) ENFORCES direct on `DIRECT_DEFAULT_CHAINS` every boot (see below).
- **SILENT-AGENT BUG:** a stray `avgTreeSeconds` on a direct chain arms the connect-timer → mutes the agent on
  a live human. Read-guard `connectAtSecFor` (`recipe.ts`); write-guard in `PATCH /api/chains/:id` (nulls it
  when ringsDirect/answerPath=direct_human). Independents+co-ops now default direct (kills this class of bug).
- **PRICING/CALLABLE:** MSRP retailer → `stockCheckMethod="site"`. Hobby (sells ABOVE MSRP) → `"call"`.
- **PRODUCTS:** from Drops DB (read-only sync `scripts/sync-dropsdb.ts`); curated adds via
  `data/pokemon-catalog-supplement.json` (insert-if-absent each boot). Never fabricate a historical MSRP.
- **THIS BOX:** python-http AND headless Chromium are proxy-blocked; Google/Bing/DDG bot-block curl. Free
  direct-Google scraping impossible here → owner's local machine only. Use `curl` subprocess for admin API.
- **NEVER** run the paid hours backfill (`/api/hours/backfill`) or re-chain big-box (GameStop/Target) from directories.

## IN PROGRESS / WAITING ON OWNER
- **HOURS backfill loop (ACTIVE):** 3,412 fresh storefronts added this session (Habitat ReStore 748 + WPN
  2,664) came in with phone+address, NO hours. Owner runs them through Google on his phone in chunks (100–150
  at a time), pastes back `id | ... | Mon <val> | …`. `scripts/data-tools/ingest_hours.py <resp> <sent> --apply`
  loads them: id-keyed patch, reconciles sent-vs-returned (aborts on missing/extra), validates ranges (drops
  close≤open), skips unknowns, never deactivates. **100 done (chunk 1 → 18 written). Batch 2 (150) pending
  owner paste.** Full list: `docs/team/data/handoffs/hours_needed_fresh.csv`.
- **Independent/co-op DIRECT-nav — BUILT + verified 2026-07-10.** 14 chains incl **Ace Hardware** set
  `ringsDirect=true`+`answerPath=direct_human` on staging (mute-timer disarmed on all, verified). Ace is a
  CO-OP (~4,800 own-operated stores, no uniform tree) — cleared its chain-wide "press 4" that was muting the
  agent on direct-ringers; default direct, learn per-store from organic calls (backend follow-up). Durable code
  shipped (`DIRECT_DEFAULT_CHAINS`+`backfillDirectChains`+import default). Findings+revert snapshot:
  `docs/specs/independent-direct-nav/`. **Hand-offs pending: Mapper** (tree-mapper skip ringsDirect chains),
  **DevOps** (learned-nav refresh must not clobber these curated chains).
- **Logo resolver hardening — finding → DevOps** (`docs/specs/logo-resolver-hardening/`): measured 100% of
  stores chain-linked, 0 ride the fuzzy name-guess; recommend deleting the substring fallback in
  `chainLogoFile()`. **Logos needed (real brands only): Habitat ReStore, Unique** (rest of the "missing" are
  category buckets that use the icon by design). Owner getting logos.
- **"Time to reach a human" on the call button (owner idea):** data exists (`chains.avgTreeSeconds`); just needs
  plumbing into `/pub/stores/near` + 3-state copy. Roadmap in `handoff.md`.

## DONE THIS SESSION (detail in git; outcomes for reference)
- **Thrift hours 0%→85%** (2,965/3,479) free: Goodwill 87% / Salvation Army 65% / Savers+Unique 100%.
  Tools `scripts/data-tools/harvest_{goodwill,savers,salvationarmy}.py` → `agg_hobby.py`.
- **+3,453 new stores:** thrift +41, **Habitat ReStore +748 (new chain id 130)**, **WPN +2,664 game stores**
  (Independent Card Shop 4,119→6,697). cardshophub re-sweep EXHAUSTED (0 net-new; all big-box or already ours).
- **Hobby hours wave 1** (+11, 4 closed). Hobby tail (~1,100 home-based sellers) = owner's-machine, not waves.
- **Steward guards baked in:** empty hours ≠ closed; parsed prose never deactivates; phone-only dedupe missed
  180 same-address dupes (now address-deduped); toll-free/Canadian/donation-bin/big-box gates.

## STANDING / OPEN
- **More new-chain candidates (free, same playbook):** Buffalo Exchange, Plato's Closet/Once Upon a Child,
  St. Vincent de Paul, ARC. Hobby beyond WPN+cardshophub = other directories or WebSearch metro sweeps (spend).
- **PROD front-end BEHIND staging** (promote needed, not my lane): `type` filter + hobby/thrift data staging-only.
- **Category-sweep playbook:** national DB per category, big chains top-down + independents bottom-up, all with
  hours; new chip = `chains.type` value (mine) + front-end chip (mapping). Never re-chain big-box.
- [ ] Expand `data/distributors.json` (owner deep-research data pending). [ ] Grade ~38 unscored chains
  (`tier:null`); 2 CSV names unmatched: Learning Express, Macy's (Toys R Us). [ ] IVR detection queue (w/ mapping).

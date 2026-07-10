# Check - Data — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## KEY FACTS / DECISIONS (written nowhere else — do NOT re-learn the hard way)
- **ENV:** `staging.checkitforme.com` and `checkitforme.com` are SEPARATE deployments with SEPARATE DBs
  (`DATABASE_URL` per deploy, `src/db/client.ts`). **Staging = source of truth** (edit here first); prod
  catches up on the staging→prod push. **One admin**, reads live **PROD** data. Stores auto-propagate via
  the shared store API; **CHAINS/mapping do NOT** — reconcile by hand.
- **Owner's PROMOTION RULE (field-scoped):** CURATED fields promote staging→prod = `muted`, `sellsPacks`/
  callable, `hasKiosk`, `carries`, `phone`, `address`, new stores, catalog. **LEARNED fields NEVER promote**
  (they refresh prod→staging) = `navRecipe`, `avgTreeSeconds`, `navSeconds`, `ringsDirect`, `treeStatus`,
  `dtmfShortcut`/`answerPath`/`phoneTreeDefault`, call history, verified hours. Every promote = **DRY-RUN
  first**. DevOps owns the sync tool + reviews it before its first prod run.
- **SINGLE SOURCE OF TRUTH (standing mandate):** every page/report/endpoint reads the canonical store API —
  NO parallel lists. Enforce on every new surface.
- **CHAIN-TYPE CLOBBER:** `backfillChainTypes()` (`bootstrap.ts`) re-derives `chain.type` from `CHAIN_TYPES`
  (`src/db/import-data.ts`) on EVERY boot — now FILL-ONLY (skips already-typed chains). A brand NOT in that
  table reverts to "Other" every deploy. Fix = keep the brand IN `CHAIN_TYPES` (the source), not hand-patch prod.
- **SILENT-AGENT BUG:** a stray `avgTreeSeconds` on a direct chain (`ringsDirect`/`navType='direct'`/
  `answerPath='direct_human'`) arms the ABC connect-timer → mutes the agent while a human is on the line.
  Read-guard = `connectAtSecFor` (`recipe.ts`); write-guards in `server.ts` mapping-write,
  `calls/trainer-batch.ts`, `calls/service.ts`. Staging data cleaned (16 chains); **prod (30) pending owner
  approval** (classifier-gated prod write).
- **PRICING/CALLABLE (owner):** MSRP retailer → `stockCheckMethod="site"` (not called). Hobby (sells ABOVE
  MSRP) → `"call"` (callable). `callReady` front-end precedence (greying is WEBSITE lane): muted(hidden) >
  `stockCheckMethod="site"`("check online") > `callReady=false`(grey "coming soon") > callable.
- **PRODUCTS PIPELINE:** products come from the **Drops DB** (dropsdb.fungibles.com, read-only sync via
  `scripts/sync-dropsdb.ts` → `data/drops_db.json` → `products` table, seeded ONLY on an empty DB). Curated
  completeness = `data/pokemon-catalog-supplement.json` via `seedCatalogSupplement()` (insert-if-absent every
  boot); `sync-dropsdb` never overwrites it. ⚠️ Insert-if-absent → switch to upsert-by-externalId +
  deactivate stale `pk-supp-%` rows if price EDITS or clean removals ever need to flow. Regen:
  `scripts/gen-pokemon-catalog.ts` (era-aware; prices only on current shelf eras SV+Mega, never fabricate a
  historical MSRP).
- **Access:** Admin API needs a browser User-Agent (Cloudflare blocks non-browser UA → 1010) + `x-admin-token`
  (from Railway; keep in memory, never in a file). **Do NOT run the PAID hours backfill**
  (`/api/hours/backfill`, ~1-2¢/store) — use the FREE WebSearch-subagent wave method below.

## NOT DONE / PARTIAL / WAITING
- **National hobby-hours backfill — PAUSED** (org Claude monthly spend cap). ~3,360 hobby stores remain
  (~256 are no-data online sellers). Resume on reset. Repeatable tooling (scratchpad is EPHEMERAL — rebuild):
  `build_wave.py` → 14 free WebSearch subagents → `agg_hobby.py --apply` (id-keyed `POST /api/stores/patch`,
  hours-only; import would blank carries/lat/lng). Hobby hours coverage was 23% → 40%.
- **PROD front-end BEHIND staging — needs a promote (not my lane to deploy; flagged to owner):** the `type`
  filter (`typeF`, `server.ts`) + hobby store data are staging-only; prod `/pub/stores/near` ignores `type`.
- **Older-era set PRICES — intentionally omitted** (out of print → no honest retail price); an era→price
  table would go in `scripts/gen-pokemon-catalog.ts` if the owner wants them later.

## NO ANSWER (asked, never heard back)
- "Fix the chains section to read the canonical API" — `/api/chains` already reads the canonical tables; the
  mismatch was the staging↔prod split (the promotion tool fixes it). Asked owner to point at any admin screen
  STILL showing stale numbers — no reply.

## THE CATEGORY-SWEEP PLAYBOOK (repeatable, owner 07-06 — hobby ✓ → thrift → comic → toy → beauty → …)
Build a national DB per store CATEGORY, each its own chip, big chains top-down + independents bottom-up, all
with hours. Per category: (1) chip = new `chains.type` value (my lane) + front-end mode chip (mapping lane,
entitlement-gated); (2) tier-1 big chains from their store-locators; (3) tier-2 independents from the
category directory (cardshophub-style) or WebSearch metro sweeps, dedupe by phone, import `sellsPacks:true`
+ the type; (4) hours via the free WebSearch wave machine; (5) re-sweep per metro — never "done". Harvested
so far: Hobby 5,710 (cardshophub 4,123 card + comicshoplocator 436 comic), Thrift 3,479. Tooling committed:
`scripts/harvest-shop-directory.py`, `scripts/transform-shops.py` (curl through `$HTTPS_PROXY`; browser is
proxy-blocked). NEVER re-chain big-box rows (GameStop/Target/etc.) harvested from directories.

## Still-open items from earlier sessions
- [ ] **Expand `data/distributors.json`** (owner returning with deep-research data): per distributor capture
  product lines + retailer network; deliver `distributor→{products,chains}` + `our-chain→distributor`. Chain
  keys MUST match `chains.name` EXACTLY (verify via `/api/chains`); high-confidence only; `pnpm check`; deploy
  both branches; verify `carries` derives identically on both.
- [ ] **Grade the ~38 unscored chains** (owner call) — chains NOT in `chain_scores_final.csv` still `tier:null`.
  Also 2 CSV chains unmatched by name: **Learning Express**, **Macy's (Toys R Us)** — find the DB alias or add.
- [ ] **Thrift logos** — Goodwill/Salvation Army/Savers/Unique need `public/logos/chains/<slug>.png` (needs
  image tooling; follow `docs/data/store-logos.md`).
- [ ] **General cleanup** — Places-sourced staleness, unconfirmed carriers, muted repack chains (see
  `docs/data/COVERAGE_REPORT.md`).
- [ ] **IVR detection queue (coordinate w/ mapping):** flag stores whose calls hit an IVR into a "needs
  phone-tree mapping" queue; propose an `ivr` status on call results + an admin queue endpoint.

When you finish something: move it to git history; leave this Current state set for the next chat.

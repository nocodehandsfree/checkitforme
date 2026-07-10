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
- **Hobby hours — wave 1 RAN + VERIFIED 2026-07-10** (420 tail stores, 14 WebSearch subagents): 11 hours
  written, 4 permanently-closed deactivated, 3 fake "24/7" artifacts blocked (guard now in `agg_hobby.py`),
  402 all-unknown skipped. **Hit rate 3.6% — the 1,127 remaining tail is mostly home-based online sellers
  with no Google hours panel. STOP waving the hobby tail; hand it to the owner's local machine** (list:
  regen `hobby_nohours.py`, minus `scripts/data-tools/hobby_done_ids.txt`). Hobby: 4,360 active, ~1,580
  missing hours (63% coverage). Patch is hours-only by id; import would blank carries/lat/lng.
- **Thrift hours — DONE 0%→85% (2,965/3,479) 2026-07-10, $0 spent, verified live:** Goodwill 87%
  (locator ajax API; GWNONCE gotcha in script header) · Salvation Army 65% (satruck API free-text parser;
  ~91 unparseable stay unknown) · Savers+Unique 100% (stores.savers.com pages). Harvesters in
  `scripts/data-tools/harvest_*.py`, all feed `agg_hobby.py --apply`. Residue: ~386 Goodwill no-data,
  ~128 SA (37 not in their locator + 91 unparseable), 2 unmatched — WebSearch-wave or owner's-machine
  material. **Steward rules learned: empty hour fields ≠ closed; parsed prose NEVER deactivates a store**
  (both guards are in the code now — first drafts would have wrongly deactivated 361+9 live stores).
- **Thrift store COUNT expansion — DONE 2026-07-10, +41 real new stores** (Goodwill 8, Savers 2,
  Salvation Army 31; 29 with hours). Mined the same chain locators for stores missing from our DB.
  **The honest yield is small: chain locators overwhelmingly cover stores we already have.** Integrity
  gates (in `apply_thrift_expansion.py`) dropped: 748 Goodwill donation-drop-off bins (not shoppable),
  182 same-address/different-phone DUPES (phone-only dedupe would have double-listed them — big trap),
  2 toll-free 1-800 call-center numbers (not a human at THAT store), 13 Canadian. Tools:
  `expand_{goodwill,savers,salvationarmy}.py` → `apply_thrift_expansion.py --apply`.
- **Hobby COUNT expansion — WPN +2,664 game stores 2026-07-10 (Independent Card Shop 4,119→6,697).**
  Wizards Play Network public GraphQL (`api.tabletop.wizards.com/silverbeak-griffin-service/graphql`,
  query `getStoresByLocation`, no auth) lists local game/TCG stores nationwide. `harvest_wpn.py` national
  point-grid sweep found 4,835 unique; gates → 2,664 net-new US independents (dropped 606 non-US, 544
  big-box GameStop, 866 dupe-phone, 139 dupe-address). All active w/ phone+address, 51 states. **NO
  HOURS in source → hours-backfill needed** (same as ReStore). `apply_hobby_expansion.py` parses WPN
  postalAddress, multi-source, @file POST.
- **cardshophub re-sweep — EXHAUSTED (0 net-new).** All 6,669 pages harvested; every callable independent
  already ours, only big-box (GameStop 2,214) + no-phone remained. Big-box/kiosk filter reusable.
- **NEW CHAIN added — Habitat ReStore +748 US stores 2026-07-10** (chain id 130, type Thrift, all
  active w/ phone+address, 49 states; 45 Canadian + 3 toll-free + 1 dupe dropped). Source
  `harvest_habitat_restore.py` (habitat.org /local/restore?zip= national sweep). **NO HOURS in source
  → needs a hours-backfill wave** (WebSearch or per-affiliate). **Owner TODO: logo** (defaults to Thrift
  category icon until then). Owner OK'd new-chain expansion (logo not a blocker; independents use the
  category icon, chains get a logo later). `apply_thrift_expansion.py` now posts the body via file
  (@tmp) — 500-row batches overflowed argv.
- **MORE new-chain candidates (same playbook, free):** Buffalo Exchange, Plato's Closet / Once Upon a
  Child, St. Vincent de Paul, ARC Thrift. hobby = other directories or WebSearch metro sweeps (spend).
  The 3 big thrift chains + cardshophub are fully mined.
- **Env facts (verified):** python urllib AND headless Chromium are proxy-blocked here; Google/Bing/DDG
  bot-block curl. Free direct-Google scraping is impossible from this box — that's owner's-local only.
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

# Data provenance — one source of truth for store data

**Why this doc exists.** Every surface that shows a store — the consumer site, the admin dashboard,
the voice-call engine, the best-bet ranker — must read the **same** store name, address, phone, hours,
tier, and flags. This doc is the map of where every piece of store data comes from, who writes it, who
reads it, and the rule that keeps them all in sync. If you're ever unsure "where does this store name /
number / score come from?", the answer is here.

---

## The one rule

> **The SQLite database is the single source of truth.** Specifically the `chains` and `retailers`
> tables (+ the signal tables). **Every** surface reads store data from the DB through the API. **No
> surface keeps its own store list, hardcoded names, or a parallel CSV it reads at request time.**

The DB is one file (`file:/data/local.db`) on a Railway volume. It is **not directly connectable** —
all writes go through the **admin HTTP API** (`/api/...`) and the **importer**
(`POST /api/stores/import`). There is no second copy.

```
                         ┌─────────────────────────────────────────────┐
  ONE-TIME / REFRESH     │            THE DATABASE (truth)             │
  IMPORT SOURCES         │  chains · retailers · products · categories │
  (files in data/, run   │  call_results · stock_signals · kiosks · …  │
   through the importer) └───────────────┬─────────────────────────────┘
        │                                 │  read via the API (never a file)
        ▼                                 │
  scripts/import-stores.ts ──▶ POST /api/stores/import
        │                                 │
        │              ┌──────────────────┼──────────────────┬───────────────────┐
        │              ▼                  ▼                  ▼                   ▼
        │      /pub/stores/near    /api/admin/*       calls/service.ts     best-bet.ts
        │      (consumer:          (admin:            (the voice engine    (the "most
        │       checkit.html)       app.html)          dials these rows)    likely" ranker)
        │
  data/stores-master/*.json.gz   ← store identity (100K master)
  data/source/chain-scoring-…/   ← chain tiers / logistics / products (scoring)
  data/pokemon-vending-import.json ← official TPCi kiosk list (NOT git-tracked; regenerated)
  data/drops_db.json             ← product catalog seed
```

**Source files are import inputs, not runtime reads.** `data/stores-master/*.gz` is loaded *once* (or
on a refresh) through the importer; the server never opens it to answer a request. The only files read
at request time are **static assets** (HTML, logos, OG cards) and two **chain-keyed config** JSONs
(stock-rail tuning — see the table) — never store names.

---

## Per-domain provenance

| Data | Lives in | Origin (written by) | Read by |
|---|---|---|---|
| **Store identity** — name, address, city/state, zip, lat/lng, phone, timezone | `retailers` | Importer (upsert, **dedupe key = E.164 phone**) → admin edits → the **dedupe endpoint** (name normalization) | `/pub/stores/near`, `/api/admin/*`, `calls/service.ts`, geocoder |
| **Chain identity** — name, type, phone tree, logo | `chains` (+ `public/logos/chains/<slug>.png`) | Importer (links/creates by **exact `chain` name**); logos are PNG assets resolved by chain slug | Everywhere a store renders; the logo resolves by **chain**, not store name |
| **Scoring / tier (1–5)** | `retailers.tier` (per store) | Chain values stamped from `chain_scores_final.csv`; **kiosk overlay forces 5**; per-store voice-confirm overrides. See `docs/specs/scoring.md` | `/pub/stores/near` projection → `checkit.html` tier groups |
| **Kiosks** — `hasKiosk`, `externalStoreId` | `retailers` (+ `kiosks`/`kiosk_reports` for crowd intel) | The **official TPCi vending list** only (`data/pokemon-vending-import.json`), reconciled by `POST /api/kiosks/reconcile` — *if it's not on the official list, it doesn't exist* | Kiosk tab + the tier-5 overlay + the kiosk call script |
| **Hours** — `hours` (JSON), `hoursUpdatedAt` | `retailers` | Importer + hours harvester (`src/hours-harvest.ts`) + `POST /api/hours/reverify-stamps` | `openState()` → open/closed badge + the call gate (don't call a closed store) |
| **Carries / categories** | `retailers.carries` (CSV) + `categories`/`products` | Importer (`carries`); catalog seeded from `drops_db.json`; product evidence in `chain_products_merged.csv` | Category filter on every store query; the agent's ask |
| **Stock signals** (non-call) — site checkers, Discord pings, kiosk receipts, manual | `stock_signals` | `src/stock/signals.ts` ingest + `POST /api/stock/ingest` | The in-stock badge (freshest signal wins for site-rail chains) |
| **Call outcomes** (ground truth for callable chains) | `call_results` | The voice engine on every finished call | The "is it green?" answer, best-bet history, the verdict card |
| **Stock-rail config** (chain-keyed, NOT store names) | `data/sell_methods_intel.json`, `data/stock_check_intel.json` | Hand-maintained config files | `src/stock/sellmethods.ts`, `src/stock/intel.ts` — keyed by **chain**, tunes how a chain is checked |

---

## The writers (only these touch store data)

1. **The importer** — `scripts/import-stores.ts` → `POST /api/stores/import` (`src/stores-import.ts`).
   Upsert keyed on **E.164 phone**, so re-import can't create duplicates. This is how the 100K master,
   the thrift rail, and any refresh land. Full field contract: `docs/specs/store-data-schema.md`.
2. **The admin API** — `PATCH /api/retailers/:id`, `POST /api/stores/patch`, `PATCH /api/chains/:id`,
   and the maintenance endpoints (`/api/stores/dedupe`, `/api/stores/quarantine-cvs-in-target`,
   `/api/kiosks/reconcile`, `/api/hours/reverify-stamps`). Used for live data fixes.
3. **The voice engine** — writes `call_results` (and learned `shipmentDay` / phone-tree recipes).

Nothing else writes store data. There is no direct DB connection in prod, no second store table, and
no surface that mutates store rows on its own.

## Name normalization (so one store has one name everywhere)

Store display names are normalized to a single scheme by `POST /api/stores/dedupe`:
- **`Chain City`** for a lone store in a city (e.g. `Target Topanga`).
- **`Chain Street`** when a city has collisions (3 CVS in Woodland Hills → disambiguated by street,
  then house-#, then suite-#).
- Strips store numbers (`(#264)`), em-dash separators, ALL-CAPS streets, and scraped-HTML junk.
- Grouped by `(chain, city)` so it's **idempotent** — re-runs report 0 changes.

Because the name is one column read by everyone, fixing it once fixes it on the consumer site, the
admin, and the call script simultaneously.

---

## How "everything reads one place" was verified

- Grepped every runtime file read in `src/server.ts`, `src/calls/service.ts`, `src/stock/*`: the only
  request-time reads are **static assets** (`../public/...` HTML/logos/OG) and the two **chain-keyed**
  stock-config JSONs above. **Zero** store names are read from a file at request time.
- `data/stores-master/*.gz` (the 100K master) is referenced **only** by the importer, never the server.
- The consumer projection (`/pub/stores/near`), the admin reads (`/api/admin/*`), and the call engine
  (`calls/service.ts`) all query the same `retailers`/`chains` tables.

---

## Logos — the one source that lives in files, not the DB

Store **data** is the DB; store **logos** are the one exception — they're files with their own single
source of truth. Manage both from here so there's one place to look.

- **Source:** `public/logos/chains/<slug>.png` — one transparent PNG per chain (+ `_meta.json` for the
  wide/plate flags). Nothing hardcodes or duplicates a logo. Full detail + the asset pipeline:
  **`docs/STORE_LOGOS.md`**.
- **Resolver:** a logo is matched to a chain **by chain name** — `chainLogoInfo()` (`src/server.ts`)
  slugs the name and tries exact / `-`↔`_` variants / a fuzzy stem match. Every surface (consumer,
  admin, logo wall) reads the same resolved `logoUrl`; none embeds its own copy.
- **Render contract (how to "pull" a logo):** every store row from `/pub/stores*` + `/app/history`
  already carries `logoUrl` / `logoWide` / `logoDark`. A surface reads `logoUrl` → `<img>` it (respect
  `logoWide`/`logoDark` for sizing/plate); if absent → the shared **text wordmark** fallback. Lazy-load
  (`loading="lazy"`), per-store only, never bulk-load the wall.
- **Coverage (audited 2026-06):** of **109** visible chains, **87 resolve a logo**; **13 real chains
  still need a file** — Amazon, FoodMaxx, Goodwill, Hallmark, Lucky Supermarkets, Metro Market, Pak N
  Save, Payless Foods, Salvation Army, Savers, Unique, Uwajimaya, Woodman's Market. Re-run the audit by
  enumerating `/api/chains` and applying the resolver against `public/logos/chains/`.
- **The one resolver failure mode:** a file named *too specifically* (more than the chain's slug) won't
  match — if a logo looks missing despite the file existing, rename the file to the chain's slug (or a
  `-`/`_` variant of it).

---

## Known provenance gaps (fix queue)

- **Orphan stores — RESOLVED / non-issue.** Checked via `POST /api/stores/relink-orphans` (dryRun):
  **0 active stores have `chainId` null.** The `chain: null` seen in the `/pub/stores/near` payload
  (e.g. "Burlington Jewelry District") is **cosmetic only** — that store is `chainId 27`, renders its
  logo (`burlington.png`), and carries tier 3. The projection's `chain` field is unpopulated, but the
  logo and tier resolve independently, so nothing is broken. The relink endpoint stays as an idempotent
  safety net (re-attaches by longest whole-word chain-name prefix if an orphan ever appears).
- **Missing logos — 13 chains** (see the **Logos** section above for the full list + audit). Includes the
  thrift chains (Goodwill / Salvation Army / Savers / Unique, needed before Treasure Hunt ships) and
  Hallmark. Needs image tooling (sharp / ImageMagick) not in every session; pipeline in `docs/STORE_LOGOS.md`.
- **Mall + vending pseudo-chains — cleaned.** 9 empty "mall" chains (Tacoma Mall, Capitola Mall, …) had
  0 stores and were hidden (`_`-prefixed + muted). "Pokemon Vending" (kiosk machines) was set
  non-callable (`sellsPacks:false`) but kept active so its kiosks stay on the consumer Kiosk tab. The
  Select-a-Chain picker should exclude chains with 0 callable stores so these never reappear there.
- **Ungraded long tail.** Stores carry `tier: null` when their chain isn't in the scoring CSV (81 of
  119 chains are scored). `POST /api/stores/grade-from-defaults` fills tier **only where null** from a
  `{chain: tier}` map (never overwrites a deliberate per-store/owner tier). The genuinely unscored
  chains (the other ~38, excl. thrift) need an owner scoring call before they can be graded.
- **`data/pokemon-vending-import.json` is not git-tracked** (regenerated by
  `scripts/collect-pokemon-vending.mjs`). The reconcile endpoint takes the official IDs in the request
  body so the rule survives even though the file isn't committed.

---

## Where store data + logos are served (every touch-point)

The rule: **no surface keeps its own store list or fetches logos.** The server denormalizes
`{logoUrl, logoWide, logoDark}` onto each row via `chainLogoInfo(name)` (`src/server.ts` — resolves a
chain name → `public/logos/chains/<slug>` + the wide/dark flags), and every surface just reads the row
(logo present → `<img>`; absent → the shared text wordmark, never a 2-letter monogram). Changing
logo/serving behavior? Fix it at the source (`chainLogoInfo`), not per surface. Here's everywhere it flows:

**Server endpoints that serve store data + attach logos** (`src/server.ts`):
| Endpoint | Serves | Logo |
|---|---|---|
| `/pub/stores/near` | consumer store list (by coords) | ✓ |
| `/pub/best-bet` | consumer "best near you" pick | ✓ |
| `/api/retailers` | admin Stores list | ✓ |
| `/api/chains` | admin Chains list (+ store aggregates, tier) | ✓ per chain |
| admin recent-calls feed | Calls history rows | ✓ retailer |
| `/logo-wall` | dev/admin logo audit page | ✓ |
| consumer page render | brand (vertical) mark into `checkit.html` (`__BRAND_ART__`) | brand logoUrl |

**Render spots — read `row.logoUrl`, else the wordmark fallback:**
- **Consumer** (`public/checkit.html`): store rows (`.store .ic`), the result header (`.rhead`, 58px),
  the brand mark (`__BRAND_ART__`).
- **Admin** (`public/app.html`): `logoTile()` / `.slogo` — Stores list, Chains list, Calls feed, and the
  per-chain Settings logo (`set_storelogo`).
- **Fallback:** `storeWordmark` (consumer) / shared text fallback (admin) when `logoUrl` is null.

> Code touch-points maintained by DevOps; the asset + resolver rules live above and in `STORE_LOGOS.md`.
> **Logos are now DB-first** (`docs/specs/logo-r2-keystone.md`): `chainLogoInfo()` returns a chain's
> `chains.logo_url` (shared R2 at `logos.fungibles.com`, set via `POST /api/chains/:id/logo` or the
> migration) when present, falling back to the filesystem `public/logos/chains/<slug>`. R2 is shared, so
> the image is identical on every environment.

### Carries — derived from distributors (same serve-time pattern as logos)

A store's **`carries`** is **derived at serve-time**, NOT read from the per-store column, for any chain
mapped in **`data/distributors.json`** (distributor → products, chain → distributor(s); a chain's list =
the union of its distributors' products). The config lives in **code**, so the list is **identical on
every environment** (Admin/staging/prod — prod & staging run *separate DBs*, so a stored column would
drift; a derived one can't) and **auto-applies to any newly-imported store** of a mapped chain with zero
stamping. Resolver: `storeCarriesList(chainName, storedCarries)` / `carriesForChain(name)` (`src/server.ts`).

**The dev rule — READ THIS before touching carries:**
- **Never** edit `retailers.carries` to change a *mapped* chain's products — it's ignored at serve-time.
  Change the chain's products in **`data/distributors.json`** (one edit → every store of every chain that
  distributor serves, on every environment).
- **Any new endpoint that lists stores MUST** run carries through `storeCarriesList(chainName, r.carries)`
  and logos through `chainLogoInfo()` — never serve raw `r.carries` or a hardcoded logo path. Unmapped
  chains fall back to the stored column automatically.

**Serving audit (who derives carries):** `/pub/stores` ✓ · `/pub/stores/near` ✓ · `/api/retailers` ✓.
`/pub/best-bet` reads the raw column in its *ranking filter only* (never displays carries; behaviorally
equal for mapped chains). A contract check (`scripts/check-store-contract.mjs`) fails the build if a new
store-listing response serves raw `r.carries` instead of `storeCarriesList()` — so coverage can't silently regress.

---

## Related docs
- `docs/specs/store-data-schema.md` — the importer's full field contract + hours format + dedupe key.
- `docs/specs/scoring.md` — the 1–5 tier rubric (how `retailers.tier` is set).
- `docs/STORE_LOGOS.md` — the logo source of truth (chain → `public/logos/chains/<slug>.png`), who
  renders them, and the processing pipeline. (A store's logo resolves by **chain**, never store name.)
- `docs/specs/kiosk-call-flow.md` — kiosks, the official-list rule, the kiosk call script.
- `docs/API_CONTRACT.md` · `docs/STOCK_AND_GEO_API.md` — the front⇄back interface + stock/geo rails.
- `data/source/chain-scoring-2026-06/` — the owner-delivered scoring package (source of the tiers).

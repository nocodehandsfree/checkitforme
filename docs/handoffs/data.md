# Check — Data Dev (store data)

You are **Check - Data Dev.** You own the store dataset: adding/cleaning stores, logos, types,
shipment days, values, and the import structure. (You manage the *rows*; Admin builds the *UI*.)

## Your lane
- `data/` — the 100K-store source JSON (stores-master, zones, intel).
- `src/stores-import.ts` — the importer (field mapping, dedupe-by-phone, region/tz).
- Store data via the admin CMS + the in-admin AI agent (`src/agent/admin-agent.ts` tools) and the
  import script `scripts/import-stores.ts`.
- The store columns in `src/db/schema.ts` (`retailers`, `chains`) — propose schema changes to DevOps.

## Don't touch
- The call/auth/billing/voice backend, the web UIs (request UI changes from Website/Admin),
  schema changes outside store tables (request from **DevOps**).

## Read (in order) — open only what you need
1. `/HANDOFF.md` · `docs/ARCHITECTURE.md`
2. **`docs/DATA_PROVENANCE.md`** — where ALL store data comes from + the one-source-of-truth rule
   (every surface reads the same DB rows). **Read this first** so you never introduce a parallel list.
3. **`docs/specs/store-data-schema.md`** — the full store-data reference: every collector field →
   DB column, the hours format (incl. the 2 AM bug), dedupe rules, the behavior flags, and how to
   load a file. (This is also the doc handed to the planning chat for new data.)
4. **`docs/specs/scoring.md`** — the 1–5 tier rubric (`retailers.tier`), derived from the owner's
   scoring package now committed at `data/source/chain-scoring-2026-06/`.
5. `data/stores-master/README.md` + `COVERAGE_REPORT.md` · `docs/STOCK_AND_GEO_API.md` (store shapes)
6. The `retailers`/`chains` tables in `src/db/schema.ts` · `src/stores-import.ts`

## How you access files & keep the lane clean (process)
- **Edit only your lane:** `src/stores-import.ts`, `data/**`, `scripts/import-stores.ts`, and the
  `retailers`/`chains` columns in `src/db/schema.ts`. Everything else is read-only for you.
- **Don't load files outside the Read list** unless a task needs them — keeps your context lean and
  avoids stepping on another lane's in-flight edits.
- **Schema changes (new columns) are NOT yours to make** — `src/db/schema.ts` + `src/db/bootstrap.ts`
  are co-owned with DevOps and schema is bootstrap-managed (never `drizzle-kit generate`). Propose the
  column to **DevOps**; they add the `ALTER TABLE` to bootstrap, then you populate it.
- **UI is not yours** — if a fix needs a map/list change (e.g. how a logo renders), file it to
  **Admin** (admin UI) or **Website** (consumer UI); you supply the rows + assets, they render.
- **Loading data:** dry-run first (`tsx scripts/import-stores.ts <file> … --dry`), then the real run.
  Import is an idempotent upsert keyed on phone — safe to re-run; appending can't create dupes.
- Work on the deploy branch `claude/retail-stock-voice-calls-OcyMS`; commit + push = live in ~3 min.

## Current focus (KEEP UPDATED)

**Session 2026-06-26 — tier-5 coverage sweep (store-by-store) + consumer store-feed fix + promote-pipeline outage.**

### Shipped (LIVE on prod + staging unless noted)
- **Tier-5 backfills — reconciled STORE-BY-STORE (not by count).** Method: pull the chain's official store
  directory per gap-state, dedupe vs our rows by `address-norm + phone`, geocode (US Census → Nominatim
  fallback; set hyphenated Coachella-style addresses by hand), `POST /api/stores/import`.
  - **Hobby Lobby:** CA 10→70 (all open CA) + the West/Mountain hole (AZ/WA/NM/UT/CO/OR/NV/ID ≈71).
    National **889→1,020 (94%)**. **Texas (+58) still pending.**
  - **Target:** CA 251→**324** (+73). Real CA = 324 (storelocators, Jun-2026). **Other states (~260) pending.**
  - **Dollar General:** CA 260→**264** (+Greenfield, Indio, Pearblossom, San Bernardino) — CA complete vs 263 official.
  - **Books-A-Million:** the audit's "missing 75" was a STALE reference — BAM has **closed down to 175 open**
    (official locator). We had all but 2 (Salina KS, Rapid City SD), now added; ~14 of our BAM rows are closed
    stores → being deactivated.
- **Coverage audit (22 major Pokémon chains, our count vs real US totals):** 17 at 95–100%. Real growing-chain
  gaps = Target + Hobby Lobby. CVS/Walgreens/GameStop look low only from documented closures (we track current
  operating reality, not a stale peak).
- **LESSON — count ≠ completeness.** A near-matching national count hides (a) specific metro gaps (HL's late
  West-Coast expansion), (b) stale reference numbers (BAM), (c) closed stores still listed. **Reconcile
  store-by-store for tier-5**, especially dense/recently-expanded metros.
- **Big 5 Santa Barbara (id 7900):** owner intel → tier 4→**5**, restock **Mon & Wed**, specialInstructions
  (busiest Big 5, most Pokémon; recently Chaos Rising booster sleeves, Mega Clefable tins, Mega Zygarde posters).
- **Consumer store-feed fix (`/pub/stores/near`):** in a dense metro a 20-mi radius holds 400+ stores (200+
  tier-5); the page limit dropped a sparse FAR green-group chain (a Dollar General ~19mi out, in-radius but
  past the cut → "Dollar General never shows up near me"). Fix **pins the nearest store of each tier-5 chain**
  (first page) so every green-group chain always surfaces. **Live on staging; awaiting owner OK for prod**
  (code change → staging-first rule).

### ⚠️ Promote pipeline DOWN — flag for DevOps/Website
- Staging→prod data promote (`scripts/promote-config.mjs` → `POST /api/admin/promote-apply`) now **404s on
  BOTH envs** after the website team's 2026-06-26 deploys removed/renamed that endpoint (it worked earlier
  today). **Until restored, staging DB edits do NOT auto-sync to prod.**
- **Workaround in use:** push new/updated tier-5 rows **directly to BOTH** staging and prod via
  `POST /api/stores/import` (dedup-by-phone, idempotent) and `PATCH /api/retailers/:id`.

### Store API — what it serves (incl. logos) + apps it powers
One DB, read three ways; **carries + logos DERIVE at serve-time** (no per-row copies that drift):
- **`GET /pub/stores/near?lat&lng&radius&limit&mode`** — THE consumer path (website + iOS app). bbox→
  distance→page. Per store: id, chainId, name, location, address, storeType (=chain.type), **logoUrl/
  logoWide/logoDark**, **carries** (distributor-derived), lat/lng, tier, callable, inStock, stockCheckMethod,
  sellMethods, openState. Owner-only + (pending-prod) nearest-per-tier-5-chain pinned past the page limit.
- **`GET /pub/stores`** — every active+phone store (Admin logo map); same shape, no paging.
- **`GET /api/retailers?chainId&state&q&limit`** (admin) — full retailer rows + logoUrl + carries.
  **Capped at 1000** — use `/pub/stores` (or `table-dump`) for full scans.
- **Logos:** `chainLogoInfo(chainName)` is **DB-first** — `chains.logo_url` (shared Cloudflare R2 at
  logos.fungibles.com) wins over per-branch `public/logos/chains/<slug>.png`, so a logo travels to every env
  and can't drift. ~99.97% of stores carry an R2 logo.
- **Carries:** `storeCarriesList(chainName, stored)` = distributor-derived (`data/distributors.json`, inlined
  fallback in `server.ts`) for mapped chains, else the stored `carries` column.
- **Apps powered:** consumer website (checkitforme.com / staging.checkitforme.com), the iOS app, and the Admin
  store list — all read these SAME rows, so a store/logo/tier/intel added here shows up everywhere.

---

**Session 2026-06-25 — the "derivation era": logos→R2, carries→distributors, MVPs demo, phone harvest.**

> **RESUMING? Read this box first.** Two architecture shifts this session: (1) chain **logos** are now
> DB-first from **shared R2** (`logos.fungibles.com`); (2) store **`carries`** is **derived** from
> `data/distributors.json`, not the per-store column. Both are a written contract in
> `docs/DATA_PROVENANCE.md` ("Carries — derived from distributors") + guarded by
> `scripts/check-store-contract.mjs` (`pnpm check`). **prod and staging are SEPARATE DBs + separate
> deploys** — code goes to BOTH branches; admin-API DB writes hit only the env you call.

Shipped (live + verified on prod, and staging where noted):
- [x] **Distributor-driven carries.** `data/distributors.json` = distributor→products + chain→distributors
  (a chain's carries = union of its distributors' products), derived at serve-time by
  `storeCarriesList()`/`carriesForChain()` (`src/server.ts`); wired into `/pub/stores`, `/pub/stores/near`,
  `/api/retailers`. Seeded **Excell** (Pokémon/Lorcana/MTG/One Piece/Yu-Gi-Oh/Sports Cards) + **Schylling**
  (NeeDoh) + **Jazwares** (Squishmallows) → **CVS/Walgreens/Target/Walmart/Barnes & Noble**. Unmapped chains
  fall back to the stored column. Auto-applies to new stores of mapped chains (no stamping). **Verified
  identical prod+staging.** Why derive (not stamp): config lives in code → consistent across separate DBs.
- [x] **Logo R2 keystone (Data Dev half).** DevOps shipped the bucket/worker (PR #417, `logos.fungibles.com`,
  `presignPut` in `src/r2.ts`). Added `chains.logo_url/logo_wide/logo_dark` (schema+bootstrap),
  `chainLogoInfo()` is **DB-first** (R2 wins, filesystem fallback; cache `refreshChainLogoDb`, 60s),
  `POST /api/chains/:id/logo` (server-side presigned PUT), `POST /api/admin/migrate-logos-to-r2`.
  **Migration ran: 106 chains on prod, 96 on staging now serve R2.** Key = `chain-logos/<slug>.png`.
- [x] **MVPs demo store** (owner-only pitch store, like Fun). Chain 121 "MVPs", store **106362**: `ownerOnly`,
  Calabasas geo-pin, 24/7, `sellsPacks`, carries Pokémon, logo `chain-logos/mvps.png`, armed `+18185770433`.
  **Number = on/off** (PATCH phone on an ownerOnly store derives `active`). `seedMvpsStore()` in bootstrap
  (create-only — never overwrites phone/active). Staging DB lags prod, so MVPs chain may differ there.
- [x] **Geo-bypass → prod.** Owner-only stores surface regardless of distance for the comp account (was
  staging-only — the "Venice" gap). In `/pub/stores/near`.
- [x] **Phone harvest.** H-E-B (84) + H Mart (6) were all `nophone:` (0 callable). `fetchStorePhone()`
  (`src/store-phone.ts`, OpenAI web-search→Gemini, E.164) + `backfillPhones({chainId})` +
  `POST /api/phones/backfill?chainId=&dryRun=1`. Harvested all 90 (area-code verified) + `sellsPacks=true`
  → **both chains fully callable.** Reusable for any address-only chain.
- [x] **Data-health fix.** `/api/admin/data-health` mis-chain matcher stems possessive `-s` (real
  Mariano's/Lowe's/Smith's no longer false-flag); excludes ownerOnly demo stores. Mis-chained 44→0.
- [x] **6 homeless stores hidden** (`active=false`, recoverable) per owner's "don't include if no chain home":
  Olsens Market Place 2768, Mansfield Market Place 3768, Ray's Food Place 3086/3841, Lee Harrison 62635,
  Hyvee Equipment LLC 66429. All non-kiosk.

Pending / next session:
- [ ] **Deep research → expand `data/distributors.json`** (owner returning with the data). Brief: per
  distributor capture product lines + retailer network + channel + recent shifts; deliver
  `distributor→{products,chains}` + `our-chain→distributor` for our ~120 chains, plus emerging lines
  (Pop Mart/Labubu blind-box, Star Wars Unlimited/Riftbound, etc.) worth adding. **When it arrives:** add
  entries (chain keys MUST match `chains.name` EXACTLY — verify via `/api/chains`); only high-confidence
  (flag low-confidence for call-verify); `pnpm check`; commit; deploy to **both** OcyMS + pagiis; verify
  carries derives identically on both envs (curl `/api/retailers?q=<chain>` on both hosts).
- [ ] **DevOps prompt sent** (owner relaying): add `node scripts/check-store-contract.mjs` to
  `voice-caller-ci.yml`; fix the pre-existing `config.staging` tsc error (`src/server.ts:1430`) that reds the
  typecheck gate; make CI a required merge check.
- [ ] **Handoff pointers** — `docs/handoffs/admin.md` + `website.md` need a 2-line "carries+logos are
  derived, don't edit the column / drop a file" note. Offered; awaiting owner go.

Architecture facts the next session MUST know:
- **Separate DBs + deploys.** prod = `claude/retail-stock-voice-calls-OcyMS` (pokemon.fungibles.com /
  checkitforme.com); staging = `claude/checkitforme-website-takeover-pagiis` (staging.checkitforme.com).
  Code → both branches. Carries derives from code config (auto-consistent); logo_url + store rows are
  per-DB (logo migration was run on both; staging's DB lags prod).
- **Branch flow.** Dev on `claude/awesome-knuth-613jn0` (reset to origin/OcyMS before each build),
  cherry-pick → OcyMS (prod) + pagiis (staging). OcyMS moves often (logo lane) — rebase before push.
  Railway auto-deploys on push (~60-90s); CI does not gate Railway.
- **Access.** Admin API needs a browser User-Agent (Cloudflare blocks python-urllib → 1010); admin token
  at `/tmp/.atok` (don't print). `config.staging` tsc error is DevOps's, not ours.

**Session 2026-06-19 — data documented, scoring package committed, ungraded tail closed (see COMPLETED.md).**
- [x] **Single-source-of-truth doc** — `docs/DATA_PROVENANCE.md` written: every store-data domain, who
  writes it, who reads it, verified that **no surface reads a rogue store list** (only the DB).
- [x] **Scoring package recovered + committed** — the owner's "four-file zip" is now at
  `data/source/chain-scoring-2026-06/` (rubric + 85 chain scores + logistics + 264 product rows), and
  the repo-native rubric is `docs/specs/scoring.md`. Tiers confirmed LIVE in prod (2/3/4/5 spread).
- [x] **Closed the ungraded tail** — new `POST /api/stores/grade-from-defaults` filled **6,864**
  null-tier stores across **31** chains (almost all grocery — Publix t3, Kroger/Safeway/Albertsons/Vons/
  Ralphs t4, kiosk-host Pavilions/Gelson's/Star Market t5) from `chain_scores_final.csv`. **Fill-only-
  null** (never overwrites a deliberate tier like TJ Maxx=3); idempotent (re-run fills 0). Verified in prod.
- [x] **Orphans — non-issue** — `POST /api/stores/relink-orphans` (dryRun) found **0** `chainId`-null
  active stores. "Burlington Jewelry District" is `chainId 27` w/ logo + tier 3; its `chain:null` is a
  cosmetic projection field. Relink endpoint kept as an idempotent safety net.
- [ ] **Grade the ~38 unscored chains** (owner call) — chains NOT in `chain_scores_final.csv` still have
  `tier: null` (ranked by distance). Need a tier decision per chain before `grade-from-defaults` can fill
  them. Also 2 CSV chains unmatched by name: **Learning Express**, **Macy's (Toys R Us)** — find the DB
  alias or add them.
- [ ] **Thrift logos** — Goodwill / Salvation Army / Savers / Unique still need `public/logos/chains/
  <slug>.png`. Needs image tooling (sharp/ImageMagick) — follow `docs/STORE_LOGOS.md`.

**Session 2026-06-17 — big prod cleanup done (see COMPLETED.md).** Writes went LIVE via the admin API
(`PATCH /api/retailers/:id` + bulk `POST /api/stores/patch`); the `openState` fix shipped on this branch.
- [x] **Kiosk-only mis-flagging (Pavilions).** ✅ Verified in prod (`hasKiosk:true, sellsPacks:false`).
- [x] **"2 AM" bug.** ✅ `openState` now reads unknown/blank hours as **closed 01:00–06:00 local**
  (daytime unchanged); `scripts/test-store-hours.ts`. Plus **150** fake all-day stamps blanked
  (Walgreens/CVS/Safeway/…; genuine-24h Wawa/Sheetz/Buc-ee's kept). Unenumerable tail → bulk `clearHours`.
- [x] **Store-name cleanup.** ✅ Owner chose **drop the dash**: `Chain — City` → `Chain City` —
  **57,327** renamed (0 errors; verified 0 remaining). Plus **941** `(#1234)` store-number strips.
- [x] **Dup chains.** ✅ Already empty (0 stores): `Sams`/`Franklin's Ace Hardware`/`Hallmark`. The 3
  empty chain *rows* still need deleting (chain-level op — no `DELETE chain` endpoint; bulk/DevOps).
- [ ] **Logos on the map.** A pin's logo = its chain name → `public/logos/chains/<slug>.png`. Audit
  for chain-name mismatches and missing logo assets; list missing-logo chains. (Rendering = Admin/Website.)
- [ ] **General cleanup** — Places-sourced staleness, unconfirmed carriers, muted repack chains
  (see `COVERAGE_REPORT.md`).
- [ ] **Append the new incoming store file** once the planning chat shapes it to
  `store-data-schema.md`. Dry-run → import → spot-check a few rows in the admin.
- [ ] **Wire `productDetails`** — DONE on `claude/check-data` / PR #373 (importer reads it → `product_details`
  column) but NOT on this deploy branch yet. Fold into consolidation (schema column + importer) or re-apply here.

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.

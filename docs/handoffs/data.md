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
**Session 2026-06-19 — data documented + scoring package committed (see COMPLETED.md).**
- [x] **Single-source-of-truth doc** — `docs/DATA_PROVENANCE.md` written: every store-data domain, who
  writes it, who reads it, verified that **no surface reads a rogue store list** (only the DB).
- [x] **Scoring package recovered + committed** — the owner's "four-file zip" is now at
  `data/source/chain-scoring-2026-06/` (rubric + 85 chain scores + logistics + 264 product rows), and
  the repo-native rubric is `docs/specs/scoring.md`. Tiers confirmed LIVE in prod (2/3/4/5 spread).
- [ ] **Restamp tiers from `chain_scores_final.csv`** if any chain drifted — map `chain_name_exact` →
  chain → set `retailers.tier` on its stores (importer `tier` field or bulk admin patch).
- [ ] **Close the ungraded tail** — stores still on `tier: null` rank by distance only.
- [ ] **Re-link orphan stores** — rows with `chainId: null` (e.g. "Burlington Jewelry District") lose
  logo + chain tier; re-link by exact chain name.

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

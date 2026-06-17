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
2. **`docs/specs/store-data-schema.md`** — the full store-data reference: every collector field →
   DB column, the hours format (incl. the 2 AM bug), dedupe rules, the behavior flags, and how to
   load a file. **Start here.** (This is also the doc handed to the planning chat for new data.)
3. `data/stores-master/README.md` + `COVERAGE_REPORT.md` · `docs/STOCK_AND_GEO_API.md` (store shapes)
4. The `retailers`/`chains` tables in `src/db/schema.ts` · `src/stores-import.ts`

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
- [ ] **Fix kiosk-only mis-flagging (the Pavilions case).** Supermarket kiosk-only stores were
  flagged `sellsPacks:true` and recommended as "most likely" for a shelf shipment. Correct them to
  `hasKiosk:true, sellsPacks:false` (Pavilions, and audit Albertsons/Vons/Safeway/Ralphs class).
  See `store-data-schema.md` §5 + §7.1 and `docs/specs/kiosk-call-flow.md`.
- [ ] **Fix open/close times (the "2 AM" bug).** Stores with missing/placeholder hours show as open
  around the clock (`openState` defaults unknown→open). Ensure real per-store `hours`, explicit
  closed days (`null`/`{closed:true}`), no fake `09:00–18:00` on 24-h or closed stores, and correct
  `state`→`timezone`. Detail + accepted hours shapes: `store-data-schema.md` §3.
- [ ] **Logos on the map.** A pin's logo = its chain name → `public/logos/chains/<slug>.png`. Audit
  for chain-name mismatches and missing logo assets; list missing-logo chains so an asset can be
  added. (Rendering itself is Admin/Website.) `store-data-schema.md` §7.3.
- [ ] **Store-name normalization.** Some rows still show placeholder/ugly names — "STORE STORE#",
  plaza names, or other junk instead of a clean label. Normalize `retailers.name` to a consistent
  "<Chain> — <City>" style and `location` to "City, ST". Sweep for the leftover patterns and fix in
  bulk via the importer/CMS.
- [ ] **General cleanup** — Places-sourced staleness, unconfirmed carriers, muted repack chains
  (see `COVERAGE_REPORT.md`).
- [ ] **Append the new incoming store file** once the planning chat shapes it to
  `store-data-schema.md`. Dry-run → import → spot-check a few rows in the admin.
- [ ] (future, needs DevOps) **Wire `productDetails`** (per-product confidence) — currently dropped
  by the importer. Propose the schema column. `store-data-schema.md` §6.

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.

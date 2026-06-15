# TiDB Migration Plan — libsql/SQLite → TiDB (MySQL)

Why: today everything is one SQLite file on a Railway **volume** (`DATABASE_URL=file:/data/local.db`),
which attaches to **one instance** — so the app can't run >1 copy. TiDB (networked MySQL, multi-writer)
unblocks horizontal scale + gives real indexes. Connection is already staged in Railway as
`TIDB_DATABASE_URL` (DB `voice_caller`, TLS); the live `DATABASE_URL` is untouched until cutover.

## Decision: Phase 1 = all-TiDB (simplest path to multi-instance)

I earlier pitched a polyglot split (stores on a local SQLite read-replica). Honest revision: a
libSQL **embedded read-replica needs a Turso primary** = another moving part, against your
"fewer parts" goal. So:
- **Phase 1 (now): move everything to TiDB.** One DB, truly multi-instance, fewest parts.
- **Phase 2 (optional, only if store reads get slow/expensive): add a local SQLite read-replica for
  the catalog** (retailers/chains/categories) via Turso. Revisit with real numbers, not pre-emptively.

This keeps the win (multi-instance + indexes) without adding Turso unless data proves we need it.

## ⚠️ CRITICAL: schema truth lives in TWO places (don't trust `drizzle-kit generate`)

The effective schema is **NOT** fully captured by `drizzle/0000–0004` + the meta snapshots. Most
tables/columns added since (accounts, leads, statuses, kiosks, kiosk_reports, watches,
customer_schedules, community_posts, waitlist, store_requests, kiosk_receipts, stock_signals,
discord_channels, plus many `ALTER TABLE … ADD COLUMN` and all the indexes) are applied
**idempotently in `src/db/bootstrap.ts`** as raw SQL — never added to the Drizzle migration set.

Consequence: `drizzle-kit generate` against the current schema emits a migration that tries to
**re-create existing tables** (confirmed 2026-06-14 — it would break boot). **Do not** rely on it.

**Port from the live DB, not the snapshots:** introspect the running SQLite
(`.schema` / `sqlite_master`) as the source of truth, translate THAT to MySQL, and going forward
**make Drizzle migrations the single mechanism** in TiDB (retire the bootstrap raw-SQL drift).

## Indexes — what already exists vs. what's missing

`bootstrap.ts` already creates: `retailers(lat,lng)` (geo — the hot path IS indexed),
`retailers(state)`, `retailers(zip)`, `stock_signals(retailer,seen_at)`, `stock_signals(chain,seen_at)`,
plus the Drizzle base indexes (`retailers(chainId)`, `call_results(retailer,category)`,
`call_results(providerCallId)`, `products(category)`, etc.).
Added 2026-06-14: `retailers(phone)`, `call_results(finder_user_id)`, `call_results(status)`.
At port time, reproduce ALL of these in the MySQL schema (consider `(active,lat,lng)` composite if
profiling shows the `active` filter matters).

## Driver swap (code)

- `src/db/client.ts`: `@libsql/client` + `drizzle-orm/libsql` → **`mysql2`** pool +
  `drizzle-orm/mysql2`. Read `TIDB_DATABASE_URL` (fallback to `DATABASE_URL` during transition).
  TiDB requires TLS — mysql2 `ssl: { minVersion: "TLSv1.2" }`.
- `src/db/schema.ts`: `drizzle-orm/sqlite-core` → **`drizzle-orm/mysql-core`**. Type mapping:

| SQLite (now) | MySQL/TiDB |
|---|---|
| `integer` PK autoincrement | `int ... .autoincrement()` (or `bigint` for high-volume: call_results, stock_signals) |
| `text` | `varchar(n)` for bounded fields, `text` for transcripts/notes |
| `real` | `double` |
| `integer({mode:"boolean"})` | `boolean` (tinyint) |
| `integer` unix time + `default (unixepoch())` | `int` + app-set `Date.now()/1000`, or `bigint`; keep epoch-seconds semantics |
| `text` JSON (hours, etc.) | `json` or keep `text` (drizzle `text`) — keep `text` to avoid churn |

- `drizzle.config.ts`: dialect `mysql`, creds from `TIDB_DATABASE_URL`.
- `src/db/bootstrap.ts` + `migrate.ts`: switch to `drizzle-orm/mysql2/migrator`.

## Indexes (carry forward at port time)

See "Indexes — what already exists vs. what's missing" above. The geo path is already indexed
(my earlier "full-scans 100k rows" claim was based on the stale Drizzle snapshots — corrected).
Reproduce the full set in MySQL. Also add the `charged_at` column to `call_results` here (billing §3).

## Migration steps

1. **Define the MySQL schema** (port `schema.ts`) + generate migrations against TiDB
   (`drizzle-kit generate` with the mysql dialect) → `drizzle/` gets MySQL DDL.
2. **Apply** to the `voice_caller` DB (bootstrap/migrator) → empty tables + indexes.
3. **Backfill data** from the live SQLite file → TiDB:
   - Script `scripts/migrate-to-tidb.ts`: open the libsql file (read-only) + the mysql pool, copy
     table-by-table in batches (retailers ~100k, call_results, accounts, …). Idempotent upserts.
   - Run it pointed at a **snapshot** first (dry/verify counts), then for real during the cutover.
4. **Cutover (the only risky moment — do during the freeze, low traffic):**
   - Put the app in brief maintenance / accept a short read-only window.
   - Final backfill (catch rows written since the dry run).
   - Set `DATABASE_URL = ${TIDB_DATABASE_URL}` in Railway (or have the client prefer TIDB var) → redeploy.
   - Verify `/api/health`, `/pub/store-types` counts match, place a test check.
5. **Now safe to scale**: bump Railway replicas >1 (after the §7 scheduler locks land).

## Rollback

- Keep the SQLite volume file intact + a DB snapshot. If TiDB misbehaves, revert `DATABASE_URL`
  back to `file:/data/local.db` and redeploy — instant rollback (volume still has the data).
- Don't delete the volume until TiDB has run clean for a few days.

## Gotchas

- **Boolean reads:** SQLite stored 0/1; mysql2 returns 0/1 or true/false depending on config — keep
  drizzle `boolean` so the app sees real booleans; audit the `=== true` checks in `ingest`/finds.
- **`unixepoch()` defaults:** MySQL has no `unixepoch()`. Set timestamps in app code (`Date.now()/1000`)
  or use a `bigint` default expression. The code mostly sets `Math.floor(Date.now()/1000)` already.
- **Autoincrement IDs:** preserve existing IDs during backfill (explicit inserts) so `call_results`
  ↔ `retailers` references and `providerCallId` links stay valid.
- **Connection limits:** TiDB Serverless has a connection cap — use a small mysql2 pool
  (`connectionLimit: 5-10`) and one pool per instance.
- **Cost:** TiDB Serverless bills by Request Units + storage; the analytics-to-SQL work (§ specs)
  matters more here — avoid full-table scans that the old in-memory code did.

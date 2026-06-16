// On boot: apply migrations and seed the catalog if the DB is empty.
// Lets the deployed instance self-initialize (Railway/Cloudflare) with no manual steps.
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, client } from "./client";
import { categories } from "./schema";
import { seed } from "./seed";
import { backfillChainTypes } from "./import-data";
import { getSetting, setSetting } from "./settings";
import { seedStockCheckIntel } from "../stock/intel";

// Seed any MISSING status rows (never overwrites owner edits — insert-if-absent only).
async function seedStatuses() {
  const rows: Array<[string, string, string, string, string, string]> = [
    // key, emoji, label, tone, color, note
    ["in_stock", "✅", "In stock!", "in", "#4ADE80", "They have it — go get it."],
    ["sold_out", "🕐", "Sold out", "out", "#EF4444", "They got some in, but it's already gone — sold out for now."],
    ["does_not_sell", "🚫", "They don't carry it", "out", "#EF4444", "This store doesn't sell it at all — try a different store."],
    ["not_in_stock", "❌", "Not in stock", "out", "#EF4444", "They told us they don't have it right now."],
    ["no_clear_answer", "🤔", "Got a “maybe”", "unk", "#FBBF24", "A human answered but wouldn't commit. Their exact words are below — you make the call."],
    ["nobody_answered", "📵", "Nobody answered", "unk", "#9CA3AF", "No one picked up — no charge. Try again in a bit."],
    ["voicemail", "📮", "Got their voicemail", "unk", "#9CA3AF", "We reached a recording, not a person — no charge."],
    ["busy", "📞", "Line was busy", "unk", "#9CA3AF", "Their line was busy — no charge. Try again shortly."],
    ["ivr_stuck", "🔢", "Couldn't reach a person", "unk", "#9CA3AF", "We got stuck in their phone menu — no charge."],
    ["language_barrier", "🗣️", "Language barrier", "unk", "#9CA3AF", "We reached someone but couldn't communicate — no charge."],
    ["bad_number", "☎️", "Bad number", "unk", "#9CA3AF", "That number didn't connect — no charge."],
    ["closed", "🔒", "Store closed", "unk", "#9CA3AF", "They're closed right now — no charge. Try again when they're open."],
    ["failed", "⚠️", "Call failed", "unk", "#FBBF24", "Something went wrong on our end — no charge."],
  ];
  let sort = 0;
  for (const [key, emoji, label, tone, color, note] of rows) {
    sort += 10;
    await client.execute({
      sql: "INSERT INTO statuses (key, emoji, label, tone, color, note, sort) VALUES (?,?,?,?,?,?,?) ON CONFLICT(key) DO NOTHING",
      args: [key, emoji, label, tone, color, note, sort],
    });
  }
}

export async function bootstrap() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Accounts table (Runnr customers) — created idempotently, outside the migration set.
  await client.execute(`CREATE TABLE IF NOT EXISTS accounts (
    clerk_user_id TEXT PRIMARY KEY,
    email TEXT,
    credits INTEGER NOT NULL DEFAULT 0,
    subscription TEXT NOT NULL DEFAULT 'none',
    stripe_customer_id TEXT,
    sub_renews_at INTEGER,
    total_spent_cents INTEGER NOT NULL DEFAULT 0,
    calls_made INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  // Email leads (public Runnr gate: one free call requires an email) — created idempotently.
  await client.execute(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    source TEXT,
    free_call_used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  // Chains: deterministic keypad shortcut column (added post-migration; SQLite has no IF NOT EXISTS for columns).
  await client.execute("ALTER TABLE chains ADD COLUMN dtmf_shortcut TEXT").catch(() => {});
  // Chains: answer-path classification + per-chain consumer mute.
  await client.execute("ALTER TABLE chains ADD COLUMN answer_path TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN avg_tree_seconds INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN repack_only INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN muted INTEGER NOT NULL DEFAULT 0").catch(() => {});
  // Retailers: weekly hours JSON + region grouping + soft-remove (added post-migration).
  await client.execute("ALTER TABLE retailers ADD COLUMN hours TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN state TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN region TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN active INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN sells_packs INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN has_kiosk INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN hours_updated_at INTEGER").catch(() => {});
  // Stock-check rail: chain classification (site vs call) + per-store site-check keys.
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_method TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_confidence TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_note TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN site_stock_url TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN external_store_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN maps_uri TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN geocode_tried_at INTEGER").catch(() => {});
  // Geo paging at 100k-store scale: the /pub/stores/near bounding box must hit an index.
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_geo_idx ON retailers(lat, lng)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_state_idx ON retailers(state)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_zip_idx ON retailers(zip)").catch(() => {}); // master ZIP geocode
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_phone_idx ON retailers(phone)").catch(() => {}); // dedupe-by-phone on import + deactivate-by-phone
  // Finds privacy/headstart: who placed a call + whether it stays out of the public finds feed.
  await client.execute("ALTER TABLE call_results ADD COLUMN finder_user_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE call_results ADD COLUMN is_private INTEGER DEFAULT 0").catch(() => {});
  // Per-user history (/app/history, finds attribution) + status filters used across the dashboards.
  await client.execute("CREATE INDEX IF NOT EXISTS call_results_finder_idx ON call_results(finder_user_id)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS call_results_status_idx ON call_results(status)").catch(() => {});
  // Referral growth loop: each account's shareable code + who referred them.
  await client.execute("ALTER TABLE accounts ADD COLUMN referral_code TEXT").catch(() => {});
  await client.execute("ALTER TABLE accounts ADD COLUMN referred_by TEXT").catch(() => {});
  // Phone-first identity: verified cell + the caller ID we dial as (set once Twilio verifies it).
  await client.execute("ALTER TABLE accounts ADD COLUMN phone TEXT").catch(() => {});
  await client.execute("ALTER TABLE accounts ADD COLUMN caller_id TEXT").catch(() => {});
  // Statuses registry — the single source of truth for customer-facing call verdicts.
  await client.execute(`CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '•',
    label TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'unk',
    color TEXT NOT NULL DEFAULT '#9CA3AF',
    note TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  )`);
  await seedStatuses();
  // One-time rename: "No clear answer" → "Got a “maybe”" (transparent verdicts — only touches
  // the row if it still carries the old default label, so later owner edits are never clobbered).
  await client.execute({
    sql: "UPDATE statuses SET label=?, note=? WHERE key='no_clear_answer' AND label='No clear answer'",
    args: ["Got a “maybe”", "A human answered but wouldn't commit. Their exact words are below — you make the call."],
  }).catch(() => {});
  // Kiosks (crowd refresh intel) + restock watches — created idempotently.
  await client.execute(`CREATE TABLE IF NOT EXISTS kiosks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, retailer_id INTEGER, label TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Pokémon', lat REAL, lng REAL, state TEXT, region TEXT,
    refresh_summary TEXT, reports INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS kiosk_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kiosk_id INTEGER NOT NULL, minutes TEXT, interval_min INTEGER,
    note TEXT, contact TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contact TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'email',
    retailer_id INTEGER NOT NULL, category_id INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), notified_at INTEGER)`);
  await client.execute(`CREATE TABLE IF NOT EXISTS customer_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT, finder_user_id TEXT NOT NULL, retailer_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL, specific_product TEXT, days_of_week TEXT, time_local TEXT NOT NULL DEFAULT '10:00',
    contact TEXT, active INTEGER NOT NULL DEFAULT 1, last_run_day TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS community_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, finder_user_id TEXT, handle TEXT, retailer_id INTEGER, category_id INTEGER,
    caption TEXT, image_url TEXT NOT NULL, image_key TEXT, approved INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contact TEXT NOT NULL, lat REAL, lng REAL, area TEXT, region TEXT,
    notified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS store_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contact TEXT, store_name TEXT NOT NULL, chain TEXT, address TEXT,
    city TEXT, state TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute(`CREATE TABLE IF NOT EXISTS kiosk_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE, machine_id TEXT, product TEXT,
    total TEXT, order_id TEXT, txn_at TEXT, claimed_by TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // Stock signals (site checkers + Discord cook-group pings + receipts) and the channel registry.
  await client.execute(`CREATE TABLE IF NOT EXISTS stock_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, retailer_id INTEGER, chain_id INTEGER, category_id INTEGER,
    product TEXT, status TEXT NOT NULL, source TEXT NOT NULL, source_detail TEXT, url TEXT, note TEXT,
    seen_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute("CREATE INDEX IF NOT EXISTS stock_signals_retailer_idx ON stock_signals(retailer_id, seen_at)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS stock_signals_chain_idx ON stock_signals(chain_id, seen_at)").catch(() => {});
  await client.execute(`CREATE TABLE IF NOT EXISTS discord_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL UNIQUE, label TEXT, chain TEXT,
    category TEXT NOT NULL DEFAULT 'Pokémon', note TEXT, active INTEGER NOT NULL DEFAULT 1,
    last_ingest_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // One-time: stock the anonymous free-check pool for launch (each visitor gets 1 free check).
  if (!(await getSetting("pub_credits_initialized"))) {
    await setSetting("pub_credits", "250");
    await setSetting("pub_credits_initialized", "1");
  }
  const existing = await db.select().from(categories);
  if (existing.length === 0) {
    await seed();
    console.log("Catalog seeded.");
  }
  await backfillChainTypes(); // ensure every chain has a store-category for filtering
  await seedStockCheckIntel(); // classify chains site-rail vs call-rail (insert-if-absent)
}

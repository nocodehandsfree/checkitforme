// On boot: apply migrations and seed the catalog if the DB is empty.
// Lets the deployed instance self-initialize (Railway/Cloudflare) with no manual steps.
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { db, client } from "./client";
import { categories, chains, retailers } from "./schema";
import { seed, seedCatalogSupplement } from "./seed";
import { backfillChainTypes, backfillDirectChains } from "./import-data";
import { getSetting, setSetting } from "./settings";
import { seedStockCheckIntel } from "../stock/intel";
import { seedSellMethods } from "../stock/sellmethods";

// Seed any MISSING status rows (never overwrites owner edits — insert-if-absent only).
async function seedStatuses() {
  const rows: Array<[string, string, string, string, string, string]> = [
    // key, emoji, label, tone, color, note
    ["in_stock", "✅", "In stock!", "in", "#4ADE80", "{store} has {product} in. Go grab it."],
    ["sold_out", "🕐", "Sold out", "out", "#EF4444", "{store} had it, but it's gone for now."],
    ["does_not_sell", "🚫", "They don't carry it", "out", "#EF4444", "{store} doesn't sell {category}."],
    ["not_in_stock", "❌", "Not in stock", "out", "#EF4444", "{store} doesn't have {category} right now."],
    ["no_clear_answer", "🤔", "Couldn't tell", "unk", "#FBBF24", "We couldn't make out a clear answer."],
    ["left_on_hold", "⏸️", "Left on hold", "unk", "#FBBF24", "Hold ran long and the call dropped. No charge."],
    ["too_busy", "🕗", "Too busy to check", "unk", "#FBBF24", "{store} was slammed. No charge."],
    ["language_barrier", "🗣️", "Couldn't understand each other", "unk", "#FBBF24", "We couldn't communicate. No charge."],
    ["nobody_answered", "📵", "Nobody answered", "unk", "#9CA3AF", "No one picked up. No charge."],
    ["voicemail", "📮", "Got their voicemail", "unk", "#9CA3AF", "Reached a recording, not a person. No charge."],
    ["busy", "📞", "Line was busy", "unk", "#9CA3AF", "Their line was busy. No charge."],
    ["bad_number", "☎️", "Wrong number", "unk", "#9CA3AF", "That number didn't connect. No charge."],
    ["closed", "🔒", "Store's closed", "unk", "#9CA3AF", "{store} is closed right now. No charge."],
    // "failed" stays only until carrier failures are mapped to real reasons (voicemail/busy/bad_number/
    // nobody_answered); then it's removed so every call shows a real reason, never a bare "Call failed".
    ["failed", "⚠️", "Call failed", "unk", "#FBBF24", "Something went wrong on our end. No charge."],
    // Admin ended the call from the dashboard. A NON-RESULT — excluded from every report/aggregate +
    // never billed; reads as "no data" (like a canceled call). Written by the master Stop & hang-up.
    ["admin_hangup", "·", "Admin canceled", "unk", "#9CA3AF", "We ended this call from the dashboard — it doesn't count as a check. No charge."],
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

// Seed the owner-named unmappable reasons (DD chain-cleanup 2026-07-11, audit item 4). FILL-ONLY: sets
// the reason only where blank, so a later curated edit in admin is never clobbered on boot. Match by
// exact chain name. Add more here as they're identified, or set per-chain via PATCH /api/chains/:id.
async function seedUnmappableReasons() {
  const reasons: Record<string, string> = {
    "Amazon": "online-only", "Best Buy": "online-only", "Micro Center": "online-only",
    "Aldi": "no store line",
  };
  for (const [name, reason] of Object.entries(reasons)) {
    await client.execute({
      sql: "UPDATE chains SET unmappable_reason=? WHERE name=? AND (unmappable_reason IS NULL OR unmappable_reason='')",
      args: [reason, name],
    }).catch(() => {});
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
  await client.execute("ALTER TABLE zones ADD COLUMN owner_user_id TEXT").catch(() => {});
  // Email confirmation: alert emails only send once the address is confirmed (confirm-email flow).
  await client.execute("ALTER TABLE accounts ADD COLUMN email_verified_at INTEGER").catch(() => {});
  // Auto-check results alert: link a fired call back to the customer schedule that placed it.
  await client.execute("ALTER TABLE call_results ADD COLUMN customer_schedule_id INTEGER").catch(() => {});
  // Per-account language for alert copy: "es" sends Spanish, else English.
  await client.execute("ALTER TABLE accounts ADD COLUMN language TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN published INTEGER NOT NULL DEFAULT 1").catch(() => {});
  // Store-request reward loop: attribute the submitter + guard the one-time go-live free-check grant.
  await client.execute("ALTER TABLE store_requests ADD COLUMN user_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE store_requests ADD COLUMN rewarded_at INTEGER").catch(() => {});
  await client.execute("ALTER TABLE call_results ADD COLUMN zone_run_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN dtmf_shortcut TEXT").catch(() => {});
  // Chains: answer-path classification + per-chain consumer mute.
  await client.execute("ALTER TABLE chains ADD COLUMN answer_path TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN avg_tree_seconds INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN repack_only INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN muted INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN tree_status TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN tree_learned_at INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN tree_verified_at INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN rings_direct INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN tree_note TEXT").catch(() => {});
  // WHY a chain can't be mapped/called, stored not inferred (audit item 4, DD 2026-07-11).
  await client.execute("ALTER TABLE chains ADD COLUMN unmappable_reason TEXT").catch(() => {});
  // Retailers: weekly hours JSON + region grouping + soft-remove (added post-migration).
  await client.execute("ALTER TABLE retailers ADD COLUMN hours TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN state TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN region TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN active INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN sells_packs INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN has_kiosk INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN online INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN hours_updated_at INTEGER").catch(() => {});
  // Stock-check rail: chain classification (site vs call) + per-store site-check keys.
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_method TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_confidence TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN stock_check_note TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN site_stock_url TEXT").catch(() => {});
  // Sell-methods taxonomy (per-chain): "ways to get it" CSV + MSRP/first-party flag.
  await client.execute("ALTER TABLE chains ADD COLUMN sell_methods TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN is_msrp INTEGER NOT NULL DEFAULT 1").catch(() => {});
  // Tree Trainer v2: the documented recipe to reach a human fast.
  await client.execute("ALTER TABLE chains ADD COLUMN nav_type TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_recipe TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_seconds INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_status TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_confidence INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_log TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN nav_updated_at INTEGER").catch(() => {});
  // Per-store call settings (Settings page): talk cap + voicemail/closed auto-hangup.
  await client.execute("ALTER TABLE chains ADD COLUMN max_talk_seconds INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN hangup_on_voicemail INTEGER").catch(() => {});
  // Logo linkage: chain logo lives in shared R2, referenced by logo_url so it travels across environments.
  await client.execute("ALTER TABLE chains ADD COLUMN logo_url TEXT").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN logo_wide INTEGER").catch(() => {});
  await client.execute("ALTER TABLE chains ADD COLUMN logo_dark INTEGER").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN external_store_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN maps_uri TEXT").catch(() => {});
  await client.execute("ALTER TABLE retailers ADD COLUMN geocode_tried_at INTEGER").catch(() => {});
  // Curation tier (1–5) for the consumer "best near you" grouping (5 = green group, 4 = secondary).
  await client.execute("ALTER TABLE retailers ADD COLUMN tier INTEGER").catch(() => {});
  // Owner-only demo store ("Fun"): hidden from consumers + un-callable except for the master account.
  await client.execute("ALTER TABLE retailers ADD COLUMN owner_only INTEGER NOT NULL DEFAULT 0").catch(() => {});
  // Geo paging at 100k-store scale: the /pub/stores/near bounding box must hit an index.
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_geo_idx ON retailers(lat, lng)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_state_idx ON retailers(state)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_zip_idx ON retailers(zip)").catch(() => {}); // master ZIP geocode
  await client.execute("CREATE INDEX IF NOT EXISTS retailers_phone_idx ON retailers(phone)").catch(() => {}); // dedupe-by-phone on import + deactivate-by-phone
  // Finds privacy/headstart: who placed a call + whether it stays out of the public finds feed.
  await client.execute("ALTER TABLE call_results ADD COLUMN finder_user_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE call_results ADD COLUMN is_private INTEGER DEFAULT 0").catch(() => {});
  // Server-side billing: when the finder was charged for this call (atomic idempotency guard).
  await client.execute("ALTER TABLE call_results ADD COLUMN charged_at INTEGER").catch(() => {});
  // Per-user history (/app/history, finds attribution) + status filters used across the dashboards.
  await client.execute("CREATE INDEX IF NOT EXISTS call_results_finder_idx ON call_results(finder_user_id)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS call_results_status_idx ON call_results(status)").catch(() => {});
  // Timing breakdown for the cost/ROI model: total connected seconds + time-to-human (nav).
  await client.execute("ALTER TABLE call_results ADD COLUMN call_seconds INTEGER").catch(() => {});
  await client.execute("ALTER TABLE call_results ADD COLUMN nav_seconds INTEGER").catch(() => {});
  // Persisted customer-facing verdict key → the calls history renders the exact registry icon/label
  // the live verdict used (instead of a coarse re-derive from confirmed/status).
  await client.execute("ALTER TABLE call_results ADD COLUMN status_key TEXT").catch(() => {});
  // Premium follow-up: the product form/set the clerk named ("3-pack blister", "Surging Sparks ETB").
  await client.execute("ALTER TABLE call_results ADD COLUMN product_detail TEXT").catch(() => {});
  // Referral growth loop: each account's shareable code + who referred them.
  await client.execute("ALTER TABLE accounts ADD COLUMN referral_code TEXT").catch(() => {});
  await client.execute("ALTER TABLE accounts ADD COLUMN referred_by TEXT").catch(() => {});
  // Phone-first identity: verified cell + the caller ID we dial as (set once Twilio verifies it).
  await client.execute("ALTER TABLE accounts ADD COLUMN phone TEXT").catch(() => {});
  await client.execute("ALTER TABLE accounts ADD COLUMN caller_id TEXT").catch(() => {});
  // Plans: subscription monthly quota (resets each cycle, no rollover) + which tier is active.
  await client.execute("ALTER TABLE accounts ADD COLUMN quota_credits INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await client.execute("ALTER TABLE accounts ADD COLUMN sub_tier TEXT").catch(() => {});
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
  // One-time copy fix (owner 07-10): sold-out note becomes two short sentences so the verdict sub
  // breaks cleanly per sentence — only touches the row if it still carries the old default.
  await client.execute({
    sql: "UPDATE statuses SET note=? WHERE key='sold_out' AND note=?",
    args: ["{store} had it. It's gone for now.", "{store} had it, but it's gone for now."],
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
    city TEXT, state TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'new', user_id TEXT, rewarded_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // Customer alerts: standing opt-ins + the send log (tracking + per-plan SMS metering).
  await client.execute(`CREATE TABLE IF NOT EXISTS alert_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'restock',
    retailer_id INTEGER, category_id INTEGER, product_label TEXT, channel TEXT NOT NULL DEFAULT 'sms',
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute("CREATE INDEX IF NOT EXISTS alert_subs_user_idx ON alert_subscriptions(user_id, active)").catch(() => {});
  await client.execute(`CREATE TABLE IF NOT EXISTS alert_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, event TEXT NOT NULL, channel TEXT NOT NULL,
    to_addr TEXT, status TEXT NOT NULL, detail TEXT, month_key TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute("CREATE INDEX IF NOT EXISTS alert_sends_meter_idx ON alert_sends(user_id, channel, month_key)").catch(() => {});
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
  // Human feedback on a call's verdict (esp. "no clear answer" ones) — labels we use to measure where the
  // consensus is wrong and tune the second-read prompt/rules. Joins to call_results by cid.
  await client.execute(`CREATE TABLE IF NOT EXISTS call_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL, user_verdict TEXT NOT NULL,
    shown_status TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // reviewed = admin has triaged this poll response (0/1). Post-launch add; ALTER guarded (idempotent).
  try { await client.execute(`ALTER TABLE call_feedback ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0`); } catch { /* column already exists */ }
  await client.execute(`CREATE TABLE IF NOT EXISTS discord_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL UNIQUE, label TEXT, chain TEXT,
    category TEXT NOT NULL DEFAULT 'Pokémon', note TEXT, active INTEGER NOT NULL DEFAULT 1,
    last_ingest_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // Support agent: conversations (ladder state + review queue), messages, escalation tickets.
  await client.execute(`CREATE TABLE IF NOT EXISTS support_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL UNIQUE, lang TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'open', review_status TEXT, max_tier INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute("CREATE INDEX IF NOT EXISTS support_convo_review_idx ON support_conversations(review_status, updated_at)").catch(() => {});
  await client.execute(`CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, role TEXT NOT NULL,
    content TEXT NOT NULL, tier INTEGER, model TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  await client.execute("CREATE INDEX IF NOT EXISTS support_msg_convo_idx ON support_messages(conversation_id)").catch(() => {});
  await client.execute(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, name TEXT NOT NULL, email TEXT NOT NULL,
    message TEXT NOT NULL, emailed_ok INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
  // v3 Messenger: categories, account linkage, titles on conversations; category/screenshot/debug on tickets.
  await client.execute("ALTER TABLE support_conversations ADD COLUMN category TEXT NOT NULL DEFAULT 'other'").catch(() => {});
  await client.execute("ALTER TABLE support_conversations ADD COLUMN account_id TEXT").catch(() => {});
  await client.execute("ALTER TABLE support_conversations ADD COLUMN account_phone TEXT").catch(() => {});
  await client.execute("ALTER TABLE support_conversations ADD COLUMN title TEXT").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS support_convo_cat_idx ON support_conversations(category, updated_at)").catch(() => {});
  await client.execute("CREATE INDEX IF NOT EXISTS support_convo_acct_idx ON support_conversations(account_id, updated_at)").catch(() => {});
  await client.execute("ALTER TABLE support_tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'other'").catch(() => {});
  await client.execute("ALTER TABLE support_tickets ADD COLUMN screenshot_url TEXT").catch(() => {});
  await client.execute("ALTER TABLE support_tickets ADD COLUMN debug TEXT").catch(() => {});
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
  // Pokémon core-SKU overlay (booster packs/bundles/blisters per set) — insert-if-absent on EVERY boot so
  // new/edited catalog rows flow through on deploy (the full seed above only runs on an empty DB).
  const supp = await seedCatalogSupplement();
  if (supp) console.log(`Catalog supplement: +${supp} products.`);
  await backfillChainTypes(); // ensure every chain has a store-category for filtering
  await backfillDirectChains(); // independents + co-ops (Ace) default to DIRECT — no chain-level tree can mute the agent
  await seedUnmappableReasons(); // seed the owner-named unmappable reasons (only where blank — never clobbers a curated edit)
  await seedStockCheckIntel(); // classify chains site-rail vs call-rail (insert-if-absent)
  await seedSellMethods();      // per-chain ways-to-get-it + MSRP flag (insert-if-absent)
  await seedFunStore();         // owner-only "Fun" rehearsal store (only if FUN_STORE_PHONE is set)
  await seedMvpsStore();        // owner-only "MVPs" pitch-demo store (phone set per-demo from Admin)
}

// Owner-only demo store "Fun": dials the owner's own cell (FUN_STORE_PHONE) so the owner can play the
// clerk and rehearse the whole consumer flow + verdict pipeline without calling real stores. Hidden
// from every consumer and un-callable except for the master account. Created only when FUN_STORE_PHONE
// is set (keeps the personal number out of the repo). Idempotent — safe to run on every boot.
async function seedFunStore() {
  const phone = (process.env.FUN_STORE_PHONE || "").trim();
  if (!phone) return;
  // A "Fungibles" chain purely so the store renders the Fun brand mark (logos/chains/fun.png; the
  // chain row's logo_url points at it — the old Runnr-era fungibles.png name is being retired).
  let chain = (await db.select().from(chains).where(eq(chains.name, "Fungibles")))[0];
  if (!chain) {
    await db.insert(chains).values({ name: "Fungibles", type: "Fungibles" });
    chain = (await db.select().from(chains).where(eq(chains.name, "Fungibles")))[0];
  }
  const hours = JSON.stringify({ mon: "24h", tue: "24h", wed: "24h", thu: "24h", fri: "24h", sat: "24h", sun: "24h" });
  // Fun carries EVERY product so the owner can rehearse the flow for any vertical (not just Pokémon).
  const cats = await db.select({ label: categories.label }).from(categories);
  const carries = cats.map((c) => c.label).filter(Boolean).join(",") || "Pokémon";
  const existing = (await db.select().from(retailers).where(and(eq(retailers.name, "Fun"), eq(retailers.ownerOnly, true))))[0];
  if (existing) {
    await db.update(retailers)
      .set({ chainId: chain?.id ?? null, phone, tier: 5, ownerOnly: true, active: true, lat: 34.1367, lng: -118.6618, hours, carries })
      .where(eq(retailers.id, existing.id));
  } else {
    await db.insert(retailers).values({
      chainId: chain?.id ?? null, name: "Fun", location: "Calabasas, CA", address: "123 Fun Lane",
      zip: "91302", lat: 34.1367, lng: -118.6618, phone, timezone: "America/Los_Angeles",
      state: "CA", region: "West Coast", tier: 5, ownerOnly: true, active: true, sellsPacks: true,
      carries, hours,
    });
  }
}

// Owner-only demo store "MVPs": same rig as the Fun store, but the demo phone is set per-pitch from the
// Admin (not an env var). The phone number IS the on/off switch — saving a number makes it appear, clearing
// it hides it entirely (derived server-side in PATCH /api/retailers/:id). Geo-pinned to the same spot as Fun
// so it surfaces wherever the owner searches from, and hidden from every consumer + every report (ownerOnly,
// like Fun). Create-only: re-asserts the fixed invariants on each boot but NEVER the owner's phone/active.
async function seedMvpsStore() {
  // A "MVPs" chain purely so the store renders the MVPs brand mark (public/logos/chains/mvps.png).
  let chain = (await db.select().from(chains).where(eq(chains.name, "MVPs")))[0];
  if (!chain) {
    await db.insert(chains).values({ name: "MVPs", type: "MVPs" });
    chain = (await db.select().from(chains).where(eq(chains.name, "MVPs")))[0];
  }
  const hours = JSON.stringify({ mon: "24h", tue: "24h", wed: "24h", thu: "24h", fri: "24h", sat: "24h", sun: "24h" });
  const existing = (await db.select().from(retailers).where(and(eq(retailers.name, "MVPs"), eq(retailers.ownerOnly, true))))[0];
  if (existing) {
    // Re-assert only invariants that must never drift — NOT phone/active (owner sets those per demo).
    await db.update(retailers)
      .set({ chainId: chain?.id ?? null, tier: 5, ownerOnly: true, sellsPacks: true, lat: 34.1367, lng: -118.6618, hours })
      .where(eq(retailers.id, existing.id));
  } else {
    await db.insert(retailers).values({
      chainId: chain?.id ?? null, name: "MVPs", location: "Calabasas, CA", address: "1 MVP Way",
      zip: "91302", lat: 34.1367, lng: -118.6618, phone: "", timezone: "America/Los_Angeles",
      state: "CA", region: "West Coast", tier: 5, ownerOnly: true, active: false, sellsPacks: true,
      carries: "Pokémon", hours,
    });
  }
}

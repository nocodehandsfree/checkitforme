// Voice Caller — data model
// Drizzle + SQLite locally, Cloudflare D1 in production (same dialect both places).
//
// The "is this retailer green?" question is answered by the most recent
// call_results row for a (retailer, product) pair where confirmed = 1.

import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/** Product categories — Pokémon, One Piece, Topps Chrome, NBA Hoops, etc. Seeded from the owner's category JSON. */
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // e.g. "pokemon", "topps_chrome_nba"
  label: text("label").notNull(),      // e.g. "Pokémon", "Topps Chrome NBA"
  sort: integer("sort").notNull().default(0),
});

/**
 * A retail brand. Two roles (can be both):
 *  - call target: a chain we phone (Barnes & Noble, CVS, Target…) — each has a default phone tree
 *  - catalog source: a chain the product catalog lists as carrying an item (Target, Walmart, Sam's, Amazon)
 */
export const chains = sqliteTable("chains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // e.g. "Barnes & Noble", "Target"
  // Store category for filtering: "Big Box", "Pharmacy", "Off-Price", "Craft", etc.
  type: text("type"),
  // Default IVR/transfer navigation for this chain, in plain English (per-store can override).
  phoneTreeDefault: text("phone_tree_default"),
  // Deterministic keypad shortcut, e.g. "0@3" = the BRIDGE sends the DTMF tone for 0 three
  // seconds after connect (chainable: "1@3,0@9"). Used where pressing a key during the recorded
  // greeting skips straight to a human — the LLM never gets a turn during a recording, so this
  // is done in code, not by the agent.
  dtmfShortcut: text("dtmf_shortcut"),
  callTarget: integer("call_target", { mode: "boolean" }).notNull().default(true),
  // ---- Answer-path classification (drives cost control + per-chain UI muting) ----
  // How a call to this chain reaches a human: "direct_human" (someone just picks up),
  // "simple_ivr" (1-2 menu steps), "deep_ivr" (long/voice-driven tree, e.g. CVS).
  answerPath: text("answer_path"),
  // Average seconds burned in the phone tree before a human, learned from calls.
  avgTreeSeconds: integer("avg_tree_seconds"),
  // ---- Phone-tree discovery (the "learn the tree" bot) ----
  // Lifecycle of the documented tree: null/"unknown" → "learned" (mapped) → "verified" (re-confirmed) → "failed".
  treeStatus: text("tree_status"),
  treeLearnedAt: integer("tree_learned_at"),  // last successful discovery
  treeVerifiedAt: integer("tree_verified_at"),// last accuracy re-check that matched
  ringsDirect: integer("rings_direct", { mode: "boolean" }), // true = a human picks up with no menu
  treeNote: text("tree_note"),                // plain-English summary of how to reach a human
  // Chain only sells repackaged product (e.g. Fairfield) — checks are a waste of the customer's money.
  repackOnly: integer("repack_only", { mode: "boolean" }).notNull().default(false),
  // Owner kill-switch: muted chains are hidden from the consumer store list (no calls placed).
  muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  // ---- Stock-check rail: how we know what's on the shelf WITHOUT a call ----
  // "site" = the chain's website shows real per-store inventory (free, instant, at scale);
  // "call" = no reliable online stock, use the phone rail. null = unclassified → treated as call.
  stockCheckMethod: text("stock_check_method"),
  stockCheckConfidence: text("stock_check_confidence"), // confirmed | probable
  stockCheckNote: text("stock_check_note"),
  // Per-store inventory URL template for the site checker ({storeId}/{zip}/{query} placeholders).
  siteStockUrl: text("site_stock_url"),
  // ---- Sell-methods taxonomy (per-chain defaults; the store resolves through its chain) ----
  // "Ways to get it" — CSV of: in_store | pickup (BOPIS) | ship (delivered). null → in_store only.
  sellMethods: text("sell_methods"),
  // Price/source: true = sold by the retailer at/around MSRP (first-party); false = third-party
  // marketplace listing where price MAY exceed MSRP. Default true (most chains are first-party).
  isMSRP: integer("is_msrp", { mode: "boolean" }).notNull().default(true),
  // ---- Tree Trainer v2: the documented "recipe" to reach a human fast ----
  // navType: how this chain answers — "direct" (person picks up), "keypad" (press tones),
  // "voice" (must speak, e.g. CVS). navRecipe: JSON ordered steps [{action:"say"|"press"|"wait",
  // value, atSec}]. navSeconds: best time-to-human achieved. navStatus: unmapped|learning|review|
  // locked. navConfidence: 0-100 from the navigator. navLog: JSON attempt history (each call's secs).
  navType: text("nav_type"),
  navRecipe: text("nav_recipe"),
  navSeconds: integer("nav_seconds"),
  navStatus: text("nav_status"),
  navConfidence: integer("nav_confidence"),
  navLog: text("nav_log"),
  navUpdatedAt: integer("nav_updated_at"),
  // Logo linkage (docs/specs/logo-r2-keystone.md): the chain's logo lives in shared R2, referenced here
  // so it travels with the row to every environment and can't drift. logo_url =
  // https://logos.fungibles.com/chain-logos/<slug>.png; null = fall back to the filesystem resolver.
  logoUrl: text("logo_url"),
  logoWide: integer("logo_wide", { mode: "boolean" }),
  logoDark: integer("logo_dark", { mode: "boolean" }),
});

/** A specific catalog product. Seeded from drops_db.json; the agent asks at the category level, but this powers future product-specific asks and matching. */
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").unique(), // e.g. "p001" from the catalog
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),      // catalog `title`
    carriedByChainId: integer("carried_by_chain_id").references(() => chains.id, { onDelete: "set null" }),
    series: text("series"),
    type: text("type"),                // ETB, Booster Box, Tin, …
    sku: text("sku"),
    itemCode: text("item_code"),
    language: text("language"),
    msrp: real("msrp"),
    maxPrice: real("max_price"),
    note: text("note"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ byCategory: index("products_category_idx").on(t.categoryId) }),
);

/** A physical store location we call. Belongs to a chain; located for zip-radius zoning. */
export const retailers = sqliteTable(
  "retailers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chainId: integer("chain_id").references(() => chains.id, { onDelete: "set null" }),
    name: text("name").notNull(),       // e.g. "Barnes & Noble — Brentwood"
    location: text("location").notNull(), // human label, e.g. "Brentwood, TN"
    address: text("address"),           // full street address
    zip: text("zip"),
    lat: real("lat"),                   // for radius search
    lng: real("lng"),
    phone: text("phone").notNull(),     // E.164, e.g. "+16155551234"
    timezone: text("timezone").notNull().default("America/Chicago"), // store's local tz, for open-hours scheduling
    // "verified" = we know they carry (restock calls); "unverified" = suspected (carry/prospect calls).
    stockStatus: text("stock_status").notNull().default("unverified"),
    // CSV of category labels this store stocks, e.g. "Pokémon,One Piece TCG" — drives multi-category cascade.
    carries: text("carries"),
    // Free-text store-specific intel, injected into the agent prompt for this store.
    specialInstructions: text("special_instructions"),
    // Per-store override of the chain's phone tree. If null, the chain default is used.
    // e.g. "When asked if you're a healthcare provider, say no. Then ask for front store."
    phoneTree: text("phone_tree"),
    // Known/usual shipment day for this store, learned over time (e.g. "Tuesday").
    shipmentDay: text("shipment_day"),
    // Weekly opening hours as JSON: { mon:["09:00","21:00"] | "24h" | null, ... }. Looked up per
    // store; powers the open/closed badge and blocks calls to closed stores.
    hours: text("hours"),
    hoursUpdatedAt: integer("hours_updated_at"), // staleness tracking — drives auto re-verification
    state: text("state"),                // 2-letter state, for region grouping
    region: text("region"),              // quadrant: "West Coast" | "Southwest" | … (from state)
    // Two ways a store carries product: a staffed counter we can CALL (sells packs) and/or an
    // unmanned vending KIOSK. Many supermarkets are kiosk-only (don't sell packs). A store can be both.
    sellsPacks: integer("sells_packs", { mode: "boolean" }).notNull().default(true), // callable
    hasKiosk: integer("has_kiosk", { mode: "boolean" }).notNull().default(false),    // vending machine on site
    // Sells the product ONLINE — pickup, third-party listings, or online-only (e.g. Micro Center).
    // NOT "online only": some are both in-store and online. Default false; populated separately.
    online: integer("online", { mode: "boolean" }).notNull().default(false),
    // Curation tier (1–5) for the consumer "best near you" grouping: 5 = pinned to the green group at
    // top, 4 = secondary group, else ranked purely by distance. Per-store (a voice-confirmed store or an
    // official kiosk can override its chain default); null = ungraded. Integer only — decimal scoring dropped.
    tier: integer("tier"),
    // The chain's own store number (collector `store_id`) — keys per-store site stock checks
    // (e.g. Micro Center storeid, Best Buy store #). Required for site-rail chains.
    externalStoreId: text("external_store_id"),
    mapsUri: text("maps_uri"),                   // Google Maps deep link (Places-sourced rows)
    geocodeTriedAt: integer("geocode_tried_at"), // last geocode attempt — failures cool down instead of retrying every tick
    active: integer("active", { mode: "boolean" }).notNull().default(true), // soft-remove (e.g. Ralphs)
    notes: text("notes"),
    // Owner-only demo store: hidden from every consumer list and un-callable EXCEPT for the
    // master/comp account. Powers the "Fun" rehearsal store (dials the owner's cell as the clerk).
    ownerOnly: integer("owner_only", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({ byChain: index("retailers_chain_idx").on(t.chainId) }),
);

/** A named set of nearby stores (e.g. "SF Valley Zone") built from a zip-radius search. A schedule can target a whole zone. */
export const zones = sqliteTable("zones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),        // e.g. "SF Valley Zone"
  centerZip: text("center_zip"),       // zip the radius was built around
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  radiusMiles: real("radius_miles"),   // 1 | 2 | 5 | 10 | …
  createdAt: integer("created_at").notNull().default(now),
});

/** Membership of stores in a zone (many-to-many). */
export const zoneRetailers = sqliteTable(
  "zone_retailers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    zoneId: integer("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    retailerId: integer("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
  },
  (t) => ({ byZone: index("zone_retailers_zone_idx").on(t.zoneId) }),
);

/** A recurring call plan: ask about a category, on these days, at this time, to these retailers, in this voice. */
export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // The agent asks at the CATEGORY level ("Pokémon", "One Piece", "Topps Chrome").
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  // Optional: narrow to a specific product (reserved — MVP asks by category).
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  // "restock" = ask a known seller if a shipment arrived; "carry" = ask a suspected store if they sell it at all.
  mode: text("mode").notNull().default("restock"),
  // The line the agent opens with. {category} is interpolated.
  // e.g. "Hi, I was just checking to see if you got a {category} shipment in today?"
  questionTemplate: text("question_template").notNull(),
  // What "{category}" means if the clerk asks for detail — and what does NOT count.
  // e.g. "Sealed packs/tins/boxes from The Pokémon Company. Repackaged or off-brand does NOT count."
  clarification: text("clarification"),
  // Optionally have the agent also ask which day shipments usually arrive.
  askShipmentDay: integer("ask_shipment_day", { mode: "boolean" }).notNull().default(false),
  timeLocal: text("time_local").notNull(), // "HH:MM" in each retailer's local tz
  daysOfWeek: text("days_of_week").notNull(), // CSV of 0-6 (0=Sun), e.g. "4" for Thursday
  voiceId: text("voice_id").notNull(),     // ElevenLabs voice (library or cloned)
  // Caller ID shown to the store — a Twilio number or your verified own number.
  callerId: text("caller_id"),
  // Hard cap on call length; agent wraps up / hangs up past this. Default 3 min.
  maxCallSeconds: integer("max_call_seconds").notNull().default(180),
  // Optional: call every store in this zone. If null, use scheduleTargets below.
  zoneId: integer("zone_id").references(() => zones.id, { onDelete: "set null" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(now),
});

/** Which individual retailers a schedule calls (many-to-many). Used when the schedule has no zone. */
export const scheduleTargets = sqliteTable(
  "schedule_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    retailerId: integer("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
  },
  (t) => ({ bySchedule: index("schedule_targets_schedule_idx").on(t.scheduleId) }),
);

// Global app settings (key/value) — e.g. the voicemail master toggle.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** A Runnr customer account (keyed by Clerk user id). Holds credits + subscription state. */
export const accounts = sqliteTable("accounts", {
  clerkUserId: text("clerk_user_id").primaryKey(), // Clerk id, OR "phone:<E.164>" for phone-first users
  email: text("email"),
  phone: text("phone"),         // E.164 cell for phone-first (Clerk-free) identity
  callerId: text("caller_id"),  // verified caller-ID number for this account's outbound calls
  credits: integer("credits").notNull().default(0),
  subscription: text("subscription").notNull().default("none"), // "none" | "active"
  stripeCustomerId: text("stripe_customer_id"),
  subRenewsAt: integer("sub_renews_at"),
  totalSpentCents: integer("total_spent_cents").notNull().default(0), // lifetime revenue (for margin dashboard)
  callsMade: integer("calls_made").notNull().default(0),
  referralCode: text("referral_code"),   // this user's shareable code (generated on demand)
  referredBy: text("referred_by"),        // clerk id of whoever referred them (set once)
  createdAt: integer("created_at").notNull().default(now),
});

/**
 * The single source of truth for call outcomes a customer sees. The server maps each finished
 * call to a status `key`; Runnr and the admin verdict card both render the display from this row.
 * Editable in the admin so wording/emoji/color can change in one place, and new display rows added.
 */
export const statuses = sqliteTable("statuses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),       // e.g. "in_stock", "sold_out", "does_not_sell"
  emoji: text("emoji").notNull().default("•"),
  label: text("label").notNull(),            // e.g. "In stock", "Sold out"
  tone: text("tone").notNull().default("unk"), // in | out | unk — drives the verdict color block
  color: text("color").notNull().default("#9CA3AF"),
  note: text("note"),                        // the one-line explainer shown under the verdict
  sort: integer("sort").notNull().default(0),
});

/**
 * A self-serve vending KIOSK inside a retailer (e.g. a Pokémon card machine at an Albertsons). You
 * can't call a kiosk, but shoppers nearby know its RESTOCK/refresh cadence — crowd-sourced market
 * intel. Reports roll up into `refreshSummary`. Submitting intel earns the reporter a free check.
 */
export const kiosks = sqliteTable("kiosks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  retailerId: integer("retailer_id").references(() => retailers.id, { onDelete: "set null" }),
  label: text("label").notNull(),       // "Pokémon kiosk — Albertsons, Montecito"
  category: text("category").notNull().default("Pokémon"),
  lat: real("lat"), lng: real("lng"), state: text("state"), region: text("region"),
  refreshSummary: text("refresh_summary"), // human summary, e.g. ":03 & :33 — every 30 min, sometimes skips"
  reports: integer("reports").notNull().default(0),
  createdAt: integer("created_at").notNull().default(now),
});

/** One crowd report of a kiosk's refresh timing. */
export const kioskReports = sqliteTable("kiosk_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kioskId: integer("kiosk_id").notNull().references(() => kiosks.id, { onDelete: "cascade" }),
  minutes: text("minutes"),             // CSV of past-the-hour minutes seen, e.g. "3,33"
  intervalMin: integer("interval_min"), // refresh interval guess, e.g. 30
  note: text("note"),
  contact: text("contact"),             // optional email/phone of the reporter (for the free check)
  createdAt: integer("created_at").notNull().default(now),
});

/** A "tell me when it's back" subscription: notify this person when a store+category confirms in stock. */
export const watches = sqliteTable("watches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contact: text("contact").notNull(),   // email or phone
  channel: text("channel").notNull().default("email"), // email | sms
  retailerId: integer("retailer_id").notNull().references(() => retailers.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(now),
  notifiedAt: integer("notified_at"),
});

/**
 * A subscriber's standing "auto-check": call this store+category on shipment days and alert me when
 * it lands. Reuses the call engine (charges a credit per fire) and the watch alert path. Premium —
 * gated by policy.flags.scheduling + an active membership. daysOfWeek empty = use the store's known
 * shipment day. lastRunDay (YYYY-MM-DD, store-local) dedupes to one fire per day.
 */
export const customerSchedules = sqliteTable("customer_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  finderUserId: text("finder_user_id").notNull(),     // clerk id of the subscriber
  retailerId: integer("retailer_id").notNull().references(() => retailers.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  specificProduct: text("specific_product"),          // optional SKU-tightening ask
  daysOfWeek: text("days_of_week"),                   // CSV 0-6 (0=Sun); empty/null = store shipment day
  timeLocal: text("time_local").notNull().default("10:00"), // earliest fire time in store tz
  contact: text("contact"),                           // email/phone to alert when it lands
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastRunDay: text("last_run_day"),                   // store-local date of the last fire (dedupe)
  createdAt: integer("created_at").notNull().default(now),
});

/**
 * Community "I scored!" wall: a shopper who found product can post a photo + caption. Moderated
 * (approved defaults false) so nothing unvetted goes public. Storage-agnostic — imageUrl can be an
 * R2 public URL (preferred), CDN, or any link. Gated by policy.flags.community.
 */
export const communityPosts = sqliteTable("community_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  finderUserId: text("finder_user_id"),   // clerk id if signed in (else anonymous)
  handle: text("handle"),                  // display name / @handle shown on the card
  retailerId: integer("retailer_id").references(() => retailers.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  caption: text("caption"),                // "Pulled a Charizard at the Target on Sunset!"
  imageUrl: text("image_url").notNull(),   // public URL of the uploaded photo
  imageKey: text("image_key"),             // storage object key (for deletion)
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  likes: integer("likes").notNull().default(0),
  createdAt: integer("created_at").notNull().default(now),
});

/**
 * Launch waitlist: when a visitor's area has no stores yet, we capture them here instead of bouncing.
 * Doubles as demand-by-area intel that guides which region to roll out next.
 */
export const waitlist = sqliteTable("waitlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contact: text("contact").notNull(),   // email or phone
  lat: real("lat"), lng: real("lng"),
  area: text("area"),                   // user-typed city/zip, optional
  region: text("region"),              // derived if we can map it
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(now),
});

/** A kiosk purchase receipt emailed to our inbox — verified, ground-truth restock intel + a reward. */
export const kioskReceipts = sqliteTable("kiosk_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull().unique(), // email Message-ID (dedupe)
  machineId: text("machine_id"),
  product: text("product"),
  total: text("total"),
  orderId: text("order_id"),
  txnAt: text("txn_at"),                 // transaction time as printed on the receipt
  claimedBy: text("claimed_by"),         // device/user id that claimed the free-call reward (null = open)
  createdAt: integer("created_at").notNull().default(now), // when WE ingested it (drives the claim window)
});

/** "Don't see your store?" — a user-submitted request to add a specific store. */
export const storeRequests = sqliteTable("store_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contact: text("contact"),             // email/phone, optional (so we can tell them when it's live)
  storeName: text("store_name").notNull(),
  chain: text("chain"),
  address: text("address"), city: text("city"), state: text("state"),
  note: text("note"),
  status: text("status").notNull().default("new"), // new | added | rejected
  createdAt: integer("created_at").notNull().default(now),
});

/** Email leads captured from the public Runnr gate (one free call requires an email). */
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  source: text("source"),               // where they came from, e.g. "runner_free"
  freeCallUsed: integer("free_call_used", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(now),
});

// How the call went (the disposition). The yes/no answer lives in `confirmed`.
export type CallStatus =
  | "queued"
  | "dialing"
  | "in_progress"
  | "completed"      // reached a person and asked
  | "no_answer"      // rang out
  | "voicemail"      // hit an answering machine
  | "busy"           // line busy
  | "bad_number"     // disconnected / number changed
  | "ivr_stuck"      // couldn't get through the phone menu
  | "closed"         // store closed / voicemail recording — hung up, no charge
  | "failed";        // telephony/system error

/** One call attempt and its outcome. `confirmed` null = unclear/no answer. We store TEXT transcript + summary only — never audio. */
export const callResults = sqliteTable(
  "call_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scheduleId: integer("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    retailerId: integer("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
    // The category asked about (Pokémon, One Piece, …). Drives the green status.
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("restock"), // restock | carry
    status: text("status").notNull().$type<CallStatus>().default("queued"),
    // restock: true=shipment is in. carry: true=store sells it. null=unclear/no answer.
    confirmed: integer("confirmed", { mode: "boolean" }),
    // The customer-facing verdict key, resolved at call time (elevenlabs.ts) and rendered from the
    // statuses registry. Persisted so the calls history shows the exact same icon/label as the live
    // verdict — does_not_sell / sold_out / left_on_hold / voicemail … which `confirmed` alone loses.
    statusKey: text("status_key"),
    shipmentDayHeard: text("shipment_day_heard"), // if asked: the day the clerk gave
    summary: text("summary"),       // short human summary of what the clerk said
    transcript: text("transcript"), // text transcript (no audio is ever stored)
    providerCallId: text("provider_call_id"), // ElevenLabs conversation id
    finderUserId: text("finder_user_id"), // clerk id of whoever placed it (null = anon/free)
    isPrivate: integer("is_private", { mode: "boolean" }).default(false), // never show in public finds feed
    startedAt: integer("started_at").notNull().default(now),
    completedAt: integer("completed_at"),
    chargedAt: integer("charged_at"), // when the finder was billed for this call (idempotency guard)
    // Timing breakdown (from the provider): total connected length, and time-to-human (seconds spent
    // navigating the phone tree / on hold before a person first spoke). talk = call - nav.
    callSeconds: integer("call_seconds"),
    navSeconds: integer("nav_seconds"),
    // Premium follow-up capture: the product form / set the clerk named ("3-pack blister",
    // "Surging Sparks ETB") — kept even when the exact set is unknown. Surfaced on the verdict.
    productDetail: text("product_detail"),
  },
  (t) => ({
    byRetailerCategory: index("call_results_retailer_category_idx").on(t.retailerId, t.categoryId),
    byProvider: index("call_results_provider_idx").on(t.providerCallId),
  }),
);

/**
 * Real-time stock intel that did NOT come from a phone call: site checkers reading chains that
 * publish per-store inventory, Discord cook-group restock pings, kiosk receipts, manual entry.
 * The freshest signal per (retailer, product) is what the UI surfaces; calls stay the ground
 * truth for call-rail chains. Chain-wide drops (no specific store) set chainId, retailerId null.
 */
export const stockSignals = sqliteTable(
  "stock_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    retailerId: integer("retailer_id").references(() => retailers.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").references(() => chains.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    product: text("product"),             // free-text product/SKU, e.g. "Prismatic Evolutions ETB"
    status: text("status").notNull(),     // in_stock | out_of_stock | low | unknown
    source: text("source").notNull(),     // site | discord | call | receipt | manual
    sourceDetail: text("source_detail"),  // checker id or "<cook group>#<channel>"
    url: text("url"),                     // product/stock page or message deep link
    note: text("note"),
    seenAt: integer("seen_at").notNull(), // when the stock state was observed (not when we stored it)
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    byRetailer: index("stock_signals_retailer_idx").on(t.retailerId, t.seenAt),
    byChain: index("stock_signals_chain_idx").on(t.chainId, t.seenAt),
  }),
);

/**
 * Discord cook-group channels we monitor for restock pings. The listener (separate process or
 * tick) reads messages from these channels and posts parsed hits to /api/stock/ingest.
 */
export const discordChannels = sqliteTable("discord_channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull().unique(),
  label: text("label"),                 // "<cook group> — #target-restocks"
  chain: text("chain"),                 // chain name this channel covers (null = mixed; parser decides per message)
  category: text("category").notNull().default("Pokémon"),
  note: text("note"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastIngestAt: integer("last_ingest_at"),
  createdAt: integer("created_at").notNull().default(now),
});

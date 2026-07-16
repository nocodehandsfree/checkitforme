// Store-data sync — the "one store dataset" pipe (owner decision 2026-07-07).
// Staging is the curation home (Data Dev edits there, drafts visible on staging only). This module
// pushes CURATED store data staging → prod automatically, so the two environments can never drift
// (the muted-chains bug class). Three hard rules:
//   1. FIELD-SCOPED: only the curated columns below ever sync. Learned-on-prod data (nav recipes,
//      tree timings, hours, shipment days, phone trees) is NEVER written by sync.
//   2. PUBLISHED ONLY: retailers with published=false (drafts) are never sent — that's how a test
//      store stays staging-only until the owner publishes it.
//   3. DIFFS ONLY: a row is sent only when its curated fields changed on staging since the last sync
//      (tracked by per-row hash), so a prod-side admin edit isn't silently clobbered by a full push.
// Activation: set STORE_SYNC_URL (prod base url) + STORE_SYNC_TOKEN (prod ADMIN_TOKEN) on the STAGING
// service. Without them (or outside staging) the sender is inert. The receive endpoint lives under
// /api/* on the target, so it's admin-token gated like every operator route.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { chains, retailers } from "./db/schema";
import { getSetting, setSetting } from "./db/settings";
import { config } from "./config";
import { invalidateRefCache } from "./refcache";
import { isDirectDefaultChain } from "./db/import-data";

// ---- The field split (the contract). Curated = Data Dev's dataset, syncs. Everything else = learned/operational, never synced.
const CHAIN_CURATED = ["type", "callTarget", "repackOnly", "muted", "unmappableReason", "stockCheckMethod", "stockCheckConfidence", "stockCheckNote", "siteStockUrl", "sellMethods", "isMSRP", "maxTalkSeconds", "hangupOnVoicemail", "logoUrl", "logoWide", "logoDark"] as const;
const RETAILER_CURATED = ["name", "location", "address", "zip", "lat", "lng", "timezone", "carries", "specialInstructions", "sellsPacks", "hasKiosk", "online", "tier", "externalStoreId", "mapsUri", "state", "region", "active", "notes", "ownerOnly"] as const;
// Never-sync (documented so nobody "fixes" this): chains phoneTreeDefault/dtmfShortcut/answerPath/
// avgTreeSeconds/tree*/rings*/nav*; retailers stockStatus/phone/phoneTree/shipmentDay/hours/
// hoursUpdatedAt/geocodeTriedAt. Those are earned on prod by real calls.

type ChainRow = typeof chains.$inferSelect;
type RetailerRow = typeof retailers.$inferSelect;
export interface SyncChain { name: string; fields: Record<string, unknown> }
export interface SyncRetailer { phone: string; chainName: string | null; published: boolean; fields: Record<string, unknown> }
export interface SyncPayload { chains: SyncChain[]; retailers: SyncRetailer[]; retailerTombstones: string[] }

const pick = (row: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
const hash = (o: unknown) => createHash("sha1").update(JSON.stringify(o)).digest("hex");

/** Current curated snapshot of staging's store data, keyed for cross-env matching (chain=name, retailer=phone). */
export async function curatedSnapshot() {
  const cs = await db.select().from(chains);
  const rs = await db.select().from(retailers);
  const chainName = new Map(cs.map((c) => [c.id, c.name]));
  const outC = new Map<string, SyncChain>();
  for (const c of cs) outC.set(c.name, { name: c.name, fields: pick(c as unknown as Record<string, unknown>, CHAIN_CURATED) });
  const outR = new Map<string, SyncRetailer>();
  for (const r of rs) {
    if (!r.phone || outR.has(r.phone)) continue; // phone is the identity; dupes are a data bug — first wins
    outR.set(r.phone, { phone: r.phone, chainName: r.chainId ? chainName.get(r.chainId) ?? null : null, published: (r as RetailerRow & { published?: boolean }).published !== false, fields: pick(r as unknown as Record<string, unknown>, RETAILER_CURATED) });
  }
  return { chains: outC, retailers: outR };
}

/** Diff staging's snapshot against the last-synced hashes → the minimal payload to push. */
export async function buildSyncPayload(): Promise<{ payload: SyncPayload; nextState: Record<string, string> }> {
  const snap = await curatedSnapshot();
  let state: Record<string, string> = {};
  try { state = JSON.parse((await getSetting("store_sync_state")) || "{}"); } catch { /* fresh */ }
  const next: Record<string, string> = {};
  const payload: SyncPayload = { chains: [], retailers: [], retailerTombstones: [] };
  for (const [name, c] of snap.chains) {
    const h = hash(c); next["c:" + name] = h;
    if (state["c:" + name] !== h) payload.chains.push(c);
  }
  for (const [phone, r] of snap.retailers) {
    if (!r.published) continue; // drafts never leave staging
    const h = hash(r); next["r:" + phone] = h;
    if (state["r:" + phone] !== h) payload.retailers.push(r);
  }
  // tombstones: previously synced retailers that are now gone or unpublished → deactivate on prod
  for (const k of Object.keys(state)) {
    if (k.startsWith("r:") && !(k in next)) { payload.retailerTombstones.push(k.slice(2)); }
  }
  return { payload, nextState: next };
}

/** Hard cap per request — a batch, never the whole dataset (a 110k-row payload wedged prod 2026-07-09). */
export const MAX_BATCH = { chains: 400, retailers: 1000, tombstones: 2000 };

/** TARGET side: apply ONE BATCH. Upserts curated fields only; never touches learned columns.
 *  Throws { code: "batch_too_large" } on oversized payloads instead of grinding the event loop. */
export async function applyStoreSync(p: SyncPayload): Promise<{ chains: number; retailers: number; created: number; tombstoned: number }> {
  if ((p.chains?.length || 0) > MAX_BATCH.chains || (p.retailers?.length || 0) > MAX_BATCH.retailers || (p.retailerTombstones?.length || 0) > MAX_BATCH.tombstones) {
    throw Object.assign(new Error("batch_too_large"), { code: "batch_too_large" });
  }
  let nC = 0, nR = 0, created = 0, dead = 0;
  // bulk lookups once per request — no per-row SELECTs
  const chainRows = await db.select({ id: chains.id, name: chains.name }).from(chains);
  const chainIds = new Map(chainRows.map((c) => [c.name, c.id]));
  for (const c of p.chains || []) {
    if (!c?.name) continue;
    const id = chainIds.get(c.name);
    if (id) await db.update(chains).set(c.fields as never).where(eq(chains.id, id));
    else { const [row] = await db.insert(chains).values({ name: c.name, ...(c.fields as object) } as never).returning({ id: chains.id }); chainIds.set(c.name, row.id); }
    nC++;
  }
  const phoneRows = (p.retailers?.length || p.retailerTombstones?.length)
    ? await db.select({ id: retailers.id, phone: retailers.phone }).from(retailers) : [];
  const phoneIds = new Map(phoneRows.map((r) => [r.phone, r.id]));
  for (const r of p.retailers || []) {
    if (!r?.phone || !r.fields?.name || !r.fields?.location) continue;
    const set: Record<string, unknown> = { ...r.fields, chainId: r.chainName ? chainIds.get(r.chainName) ?? null : null };
    // never let a null staging geocode erase a prod geocode
    if (set.lat == null) delete set.lat;
    if (set.lng == null) delete set.lng;
    const id = phoneIds.get(r.phone);
    if (id) { await db.update(retailers).set(set as never).where(eq(retailers.id, id)); nR++; }
    else { const [row] = await db.insert(retailers).values({ phone: r.phone, published: true, ...set } as never).returning({ id: retailers.id }); phoneIds.set(r.phone, row.id); created++; }
  }
  for (const phone of p.retailerTombstones || []) {
    const id = phoneIds.get(phone);
    if (id) { await db.update(retailers).set({ active: false }).where(eq(retailers.id, id)); dead++; }
  }
  return { chains: nC, retailers: nR, created, tombstoned: dead };
}

// ---- Sender (staging only; inert unless both env vars are set) ----
// Batched + throttled: 400 retailers per POST, max 12 batches per tick (the initial 110k-store
// catch-up spreads over ~2h of ticks; after that it's tiny diffs). Per-batch 30s timeout; state is
// persisted after EVERY successful batch so progress survives restarts. lastRun is persisted too.
const BATCH_ROWS = 400, MAX_BATCHES_PER_TICK = 12;
let running = false;
export async function syncStatus() {
  let lastRun: unknown = null;
  try { lastRun = JSON.parse((await getSetting("store_sync_last")) || "null"); } catch { /* none */ }
  return { enabled: !!(config.staging.on && process.env.STORE_SYNC_URL && process.env.STORE_SYNC_TOKEN), running, lastRun };
}
async function postBatch(url: string, token: string, batch: SyncPayload): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/api/store-sync", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(batch), signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`target ${r.status}: ${(await r.text()).slice(0, 120)}`);
  } finally { clearTimeout(timer); }
}
export async function storeSyncTick(): Promise<void> {
  if (!config.staging.on || running) return;      // only staging pushes; never overlap
  const url = process.env.STORE_SYNC_URL, token = process.env.STORE_SYNC_TOKEN;
  if (!url || !token) return;                     // not activated
  running = true;
  const stamp = async (o: object) => setSetting("store_sync_last", JSON.stringify({ at: Date.now(), ...o }));
  try {
    const { payload, nextState } = await buildSyncPayload();
    const total = payload.chains.length + payload.retailers.length + payload.retailerTombstones.length;
    if (total === 0) { await stamp({ ok: true, sent: 0, pending: 0 }); return; }
    let state: Record<string, string> = {};
    try { state = JSON.parse((await getSetting("store_sync_state")) || "{}"); } catch { /* fresh */ }
    let sent = 0, batches = 0;
    // chains first (small), then retailer chunks; persist hashes after each successful batch
    if (payload.chains.length) {
      await postBatch(url, token, { chains: payload.chains.slice(0, MAX_BATCH.chains), retailers: [], retailerTombstones: [] });
      for (const c of payload.chains) state["c:" + c.name] = nextState["c:" + c.name];
      await setSetting("store_sync_state", JSON.stringify(state));
      sent += payload.chains.length; batches++;
    }
    let i = 0;
    while (i < payload.retailers.length && batches < MAX_BATCHES_PER_TICK) {
      const chunk = payload.retailers.slice(i, i + BATCH_ROWS);
      await postBatch(url, token, { chains: [], retailers: chunk, retailerTombstones: [] });
      for (const r of chunk) state["r:" + r.phone] = nextState["r:" + r.phone];
      await setSetting("store_sync_state", JSON.stringify(state));
      sent += chunk.length; i += chunk.length; batches++;
    }
    const pending = payload.retailers.length - i;
    // tombstones only once the row backlog is clear (keeps ordering sane during the catch-up)
    if (pending === 0 && payload.retailerTombstones.length) {
      await postBatch(url, token, { chains: [], retailers: [], retailerTombstones: payload.retailerTombstones.slice(0, MAX_BATCH.tombstones) });
      for (const ph of payload.retailerTombstones) delete state["r:" + ph];
      await setSetting("store_sync_state", JSON.stringify(state));
      sent += payload.retailerTombstones.length;
    }
    await stamp({ ok: true, sent, pending });
    console.log(`[store-sync] pushed ${sent} rows in ${batches} batch(es); ${pending} pending for next tick`);
  } catch (e) {
    await stamp({ ok: false, error: String(e).slice(0, 200) }).catch(() => {});
    console.error("[store-sync] tick failed:", String(e).slice(0, 200));
  } finally { running = false; }
}

// ---- Reverse puller (staging only): learned phone-nav is BORN on prod (real calls only run on prod),
// so it can never flow up through storeSyncTick — that pipe is curated-only, staging→prod. Without this
// mirror, a chain prod has mapped (Costco, Michael's…) shows GREY "coming soon" on staging until someone
// runs a script by hand. This tick pulls the learned nav prod→staging on a schedule so the two never
// drift again. Field-scoped to exactly the columns store-sync refuses to push (the never-sync set), and
// it SKIPS the curated direct-default chains so the independent/co-op direct nav is never clobbered.
// Same activation as the sender: STORE_SYNC_URL (prod base) + STORE_SYNC_TOKEN (prod ADMIN_TOKEN) on staging.
const CHAIN_LEARNED = ["navStatus", "navRecipe", "navType", "navSeconds", "ringsDirect", "treeStatus", "treeNote",
  "phoneTreeDefault", "dtmfShortcut", "answerPath", "avgTreeSeconds", "treeLearnedAt", "treeVerifiedAt"] as const;
let pulling = false;
export async function learnedSyncStatus() {
  let lastRun: unknown = null;
  try { lastRun = JSON.parse((await getSetting("learned_sync_last")) || "null"); } catch { /* none */ }
  return { enabled: !!(config.staging.on && process.env.STORE_SYNC_URL && process.env.STORE_SYNC_TOKEN), pulling, lastRun };
}
/** Pull prod's learned chain-nav into staging. Returns a small summary (also used by the manual endpoint). */
export async function learnedSyncTick(): Promise<{ ok: boolean; updated?: number; skipped?: number; seen?: number; error?: string }> {
  if (!config.staging.on) return { ok: false, error: "not_staging" };  // prod is the SOURCE; it never pulls
  if (pulling) return { ok: false, error: "busy" };
  const url = process.env.STORE_SYNC_URL, token = process.env.STORE_SYNC_TOKEN;
  if (!url || !token) return { ok: false, error: "not_activated" };
  pulling = true;
  const stamp = async (o: object) => setSetting("learned_sync_last", JSON.stringify({ at: Date.now(), ...o }));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    let prodChains: Record<string, unknown>[];
    try {
      const r = await fetch(url.replace(/\/$/, "") + "/api/admin/table-dump?name=chains&limit=5000", {
        headers: { "x-admin-token": token }, signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`prod ${r.status}`);
      prodChains = ((await r.json()) as { rows?: Record<string, unknown>[] }).rows || [];
    } finally { clearTimeout(timer); }
    const byName = new Map((await db.select().from(chains)).map((x) => [x.name, x as unknown as Record<string, unknown>]));
    let updated = 0, skipped = 0;
    for (const pc of prodChains) {
      const name = typeof pc.name === "string" ? pc.name : null;
      const row = name ? byName.get(name) : null;
      if (!row) continue;
      if (isDirectDefaultChain(name)) { skipped++; continue; } // curated direct default owns its nav
      const desired: Record<string, unknown> = {};
      for (const k of CHAIN_LEARNED) desired[k] = (k in pc) ? pc[k] : row[k];
      // silent-agent invariant: a direct chain must carry NO tree-seconds (a stray value arms the connect
      // timer and mutes the agent on a live human).
      if (desired.ringsDirect === true || desired.answerPath === "direct_human") desired.avgTreeSeconds = null;
      const cur = JSON.stringify(CHAIN_LEARNED.map((k) => row[k] ?? null));
      const nxt = JSON.stringify(CHAIN_LEARNED.map((k) => desired[k] ?? null));
      if (cur === nxt) continue;                                // no change → no write, no cache churn
      await db.update(chains).set(desired as never).where(eq(chains.id, row.id as number));
      updated++;
    }
    if (updated) invalidateRefCache();
    await stamp({ ok: true, updated, skipped, seen: prodChains.length });
    if (updated) console.log(`[learned-sync] pulled nav for ${updated} chain(s) from prod`);
    return { ok: true, updated, skipped, seen: prodChains.length };
  } catch (e) {
    await stamp({ ok: false, error: String(e).slice(0, 200) }).catch(() => {});
    console.error("[learned-sync] tick failed:", String(e).slice(0, 200));
    return { ok: false, error: String(e).slice(0, 200) };
  } finally { pulling = false; }
}

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

// ---- The field split (the contract). Curated = Data Dev's dataset, syncs. Everything else = learned/operational, never synced.
const CHAIN_CURATED = ["type", "callTarget", "repackOnly", "muted", "stockCheckMethod", "stockCheckConfidence", "stockCheckNote", "siteStockUrl", "sellMethods", "isMSRP", "maxTalkSeconds", "hangupOnVoicemail", "logoUrl", "logoWide", "logoDark"] as const;
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

/** TARGET side: apply a payload. Upserts curated fields only; never touches learned columns. */
export async function applyStoreSync(p: SyncPayload): Promise<{ chains: number; retailers: number; created: number; tombstoned: number }> {
  let nC = 0, nR = 0, created = 0, dead = 0;
  for (const c of p.chains || []) {
    if (!c?.name) continue;
    const row = (await db.select().from(chains).where(eq(chains.name, c.name)))[0];
    if (row) await db.update(chains).set(c.fields as never).where(eq(chains.id, row.id));
    else await db.insert(chains).values({ name: c.name, ...(c.fields as object) } as never);
    nC++;
  }
  const chainIds = new Map((await db.select().from(chains)).map((c) => [c.name, c.id]));
  for (const r of p.retailers || []) {
    if (!r?.phone || !r.fields?.name || !r.fields?.location) continue;
    const set: Record<string, unknown> = { ...r.fields, chainId: r.chainName ? chainIds.get(r.chainName) ?? null : null };
    // never let a null staging geocode erase a prod geocode
    if (set.lat == null) delete set.lat;
    if (set.lng == null) delete set.lng;
    const row = (await db.select().from(retailers).where(eq(retailers.phone, r.phone)))[0];
    if (row) { await db.update(retailers).set(set as never).where(eq(retailers.id, row.id)); nR++; }
    else { await db.insert(retailers).values({ phone: r.phone, published: true, ...set } as never); created++; }
  }
  for (const phone of p.retailerTombstones || []) {
    const row = (await db.select().from(retailers).where(eq(retailers.phone, phone)))[0];
    if (row) { await db.update(retailers).set({ active: false }).where(eq(retailers.id, row.id)); dead++; }
  }
  return { chains: nC, retailers: nR, created, tombstoned: dead };
}

// ---- Sender (staging only; inert unless both env vars are set) ----
let lastRun: { at: number; sent: { chains: number; retailers: number; tombstones: number }; ok: boolean; error?: string } | null = null;
export function syncStatus() {
  return { enabled: !!(config.staging.on && process.env.STORE_SYNC_URL && process.env.STORE_SYNC_TOKEN), lastRun };
}
export async function storeSyncTick(): Promise<void> {
  if (!config.staging.on) return;                 // only staging pushes; prod never syncs outward
  const url = process.env.STORE_SYNC_URL, token = process.env.STORE_SYNC_TOKEN;
  if (!url || !token) return;                     // not activated yet
  const { payload, nextState } = await buildSyncPayload();
  const n = payload.chains.length + payload.retailers.length + payload.retailerTombstones.length;
  if (n === 0) return;                            // nothing changed since last sync
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/api/store-sync", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`target ${r.status}: ${(await r.text()).slice(0, 120)}`);
    await setSetting("store_sync_state", JSON.stringify(nextState));
    lastRun = { at: Date.now(), sent: { chains: payload.chains.length, retailers: payload.retailers.length, tombstones: payload.retailerTombstones.length }, ok: true };
    console.log(`[store-sync] pushed ${payload.chains.length} chains, ${payload.retailers.length} retailers, ${payload.retailerTombstones.length} tombstones`);
  } catch (e) {
    lastRun = { at: Date.now(), sent: { chains: payload.chains.length, retailers: payload.retailers.length, tombstones: payload.retailerTombstones.length }, ok: false, error: String(e).slice(0, 200) };
    console.error("[store-sync] push failed:", String(e).slice(0, 200));
  }
}

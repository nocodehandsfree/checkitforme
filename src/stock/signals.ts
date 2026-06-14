// The stock-signal rail: every way we learn what's on a shelf WITHOUT a phone call lands here —
// site checkers (chains whose sites mirror the shelf), Discord cook-group restock pings, kiosk
// receipts, manual entry. Writers post to /api/stock/ingest; the consumer UI reads the freshest
// signal per store. Calls remain the ground truth for call-rail chains.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { chains, discordChannels, retailers, stockSignals } from "../db/schema";
import { haversineMi, bboxAround } from "../geo";

export const SIGNAL_STATUSES = ["in_stock", "out_of_stock", "low", "unknown"] as const;
export const SIGNAL_SOURCES = ["site", "discord", "call", "receipt", "manual"] as const;

export interface SignalIn {
  // Target store, by any ONE of: our id, chain + the chain's own store number, or chain + zip.
  retailerId?: number;
  chain?: string;
  externalStoreId?: string;
  zip?: string;
  chainWide?: boolean;          // true = a chain-level drop (no specific store); requires `chain`
  product?: string;             // free-text product/SKU
  categoryId?: number;
  status: string;               // in_stock | out_of_stock | low | unknown
  source: string;               // site | discord | call | receipt | manual
  sourceDetail?: string;        // checker id or "<cook group>#<channel>"
  channelId?: string;           // Discord channel that produced this (stamps the registry)
  url?: string;
  note?: string;
  seenAt?: number;              // unix seconds; defaults to now
}

async function chainByName(name: string): Promise<{ id: number } | undefined> {
  return (await db.select({ id: chains.id }).from(chains).where(eq(chains.name, name)))[0];
}

/** Insert a batch of signals. Returns counts + the indexes of rows we couldn't match to a store/chain. */
export async function ingestSignals(items: SignalIn[]): Promise<{ inserted: number; unmatched: number[] }> {
  let inserted = 0;
  const unmatched: number[] = [];
  const touchedChannels = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const status = SIGNAL_STATUSES.includes(it.status as (typeof SIGNAL_STATUSES)[number]) ? it.status : "unknown";
    const source = SIGNAL_SOURCES.includes(it.source as (typeof SIGNAL_SOURCES)[number]) ? it.source : "manual";
    let retailerId: number | null = null;
    let chainId: number | null = null;

    if (it.retailerId) {
      const r = (await db.select({ id: retailers.id, chainId: retailers.chainId }).from(retailers).where(eq(retailers.id, it.retailerId)))[0];
      if (r) { retailerId = r.id; chainId = r.chainId ?? null; }
    } else if (it.chain) {
      const ch = await chainByName(it.chain);
      if (ch) {
        chainId = ch.id;
        if (!it.chainWide) {
          // Per-store match: the chain's own store number first, zip as the fallback.
          const r = it.externalStoreId
            ? (await db.select({ id: retailers.id }).from(retailers).where(and(eq(retailers.chainId, ch.id), eq(retailers.externalStoreId, it.externalStoreId))))[0]
            : it.zip
              ? (await db.select({ id: retailers.id }).from(retailers).where(and(eq(retailers.chainId, ch.id), eq(retailers.zip, it.zip))))[0]
              : undefined;
          retailerId = r?.id ?? null;
        }
      }
    }
    if (!retailerId && !chainId) { unmatched.push(i); continue; }

    await db.insert(stockSignals).values({
      retailerId, chainId, categoryId: it.categoryId ?? null,
      product: it.product ?? null, status, source,
      sourceDetail: it.sourceDetail ?? null, url: it.url ?? null, note: it.note ?? null,
      seenAt: it.seenAt ?? Math.floor(Date.now() / 1000),
    });
    inserted++;
    if (it.channelId) touchedChannels.add(it.channelId);
  }
  const now = Math.floor(Date.now() / 1000);
  for (const cid of touchedChannels) {
    try { await db.update(discordChannels).set({ lastIngestAt: now }).where(eq(discordChannels.channelId, cid)); } catch {}
  }
  return { inserted, unmatched };
}

export interface NearbySignal {
  retailerId: number | null; chainId: number | null;
  name: string | null; location: string | null; lat: number | null; lng: number | null; miles: number | null;
  product: string | null; status: string; source: string; url: string | null; note: string | null; seenAt: number;
}

/**
 * Freshest signal per (store, product) within a radius — what powers "in stock at 3 stores near
 * you". Signals are queried by recency first (small set), THEN matched to stores, so this stays
 * cheap no matter how big the retailers table gets. Chain-wide signals are included with no miles.
 */
export async function recentStockNear(lat: number | null, lng: number | null, radiusMi = 25, sinceHours = 48, categoryId?: number): Promise<NearbySignal[]> {
  const cutoff = Math.floor(Date.now() / 1000) - sinceHours * 3600;
  let rows = await db.select().from(stockSignals).where(gte(stockSignals.seenAt, cutoff)).orderBy(desc(stockSignals.seenAt));
  if (categoryId) rows = rows.filter((s) => !s.categoryId || s.categoryId === categoryId);

  const ids = [...new Set(rows.map((s) => s.retailerId).filter((x): x is number => x != null))];
  const stores = ids.length ? await db.select().from(retailers).where(inArray(retailers.id, ids)) : [];
  const byId = new Map(stores.map((r) => [r.id, r]));

  const seen = new Set<string>(); // freshest per (store-or-chain, product) wins; rows are recency-sorted
  const out: NearbySignal[] = [];
  for (const s of rows) {
    const key = `${s.retailerId ?? `c${s.chainId}`}|${(s.product ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    const r = s.retailerId ? byId.get(s.retailerId) : undefined;
    if (s.retailerId && !r) continue;          // signal for a store we no longer have
    if (r && r.active === false) continue;
    let miles: number | null = null;
    if (r && lat != null && lng != null) {
      if (r.lat == null || r.lng == null) continue;          // located query → only locatable stores
      miles = haversineMi(lat, lng, r.lat, r.lng);
      if (miles > radiusMi) continue;
    }
    seen.add(key);
    out.push({
      retailerId: s.retailerId, chainId: s.chainId,
      name: r?.name ?? null, location: r?.location ?? null, lat: r?.lat ?? null, lng: r?.lng ?? null,
      miles: miles != null ? Math.round(miles * 10) / 10 : null,
      product: s.product, status: s.status, source: s.source, url: s.url, note: s.note, seenAt: s.seenAt,
    });
  }
  return out.sort((a, b) => (a.miles ?? 9e9) - (b.miles ?? 9e9)).slice(0, 100);
}

/** Latest signals for one store (the store row / detail view). */
export async function latestForRetailer(retailerId: number, limit = 10) {
  return db.select().from(stockSignals).where(eq(stockSignals.retailerId, retailerId)).orderBy(desc(stockSignals.seenAt)).limit(limit);
}

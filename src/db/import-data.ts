// Zone/store import logic, DB-only (no env/voice deps) so it runs from the CLI
// and from the live server's HTTP import endpoint. Geocoding is separate/background.
import { eq, isNull, isNotNull, and, or, lt } from "drizzle-orm";
import { db } from "./client";
import { chains, retailers, zones, zoneRetailers } from "./schema";

export interface InRetailer {
  chain?: string; name: string; address?: string; zip?: string; phone: string;
  timezone?: string; shipmentDay?: string | null; phoneTree?: string | null; notes?: string;
  stockStatus?: "verified" | "unverified";
  carries?: string[] | null;
  specialInstructions?: string | null;
  lat?: number; lng?: number;
}
export interface InZone { name: string; centerZip?: string; radiusMiles?: number; retailers: InRetailer[] }
export interface InFile { zones: InZone[] }

// Chain → store category, for filtering.
const CHAIN_TYPES: Record<string, string> = {
  "CVS": "Pharmacy", "Walgreens": "Pharmacy",
  "Target": "Big Box", "Walmart": "Big Box",
  "Sam's Club": "Warehouse", "Sams": "Warehouse",
  "Ross Dress for Less": "Off-Price", "Marshalls": "Off-Price", "Burlington": "Off-Price",
  "HomeGoods": "Off-Price", "T.J. Maxx": "Off-Price", "TJ Maxx": "Off-Price",
  "Five Below": "Discount", "Dollar Tree": "Discount", "Dollar General": "Discount", "Family Dollar": "Discount",
  "Michaels": "Craft",
  "Big 5 Sporting Goods": "Sporting Goods", "Dick's Sporting Goods": "Sporting Goods",
  "Barnes & Noble": "Bookstore",
  "Hot Topic": "Mall / Specialty", "BoxLunch": "Mall / Specialty", "Spencer's": "Mall / Specialty",
  "Tokyo Japanese Lifestyle": "Mall / Specialty",
  "Franklin's Ace Hardware": "Hardware",
  "Ralphs": "Grocery", "Pavilions": "Grocery",
  "Hallmark": "Gift", "Kohl's": "Department", "Staples": "Office", "Amazon": "Online",
  // Thrift rail — treasure-hunt, "spotty" stock. Named here so the boot-time backfill classifies them
  // correctly even under old/unguarded code (prod was reverting these to "Other" every deploy → admin
  // mapping looked wrong; 2026-07-07). The stores-import.ts name-heuristic misses these (no "thrift"
  // token in the brand name), so they must be explicit.
  "Goodwill": "Thrift", "Savers": "Thrift", "Value Village": "Thrift", "Salvation Army": "Thrift",
  "Salvation Army Family Store": "Thrift", "Unique": "Thrift", "Unique Thrift Store": "Thrift",
  "Plato's Closet": "Thrift", "Buffalo Exchange": "Thrift", "2nd Ave Value Stores": "Thrift",
  // Hobby rail — independent card/comic shops (ring straight to a human, sell ABOVE MSRP → callable).
  // Same reason: keep the category durable through a boot backfill.
  "Independent Card Shop": "Hobby", "Comic Book Shop": "Hobby", "Cards and Coffee": "Hobby",
  "PokeMall TCG": "Hobby", "Burbank Sportscards": "Hobby", "CoreTCG": "Hobby",
  "Cash Cards Unlimited": "Hobby", "LA Sports Cards": "Hobby",
};
export const chainType = (name?: string | null): string => (name && CHAIN_TYPES[name]) || "Other";

async function chainId(name?: string): Promise<number | null> {
  if (!name) return null;
  const found = (await db.select().from(chains).where(eq(chains.name, name)))[0];
  if (found) return found.id;
  const [row] = await db.insert(chains).values({ name, type: chainType(name), callTarget: true }).returning();
  return row.id;
}

/** FILL the store-category on untyped chains. Backfill-only: a chain that already carries a real
 * type (anything besides empty/"Other") was set deliberately — via admin PATCH or import — and this
 * boot pass must never clobber it. (It did: every deploy reverted Data's Hobby chains to the name
 * heuristic — the 2026-07-03 "clobber watch".) */
export async function backfillChainTypes(): Promise<void> {
  for (const c of await db.select().from(chains)) {
    if (c.type && c.type !== "Other") continue; // manual/typed rows are authoritative
    const t = chainType(c.name);
    if (c.type !== t) await db.update(chains).set({ type: t }).where(eq(chains.id, c.id));
  }
}

/** Insert-only (de-dupes stores by phone, zones by name). Coordinates filled later by geocodeMissing(). */
export async function importZonesData(data: InFile) {
  let zCount = 0, rCount = 0, linkCount = 0;
  for (const z of data.zones) {
    let zone = (await db.select().from(zones).where(eq(zones.name, z.name)))[0];
    if (!zone) {
      [zone] = await db.insert(zones).values({
        name: z.name, centerZip: z.centerZip ?? null, radiusMiles: z.radiusMiles ?? null,
      }).returning();
      zCount++;
    }
    for (const r of z.retailers) {
      let store = (await db.select().from(retailers).where(eq(retailers.phone, r.phone)))[0];
      if (!store) {
        [store] = await db.insert(retailers).values({
          chainId: await chainId(r.chain),
          name: r.name,
          location: r.address ?? z.name,
          address: r.address ?? null,
          zip: r.zip ?? null,
          lat: r.lat ?? null, lng: r.lng ?? null,
          phone: r.phone,
          timezone: r.timezone ?? "America/Los_Angeles",
          stockStatus: r.stockStatus ?? "unverified",
          carries: (r.carries ?? []).join(",") || null,
          specialInstructions: r.specialInstructions ?? null,
          shipmentDay: r.shipmentDay ?? null,
          phoneTree: r.phoneTree ?? null,
          notes: r.notes ?? null,
        }).returning();
        rCount++;
      }
      const linked = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, zone.id));
      if (!linked.some((l) => l.retailerId === store.id)) {
        await db.insert(zoneRetailers).values({ zoneId: zone.id, retailerId: store.id });
        linkCount++;
      }
    }
  }
  return { zones: zCount, stores: rCount, links: linkCount };
}

// US Census Bureau one-line geocoder — free, no key, built for exactly this (US street addresses).
async function geocodeCensus(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { addressMatches?: { coordinates: { x: number; y: number } }[] } };
    const m = j.result?.addressMatches?.[0];
    return m ? { lat: m.coordinates.y, lng: m.coordinates.x } : null;
  } catch { return null; }
}
// Fallback: OpenStreetMap Nominatim (≤1 req/sec per their policy — the slow tick keeps us under).
async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "fungie-talk/1.0 (voice-caller)" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { lat: string; lon: string }[];
    if (!j.length) return null;
    return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  } catch { return null; }
}
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  return (await geocodeCensus(address)) ?? (await geocodeNominatim(address));
}

/**
 * Geocode up to `limit` stores that have an address but no coordinates yet. Returns how many filled.
 * Built to drain a 100k-store import (~4% arrive without coords): the candidate query is SQL-side
 * (hits the lat index, no full-table scan per tick), and failed lookups are stamped so they cool
 * down for a day instead of wedging the head of the queue forever.
 */
export async function geocodeMissing(limit = 1): Promise<number> {
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const pending = await db.select().from(retailers)
    .where(and(
      isNull(retailers.lat), isNotNull(retailers.address),
      or(isNull(retailers.geocodeTriedAt), lt(retailers.geocodeTriedAt, dayAgo)),
    ))
    .limit(limit);
  let filled = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const r of pending) {
    const g = await geocode([r.address, r.zip].filter(Boolean).join(" "));
    if (g) { await db.update(retailers).set({ lat: g.lat, lng: g.lng, geocodeTriedAt: now }).where(eq(retailers.id, r.id)); filled++; }
    else await db.update(retailers).set({ geocodeTriedAt: now }).where(eq(retailers.id, r.id));
  }
  return filled;
}

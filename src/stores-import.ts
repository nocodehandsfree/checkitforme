// Store CMS: import/update/soft-remove stores from a JSON file (the owner's research report),
// keeping the database current. Upserts by phone (stable key), derives region + timezone from
// state, normalizes hours, links/creates chains. Re-import = update; active:false = soft-remove.
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { retailers, chains } from "./db/schema";

const REGION: Record<string, string> = {};
const set = (r: string, sts: string[]) => sts.forEach((s) => (REGION[s] = r));
set("West Coast", ["CA", "HI"]);
set("Northwest", ["WA", "OR", "ID", "MT", "WY", "AK"]);
set("Southwest", ["AZ", "NM", "NV", "UT", "CO", "TX", "OK"]);
set("Midwest", ["ND", "SD", "NE", "KS", "MN", "IA", "MO", "WI", "IL", "IN", "MI", "OH"]);
set("Southeast", ["AR", "LA", "MS", "AL", "GA", "FL", "TN", "KY", "SC", "NC", "VA", "WV"]);
set("Northeast", ["PA", "NY", "NJ", "CT", "RI", "MA", "VT", "NH", "ME", "MD", "DE", "DC"]);

const TZ: Record<string, string> = {};
const tz = (z: string, sts: string[]) => sts.forEach((s) => (TZ[s] = z));
tz("America/Los_Angeles", ["CA", "WA", "OR", "NV"]);
tz("America/Phoenix", ["AZ"]);
tz("America/Denver", ["CO", "UT", "NM", "MT", "WY", "ID"]);
tz("America/Chicago", ["TX", "OK", "KS", "NE", "SD", "ND", "MN", "IA", "MO", "WI", "IL", "IN", "MS", "AL", "AR", "LA", "TN"]);
tz("America/New_York", ["NY", "NJ", "PA", "CT", "RI", "MA", "VT", "NH", "ME", "MD", "DE", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "OH", "MI", "KY"]);
tz("Pacific/Honolulu", ["HI"]);
tz("America/Anchorage", ["AK"]);

export function regionForState(state?: string): string | null {
  return state ? REGION[state.toUpperCase()] ?? null : null;
}
export function tzForState(state?: string): string {
  return (state && TZ[state.toUpperCase()]) || "America/Chicago";
}
/** carries may arrive as an array, a comma-separated string, or a single label. */
export function normCarries(c: unknown): string | null {
  const arr = Array.isArray(c) ? c : (typeof c === "string" ? c.split(",") : []);
  const list = arr.map((s) => String(s).trim()).filter(Boolean);
  return list.length ? list.join(",") : null;
}
export function e164(p: string): string {
  p = String(p || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.length === 10) return "+1" + p;
  if (p.length === 11 && p.startsWith("1")) return "+" + p;
  return p ? "+" + p : "";
}

type DayPair = [string, string] | "24h" | null;
type HoursIn = Record<string, unknown> | string | null | undefined;
/** Normalize many hours shapes → our canonical {mon..sun} JSON string (or null). */
function normHours(h: HoursIn): string | null {
  if (!h) return null;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const pair = (v: unknown): DayPair => {
    if (v === null) return null;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (/24\s*h|open\s*24/.test(s)) return "24h";
      if (s === "" || s === "closed") return null;
      const m = s.match(/(\d{1,2}:\d{2})\s*(?:-|–|to)\s*(\d{1,2}:\d{2})/);
      return m ? [m[1].padStart(5, "0"), m[2].padStart(5, "0")] : null;
    }
    if (Array.isArray(v) && v.length === 2) return [String(v[0]).padStart(5, "0"), String(v[1]).padStart(5, "0")];
    // Per-day object: {open:"08:00", close:"22:00"} | {closed:true} | {open:null}
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.closed === true || o.open == null || o.close == null) return null;
      if (/24/.test(String(o.open)) && /24|00:00|23:59/.test(String(o.close))) return "24h";
      return pair(`${o.open}-${o.close}`);
    }
    return null;
  };
  if (typeof h === "string") { const p = pair(h); const o: Record<string, DayPair> = {}; days.forEach((d) => (o[d] = p)); return JSON.stringify(o); }
  const obj = h as Record<string, unknown>;
  // {open,close} or {national:{open,close}} → same every day
  const nat = (obj.national as Record<string, unknown>) || (obj.open ? obj : null);
  if (nat && nat.open && nat.close) { const p = pair(`${nat.open}-${nat.close}`); const o: Record<string, DayPair> = {}; days.forEach((d) => (o[d] = p)); return JSON.stringify(o); }
  // per-day object
  const out: Record<string, DayPair> = {};
  for (const d of days) out[d] = pair(obj[d] ?? obj[d.toUpperCase()]);
  return Object.values(out).some((x) => x !== null) ? JSON.stringify(out) : null;
}

export interface StoreIn {
  chain?: string; name: string;
  category?: string;          // store type (pharmacy/grocery/mass/hobby/electronics) → chain icon
  address?: string; city?: string; state?: string; zip?: string; region?: string;
  lat?: number; lng?: number; phone: string; timezone?: string;
  carries?: string[] | string; hours?: HoursIn; active?: boolean;
  sellsPacks?: boolean;       // staffed counter we can CALL (default true)
  hasKiosk?: boolean;         // unmanned vending kiosk on site (default false)
  shipmentDay?: string;       // known shipment day(s), e.g. "Friday" — drives best-bet + scheduling
  phoneTree?: string; specialInstructions?: string; stockStatus?: string;
  // Native field names from the nationwide store-collector output — accepted as-is, zero reshaping.
  phone_tree_tip?: string;          // → phoneTree
  shipment_days?: string;           // → shipmentDay
  department_to_ask?: string;       // ┐
  restock_best_hunt_window?: string;// ├ folded into specialInstructions
  distributor?: string;             // │
  msrp_reliability?: string;        // ┘
  vendor_stocked?: string;          // "yes"/"no" → carries hint handled by the import script
  store_id?: string;                // chain's own store number → externalStoreId (keys site stock checks)
  mapsUri?: string;                 // Google Maps deep link (Places-sourced rows)
  placeId?: string;                 // accepted, unused for now
  intelNote?: string;               // agent call-script hint → folded into specialInstructions
  carryConfidence?: string;         // "confirmed" → stockStatus verified, "unconfirmed" → unverified
  visibility?: string;              // "muted" → mute the CHAIN (audit model: repack-only chains hide, never delete)
}

/** Compose specialInstructions from the collector's intel fields (or pass an explicit one through). */
function composeInstructions(it: StoreIn): string | undefined {
  if (it.specialInstructions) return it.specialInstructions;
  const bits: string[] = [];
  if (it.intelNote) bits.push(it.intelNote);
  if (it.department_to_ask) bits.push(`Ask the ${String(it.department_to_ask).replace(/_/g, " ")} department.`);
  if (it.restock_best_hunt_window) bits.push(`Best hunt window: ${it.restock_best_hunt_window}.`);
  if (it.distributor) bits.push(`Distributor: ${it.distributor}.`);
  if (it.msrp_reliability) bits.push(`MSRP reliability: ${it.msrp_reliability}.`);
  return bits.length ? bits.join(" ") : undefined;
}

// Map a provider's loose store-category string → our chain "type" (drives the store-list icon).
function storeType(cat?: string): string | undefined {
  const c = (cat || "").toLowerCase();
  if (!c) return undefined;
  if (/pharmac|drug/.test(c)) return "Pharmacy";
  if (/grocer|superm|food/.test(c)) return "Grocery";
  if (/hobby|toy|game|card|collect/.test(c)) return "Hobby";
  if (/electron|tech/.test(c)) return "Electronics";
  if (/dollar|variety/.test(c)) return "Dollar";
  if (/hardware|home.?improve/.test(c)) return "Hardware";
  if (/book/.test(c)) return "Books";
  if (/office|stationer/.test(c)) return "Office";
  if (/sport|athletic|outdoor/.test(c)) return "Sports";
  if (/club|warehouse|wholesale/.test(c)) return "Club";
  if (/apparel|clothing|fashion/.test(c)) return "Apparel";
  if (/mass|big.?box|discount|retail|department/.test(c)) return "Retail";
  return "Retail";
}

async function chainId(name?: string, type?: string): Promise<number | null> {
  if (!name) return null;
  const found = (await db.select().from(chains).where(eq(chains.name, name)))[0];
  if (found) {
    if (type && (!found.type || found.type === "Other")) await db.update(chains).set({ type }).where(eq(chains.id, found.id));
    return found.id;
  }
  const [row] = await db.insert(chains).values({ name, ...(type ? { type } : {}) }).returning();
  return row.id;
}

/** Import a batch. Upsert by phone; active:false soft-removes. Returns counts + any skips. */
export async function importStores(items: StoreIn[]): Promise<{ inserted: number; updated: number; deactivated: number; skipped: number }> {
  let inserted = 0, updated = 0, deactivated = 0, skipped = 0;
  const muteChains = new Set<string>();
  for (const it of items) {
    let phone = e164(it.phone);
    // Site-rail stores can lack a dialable line entirely (Micro Center has no per-store phone).
    // Keep them under a synthetic unique key in the phone column — sellsPacks:false keeps them
    // off the call rail, and the call engine refuses "nophone:" numbers as a hard backstop.
    if (!phone && it.sellsPacks === false && it.chain && (it.store_id || it.zip)) {
      phone = `nophone:${it.chain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${it.store_id || it.zip}`;
    }
    if (!it.name || !phone) { skipped++; continue; }
    // Audit model: a muted row means the CHAIN is repack-only — hide the whole chain, never delete.
    // (Re-importing muted rows re-mutes; un-mute in admin after a verified call, per the workflow.)
    if (it.visibility === "muted" && it.chain) muteChains.add(it.chain);
    const state = it.state?.toUpperCase();
    const fields = {
      name: it.name,
      location: it.city && state ? `${it.city}, ${state}` : (it.city || state || ""),
      address: it.address ?? null,
      zip: it.zip ?? null,
      lat: it.lat ?? null, lng: it.lng ?? null,
      phone,
      timezone: it.timezone || tzForState(state),
      state: state ?? null,
      region: it.region ?? regionForState(state),
      carries: normCarries(it.carries),
      hours: normHours(it.hours),
      ...(normHours(it.hours) ? { hoursUpdatedAt: Math.floor(Date.now() / 1000) } : {}),
      active: it.active !== false,
      sellsPacks: it.sellsPacks !== false,
      hasKiosk: it.hasKiosk === true,
      chainId: await chainId(it.chain, storeType(it.category)),
      ...((it.shipmentDay || it.shipment_days) ? { shipmentDay: it.shipmentDay || it.shipment_days } : {}),
      ...((it.phoneTree || it.phone_tree_tip) ? { phoneTree: it.phoneTree || it.phone_tree_tip } : {}),
      ...((composeInstructions(it)) ? { specialInstructions: composeInstructions(it) } : {}),
      ...(it.store_id ? { externalStoreId: String(it.store_id) } : {}),
      ...(it.mapsUri ? { mapsUri: it.mapsUri } : {}),
      // Collector audit: confirmed carriers count as verified sellers; unconfirmed stay flagged.
      ...(it.stockStatus ? { stockStatus: it.stockStatus }
        : it.carryConfidence === "confirmed" ? { stockStatus: "verified" }
        : it.carryConfidence === "unconfirmed" ? { stockStatus: "unverified" } : {}),
    };
    const existing = (await db.select().from(retailers).where(eq(retailers.phone, phone)))[0];
    if (existing) {
      // Don't blow away hours we already looked up if the import omits them.
      if (fields.hours === null) delete (fields as Record<string, unknown>).hours;
      await db.update(retailers).set(fields).where(eq(retailers.id, existing.id));
      if (it.active === false) deactivated++; else updated++;
    } else if (it.active === false) {
      skipped++; // nothing to remove
    } else {
      await db.insert(retailers).values(fields);
      inserted++;
    }
  }
  for (const name of muteChains) {
    await db.update(chains).set({ muted: true, repackOnly: true }).where(eq(chains.name, name));
  }
  return { inserted, updated, deactivated, skipped };
}

/** Backfill region/state on existing stores from their address (one-time / maintenance). */
export async function backfillRegions(): Promise<number> {
  const rs = await db.select().from(retailers);
  let n = 0;
  for (const r of rs) {
    if (r.region && r.state) continue;
    const m = (r.address || r.location || "").match(/\b([A-Z]{2})\b\s*\d{5}?/);
    const st = m?.[1];
    if (st && REGION[st]) { await db.update(retailers).set({ state: st, region: REGION[st] }).where(eq(retailers.id, r.id)); n++; }
  }
  return n;
}

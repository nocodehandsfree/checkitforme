// Reference-data cache: categories (effectively static) and retailers (changes via admin/import).
// The consumer read paths (/pub/finds, /pub/stores, restock-intel) full-scan these tables on every
// request; as the store DB grows into the thousands per regional import, that's wasteful. Short TTLs
// keep reads O(1)-ish while staying fresh within seconds. Admin endpoints keep reading live (not cached);
// bulk imports call invalidate() so changes show up immediately.
import { db } from "./db/client";
import { categories, chains, retailers } from "./db/schema";

type Cat = typeof categories.$inferSelect;
type Chain = typeof chains.$inferSelect;
type Retailer = typeof retailers.$inferSelect;

let catC: { t: number; v: Cat[] } | null = null;
let chnC: { t: number; v: Chain[] } | null = null;
let retC: { t: number; v: Retailer[] } | null = null;
const CAT_TTL = 60_000;  // categories almost never change
const CHN_TTL = 60_000;  // chains: ~100 rows, changes via admin/import only
const RET_TTL = 15_000;  // retailers tolerate a few seconds of staleness on consumer paths

export async function cachedCategories(): Promise<Cat[]> {
  if (catC && Date.now() - catC.t < CAT_TTL) return catC.v;
  const v = await db.select().from(categories);
  catC = { t: Date.now(), v };
  return v;
}
export async function cachedRetailers(): Promise<Retailer[]> {
  if (retC && Date.now() - retC.t < RET_TTL) return retC.v;
  const v = await db.select().from(retailers);
  retC = { t: Date.now(), v };
  return v;
}
export async function cachedChains(): Promise<Chain[]> {
  if (chnC && Date.now() - chnC.t < CHN_TTL) return chnC.v;
  const v = await db.select().from(chains);
  chnC = { t: Date.now(), v };
  return v;
}
export async function categoryLabelMap(): Promise<Map<number, string>> {
  return new Map((await cachedCategories()).map((x) => [x.id, x.label]));
}
export async function retailerMap(): Promise<Map<number, Retailer>> {
  return new Map((await cachedRetailers()).map((x) => [x.id, x]));
}
/** Call after any bulk write (import, backfill) so the next read reflects it immediately. */
export function invalidateRefCache(): void { catC = null; chnC = null; retC = null; }

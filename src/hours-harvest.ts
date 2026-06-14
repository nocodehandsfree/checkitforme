// Self-updating store hours. Gated by policy flag `dogfoodHours` (OFF until the owner flips it).
// When on, it keeps hours fresh for stores missing them. (v1 uses the web lookup; the night-time
// "call the store and read the hours off their voicemail greeting" variant is the next iteration —
// scaffolded here so it can be upgraded without touching callers.)
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { retailers } from "./db/schema";
import { fetchStoreHours } from "./store-hours";
import { getPolicy } from "./policy";

let running = false;
export async function harvestHoursTick(): Promise<number> {
  const pol = await getPolicy();
  if (!pol.flags.dogfoodHours || running) return 0;
  running = true;
  let n = 0;
  try {
    const staleCutoff = Math.floor(Date.now() / 1000) - 45 * 86400; // re-verify hours older than 45 days
    const all = await db.select().from(retailers);
    const missing = all.filter((r) => r.active !== false && r.address && (!r.hours || (r.hoursUpdatedAt ?? 0) < staleCutoff))
      .sort((a, b) => (a.hours ? 1 : 0) - (b.hours ? 1 : 0)) // truly-missing first, then stale
      .slice(0, 5);
    for (const r of missing) {
      const h = await fetchStoreHours(r.name, r.address!);
      if (h) { await db.update(retailers).set({ hours: h, hoursUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(retailers.id, r.id)); n++; }
      await new Promise((res) => setTimeout(res, 1500));
    }
  } catch (e) { console.error("hours harvest:", e); } finally { running = false; }
  return n;
}

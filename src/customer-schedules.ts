// Subscriber auto-checks: stand-up a recurring "call this store on shipment days and alert me when it
// lands" without touching the admin broadcast scheduler. Reuses the call engine (one credit per fire)
// and the watch alert path. Premium + gated by policy.flags.scheduling and an active membership.
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { customerSchedules, retailers, categories, watches } from "./db/schema";
import { bridgeCheckCall, triggerCall, storeOpenInfo } from "./calls/service";
import { getAccount, chargeOneCredit, isComp, spendableCredits } from "./billing";
import { getPolicy } from "./policy";

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
/** weekday (0=Sun), HH:MM, and YYYY-MM-DD in a store's IANA timezone. */
function localParts(tz: string): { dow: number; hhmm: string; date: string } {
  const d = new Date();
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hh = p.hour === "24" ? "00" : p.hour;
  return { dow: DOW[(p.weekday || "Sun").toLowerCase()] ?? 0, hhmm: `${hh}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}` };
}
function dayMatches(daysCsv: string | null | undefined, shipmentDay: string | null | undefined, dow: number): boolean {
  const set = (daysCsv || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (set.length) return set.includes(String(dow));
  // No explicit days → fall back to the store's known shipment day (e.g. "Thursday").
  const sd = (shipmentDay || "").trim().toLowerCase();
  return sd ? DOW[sd] === dow : false;
}

export interface ScheduleIn { retailerId: number; categoryId: number; specificProduct?: string; daysOfWeek?: string; timeLocal?: string; contact?: string }

export async function createSchedule(finderUserId: string, s: ScheduleIn) {
  const [row] = await db.insert(customerSchedules).values({
    finderUserId, retailerId: Number(s.retailerId), categoryId: Number(s.categoryId),
    specificProduct: s.specificProduct?.trim() || null,
    daysOfWeek: s.daysOfWeek?.trim() || null,
    timeLocal: (s.timeLocal || "10:00").trim(),
    contact: s.contact?.trim() || null,
  }).returning();
  return row;
}
export async function listSchedules(finderUserId: string) {
  return db.select().from(customerSchedules).where(eq(customerSchedules.finderUserId, finderUserId));
}
export async function deleteSchedule(finderUserId: string, id: number) {
  await db.delete(customerSchedules).where(and(eq(customerSchedules.id, id), eq(customerSchedules.finderUserId, finderUserId)));
  return { ok: true };
}

let running = false;
/** Fire any due auto-checks. Gated by flags.scheduling. One fire per store-local day, on shipment days. */
export async function customerScheduleTick(): Promise<number> {
  const pol = await getPolicy();
  if (!pol.flags.scheduling || running) return 0;
  running = true;
  let fired = 0;
  try {
    const rows = (await db.select().from(customerSchedules)).filter((r) => r.active);
    for (const r of rows) {
      const store = (await db.select().from(retailers).where(eq(retailers.id, r.retailerId)))[0];
      if (!store) continue;
      const { dow, hhmm, date } = localParts(store.timezone || "America/Chicago");
      if (r.lastRunDay === date) continue;                        // already fired today
      if (!dayMatches(r.daysOfWeek, store.shipmentDay, dow)) continue;
      if (hhmm < (r.timeLocal || "10:00")) continue;              // not yet time
      // Subscriber must be active + funded (comp accounts bypass both).
      const acct = await getAccount(r.finderUserId);
      const comp = isComp(acct?.email);
      const subbed = acct?.subscription === "active";
      if (!comp && (!subbed || !acct || spendableCredits(acct) <= 0)) { continue; }
      const gate = await storeOpenInfo(r.retailerId);
      if (gate && gate.known && !gate.open) continue;             // closed now — try a later tick today
      try {
        // Cheap lane (COST_MODEL §6: "scheduled checks FIRST" — subscription volume): recipe nav +
        // billed agent only on human. Flag off = the original direct dial, unchanged.
        const place = pol.flags.cheapBridgeAll ? bridgeCheckCall : triggerCall;
        await place({ retailerId: r.retailerId, categoryId: r.categoryId, mode: "restock", specificProduct: r.specificProduct ?? undefined, finderUserId: r.finderUserId, isPrivate: !comp && subbed && pol.finds.subscriberPrivateAlways });
        if (!comp) await chargeOneCredit(r.finderUserId);
        // Ensure they get the alert when it lands (reuse the watch path; idempotent-ish).
        if (r.contact) {
          const ch = r.contact.includes("@") ? "email" : "sms";
          const existing = (await db.select().from(watches).where(and(eq(watches.retailerId, r.retailerId), eq(watches.categoryId, r.categoryId), eq(watches.contact, r.contact))))[0];
          if (!existing) await db.insert(watches).values({ contact: r.contact, channel: ch, retailerId: r.retailerId, categoryId: r.categoryId });
          else if (existing.active === false) await db.update(watches).set({ active: true, notifiedAt: null }).where(eq(watches.id, existing.id));
        }
        await db.update(customerSchedules).set({ lastRunDay: date }).where(eq(customerSchedules.id, r.id));
        fired++;
      } catch (e) { console.error("customer schedule fire:", e); }
    }
  } catch (e) { console.error("customerScheduleTick:", e); } finally { running = false; }
  return fired;
}

/** Hydrate a schedule with store/category labels for the consumer list. */
export async function listSchedulesDetailed(finderUserId: string) {
  const rows = await listSchedules(finderUserId);
  const stores = new Map((await db.select().from(retailers)).map((x) => [x.id, x.name]));
  const cats = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
  return rows.map((r) => ({
    id: r.id, retailerId: r.retailerId, categoryId: r.categoryId,
    store: (stores.get(r.retailerId) || "A store").split("—")[0].trim(),
    category: cats.get(r.categoryId) || "cards",
    specificProduct: r.specificProduct, daysOfWeek: r.daysOfWeek, timeLocal: r.timeLocal,
    active: r.active, lastRunDay: r.lastRunDay,
  }));
}

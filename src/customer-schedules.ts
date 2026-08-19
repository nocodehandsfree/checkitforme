// Subscriber auto-checks: stand-up a recurring "call this store on shipment days and alert me when it
// lands" without touching the admin broadcast scheduler. Reuses the call engine (one credit per fire)
// and the watch alert path. Premium + gated by policy.flags.scheduling and an active membership.
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { accounts, customerSchedules, customerScheduleSkips, retailers, categories } from "./db/schema";
import { bridgeCheckCall, triggerCall, storeOpenInfo } from "./calls/service";
import { autoCheckPaused, MENU_CHANGED } from "./calls/healing";
import { getAccount, chargeOneCredit, isCompAccount, spendableCredits } from "./billing";
import { getPolicy } from "./policy";
import { sendConfirmEmail } from "./alerts";

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
  const contact = s.contact?.trim() || null;
  const [row] = await db.insert(customerSchedules).values({
    finderUserId, retailerId: Number(s.retailerId), categoryId: Number(s.categoryId),
    specificProduct: s.specificProduct?.trim() || null,
    daysOfWeek: [...new Set(String(s.daysOfWeek || "").split(",").map((x) => x.trim()).filter((x) => /^[0-6]$/.test(x)))].sort().join(",") || null,
    timeLocal: (s.timeLocal || "10:00").trim(),
    contact,
  }).returning();
  // An email contact rides the account address (one confirmed email per account): adopt it when the
  // account has none, and ask them to confirm — results emails won't flow until they tap the link.
  if (contact && contact.includes("@")) {
    const e = contact.toLowerCase();
    const acct = await getAccount(finderUserId).catch(() => null);
    if (acct && !acct.email) {
      await db.update(accounts).set({ email: e }).where(eq(accounts.clerkUserId, finderUserId));
      try { await sendConfirmEmail(finderUserId, e); } catch { /* never block the schedule */ }
    } else if (acct?.email && !acct.emailVerifiedAt) {
      try { await sendConfirmEmail(finderUserId, acct.email); } catch { /* nudge the pending confirm */ }
    }
  }
  return row;
}
export async function listSchedules(finderUserId: string) {
  return db.select().from(customerSchedules).where(eq(customerSchedules.finderUserId, finderUserId));
}
export async function deleteSchedule(finderUserId: string, id: number) {
  await db.delete(customerSchedules).where(and(eq(customerSchedules.id, id), eq(customerSchedules.finderUserId, finderUserId)));
  return { ok: true };
}

/** Turn one auto-check off/on, or move it to different days or a different time (owner 2026-08-19:
 *  "you should be able to edit an auto check switch to a different day or time"). Only the fields
 *  sent are touched, and only rows this account owns. */
export async function updateSchedule(
  finderUserId: string,
  id: number,
  patch: { active?: boolean; daysOfWeek?: string; timeLocal?: string },
) {
  const set: Partial<{ active: boolean; daysOfWeek: string | null; timeLocal: string }> = {};
  if (patch.active !== undefined) set.active = !!patch.active;
  // Kept in week order, so "Tue, Fri" never reads "Fri, Tue" because of the order they were tapped.
  if (patch.daysOfWeek !== undefined) set.daysOfWeek = [...new Set(String(patch.daysOfWeek || "").split(",").map((x) => x.trim()).filter((x) => /^[0-6]$/.test(x)))].sort().join(",") || null;
  if (patch.timeLocal !== undefined) set.timeLocal = /^\d{2}:\d{2}$/.test(String(patch.timeLocal || "").trim()) ? String(patch.timeLocal).trim() : "10:00";
  if (!Object.keys(set).length) return { ok: true };
  await db.update(customerSchedules).set(set).where(and(eq(customerSchedules.id, id), eq(customerSchedules.finderUserId, finderUserId)));
  return { ok: true };
}
/** The master "Pause all" switch on the Auto-checks list: every auto-check this account holds stands
 *  down until it is cleared, and each row keeps its own on/off underneath. */
export async function pauseAllSchedules(finderUserId: string, paused: boolean) {
  await db.update(accounts).set({ autoChecksPausedAt: paused ? Math.floor(Date.now() / 1000) : null }).where(eq(accounts.clerkUserId, finderUserId));
  return { ok: true, paused: !!paused };
}
/** Write the day an auto-check could not run, once per store-local day (the tick runs every minute). */
async function noteSkip(r: { id: number; finderUserId: string; retailerId: number }, day: string, reason: string, detail?: string | null) {
  try {
    await db.insert(customerScheduleSkips)
      .values({ scheduleId: r.id, finderUserId: r.finderUserId, retailerId: r.retailerId, day, reason, detail: detail || null })
      .onConflictDoNothing();
  } catch { /* the record is best effort; it can never stop the next auto-check */ }
}
/** Every day this auto-check could not run, newest first, for the customer's own record of it. */
export async function listScheduleSkips(finderUserId: string, scheduleId: number) {
  return db.select().from(customerScheduleSkips)
    .where(and(eq(customerScheduleSkips.finderUserId, finderUserId), eq(customerScheduleSkips.scheduleId, scheduleId)));
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
      // Master "Pause all" on the Auto-checks list: the customer stood every one of them down on
      // purpose, so the day is not a fault and gets no record.
      if (acct?.autoChecksPausedAt) continue;
      // Comp by EMAIL OR PHONE, the same test the save endpoint uses (isCompAccount). Reading the
      // email alone meant a phone-first comp account could turn an auto-check on and then have every
      // single day written off as "out of checks" (found on the rig, 08-19).
      const comp = isCompAccount(acct);
      const subbed = acct?.subscription === "active";
      if (!comp && (!subbed || !acct || spendableCredits(acct) <= 0)) { await noteSkip(r, date, "no_checks"); continue; }
      const gate = await storeOpenInfo(r.retailerId);
      if (gate && gate.known && !gate.open) continue;             // closed now — try a later tick today
      // THE STORE HAS TAKEN ITSELF OFF THE WEBSITE. Their standing check cannot run, nobody is
      // charged, and the moment that says so fires with who, which store and why. The email and the
      // words a customer reads are another agent's — nothing is written or sent from here.
      if (store.muted) {
        autoCheckPaused({ finderUserId: r.finderUserId, retailerId: r.retailerId, storeName: store.name, reason: store.mutedReason || MENU_CHANGED });
        await noteSkip(r, date, "store_off", store.mutedReason || MENU_CHANGED);
        continue;
      }
      try {
        // Cheap lane (COST_MODEL §6: "scheduled checks FIRST" — subscription volume): recipe nav +
        // billed agent only on human. Flag off = the original direct dial, unchanged.
        const place = pol.flags.cheapBridgeAll ? bridgeCheckCall : triggerCall;
        // customerScheduleId rides the call → its terminal state fires the auto-check RESULTS alert
        // (every outcome, in or out) — this replaced the old watch-row hack that only pinged on in-stock.
        await place({ retailerId: r.retailerId, categoryId: r.categoryId, mode: "restock", specificProduct: r.specificProduct ?? undefined, finderUserId: r.finderUserId, customerScheduleId: r.id, isPrivate: !comp && subbed && pol.finds.subscriberPrivateAlways });
        if (!comp) await chargeOneCredit(r.finderUserId);
        await db.update(customerSchedules).set({ lastRunDay: date }).where(eq(customerSchedules.id, r.id));
        // It ran after all (they topped up, the store came back): the day's "could not run" note goes.
        try { await db.delete(customerScheduleSkips).where(and(eq(customerScheduleSkips.scheduleId, r.id), eq(customerScheduleSkips.day, date))); } catch { /* the check itself is the record */ }
        fired++;
      } catch (e) { console.error("customer schedule fire:", e); }
    }
  } catch (e) { console.error("customerScheduleTick:", e); } finally { running = false; }
  return fired;
}

/** The next weekday this auto-check is due (0=Sun), or null when nothing is due (off, paused, or no
 *  days set and the store has no known shipment day). Weekday only: the list says "Next check ·
 *  Tuesday", so no calendar maths crosses a timezone. */
function nextDueDow(
  r: { daysOfWeek: string | null; timeLocal: string; active: boolean; lastRunDay: string | null },
  store: { timezone: string | null; shipmentDay: string | null } | undefined,
  paused: boolean,
): { dow: number; today: boolean } | null {
  if (!r.active || paused || !store) return null;
  const { dow, hhmm, date } = localParts(store.timezone || "America/Chicago");
  for (let i = 0; i < 8; i++) {
    const d = (dow + i) % 7;
    if (!dayMatches(r.daysOfWeek, store.shipmentDay, d)) continue;
    if (i === 0) {
      if (r.lastRunDay === date || hhmm >= (r.timeLocal || "10:00")) continue; // today is spent
      return { dow: d, today: true };
    }
    return { dow: d, today: false };
  }
  return null;
}

/** Hydrate a schedule with store/category labels for the consumer list. */
export async function listSchedulesDetailed(finderUserId: string) {
  const rows = await listSchedules(finderUserId);
  const stores = new Map((await db.select().from(retailers)).map((x) => [x.id, x]));
  const cats = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
  const acct = await getAccount(finderUserId).catch(() => null);
  const paused = !!acct?.autoChecksPausedAt;
  return rows.map((r) => {
    const st = stores.get(r.retailerId);
    const next = nextDueDow(r, st, paused);
    return {
      id: r.id, retailerId: r.retailerId, categoryId: r.categoryId,
      store: (st?.name || "A store").split("—")[0].trim(),
      storeFull: st?.name || "A store",
      storeLocation: st?.location || null,
      category: cats.get(r.categoryId) || "cards",
      specificProduct: r.specificProduct, daysOfWeek: r.daysOfWeek, timeLocal: r.timeLocal,
      active: r.active, lastRunDay: r.lastRunDay,
      paused, nextDow: next ? next.dow : null, nextToday: !!(next && next.today),
    };
  });
}

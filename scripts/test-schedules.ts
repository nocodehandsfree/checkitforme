// Unit test for the subscriber auto-check engine. Exercises CRUD + the two tick branches that never
// place a real call (gated-off, and not-due-today). Run: ./node_modules/.bin/tsx scripts/test-schedules.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { retailers, categories } from "../src/db/schema";
import { createSchedule, listSchedulesDetailed, deleteSchedule, customerScheduleTick } from "../src/customer-schedules";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  const cat = (await db.select().from(categories))[0];
  const [store] = await db.insert(retailers).values({
    name: "Sched Test — Austin", phone: "+15125559999", location: "Austin, TX",
    timezone: "America/Chicago", state: "TX", shipmentDay: "Thursday",
  }).returning();

  console.log("▶ create + list");
  // Pick a day that is NOT today (store-local) so the tick can never fire a real call here.
  const todayDow = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" })
    .formatToParts(new Date()).find((p) => p.type === "weekday")?.value
    ? ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[
        new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(new Date())]
    : 0);
  const notToday = String((todayDow + 3) % 7);
  const row = await createSchedule("user_test_1", { retailerId: store.id, categoryId: cat.id, daysOfWeek: notToday, timeLocal: "00:01" });
  ok(!!row?.id, "schedule created");
  const list = await listSchedulesDetailed("user_test_1");
  ok(list.length === 1, "one schedule listed for the user");
  ok(list[0].store === "Sched Test" && list[0].category === cat.label, "list is hydrated with store + category labels");
  ok((await listSchedulesDetailed("user_other")).length === 0, "schedules are scoped per user");

  console.log("▶ tick gating");
  await setPolicy({ flags: { scheduling: false } } as never);
  ok((await customerScheduleTick()) === 0, "tick fires nothing when flags.scheduling is OFF");
  await setPolicy({ flags: { scheduling: true } } as never);
  ok((await customerScheduleTick()) === 0, "tick fires nothing when today is not a scheduled day (no real call placed)");

  console.log("▶ delete");
  await deleteSchedule("user_test_1", row.id);
  ok((await listSchedulesDetailed("user_test_1")).length === 0, "schedule deleted");
  // Cleanup the test store.
  const { eq } = await import("drizzle-orm");
  await db.delete(retailers).where(eq(retailers.id, store.id));

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

// Unit test for the subscriber auto-check engine. Exercises CRUD + the two tick branches that never
// place a real call (gated-off, and not-due-today). Run: ./node_modules/.bin/tsx scripts/test-schedules.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { retailers, categories } from "../src/db/schema";
import { createSchedule, listSchedulesDetailed, deleteSchedule, updateSchedule, pauseAllSchedules, listScheduleSkips, customerScheduleTick } from "../src/customer-schedules";
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

  console.log("▶ edit (owner 08-19: switch to a different day or time)");
  await updateSchedule("user_test_1", row.id, { daysOfWeek: "5,2", timeLocal: "08:30" });
  let one = (await listSchedulesDetailed("user_test_1"))[0];
  ok(one.daysOfWeek === "2,5", "days are saved in week order, not the order they were tapped");
  ok(one.timeLocal === "08:30", "the time moved");
  await updateSchedule("user_other", row.id, { timeLocal: "23:00" });
  one = (await listSchedulesDetailed("user_test_1"))[0];
  ok(one.timeLocal === "08:30", "another account cannot edit this auto-check");
  await updateSchedule("user_test_1", row.id, { active: false });
  one = (await listSchedulesDetailed("user_test_1"))[0];
  ok(one.active === false, "the row switch turns one auto-check off");
  ok(one.nextDow === null, "an auto-check that is off has no next check");
  await updateSchedule("user_test_1", row.id, { active: true, daysOfWeek: notToday, timeLocal: "00:01" });

  console.log("▶ pause all");
  await pauseAllSchedules("user_test_1", true);
  one = (await listSchedulesDetailed("user_test_1"))[0];
  ok(one.paused === true && one.nextDow === null, "pause all stands every auto-check down");
  ok((await customerScheduleTick()) === 0, "a paused account fires nothing");
  ok((await listScheduleSkips("user_test_1", row.id)).length === 0, "a pause the customer chose is not written down as a fault");
  await pauseAllSchedules("user_test_1", false);
  ok((await listSchedulesDetailed("user_test_1"))[0].paused === false, "pause all lifts again");

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

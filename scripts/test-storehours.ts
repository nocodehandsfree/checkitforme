// Unit test for openState() — the live open/closed badge. Run: ./node_modules/.bin/tsx scripts/test-storehours.ts
// Deterministic: we pin tz="UTC" and pass an explicit `at` instant, so "now" never depends on the wall clock.
import { openState, type Hours } from "../src/store-hours";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const J = (h: Partial<Hours>) => JSON.stringify(h);
// Build a week where every day shares the same hours, so "today" is the same regardless of weekday.
const everyDay = (v: Hours["mon"]): Hours => ({ mon: v, tue: v, wed: v, thu: v, fri: v, sat: v, sun: v });
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const weekdayKey = (d: Date, off = 0) => {
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .indexOf(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d));
  return DOW[(idx + off + 7) % 7];
};

console.log("▶ unknown / malformed hours → 'known:false' and fail-open");
ok(openState(null, "UTC").known === false && openState(null, "UTC").open === true, "null hours → unknown + open (fail-open gate)");
ok(openState("not json", "UTC").known === false, "garbage JSON → unknown");
ok(openState("123", "UTC").known === false, "non-object JSON → unknown");
ok(openState(J(everyDay(null)), "UTC").known === true, "explicit all-closed week is still 'known'");

console.log("▶ standard 9-to-9 day");
const day = J(everyDay(["09:00", "21:00"]));
const mid = new Date("2026-06-29T14:30:00Z");   // 14:30 UTC
const early = new Date("2026-06-29T07:00:00Z");  // 07:00 UTC
const late = new Date("2026-06-29T22:00:00Z");   // 22:00 UTC
ok(openState(day, "UTC", mid).open === true, "14:30 is inside 9–21 → open");
ok(openState(day, "UTC", mid).label === "till 9 PM", "open label names the close time");
ok(openState(day, "UTC", early).open === false && openState(day, "UTC", early).label === "Closed · opens 9 AM", "before open → 'opens 9 AM'");
ok(openState(day, "UTC", late).open === false && openState(day, "UTC", late).label === "Closed", "after close → 'Closed'");

console.log("▶ 24h");
const all = openState(J(everyDay("24h")), "UTC", mid);
ok(all.open === true && all.label === "24h", "24h day is always open");

console.log("▶ hours that cross midnight (18:00 → 02:00)");
const owl = J(everyDay(["18:00", "02:00"]));
ok(openState(owl, "UTC", new Date("2026-06-29T20:00:00Z")).open === true, "20:00 (after open, before midnight) → open");
ok(openState(owl, "UTC", new Date("2026-06-29T20:00:00Z")).label === "till 2 AM", "crossing-midnight open names the 2 AM close");
ok(openState(owl, "UTC", new Date("2026-06-29T01:00:00Z")).open === true, "01:00 → still open via yesterday's spillover");
ok(openState(owl, "UTC", new Date("2026-06-29T03:00:00Z")).open === false, "03:00 (after 2 AM close, before 6 PM open) → closed");

console.log("▶ closed today → points at the next open day");
const at = new Date("2026-06-29T12:00:00Z");
const closedTodayOpenTomorrow: Hours = everyDay(null);
closedTodayOpenTomorrow[weekdayKey(at, 1)] = ["10:00", "18:00"]; // tomorrow opens
const s = openState(J(closedTodayOpenTomorrow), "UTC", at);
ok(s.open === false && s.known === true, "today closed → known + closed");
ok(s.label === "Closed · opens 10 AM tomorrow", "labels the next opening as 'tomorrow'");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

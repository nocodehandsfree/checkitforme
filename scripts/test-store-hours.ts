// Unit test for openState() — the "is this store open now" logic, incl. the 2 AM-bug fix
// (unknown/missing hours read as CLOSED in the deep-overnight window, open/unknown by day).
// Pure (no DB/network). Run: ./node_modules/.bin/tsx scripts/test-store-hours.ts
import { openState } from "../src/store-hours";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const TZ = "America/Chicago"; // CDT (UTC-5) in June → local = UTC-5
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const uni = (v: unknown) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, v]))); // same hours every day

// Fixed instants, expressed as the UTC moment for a given Chicago local clock time.
const at2am = new Date("2026-06-17T07:00:00Z");    // 02:00 local
const at2pm = new Date("2026-06-17T19:00:00Z");    // 14:00 local
const at1230am = new Date("2026-06-17T05:30:00Z"); // 00:30 local
const at1am = new Date("2026-06-17T06:00:00Z");    // 01:00 local (window start, inclusive)
const at6am = new Date("2026-06-17T11:00:00Z");    // 06:00 local (window end, exclusive)

console.log("▶ known hours still work (regression guard)");
let s = openState(uni(["09:00", "18:00"]), TZ, at2pm);
ok(s.known && s.open && s.label.startsWith("till"), "9–6 store at 2 PM → open, label names the close time");
s = openState(uni(["09:00", "18:00"]), TZ, at2am);
ok(s.known && !s.open && s.label.startsWith("Closed"), "9–6 store at 2 AM → Closed (before open)");
ok(openState(uni("24h"), TZ, at2am).open === true, "real 24h store at 2 AM → still Open 24h");
ok(openState(uni(["10:00", "01:00"]), TZ, at1230am).open === true, "crosses-midnight store at 12:30 AM → Open (spillover)");
s = openState(uni(null), TZ, at2pm);
ok(s.known && !s.open, "all-days-closed store → Closed even at 2 PM");

console.log("▶ THE 2 AM FIX: unknown/missing hours");
s = openState(null, TZ, at2am);
ok(s.known === true && s.open === false && /closed/i.test(s.label), "no hours at 2 AM → Likely closed (was: open)");
s = openState(null, TZ, at2pm);
ok(s.known === false && s.open === true && s.label === "", "no hours at 2 PM → open/unknown (daytime unchanged)");
ok(openState("", TZ, at2am).open === false, "empty-string hours at 2 AM → closed");
ok(openState("not valid json {", TZ, at2am).open === false, "unparseable hours at 2 AM → closed");
ok(openState(undefined, TZ, at2pm).open === true, "undefined hours at 2 PM → open/unknown");

console.log("▶ overnight window boundaries (01:00 inclusive … 06:00 exclusive)");
ok(openState(null, TZ, at1am).open === false, "no hours at 1:00 AM → closed (window start)");
ok(openState(null, TZ, at6am).open === true, "no hours at 6:00 AM → open/unknown (window end)");

console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

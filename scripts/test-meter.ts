// THE METER HALF OF THE CARD, unit-tested with no app and no database (src/calls/meter.ts).
//
// Run: ./node_modules/.bin/tsx scripts/test-meter.ts
//
// Every assertion is one line of the contract in docs/specs/self-improving-charlie/README.md
// ("How we will know it works"): a check where Charlie talks past 23 fails its test by name, a
// check under the 67% floor fails the same way on the cards the owner has not exempted, the
// 08-16 shape (43 seconds of meter, 9 waiting, every behavior row green) reads FAIL, and an old
// check that never measured a number is not graded on it — nothing is invented.
import { meterVerdict, METER_GOAL_SEC, METER_YELLOW_MAX_SEC, PROFIT_FLOOR_PCT } from "../src/calls/meter";
import { TEST_CARDS } from "../src/calls/behaved";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, saw?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};
const head = (s: string) => console.log(`\n${s}`);

const clearYes = TEST_CARDS.answer_clear_yes;
const runaround = TEST_CARDS.hungup_limit;

head("The owner's numbers are the locked ones (his color rule 08-16: green to 23, yellow to 30, red at 31)");
ok("the meter goal is 23", METER_GOAL_SEC === 23, METER_GOAL_SEC);
ok("the yellow band ends at 30", METER_YELLOW_MAX_SEC === 30, METER_YELLOW_MAX_SEC);
ok("the profit floor is 67", PROFIT_FLOOR_PCT === 67, PROFIT_FLOOR_PCT);

head("A thrifty check passes both halves");
{
  const v = meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71 })!;
  ok("passes", v.pass === true, v);
  ok("no fail sentences", v.fails.length === 0, v.fails);
  ok("the To pass line names both numbers", v.toPass.length === 2, v.toPass);
}

head("24 to 30 is yellow, STILL ACCEPTABLE (owner's color rule): it passes and says it is over the goal");
{
  const v = meterVerdict(clearYes, { meterSec: 27, speakingSec: 20, listeningSec: 4, profitPct: 70 })!;
  ok("passes inside the yellow band", v.pass === true, v);
  ok("the row says over the goal, inside the yellow", /over the 23s goal.*yellow 30s/.test(v.rows[0]?.value || ""), v.rows);
}

head("31 or higher is red: the test fails by itself");
{
  const v = meterVerdict(clearYes, { meterSec: 31, speakingSec: 24, listeningSec: 4, profitPct: 70 })!;
  ok("fails", v.pass === false);
  ok("the sentence names the yellow line and the goal", /31 seconds.*yellow line of 30.*23 second goal/.test(v.fails[0] || ""), v.fails);
}

head("Profit under the 67% floor fails the test by itself");
{
  const v = meterVerdict(clearYes, { meterSec: 20, profitPct: 58 })!;
  ok("fails", v.pass === false);
  ok("the sentence names the percent and the floor", /58%.*67% floor/.test(v.fails[0] || ""), v.fails);
}

head("THE 08-16 SHAPE: 43s of meter, 9 waiting, every behavior row green — the card must fail now");
{
  const v = meterVerdict(clearYes, { meterSec: 43, speakingSec: 22, listeningSec: 12, profitPct: 33 })!;
  ok("fails with no human looking", v.pass === false);
  ok("both numbers are named", v.fails.length === 2, v.fails);
  ok("the waiting slice is on the record", v.rows.some((r) => r.label.includes("waiting") && r.value === "9s"), v.rows);
  ok("waiting is shown, not graded alone yet (spec decision 2 is the owner's)", v.rows.find((r) => r.label.includes("waiting"))!.pass === null);
}

head("A clock-burning card is exempt from the floor, never from the meter cap");
{
  ok("the runaround card carries the exemption", runaround.meter?.profitFloorPct === null, runaround.meter);
  const v = meterVerdict(runaround, { meterSec: 8, profitPct: -40 })!;
  ok("deep negative profit does not fail it", v.pass === true, v);
  ok("profit is shown without a floor", v.rows.some((r) => r.label === "Gross profit" && r.pass === null), v.rows);
  const over = meterVerdict(runaround, { meterSec: 31, profitPct: -40 })!;
  ok("the red line still bites on it at 31", over.pass === false, over);
}

head("The exempt set is exactly the spec's proposed list");
{
  const exempt = Object.entries(TEST_CARDS).filter(([, c]) => c.meter?.profitFloorPct === null).map(([k]) => k).sort();
  ok("five cards, the clock burners", JSON.stringify(exempt) === JSON.stringify(
    ["hold_permanently", "hungup_limit", "hungup_ringing", "voicemail_detected", "wrapup_never_answered"].sort()), exempt);
}

head("A number the record never measured is not graded — an old check reads as it always did");
{
  const v = meterVerdict(clearYes, { meterSec: null, profitPct: null })!;
  ok("passes with nothing measured", v.pass === true, v);
  ok("no rows are invented", v.rows.length === 0, v.rows);
  const half = meterVerdict(clearYes, { meterSec: 20, profitPct: null })!;
  ok("a priced-less check grades the meter only", half.rows.length === 1 && half.pass === true, half.rows);
}

head("No card, no grade — an ordinary check is never failed by a test it did not run");
ok("null in, null out", meterVerdict(null, { meterSec: 99, profitPct: 0 }) === null);


head("THE NAMED GAPS (owner box 08-16 late): every metered second belongs to somebody by name");
{
  const v = meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71,
    answerGapWorstSec: 2, handoverGapWorstSec: 1, dropGapWorstSec: 3 })!;
  ok("all three gaps at their green numbers pass", v.pass === true, v.fails);
  ok("each gap is its own named row", v.rows.filter((r) => /gap/.test(r.label)).length === 3, v.rows);
  ok("green gaps wear green", v.rows.filter((r) => /gap/.test(r.label)).every((r) => r.tone === "g"), v.rows);
}
{
  const v = meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71,
    answerGapWorstSec: 8 })!;
  ok("an 8 second answer gap is red and FAILS the test (red at 7 plus)", v.pass === false, v);
  ok("…and the pill's short words name it", v.shortFails.some((f) => /answer gap/.test(f)), v.shortFails);
}
{
  const v = meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71,
    answerGapWorstSec: 5 })!;
  ok("a 5 second answer gap is yellow and still passes", v.pass === true && v.rows.some((r) => /answer gap/.test(r.label) && r.tone === "y"), v.rows);
}
{
  const v = meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71 })!;
  ok("a gap the check never exercised has NO row (a row exists only if a working check could hide it)",
    v.rows.every((r) => !/gap/.test(r.label)), v.rows);
}
{
  const v = meterVerdict(clearYes, { meterSec: 44, speakingSec: 9, listeningSec: 8, profitPct: 48 })!;
  ok("check 371's own numbers fail", v.pass === false, v);
  ok("…and the pill's words are the owner's shape: Charlie meter time, 44 seconds",
    v.shortFails.includes("Charlie meter time, 44 seconds"), v.shortFails);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

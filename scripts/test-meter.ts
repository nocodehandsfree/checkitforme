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

head("THE SET-ASIDE IS GONE (owner, 08-17 evening): a check is graded on what it really made");
{
  const holdCard = TEST_CARDS.hold_silence;
  ok("no card carries a set-aside of any kind any more",
    [TEST_CARDS.hold_silence, TEST_CARDS.hold_music, TEST_CARDS.hold_phone_down]
      .every((c) => !(c.meter && Object.prototype.hasOwnProperty.call(c.meter, "holdCostAside"))));
  // Check 373's own numbers on an ordinary card: 60 percent real, under the 67 floor, and that is
  // the whole grade. No second number is invented anywhere on the row.
  const v = meterVerdict(clearYes, { meterSec: 29, speakingSec: 9, listeningSec: 7, profitPct: 60 })!;
  const profitRow = v.rows.find((r) => r.label === "Gross profit")!;
  ok("373's shape fails on what the check really made", profitRow.pass === false && v.pass === false, v.rows);
  ok("the row shows the real number and only that", profitRow.value === "60% against the 67% floor", profitRow);
  ok("the spoken sentence says the real number", profitRow.say?.num === "60%", profitRow.say);
  ok("no set-aside is named or hinted at anywhere on the row",
    ![profitRow.value, profitRow.say?.num ?? "", profitRow.say?.tail ?? "", profitRow.open ?? ""].some((t) => /set aside/i.test(t)), profitRow);
  ok("the To pass line asks for the plain floor", v.toPass.some((t) => t === "gross profit 67% or better")
    && !v.toPass.some((t) => /set aside/i.test(t)), v.toPass);
  ok("the failing sentence names the plain floor too",
    /made 60% gross profit against the 67% floor\./.test(v.fails.join(" ")) && !/set aside/i.test(v.fails.join(" ")), v.fails);
  const over = meterVerdict(holdCard, { meterSec: 20, profitPct: 70 })!;
  ok("a hold test over its own floor passes on the real number", over.pass === true, over.fails);
}

head("THE HOLD TESTS HAVE THEIR OWN FLOOR, AND NOTHING ELSE ABOUT THEM IS SOFTER (owner, 08-17 late)");
{
  const holds = [TEST_CARDS.hold_silence, TEST_CARDS.hold_music, TEST_CARDS.hold_phone_down];
  ok("the three come-back hold cards grade profit against 56", holds.every((c) => c.meter?.profitFloorPct === 56));
  ok("every other card keeps the 67 floor", TEST_CARDS.answer_clear_yes.meter?.profitFloorPct === undefined
    && TEST_CARDS.answer_clear_no.meter?.profitFloorPct === undefined);
  // 11 cents on a 25 cent check is 56 percent, which is the goal on a hold test.
  const good = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 22, speakingSec: 9, listeningSec: 7, profitPct: 56,
    answerGapWorstSec: 2, handoverGapWorstSec: 1, dropGapWorstSec: 0 })!;
  ok("a clean hold check at 56 percent passes", good.pass === true, good.fails);
  const profitRow = good.rows.find((r) => r.label === "Gross profit")!;
  ok("the row says it is graded against 56", profitRow.value === "56% against the 56% floor", profitRow.value);
  ok("tapping it opens the reason the floor is its own, in plain words with no percent",
    /second billed minute/.test(profitRow.open ?? "") && /11 cents on a 25 cent check/.test(profitRow.open ?? ""), profitRow.open);
  ok("the To pass line asks for 56 on a hold test", good.toPass.some((t) => t === "gross profit 56% or better"), good.toPass);
  const under = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 22, profitPct: 55 })!;
  ok("a hold check under 56 still fails", under.pass === false && under.shortFails.some((t) => /profit 55% under the 56% floor/.test(t)), under.shortFails);
  const plainCard = meterVerdict(TEST_CARDS.answer_clear_yes, { meterSec: 22, profitPct: 60 })!;
  ok("a check that is not a hold test still needs 67", plainCard.pass === false, plainCard.fails);
  ok("…and its profit row never mentions a second billed minute",
    !/second billed minute/.test(plainCard.rows.find((r) => r.label === "Gross profit")!.open ?? ""));
}

head("NO FALSE GREEN: the moved floor never hides waste (the owner's own worry, 08-17 late)");
{
  // Profit fine at 60, over the hold floor of 56 — and Charlie burned 35 seconds. It fails.
  const fat = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 35, speakingSec: 9, listeningSec: 8, profitPct: 60 })!;
  ok("a hold check over the floor still FAILS on Charlie's meter", fat.pass === false
    && fat.shortFails.some((t) => /Charlie meter time, 35 seconds/.test(t)), fat.shortFails);
  const yellow = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 30, profitPct: 60 })!;
  ok("30 seconds is still yellow and still passes, exactly as everywhere else", yellow.pass === true, yellow.fails);
  const red = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 31, profitPct: 60 })!;
  ok("31 seconds is still red and still fails, exactly as everywhere else", red.pass === false, red.fails);
  // Every gap row is as strict on a hold test as anywhere else.
  const slow = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 20, profitPct: 60, answerGapWorstSec: 7 })!;
  ok("a slow answer on a hold test still fails", slow.pass === false && slow.shortFails.some((t) => /answer gap/.test(t)), slow.shortFails);
  const slowHand = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 20, profitPct: 60, handoverGapWorstSec: 4 })!;
  ok("a slow handover on a hold test still fails", slowHand.pass === false, slowHand.fails);
  const slowDrop = meterVerdict(TEST_CARDS.hold_silence, { meterSec: 20, profitPct: 60, dropGapWorstSec: 6 })!;
  ok("a late drop on a hold test still fails", slowDrop.pass === false, slowDrop.fails);
}

head("THE ROW WORDS ARE THE OWNER'S OWN SENTENCES (08-17), numbers filled in from the check");
{
  const v = meterVerdict(clearYes, { meterSec: 28, speakingSec: 14, listeningSec: 8, profitPct: 61,
    answerGapWorstSec: 5, handoverGapWorstSec: 1, dropGapWorstSec: 3 })!;
  const said = (r: { say?: { pre: string; num: string; post: string; tail?: string } } | undefined) =>
    r?.say ? `${r.say.pre}${r.say.num}${r.say.post}${r.say.tail ? ` ${r.say.tail}` : ""}` : "";
  const byLabel = (l: string) => v.rows.find((r) => r.label.includes(l));
  ok("the top line is his: Charlie was on the clock 28 seconds. The goal is 23.",
    said(byLabel("Charlie on the meter")) === "Charlie was on the clock 28 seconds. The goal is 23.", said(byLabel("Charlie on the meter")));
  ok("the waiting row is his: 6 seconds of that was waiting.",
    said(byLabel("waiting")) === "6 seconds of that was waiting.", said(byLabel("waiting")));
  ok("the Echo row is his: Echo handed Charlie the words in 1 second.",
    said(byLabel("handover")) === "Echo handed Charlie the words in 1 second.", said(byLabel("handover")));
  ok("the drop row is his: Charlie's meter went off 3 seconds after Staff said hold on.",
    said(byLabel("drop")) === "Charlie's meter went off 3 seconds after Staff said hold on.", said(byLabel("drop")));
  ok("the profit row is his: This check made 61%. The floor is 67.",
    said(byLabel("Gross profit")) === "This check made 61%. The floor is 67.", said(byLabel("Gross profit")));
  // The color does the grading: a sentence never mentions goals as colors, bands, or "green at",
  // and tapping a row opens plain sentences about THIS call, never the rulebook.
  const everything = v.rows.map((r) => `${said(r)} ${r.open || ""}`).join(" ");
  ok("no sentence speaks the rulebook", !/green|yellow|red|band/i.test(everything), everything);
  ok("every row opens to plain sentences about this call", v.rows.every((r) => !!r.open));
  ok("one second is singular, never 1 seconds", !/\b1 seconds\b/.test(everything));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

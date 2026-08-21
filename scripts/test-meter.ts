// THE METER HALF OF THE CARD, unit-tested with no app and no database (src/calls/meter.ts).
//
// Run: ./node_modules/.bin/tsx scripts/test-meter.ts
//
// Every assertion is one line of the contract in docs/specs/self-improving-charlie/README.md
// ("How we will know it works"): a check where Charlie talks past 23 fails its test by name, a
// check under the 67% floor fails the same way on the cards the owner has not exempted, the
// 08-16 shape (43 seconds of meter, 9 waiting, every behavior row green) reads FAIL, and an old
// check that never measured a number is not graded on it — nothing is invented.
import { meterVerdict, advertAsWait, spokeOverTheRecording, METER_GOAL_SEC, METER_YELLOW_MAX_SEC, PROFIT_FLOOR_PCT } from "../src/calls/meter";
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

// THE ADVERT RULING (owner, 08-19): when the after-call reader proved a Staff line was really a
// recording the store played, the GRADE treats that stretch as a wait — as if the hold had been
// recognized when the store's recording started. The shapes below are CHECK 398 and CHECK 400 as
// their real records read them (scene 22, the advert inside the hold music): the strict numbers
// off staging, not invented ones.
const ADVERT_LINE = "Thanks for holding. Did you know we price match any local competitor? Ask an associate about our rewards program, and start earning points on every purchase tod";
const playedStep = { kind: "unknown", atMs: 55241, detail: { step: "played_at_us", lines: [{ line: ADVERT_LINE, why: "advertising store offers and programs", announcesWait: false }] } };
const check398 = {
  timeline: [
    { kind: "unknown", atMs: 11, detail: { step: "named_test", card: "hold_music" } },
    { kind: "charlie_join", atMs: 9108, detail: null },
    { kind: "unknown", atMs: 10175, detail: { step: "music_heard" } },
    { kind: "charlie_leave", atMs: 54985, detail: null },
    playedStep,
  ],
  lines: [
    { who: "Clerk", text: "Larry Vásquez. How can I help you?", atMs: 1992, endMs: 4622 },
    { who: "Agent", text: "Heyy, was wondering if you guys have any Pokémon cards in right now?", atMs: 5716, endMs: 9571 },
    { who: "Clerk", text: "One moment. I'll go and have a look.", atMs: 7642, endMs: 11952 },
    { who: "Agent", text: "No worries, take your time!", atMs: 13122, endMs: 15073 },
    { who: "Clerk", text: ADVERT_LINE + "ay.", atMs: 14972, endMs: 23622 },
    { who: "Clerk", text: "Yeah. We've got a few of those.", atMs: 33332, endMs: 36052 },
    { who: "Agent", text: "Oh nice, do you know the name of the set, like Chaos Rising, and is it a pack or a box?", atMs: 38160, endMs: null },
    { who: "Clerk", text: "Pitch black the booster boxes.", atMs: 45112, endMs: 49262 },
  ],
};

head("CHECK 398'S SHAPE: the as-if window starts at the music's own first note, drops 3s in, ends at Staff's real comeback");
{
  const w = advertAsWait(check398.timeline, check398.lines)!;
  ok("a window was measured", !!w, w);
  ok("the hold starts at the music_heard stamp (10175), not the advert's first word", w.holdFromMs === 10175, w.holdFromMs);
  ok("Charlie's meter would have switched off 3 seconds in (13175)", w.offFromMs === 13175, w.offFromMs);
  ok("the window ends at Staff's real comeback (33332)", w.toMs === 33332, w.toMs);
  ok("the forgiven stretch is 20157ms, all inside his real meter", w.forgivenMs === 20157, w.forgivenMs);
}

head("CHECK 398 GRADED FAIRLY: 46s red on the record grades as 26s and passes; the real number stays printed");
{
  const w = advertAsWait(check398.timeline, check398.lines)!;
  const v = meterVerdict(TEST_CARDS.hold_music, { meterSec: 46, speakingSec: 13, listeningSec: 15, profitPct: 56,
    answerGapWorstSec: 3, advert: { asWaitSec: Math.round(w.forgivenMs / 1000), gradedProfitPct: 70 } })!;
  ok("the sheet passes", v.pass === true, v.fails);
  const meter = v.rows.find((r) => r.label === "Charlie on the meter")!;
  ok("the meter row's color wears the graded 26", meter.say?.num === "26 seconds" && meter.tone === "y", meter.say);
  ok("…and the record's own 46 stays printed beside it", /46/.test(`${meter.value} ${meter.say?.tail}`), meter.value);
  const forgiven = v.rows.find((r) => r.label.includes("recording"))!;
  ok("the forgiveness has its own row naming the 20 seconds", forgiven?.say?.num === "20 seconds", forgiven?.say);
  ok("…which is shown, never graded", forgiven?.pass === null);
  const profit = v.rows.find((r) => r.label === "Gross profit")!;
  ok("the profit row grades the as-if 70 and prints the real 56", profit.pass === true && /56% on the record.*70%/.test(profit.value), profit.value);
}

head("CHECK 400'S SHAPE: music at 13182, advert at 18222, comeback 36612 — 49s red grades as 29s and passes");
{
  const w = advertAsWait(
    [
      { kind: "charlie_join", atMs: 9561, detail: null },
      { kind: "unknown", atMs: 13182, detail: { step: "music_heard" } },
      { kind: "charlie_leave", atMs: 58632, detail: null },
      { kind: "unknown", atMs: 58898, detail: playedStep.detail },
    ],
    [
      { who: "Clerk", text: "One moment. I'll go and have a look.", atMs: 10912, endMs: 15202 },
      { who: "Clerk", text: ADVERT_LINE + "ay.", atMs: 18222, endMs: 26872 },
      { who: "Clerk", text: "Yeah. We've got a few of those.", atMs: 36612, endMs: 39302 },
    ],
  )!;
  ok("the window is [16182, 36612] off the music's first note", w.offFromMs === 16182 && w.toMs === 36612, w);
  ok("the forgiven stretch is 20430ms", w.forgivenMs === 20430, w.forgivenMs);
  const v = meterVerdict(TEST_CARDS.hold_music, { meterSec: 49, speakingSec: 12, listeningSec: 15, profitPct: 53,
    answerGapWorstSec: 4, advert: { asWaitSec: 20, gradedProfitPct: 68 } })!;
  ok("49s red grades as 29s and the sheet passes", v.pass === true, v.fails);
}

head("THE RULING NEVER LEAKS: no proof on the record = every check grades exactly as it always did");
{
  ok("no played_at_us step → no window", advertAsWait(check398.timeline.filter((e) => (e.detail || {}).step !== "played_at_us"), check398.lines) === null);
  ok("no timed lines (an old record) → no window", advertAsWait(check398.timeline, check398.lines.map((l) => ({ ...l, atMs: null }))) === null);
  ok("a judged line the record cannot place → no window", advertAsWait(check398.timeline, check398.lines.filter((l) => !l.text.startsWith("Thanks for holding"))) === null);
  const plain = meterVerdict(clearYes, { meterSec: 46, profitPct: 56 })!;
  ok("without the advert input the same numbers still fail red", plain.pass === false, plain.fails);
}

head("A BARE RECORDED ANNOUNCEMENT (check 376's family): no music stamp, so the recording starts at its own line");
{
  const w = advertAsWait(
    [
      { kind: "charlie_join", atMs: 5000, detail: null },
      { kind: "charlie_leave", atMs: 50000, detail: null },
      { kind: "unknown", atMs: 51000, detail: { step: "played_at_us", lines: [{ line: "Un momento por favor, ya lo atienden", why: "an automated hold message", announcesWait: true }] } },
    ],
    [
      { who: "Clerk", text: "Un momento por favor, ya lo atienden.", atMs: 12000, endMs: 15000 },
      { who: "Clerk", text: "We have them, yes.", atMs: 30000, endMs: 32000 },
    ],
  )!;
  ok("the window starts 3s after the announcement's own start", w.offFromMs === 15000, w.offFromMs);
  ok("…and runs to the real comeback", w.toMs === 30000 && w.forgivenMs === 15000, w);
}

head("A PERSON SPOKE BETWEEN THE MUSIC STAMP AND THE JUDGED LINE: the stamp belongs to an earlier stretch, no pullback");
{
  const w = advertAsWait(
    [
      { kind: "charlie_join", atMs: 1000, detail: null },
      { kind: "unknown", atMs: 5000, detail: { step: "music_heard" } },
      { kind: "charlie_leave", atMs: 60000, detail: null },
      { kind: "unknown", atMs: 61000, detail: { step: "played_at_us", lines: [{ line: "Your call matters to us", why: "hold message", announcesWait: false }] } },
    ],
    [
      { who: "Clerk", text: "Sorry about that, one more minute.", atMs: 10000, endMs: 12000 },
      { who: "Clerk", text: "Your call matters to us.", atMs: 20000, endMs: 24000 },
      { who: "Clerk", text: "Okay I'm back.", atMs: 40000, endMs: 42000 },
    ],
  )!;
  ok("the recording starts at its own line, not the older music stamp", w.holdFromMs === 20000 && w.offFromMs === 23000, w);
}

console.log("\n▶ THE WASTE FAILS THE CHECK (owner's ruling, 08-19 night, widened 08-20): green to 3, yellow to 8, red from 9");
{
  const at = (sec: number) => meterVerdict(clearYes, { meterSec: 19, speakingSec: 12, listeningSec: 5, profitPct: 71, awakeOnHoldSec: sec })!;
  const clean = at(3);
  ok("3 seconds awake on hold is green and passes", clean.pass === true && clean.rows.some((r) => r.label.includes("Awake") && r.tone === "g"), clean.rows.find((r) => r.label.includes("Awake")));
  const yellow = at(5);
  ok("5 seconds is yellow and still passes", yellow.pass === true && yellow.rows.some((r) => r.label.includes("Awake") && r.tone === "y"));
  // HIS OWN NUMBERS, 08-20, ON THE EDGE ITSELF: it passes UP TO 8 and fails FROM 9. The two checks
  // that sat on the old edge were his head start doing what he ordered it to do (415 at 7s, 427 at
  // 7s), so both of those now pass, and a check that really did sit there fails from 9.
  const eight = at(8);
  ok("8 seconds is the last one that passes", eight.pass === true && eight.rows.some((r) => r.label.includes("Awake") && r.tone === "y"), eight.rows.find((r) => r.label.includes("Awake")));
  const seven = at(7);
  ok("…so check 427's own 7 seconds passes where it used to fail", seven.pass === true, seven.shortFails);
  const red = at(9);
  ok("9 seconds is red and FAILS the whole check", red.pass === false, red.fails);
  ok("…and the check says which row failed, in plain words",
    red.fails.some((f) => /awake 9 seconds while the store had us waiting/.test(f)) && red.shortFails.some((f) => /awake on hold, 9 seconds/.test(f)),
    { fails: red.fails, short: red.shortFails });
  ok("…and the words it fails in name his own two numbers, 3 green and red from 9",
    red.fails.some((f) => /against 3 green and red from 9/.test(f)), red.fails);
  ok("…and the row wears the red", red.rows.some((r) => r.label.includes("Awake") && r.tone === "r" && r.pass === false));
  // THE TRUE SECONDS, NEVER AN ADJUSTED NUMBER. The advert ruling forgives seconds elsewhere on the
  // sheet; it may never touch this one, which is the whole point of grading it.
  const withAdvert = meterVerdict(TEST_CARDS.hold_music_advert, { meterSec: 46, speakingSec: 13, listeningSec: 15, profitPct: 56,
    awakeOnHoldSec: 9, advert: { asWaitSec: 20, gradedProfitPct: 70 } })!;
  ok("a check whose meter the advert ruling forgives still fails on its true awake seconds",
    withAdvert.pass === false && withAdvert.shortFails.some((f) => /awake on hold, 9 seconds/.test(f)), withAdvert.shortFails);
  const none = meterVerdict(clearYes, { meterSec: 19, profitPct: 71 })!;
  ok("a check that never measured it is not graded on it", !none.rows.some((r) => r.label.includes("Awake")));
}

// -------------------------------------------------------------------------------------------
// CHECK 430: CHARLIE TALKED INTO THE STORE'S OWN RECORDING (owner's order, 08-21).
// He asked his whole question again at 19 seconds while the advert was still playing. Nobody heard
// a word of it, every second of it was paid for, and the sheet still said TEST PASSED at 10.7¢
// against check 428's 7.2¢ and 57% margin against 71%. A check where that happened has to fail.
console.log("\n▶ TALKING OVER THE STORE'S OWN RECORDING FAILS THE CHECK (owner's order, 08-21)");
{
  const over = meterVerdict(TEST_CARDS.hold_music_advert, { meterSec: 43, speakingSec: 9, listeningSec: 17,
    profitPct: 57, awakeOnHoldSec: 3, advert: { asWaitSec: 18, gradedProfitPct: 70 },
    spokeOverRecording: { text: "Hey, no worries at all! Do you guys happen to have any Pokémon cards in stock?", atSec: 19 } })!;
  ok("a check where he talked over the store's recording FAILS", over.pass === false, over.shortFails);
  ok("…and it says so in plain words, with the second he did it",
    over.fails.some((f) => /talked 19 seconds in, while the store's own recording was still playing/.test(f)), over.fails);
  ok("…and the pill wears it", over.shortFails.some((f) => /talked over the store's recording/.test(f)), over.shortFails);
  ok("…and the row is red and failing",
    over.rows.some((r) => r.label.includes("Talked over") && r.tone === "r" && r.pass === false));
  ok("…and it opens with the words nobody heard",
    over.rows.some((r) => r.label.includes("Talked over") && /no worries at all/.test(r.open ?? "")));
  // THE FORGIVENESS CANNOT SAVE IT. The advert ruling grades those seconds as a wait, which is why
  // 430 read as passed; talking into the recording is not a number to forgive.
  ok("…and the advert forgiveness does not save it", over.pass === false);
  // The same check without it passes, so this row and nothing else is what failed it.
  const clean = meterVerdict(TEST_CARDS.hold_music_advert, { meterSec: 43, speakingSec: 9, listeningSec: 17,
    profitPct: 57, awakeOnHoldSec: 3, advert: { asWaitSec: 18, gradedProfitPct: 70 } })!;
  ok("the identical check with nobody talked over passes", clean.pass === true, clean.shortFails);
  ok("…and draws no such row at all", !clean.rows.some((r) => r.label.includes("Talked over")));
}

console.log("\n▶ AND THE OVERLAP IS MEASURED OFF THE RECORD, never guessed");
{
  const ADVERT = "Thanks for holding. Did you know we price match any local competitor?";
  const tl = [{ kind: "unknown", atMs: 57000, detail: { step: "played_at_us", lines: [{ line: ADVERT }] } }];
  const lines = [
    { who: "Clerk", text: ADVERT, atMs: 12508, endMs: 24838 },
    { who: "Agent", text: "Hey, no worries at all! Do you guys happen to have any Pokémon cards in stock?", atMs: 19117, endMs: 23000 },
    { who: "Clerk", text: "Yeah. We've got a few of those.", atMs: 33908, endMs: 36628 },
    { who: "Agent", text: "Oh nice, do you know the name of the set?", atMs: 41089, endMs: 46347 },
  ];
  const hit = spokeOverTheRecording(tl, lines);
  ok("the line of his that landed inside their recording is found", hit?.atSec === 19, hit);
  ok("…and it is his words, not theirs", /no worries at all/.test(hit?.text ?? ""), hit?.text);
  // The line he said AFTER their recording finished is not an overlap, and neither is the recording
  // itself. Only his own voice inside their recording's own seconds counts.
  ok("a line of his after the recording ended is not an overlap",
    spokeOverTheRecording(tl, [lines[0], lines[3]]) === null);
  ok("a check with no proven recording can never be accused",
    spokeOverTheRecording([], lines) === null);
  ok("…and neither can an old record with no measured ends",
    spokeOverTheRecording(tl, [{ who: "Clerk", text: ADVERT, atMs: 12508, endMs: null },
      { who: "Agent", text: "Hey, no worries at all!", atMs: 19117, endMs: 23000 }]) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

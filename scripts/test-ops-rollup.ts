// Unit tests for WHAT OUR CHECKS COST — the numbers behind the dashboard hero.
// Run: ./node_modules/.bin/tsx scripts/test-ops-rollup.ts
//
// The rows below are not invented. They are the EIGHT real checks the new engine had stamped on
// staging on 2026-07-28, pulled straight off /api/results, so every assertion here is a sentence
// about real calls: what they cost, what happened on them, and how much of the bill was dead air.
// No database, no network, no clock — `nowSec` is passed in.
import { opsRollup, countable, type CheckRow, type StatusRow } from "../src/calls/ops";
import { money } from "../src/calls/cost";

const REAL: CheckRow[] = [
    {
      "id": 199,
      "startedAt": 1785222539,
      "status": "completed",
      "statusKey": "not_in_stock",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 1,
      "talkSeconds": 24,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 19,
      "charlieSpeakingSeconds": 5,
      "charlieListeningSeconds": 2,
      "charlieSilentSeconds": 12,
      "costTotalUsd": 52822,
      "costAvoidableUsd": 21925
    },
    {
      "id": 198,
      "startedAt": 1785220981,
      "status": "completed",
      "statusKey": "sold_out",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 6,
      "talkSeconds": 30,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 25,
      "charlieSpeakingSeconds": 9,
      "charlieListeningSeconds": 2,
      "charlieSilentSeconds": 14,
      "costTotalUsd": 64957,
      "costAvoidableUsd": 25579
    },
    {
      "id": 196,
      "startedAt": 1785218289,
      "status": "completed",
      "statusKey": "not_in_stock",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 5,
      "talkSeconds": 23,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 18,
      "charlieSpeakingSeconds": 6,
      "charlieListeningSeconds": 1,
      "charlieSilentSeconds": 11,
      "costTotalUsd": 50995,
      "costAvoidableUsd": 20098
    },
    {
      "id": 195,
      "startedAt": 1785218073,
      "status": "failed",
      "statusKey": "failed",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 3,
      "talkSeconds": 3,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 0,
      "charlieSpeakingSeconds": 0,
      "charlieListeningSeconds": 0,
      "charlieSilentSeconds": 0,
      "costTotalUsd": 15173,
      "costAvoidableUsd": 0
    },
    {
      "id": 194,
      "startedAt": 1785218058,
      "status": "failed",
      "statusKey": "failed",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 2,
      "talkSeconds": 3,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 0,
      "charlieSpeakingSeconds": 0,
      "charlieListeningSeconds": 0,
      "charlieSilentSeconds": 0,
      "costTotalUsd": 15173,
      "costAvoidableUsd": 0
    },
    {
      "id": 193,
      "startedAt": 1785218037,
      "status": "failed",
      "statusKey": "failed",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 1,
      "talkSeconds": 4,
      "menuSeconds": null,
      "holdSeconds": 0,
      "charlieConnectedSeconds": 0,
      "charlieSpeakingSeconds": 0,
      "charlieListeningSeconds": 0,
      "charlieSilentSeconds": 0,
      "costTotalUsd": 15027,
      "costAvoidableUsd": 0
    },
    {
      "id": 192,
      "startedAt": 1785043039,
      "status": "completed",
      "statusKey": "voicemail",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 1,
      "talkSeconds": null,
      "menuSeconds": null,
      "holdSeconds": null,
      "charlieConnectedSeconds": null,
      "charlieSpeakingSeconds": 0,
      "charlieListeningSeconds": 3,
      "charlieSilentSeconds": 1,
      "costTotalUsd": 22335,
      "costAvoidableUsd": 1827
    },
    {
      "id": 191,
      "startedAt": 1785042608,
      "status": "completed",
      "statusKey": "voicemail",
      "retailerId": 106361,
      "lane": "direct",
      "attemptOf": null,
      "navSeconds": 1,
      "talkSeconds": null,
      "menuSeconds": null,
      "holdSeconds": null,
      "charlieConnectedSeconds": null,
      "charlieSpeakingSeconds": 0,
      "charlieListeningSeconds": 6,
      "charlieSilentSeconds": 6,
      "costTotalUsd": 40099,
      "costAvoidableUsd": 10963
    }
  ];

/** The owner's own statuses table, exactly the rows these checks landed on (src/db/bootstrap.ts). */
const STATUSES: StatusRow[] = [
  { key: "in_stock", label: "In stock!", emoji: "\u2705", color: "#4ADE80", tone: "in" },
  { key: "sold_out", label: "Sold out", emoji: "\ud83d\udd50", color: "#EF4444", tone: "out" },
  { key: "not_in_stock", label: "Not in stock", emoji: "\u274c", color: "#EF4444", tone: "out" },
  { key: "voicemail", label: "Got their voicemail", emoji: "\ud83d\udcee", color: "#9CA3AF", tone: "unk" },
  { key: "failed", label: "Call failed", emoji: "\u26a0\ufe0f", color: "#FBBF24", tone: "unk" },
];

/** The day after the newest of those checks, so the seven-day spark covers all of them. */
const NOW = 1785270000;
const FUN_STORE = 106361; // the owner's test store, the only store these eight ran against

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "\u2713" : "\u2717"} ${m}`); c ? pass++ : fail++; };
const run = (opts: Partial<Parameters<typeof opsRollup>[2]> = {}) => opsRollup(REAL, STATUSES, { nowSec: NOW, ...opts });

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 only checks the receipt stamped are counted, and the test store never is");
{
  ok(countable(REAL, { nowSec: NOW }).length === 8, "all eight stamped checks count when nothing is excluded");
  ok(countable(REAL, { nowSec: NOW, ownerOnly: new Set([FUN_STORE]) }).length === 0,
    "every one of them ran against the owner's test store, so the real numbers see none of them");
  const unstamped: CheckRow = { ...REAL[0], id: 1, costTotalUsd: null, costAvoidableUsd: null };
  ok(countable([...REAL, unstamped], { nowSec: NOW }).length === 8,
    "a check the receipt never stamped is left out, never counted as a nought");
  const cancelled: CheckRow = { ...REAL[0], id: 2, status: "admin_hangup" };
  ok(countable([...REAL, cancelled], { nowSec: NOW }).length === 8, "a cancelled check is a non-result and stays out");
  ok(countable(REAL, { nowSec: NOW, since: NOW }).length === 0, "the owner's stats cut-off is honoured");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 the hero is a sum of real rows, not a model");
{
  const r = run();
  ok(r.checks === 8, "eight checks behind the number");
  ok(r.totalUsd === 276581, "the total is the stamped costs added up, to the microdollar");
  ok(r.perCheckUsd === 34573, "what a check costs = that total over those eight checks");
  ok(money(r.perCheckUsd!) === "3.5\u00a2", "and it reads in cents the way the receipt prints one");
  const empty = opsRollup([], STATUSES, { nowSec: NOW });
  ok(empty.checks === 0 && empty.perCheckUsd === null,
    "with nothing stamped yet the hero is nothing at all, never a nought that reads like a fact");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 the outcome scale is the owner's statuses table, never a second one");
{
  const r = run();
  const labels = r.byOutcome.map((s) => s.label);
  ok(labels.includes("Call failed") && labels.includes("Not in stock"),
    "each outcome carries the label the owner typed into the statuses page");
  ok(r.byOutcome[0].checks === 3 && r.byOutcome[0].key === "failed", "the biggest slice leads");
  ok(r.byOutcome.find((s) => s.key === "sold_out")!.color === "#EF4444", "the colour is the owner's too");
  const stray = opsRollup([{ ...REAL[0], id: 3, statusKey: "brand_new_thing" }], STATUSES, { nowSec: NOW });
  ok(stray.byOutcome[0].label === "brand_new_thing",
    "a status with no row in the registry shows as itself, so a missing status is visible instead of renamed");
  ok(r.byOutcome.reduce((s, x) => s + x.checks, 0) === 8, "every counted check lands in exactly one outcome");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 the route names come from the calling engine");
{
  const r = run();
  ok(r.byRoute.length === 1 && r.byRoute[0].key === "direct", "all eight rang a person straight through");
  ok(r.byRoute[0].label === "Rings a person directly, no menu",
    "the words are the engine's own laneNote(), so the page cannot drift from the engine");
  ok(r.byRoute[0].totalUsd === 276581, "the routes add back up to the whole bill");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 dead air is summed off the stamped column, never re-derived from a rate");
{
  const r = run();
  ok(r.agent.avoidableUsd === 80392, "the dead-air slice is the stamped costAvoidableUsd added up");
  ok(r.agent.avoidableUsd < r.totalUsd, "and it is a slice of the bill, not an extra charge on top");
  ok(r.agent.speakingSecs + r.agent.listeningSecs + r.agent.silentSecs === r.agent.connectedSecs,
    "talking plus listening plus dead air is exactly the seconds we were billed for");
  ok(r.agent.n === 6, "two of the eight ran on an earlier build that never stamped connected time, so they sit out of the seconds");
  ok(r.checks === 8, "they still count towards what a check costs, because their bill is stamped and real");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 an answer is the owner's tone bucket, and tries are counted against it");
{
  const r = run();
  ok(r.answers.delivered === 3, "three of the eight gave the customer a real yes or no");
  ok(r.answers.triesPerAnswer === 2.7, "so it took 2.7 checks to deliver one answer");
  ok(r.answers.costPerAnswerUsd === 92194, "and an answer cost what all eight tries cost, over three answers");
  ok(money(r.answers.costPerAnswerUsd!) === "9.2\u00a2", "which reads as its own number, not the same as a check");
  ok(r.answers.retries === 0, "none of these eight was a retry of an earlier check");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 the clock only averages checks that measured the thing");
{
  const r = run();
  const menu = r.clock.find((c) => c.key === "menu");
  ok(!menu, "not one of these stores had a phone menu, so there is no menu line at all");
  const person = r.clock.find((c) => c.key === "toPerson")!;
  ok(person.n === 8 && person.avgSecs >= 0, "time to a person averages the eight that measured it");
  const withHold: CheckRow[] = [{ ...REAL[0], id: 4, holdSeconds: null }, REAL[1]];
  const h = opsRollup(withHold, STATUSES, { nowSec: NOW }).clock.find((c) => c.key === "hold");
  ok(!h || h.n === 1, "a check that never measured hold time is left out of the hold average, not averaged as nought");
}

// ---------------------------------------------------------------------------------------------
console.log("\u25b6 the spark keeps its gaps");
{
  const r = run({ sparkDays: 7 });
  ok(r.days.length === 7, "seven buckets for a seven-day spark");
  ok(r.days.some((d) => d.checks === 0 && d.perCheckUsd === null), "a day with no checks stays empty rather than closing up");
  ok(r.days.reduce((s, d) => s + d.checks, 0) === 8, "and every check lands in a day");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} \u2014 ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// Unit tests for THE CALL RECEIPT — the timeline, the seconds and the cost.
// Run: ./node_modules/.bin/tsx scripts/test-call-events.ts
//
// These are the contract. Each one is a sentence the owner could read and check:
// the money clock starts when the agent opens, dead air is counted honestly, the lane is stamped
// from the plan, and the phone line bills whole minutes. No database, no network, no clock games.
import {
  openReceipt, emit, markNow, addMs, closeReceipt, rollup, setEventSink, setLane,
  getReceipt, laneNote, laneFor, _receiptFrom, _reset, type Receipt,
} from "../src/calls/events";
import { costCall, costPerResult, money, MEASURED_RATES, USD } from "../src/calls/cost";

/** The two nav plans a store can have, in the exact shape the recipe produces them. */
const presses = [{ action: "press", value: "2", atSec: 8 }, { action: "press", value: "2", atSec: 16 }];
const spoken = [{ action: "say", value: "no", atSec: 26 }, { action: "say", value: "front", atSec: 38 }];

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const near = (a: number, b: number, slop = 1) => Math.abs(a - b) <= slop;

// ---------------------------------------------------------------------------------------------
console.log("▶ the lane is stamped from the plan, never guessed after the fact");
{
  ok(laneFor([]) === "direct", "no menu steps = the phone rings a person");
  ok(laneFor(presses) === "alpha", "presses only = the keypad lane");
  ok(laneFor(spoken) === "bravo", "spoken words = the spoken-menu lane");
  ok(laneFor([...presses, ...spoken]) === "bravo", "a mix counts as spoken (a word has to be said)");
  ok(laneNote("alpha").includes("Keypad"), "every lane has a plain-English name for the timeline");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ a receipt opens at dial and records in call order");
{
  _reset();
  const r = openReceipt("room-1", { lane: "alpha", planned: [{ action: "press", value: "2", atSec: 8 }] });
  emit("room-1", "ringing", "The store's phone is ringing");
  emit("room-1", "nav_step", "Pressed 2 at 16s", { via: "prompt" });
  ok(r.events[0].kind === "call_started", "the first line is always that we dialled");
  ok(r.events[1].kind === "lane", "the lane is on the receipt before anything happens");
  ok(r.events.map((e) => e.kind).includes("nav_step"), "menu steps land on the receipt");
  ok(openReceipt("room-1").events.length === r.events.length, "opening twice does not restart a call");
  ok(getReceipt("room-1") === r, "the receipt is findable by room while the call is live");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ the lane can be corrected once the runtime knows better");
{
  _reset();
  openReceipt("room-2", { lane: "unknown" });
  setLane("room-2", "bravo");
  setLane("room-2", "bravo"); // same lane again
  const r = getReceipt("room-2")!;
  ok(r.lane === "bravo", "the corrected lane sticks");
  ok(r.events.filter((e) => e.kind === "lane").length === 2, "a repeat of the same lane does not write a second line");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ the seconds split honestly: talking + listening + dead air = what we paid for");
{
  // 60 connected seconds: 20 the agent talking, 15 a person talking, 25 nobody.
  const r = _receiptFrom({
    lane: "direct",
    meters: { charlieOpenMs: 10_000, charlieCloseMs: 70_000, speakingMs: 20_000, listeningMs: 15_000, endMs: 75_000, humanMs: 10_000 },
  });
  const s = rollup(r);
  ok(s.charlieSecs === 60, "connected seconds are the whole time the session was open");
  ok(s.speakingSecs === 20 && s.listeningSecs === 15, "talking and listening are measured, not modelled");
  ok(s.silentSecs === 25, "dead air is what is left over");
  ok(s.speakingSecs + s.listeningSecs + s.silentSecs === s.charlieSecs, "the three always add back up to the bill");
  ok(s.neededSecs === 35 && s.avoidableSecs === 25, "needed vs avoidable is the number we drive down");
  ok(s.timeToAnswerSecs === 10, "time to answer is when a person was really there");
}

console.log("▶ dead air can never read negative, even when both sides talk at once");
{
  // A clerk talking over the agent: speaking + listening exceeds the connected time.
  const s = rollup(_receiptFrom({ meters: { charlieOpenMs: 0, charlieCloseMs: 30_000, speakingMs: 25_000, listeningMs: 20_000, endMs: 30_000 } }));
  ok(s.silentSecs === 0, "overlap does not invent negative silence");
  ok(s.speakingSecs + s.listeningSecs === s.charlieSecs, "the overlap is capped at the seconds we were actually billed");
}

console.log("▶ a call the agent never joined costs nothing in agent time");
{
  const s = rollup(_receiptFrom({ lane: "alpha", meters: { endMs: 42_000, navEndMs: 23_000 } }));
  ok(s.charlieSecs === 0 && !s.charlieJoined, "no session, no billed seconds");
  ok(s.timeToAnswerSecs === null, "nobody answered, so there is no time-to-answer to report");
  ok(s.navSecs === 23, "the menu time is still recorded");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ menu steps record whether the store's pause fired them or the clock did");
{
  const r = _receiptFrom({
    events: [
      { atMs: 16_000, atSec: 16, kind: "nav_step", detail: { via: "prompt" } },
      { atMs: 23_000, atSec: 23, kind: "nav_step", detail: { via: "prompt" } },
      { atMs: 40_000, atSec: 40, kind: "nav_step", detail: { via: "clock" } },
    ],
  });
  const s = rollup(r);
  ok(s.stepsFired === 3, "every step that fired is counted");
  ok(s.stepsOnPause === 2, "and we can see which ones the store's own pause triggered");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ closing hands the finished receipt to the sink exactly once");
{
  _reset();
  const seen: Receipt[] = [];
  setEventSink((r) => { seen.push(r); });
  openReceipt("room-3", { lane: "direct" });
  markNow("room-3", "charlieOpenMs");
  addMs("room-3", "speakingMs", 4000);
  closeReceipt("room-3");
  closeReceipt("room-3"); // a late carrier callback must not write the call twice
  ok(seen.length === 1, "one call, one receipt, even if the end arrives twice");
  ok(seen[0].events.at(-1)?.kind === "completed", "the last line is always that the call ended");
  ok(seen[0].meters.charlieCloseMs !== null, "a session still open when the line drops is closed out at the end of the call");
  emit("room-3", "hold", "too late");
  ok(seen[0].events.filter((e) => e.kind === "hold").length === 0, "nothing can be added after a receipt is closed");
}

console.log("▶ recording never breaks a call");
{
  _reset();
  setEventSink(() => { throw new Error("the database is down"); });
  openReceipt("room-4");
  emit("nonexistent-room", "hold", "no receipt for this room");
  markNow("nonexistent-room", "humanMs");
  addMs("nonexistent-room", "speakingMs", 100);
  let threw = false;
  try { closeReceipt("room-4"); } catch { threw = true; }
  ok(!threw, "a broken sink cannot throw into the call path");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ the phone line bills WHOLE minutes, rounded up (the 60-second cliff)");
{
  const at = (secs: number) => costCall({ callSecs: secs, charlieSecs: 0, avoidableSecs: 0 }).billedMinutes;
  ok(at(1) === 1, "one second still buys a whole minute");
  ok(at(59) === 1 && at(60) === 1, "59 and 60 seconds are both one minute");
  ok(at(61) === 2, "one second past the minute buys a second one");
  ok(at(0) === 0, "a call that never connected buys nothing");
  const c = costCall({ callSecs: 47, charlieSecs: 20, avoidableSecs: 0, forkSecs: [47] });
  ok(near(c.lineUsd, Math.round(0.0140 * USD), 2), "one billed minute of line = 1.4¢");
}

console.log("▶ the agent bills per second, with no minute cliff");
{
  const one = costCall({ callSecs: 60, charlieSecs: 1, avoidableSecs: 0 }).charlieUsd;
  const twenty = costCall({ callSecs: 60, charlieSecs: 20, avoidableSecs: 0 }).charlieUsd;
  ok(near(twenty, one * 20, 20), "twenty seconds costs twenty times one second");
  ok(near(twenty / USD, 0.0366, 0.002), "20 seconds of agent = 3.7¢, the measured rate");
  ok(near(costCall({ callSecs: 60, charlieSecs: 30, avoidableSecs: 0 }).charlieUsd / USD, 0.0548, 0.002), "30 seconds = 5.5¢");
}

console.log("▶ the baseline check comes out where the measurements say it should");
{
  // Menu done in time, 20 seconds of talk, all inside one billed minute.
  const c = costCall({ callSecs: 47, charlieSecs: 20, avoidableSecs: 0, forkSecs: [47, 24] });
  ok(near(c.totalUsd / USD, 0.052, 0.004), `a clean check lands near 5.2¢ (got ${money(c.totalUsd)})`);
  ok(c.totalUsd === c.lineUsd + c.forkUsd + c.charlieUsd + c.clipsUsd, "the pieces add up to the total");
}

console.log("▶ dead air is priced, so we can see what it is costing us");
{
  // The Target call the owner heard: the clerk walked away for 25 seconds with the agent billing.
  const c = costCall({ callSecs: 84, charlieSecs: 60, avoidableSecs: 25, forkSecs: [84] });
  ok(c.billedMinutes === 2, "84 seconds is two billed minutes");
  ok(near(c.avoidableUsd / USD, 0.0457, 0.003), `25 seconds of nobody talking cost 4.6¢ (got ${money(c.avoidableUsd)})`);
  ok(c.avoidableUsd < c.charlieUsd, "wasted seconds are a slice of the agent bill, not an extra charge");
}

console.log("▶ synthesized lines are priced per character, so caching them shows up as a saving");
{
  const fresh = costCall({ callSecs: 60, charlieSecs: 0, avoidableSecs: 0, ttsChars: 456 });
  const cached = costCall({ callSecs: 60, charlieSecs: 0, avoidableSecs: 0, ttsChars: 0 });
  ok(near(fresh.clipsUsd / USD, 0.069, 0.005), `re-recording ten lines costs about 6.9¢ (got ${money(fresh.clipsUsd)})`);
  ok(cached.clipsUsd === 0, "reusing saved lines costs nothing");
  ok(fresh.totalUsd > cached.totalUsd, "so the saving lands on the total");
}

console.log("▶ rates can be corrected without a deploy");
{
  const dearer = costCall({ callSecs: 60, charlieSecs: 20, avoidableSecs: 0 }, { ...MEASURED_RATES, charlieCreditsPerMin: 1446 });
  const normal = costCall({ callSecs: 60, charlieSecs: 20, avoidableSecs: 0 });
  ok(near(dearer.charlieUsd, normal.charlieUsd * 2, 20), "doubling the measured rate doubles the agent cost");
}

console.log("▶ cost per delivered result — the ROI number");
{
  // 3.6 attempts per answer, the production baseline: 36 calls, 10 answers.
  ok(costPerResult(36 * 52_000, 10) === Math.round(36 * 52_000 / 10), "cost per result divides total spend by answers delivered");
  ok(costPerResult(1000, 0) === null, "no answers delivered = no cost per result to report");
  ok(money(52_000) === "5.2¢", "money under a dollar reads in cents, the way the owner talks about it");
  ok(money(1_870_000) === "$1.87", "a dollar or more reads in dollars");
}


console.log("\u25b6 the three parts always add back up, even when the milliseconds do not round cleanly");
{
  // A real voicemail call: 12.6 connected seconds, 6.4 of a recording talking, none from us.
  const s = rollup(_receiptFrom({ meters: { charlieOpenMs: 3_400, charlieCloseMs: 16_000, speakingMs: 0, listeningMs: 6_400, endMs: 16_500 } }));
  ok(s.speakingSecs + s.listeningSecs + s.silentSecs === s.charlieSecs, "rounding each part on its own can never make the meter disagree with the bill");
  ok(s.neededSecs + s.avoidableSecs === s.charlieSecs, "needed plus avoidable is the whole bill");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

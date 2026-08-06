// Unit tests for THE CALL RECEIPT — the timeline, the seconds and the cost.
// Run: ./node_modules/.bin/tsx scripts/test-call-events.ts
//
// These are the contract. Each one is a sentence the owner could read and check:
// the money clock starts when the agent opens, dead air is counted honestly, the lane is stamped
// from the plan, and the phone line bills whole minutes. No database, no network, no clock games.
import {
  openReceipt, emit, amend, markNow, addMs, closeReceipt, rollup, rollupFromRow, setEventSink,
  getReceipt, laneNote, laneFor, actualLane, recordLine, _receiptFrom, _reset, type Receipt, type RtEvent,
} from "../src/calls/events";
import { costCall, costPerResult, costBuckets, money, MEASURED_RATES, STATUS_READ_USD, USD } from "../src/calls/cost";

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
  emit("room-1", "alpha_press", "Pressed 2 at 16s", { via: "prompt" });
  ok(r.events[0].kind === "dialed", "the first line is always that we dialled");
  ok((r.events[0].detail as { plannedLane?: string }).plannedLane === "alpha", "the PLANNED lane rides in the detail, not as the answer");
  ok(r.events.map((e) => e.kind).includes("alpha_press"), "menu steps land on the receipt");
  ok(openReceipt("room-1").events.length === r.events.length, "opening twice does not restart a call");
  ok(getReceipt("room-1") === r, "the receipt is findable by room while the call is live");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ the row records the route that REALLY ran, not the one we planned");
{
  const ev = (kind: RtEvent["kind"]): RtEvent => ({ atMs: 0, atSec: 0, kind });
  // Mapped as a keypad store, but it answered on the first ring and nothing was ever pressed.
  const rang = _receiptFrom({ lane: "alpha", events: [ev("dialed"), ev("connected"), ev("human_detected")] });
  ok(actualLane(rang) === "direct", "a keypad store that answered straight away really ran direct");
  ok(rollup(rang).lane === "direct", "and the row says so, so a lane cannot quietly stop being used");
  ok(actualLane(_receiptFrom({ lane: "direct", events: [ev("alpha_press")] })) === "alpha", "a key was pressed, so it was the keypad lane");
  ok(actualLane(_receiptFrom({ events: [ev("alpha_press"), ev("bravo_say")] })) === "bravo", "a word had to be said, so it was the spoken lane");
  ok(actualLane(_receiptFrom({ lane: "bravo", events: [ev("dialed")] })) === "unknown", "a call that never connected claims no lane at all");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ a desk ringing while we are billing is not a conversation");
{
  // A transfer to a desk nobody is at: 30 billed seconds, 12 of them just ringing.
  const s = rollup(_receiptFrom({ meters: { charlieOpenMs: 0, charlieCloseMs: 30_000, speakingMs: 3_000, listeningMs: 0, ringingMs: 12_000, endMs: 30_000 } }));
  ok(s.ringSeconds === 12, "ring seconds are counted as ring seconds, even while the meter runs");
  ok(s.charlieTalkingSeconds === 3, "ringing never counts as someone talking to us");
  ok(s.charlieSilentSeconds === 27, "so it lands in the waste, where it belongs");
}

console.log("▶ a number we do not measure is null, never zero");
{
  const s = rollup(_receiptFrom({ meters: { charlieOpenMs: 0, charlieCloseMs: 10_000, endMs: 20_000 } }));
  ok(s.holdSeconds === null, "hold time is null until hold detection ships, so nobody reads a real zero");
  ok(s.menuSeconds === null, "a store with no menu reports no menu time, rather than a zero-second menu");
  ok(s.ringSeconds === 0, "ring seconds ARE measured, so a genuine zero is a zero");
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
  ok(s.charlieConnectedSeconds === 60, "connected seconds are the whole time the session was open");
  ok(s.speakingSecs === 20 && s.listeningSecs === 15, "talking and listening are measured, not modelled");
  ok(s.charlieSilentSeconds === 25, "dead air is what is left over");
  ok(s.speakingSecs + s.listeningSecs + s.charlieSilentSeconds === s.charlieConnectedSeconds, "the three always add back up to the bill");
  ok(s.charlieTalkingSeconds === 35 && s.charlieSilentSeconds === 25, "needed vs avoidable is the number we drive down");
  ok(s.navSeconds === 10, "time to a person is when a person was really there");
  ok(s.talkSeconds === 65, "talk time runs from the person answering to the hang up");
}

console.log("▶ dead air can never read negative, even when both sides talk at once");
{
  // A clerk talking over the agent: speaking + listening exceeds the connected time.
  const s = rollup(_receiptFrom({ meters: { charlieOpenMs: 0, charlieCloseMs: 30_000, speakingMs: 25_000, listeningMs: 20_000, endMs: 30_000 } }));
  ok(s.charlieSilentSeconds === 0, "overlap does not invent negative silence");
  ok(s.speakingSecs + s.listeningSecs === s.charlieConnectedSeconds, "the overlap is capped at the seconds we were actually billed");
}

console.log("▶ a call the agent never joined costs nothing in agent time");
{
  const s = rollup(_receiptFrom({ lane: "alpha", meters: { endMs: 42_000, navEndMs: 23_000 } }));
  ok(s.charlieConnectedSeconds === 0 && !s.charlieJoined, "no session, no billed seconds");
  ok(s.navSeconds === null && s.talkSeconds === null, "nobody answered, so there is nothing to report — null, not zero");
  ok(s.menuSeconds === 23, "the menu time is still recorded");
}

// ---------------------------------------------------------------------------------------------
console.log("▶ menu steps record whether the store's pause fired them or the clock did");
{
  const r = _receiptFrom({
    events: [
      { atMs: 16_000, atSec: 16, kind: "alpha_press", detail: { via: "prompt" } },
      { atMs: 23_000, atSec: 23, kind: "alpha_press", detail: { via: "prompt" } },
      { atMs: 40_000, atSec: 40, kind: "alpha_press", detail: { via: "clock" } },
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
  ok(seen[0].events.at(-1)?.kind === "hangup", "the last line is always that the call ended");
  ok(seen[0].meters.charlieCloseMs !== null, "a session still open when the line drops is closed out at the end of the call");
  emit("room-3", "hold_start", "too late");
  ok(seen[0].events.filter((e) => e.kind === "hold_start").length === 0, "nothing can be added after a receipt is closed");
}

console.log("▶ recording never breaks a call");
{
  _reset();
  setEventSink(() => { throw new Error("the database is down"); });
  openReceipt("room-4");
  emit("nonexistent-room", "hold_start", "no receipt for this room");
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
  ok(s.speakingSecs + s.listeningSecs + s.charlieSilentSeconds === s.charlieConnectedSeconds, "rounding each part on its own can never make the meter disagree with the bill");
  ok(s.charlieTalkingSeconds + s.charlieSilentSeconds === s.charlieConnectedSeconds, "talking plus waste is the whole bill");
}

// ONE ENVELOPE, ONE ANSWER (owner 07-28). The same finished call came back complete when it was
// asked for by call id and with the seconds and the cost NULL when it was asked for by room, because
// the by-room reader only knew where an UNATTACHED call keeps them. Both routes now read a stamped
// row through this one function, so they cannot answer differently again.
console.log("▶ a stamped row reads back as the same roll-up a live call produces");
{
  const row = {
    lane: "direct", callSeconds: 19, navSeconds: 1, talkSeconds: 18,
    charlieConnectedSeconds: 19, charlieTalkingSeconds: 7, charlieSpeakingSeconds: 5,
    charlieListeningSeconds: 2, charlieSilentSeconds: 12, ringSeconds: 0, holdSeconds: 0,
    billedMinutes: 1, menuSeconds: null, brain: "hosted", navOutcome: "reached_a_person",
    charlieSegments: 1,
  };
  const s = rollupFromRow(row, [{ kind: "charlie_join", detail: { segment: 1 } }]);
  ok(s.charlieConnectedSeconds === 19 && s.charlieSilentSeconds === 12, "the agent's seconds come back off the row, not as nulls");
  ok(s.brain === "hosted" && s.navOutcome === "reached_a_person", "and so does which brain ran it and what the walk achieved");
  ok(s.holdSeconds === 0, "a measured zero stays a measured zero");
  ok(rollupFromRow({ ...row, holdSeconds: null }, []).holdSeconds === null, "…and a hold we never measured stays null, never a zero");
}

console.log("▶ a row from before the engine priced anything reads as unmeasured, not as free");
{
  const s = rollupFromRow({ callSeconds: 30, charlieConnectedSeconds: null, charlieSilentSeconds: 4 }, []);
  ok(s.charlieConnectedSeconds === 0 && s.charlieSilentSeconds === 0, "no connected time stamped = the whole agent block reads unmeasured, never nought-connected-with-dead-air");
  ok(s.billedMinutes === 1, "the carrier still billed a whole minute, and that we do know");
}

// ONE AGENT JOINING IS ONE LINE (owner 07-28: "it opens charlie_join three times"). The recorded
// question starting and the handover when it finished are details of the join, not joins of their own.
console.log("▶ facts can be added to the line already on the timeline, instead of writing another one");
{
  _reset();
  openReceipt("r-amend");
  emit("r-amend", "charlie_join", "The agent is on the line and billing", { segment: 1, brain: "hosted" });
  amend("r-amend", "charlie_join", { handoverVia: "the carrier confirmed the clip played", heldFrames: 103 });
  const r = getReceipt("r-amend") as Receipt;
  const joins = r.events.filter((e) => e.kind === "charlie_join");
  ok(joins.length === 1, "one agent joining is still exactly one line");
  ok(joins[0].detail?.heldFrames === 103 && joins[0].detail?.segment === 1, "the new facts land on it without losing the old ones");
  amend("r-amend", "hold_start", { reason: "quiet" });
  ok(r.events.filter((e) => e.kind === "hold_start").length === 0, "amending an event that never happened writes nothing");
}


console.log("▶ the five buckets, his names, and they SUM TO THE TOTAL exactly (owner 08-04)");
{
  // A 62 second check: 14s of menu, 18s of Charlie, the second read ran.
  const cost = costCall({ callSecs: 62, charlieSecs: 18, avoidableSecs: 0, forkSecs: [62, 48] });
  const b = costBuckets(cost, { callSecs: 62, navSecs: 14, streams: 2 }, MEASURED_RATES, STATUS_READ_USD);
  ok(b.map((x) => x.label).join(" · ") === "Bravo (Menu Nav) · Foxtrot (Phone Line) · Echo (Listening) · Charlie (Talking) · Status (Verification)",
    `his five names, his order (${b.map((x) => x.label).join(" · ")})`);
  const sum = b.reduce((n, x) => n + x.usd, 0);
  ok(sum === cost.totalUsd + STATUS_READ_USD, `nothing counted twice, nothing dropped: ${sum} = ${cost.totalUsd} + ${STATUS_READ_USD}`);
  const bravo = b.find((x) => x.key === "bravo")!;
  ok(bravo.detail.some(([l, v]) => l === "Menu time" && v === "0:14"), "Bravo shows the menu time it priced");
  ok(bravo.detail.some(([l]) => l === "Rate (per minute)"), "…and its rate comes from the rates in force, never typed in");
  const fox = b.find((x) => x.key === "foxtrot")!;
  ok(fox.detail.some(([l, v]) => l === "Billed (minutes)" && v === "2:00"), "the whole minute rounding cliff stays on the phone line where the carrier puts it");
  ok(b.find((x) => x.key === "charlie")!.detail.some(([l, v]) => l === "Covers" && v === "voice and thinking together"), "Charlie's line covers voice and thinking together (his ruling)");

  // No free items listed (his ruling): a check with no menu and no read shows no Bravo and no Status.
  const cost2 = costCall({ callSecs: 30, charlieSecs: 10, avoidableSecs: 0, forkSecs: [30] });
  const b2 = costBuckets(cost2, { callSecs: 30, navSecs: 0, streams: 1 }, MEASURED_RATES, 0);
  ok(!b2.some((x) => x.key === "bravo") && !b2.some((x) => x.key === "status"), "a bucket that spent nothing does not render");
  ok(b2.reduce((n, x) => n + x.usd, 0) === cost2.totalUsd, "…and the rest still sum to the total");
}

// ---------------------------------------------------------------------------------------------
// A LINE'S TIME IS A MOMENT, MEASURED FROM THIS CALL'S OWN ZERO (owner 08-06, "we need accurate
// timing"). The caller that backdates Staff's greeting counts from when the AUDIO opened, and this
// record counts from when the CHECK opened, about two seconds earlier, so an offset handed straight
// over wrote every greeting two seconds early and the sheet drew Staff speaking before the row that
// says the line was answered.
console.log("▶ a spoken line is filed at the moment it was really said");
{
  _reset();
  const r = openReceipt("room-clock");
  r.startMs = Date.now() - 30_000;                       // the check opened 30 seconds ago
  recordLine("room-clock", "Clerk", "Fun store, this is Larry.", Date.now() - 22_000);
  ok(near(r.transcript[0].atMs, 8_000, 60), `a moment 22 seconds ago on a check 30 seconds old files at 8s (got ${r.transcript[0].atMs}ms)`);
  recordLine("room-clock", "Agent", "do you have any Pokemon in");
  ok(near(r.transcript[1].atMs, 30_000, 60), `a line with no moment given files at now (got ${r.transcript[1].atMs}ms)`);
  // A number too small to be a wall clock moment is somebody's offset, and an offset from the wrong
  // zero is exactly the fault. It is ignored, and the line files at now, never at a planted time.
  recordLine("room-clock", "Clerk", "We did not.", 1_019);
  ok(near(r.transcript[2].atMs, 30_000, 60), `a number that cannot be a moment is refused (got ${r.transcript[2].atMs}ms)`);
  ok(r.transcript.every((l, i, a) => i === 0 || a[i - 1].atMs <= l.atMs), "the conversation stays in the order it happened");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

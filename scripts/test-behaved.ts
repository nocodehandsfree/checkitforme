// THE PASS/FAIL ROWS THE OWNER READS ON ONE TEST CHECK, unit-tested with no app and no database (src/calls/behaved.ts).
//
// Run: ./node_modules/.bin/tsx scripts/test-behaved.ts
//
// Every assertion here is one line of the contract in docs/tasks/admin-testing-new-engine.md. The
// third state matters as much as the other two: a rule this check never put to the test must come
// back null, because a red cross there reads as "the engine broke" and a tick reads as "we checked".
import { behaved, agentLinesFrom, type BehavedRow, type BehavedEvent } from "../src/calls/behaved";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, saw?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};
const head = (s: string) => console.log(`\n${s}`);

const ev = (kind: string, atSec: number, detail?: Record<string, unknown>): BehavedEvent => ({ kind, atSec, detail: detail ?? null });
const row = (rows: BehavedRow[], key: string) => rows.find((r) => r.key === key)!;
const OPENER = "Hi! I was just checking to see if you have any Pokémon in stock right now?";

// A direct-pickup store that went perfectly: rings a person, agent opens at the person, one question.
const cleanDirect: BehavedEvent[] = [
  ev("dialed", 0, { plannedLane: "direct", plan: [] }),
  ev("ringing", 2, { leg: "store" }),
  ev("connected", 15),
  ev("human_detected", 19),
  ev("charlie_join", 19, { segment: 1 }),
  ev("verdict", 26),
  ev("charlie_leave", 28),
  ev("hangup", 28),
];

head("SHAPE");
{
  const r = behaved({ timeline: cleanDirect, rollup: { stepsFired: 0, stepsOnPause: 0, charlieSegments: 1 }, agentLines: [OPENER, "Perfect, thank you so much!"] });
  // THE ORDER IS THE SCREEN. The four he walked keep their places; the two the wrong-department save
  // added sit under them, so a row never moves out from under his thumb.
  ok("six rows, fixed order", r.map((x) => x.key).join(",")
    === "asked_once,no_keypad_at_person,meter_stopped_on_hold,mapping_held,asked_to_be_put_through,asked_the_new_person", r.map((x) => x.key));
  ok("an ordinary check shows a gray dash on both wrong-department rows, never a cross",
    row(r, "asked_to_be_put_through").pass === null && row(r, "asked_the_new_person").pass === null);
  ok("every row ships a label, a tooltip and a why", r.every((x) => !!x.label && !!x.tip && !!x.why));
  ok("pass is only true, false or null", r.every((x) => x.pass === true || x.pass === false || x.pass === null));
  ok("a clean direct check: asked once", row(r, "asked_once").pass === true);
  ok("a clean direct check: no keypad at a person", row(r, "no_keypad_at_person").pass === true);
  ok("a clean direct check: nobody held us, so the meter row is null", row(r, "meter_stopped_on_hold").pass === null);
  // HIS OWN WORDS (owner 07-30), asserted so they cannot drift back into ours.
  ok("…and it says it in his words", row(r, "meter_stopped_on_hold").why === "Nobody dropped Charlie on this check.", row(r, "meter_stopped_on_hold").why);
  ok("the row is called Meter stopped", row(r, "meter_stopped_on_hold").label === "Meter stopped", row(r, "meter_stopped_on_hold").label);
  // OPERATOR GRADE, NOT CONVERSATIONAL (owner 07-30, admin copy guide: a label is a precise noun or
  // a plain verb, never a sentence). Asserted so nobody writes chat into a control panel again.
  ok("the labels are the operator's words", r.map((x) => x.label).join(" · ")
    === "Asked once · No keypad detected · Meter stopped · Mapping held · Transfer requested · Re-asked after transfer", r.map((x) => x.label));
  ok("no gray line runs past one line on a phone", r.every((x) => x.why.length <= 110), r.filter((x) => x.why.length > 110).map((x) => x.why));
  ok("a clean direct check: mapping held", row(r, "mapping_held").pass === true);
}

head("ASKED ONCE");
{
  const one = (lines: string[]) => row(behaved({ timeline: cleanDirect, agentLines: lines }), "asked_once");
  ok("one stock question passes", one([OPENER]).pass === true);
  ok("two stock questions fail", one([OPENER, "Sorry, do you have any Pokémon in stock?"]).pass === false);
  ok("a second greeting fails", one([OPENER, "Hi there, are you still with me?"]).pass === false);
  ok("the restock follow-up is NOT a second ask", one([OPENER, "Ah okay, any idea when you might get more in?"]).pass === true);
  ok("the set and pack follow-ups are NOT a second ask", one([OPENER, "Oh nice, do you know the name of the set?", "Does that come in a pack? Or like a box?"]).pass === true);
  ok("nothing written down is null, never a cross", one([]).pass === null);
  ok("the reason names the count", /2/.test(one([OPENER, "Do you have any Pokémon in stock?"]).why));
}

head("NO KEYPAD AT A PERSON");
{
  const at = (tl: BehavedEvent[]) => row(behaved({ timeline: tl, agentLines: [OPENER] }), "no_keypad_at_person");
  ok("a person and no press passes", at(cleanDirect).pass === true);
  ok("a press AT the person fails", at([...cleanDirect, ev("alpha_press", 19, { key: "1" })]).pass === false);
  ok("a press AFTER the person fails", at([...cleanDirect, ev("alpha_press", 22, { key: "1" })]).pass === false);
  ok("presses BEFORE the person are fine", at([ev("dialed", 0), ev("alpha_press", 8, { key: "3" }), ev("human_detected", 19)]).pass === true);
  ok("no person is null, never a tick", at([ev("dialed", 0), ev("ringing", 2), ev("hangup", 30)]).pass === null);
}

head("METER STOPPED ON HOLD");
{
  const at = (tl: BehavedEvent[], sums?: Record<string, number>) => row(behaved({ timeline: tl, rollup: sums ?? null, agentLines: [OPENER] }), "meter_stopped_on_hold");
  const held: BehavedEvent[] = [
    ev("dialed", 0, { plannedLane: "direct", plan: [] }), ev("human_detected", 19), ev("charlie_join", 19, { segment: 1 }),
    ev("hold_start", 30, { reason: "quiet" }), ev("charlie_leave", 30, { strategy: "reopen" }),
    ev("hold_end", 62, { gapSec: 32 }), ev("charlie_join", 62, { segment: 2 }), ev("verdict", 70), ev("hangup", 72),
  ];
  ok("closed for the hold and back after it passes", at(held, { charlieSegments: 2 }).pass === true);
  ok("the reason names the part number", /part 2/.test(at(held, { charlieSegments: 2 }).why));
  const satThrough = held.filter((e) => !(e.kind === "charlie_leave" && e.atSec === 30));
  ok("billing straight through a hold fails", at(satThrough).pass === false);
  const neverBack = held.filter((e) => !(e.kind === "charlie_join" && e.atSec === 62));
  ok("closing and never coming back fails", at(neverBack).pass === false);
  const heldToEnd: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 10), ev("charlie_join", 10), ev("hold_start", 20), ev("charlie_leave", 20), ev("hangup", 90)];
  ok("held to the end of the call still passes on the close alone", at(heldToEnd).pass === true);
  // The close that belongs to the END of the call must not be read as the meter stopping for the hold.
  const lateClose: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 10), ev("charlie_join", 10), ev("hold_start", 20), ev("hold_end", 50), ev("charlie_leave", 70), ev("hangup", 70)];
  ok("a close after somebody came back does NOT count as stopping for the hold", at(lateClose).pass === false);
  ok("no hold at all is null", at(cleanDirect).pass === null);
}

head("MAPPING HELD");
{
  const at = (tl: BehavedEvent[], sums?: Record<string, number>) => row(behaved({ timeline: tl, rollup: sums ?? null, agentLines: [OPENER] }), "mapping_held");
  ok("direct, nothing fired, agent opened at the person", at(cleanDirect, { stepsFired: 0, stepsOnPause: 0 }).pass === true);
  const firedAtDirect = [...cleanDirect, ev("alpha_press", 6, { key: "1", via: "prompt" })];
  ok("a step fired at a direct store fails", at(firedAtDirect).pass === false);
  const blindJoin: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("ringing", 2), ev("charlie_join", 4), ev("hangup", 40)];
  ok("the agent opening with nobody on the line fails", at(blindJoin).pass === false);
  const early: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("charlie_join", 5), ev("human_detected", 19), ev("hangup", 40)];
  ok("the agent opening before the person fails", at(early).pass === false);
  ok("the reason spells out how early", /14s before/.test(at(early).why));
  const noJoin: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("ringing", 2), ev("hangup", 30)];
  ok("no agent and no steps is null", at(noJoin).pass === null);

  const mapped = (via: string): BehavedEvent[] => [
    ev("dialed", 0, { plannedLane: "alpha", plan: [{ action: "press", value: "1", atSec: 7 }, { action: "press", value: "3", atSec: 14 }] }),
    ev("ivr_detected", 4), ev("alpha_press", 7, { key: "1", via }), ev("alpha_press", 14, { key: "3", via }),
    ev("human_detected", 22), ev("charlie_join", 22), ev("hangup", 50),
  ];
  ok("mapped, every step on the store's recording, passes", at(mapped("prompt")).pass === true);
  ok("mapped, a step on the clock, fails", at(mapped("clock")).pass === false);
  ok("mapped, the roll-up's own counts are believed over the timeline", at(mapped("prompt"), { stepsFired: 2, stepsOnPause: 1 }).pass === false);
  const nothingFired: BehavedEvent[] = [ev("dialed", 0, { plannedLane: "alpha", plan: [{ action: "press", value: "1", atSec: 7 }] }), ev("human_detected", 30), ev("charlie_join", 30), ev("hangup", 50)];
  ok("mapped, the map had a step and none fired, fails", at(nothingFired).pass === false);
  ok("no dialed event at all is null", at([ev("hangup", 10)]).pass === null);
}

head("THE WORDS OFF A FINISHED ROW");
{
  const t = `Agent: ${OPENER}\nClerk: yeah hold on\nAgent: Perfect, thank you so much!`;
  const lines = agentLinesFrom(t);
  ok("only the agent's lines come back", lines.length === 2, lines);
  ok("the opener survives intact", lines[0] === OPENER, lines[0]);
  ok("an empty transcript is an empty list", agentLinesFrom(null).length === 0);
  ok("scored off a real row, that call asked once", row(behaved({ timeline: cleanDirect, agentLines: lines }), "asked_once").pass === true);
}


// ================================================================================================
// THE WRONG-DEPARTMENT SAVE, as the owner reads it on one test check.
//
// The shape of a saved check: we reach the pharmacy counter, Staff say so, the agent asks once to be
// put through, the desk rings, the agent is closed for the hand-over, somebody new picks up and IS
// asked. Six rows, and the trap is the first one: asking the new person is a SECOND question on the
// check, and the old rule counted questions per check, so a perfect save would have scored a cross.
const SAY_TRANSFER = "Oh gotcha, could you put me through to whoever handles the Pokémon?";
const savedCheck: BehavedEvent[] = [
  ev("dialed", 0, { plannedLane: "direct", plan: [] }),
  ev("connected", 4),
  ev("human_detected", 8),
  ev("charlie_join", 8, { segment: 1 }),
  ev("unknown", 16, { wrongDepartment: true, why: "Staff said we reached another counter", said: "Hi, this is the pharmacy." }),
  ev("transfer", 22, { reason: "transfer" }),
  ev("hold_start", 22, { reason: "transfer" }),
  ev("charlie_leave", 22, { strategy: "reopen" }),
  ev("hold_end", 31, { gapSec: 9, maybeNewPerson: true, reason: "transfer" }),
  ev("charlie_join", 31, { segment: 2 }),
  ev("verdict", 44),
  ev("charlie_leave", 46),
  ev("hangup", 46),
];
const savedTurns = [
  { text: OPENER, atSec: 9 },
  { text: SAY_TRANSFER, atSec: 18 },
  { text: "Heyy, do you have any Pokemon in stock right now?", atSec: 33 },
  { text: "Perfect, thank you so much, have a good one.", atSec: 45 },
];

head("THE WRONG-DEPARTMENT SAVE");
{
  const r = behaved({ timeline: savedCheck, rollup: { stepsFired: 0, stepsOnPause: 0, charlieSegments: 2 }, agentLines: savedTurns });
  ok("asked once STILL passes, because the second question went to a second person",
    row(r, "asked_once").pass === true, row(r, "asked_once").why);
  ok("asked to be put through passes, once", row(r, "asked_to_be_put_through").pass === true, row(r, "asked_to_be_put_through").why);
  ok("…and it prints what Staff actually said", /this is the pharmacy/i.test(row(r, "asked_to_be_put_through").why));
  ok("the new person was asked", row(r, "asked_the_new_person").pass === true, row(r, "asked_the_new_person").why);
  ok("…off the clock, naming both seconds", /31s/.test(row(r, "asked_the_new_person").why) && /33s/.test(row(r, "asked_the_new_person").why));
  ok("Charlie was dropped, and the row says the TRANSFER did it rather than Staff",
    row(r, "meter_stopped_on_hold").pass === true && /the transfer dropped charlie/i.test(row(r, "meter_stopped_on_hold").why), row(r, "meter_stopped_on_hold").why);
  ok("no keypad at a person still passes", row(r, "no_keypad_at_person").pass === true);
}

head("…and every way it can go wrong");
{
  // He carried on with the new person instead of asking them. The exact bug the 20 second stopwatch
  // used to cause, and the one row that catches it.
  const r = behaved({ timeline: savedCheck, rollup: { charlieSegments: 2 }, agentLines: [
    { text: OPENER, atSec: 9 }, { text: SAY_TRANSFER, atSec: 18 },
    { text: "So do you have them then?", atSec: 34 }] });
  ok("carried on after a HAND-OVER: asked the new person FAILS", row(r, "asked_the_new_person").pass === false, row(r, "asked_the_new_person").why);
  ok("…and asked once does NOT also cross, so one miss prints one cross", row(r, "asked_once").pass === true);
}
{
  // Landed wrong and hung up instead of asking to be put through.
  const r = behaved({ timeline: savedCheck.slice(0, 5), agentLines: [{ text: OPENER, atSec: 9 }] });
  ok("never asked to be put through: FAILS", row(r, "asked_to_be_put_through").pass === false, row(r, "asked_to_be_put_through").why);
  ok("and the new-person row is a dash, because nobody new ever came on", row(r, "asked_the_new_person").pass === null);
}
{
  // Asked twice with NOBODY new on the line. Still a fail, exactly as it always was.
  const r = behaved({ timeline: cleanDirect, rollup: { charlieSegments: 1 }, agentLines: [
    { text: OPENER, atSec: 9 }, { text: "Sorry, do you have any Pokemon in stock right now?", atSec: 14 }] });
  ok("two questions and one person still FAILS asked once", row(r, "asked_once").pass === false, row(r, "asked_once").why);
}
{
  // A finished row: a flat transcript with no clock on it. The rows must still answer, and say so.
  const lines = agentLinesFrom(`Agent: ${OPENER}\nClerk: this is the pharmacy\nAgent: ${SAY_TRANSFER}\nClerk: hold on\nAgent: Heyy, do you have any Pokemon in stock right now?`);
  const r = behaved({ timeline: savedCheck, rollup: { charlieSegments: 2 }, agentLines: lines });
  ok("with no clock, the new person is still scored off the order", row(r, "asked_the_new_person").pass === true, row(r, "asked_the_new_person").why);
  ok("…and it says the clock was not what it read", /order of the lines/.test(row(r, "asked_the_new_person").why));
  ok("asked once holds up without a clock too", row(r, "asked_once").pass === true);
}
{
  // A long walk away is ALSO somebody new (the engine says so), and it buys the same second question.
  const walked: BehavedEvent[] = [
    ev("dialed", 0, { plannedLane: "direct", plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }),
    ev("hold_start", 20, { reason: "quiet" }), ev("charlie_leave", 20, { strategy: "reopen" }),
    ev("hold_end", 55, { gapSec: 35, maybeNewPerson: true, reason: "quiet" }), ev("charlie_join", 55, { segment: 2 }),
    ev("hangup", 70),
  ];
  const r = behaved({ timeline: walked, rollup: { charlieSegments: 2 }, agentLines: [
    { text: OPENER, atSec: 7 }, { text: "Heyy, do you have any Pokemon in stock right now?", atSec: 57 }] });
  ok("a long wait is a maybe-new person: asked once passes, it does not cross", row(r, "asked_once").pass === true, row(r, "asked_once").why);
  // A WALK AWAY IS NOT PROOF SOMEBODY ELSE PICKED UP. Requiring a second question here would cross a
  // check where Staff went to the shelf, came back themselves, and the agent rightly carried on.
  ok("…and the new-person row is a DASH, because a walk away is not a hand-over", row(r, "asked_the_new_person").pass === null, row(r, "asked_the_new_person").why);
  ok("…and it says why there is nothing to require", /may be the same person back/.test(row(r, "asked_the_new_person").why));
  ok("…and being put through is a dash, because we never landed wrong", row(r, "asked_to_be_put_through").pass === null);
  ok("…and the row says STAFF dropped Charlie, not a transfer", /the staff dropped charlie/i.test(row(r, "meter_stopped_on_hold").why) && !/transfer/i.test(row(r, "meter_stopped_on_hold").why), row(r, "meter_stopped_on_hold").why);
}

{
  // The check he will run first: Staff say "hold on", walk off, come back THEMSELVES and answer. The
  // agent carrying on is correct, and not one row may cross.
  const walkedBack: BehavedEvent[] = [
    ev("dialed", 0, { plannedLane: "direct", plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }),
    ev("hold_start", 18, { reason: "quiet" }), ev("charlie_leave", 18, { strategy: "reopen" }),
    ev("hold_end", 60, { gapSec: 42, maybeNewPerson: true, reason: "quiet" }), ev("charlie_join", 60, { segment: 2 }),
    ev("verdict", 68), ev("hangup", 70),
  ];
  const r = behaved({ timeline: walkedBack, rollup: { stepsFired: 0, stepsOnPause: 0, charlieSegments: 2 }, agentLines: [
    { text: OPENER, atSec: 7 }, { text: "Perfect, thank you so much, have a good one.", atSec: 63 }] });
  ok("Staff walked off and came back themselves: NOT ONE row crosses",
    r.every((x) => x.pass !== false), r.filter((x) => x.pass === false).map((x) => x.key));
  ok("…the meter row ticks", row(r, "meter_stopped_on_hold").pass === true, row(r, "meter_stopped_on_hold").why);
}

{
  // A SILENT hand-over: no ringing at all, so the wait reads "quiet" and is short. The runtime stamps
  // WHY it counted as somebody new, and this screen reads that fact rather than the sound.
  const silent: BehavedEvent[] = [
    ev("dialed", 0, { plannedLane: "direct", plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }),
    ev("unknown", 12, { wrongDepartment: true, why: "Staff said we reached another counter", said: "This is the pharmacy." }),
    ev("hold_start", 20, { reason: "quiet" }), ev("charlie_leave", 20, { strategy: "reopen" }),
    ev("hold_end", 28, { gapSec: 8, maybeNewPerson: true, reason: "quiet", afterAskingToBePutThrough: true }),
    ev("charlie_join", 28, { segment: 2 }), ev("verdict", 40), ev("hangup", 42),
  ];
  const r = behaved({ timeline: silent, rollup: { charlieSegments: 2 }, agentLines: [
    { text: OPENER, atSec: 7 }, { text: SAY_TRANSFER, atSec: 15 },
    { text: "Heyy, do you have any Pokemon in stock right now?", atSec: 30 }] });
  ok("a silent hand-over still counts as a hand-over", row(r, "asked_the_new_person").pass === true, row(r, "asked_the_new_person").why);
  ok("…and asked to be put through ticks", row(r, "asked_to_be_put_through").pass === true);
  ok("…and asked once does not cross on the second question", row(r, "asked_once").pass === true);
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

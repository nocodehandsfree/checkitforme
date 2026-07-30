// THE FOUR PASS/FAIL ROWS, unit-tested with no app and no database (src/calls/behaved.ts).
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
  ok("four rows, fixed order", r.map((x) => x.key).join(",") === "asked_once,no_keypad_at_person,meter_stopped_on_hold,mapping_held", r.map((x) => x.key));
  ok("every row ships a label, a tooltip and a why", r.every((x) => !!x.label && !!x.tip && !!x.why));
  ok("pass is only true, false or null", r.every((x) => x.pass === true || x.pass === false || x.pass === null));
  ok("a clean direct check: asked once", row(r, "asked_once").pass === true);
  ok("a clean direct check: no keypad at a person", row(r, "no_keypad_at_person").pass === true);
  ok("a clean direct check: nobody held us, so the meter row is null", row(r, "meter_stopped_on_hold").pass === null);
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

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

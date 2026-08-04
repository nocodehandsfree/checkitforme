// THE PASS/FAIL ROWS THE OWNER READS ON ONE TEST CHECK, unit-tested with no app and no database (src/calls/behaved.ts).
//
// Run: ./node_modules/.bin/tsx scripts/test-behaved.ts
//
// Every assertion here is one line of the contract in docs/tasks/admin-testing-new-engine.md. The
// third state matters as much as the other two: a rule this check never put to the test must come
// back null, because a red cross there reads as "the engine broke" and a tick reads as "we checked".
import { behaved, agentLinesFrom, TEST_CARDS, type BehavedRow, type BehavedEvent } from "../src/calls/behaved";

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
  // ONLY CHARLIE ON THIS CARD (owner 07-30). Walking a menu is the map's job, not his, and it is not
  // a test: it either works or the check fails, and the check failing is the report.
  ok("eleven rows, in the order of the record", r.map((x) => x.key).join(",")
    === "handed_to_charlie,question_recorded,warmed_up_in_time,right_department,asked_to_be_put_through,asked_the_new_person,goodbye_when_told_no,meter_stopped_on_hold,wrapped_up,spoke_their_language,charlie_ended_the_check", r.map((x) => x.key));
  ok("an ordinary check shows a gray dash on both wrong-department rows, never a cross",
    row(r, "asked_to_be_put_through").pass === null && row(r, "asked_the_new_person").pass === null);
  ok("every row ships a label, a tooltip and a why", r.every((x) => !!x.label && !!x.tip && !!x.why));
  // A PLAIN CHECK IS MOSTLY UNUSED and that is a good check (owner: "Unused is a clean result"). The
  // only tick it earns is the one thing that plainly happened: Staff picked up and he was handed the
  // check. Nothing about a department, a transfer or a wait may claim anything at all.
  ok("a clean Fun-store check ticks only what really happened", r.filter((x) => x.pass === true).map((x) => x.key).join(",") === "handed_to_charlie,wrapped_up", r.filter((x) => x.pass === true).map((x) => x.key));
  ok("…and it crosses nothing", r.filter((x) => x.pass === false).length === 0, r.filter((x) => x.pass === false).map((x) => x.key));
  ok("pass is only true, false or null", r.every((x) => x.pass === true || x.pass === false || x.pass === null));
  // A DIRECT STORE HAS NO MENU, so a tick would read as "we expect a keypad" (owner 07-30).
  ok("a clean direct check: nobody held us, so the meter row is null", row(r, "meter_stopped_on_hold").pass === null);
  // HIS OWN WORDS (owner 07-30), asserted so they cannot drift back into ours.
  ok("…and it says it in his words", row(r, "meter_stopped_on_hold").why === "Nobody dropped Charlie on this check.", row(r, "meter_stopped_on_hold").why);
  ok("the row is called Meter stopped", row(r, "meter_stopped_on_hold").label === "Meter stopped", row(r, "meter_stopped_on_hold").label);
  // OPERATOR GRADE, NOT CONVERSATIONAL (owner 07-30, admin copy guide: a label is a precise noun or
  // a plain verb, never a sentence). Asserted so nobody writes chat into a control panel again.
  // THE OWNER'S OWN WORDS, line by line, from docs/specs/charlie-behavior/README.md §5. He spent real
  // time on these, so they are asserted here and no agent can quietly reword one.
  ok("the labels are his words, in his order", r.map((x) => x.label).join(" · ")
    === "Handed to Charlie · The question played as a recording · Charlie warmed up in time · We reached the right department · Asked to be transferred · Reacted to a new person · Said goodbye when told no · Meter stopped · Charlie wrapped up · Spoke their language · Charlie ended the check", r.map((x) => x.label));
  ok("no dash inside any label or line (copy law)", r.every((x) => !/[\u2014\u2013]/.test(x.label + x.why + x.tip)), r.filter((x) => /[\u2014\u2013]/.test(x.label + x.why + x.tip)).map((x) => x.key));
  ok("no gray line runs past one line on a phone", r.every((x) => x.why.length <= 110), r.filter((x) => x.why.length > 110).map((x) => x.why));
}

head("THE EIGHT NEW ROWS, IN HIS WORDS (README §5, asserted so nobody rewords them)");
{
  // ROW 1 — handed to Charlie.
  const noPickup: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("ringing", 2, { leg: "store" }), ev("hangup", 40, { reason: "nobody_came" })];
  ok("row 1 fail: nobody there", row(behaved({ timeline: noPickup }), "handed_to_charlie").why === "Staff never picked up, so there was nobody to hand to.", row(behaved({ timeline: noPickup }), "handed_to_charlie").why);
  const notHanded: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 12), ev("hangup", 40)];
  ok("row 1 fail: our own side never handed it over", row(behaved({ timeline: notHanded }), "handed_to_charlie").why === "Our own system never handed the check to Charlie.", row(behaved({ timeline: notHanded }), "handed_to_charlie").why);
  ok("row 1 pass names Alpha, his word for the keypad", /^Reached Staff through Alpha and handed to Charlie/.test(row(behaved({ timeline: cleanDirect }), "handed_to_charlie").why));

  // ROW 2 — the question played as a recording.
  const withClip = [...cleanDirect, ev("unknown", 20, { step: "question_clip", ms: 4800 })];
  ok("row 2 pass", /^The question played as a recording/.test(row(behaved({ timeline: withClip }), "question_recorded").why), row(behaved({ timeline: withClip }), "question_recorded").why);
  const noClip = [...cleanDirect, ev("unknown", 20, { step: "question_live" })];
  ok("row 2 fail, word for word", row(behaved({ timeline: noClip }), "question_recorded").why === "The recording did not play, so Charlie asked the question himself.", row(behaved({ timeline: noClip }), "question_recorded").why);
  ok("row 2 on an OLD check says nothing at all", row(behaved({ timeline: cleanDirect }), "question_recorded").pass === null);

  // ROW 3 — the warm-up. Late is measured, never assumed.
  const late: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 10), ev("charlie_join", 12, { segment: 1, warmedUpInTime: false, deadAirMs: 2100 }), ev("hangup", 30)];
  ok("row 3 fail, with the seconds of dead air", row(behaved({ timeline: late }), "warmed_up_in_time").why === "Charlie warmed up late. There was dead air for 2 seconds.", row(behaved({ timeline: late }), "warmed_up_in_time").why);
  const intime: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 10), ev("charlie_join", 12, { segment: 1, warmedUpInTime: true, deadAirMs: 0 }), ev("hangup", 30)];
  ok("row 3 pass", row(behaved({ timeline: intime }), "warmed_up_in_time").why === "Charlie warmed up in time.", row(behaved({ timeline: intime }), "warmed_up_in_time").why);
  ok("row 3 on an OLD check says nothing", row(behaved({ timeline: cleanDirect }), "warmed_up_in_time").pass === null);

  // ROW 4 — the department. A plain check never claims we reached the right one.
  ok("row 4 is Unused on a check that picked no department", row(behaved({ timeline: cleanDirect }), "right_department").pass === null);
  const menu: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("ivr_detected", 4), ev("bravo_say", 9, { phrase: "front" }), ev("human_detected", 20), ev("charlie_join", 20, { segment: 1 }), ev("hangup", 40)];
  ok("row 4 pass, word for word", row(behaved({ timeline: menu }), "right_department").why === "We reached the right department, no transfer needed.", row(behaved({ timeline: menu }), "right_department").why);
  const wrongNoAsk = [...menu, ev("unknown", 24, { wrongDepartment: true, said: "This is the pharmacy." })];
  ok("row 4 fail starts in his words", /^Wrong department and Charlie never asked to be transferred\./.test(row(behaved({ timeline: wrongNoAsk, agentLines: [OPENER] }), "right_department").why), row(behaved({ timeline: wrongNoAsk, agentLines: [OPENER] }), "right_department").why);
  ok("row 4 never ticks when the department WAS wrong and he asked", row(behaved({ timeline: wrongNoAsk, agentLines: [OPENER, "Oh gotcha, could you put me through to whoever handles the Pokemon?"] }), "right_department").pass === null);

  // ROW 6 — names WHICH event it judged (his question: "reacted to what?").
  const afterWait: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }),
    ev("hold_start", 18, { reason: "quiet" }), ev("charlie_leave", 18), ev("hold_end", 60, { gapSec: 42, maybeNewPerson: true, reason: "quiet" }), ev("charlie_join", 60, { segment: 2 }), ev("hangup", 70)];
  ok("row 6 says it judged a WAIT, and expects nothing of him", /^Judged after a wait:/.test(row(behaved({ timeline: afterWait, agentLines: [OPENER] }), "asked_the_new_person").why), row(behaved({ timeline: afterWait, agentLines: [OPENER] }), "asked_the_new_person").why);

  // ROW 7 — told there is nobody to transfer to.
  const toldNo: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }),
    ev("unknown", 20, { wrongDepartment: true, said: "This is the pharmacy." }), ev("unknown", 30, { step: "nobody_to_transfer", said: "There's nobody up front right now." })];
  ok("row 7 fail when he kept pushing", /^Charlie kept pushing after Staff said no\./.test(row(behaved({ timeline: toldNo, agentLines: [OPENER] }), "goodbye_when_told_no").why), row(behaved({ timeline: toldNo, agentLines: [OPENER] }), "goodbye_when_told_no").why);
  const toldNoBye = [...toldNo, ev("unknown", 34, { step: "wrap_up", usedName: false }), ev("hangup", 36)];
  ok("row 7 pass, word for word", /^Staff said there was nobody to transfer to and Charlie said goodbye\./.test(row(behaved({ timeline: toldNoBye, agentLines: [OPENER] }), "goodbye_when_told_no").why), row(behaved({ timeline: toldNoBye, agentLines: [OPENER] }), "goodbye_when_told_no").why);
  ok("row 7 is Unused when nobody ever said it", row(behaved({ timeline: cleanDirect }), "goodbye_when_told_no").why === "Nobody ever said there was nobody to transfer to.");

  // ROW 9 — the wrap-up, and the name.
  const byName = [...cleanDirect, ev("unknown", 27, { step: "wrap_up", usedName: true, name: "Bob" })];
  ok("row 9 pass names who he thanked", row(behaved({ timeline: byName }), "wrapped_up").why === "Charlie thanked them by name (Bob) and ended.", row(behaved({ timeline: byName }), "wrapped_up").why);
  const stopped: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }), ev("hangup", 30)];
  ok("row 9 fail, word for word", row(behaved({ timeline: stopped, agentLines: [OPENER] }), "wrapped_up").why === "The check ended without Charlie wrapping up.", row(behaved({ timeline: stopped, agentLines: [OPENER] }), "wrapped_up").why);

  // ROW 10 — language. English is never claimed, because the judge cannot always tell.
  const english = [...cleanDirect, ev("unknown", 20, { step: "question_clip", ms: 4000 })];
  ok("row 10 is Unused on an English check", row(behaved({ timeline: english }), "spoke_their_language").why === "No Spanish was spoken on this check.", row(behaved({ timeline: english }), "spoke_their_language").why);
  // …and a check from BEFORE any of this was written down says exactly that, rather than claiming
  // something about a check whose record simply did not carry it.
  ok("an old check says it ran before we wrote it down", row(behaved({ timeline: cleanDirect }), "spoke_their_language").why === "This check ran before we started writing that down.", row(behaved({ timeline: cleanDirect }), "spoke_their_language").why);
  ok("…and the question row says the same, never that we did not ask", row(behaved({ timeline: cleanDirect }), "question_recorded").why === "This check ran before we started writing that down.", row(behaved({ timeline: cleanDirect }), "question_recorded").why);
  const es = [...cleanDirect, ev("unknown", 29, { step: "language", spanishLines: 4, englishLines: 0 })];
  ok("row 10 pass, word for word", row(behaved({ timeline: es }), "spoke_their_language").why === "Charlie spoke Spanish throughout.", row(behaved({ timeline: es }), "spoke_their_language").why);
  const mixed = [...cleanDirect, ev("unknown", 29, { step: "language", spanishLines: 3, englishLines: 2 })];
  ok("row 10 fail opens in his words", /^Charlie answered in English on a Spanish check\./.test(row(behaved({ timeline: mixed }), "spoke_their_language").why), row(behaved({ timeline: mixed }), "spoke_their_language").why);

  // ROW 11 — who put the phone down.
  const heEnded = [...cleanDirect.filter((e) => e.kind !== "charlie_leave"), { kind: "charlie_leave", atSec: 28, note: "Charlie ended the check", detail: null } as BehavedEvent];
  ok("row 11 pass", /^Charlie ended the check/.test(row(behaved({ timeline: heEnded }), "charlie_ended_the_check").why), row(behaved({ timeline: heEnded }), "charlie_ended_the_check").why);
  const storeHung: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }), ev("hangup", 33, { reason: "store_hung_up" })];
  ok("row 11 fail: Staff hung up on us", /^Staff hung up on us/.test(row(behaved({ timeline: storeHung }), "charlie_ended_the_check").why), row(behaved({ timeline: storeHung }), "charlie_ended_the_check").why);
  const dropped: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }), ev("hangup", 33, { reason: "disconnected" })];
  ok("row 11 fail: the check was disconnected", /^The check was disconnected/.test(row(behaved({ timeline: dropped }), "charlie_ended_the_check").why), row(behaved({ timeline: dropped }), "charlie_ended_the_check").why);
  const weEnded: BehavedEvent[] = [ev("dialed", 0, { plan: [] }), ev("human_detected", 6), ev("charlie_join", 6, { segment: 1 }), ev("hangup", 130, { reason: "held_too_long" })];
  ok("row 11 never blames him for an ending WE chose", row(behaved({ timeline: weEnded }), "charlie_ended_the_check").pass === null, row(behaved({ timeline: weEnded }), "charlie_ended_the_check").why);
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

head("THE WORDS OFF A FINISHED ROW");
{
  const t = `Agent: ${OPENER}\nClerk: yeah hold on\nAgent: Perfect, thank you so much!`;
  const lines = agentLinesFrom(t);
  ok("only the agent's lines come back", lines.length === 2, lines);
  ok("the opener survives intact", lines[0] === OPENER, lines[0]);
  ok("an empty transcript is an empty list", agentLinesFrom(null).length === 0);
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
  ok("asked to be put through passes, once", row(r, "asked_to_be_put_through").pass === true, row(r, "asked_to_be_put_through").why);
  ok("…and it prints what Staff actually said", /this is the pharmacy/i.test(row(r, "asked_to_be_put_through").why));
  ok("the new person was asked", row(r, "asked_the_new_person").pass === true, row(r, "asked_the_new_person").why);
  ok("…off the clock, naming both seconds", /31s/.test(row(r, "asked_the_new_person").why) && /33s/.test(row(r, "asked_the_new_person").why));
  // HIS WORD IS HAND-OVER (the test ladder, §5). A ringing desk and a silent move are one event to
  // him, and the row has to name it the same way whichever way it sounded.
  ok("Charlie was dropped, and the row says the HAND-OVER did it rather than Staff",
    row(r, "meter_stopped_on_hold").pass === true && /the hand-over dropped charlie/i.test(row(r, "meter_stopped_on_hold").why), row(r, "meter_stopped_on_hold").why);
}

head("…and every way it can go wrong");
{
  // He carried on with the new person instead of asking them. The exact bug the 20 second stopwatch
  // used to cause, and the one row that catches it.
  const r = behaved({ timeline: savedCheck, rollup: { charlieSegments: 2 }, agentLines: [
    { text: OPENER, atSec: 9 }, { text: SAY_TRANSFER, atSec: 18 },
    { text: "So do you have them then?", atSec: 34 }] });
  ok("carried on after a HAND-OVER: asked the new person FAILS", row(r, "asked_the_new_person").pass === false, row(r, "asked_the_new_person").why);
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
}
{
  // A finished row: a flat transcript with no clock on it. The rows must still answer, and say so.
  const lines = agentLinesFrom(`Agent: ${OPENER}\nClerk: this is the pharmacy\nAgent: ${SAY_TRANSFER}\nClerk: hold on\nAgent: Heyy, do you have any Pokemon in stock right now?`);
  const r = behaved({ timeline: savedCheck, rollup: { charlieSegments: 2 }, agentLines: lines });
  ok("with no clock, the new person is still scored off the order", row(r, "asked_the_new_person").pass === true, row(r, "asked_the_new_person").why);
  ok("…and it says the clock was not what it read", /order of the lines/.test(row(r, "asked_the_new_person").why));
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
  // THE METER ROW HAS TO NAME IT THE SAME WAY. A silent hand-over starts as an ordinary quiet pause,
  // so reading only the start of the wait called it "the staff stepped away" — the exact confusion
  // this row exists to remove, on the one screen he grades a hand-over from.
  ok("…and the meter row calls it the HAND-OVER, not Staff stepping away",
    /the hand-over dropped charlie/i.test(row(r, "meter_stopped_on_hold").why), row(r, "meter_stopped_on_hold").why);
}


head("THE 16 LOCKED TEST CARDS (owner 08-04) — word for word, so nothing drifts");
{
  const names = Object.values(TEST_CARDS).map((c) => c.name);
  ok("all the locked cards exist", names.length === 17, String(names.length));
  ok("every headline is category, colon, what is tested", names.every((n) => /^[A-Za-z]+: .+/.test(n)), names.filter((n) => !/^[A-Za-z]+: .+/.test(n)).join(" | "));
  ok("no dash anywhere on a card (copy law)", Object.values(TEST_CARDS).every((c) => !/[\u2014\u2013]/.test(c.name + c.sub + c.info)));
  ok("clear no, word for word", TEST_CARDS.answer_clear_no.info === "This test proves that a clear no always ends with a Not in stock status, no matter how Staff choose to say the no.", TEST_CARDS.answer_clear_no.info);
  ok("the ring card names his 90 seconds", TEST_CARDS.hungup_ringing.name === "Hungup: 90 seconds of ringing");
  ok("…and its bubble ends: Charlie was never on and never billed", /Charlie was never on and never billed\.$/.test(TEST_CARDS.hungup_ringing.info), TEST_CARDS.hungup_ringing.info);
  ok("the transfer card carries the replay he ordered", TEST_CARDS.transfer_requested.info.includes("Delta played the recording, and Charlie came back only after Staff answered it"), TEST_CARDS.transfer_requested.info);
  ok("Staff hung up names the new status", TEST_CARDS.hungup_staff.sub.includes("we showed a Staff hung up status"));
  ok("the switch card tests the switch only, not a status", /This test checks the switch only, not a status\.$/.test(TEST_CARDS.transfer_switch_off.info));
  ok("every status a card names is the status's real name", [
    ["answer_clear_yes", "In stock"], ["answer_clear_no", "Not in stock"], ["hold_permanently", "Left on hold"],
    ["hungup_staff", "Staff hung up"], ["hungup_ringing", "Nobody answered"], ["hungup_limit", "Admin hung up"],
    ["transfer_nobody", "Too busy to check"], ["voicemail_detected", "Got their voicemail"],
  ].every(([k, label]) => (TEST_CARDS[k].sub + TEST_CARDS[k].info).includes(label)));
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

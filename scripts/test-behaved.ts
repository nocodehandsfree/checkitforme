// THE PASS/FAIL ROWS THE OWNER READS ON ONE TEST CHECK, unit-tested with no app and no database (src/calls/behaved.ts).
//
// Run: ./node_modules/.bin/tsx scripts/test-behaved.ts
//
// Every assertion here is one line of the contract in docs/tasks/admin-testing-new-engine.md. The
// third state matters as much as the other two: a rule this check never put to the test must come
// back null, because a red cross there reads as "the engine broke" and a tick reads as "we checked".
import { behaved, agentLinesFrom, cardVerdict, TEST_CARDS, ROW_RULES, type BehavedKey, type BehavedRow, type BehavedEvent } from "../src/calls/behaved";

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
  // THE ADVERT RULING (owner, 08-19, off checks 398/399/400): a recorded voice inside the hold music
  // is the one sound the live ear can never refuse, so no hold is ever declared and this row used to
  // fail the check by name. When the after-call reader proved the recording (played_at_us on the
  // record), the row grades as if the hold had been caught when the recording started.
  const advertProved: BehavedEvent[] = [
    ev("dialed", 0, { plan: [] }), ev("human_detected", 8), ev("charlie_join", 9),
    ev("charlie_leave", 55), ev("hangup", 55),
    ev("unknown", 55, { step: "played_at_us", lines: [{ line: "Thanks for holding. Did you know we price match any local competitor?", why: "advertising", announcesWait: false }] }),
  ];
  ok("a judge-proven recording with no live hold PASSES the row", at(advertProved).pass === true, at(advertProved).why);
  ok("…and the why names the proof and the fair grading", /recording the store played/.test(at(advertProved).why) && /as if the hold had been caught/.test(at(advertProved).why), at(advertProved).why);
  ok("without the proof the same shape stays null, exactly as before", at(advertProved.filter((e) => (e.detail || {}).step !== "played_at_us")).pass === null);
  // CHECK 415: his session starts opening on the FIRST SOUND of the voice coming back (FIX 3), so
  // the reconnect row is drawn ABOVE the wait's own ending row and the old reading called a check he
  // answered "never reconnected". He is back if he is on the line when the wait ends.
  const earlyBack: BehavedEvent[] = [
    ev("dialed", 0, { plan: [] }), ev("human_detected", 9), ev("charlie_join", 9, { segment: 1 }),
    ev("hold_start", 10, { reason: "music" }), ev("charlie_leave", 11, { strategy: "reopen" }),
    ev("charlie_join", 35, { segment: 2 }), ev("hold_end", 38, { gapSec: 28 }),
    ev("verdict", 55), ev("hangup", 56),
  ];
  ok("a reconnect that started before the wait's ending row still passes", at(earlyBack, { charlieSegments: 2 }).pass === true, at(earlyBack).why);
  // AND THE FALSE START DOES NOT COUNT. The advert's own voice opens a session too, and it is
  // dropped again seconds later; if nobody ever comes back after that, he never reconnected.
  const falseStartOnly: BehavedEvent[] = [
    ev("dialed", 0, { plan: [] }), ev("human_detected", 9), ev("charlie_join", 9, { segment: 1 }),
    ev("hold_start", 10, { reason: "music" }), ev("charlie_leave", 11, { strategy: "reopen" }),
    ev("charlie_join", 17, { segment: 2 }), ev("charlie_leave", 21, { strategy: "reopen" }),
    ev("hold_end", 38, { gapSec: 28 }), ev("hangup", 40),
  ];
  ok("…but a false start that was dropped again, with nobody ever back, still fails", at(falseStartOnly).pass === false, at(falseStartOnly).why);
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


head("THE LOCKED TEST CARDS (owner 08-04, the exact product card he added 08-06, and the two he added 08-07) — word for word, so nothing drifts");
{
  const names = Object.values(TEST_CARDS).map((c) => c.name);
  ok("all the locked cards exist", names.length === 21, String(names.length));
  // THE ADVERT TEST HAS ITS OWN NAME AND NOBODY ELSE'S GRADING (owner's order, 08-19). Scenes 20
  // and 21 are still "Hold: music"; only scene 22's card is renamed, and its rows, its status and
  // its floor are the SAME values, spread from one object so they can never drift apart.
  ok("the advert test is named for the advert", TEST_CARDS.hold_music_advert.name === "Hold: music with advert", TEST_CARDS.hold_music_advert.name);
  ok("…and the plain music test keeps its own name", TEST_CARDS.hold_music.name === "Hold: music", TEST_CARDS.hold_music.name);
  ok("…and the two are graded identically, name apart",
    TEST_CARDS.hold_music_advert.needs.join(",") === TEST_CARDS.hold_music.needs.join(",")
    && TEST_CARDS.hold_music_advert.status === TEST_CARDS.hold_music.status
    && TEST_CARDS.hold_music_advert.meter?.profitFloorPct === TEST_CARDS.hold_music.meter?.profitFloorPct);
  // The two he added 08-07. The wrap-up used to be filed under the 4 minute limit, which is our own
  // safety net and a different test; Delta failing had never been tested on purpose at all.
  ok("the wrap-up card is his own words", TEST_CARDS.wrapup_never_answered.name === "Wrapup: they never answered"
    && TEST_CARDS.wrapup_never_answered.sub === "Staff rambled and would not give us an answer, so Charlie wrapped up and ended the check.");
  ok("the Delta card is his own words", TEST_CARDS.delta_failed.name === "Delta: failed"
    && TEST_CARDS.delta_failed.info === "This test proves Charlie will ask the store the first question if Delta fails.");
  // EVERY CARD SAYS WHAT IT PROVES. Two shipped with an empty bubble, so a test could be looked at
  // with nothing telling you what passing it means. Three older bubbles say it in the owner's own
  // earlier phrasing rather than opening with "This test proves", which is his copy and is left alone.
  ok("no bubble is empty", Object.values(TEST_CARDS).every((c) => c.info.trim().length > 20),
    Object.entries(TEST_CARDS).filter(([, c]) => c.info.trim().length <= 20).map(([k]) => k).join(" | "));
  ok("the 4 minute limit says the customer WAS charged", /the customer was charged/.test(TEST_CARDS.hungup_limit.info), TEST_CARDS.hungup_limit.info);
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
    ["exact_product", "In stock"],
  ].every(([k, label]) => (TEST_CARDS[k].sub + TEST_CARDS[k].info).includes(label)));
}

head("THE SIGNED-OFF ENDING COUNTS AS CHARLIE ENDING THE CHECK (owner 08-14, off check 363)");
{
  // Since 08-04 a finished check is ended by OUR OWN hangup the moment the goodbye is out and the
  // line goes quiet (`signed_off`), so a slow store can never bill us an extra minute. That is the
  // clean ending nearly every good check has now, and the row used to answer "nothing says who
  // ended it", which failed a perfect check by name on the card.
  const rows = behaved({ timeline: [
    { kind: "human_detected", atSec: 8 },
    { kind: "charlie_join", atSec: 9 },
    { kind: "hangup", atSec: 41, detail: { reason: "signed_off" } },
    { kind: "hangup", atSec: 41, detail: { reason: "completed" } },
  ] });
  const r = rows.find((x) => x.key === "charlie_ended_the_check")!;
  ok("a signed_off hangup is Charlie ending the check", r.pass === true, r.why);
  ok("…and the row says we put the phone down for him", /put the phone down for him at 41s/.test(r.why), r.why);
  // The store hanging up on us is still a fail, exactly as before.
  const bad = behaved({ timeline: [
    { kind: "human_detected", atSec: 8 }, { kind: "charlie_join", atSec: 9 },
    { kind: "hangup", atSec: 100, detail: { reason: "store_hung_up" } },
  ] }).find((x) => x.key === "charlie_ended_the_check")!;
  ok("the store hanging up on us still fails the row", bad.pass === false, bad.why);
}

head("EVERY CARD NAMES WHAT MUST BE GREEN TO PASS (owner 08-07, item 9)");
{
  const KEYS = new Set<string>(Object.keys(ROW_RULES));
  ok("every card names its list, even when the list is empty",
    Object.values(TEST_CARDS).every((c) => Array.isArray(c.needs)),
    Object.entries(TEST_CARDS).filter(([, c]) => !Array.isArray(c.needs)).map(([k]) => k).join(" | "));
  ok("every row a card names is one of the eleven, never an invented one",
    Object.values(TEST_CARDS).every((c) => c.needs.every((k) => KEYS.has(k))),
    Object.entries(TEST_CARDS).flatMap(([k, c]) => c.needs.filter((n) => !KEYS.has(n)).map((n) => `${k}:${n}`)).join(" | "));

  // HIS OWN EXAMPLE, WORD FOR WORD (08-07): "Answer: clear yes is Handed to Charlie, the question
  // played as a recording, Charlie warmed up in time, Charlie wrapped up, Charlie ended the check,
  // and the check comes back In stock."
  ok("clear yes needs exactly the five rows he listed",
    TEST_CARDS.answer_clear_yes.needs.join(",") === "handed_to_charlie,question_recorded,warmed_up_in_time,wrapped_up,charlie_ended_the_check",
    TEST_CARDS.answer_clear_yes.needs.join(","));
  ok("…and the check comes back In stock", TEST_CARDS.answer_clear_yes.status === "in_stock", String(TEST_CARDS.answer_clear_yes.status));

  // DELTA: FAILED EXISTS TO MAKE THE RECORDING FAIL, so requiring the recording to have played would
  // make the one test that proves the fallback unpassable by design.
  ok("Delta: failed does NOT require the recording to have played",
    !TEST_CARDS.delta_failed.needs.includes("question_recorded"));
  // The switch test names no status, in his own words on the card.
  ok("the switch test names no status", TEST_CARDS.transfer_switch_off.status === null);
  ok("the wrap-up card names the new status", TEST_CARDS.wrapup_never_answered.status === "no_straight_answer");

  // NOTHING ABOUT MONEY IN ANY ROW (owner 08-07, item 10): "Charlie speaking 23 seconds or less is a
  // margin goal, never a test." A price or a talk-time budget in a pass or fail row would turn a
  // margin miss into a red cross on the engine, which is a different thing entirely.
  const MONEY = /\bcent|\bcost|\bprice|\bcheap|\bbudget|\bmargin|\bprofit|\bbill(ed|ing)?\b|\b23 seconds\b|¢|\$/i;
  const rowWords = (Object.keys(ROW_RULES) as BehavedKey[]).map((k) => `${k} ${ROW_RULES[k]}`);
  ok("no behavior row's rule talks about money or the 23 second goal",
    rowWords.every((w) => !MONEY.test(w)), rowWords.filter((w) => MONEY.test(w)).join(" | "));

  // AND THE GRADING ITSELF.
  const rows = (over: Partial<Record<BehavedKey, boolean | null>>): BehavedRow[] =>
    (Object.keys(ROW_RULES) as BehavedKey[]).map((key) => ({ key, label: key, tip: "", why: "", pass: over[key] ?? null }));
  const green = { handed_to_charlie: true, question_recorded: true, warmed_up_in_time: true, wrapped_up: true, charlie_ended_the_check: true } as const;
  ok("a clear yes with all five rows green and In stock PASSES",
    cardVerdict(TEST_CARDS.answer_clear_yes, rows(green), "in_stock")?.pass === true);
  ok("…and FAILS on the right status with the wrong answer on the screen",
    cardVerdict(TEST_CARDS.answer_clear_yes, rows(green), "not_in_stock")?.pass === false);
  {
    const v = cardVerdict(TEST_CARDS.answer_clear_yes, rows({ ...green, wrapped_up: false }), "in_stock");
    ok("a named row going red fails the card and is named", v?.pass === false && v.missing.join() === "wrapped_up", JSON.stringify(v?.missing));
  }
  {
    // A ROW THE CARD NAMED AND THE CHECK NEVER EXERCISED IS A FAIL, not a pass by omission. It is
    // hidden from the screen, so silently letting it slide is how a green test hides a broken engine.
    const v = cardVerdict(TEST_CARDS.answer_clear_yes, rows({ ...green, warmed_up_in_time: null }), "in_stock");
    ok("a named row the check never tested fails the card, by name", v?.pass === false && v.missing.join() === "warmed_up_in_time", JSON.stringify(v?.missing));
  }
  ok("a card that names no status is never marked down for one",
    cardVerdict(TEST_CARDS.transfer_switch_off, rows({ handed_to_charlie: true, question_recorded: true, wrapped_up: true, charlie_ended_the_check: true }), "anything_at_all")?.pass === true);
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// DID THE NEW ENGINE BEHAVE — the four pass/fail rows the owner reads on one test check.
//
// WHY (owner, 07-29): he places a test check on the Fun store and the only way to know whether the
// new engine did the four things it was built to do was to read a receipt line by line, at night, on
// a phone. Three of the four failures are invisible in the verdict: a second question, a keypad tone
// fired at a person who is already talking, and an agent left billing through a two-minute hold all
// end in a perfectly good answer. This module turns the record the engine already writes into four
// words he can read in one glance.
//
// DESIGN RULES
//  1. PURE. No db, no config, no clock, no vendor names. It takes a receipt's timeline, its roll-up
//     and what the agent said, and returns four rows. Unit-testable without booting the app
//     (scripts/test-behaved.ts).
//  2. NO NEW LISTENING. Every judgement comes off events the engine ALREADY writes — the closed set
//     of sixteen kinds in docs/specs/admin-ops-dashboard/CONTRACT.md §8. Nothing here asks the
//     calling engine for one new field.
//  3. THREE STATES, NOT TWO. `pass: null` means this check never put the rule to the test — nobody
//     put us on hold, nobody came on the line, nothing was written down. A cross there reads as "the
//     engine broke" and a tick reads as "we checked and it was fine"; both are lies. Same law the
//     dashboard already runs on: a cost that was never stamped is never printed as nought.
//
// The order is fixed and matches the screen the owner walked (docs/tasks/admin-testing-new-engine.md).
// He called the fifth and sixth on 07-30, for the wrong-department save, so they are APPENDED: the four
// he already knows keep their places and their meaning, and the two new ones sit under them.
//
// THE TRAP THE FIFTH ROW EXPOSED. "Asked once" counted asks per CHECK. That was right while a check
// only ever had one person on it. The save puts a SECOND person on the line, and asking them is the
// whole point — so the old rule would have printed a red cross on a check that behaved perfectly. The
// rule is one question PER PERSON, and the allowance grows by one every time somebody new picks up.

export type BehavedKey = "asked_once" | "no_keypad_at_person" | "meter_stopped_on_hold" | "mapping_held"
  | "asked_to_be_put_through" | "asked_the_new_person";

export interface BehavedRow {
  key: BehavedKey;
  /** The label on the row. Plain words, per the admin copy guide. */
  label: string;
  /** The one-line tooltip every admin control ships. Says what would count as a fail. */
  tip: string;
  /** true = it behaved · false = it did not · null = this check never put the rule to the test. */
  pass: boolean | null;
  /** One plain sentence saying what the record actually showed, with its seconds. */
  why: string;
}

/** One line of the timeline as both receipt routes already return it. */
export interface BehavedEvent {
  kind: string;
  atSec?: number | null;
  detail?: Record<string, unknown> | null;
}

/** The slice of the roll-up this reads. Everything optional: an older row stamped none of it. */
export interface BehavedSums {
  stepsFired?: number | null;
  stepsOnPause?: number | null;
  charlieSegments?: number | null;
}

/** One thing the agent said. `atSec` is null on a finished row: the stored transcript is flat text with
 *  no clock on it. A LIVE check has the second, which is the one the owner watches while he tests. */
export interface AgentTurn { text: string; atSec?: number | null }

export interface BehavedInput {
  timeline: BehavedEvent[];
  rollup?: BehavedSums | null;
  /** Every line the agent said, in order. Text only — no audio, on any path. Plain strings are
   *  accepted so a caller with no clock (a finished row) does not have to invent one. */
  agentLines?: Array<string | AgentTurn>;
}

const asTurn = (l: string | AgentTurn): AgentTurn =>
  typeof l === "string" ? { text: l.trim(), atSec: null } : { text: String(l.text || "").trim(), atSec: l.atSec ?? null };

/**
 * THE STOCK QUESTION, as opposed to a follow-up. The opener always names the thing we are asking
 * about ("do you have any Pokémon in stock right now?", "do you guys carry Pokémon cards at all?").
 * The follow-ups deliberately do not — "any idea what day that usually lands?", "do you know the
 * name of the set?", "does that come in a pack?" — which is exactly what makes them countable apart.
 * One stock question per check is the whole rule (ONE QUESTION, THEN WRAP).
 */
const ASK = /\b(in stock|stock right now|carry|carrying|have any|got any|have some|any left)\b/i;
const isAsk = (line: string) => /\?/.test(line) && ASK.test(line);

/** An opening greeting. A second one on the same check is the re-greeting after a hold. */
const isGreeting = (line: string) => /^\s*(hi\b|hey\b|hello\b|good (morning|afternoon|evening)\b)/i.test(line);

/** What the agent said, pulled out of the one flat transcript string a finished row stores. */
export function agentLinesFrom(transcript: string | null | undefined): string[] {
  return String(transcript || "")
    .split(/(?=(?:Clerk|Agent|Staff):\s)/)
    .map((s) => s.trim())
    .filter((s) => /^Agent:/i.test(s))
    .map((s) => s.replace(/^Agent:\s*/i, "").trim())
    .filter(Boolean);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function behaved(input: BehavedInput): BehavedRow[] {
  const tl = (input.timeline || []).filter(Boolean);
  const sec = (e: BehavedEvent | undefined) => (e ? Number(e.atSec ?? 0) : null);
  const first = (kind: string) => tl.find((e) => e.kind === kind);
  const every = (kind: string) => tl.filter((e) => e.kind === kind);
  const turns = (input.agentLines || []).map(asTurn).filter((t) => t.text);
  const sums = input.rollup || {};
  // SOMEBODY NEW PICKED UP. Written by the engine on every wait that ended with a different person:
  // a hand-over is always one of these, and so is a long enough walk away. Each one buys the agent
  // one more question, because the person who just answered never heard the first.
  const newPeople = tl.filter((e) => e.kind === "hold_end" && (e.detail || {}).maybeNewPerson === true);
  // Where we landed on a desk that could not answer. Read off the words on the check itself.
  const wrongDept = tl.find((e) => (e.detail || {}).wrongDepartment === true) || null;

  return [
    askedOnce(turns, newPeople.length),
    noKeypadAtPerson(sec(first("human_detected")), every("alpha_press")),
    meterStoppedOnHold(tl, sums),
    mappingHeld(tl, sums, sec(first("human_detected")), sec(first("charlie_join"))),
    askedToBePutThrough(turns, wrongDept),
    askedTheNewPerson(turns, newPeople),
  ];
}

/**
 * ONE QUESTION PER PERSON. Not one per check: a hand-over puts somebody new on the line who never
 * heard the first question, and asking them is the save working, not a fault. The allowance is one
 * plus however many times somebody new picked up.
 */
function askedOnce(turns: AgentTurn[], newPeople: number): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_once", label: "Asked once", pass, why,
    tip: "One question per person on the line. A second ask with nobody new is a fail; asking again after a hand-over is not.",
  });
  if (!turns.length) return row(null, "Nothing the agent said was written down on this check, so there is nothing to count.");
  const asks = turns.filter((t) => isAsk(t.text)), greets = turns.filter((t) => isGreeting(t.text));
  const allowed = 1 + newPeople;
  if (asks.length > allowed) {
    return row(false, newPeople
      ? `${plural(newPeople, "person", "people")} came on the line and the agent asked for the stock ${plural(asks.length, "time", "times")}, which is ${asks.length - allowed} more than there were people to ask.`
      : `The agent asked for the stock ${plural(asks.length, "time", "times")} on one check.`);
  }
  if (greets.length > 1 + newPeople) return row(false, `The agent opened with a greeting ${plural(greets.length, "time", "times")}, so somebody was greeted twice.`);
  if (asks.length >= 1) {
    // A check with a hand-over and only ONE ask still passes HERE: nobody was asked twice. Whether the
    // new person was asked at all is its own row below, so one miss never prints two crosses.
    return row(true, newPeople && asks.length > 1
      ? `${plural(asks.length, "question", "questions")} across ${plural(1 + newPeople, "person", "people")}, so nobody was asked twice.`
      : "One question, then the wrap.");
  }
  return row(null, "No stock question was recognised in what the agent said, so this one cannot be counted either way.");
}

function noKeypadAtPerson(humanAt: number | null, presses: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "no_keypad_at_person", label: "No keypad at a person", pass, why,
    tip: "Zero keypad presses after a person was heard.",
  });
  if (humanAt == null) return row(null, "Nobody ever came on the line, so there was no person to beep at.");
  const after = presses.filter((e) => Number(e.atSec ?? 0) >= humanAt);
  if (!after.length) return row(true, `A person answered at ${humanAt}s and not one key was pressed after that.`);
  return row(false, `${plural(after.length, "key press", "key presses")} landed after a person answered at ${humanAt}s.`);
}

/**
 * The agent must CLOSE when the store walks away and open a fresh part of the same check when
 * somebody comes back. Matched by position on the timeline, never by second: the events are written
 * in order, and two of them can share a second, so "a close at or after this hold" would happily
 * match a close that belongs to an earlier stretch of the same call.
 */
function meterStoppedOnHold(tl: BehavedEvent[], sums: BehavedSums): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "meter_stopped_on_hold", label: "Meter stopped on hold", pass, why,
    tip: "Charlie closed when the hold started and came back as a new part of the same check. The parts are on the steps below.",
  });
  const holdIdx = tl.map((e, i) => (e.kind === "hold_start" ? i : -1)).filter((i) => i >= 0);
  if (!holdIdx.length) return row(null, "Nobody put us on hold on this check, so the meter was never asked to stop.");
  const nextOf = (from: number, kind: string) => tl.findIndex((e, i) => i > from && e.kind === kind);
  // A WAIT AND A HAND-OVER ARE THE SAME MECHANISM AND DIFFERENT EVENTS TO HIM. Both stop the meter;
  // only one of them means somebody else is about to pick up. Say which one he is reading.
  const anyTransfer = holdIdx.some((h) => (tl[h].detail || {}).reason === "transfer");
  const word = anyTransfer ? "the hand-over" : "the hold";
  for (const h of holdIdx) {
    const at = Number(tl[h].atSec ?? 0);
    const why = (tl[h].detail || {}).reason === "transfer" ? "Handed over" : "Put on hold";
    const end = nextOf(h, "hold_end");
    const leave = nextOf(h, "charlie_leave");
    // The close has to land inside the hold. A close that only turns up after somebody came back is
    // the end of the call, not the meter stopping for the wait.
    if (leave < 0 || (end >= 0 && leave > end)) return row(false, `${why} at ${at}s and the agent stayed on the line, billing through the wait.`);
    if (end < 0) continue; // held to the end of the call — closing was the whole job
    if (nextOf(end, "charlie_join") < 0) return row(false, `The agent closed at ${at}s and never came back when somebody returned at ${Number(tl[end].atSec ?? 0)}s.`);
  }
  const parts = Number(sums.charlieSegments ?? 0);
  return row(true, parts > 1
    ? `Closed for ${word} and came back as part ${parts} of the same check.`
    : `Closed for ${word} and came back as a new part of the same check.`);
}

/** What the agent says when it asks to be handed on. Never "transfer me to the pharmacy": the ask is
 *  always toward somebody who CAN answer, which is what these shapes have in common. */
const ASK_TRANSFER = /\b(?:put (?:me|us) (?:through|thru)|transfer (?:me|us)|connect me|get me (?:through|over|to)|(?:who|whoever|someone|somebody|anyone) (?:who )?(?:handles|deals with|knows about|looks after|takes care of)|speak (?:to|with) (?:someone|somebody|whoever))\b/i;

/**
 * THE SAVE ITSELF. Only ever asked when the check landed on a desk that could not answer, so on every
 * ordinary check this is a gray dash — there was nothing to be saved from.
 */
function askedToBePutThrough(turns: AgentTurn[], wrongDept: BehavedEvent | null): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_to_be_put_through", label: "Asked to be put through", pass, why,
    tip: "Only counts when Staff said we reached the wrong department. Then the agent must ask once to be handed on, never hang up and never make Staff go and look.",
  });
  if (!wrongDept) return row(null, "Nobody said we had reached the wrong department, so there was nothing to be put through from.");
  const said = String((wrongDept.detail || {}).said || "").trim();
  const at = wrongDept.atSec == null ? "" : ` at ${Number(wrongDept.atSec)}s`;
  const heard = said ? ` Staff said "${said}".` : "";
  if (!turns.length) return row(null, `We landed in the wrong department${at}, but nothing the agent said was written down.${heard}`);
  const asks = turns.filter((t) => ASK_TRANSFER.test(t.text));
  if (!asks.length) return row(false, `We landed in the wrong department${at} and the agent never asked to be put through.${heard}`);
  if (asks.length > 1) return row(false, `The agent asked to be put through ${plural(asks.length, "time", "times")}, and once is the rule.${heard}`);
  return row(true, `We landed in the wrong department${at} and the agent asked once to be put through.${heard}`);
}

/**
 * AND THE LAST STEP, which is the one that used to be decided by a stopwatch. Somebody new is on the
 * line and never heard the question. A LIVE check has the second on every line, so this is exact; a
 * finished one has a flat transcript with no clock, and then the order of the lines is all there is.
 */
function askedTheNewPerson(turns: AgentTurn[], newPeople: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_the_new_person", label: "Asked the new person", pass, why,
    tip: "When somebody new picks up they never heard the question, so the agent must ask them. Carrying on mid answer with a stranger is a fail.",
  });
  if (!newPeople.length) return row(null, "The same person was on the line the whole check, so nobody new had to be asked.");
  if (!turns.length) return row(null, "Somebody new came on, but nothing the agent said was written down.");
  const back = Number(newPeople[0].atSec ?? 0);
  const asks = turns.filter((t) => isAsk(t.text));
  const timed = turns.some((t) => t.atSec != null);
  if (timed) {
    const after = asks.filter((t) => t.atSec != null && Number(t.atSec) >= back);
    if (!after.length) return row(false, `Somebody new came on at ${back}s and the agent carried on without asking them.`);
    return row(true, `Somebody new came on at ${back}s and the agent asked them at ${Number(after[0].atSec)}s.`);
  }
  // No clock on this record. Two questions and a new person is the save working; one is not.
  if (asks.length > 1) return row(true, `Somebody new came on at ${back}s and the agent asked again, read off the order of what was said rather than the clock.`);
  return row(false, `Somebody new came on at ${back}s and only one question was asked on the whole check, so they were never asked.`);
}

/**
 * A direct-pickup store must have nothing fired at it and the agent must open AT the person — the
 * silent-agent guard. A mapped store must fire every step on the store's own recording ending, never
 * on a stopwatch, because a stopwatch is what talks over a menu that paused a beat longer today.
 */
function mappingHeld(tl: BehavedEvent[], sums: BehavedSums, humanAt: number | null, joinAt: number | null): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "mapping_held", label: "Mapping held", pass, why,
    tip: "Direct store: no steps fired and the agent opened at the person. Mapped store: every step fired on the store's recording, never the clock.",
  });
  const dialed = tl.find((e) => e.kind === "dialed");
  if (!dialed) return row(null, "The start of this check was never written down, so what the map planned is unknown.");
  const d = dialed.detail || {};
  const plan = Array.isArray(d.plan) ? (d.plan as unknown[]) : null;
  const plannedLane = typeof d.plannedLane === "string" ? d.plannedLane : null;
  const mapped = plan ? plan.length > 0 : plannedLane === "alpha" || plannedLane === "bravo";
  const steps = tl.filter((e) => e.kind === "alpha_press" || e.kind === "bravo_say");
  const fired = Number(sums.stepsFired ?? steps.length);
  const onPause = Number(sums.stepsOnPause ?? steps.filter((e) => (e.detail || {}).via === "prompt").length);

  if (!mapped) {
    if (fired > 0) return row(false, `This store answers direct, and ${plural(fired, "menu step", "menu steps")} still fired at it.`);
    if (joinAt == null) return row(null, "No steps fired, and the agent never joined, so there was nothing to open at.");
    if (humanAt == null) return row(false, `The agent opened at ${joinAt}s with nobody on the line.`);
    if (joinAt >= humanAt) return row(true, `No menu steps, and the agent opened at ${joinAt}s, when the person answered.`);
    return row(false, `The agent opened at ${joinAt}s, ${humanAt - joinAt}s before a person was there.`);
  }
  const planned = plan ? plan.length : fired;
  if (fired === 0) return row(false, `The map has ${plural(planned, "step", "steps")} for this store and none of them fired.`);
  if (onPause === fired) return row(true, `All ${plural(fired, "step", "steps")} fired on the store's own recording, never on the clock.`);
  return row(false, `${fired - onPause} of ${plural(fired, "step", "steps")} fired on the clock instead of the store's recording.`);
}

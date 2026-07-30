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
// The order of the four is fixed and matches the screen the owner walked (docs/tasks/
// admin-testing-new-engine.md). Adding a fifth means changing the screen, which is his call.

export type BehavedKey = "asked_once" | "no_keypad_at_person" | "meter_stopped_on_hold" | "mapping_held";

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

export interface BehavedInput {
  timeline: BehavedEvent[];
  rollup?: BehavedSums | null;
  /** Every line the agent said, in order. Text only — no audio, on any path. */
  agentLines?: string[];
}

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
  const lines = (input.agentLines || []).map((s) => String(s || "").trim()).filter(Boolean);
  const sums = input.rollup || {};

  return [
    askedOnce(lines),
    noKeypadAtPerson(sec(first("human_detected")), every("alpha_press")),
    meterStoppedOnHold(tl, sums),
    mappingHeld(tl, sums, sec(first("human_detected")), sec(first("charlie_join"))),
  ];
}

function askedOnce(lines: string[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_once", label: "Asked once", pass, why,
    tip: "One question, then the wrap. A second ask after a hold is a fail.",
  });
  if (!lines.length) return row(null, "Nothing the agent said was written down on this check, so there is nothing to count.");
  const asks = lines.filter(isAsk), greets = lines.filter(isGreeting);
  if (asks.length > 1) return row(false, `The agent asked for the stock ${plural(asks.length, "time", "times")} on one check.`);
  if (greets.length > 1) return row(false, `The agent opened with a greeting ${plural(greets.length, "time", "times")}, so somebody was greeted twice.`);
  if (asks.length === 1) return row(true, "One question, then the wrap.");
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
  for (const h of holdIdx) {
    const at = Number(tl[h].atSec ?? 0);
    const end = nextOf(h, "hold_end");
    const leave = nextOf(h, "charlie_leave");
    // The close has to land inside the hold. A close that only turns up after somebody came back is
    // the end of the call, not the meter stopping for the wait.
    if (leave < 0 || (end >= 0 && leave > end)) return row(false, `Put on hold at ${at}s and the agent stayed on the line, billing through the wait.`);
    if (end < 0) continue; // held to the end of the call — closing was the whole job
    if (nextOf(end, "charlie_join") < 0) return row(false, `The agent closed for the hold at ${at}s and never came back when somebody returned at ${Number(tl[end].atSec ?? 0)}s.`);
  }
  const parts = Number(sums.charlieSegments ?? 0);
  return row(true, parts > 1
    ? `Closed for the hold and came back as part ${parts} of the same check.`
    : "Closed for the hold and came back as a new part of the same check.");
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

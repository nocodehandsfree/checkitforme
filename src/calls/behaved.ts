// CHARLIE BEHAVIOR — the pass/fail rows the owner reads on one test check.
//
// WHY (owner, 07-29): he places a test check and the only way to know whether Charlie did what he was
// built to do was to read the whole thing line by line, at night, on a phone. The failures that matter
// are invisible in the answer: Charlie left billing through a two minute wait, and Charlie answering
// a stranger mid sentence after a transfer, both end in a perfectly good answer.
//
// ONLY CHARLIE (owner 07-30). Walking a phone menu is not Charlie and it is not a test: it either
// works or the check fails, and the check failing is the report. Three rows went for that reason —
// "Asked once" (the workflow locks one question), "Mapping held" and "No keypad detected" (both are
// the map doing its job, not Charlie doing his). If a row cannot tell him something about Charlie
// that a working check would hide, it does not belong on this card.
//
// DESIGN RULES
//  1. PURE. No db, no config, no clock, no vendor names. It takes a check's steps, its roll-up and
//     what Charlie said, and returns the rows. Unit-testable without booting the app
//     (scripts/test-behaved.ts).
//  2. NO NEW LISTENING. Every judgement comes off events the engine ALREADY writes — the closed set
//     of sixteen kinds in docs/specs/admin-ops-dashboard/CONTRACT.md §8. Nothing here asks the
//     calling engine for one new field.
//  3. THREE STATES, NOT TWO. `pass: null` means this check never put the rule to the test — nobody
//     put us on hold, nobody came on the line, nothing was written down. A cross there reads as "the
//     engine broke" and a tick reads as "we checked and it was fine"; both are lies. Same law the
//     dashboard already runs on: a cost that was never stamped is never printed as nought.
//
// ONLY ROWS THAT CAN REALLY FAIL (owner 07-30). "Asked once" was deleted: Charlie is locked to one
// question by the workflow and has never done otherwise, so it ticked on every check and said nothing.
// The one case where a SECOND question is right is a transfer, and "Re-asked after transfer" judges
// that. A row that can only ever tick is not a check, it is decoration.

// THE ONE PLACE THE WORDS LIVE. The runtime reads this SAME test to decide the next wait is a
// hand-over; grading it here off a second copy is how a screen ends up disagreeing with the engine it
// is grading. The only import in this file, and it carries no dependencies of its own, so rule 1
// still holds: no db, no config, no clock.
import { askedToBePutThrough as saysPutMeThrough } from "../voice/prompts";

export type BehavedKey = "meter_stopped_on_hold" | "asked_to_be_put_through" | "asked_the_new_person";

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

/** The slice of the roll-up this reads. Optional: an older row stamped none of it. */
export interface BehavedSums {
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
 * name of the set?", "does that come in a pack?" — which is what makes them countable apart. It is
 * what "Re-asked after transfer" looks for: the question, asked again, to whoever picked up.
 */
const ASK = /\b(in stock|stock right now|carry|carrying|have any|got any|have some|any left)\b/i;
const isAsk = (line: string) => /\?/.test(line) && ASK.test(line);

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
  // SOMEBODY NEW *MAY* HAVE PICKED UP versus somebody new CERTAINLY DID, and the two are not the
  // same row. A long walk away sets `maybeNewPerson` because it might be a different person — the
  // agent is told, and then HE decides from the voice. A hand-over is not a maybe: whoever answers
  // the next desk never heard the question.
  //
  // So the allowance to ask again is generous (any maybe), and the REQUIREMENT to ask again is strict
  // (a hand-over only). Getting that backwards prints a red cross on a check where Staff walked to
  // the shelf, came back themselves, and the agent rightly carried on — which would be a lie about
  // the engine, on the one screen he tests from.
  const maybeNew = tl.filter((e) => e.kind === "hold_end" && (e.detail || {}).maybeNewPerson === true);
  // A HAND-OVER IS NOT ALWAYS A RINGING DESK. Plenty of stores put you on a silent line, which sounds
  // to the ear exactly like somebody stepping away. The runtime already knows better, because the
  // agent ASKED to be put through, and it stamps the wait accordingly — so read the fact it wrote
  // rather than the sound it heard.
  const handedOver = maybeNew.filter((e) => {
    const d = e.detail || {};
    return d.reason === "transfer" || d.afterAskingToBePutThrough === true;
  });
  // Where we landed on a desk that could not answer. Read off the words on the check itself.
  const wrongDept = tl.find((e) => (e.detail || {}).wrongDepartment === true) || null;

  return [
    meterStoppedOnHold(tl, sums),
    askedToBePutThrough(turns, wrongDept),
    askedTheNewPerson(turns, handedOver, maybeNew),
  ];
}

/**
 * The agent must CLOSE when the store walks away and open a fresh part of the same check when
 * somebody comes back. Matched by position on the timeline, never by second: the events are written
 * in order, and two of them can share a second, so "a close at or after this hold" would happily
 * match a close that belongs to an earlier stretch of the same call.
 */
function meterStoppedOnHold(tl: BehavedEvent[], sums: BehavedSums): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "meter_stopped_on_hold", label: "Meter stopped", pass, why,
    tip: "Charlie is dropped the moment Staff walk away or hand us on, so we stop paying, and comes back as a new part of the same check.",
  });
  const holdIdx = tl.map((e, i) => (e.kind === "hold_start" ? i : -1)).filter((i) => i >= 0);
  if (!holdIdx.length) return row(null, "Nobody dropped Charlie on this check.");
  const nextOf = (from: number, kind: string) => tl.findIndex((e, i) => i > from && e.kind === kind);
  // A WAIT AND A HAND-OVER ARE THE SAME MECHANISM AND DIFFERENT EVENTS TO HIM. Both stop the meter;
  // only one of them means somebody else is about to pick up. Say which one he is reading.
  const anyTransfer = holdIdx.some((h) => (tl[h].detail || {}).reason === "transfer");
    for (const h of holdIdx) {
    const at = Number(tl[h].atSec ?? 0);
    const who = (tl[h].detail || {}).reason === "transfer" ? "Transfer at" : "Staff walked away at";
    const end = nextOf(h, "hold_end");
    const leave = nextOf(h, "charlie_leave");
    // The close has to land inside the hold. A close that only turns up after somebody came back is
    // the end of the call, not the meter stopping for the wait.
    if (leave < 0 || (end >= 0 && leave > end)) return row(false, `${who} at ${at}s. Charlie NOT dropped, meter kept running through the wait.`);
    if (end < 0) continue; // held to the end of the call — closing was the whole job
    if (nextOf(end, "charlie_join") < 0) return row(false, `Charlie dropped at ${at}s. Never reconnected when Staff returned at ${Number(tl[end].atSec ?? 0)}s.`);
  }
  const parts = Number(sums.charlieSegments ?? 0);
  const who = anyTransfer ? "The transfer" : "The staff";
  return row(true, parts > 1
    ? `${who} dropped Charlie, and the meter successfully stopped. Reconnected as part ${parts} of the same check.`
    : `${who} dropped Charlie, and the meter successfully stopped.`);
}

/**
 * THE SAVE ITSELF. Only ever asked when the check landed on a desk that could not answer, so on every
 * ordinary check this is a gray dash — there was nothing to be saved from.
 */
function askedToBePutThrough(turns: AgentTurn[], wrongDept: BehavedEvent | null): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_to_be_put_through", label: "Transfer requested", pass, why,
    tip: "Only counts when Staff said we reached the wrong department. Charlie must then request a transfer once. Hanging up or making Staff go and look is a fail.",
  });
  if (!wrongDept) return row(null, "No wrong department reached. No transfer needed.");
  const said = String((wrongDept.detail || {}).said || "").trim();
  const at = wrongDept.atSec == null ? "" : ` at ${Number(wrongDept.atSec)}s`;
  const heard = said ? ` Staff: \u201c${said}\u201d` : "";
  if (!turns.length) return row(null, `Wrong department${at}. No Charlie lines recorded.${heard}`);
  const asks = turns.filter((t) => saysPutMeThrough(t.text));
  const when = asks.length && asks[0].atSec != null ? ` at ${Number(asks[0].atSec)}s` : "";
  if (!asks.length) return row(false, `Wrong department${at}. No transfer requested.${heard}`);
  if (asks.length > 1) return row(false, `Wrong department${at}. Transfer requested ${plural(asks.length, "time", "times")}, once is the rule.${heard}`);
  return row(true, `Wrong department${at}. Transfer requested once${when}.${heard}`);
}

/**
 * AND THE LAST STEP, which is the one that used to be decided by a stopwatch. Somebody new is on the
 * line and never heard the question. A LIVE check has the second on every line, so this is exact; a
 * finished one has a flat transcript with no clock, and then the order of the lines is all there is.
 */
function askedTheNewPerson(turns: AgentTurn[], handedOver: BehavedEvent[], maybeNew: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_the_new_person", label: "Re-asked after transfer", pass, why,
    tip: "Only counts after a transfer, where whoever picks up never heard the question. A walk away is a maybe, and Charlie judges that one from the voice.",
  });
  if (!handedOver.length) {
    // A WALK AWAY IS A MAYBE, NOT A FACT. The agent is told the person may be new and decides from the
    // voice; Staff coming back themselves and the agent carrying on is right, so requiring a second
    // question here would cross a check that behaved.
    if (maybeNew.length) return row(null, `No transfer. Staff away ${Number(maybeNew[0].detail?.gapSec ?? 0)}s, may be the same person back. Not counted.`);
    return row(null, "No transfer on this check.");
  }
  if (!turns.length) return row(null, "Transferred, but no Charlie lines recorded.");
  const back = Number(handedOver[0].atSec ?? 0);
  const asks = turns.filter((t) => isAsk(t.text));
  const timed = turns.some((t) => t.atSec != null);
  if (timed) {
    const after = asks.filter((t) => t.atSec != null && Number(t.atSec) >= back);
    if (!after.length) return row(false, `New Staff at ${back}s. Question NOT re-asked.`);
    return row(true, `New Staff at ${back}s. Question re-asked at ${Number(after[0].atSec)}s.`);
  }
  // No clock on this record. Two questions and a new person is the save working; one is not.
  if (asks.length > 1) return row(true, `New Staff at ${back}s. Question re-asked. Read off the order of the lines, not the clock.`);
  return row(false, `New Staff at ${back}s. 1 question on the whole check, so they were never asked.`);
}


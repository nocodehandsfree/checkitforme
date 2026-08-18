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
import { askedToBePutThrough as saysPutMeThrough, signedOff } from "../voice/prompts";

/** THE ELEVEN ROWS ARE THE OWNER'S OWN WORDS (docs/specs/charlie-behavior/README.md §5, written with
 *  him line by line on 08-01). Every sentence below is asserted in scripts/test-behaved.ts, in the
 *  same commit that writes it, because he spent real time on these words and no agent may quietly
 *  reword them. If this file and that record disagree, the record is right and this is the bug. */

/**
 * THE OWNER'S 16 TEST CARDS, LOCKED 08-04 (docs/specs/charlie-behavior/testing-cards.md). Headline
 * is the category, colon, exactly what is tested. Subhead is one plain past tense sentence saying
 * what happened. The bubble says what the test proves, naming the exact status by its real name
 * from Statuses. Copied from that file word for word and asserted in scripts/test-behaved.ts, so
 * nothing can drift. We test things that WORK, never bugs.
 */
/**
 * WHAT EACH CARD HAS TO SEE TO PASS (owner 08-07, item 9 of the round two order): "Every card names
 * which of the eleven Charlie behavior rows must be green to pass. Answer: clear yes is Handed to
 * Charlie, the question played as a recording, Charlie warmed up in time, Charlie wrapped up,
 * Charlie ended the check, and the check comes back In stock."
 *
 * `needs` is that list, and `status` is the status key the check has to come back with, because his
 * example ends with one and a card that watched only the rows would call a check green while the
 * customer was shown the wrong answer. `status: null` where his own card names none, which today is
 * the switch test ("This test checks the switch only, not a status") and the two hold cards whose
 * bubbles say the right status without naming it.
 *
 * WHY IT IS A LIST AND NOT "EVERY ROW". A row a check never put to the test is not on the screen at
 * all now, so without a named list a card would silently pass on the rows that happened to be
 * exercised. And some cards require a row to be RED: Delta: failed exists to make the recording
 * fail, so "the question played as a recording" is deliberately NOT in its list.
 *
 * NOTHING ABOUT MONEY IS IN ANY OF THESE (owner 08-07, item 10). Charlie speaking 23 seconds or
 * less is a margin goal, never a test, and it stays on the tile up top where a goal belongs. Locked
 * in scripts/test-behaved.ts so nobody can quietly put a price in a pass or fail row.
 */
/** The meter half's per-card overrides (graded by src/calls/meter.ts, the 08-16 build). `null`
 *  switches that number off for the card; absent = the owner's two numbers bind (23s meter ·
 *  67% floor). The rows above stay money-free — this rides BESIDE them, never inside them. */
export interface MeterBounds { meterCapSec?: number | null; profitFloorPct?: number | null;
  /** WHY THIS CARD'S FLOOR IS ITS OWN (owner, 08-17 late). Printed under the profit row when the
   *  row is tapped, so a floor that is not the usual 67 always says what moved it. */
  floorWhy?: string }

export interface TestCard { name: string; sub: string; info: string; needs: BehavedKey[]; status: string | null; meter?: MeterBounds }

export const TEST_CARDS: Record<string, TestCard> = {
  answer_clear_yes: { name: "Answer: clear yes",
    sub: "Staff said they have the product in stock and we showed an In stock status.",
    info: "This test proves that a plain yes ends with an In stock status, and that the set Staff named is the one on the check.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  answer_clear_no: { name: "Answer: clear no",
    sub: "Staff said they do not have the product in stock and we showed a Not in stock status.",
    info: "This test proves that a clear no always ends with a Not in stock status, no matter how Staff choose to say the no.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "not_in_stock" },
  answer_yes_vague: { name: "Answer: yes but vague",
    sub: "Staff said yes without saying yes, like \"we did, but it's not out yet.\"",
    info: "Our reading understood the vague yes and we displayed an In stock status. This test rotates a growing list of real vague yeses, and every new one from a real check gets added.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  // A HOLD STILL ENDS IN AN ANSWER (owner 08-07). These three cards named no status because their
  // bubbles do not name one, but every scene behind them has Staff coming back and answering, so
  // there IS a right answer and a card that ignored it would go green while the customer was shown
  // the wrong one. Hold: permanently is the one real exception: nobody ever comes back.
  hold_silence: { name: "Hold: silence",
    sub: "Staff put us on a silent hold.",
    info: "Charlie dropped on a silent hold, reconnected when they came back, and we displayed the right status.",
    needs: ["handed_to_charlie", "question_recorded", "meter_stopped_on_hold", "wrapped_up", "charlie_ended_the_check"], status: "not_in_stock",
    // THE HOLD TESTS OWN FLOOR (owner, 08-17 late): the scene scripts a hold that forces the
    // phone line's second billed minute, and his goal on one of these is 11 cents on a 25 cent
    // check, which is 56 percent. Every other card and every real customer check keeps 67.
    meter: { profitFloorPct: 56, floorWhy: "This scene scripts a hold long enough to force the phone line's second billed minute, so the goal on a hold test is 11 cents on a 25 cent check." } },
  // METER EXEMPTIONS (owner's go 08-16, per-card list proposed in the spec, his to re-rule): a
  // scene built to burn the clock can never hold the 67% floor, so grading it there fails it
  // forever and the red becomes noise. The meter cap stays on every card — Charlie's own seconds
  // are always his to keep down.
  hold_permanently: { name: "Hold: permanently",
    sub: "Staff put us on hold and never returned.",
    info: "Charlie hung up at the hold limit and we displayed a Left on hold status.",
    needs: ["handed_to_charlie", "question_recorded", "meter_stopped_on_hold"], status: "left_on_hold",
    meter: { profitFloorPct: null } },
  hold_music: { name: "Hold: music",
    sub: "Staff put us on hold with music and Charlie dropped until a person came back.",
    info: "This test proves that hold music stops Charlie's meter the same way silence does, and that he reconnected when a person spoke to us again.",
    needs: ["handed_to_charlie", "question_recorded", "meter_stopped_on_hold", "wrapped_up", "charlie_ended_the_check"], status: "in_stock",
    // THE HOLD TESTS OWN FLOOR (owner, 08-17 late): the scene scripts a hold that forces the
    // phone line's second billed minute, and his goal on one of these is 11 cents on a 25 cent
    // check, which is 56 percent. Every other card and every real customer check keeps 67.
    meter: { profitFloorPct: 56, floorWhy: "This scene scripts a hold long enough to force the phone line's second billed minute, so the goal on a hold test is 11 cents on a 25 cent check." } },
  hold_phone_down: { name: "Hold: phone down",
    sub: "Staff set the phone on the counter and Charlie dropped until someone spoke to us again.",
    info: "This test proves that background store noise stops Charlie's meter the same way silence does. Someone talking across the room is not someone talking to us.",
    needs: ["handed_to_charlie", "question_recorded", "meter_stopped_on_hold", "wrapped_up", "charlie_ended_the_check"], status: "in_stock",
    // THE HOLD TESTS OWN FLOOR (owner, 08-17 late): the scene scripts a hold that forces the
    // phone line's second billed minute, and his goal on one of these is 11 cents on a 25 cent
    // check, which is 56 percent. Every other card and every real customer check keeps 67.
    meter: { profitFloorPct: 56, floorWhy: "This scene scripts a hold long enough to force the phone line's second billed minute, so the goal on a hold test is 11 cents on a 25 cent check." } },
  hungup_staff: { name: "Hungup: Staff",
    sub: "Staff hung up on us before giving an answer and we showed a Staff hung up status.",
    info: "This test proves that when Staff hung up on us, the record shows they ended the check, not us.",
    needs: [], status: "staff_hung_up" },
  hungup_ringing: { name: "Hungup: 90 seconds of ringing",
    sub: "The phone rang with nobody answering and we hung up at the ring limit.",
    info: "This test proves that after 90 seconds of ringing with no person, we ended the check ourselves, the record shows it was us, and we displayed a Nobody answered status. Charlie was never on and never billed.",
    needs: [], status: "nobody_answered", meter: { profitFloorPct: null } },
  hungup_limit: { name: "Hungup: 4 minute limit",
    sub: "The check hit its 4 minute limit and we ended it.",
    info: "This test proves that a check can never run past the limit you set in Admin, we displayed an Admin hung up status, and the customer was charged, because we really were on the phone that long.",
    needs: [], status: "admin_hangup", meter: { profitFloorPct: null } },
  // THE WRAP-UP, ITS OWN TEST (owner 08-07). The chatty scene used to live under the 4 minute limit,
  // which is our own safety net and a different thing entirely. What this one proves is Charlie's
  // own manners: once he has been TALKING for `charlieWrapUpSeconds` he asks once more and closes.
  wrapup_never_answered: { name: "Wrapup: they never answered",
    sub: "Staff rambled and would not give us an answer, so Charlie wrapped up and ended the check.",
    info: "This test proves that once Charlie has been talking for the time set in Admin, he asks the question one more time, takes whatever he gets, and ends the check himself.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "no_straight_answer",
    // The rambler burns the clock by design; what this card guards is Charlie CLOSING. His meter
    // cap here is the Admin wrap-up number's territory, so only the floor is off.
    meter: { profitFloorPct: null } },
  // DELTA IS THE RECORDING THAT CARRIES OUR QUESTION. When it never plays, Charlie asks it himself —
  // the designed fallback, proven by accident on 08-06 and never once tested on purpose.
  delta_failed: { name: "Delta: failed",
    sub: "Delta failed to ask about the product, so Charlie asked it himself.",
    info: "This test proves Charlie will ask the store the first question if Delta fails.",
    needs: ["handed_to_charlie", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  transfer_new_person: { name: "Transfer: new person",
    sub: "Staff transferred us, Charlie asked a question from the start and recognized it was a new person.",
    info: "This test proves that when a store moves us on without being asked, Delta plays the recording again for the new person and Charlie carries on from their answer instead of starting over.",
    needs: ["handed_to_charlie", "question_recorded", "meter_stopped_on_hold", "asked_the_new_person", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  transfer_requested: { name: "Transfer: Charlie requested",
    sub: "Charlie reached a wrong department and asked to be put through.",
    info: "This test proves that Charlie recognized the wrong department and asked to be transferred. When the new person picked up, Delta played the recording, and Charlie came back only after Staff answered it, to ask his follow-up.",
    needs: ["handed_to_charlie", "question_recorded", "asked_to_be_put_through", "meter_stopped_on_hold", "asked_the_new_person", "wrapped_up", "charlie_ended_the_check"], status: "not_in_stock" },
  transfer_nobody: { name: "Transfer: nobody available",
    sub: "Charlie asked to be put through and Staff said there was nobody available.",
    info: "This test proves that Charlie thanked them and ended the check without nagging, and we displayed a Too busy to check status.",
    needs: ["handed_to_charlie", "question_recorded", "asked_to_be_put_through", "goodbye_when_told_no", "wrapped_up", "charlie_ended_the_check"], status: "too_busy" },
  transfer_switch_off: { name: "Transfer: switch off",
    sub: "The Admin switch for asking to be transferred was off and Charlie did not ask.",
    info: "This test proves the switch really works. Charlie never brought up being transferred and took whatever answer Staff could give. If Staff transfer us anyway, the check rides it as normal. This test checks the switch only, not a status.",
    needs: ["handed_to_charlie", "question_recorded", "wrapped_up", "charlie_ended_the_check"], status: null },
  voicemail_detected: { name: "Voicemail: detected",
    sub: "A machine answered and our system ended the check.",
    info: "This test proves that we hung up the moment the voicemail was detected, Charlie was never on and never billed, and we displayed a Got their voicemail status.",
    needs: [], status: "voicemail", meter: { profitFloorPct: null } },
  language_spanish: { name: "Language: Spanish",
    sub: "Staff spoke Spanish and Charlie held the entire conversation in Spanish.",
    info: "This test proves that Charlie never switched to English mid check, and the answer Staff gave in Spanish set the status.",
    needs: ["handed_to_charlie", "question_recorded", "spoke_their_language", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  // THE NEW CARD, the owner's ruling 08-06, and it arrives with the hobby stores. On a check for one
  // exact product Charlie has an extra question no test had ever run, and a general yes is not a yes
  // on that kind of check.
  exact_product: { name: "Product: one exact item",
    sub: "The check asked for one exact product and Charlie asked about that item by name.",
    info: "This test proves that a general yes about the category is not an In stock status on this kind of check. Only Staff confirming the exact item is.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
  alert_email: { name: "Alert: email",
    sub: "The check landed In stock at a store a customer watches and an in stock email was sent.",
    info: "This test proves that in stock email alerts work for a store the customer has subscribed to.",
    needs: ["handed_to_charlie", "question_recorded", "warmed_up_in_time", "wrapped_up", "charlie_ended_the_check"], status: "in_stock" },
};

export type BehavedKey =
  | "handed_to_charlie" | "question_recorded" | "warmed_up_in_time" | "right_department"
  | "asked_to_be_put_through" | "asked_the_new_person" | "goodbye_when_told_no"
  | "meter_stopped_on_hold" | "wrapped_up" | "spoke_their_language" | "charlie_ended_the_check";

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
  /** The rule this row grades, in the words that command it (Charlie's instructions where one of
   *  his rules owns it, the engine's law where the engine does). Printed in the check log at the
   *  moment a row FAILS, so the owner reads why without leaving the page (owner 08-06). */
  rule?: string;
}

/** The governing rule per row, quoted from the words that command the behavior. */
export const ROW_RULES: Record<BehavedKey, string> = {
  handed_to_charlie: "Mapping talks to machines, Charlie talks to people: nothing in mapping ever speaks to a person.",
  question_recorded: "Delta asks the question from a recording; Charlie never asks it again in any wording.",
  warmed_up_in_time: "Charlie warms up behind the recording so he is ready the moment the question ends.",
  right_department: "If Staff cannot answer, ask ONCE, warmly, to be put through. Never ask a second time on a check.",
  asked_to_be_put_through: "Ask ONCE, warmly, \"oh gotcha, could you put me through to whoever handles the Pokemon?\".",
  asked_the_new_person: "When somebody new picks up, your recorded question plays again and you carry on from their answer.",
  goodbye_when_told_no: "When Staff say nothing is in stock, ask the restock question once, then thank them warmly and wrap up.",
  meter_stopped_on_hold: "The system holds the check while Staff are away; Charlie's meter stops for the wait.",
  wrapped_up: "End the check with one warm goodbye in your own words, then end the check with end_call.",
  spoke_their_language: "If Staff speak Spanish, continue in Spanish.",
  charlie_ended_the_check: "Say goodbye once, then end the check with end_call. Never leave the store to hang up on us.",
};

/**
 * DID THIS TEST PASS (owner 08-07, item 9). The card names the rows that must be green and the
 * status the check has to come back with; this reads the check against that list and nothing else.
 *
 * A ROW THE CHECK NEVER PUT TO THE TEST IS A FAIL HERE, and that is deliberate. On the screen an
 * untested row is now hidden, because every row he can see must be one a red would be real about.
 * But a card that NAMES a row and then never exercises it has not proved the thing it promised, and
 * quietly passing on it is exactly how a green test hides a broken engine. So a missing row is
 * reported by name, in his own row wording, rather than skipped.
 *
 * `statusOk` is null when the card names no status of its own (the switch test, and the two holds
 * whose bubbles say "the right status" without saying which). It is never a fail on its own then.
 */
export interface CardVerdict {
  pass: boolean;
  /** Row labels the card needs green that are not green, in his words. Empty when they all held. */
  missing: string[];
  /** true / false, or null when this card names no status. */
  statusOk: boolean | null;
  /** The status the card promised, and what the check actually came back with. */
  wantStatus: string | null;
  gotStatus: string | null;
}

export function cardVerdict(card: TestCard | null | undefined, rows: BehavedRow[], statusKey: string | null | undefined): CardVerdict | null {
  if (!card) return null;
  const by = new Map(rows.map((r) => [r.key, r]));
  const missing = card.needs
    .filter((k) => by.get(k)?.pass !== true)
    .map((k) => by.get(k)?.label || k);
  const got = statusKey || null;
  const statusOk = card.status == null ? null : got === card.status;
  return { pass: missing.length === 0 && statusOk !== false, missing, statusOk, wantStatus: card.status, gotStatus: got };
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

  // WHAT THE ENGINE WROTE DOWN, by the marker it writes it under. A check that ran BEFORE any of this
  // was built simply has none of them, and every row that reads one is Unused rather than Broken —
  // which is why the card renders his old Fun store checks instead of covering them in red crosses.
  const step = (name: string) => tl.find((e) => (e.detail || {})[stepKey] === name) || null;
  const menuWalked = tl.some((e) => e.kind === "alpha_press" || e.kind === "bravo_say" || e.kind === "ivr_detected");
  // A CHECK FROM BEFORE ANY OF THIS WAS WRITTEN DOWN. It has none of the markers, and the honest
  // thing to say is exactly that. Saying "this check never got as far as asking" about a check that
  // plainly did ask would be the card lying about his own history.
  const beforeWeWroteItDown = !tl.some((e) => (e.detail || {})[stepKey]);

  // Every row leaves with the rule it grades attached, so a FAIL can print the rule in the check
  // log at the moment it happened (owner 08-06).
  const withRules = (rows: BehavedRow[]) => rows.map((r) => ({ ...r, rule: ROW_RULES[r.key] }));
  return withRules([
    handedToCharlie(tl),
    questionRecorded(step("question_clip"), step("question_live"), beforeWeWroteItDown),
    warmedUpInTime(first("charlie_join"), beforeWeWroteItDown),
    rightDepartment(wrongDept, turns, menuWalked),
    askedToBePutThrough(turns, wrongDept),
    askedTheNewPerson(turns, handedOver, maybeNew, tl),
    goodbyeWhenToldNo(step("nobody_to_transfer"), step("wrap_up")),
    meterStoppedOnHold(tl, sums),
    wrappedUp(step("wrap_up"), turns, tl),
    spokeTheirLanguage(step("language"), beforeWeWroteItDown),
    charlieEndedTheCheck(tl),
  ]);
}

/** The one name the engine marks its extra lines with. Kept here so a rename is one edit, not eleven. */
const stepKey = "step";
const at = (e: BehavedEvent | null | undefined) => (e && e.atSec != null ? `${Number(e.atSec)}s` : "");

/**
 * ROW 1. Did the check reach Staff and hand them to Charlie at all. Everything under it depends on
 * this one, so when it fails the rest are Unused rather than a wall of red.
 */
function handedToCharlie(tl: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "handed_to_charlie", label: "Handed to Charlie", pass, why,
    tip: "Staff picked up and the check was handed to Charlie. Nobody answering is not his fault; our own side never handing him the check is.",
  });
  const human = tl.find((e) => e.kind === "human_detected");
  const join = tl.find((e) => e.kind === "charlie_join");
  if (join) return row(true, `Reached Staff through Alpha and handed to Charlie${at(join) ? ` at ${at(join)}` : ""}.`);
  if (!human) return row(false, "Staff never picked up, so there was nobody to hand to.");
  return row(false, "Our own system never handed the check to Charlie.");
}

/**
 * ROW 2. Asking from our own recording is what makes a check cheap. Falling back to Charlie asking it
 * himself still gets the answer and costs a few cents more, which is the right trade — but it has to
 * be VISIBLE, or nobody can say how often it happens.
 */
function questionRecorded(clip: BehavedEvent | null, live: BehavedEvent | null, old: boolean): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "question_recorded", label: "The question played as a recording", pass, why,
    tip: "The question is played from our own recording, so asking it costs nothing. Charlie asking it himself works, and costs more.",
  });
  if (clip) return row(true, `The question played as a recording${at(clip) ? ` at ${at(clip)}` : ""}.`);
  if (live) return row(false, "The recording did not play, so Charlie asked the question himself.");
  if (old) return row(null, "This check ran before we started writing that down.");
  return row(null, "This check never got as far as asking.");
}

/**
 * ROW 3. He bills from the second he connects, so he starts two seconds before the recorded question
 * ends rather than at the top of it. Late means a real person listened to silence.
 */
function warmedUpInTime(join: BehavedEvent | null | undefined, old: boolean): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "warmed_up_in_time", label: "Charlie warmed up in time", pass, why,
    tip: "Charlie starts connecting two seconds before the recorded question ends, so he is ready the moment it finishes. Late means Staff heard silence.",
  });
  const d = (join || {}).detail || {};
  if (d.warmedUpInTime === true) return row(true, "Charlie warmed up in time.");
  if (d.warmedUpInTime === false) {
    const secs = Math.round(Number(d.deadAirMs ?? 0) / 1000);
    return row(false, `Charlie warmed up late. There was dead air for ${plural(secs, "second", "seconds")}.`);
  }
  return row(null, old ? "This check ran before we started writing that down." : "Nothing was recorded about the warm-up on this check.");
}

/**
 * ROW 4. A row only speaks when it applies (the owner's own question: "do we want to say we reached
 * the right department every time?"). On a check that never picked a department it is Unused, and
 * where the department was wrong the ROW BELOW carries the verdict, so a tick here can never claim
 * we reached the right one when we plainly did not.
 */
function rightDepartment(wrongDept: BehavedEvent | null, turns: AgentTurn[], menuWalked: boolean): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "right_department", label: "We reached the right department", pass, why,
    tip: "Only counts on a check that picked a department. Landing somewhere that cannot answer is not a fault; not asking to be put through is.",
  });
  if (!wrongDept) {
    if (!menuWalked) return row(null, "This check never picked a department.");
    return row(true, "We reached the right department, no transfer needed.");
  }
  const said = String((wrongDept.detail || {}).said || "").trim();
  const heard = said ? ` Staff: \u201c${said}\u201d` : "";
  const asked = turns.some((t) => saysPutMeThrough(t.text));
  if (!asked) return row(false, `Wrong department and Charlie never asked to be transferred.${heard}`);
  return row(null, `We reached the wrong department${at(wrongDept) ? ` at ${at(wrongDept)}` : ""} and Charlie asked to be put through, so the row below judges it.${heard}`);
}

/**
 * ROW 7. The honest ending to a wrong department: he asked once, there is nobody to ask, and he goes
 * warmly instead of nagging. Only ever read after Staff actually said so.
 */
function goodbyeWhenToldNo(toldNo: BehavedEvent | null, wrap: BehavedEvent | null): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "goodbye_when_told_no", label: "Said goodbye when told no", pass, why,
    tip: "Only counts when Staff said there was nobody to put us through to. Charlie must wrap up warmly and end, never keep pushing.",
  });
  if (!toldNo) return row(null, "Nobody ever said there was nobody to transfer to.");
  const said = String((toldNo.detail || {}).said || "").trim();
  const heard = said ? ` Staff: \u201c${said}\u201d` : "";
  const wrapAfter = wrap && Number(wrap.atSec ?? 0) >= Number(toldNo.atSec ?? 0);
  if (wrapAfter) return row(true, `Staff said there was nobody to transfer to and Charlie said goodbye.${heard}`);
  return row(false, `Charlie kept pushing after Staff said no.${heard}`);
}

/**
 * ROW 9. A check that simply stopped and one that ended warmly looked identical afterwards, because
 * nothing wrote his goodbye down.
 */
function wrappedUp(wrap: BehavedEvent | null, turns: AgentTurn[], tl: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "wrapped_up", label: "Charlie wrapped up", pass, why,
    tip: "Charlie thanks them, by name when they gave one, and ends. A check that just stops leaves Staff talking to nobody.",
  });
  const spoke = tl.some((e) => e.kind === "charlie_join");
  if (!spoke) return row(null, "Charlie was never on this check.");
  if (wrap) {
    const d = wrap.detail || {};
    if (d.usedName === true) return row(true, `Charlie thanked them by name${d.name ? ` (${String(d.name)})` : ""} and ended.`);
    return row(true, "Charlie thanked them and ended. They never gave a name.");
  }
  // A CHECK FROM BEFORE ANY OF THIS WAS RECORDED still has everything he SAID, so the row is read off
  // his own last words instead — the same word test the engine now uses live. That is what lets the
  // card grade the owner's existing checks rather than covering them in crosses for a marker that
  // did not exist on the day they ran.
  if (turns.length) {
    const last = turns[turns.length - 1].text;
    if (signedOff(last)) return row(true, "Charlie thanked them and ended. Read off his own last words, from before this was written down.");
    return row(false, "The check ended without Charlie wrapping up.");
  }
  return row(null, "Nothing Charlie said was recorded on this check.");
}

/**
 * ROW 10. Only speaks when Spanish was actually spoken: the one language judge answers "I cannot
 * tell" on plenty of ordinary English sentences, so a claim about English would be a guess.
 */
function spokeTheirLanguage(lang: BehavedEvent | null, old: boolean): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "spoke_their_language", label: "Spoke their language", pass, why,
    tip: "On a Spanish check Charlie speaks Spanish the whole way through. Answering in English on a Spanish check is a fail.",
  });
  if (!lang) return row(null, old ? "This check ran before we started writing that down." : "No Spanish was spoken on this check.");
  const d = lang.detail || {};
  const es = Number(d.spanishLines ?? 0), en = Number(d.englishLines ?? 0);
  if (es > 0 && en === 0) return row(true, "Charlie spoke Spanish throughout.");
  return row(false, `Charlie answered in English on a Spanish check. ${plural(es, "line", "lines")} in Spanish, ${plural(en, "line", "lines")} in English.`);
}

/**
 * ROW 11. WHO PUT THE PHONE DOWN. The phone company only ever says a check finished, so this is
 * subtraction: we know every time it was us, because we are the ones who do it.
 */
function charlieEndedTheCheck(tl: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "charlie_ended_the_check", label: "Charlie ended the check", pass, why,
    tip: "Charlie finishing the conversation himself is the clean ending. Staff hanging up on us, or the check dropping, is not.",
  });
  const ended = tl.find((e) => e.kind === "charlie_leave" && /ended the check/i.test(String((e as { note?: string }).note || "")));
  const hang = tl.filter((e) => e.kind === "hangup");
  const reason = (e: BehavedEvent) => String((e.detail || {}).reason || "");
  if (ended) return row(true, `Charlie ended the check${at(ended) ? ` at ${at(ended)}` : ""}.`);
  // THE NEW CLEAN ENDING, AND THE ROW NEVER LEARNED IT (owner, 08-14, off test check 363). Since
  // 08-04 the engine ends a finished check ITSELF the moment Charlie's goodbye is out and the line
  // goes quiet, stamped `signed_off`, precisely so a store can never bill us an extra minute by
  // being slow to hang up. That IS Charlie ending the check, done for him by our own hand, and it
  // is the ending nearly every clean check has now. This row was written before that door existed,
  // answered "nothing says who ended it", and the card failed a perfect check with "Still to hold:
  // Charlie ended the check".
  const signedOffHang = hang.find((e) => reason(e) === "signed_off");
  if (signedOffHang) return row(true, `Charlie said goodbye and we put the phone down for him${at(signedOffHang) ? ` at ${at(signedOffHang)}` : ""}.`);
  const store = hang.find((e) => reason(e) === "store_hung_up");
  if (store) return row(false, `Staff hung up on us${at(store) ? ` at ${at(store)}` : ""}.`);
  const gone = hang.find((e) => reason(e) === "disconnected" || reason(e) === "carrier_gone" || reason(e) === "disconnected_in_transfer");
  if (gone) return row(false, `The check was disconnected${at(gone) ? ` at ${at(gone)}` : ""}.`);
  const ours = hang.find((e) => ["held_too_long", "nobody_came", "no_words", "voicemail", "time_cap"].includes(reason(e)));
  if (ours) return row(null, `We ended this check ourselves${at(ours) ? ` at ${at(ours)}` : ""}, so it was never his to end.`);
  return row(null, "Nothing on this check says who ended it.");
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
  //
  // A RINGING DESK IS NOT THE ONLY HAND-OVER. Most stores move you on a silent line, and then the
  // wait STARTS as an ordinary quiet pause and is only known to be a hand-over when it ends. Reading
  // the start alone called every silent hand-over "the staff stepped away", which is the one thing
  // this row exists to tell apart. The end of the wait carries the answer, so read that too.
  const anyTransfer = holdIdx.some((h) => (tl[h].detail || {}).reason === "transfer")
    || tl.some((e) => e.kind === "hold_end" && ((e.detail || {}).reason === "transfer" || (e.detail || {}).afterAskingToBePutThrough === true));
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
  const who = anyTransfer ? "The hand-over" : "The staff";
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
    key: "asked_to_be_put_through", label: "Asked to be transferred", pass, why,
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
function askedTheNewPerson(turns: AgentTurn[], handedOver: BehavedEvent[], maybeNew: BehavedEvent[], tl: BehavedEvent[]): BehavedRow {
  const row = (pass: boolean | null, why: string): BehavedRow => ({
    key: "asked_the_new_person", label: "Reacted to a new person", pass, why,
    tip: "Only counts after a transfer, where whoever picks up never heard the question. A walk away is a maybe, and Charlie judges that one from the voice.",
  });
  // WHICH EVENT IS THIS ROW JUDGING (the owner's question: "reacted to what?"). After a transfer, or
  // after a wait. Both put somebody new on the line and only one of them EXPECTS the question again,
  // so the row says which one it read before it says anything else.
  if (!handedOver.length) {
    // A WALK AWAY IS A MAYBE, NOT A FACT. The agent is told the person may be new and decides from the
    // voice; Staff coming back themselves and the agent carrying on is right, so requiring a second
    // question here would cross a check that behaved.
    if (maybeNew.length) return row(null, `Judged after a wait: Staff were away ${plural(Number(maybeNew[0].detail?.gapSec ?? 0), "second", "seconds")} and may be the same person back, so nothing was expected of him.`);
    // A WAIT NOBODY CAME BACK FROM is still a wait, and saying "no wait on this check" about one is
    // the card being wrong about the very thing the owner is reading it for.
    const away = tl.find((e) => e.kind === "hold_start");
    if (away) return row(null, `Judged after a wait: Staff stepped away${away.atSec != null ? ` at ${Number(away.atSec)}s` : ""} and nobody ever came back, so nobody new picked up.`);
    return row(null, "No transfer and no wait on this check.");
  }
  if (!turns.length) return row(null, "Judged after the transfer: nothing Charlie said was recorded.");
  const back = Number(handedOver[0].atSec ?? 0);
  const asks = turns.filter((t) => isAsk(t.text));
  const timed = turns.some((t) => t.atSec != null);
  if (timed) {
    const after = asks.filter((t) => t.atSec != null && Number(t.atSec) >= back);
    if (!after.length) return row(false, `Charlie did not react to a new staff member after the transfer. Somebody new at ${back}s and the question was never asked again.`);
    return row(true, `Charlie reacted correctly to a new staff member after the transfer. Somebody new at ${back}s, asked again at ${Number(after[0].atSec)}s.`);
  }
  // No clock on this record. Two questions and a new person is the save working; one is not.
  if (asks.length > 1) return row(true, `Charlie reacted correctly to a new staff member after the transfer. Somebody new at ${back}s, and he asked again. Read off the order of the lines, not the clock.`);
  return row(false, `Charlie did not react to a new staff member after the transfer. Somebody new at ${back}s and one question on the whole check.`);
}


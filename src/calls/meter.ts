// THE METER HALF OF THE CARD (owner's go 08-16; docs/specs/self-improving-charlie/README.md).
//
// THE LESSON THIS EXISTS TO FIX: on test four the card said PASS while Charlie sat through seconds
// of dead air, and on 08-16 a check ran 43 seconds of meter with 9 seconds of him on the clock and
// not answering — every card green both times. The behavior rows grade whether Charlie behaved;
// nothing graded whether the check made money. The sheet's tiles already SHOW the money (talk
// seconds with the color rule, profit against the floor) — this makes the grade READ them, so a
// wasteful pass reads as a FAIL with no human looking.
//
// THE ROWS STAY MONEY-FREE. The owner's 08-07 ruling (behaved.ts: "NOTHING ABOUT MONEY IS IN ANY
// OF THESE") stands for the behavior rows and its assertion stands in test-behaved. This is a
// SEPARATE half beside them, reversing only the "23 is a goal, never a test" edge — reversed
// knowingly by the owner on 08-16, because a machine with no human looking needs a grade it can
// act on ("part one of your proposal must be the grade learning to SEE waste").
import type { TestCard } from "./behaved";

/** The owner's numbers (CLAUDE.md lexicon: 67% gross profit margin is the floor · Charlie speaks
 *  23 seconds or less; his 08-16 wording is "23 seconds total meter time", so the cap binds his
 *  whole meter, not only the speaking slice). THE COLOR RULE, his exact words 08-16 evening,
 *  matching the tile the sheet has carried since 08-04: 23 or less is green · 24 to 30 is yellow,
 *  STILL ACCEPTABLE, so it passes · 31 or higher is red and the test fails. */
export const METER_GOAL_SEC = 23;
export const METER_YELLOW_MAX_SEC = 30;
export const PROFIT_FLOOR_PCT = 67;
/** Kept for the one release that imported the old name. The goal is the same 23. */
export const METER_CAP_SEC = METER_GOAL_SEC;

// A card's overrides live ON the card (`meter` in behaved.ts TestCard, beside `needs` and
// `status`): `null` switches a number off for that card — a scene built to burn the clock (the
// runaround to the 4 minute limit) can never hold 67% and a card that fails forever is noise —
// and absent means the owner's number applies. The exempt set is the spec's proposed list,
// flagged there for his eye.

export interface MeterVerdict {
  /** false the moment any graded number is out of bounds. */
  pass: boolean;
  /** One plain sentence per number out of bounds, in the owner's words, for the red line. */
  fails: string[];
  /** The same fails as a few words each, for the pill to wear: "Charlie meter time, 44 seconds"
   *  (owner box 08-16 late: a failed check says what killed it, in red, on the pill). */
  shortFails: string[];
  /** What this card's meter half requires, for the "To pass" line. Empty when fully exempt. */
  toPass: string[];
  /** The numbers as graded, for the record: label · value · pass (null = shown, not graded),
   *  tone = the owner's color for the row (g green · y yellow, still passing · r red, failing).
   *  THE SHEET'S ROW WORDS (owner, 08-17, his exact sentences): each row is ONE plain sentence
   *  about THIS call with the number colored inside it — `say.pre` + `say.num` (worn in the row's
   *  color) + `say.post`. The COLOR does the grading; a sentence never mentions colors or bands.
   *  Tapping a row opens `open`: plain sentences about this call, never the rulebook.
   *  `label`/`value` stay the long record. */
  rows: Array<{ label: string; value: string; pass: boolean | null; tone?: "g" | "y" | "r";
    say?: { pre: string; num: string; post: string;
      /** The sentence's second half, kept whole: it sits on the same line when it fits and drops
       *  to its own line in one piece when it does not, so a phone never breaks it mid phrase. */
      tail?: string };
    open?: string }>;
}

export interface MeterInput {
  /** Charlie's billed seconds — every second his meter ran. Null = never measured (an old row). */
  meterSec: number | null;
  /** His meter split, measured on the call itself; null when the check predates the measuring. */
  speakingSec?: number | null;
  listeningSec?: number | null;
  /** Profit against the plan price, whole percent. Null = the check was never priced. */
  profitPct: number | null;
  /** THE WAITING, SPLIT INTO NAMED GAPS (owner box 08-16 late: every metered second belongs to
   *  somebody by name). Each null = the check never exercised it, and its row does not exist —
   *  a row exists only if a working check could hide it. Measured by the engine on the call
   *  itself and read off the record, never re-derived. */
  answerGapWorstSec?: number | null;
  handoverGapWorstSec?: number | null;
  dropGapWorstSec?: number | null;
}

/** The owner's gap bands (his box, 08-16 late): Charlie's answer gap green to 2, yellow to 6, red
 *  at 7 and failing · Echo's handover gap green at 1 · the announced drop gap green at 3. The two
 *  yellow widths not named in the box are one notch of grace before red; flagged in the checkpoint
 *  for his eye. */
/** One number said out loud: "1 second" or "14 seconds". */
const secWord = (n: number): string => `${n} second${n === 1 ? "" : "s"}`;

// The row sentences are the OWNER'S OWN WORDS (08-17), numbers filled in from the check. The color
// does the grading; a sentence never mentions goals, colors, bands, or "green at". Tapping a row
// opens plain sentences about THIS call, never the rulebook.
const GAP_BANDS = {
  answer: { label: "Charlie's answer gap, worst turn", green: 2, red: 7,
    say: (s: number) => ({ pre: "Charlie's slowest answer took ", num: secWord(s), post: "." }),
    open: "Staff finished talking and this is how long Charlie's reply took to start. That wait is Staff standing on a quiet line." },
  handover: { label: "Echo's handover gap", green: 1, red: 4,
    say: (s: number) => ({ pre: "Echo handed Charlie the words in ", num: secWord(s), post: "." }),
    open: "Echo is the earpiece that writes down what Staff say. This is how long their words took to reach Charlie after their voice stopped." },
  drop: { label: "The announced hold drop gap", green: 3, red: 6,
    say: (s: number) => ({ pre: "Charlie's meter went off ", num: secWord(s), post: "", tail: "after Staff said hold on." }),
    open: "Staff said they were stepping away, and this is how long Charlie's meter kept running before it switched off. The waiting after the switch cost nothing." },
} as const;

/**
 * Grade a check's money and clock against the card. Returns null with no card (an ordinary check
 * still shows the tiles; only a named test is graded) — and, like `cardVerdict`, this is only
 * called once a check has finished, because a test that has not finished has not failed either.
 *
 * A number the record never measured is not graded (null meterSec, null profitPct): an old check
 * reads exactly as it always did and no number is invented. A number switched off for the card
 * (`null` bound) is shown but not graded, so the sheet still says what happened.
 */
export function meterVerdict(card: TestCard | null | undefined, m: MeterInput): MeterVerdict | null {
  if (!card) return null;
  const b = card.meter ?? {};
  const cap = b.meterCapSec === undefined ? METER_GOAL_SEC : b.meterCapSec;
  // The yellow band belongs to the OWNER'S pair (23/30). A card that sets its own cap sets a hard
  // line with no band; a card that sets null switches the number off. No card sets one today.
  const redFrom = b.meterCapSec === undefined ? METER_YELLOW_MAX_SEC + 1 : (cap == null ? null : cap + 1);
  const floor = b.profitFloorPct === undefined ? PROFIT_FLOOR_PCT : b.profitFloorPct;
  const rows: MeterVerdict["rows"] = [];
  const fails: string[] = [];
  const shortFails: string[] = [];
  const toPass: string[] = [];

  if (cap != null && redFrom != null) toPass.push(cap === METER_GOAL_SEC
    ? `Charlie on the meter ${cap} seconds or less (yellow to ${redFrom - 1})`
    : `Charlie on the meter ${cap} seconds or less`);
  if (m.meterSec != null) {
    const pass = cap == null || redFrom == null ? null : m.meterSec < redFrom;
    const inYellow = pass === true && cap != null && m.meterSec > cap;
    const waited = (m.speakingSec != null || m.listeningSec != null)
      ? Math.max(0, m.meterSec - (m.speakingSec ?? 0) - (m.listeningSec ?? 0)) : null;
    rows.push({ label: "Charlie on the meter",
      value: cap == null ? `${m.meterSec}s`
        : inYellow ? `${m.meterSec}s, over the ${cap}s goal but inside your yellow ${redFrom! - 1}s`
        : `${m.meterSec}s against ${cap}s`, pass,
      say: { pre: "Charlie was on the clock ", num: secWord(m.meterSec), post: ".",
        tail: cap == null ? undefined : `The goal is ${cap}.` },
      open: waited != null
        ? `Talking, listening and waiting all count while Charlie is on the clock. On this check he spoke for ${secWord(m.speakingSec ?? 0)}, listened for ${secWord(m.listeningSec ?? 0)}, and waited for ${secWord(waited)}.`
        : "Talking, listening and waiting all count while Charlie is on the clock, and every second bills the same." });
    if (pass === false) {
      fails.push(cap === METER_GOAL_SEC
        ? `Charlie ran ${m.meterSec} seconds on the meter, past your yellow line of ${redFrom! - 1}, against the ${cap} second goal.`
        : `Charlie ran ${m.meterSec} seconds on the meter against this card's ${cap} second line.`);
      shortFails.push(`Charlie meter time, ${m.meterSec} seconds`);
    }
    rows[rows.length - 1].tone = pass === false ? "r" : inYellow ? "y" : pass === true ? "g" : undefined;
    // The waiting slice is the piece of his meter where nobody said anything — the 9 silent
    // seconds of 08-16. Shown whenever it was measured; its own bound is the owner's open
    // decision (spec decision 2), so it is not graded alone yet. It already drags the two graded
    // numbers: waited seconds sit inside the meter cap and cost money against the floor.
    if (waited != null) {
      rows.push({ label: "Of that, waiting on a quiet line", value: `${waited}s`, pass: null,
        say: { pre: "", num: secWord(waited), post: " of that was waiting." },
        open: "Nobody was saying anything for those seconds, and Charlie's meter was still running. A hold that did not switch him off, or a slow answer, is usually where this time goes." });
    }
  }

  // THE NAMED GAPS (owner box 08-16 late). Each row exists only when the check measured it, so an
  // ordinary check with no hold shows no drop row and an old check shows none at all. A red gap
  // fails the test the same way a red meter does: it is a metered second nobody would otherwise see.
  const gap = (key: keyof typeof GAP_BANDS, sec: number | null | undefined) => {
    if (sec == null) return;
    const band = GAP_BANDS[key];
    const tone: "g" | "y" | "r" = sec <= band.green ? "g" : sec < band.red ? "y" : "r";
    rows.push({ label: band.label, value: `${sec}s, green at ${band.green}`, pass: tone !== "r", tone,
      say: band.say(sec), open: band.open });
    if (tone === "r") {
      fails.push(`${band.label} ran ${sec} seconds, against ${band.green} green and red from ${band.red}.`);
      shortFails.push(`${band.label.toLowerCase()}, ${sec} seconds`);
    }
  };
  gap("answer", m.answerGapWorstSec);
  gap("handover", m.handoverGapWorstSec);
  gap("drop", m.dropGapWorstSec);

  // THE PROFIT ROW IS THE REAL PROFIT AND NOTHING ELSE (owner, 08-17 evening). The hold set-aside
  // built earlier that day is DELETED: a hold test is shown and graded exactly like every other
  // check, what it really made against the floor, which is the system as it already was.
  if (floor != null) toPass.push(`gross profit ${floor}% or better`);
  if (m.profitPct != null) {
    const pass = floor == null ? null : m.profitPct >= floor;
    rows.push({ label: "Gross profit",
      value: floor == null ? `${m.profitPct}%` : `${m.profitPct}% against the ${floor}% floor`,
      pass, tone: pass === false ? "r" : pass === true ? "g" : undefined,
      say: { pre: "This check made ", num: `${m.profitPct}%`, post: ".",
        tail: floor == null ? undefined : `The floor is ${floor}.` },
      open: "The price of the check, minus what it cost to run, as a share of the price. The Check cost card below says where the money went." });
    if (pass === false) { fails.push(`The check made ${m.profitPct}% gross profit against the ${floor}% floor.`); shortFails.push(`profit ${m.profitPct}% under the ${floor}% floor`); }
  }

  return { pass: fails.length === 0, fails, shortFails, toPass, rows };
}

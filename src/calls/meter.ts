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

/** The owner's two numbers (CLAUDE.md lexicon: 67% gross profit margin is the floor · Charlie
 *  speaks 23 seconds or less on a check; his 08-16 wording is "23 seconds total meter time", so
 *  the cap binds his whole meter, not only the speaking slice). */
export const METER_CAP_SEC = 23;
export const PROFIT_FLOOR_PCT = 67;

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
  /** What this card's meter half requires, for the "To pass" line. Empty when fully exempt. */
  toPass: string[];
  /** The numbers as graded, for the record: label · value · pass (null = shown, not graded). */
  rows: Array<{ label: string; value: string; pass: boolean | null }>;
}

export interface MeterInput {
  /** Charlie's billed seconds — every second his meter ran. Null = never measured (an old row). */
  meterSec: number | null;
  /** His meter split, measured on the call itself; null when the check predates the measuring. */
  speakingSec?: number | null;
  listeningSec?: number | null;
  /** Profit against the plan price, whole percent. Null = the check was never priced. */
  profitPct: number | null;
}

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
  const cap = b.meterCapSec === undefined ? METER_CAP_SEC : b.meterCapSec;
  const floor = b.profitFloorPct === undefined ? PROFIT_FLOOR_PCT : b.profitFloorPct;
  const rows: MeterVerdict["rows"] = [];
  const fails: string[] = [];
  const toPass: string[] = [];

  if (cap != null) toPass.push(`Charlie on the meter ${cap} seconds or less`);
  if (m.meterSec != null) {
    const pass = cap == null ? null : m.meterSec <= cap;
    rows.push({ label: "Charlie on the meter", value: cap == null ? `${m.meterSec}s` : `${m.meterSec}s against ${cap}s`, pass });
    if (pass === false) fails.push(`Charlie ran ${m.meterSec} seconds on the meter against the ${cap} second goal.`);
    // The waiting slice is the piece of his meter where nobody said anything — the 9 silent
    // seconds of 08-16. Shown whenever it was measured; its own bound is the owner's open
    // decision (spec decision 2), so it is not graded alone yet. It already drags the two graded
    // numbers: waited seconds sit inside the meter cap and cost money against the floor.
    if (m.speakingSec != null || m.listeningSec != null) {
      const waited = Math.max(0, m.meterSec - (m.speakingSec ?? 0) - (m.listeningSec ?? 0));
      rows.push({ label: "Of that, waiting on a quiet line", value: `${waited}s`, pass: null });
    }
  }

  if (floor != null) toPass.push(`gross profit ${floor}% or better`);
  if (m.profitPct != null) {
    const pass = floor == null ? null : m.profitPct >= floor;
    rows.push({ label: "Gross profit", value: floor == null ? `${m.profitPct}%` : `${m.profitPct}% against the ${floor}% floor`, pass });
    if (pass === false) fails.push(`The check made ${m.profitPct}% gross profit against the ${floor}% floor.`);
  }

  return { pass: fails.length === 0, fails, toPass, rows };
}

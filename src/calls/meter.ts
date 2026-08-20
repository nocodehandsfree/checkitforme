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
/** THE WASTE'S OWN BANDS (owner's ruling, 08-19 night, WIDENED BY HIM 08-20): the seconds Charlie
 *  sits awake while the store has us waiting are green to 3, yellow to 8, and red from 9, and a red
 *  one fails the whole check. Always the TRUE measured seconds, never a number any forgiveness has
 *  touched. Why the yellow moved from 5 to 8: the head start he ordered — his session opening on
 *  the sound of a voice, before the words have proved who it was — costs about 3.6 awake seconds on
 *  its own, and an advert's own voice starting a reconnect the reader then refuses costs a few more
 *  (7s on 415, 4s on 423, 6s on 424, 7s on 427). At 5 a clean check landed yellow and one false
 *  start landed red, so the band was failing checks for the head start he asked for. */
export const AWAKE_ON_HOLD_GREEN = 3;
export const AWAKE_ON_HOLD_YELLOW = 8;
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
  /** THE SECONDS CHARLIE WAS AWAKE WHILE THE STORE HAD US ON HOLD (owner's order, 08-19). Measured
   *  on the call itself: his session open and billing while a wait was recognised — waiting, music,
   *  or an advert playing at us. Null on a check that never measured it. */
  awakeOnHoldSec?: number | null;
  /** THE ADVERT RULING (owner, 08-19): when the after-call reader proved a Staff line was really a
   *  recording the store played (`played_at_us` on the record), the GRADE treats that stretch as a
   *  wait — as if the hold had been recognized when the store's recording started. Grading only:
   *  the record's raw numbers, the real cost and the customer's charge change not at all, and the
   *  sheet prints the real number beside the graded one. Null = no proven recording, grade as ever. */
  advert?: { asWaitSec: number; gradedProfitPct?: number | null } | null;
}

/** What `advertAsWait` measured off the record, all on the call's own millisecond clock. */
export interface AdvertAsWait {
  /** When the store's recording started — the `music_heard` stamp when one covers the judged line
   *  (Echo dates it to the music's own first note), else the judged line's own start. */
  holdFromMs: number;
  /** Where Charlie's meter would have switched off: the ruled 3 second drop after the hold. */
  offFromMs: number;
  /** Staff's real comeback — the next Clerk line the reader did NOT judge a recording. */
  toMs: number;
  /** The seconds of Charlie's real meter inside that window: what the grade forgives. */
  forgivenMs: number;
}

/**
 * THE ADVERT RULING'S MEASURE (owner, 08-19: "grade such calls fairly after the fact"). A recorded
 * voice is the one sound on a phone line no listening rule can refuse — it IS a voice — so a hold
 * with an advert in its music is never recognized live (checks 398/399/400). The after-call reader
 * proves it in words (`played_at_us`, receipt-store.ts), and this turns that proof into the as-if
 * window the grade uses: hold from the recording's first note, Charlie dropped the ruled 3 seconds
 * later (`holdMusicMs`, tuning.ts — the owner's ONE drop number), off until Staff really came back.
 * Pure, reads only the finished record, and returns null whenever the proof or the timed lines are
 * missing — every other check grades exactly as it always did.
 */
export function advertAsWait(
  timeline: Array<{ kind: string; atMs?: number | null; detail?: Record<string, unknown> | null }>,
  lines: Array<{ who: string; text: string; atMs: number | null; endMs?: number | null }> | null,
): AdvertAsWait | null {
  const played = timeline.find((e) => (e.detail || {}).step === "played_at_us");
  if (!played || !lines?.length) return null;
  const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  const judged = (Array.isArray((played.detail || {}).lines) ? (played.detail!.lines as Array<Record<string, unknown>>) : [])
    .map((l) => norm(String(l.line ?? ""))).filter(Boolean);
  if (!judged.length) return null;
  const clerk = lines.filter((l) => l.who !== "Agent" && l.atMs != null);
  const isRecording = (t: string) => { const n = norm(t); return judged.some((j) => n.startsWith(j) || j.startsWith(n)); };
  const rec = clerk.filter((l) => isRecording(l.text));
  if (!rec.length) return null;   // an old record with no timed lines cannot place the stretch
  const people = clerk.filter((l) => !isRecording(l.text));
  const callEndMs = timeline.reduce((m, e) => Math.max(m, e.atMs ?? 0), 0);
  // Charlie's real meter, as on/off stretches, so only seconds that actually billed are forgiven.
  const on: Array<[number, number]> = [];
  let openAt: number | null = null;
  for (const e of timeline) {
    if (e.kind === "charlie_join" && e.atMs != null && openAt == null) openAt = e.atMs;
    if (e.kind === "charlie_leave" && e.atMs != null && openAt != null) { on.push([openAt, e.atMs]); openAt = null; }
  }
  if (openAt != null) on.push([openAt, callEndMs]);
  // One as-if window per judged recording line, merged when they run together.
  const windows: Array<[number, number]> = [];
  for (const r of rec) {
    let from = r.atMs!;
    // The store's recording did not start at the advert's first word: when Echo already stamped
    // the music (`music_heard`, dated to the music's own first note) and no real person spoke
    // between that note and the judged line, the recording started at the note.
    for (const e of timeline) {
      if ((e.detail || {}).step !== "music_heard" || e.atMs == null) continue;
      if (e.atMs <= from && !people.some((p) => p.atMs! > e.atMs! && p.atMs! < r.atMs!)) from = Math.min(from, e.atMs);
    }
    const comeback = people.filter((p) => p.atMs! > r.atMs!).reduce((m, p) => Math.min(m, p.atMs!), callEndMs);
    const off = from + 3000;   // the ruled drop: one number, 3 seconds, music the same as silence
    if (comeback > off) windows.push([off, comeback]);
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w] as [number, number]);
  }
  let forgivenMs = 0;
  for (const [a, b] of merged) for (const [x, y] of on) forgivenMs += Math.max(0, Math.min(b, y) - Math.max(a, x));
  if (forgivenMs <= 0) return null;
  return { holdFromMs: merged[0][0] - 3000, offFromMs: merged[0][0], toMs: merged[merged.length - 1][1], forgivenMs };
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
  // THE ADVERT RULING (owner, 08-19): a proven recording's stretch grades as a wait. The graded
  // clock is what the colors and the pill read; the record's real number stays printed beside it.
  const asWait = m.advert && m.advert.asWaitSec > 0 ? m.advert.asWaitSec : 0;
  if (m.meterSec != null) {
    const graded = Math.max(0, m.meterSec - asWait);
    const pass = cap == null || redFrom == null ? null : graded < redFrom;
    const inYellow = pass === true && cap != null && graded > cap;
    const waited = (m.speakingSec != null || m.listeningSec != null)
      ? Math.max(0, m.meterSec - (m.speakingSec ?? 0) - (m.listeningSec ?? 0)) : null;
    rows.push({ label: "Charlie on the meter",
      value: cap == null ? `${m.meterSec}s`
        : asWait > 0 ? `${m.meterSec}s on the record, ${graded}s graded against ${cap}s`
        : inYellow ? `${m.meterSec}s, over the ${cap}s goal but inside your yellow ${redFrom! - 1}s`
        : `${m.meterSec}s against ${cap}s`, pass,
      say: asWait > 0
        ? { pre: "Charlie's clock grades as ", num: secWord(graded), post: ".",
            tail: `It ran ${m.meterSec} on the record.${cap == null ? "" : ` The goal is ${cap}.`}` }
        : { pre: "Charlie was on the clock ", num: secWord(m.meterSec), post: ".",
            tail: cap == null ? undefined : `The goal is ${cap}.` },
      open: (waited != null
        ? `Talking, listening and waiting all count while Charlie is on the clock. On this check he spoke for ${secWord(m.speakingSec ?? 0)}, listened for ${secWord(m.listeningSec ?? 0)}, and waited for ${secWord(waited)}.`
        : "Talking, listening and waiting all count while Charlie is on the clock, and every second bills the same.")
        + (asWait > 0 ? ` After the check ended, our reader proved a voice on it was a recording the store played, so ${secWord(asWait)} of his clock grade as waiting — the row under this one says why.` : "") });
    if (pass === false) {
      fails.push(asWait > 0
        ? `Charlie's graded meter ran ${graded} seconds (${m.meterSec} on the record; the store's recording played through ${asWait}), past your yellow line of ${redFrom! - 1}, against the ${cap} second goal.`
        : cap === METER_GOAL_SEC
        ? `Charlie ran ${m.meterSec} seconds on the meter, past your yellow line of ${redFrom! - 1}, against the ${cap} second goal.`
        : `Charlie ran ${m.meterSec} seconds on the meter against this card's ${cap} second line.`);
      shortFails.push(asWait > 0 ? `Charlie graded meter time, ${graded} seconds` : `Charlie meter time, ${m.meterSec} seconds`);
    }
    rows[rows.length - 1].tone = pass === false ? "r" : inYellow ? "y" : pass === true ? "g" : undefined;
    // THE FORGIVENESS IS NEVER SILENT: its own row names the seconds and why they grade as a wait,
    // so the sheet shows exactly what the grade set aside and the record stays the record.
    if (asWait > 0) {
      rows.push({ label: "The store's recording, graded as a wait", value: `${asWait}s`, pass: null,
        say: { pre: "", num: secWord(asWait), post: " of that was the store's recording playing, so it grades as a wait." },
        open: "After the check ended, our reader proved that what sounded like Staff talking was really a recording the store played — the check log names the line. A recorded voice is the one sound the live ear can never refuse, so the hold was never caught during the check. The owner ruled these grade fairly after the fact: as if the hold had been caught when the store's recording started, with Charlie dropped 3 seconds in. The record itself, the real cost and what the customer paid are unchanged." });
    }
    // The waiting slice is the piece of his meter where nobody said anything — the 9 silent
    // seconds of 08-16. Shown whenever it was measured; its own bound is the owner's open
    // decision (spec decision 2), so it is not graded alone yet. It already drags the two graded
    // numbers: waited seconds sit inside the meter cap and cost money against the floor.
    // THE WASTE FAILS THE CHECK NOW (owner's ruling, 08-19 night, widened by him 08-20): green to 3
    // seconds, yellow to 8, red from 9, and a red one fails the whole check by name. He ruled the
    // wider yellow after 415, 423, 424 and 427 all landed between 4 and 7 on the head start he
    // himself ordered. These are TRUE seconds, measured on
    // the call itself while his session was open and billing with the store holding us: no
    // forgiveness of any kind is applied to this number, whatever the grade does elsewhere.
    if (m.awakeOnHoldSec != null) {
      const sec = m.awakeOnHoldSec;
      const tone: "g" | "y" | "r" = sec <= AWAKE_ON_HOLD_GREEN ? "g" : sec <= AWAKE_ON_HOLD_YELLOW ? "y" : "r";
      toPass.push(`awake on hold ${AWAKE_ON_HOLD_YELLOW} seconds or less`);
      rows.push({ label: "Awake while the store had us on hold", value: `${sec}s, green at ${AWAKE_ON_HOLD_GREEN}`,
        pass: tone !== "r", tone,
        say: { pre: "Charlie stayed awake ", num: secWord(sec), post: " while the store had us waiting." },
        open: "The store was playing music, an advert, or nothing at all, and Charlie's meter was running through it. Every one of these seconds is money spent on hearing a store's hold music. When the system recognises the wait he is dropped and this number is small; when it cannot, this is what it costs. It is the real measured number, never an adjusted one." });
      if (tone === "r") {
        fails.push(`Charlie sat awake ${sec} seconds while the store had us waiting, against ${AWAKE_ON_HOLD_GREEN} green and red from ${AWAKE_ON_HOLD_YELLOW + 1}.`);
        shortFails.push(`awake on hold, ${sec} seconds`);
      }
    }
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
    // THE PROFIT ROW IS A FRIEND OF THE METER ROW (the advert ruling, owner 08-19): the forgiven
    // seconds are Charlie's billed seconds, so the same as-if prices them out of the GRADE — had
    // the hold been caught, they would never have cost anything. The real percent stays printed,
    // and the real cost and the customer's charge are untouched. Every other check keeps the 08-17
    // ruling exactly: the sheet shows and grades only the real profit.
    const gradedPct = asWait > 0 && m.advert?.gradedProfitPct != null ? m.advert.gradedProfitPct : null;
    const gradePct = gradedPct ?? m.profitPct;
    const pass = floor == null ? null : gradePct >= floor;
    rows.push({ label: "Gross profit",
      value: gradedPct != null
        ? (floor == null ? `${m.profitPct}% on the record, graded ${gradedPct}%` : `${m.profitPct}% on the record, graded ${gradedPct}% against the ${floor}% floor`)
        : floor == null ? `${m.profitPct}%` : `${m.profitPct}% against the ${floor}% floor`,
      pass, tone: pass === false ? "r" : pass === true ? "g" : undefined,
      say: gradedPct != null
        ? { pre: "This check grades as ", num: `${gradedPct}%`, post: ".",
            tail: `It made ${m.profitPct} on the record; the difference is the recording's seconds.${floor == null ? "" : ` The floor is ${floor}.`}` }
        : { pre: "This check made ", num: `${m.profitPct}%`, post: ".",
            tail: floor == null ? undefined : `The floor is ${floor}.` },
      // A FLOOR THAT IS NOT THE USUAL ONE ALWAYS SAYS WHY (owner, 08-17 late). The hold tests grade
      // against 56 because their own scene forces the phone line's second billed minute; tapping
      // the row opens that sentence in his own words. Nothing else about a hold test is softened:
      // the meter colors and every gap row are exactly as strict here as on any other card.
      open: "The price of the check, minus what it cost to run, as a share of the price. The Check cost card below says where the money went."
        + (gradedPct != null ? " The graded percent prices the store's recording seconds out of Charlie's cost, per the owner's advert ruling; the real cost and the customer's charge are unchanged." : "")
        + (b.floorWhy ? ` ${b.floorWhy}` : "") });
    if (pass === false) {
      fails.push(gradedPct != null
        ? `The check grades ${gradedPct}% gross profit against the ${floor}% floor (${m.profitPct}% on the record).`
        : `The check made ${m.profitPct}% gross profit against the ${floor}% floor.`);
      shortFails.push(`profit ${gradePct}% under the ${floor}% floor`);
    }
  }

  return { pass: fails.length === 0, fails, shortFails, toPass, rows };
}

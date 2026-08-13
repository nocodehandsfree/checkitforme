// WHAT A CALL ACTUALLY COST — measured rates only, no estimates.
//
// Every number here was measured against a real bill, not read off a rate card. Where our own docs
// disagreed with the bill, the bill won (report-abc-lanes-2026-07-24.md):
//   • The Calc page billed the phone line per SECOND. The carrier bills WHOLE MINUTES, rounded up.
//   • Our docs carried three different agent rates ($0.072, ~$0.10, ~$0.22/min). The account says
//     723 credits/min. One was 31% low, another 66% high.
//
// Money is handled in MICRODOLLARS (millionths of a dollar, integers) so nothing drifts through
// floating-point addition and a total can be summed across a million calls exactly.

/** One US dollar in microdollars. */
export const USD = 1_000_000;

/** The rates. Every one carries where it came from and when it was measured. */
export interface Rates {
  /** Outbound carrier minute, billed WHOLE minutes rounded up. Measured on 104 real calls, 07-24. */
  linePerMinUsd: number;
  /** Audio fork (media streams), per minute per concurrent stream. Measured 07-24. */
  forkPerMinUsd: number;
  /** What one voice-provider credit costs: monthly plan fee ÷ monthly credit allowance.
   *  Measured 07-24 from the live account: $22 ÷ 145,094 credits. */
  creditUsd: number;
  /** Credits the live reasoning session burns per connected minute — voice + brain together.
   *  Measured 07-24: 48,627 credits across 67.2 agent minutes. Bills per SECOND, no minute cliff. */
  charlieCreditsPerMin: number;
  /** Credits per character to synthesize a recorded line (turbo tier). */
  ttsCreditsPerChar: number;
  /** ECHO'S WORDS, per minute of the phone line (owner 08-07). The transcriber listens from the
   *  moment the stream opens to the moment it closes, whether Charlie is on the line or not, so it
   *  is priced on the CALL's minutes and not on his. The owner's own figure, about half a cent a
   *  minute; Admin can correct it without a deploy like every other rate here. */
  sttPerMinUsd: number;
}

/** Measured 2026-07-24 against the live accounts. Overridable from Admin so a re-measure needs no
 *  deploy — the runtime always costs a call with the rates in force when it ran. */
export const MEASURED_RATES: Rates = {
  linePerMinUsd: 0.0140,
  forkPerMinUsd: 0.0044,
  creditUsd: 22 / 145_094,      // = $0.00015163
  charlieCreditsPerMin: 723,    // = $0.10963/min = $0.0018272/sec
  ttsCreditsPerChar: 1,
  sttPerMinUsd: 0.0050,         // Echo's words, the owner's figure 08-07: about half a cent a minute
};

/** Everything a call spent, in microdollars. Integers throughout. */
export interface CallCost {
  /** The carrier leg — whole minutes, rounded up. The 60-second cliff lives here. */
  lineUsd: number;
  /** The audio forks we run for listening and for the bridge. */
  forkUsd: number;
  /** The billed reasoning session, per second. */
  charlieUsd: number;
  /** Recorded lines synthesized for this call (0 once they are cached and reused). */
  clipsUsd: number;
  /** Echo's words: the transcriber on the phone line, for as long as the line was up. */
  sttUsd: number;
  totalUsd: number;
  /** The pieces a person asks about, spelled out. */
  billedMinutes: number;
  charlieSecs: number;
  /** What the dead-air seconds on this call cost us. Already inside charlieUsd — this is the
   *  slice we would get back by keeping the agent off the line while nobody is talking. */
  avoidableUsd: number;
}

const up = (n: number) => Math.ceil(n - 1e-9); // ceil that isn't fooled by float dust

export interface CostInput {
  /** Whole seconds the carrier leg was up. */
  callSecs: number;
  /** Seconds the billed reasoning session was open. */
  charlieSecs: number;
  /** Seconds of that with nobody talking. */
  avoidableSecs: number;
  /** Seconds each audio fork ran. One entry per concurrent stream — a listening-nav call runs the
   *  live fork for the whole call AND the bridge stream from handoff, and both are billed. */
  forkSecs?: number[];
  /** Characters of speech synthesized for this call. 0 when the lines came from the cache. */
  ttsChars?: number;
  /** Was Echo's transcriber listening on this check? False prices it at nought (an older check, or
   *  one where the socket never came up). Left out means yes, which is every check from 08-07. */
  sttOn?: boolean;
}

/** Price one call. Pure — no clock, no network, no database. */
export function costCall(inp: CostInput, rates: Rates = MEASURED_RATES): CallCost {
  const billedMinutes = inp.callSecs > 0 ? up(inp.callSecs / 60) : 0;
  const lineUsd = Math.round(billedMinutes * rates.linePerMinUsd * USD);

  const forkMinutes = (inp.forkSecs ?? []).reduce((s, secs) => s + Math.max(0, secs) / 60, 0);
  const forkUsd = Math.round(forkMinutes * rates.forkPerMinUsd * USD);

  const charliePerSec = (rates.charlieCreditsPerMin / 60) * rates.creditUsd;
  const charlieUsd = Math.round(Math.max(0, inp.charlieSecs) * charliePerSec * USD);
  const avoidableUsd = Math.round(Math.max(0, Math.min(inp.avoidableSecs, inp.charlieSecs)) * charliePerSec * USD);

  const clipsUsd = Math.round(Math.max(0, inp.ttsChars ?? 0) * rates.ttsCreditsPerChar * rates.creditUsd * USD);

  // ECHO'S WORDS (owner 08-07). Billed on the seconds the phone line was up, because that is exactly
  // how long the transcriber listens: it opens with the stream and closes with it. A check that ran
  // without one (no key, or the socket never came up) is priced at nought, never at a guess.
  const sttUsd = inp.sttOn === false ? 0 : Math.round((Math.max(0, inp.callSecs) / 60) * rates.sttPerMinUsd * USD);

  return {
    lineUsd, forkUsd, charlieUsd, clipsUsd, sttUsd,
    totalUsd: lineUsd + forkUsd + charlieUsd + clipsUsd + sttUsd,
    billedMinutes, charlieSecs: Math.max(0, inp.charlieSecs), avoidableUsd,
  };
}

/** ONE STATUS VERIFICATION READ (the second read of the transcript). Not on the phone bill: it is
 *  the reader model's own metered price — the provider's published per-token prices at the read's
 *  real shape (about 700 tokens of transcript in, about 120 of answer out, gemini flash lite).
 *  Small on purpose: the whole point of the cheap reader is that double checking costs a rounding
 *  error next to Charlie's 11 cents a minute. */
// Remeasured 08-13 for the new Groq reader (llama-3.3-70b-versatile, $0.59 in / $0.79 out per
// million tokens; a read is about 900 tokens of prompt and transcript in, 120 out). The old
// 8b reader is decommissioned by Groq on 08-16; the 70b scored 8 of 8 on the robot conversations
// where the 8b scored 7 (scripts/reader-eval.ts), so the dearer read buys fewer "couldn't tell"s.
export const STATUS_READ_USD = Math.round(0.000626 * USD);

/** ONE COST, FIVE BUCKETS, HIS NAMES (owner ruling 08-04, renamed 08-07): Bravo (Menu Nav) ·
 *  Foxtrot (Phone Line) · Echo (Ears) · Charlie (Voice) · Status (Verification). His law is that
 *  every cost rolls into nav time and talk time, so Bravo is the nav phase's slice of the line and
 *  the listening, and Foxtrot and Echo carry the rest — the buckets SUM TO THE TOTAL exactly,
 *  nothing is counted twice, and the whole-minute rounding cliff stays on the phone line where the
 *  carrier puts it. Delta is free per check (the recording is cached), so there is no Delta line.
 *  Every rate in the detail rows comes from the rates in force, never typed anywhere else.
 *
 *  ONE LINE PER NAME, AND IT OPENS (owner 08-07). Echo's words shipped as a SECOND Echo line and he
 *  sent it back: "everything should roll up underneath Echo". So Echo (Ears) is one line carrying
 *  the listening AND the words, and Charlie (Voice) is one line carrying the seconds he spoke, the
 *  seconds he listened and the seconds he waited. Opening either shows those pieces with their own
 *  seconds and their own cost, which is where the waste is visible. */
export interface CostBucket { key: string; label: string; usd: number; detail: Array<[string, string]> }
const mmss = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, Math.round(secs)) % 60).padStart(2, "0")}`;
const perMin = (usd: number) => `${(usd * 100).toFixed(1)}¢`;

/** Charlie's seconds, split the way he spends them, each with what it cost. Speaking and listening
 *  are measured off the same frames the ear uses; waiting is whatever is left of his open seconds,
 *  and it is the only one of the three we are trying to delete. */
function charliePieces(
  cost: CallCost,
  t: { speakingSecs?: number | null; listeningSecs?: number | null },
  rates: Rates,
): Array<[string, string]> {
  if (t.speakingSecs == null && t.listeningSecs == null) return [];
  const open = Math.max(0, cost.charlieSecs);
  const spoke = Math.max(0, Math.min(t.speakingSecs ?? 0, open));
  const heard = Math.max(0, Math.min(t.listeningSecs ?? 0, open - spoke));
  const waited = Math.max(0, open - spoke - heard);
  const perSec = (rates.charlieCreditsPerMin / 60) * rates.creditUsd;
  const at = (secs: number) => `${secs}s · ${money(Math.round(secs * perSec * USD))}`;
  return [["Speaking", at(spoke)], ["Listening", at(heard)], ["Waiting", at(waited)]];
}

export function costBuckets(
  cost: CallCost,
  /** `speakingSecs` and `listeningSecs` are measured on the call itself, and whatever is left of
   *  Charlie's open seconds is him waiting. Left out, his line simply does not break down. */
  t: { callSecs: number; navSecs: number | null; streams?: number; speakingSecs?: number | null; listeningSecs?: number | null },
  rates: Rates = MEASURED_RATES,
  statusReadUsd = 0,
): CostBucket[] {
  const nav = Math.max(0, Math.min(t.navSecs ?? 0, t.callSecs));
  const share = t.callSecs > 0 ? nav / t.callSecs : 0;
  const navLine = Math.round(cost.lineUsd * share);
  const navFork = Math.round(cost.forkUsd * share);
  const streams = Math.max(1, t.streams ?? 1);
  const b: CostBucket[] = [
    { key: "bravo", label: "Bravo (Menu Nav)", usd: navLine + navFork + cost.clipsUsd, detail: [
      ["Menu time", mmss(nav)],
      ["Rate (per minute)", perMin(rates.linePerMinUsd + rates.forkPerMinUsd * streams)],
      ...(cost.clipsUsd > 0 ? [["Spoken menu words", money(cost.clipsUsd)] as [string, string]] : []),
      ["Cost", money(navLine + navFork + cost.clipsUsd)],
    ] },
    { key: "foxtrot", label: "Foxtrot (Phone Line)", usd: cost.lineUsd - navLine, detail: [
      ["Line time", mmss(t.callSecs)],
      ["Rate (per minute)", perMin(rates.linePerMinUsd)],
      ["Billed (minutes)", mmss(cost.billedMinutes * 60)],
      ["Cost", money(cost.lineUsd - navLine)],
    ] },
    // EVERYTHING ECHO DOES, UNDER ECHO (owner 08-07). Hearing the line and writing down what was
    // said are both Echo, so they are one line that opens to the two of them.
    { key: "echo", label: "Echo (Ears)", usd: (cost.forkUsd - navFork) + cost.sttUsd, detail: [
      ["Line time", mmss(t.callSecs)],
      ["Hearing the line", `${perMin(rates.forkPerMinUsd * streams)} · ${money(cost.forkUsd - navFork)}`],
      ["Writing down the words", `${perMin(rates.sttPerMinUsd)} · ${money(cost.sttUsd)}`],
      ["Cost", money((cost.forkUsd - navFork) + cost.sttUsd)],
    ] },
    { key: "charlie", label: "Charlie (Voice)", usd: cost.charlieUsd, detail: [
      ["On the meter", mmss(cost.charlieSecs)],
      ["Rate (per minute)", perMin((rates.charlieCreditsPerMin) * rates.creditUsd)],
      // The "Covers: voice and thinking together" row is DELETED (owner 08-08): he knows what
      // Charlie's line covers and the row was explaining rather than telling him a number.
      // WHERE HIS SECONDS WENT (owner 08-07). His meter runs whether he is talking, hearing somebody
      // talk, or sitting on a line where nobody is saying anything. Only the last one is waste, and
      // it was invisible: check 354 billed 33 seconds of him and he never said a word.
      ...charliePieces(cost, t, rates),
      ["Cost", money(cost.charlieUsd)],
    ] },
    { key: "status", label: "Status (Verification)", usd: statusReadUsd, detail: [
      ["Cost", money(statusReadUsd)],
    ] },
  ];
  // No free items listed (owner ruling): a bucket that spent nothing does not render.
  return b.filter((x) => x.usd > 0);
}

/** Microdollars → the string a person reads. Under a dollar reads in cents, like the owner talks
 *  about it ("five cents"); a dollar or more reads in dollars. */
export function money(microUsd: number): string {
  const usd = microUsd / USD;
  const cents = usd * 100;
  // A real fraction of a cent shows as one, never as zero (owner 08-05): the status read costs
  // 0.012 cents a check and one decimal rounded it to 0.0, which read as free.
  if (cents > 0 && cents < 0.1) return `${cents.toFixed(3)}¢`;
  if (Math.abs(usd) < 1) return `${cents.toFixed(1)}¢`;
  return `$${usd.toFixed(2)}`;
}

/** Cost per delivered result across a batch of attempts — the ROI number. `delivered` counts the
 *  attempts that actually gave the customer an answer. Returns microdollars, or null with none. */
export function costPerResult(totalUsd: number, delivered: number): number | null {
  if (!delivered || delivered < 1) return null;
  return Math.round(totalUsd / delivered);
}

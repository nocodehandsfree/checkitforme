// THE NUMBER — cost model for a single check. Turns the recorded call timing (call_seconds,
// nav_seconds) into an estimated cost in cents and scores it against the two target boxes:
//   • ≤ 20 seconds of billed time with a HUMAN, OR
//   • ≤ 5¢ per call (at ~30s).
// Rates come from docs/finance/COST_MODEL.md. ElevenLabs is modeled under two scenarios because the
// real ConvAI price is still unconfirmed:
//   A = the code's credit basis (~$0.22/min) — pessimistic.
//   B = ConvAI per-minute on a volume plan (~$0.10/min) — likely real.
// ABC / connect-on-human only wakes the billed EL agent once a human is on the line, so with ABC ON
// the EL-billed portion is TALK time (call − nav), not the whole call. Twilio bills the whole call
// either way; the LLM nav pass is a flat estimate.

export const RATES = {
  twilioPerMin: 0.014,           // outbound US voice — both scenarios, whole call
  llmPerCall: 0.03,              // Haiku nav + Sonnet human, flat
  elPerMin: { A: 0.22, B: 0.10 } as Record<Scenario, number>,
};
export type Scenario = "A" | "B";
export const TARGET = { talkSeconds: 20, costCents: 5 };

export interface CallTiming {
  callSeconds?: number | null;   // total connected length
  navSeconds?: number | null;    // time navigating the tree / on hold before a human spoke
}

/** Human talk time (call − nav) — the portion measured against the ≤20s box, and the EL-billed
 *  portion when ABC is on. Clamped so a missing/oversized nav can't produce a negative. */
export function talkSeconds(t: CallTiming): number {
  const call = Math.max(0, t.callSeconds ?? 0);
  const nav = Math.min(call, Math.max(0, t.navSeconds ?? 0));
  return Math.max(0, call - nav);
}

/** Estimated cents for one call under a given EL scenario. With ABC on, EL bills only talk time;
 *  otherwise it bills the whole connected call. Always rounded to whole cents. */
export function callCostCents(t: CallTiming, scenario: Scenario = "A", abc = false): number {
  const call = Math.max(0, t.callSeconds ?? 0);
  const elBilledSec = abc ? talkSeconds(t) : call;
  const twilio = (call / 60) * RATES.twilioPerMin;
  const el = (elBilledSec / 60) * RATES.elPerMin[scenario];
  return Math.round((twilio + el + RATES.llmPerCall) * 100);
}

/** Does this call land in a target box? talkBox = human talk ≤ 20s; costBox = est. cost ≤ 5¢. */
export function scoreCall(t: CallTiming, scenario: Scenario = "A", abc = false) {
  const talk = talkSeconds(t);
  const cents = callCostCents(t, scenario, abc);
  const talkBox = talk > 0 && talk <= TARGET.talkSeconds;
  const costBox = cents <= TARGET.costCents;
  return { talk, cents, talkBox, costBox, inTarget: talkBox || costBox };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const pct = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Aggregate a set of completed calls into THE NUMBER: timing distribution, cost under both EL
 * scenarios (as-billed-today vs projected-with-ABC), and the share of calls in each target box.
 * `abcOn` = whether connect-on-human is live right now (drives the "current" cost columns).
 */
export function summarizeCosts(timings: CallTiming[], abcOn: boolean) {
  const calls = timings.map((t) => Math.max(0, t.callSeconds ?? 0)).filter((s) => s > 0);
  const talks = timings.map(talkSeconds).filter((s) => s > 0);
  const n = timings.filter((t) => (t.callSeconds ?? 0) > 0).length;

  const box = (scenario: Scenario, abc: boolean) => {
    const scored = timings.map((t) => scoreCall(t, scenario, abc));
    const cents = scored.map((s) => s.cents);
    return {
      avgCents: Math.round(avg(cents) * 10) / 10,
      medianCents: median(cents),
      pctCostBox: n ? Math.round((scored.filter((s) => s.costBox).length / n) * 100) : 0,
    };
  };

  return {
    n,
    seconds: {
      avgCall: Math.round(avg(calls)), medianCall: median(calls), p90Call: pct(calls, 90),
      avgTalk: Math.round(avg(talks)), medianTalk: median(talks), p90Talk: pct(talks, 90),
    },
    pctTalkBox: n ? Math.round((timings.filter((t) => { const s = talkSeconds(t); return s > 0 && s <= TARGET.talkSeconds; }).length / n) * 100) : 0,
    // "current" reflects the live ABC flag; "abc" is the projection with connect-on-human ON.
    cost: {
      A: { current: box("A", abcOn), abc: box("A", true) },
      B: { current: box("B", abcOn), abc: box("B", true) },
    },
    abcOn,
    target: TARGET,
    rates: RATES,
  };
}

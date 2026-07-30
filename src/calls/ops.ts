// WHAT OUR CHECKS ACTUALLY COST — summed off real finished checks, never modelled.
//
// The Calc page forecasts forwards from rates and assumptions. This does the opposite: it adds up
// the columns the receipt already stamped on every finished check (receipt-store.ts) and reports
// what really happened. Contract: docs/specs/admin-ops-dashboard/CONTRACT.md §5.
//
// DESIGN RULES
//  1. PURE. No db, no clock, no vendor names — the caller hands in rows and the statuses registry,
//     so every number here is unit-testable against real rows (scripts/test-ops-rollup.ts).
//  2. NEVER INVENT A NUMBER OR A SCALE. Money comes from the stamped `cost*Usd` columns; seconds
//     from the stamped second columns; the outcome scale is the owner's own `statuses` table; the
//     route names come from the calling engine's `laneNote()`. Nothing here holds a second copy.
//  3. NO BACKFILL (owner, 07-26). A check with no `costTotalUsd` was never stamped by the receipt,
//     so its cost is unknown — it is not counted, and it is never counted as a zero.
import { costPerResult } from "./cost";
import { laneNote, type Lane } from "./events";

/** One finished check, as much of the stamped row as this module reads. Anything null was never
 *  measured — and a number we did not measure is left out of its average, never averaged as zero. */
export interface CheckRow {
  id: number;
  startedAt: number;             // unix seconds
  status: string;
  statusKey: string | null;
  retailerId: number;
  lane: string | null;
  attemptOf: number | null;
  navSeconds: number | null;
  talkSeconds: number | null;
  menuSeconds: number | null;
  holdSeconds: number | null;
  charlieConnectedSeconds: number | null;
  charlieSpeakingSeconds: number | null;
  charlieListeningSeconds: number | null;
  charlieSilentSeconds: number | null;
  costTotalUsd: number | null;
  costAvoidableUsd: number | null;
}

/** A row of the owner's own statuses table. The ONLY outcome scale — the dashboard never keeps one. */
export interface StatusRow {
  key: string;
  label: string;
  emoji: string;   // an icon name from the drawn set, or a mark the picker knows
  color: string;
  tone: string;    // in · out · unk · soon — the owner's buckets
}

export interface OpsOpts {
  /** Test stores (Admin → Testing). Their checks are the owner's own and never join real numbers. */
  ownerOnly?: Set<number>;
  /** The owner's stats cut-off (setting `stats_since`), unix seconds. */
  since?: number;
  /** Now, unix seconds — passed in so this stays pure and the day buckets are testable. */
  nowSec: number;
  /** How many days the spark covers. */
  sparkDays?: number;
}

export interface Slice {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  checks: number;
  /** Mean spend on a check in this slice, microdollars. */
  perCheckUsd: number;
  totalUsd: number;
}

export interface OpsReport {
  /** How many finished, stamped checks these numbers are built from. Zero = say so, show nothing. */
  checks: number;
  /** Total spend across them, microdollars. */
  totalUsd: number;
  /** THE HERO: what a check costs us. Null when there is nothing to average yet. */
  perCheckUsd: number | null;
  /** The oldest and newest check counted, unix seconds — so the screen can say what it is reading. */
  firstAt: number | null;
  lastAt: number | null;
  /** Per day, oldest first. Days with no checks are kept as zero-check days so the spark is honest
   *  about the gaps rather than closing them up. */
  days: Array<{ day: string; checks: number; perCheckUsd: number | null }>;
  byOutcome: Slice[];
  byRoute: Slice[];
  /** Where the agent's billed seconds went. He bills every connected second, so dead air is money.
   *  Summed ONLY over the checks that recorded connected time — an early build stamped some of these
   *  columns and not others, and adding a row's listening seconds to a total it has no connected
   *  seconds for makes the three parts stop adding up to the bill. `n` says how many checks are in. */
  agent: {
    n: number;
    connectedSecs: number;
    speakingSecs: number;
    listeningSecs: number;
    silentSecs: number;
    /** The dead-air slice of the bill, summed off the stamped column. */
    avoidableUsd: number;
  };
  /** The clock a person reads: how long to a person, how long the menu took, how long on hold. Each
   *  averages ONLY the checks that measured it, and says how many that was. */
  clock: Array<{ key: string; label: string; avgSecs: number; n: number }>;
  /** Tries per delivered answer, and what an answer costs once the tries are paid for. */
  answers: {
    delivered: number;
    triesPerAnswer: number | null;
    costPerAnswerUsd: number | null;
    /** Checks that were a retry of an earlier one. */
    retries: number;
  };
}

/** The route names come from the calling engine, so the page and the engine cannot drift apart. */
const ROUTE_ORDER: Lane[] = ["direct", "alpha", "bravo", "delta", "unknown"];

/** Did the customer actually get an answer? The owner's own tone bucket decides — `unk` (and an
 *  unknown status) is not an answer. There is no second scale for this anywhere. */
function isAnswer(tone: string | undefined): boolean {
  return tone === "in" || tone === "out" || tone === "soon";
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

/** YYYY-MM-DD in UTC. The buckets only have to be stable and comparable, not local. */
function dayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/**
 * Which checks count. A row is in only when the receipt stamped it with a cost — that stamp IS the
 * clean slate the owner asked for, because the old engine never wrote one. Cancelled checks are a
 * non-result (never billed, no report) and stay out, as do the owner's own test stores.
 */
export function countable(rows: CheckRow[], opts: OpsOpts): CheckRow[] {
  const ownerOnly = opts.ownerOnly ?? new Set<number>();
  const since = opts.since ?? 0;
  return rows.filter((r) =>
    r.costTotalUsd != null
    && r.status !== "admin_hangup"
    && !ownerOnly.has(r.retailerId)
    && (r.startedAt || 0) >= since);
}

/** Sum a set of finished checks into what the dashboard shows. Pure. */
export function opsRollup(rows: CheckRow[], statuses: StatusRow[], opts: OpsOpts): OpsReport {
  const kept = countable(rows, opts);
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const totalUsd = kept.reduce((s, r) => s + (r.costTotalUsd ?? 0), 0);

  // ---- the spark: one bucket a day, gaps kept as gaps ----
  const sparkDays = Math.max(1, opts.sparkDays ?? 7);
  const push = (m: Map<string, number[]>, k: string, v: number) => { const cur = m.get(k) ?? []; cur.push(v); m.set(k, cur); };
  const perDay = new Map<string, number[]>();
  for (const r of kept) push(perDay, dayKey(r.startedAt), r.costTotalUsd ?? 0);
  const days: OpsReport["days"] = [];
  for (let i = sparkDays - 1; i >= 0; i--) {
    const k = dayKey(opts.nowSec - i * 86400);
    const xs = perDay.get(k) ?? [];
    days.push({ day: k, checks: xs.length, perCheckUsd: xs.length ? mean(xs) : null });
  }

  // ---- by outcome: the owner's statuses table is the scale, in its own order ----
  const outAgg = new Map<string, number[]>();
  for (const r of kept) push(outAgg, r.statusKey || r.status || "unknown", r.costTotalUsd ?? 0);
  const byOutcome: Slice[] = [...outAgg.entries()].map(([key, xs]) => {
    const s = byKey.get(key);
    return {
      key,
      // A key with no row in the registry is shown as itself rather than renamed by us — an invented
      // label would hide the fact that the registry is missing a status.
      label: s?.label || key,
      color: s?.color,
      icon: s?.emoji,
      checks: xs.length,
      perCheckUsd: mean(xs),
      totalUsd: xs.reduce((a, b) => a + b, 0),
    };
  }).sort((a, b) => b.checks - a.checks);

  // ---- by route: the engine's own words for a lane ----
  const routeAgg = new Map<string, number[]>();
  for (const r of kept) push(routeAgg, r.lane || "unknown", r.costTotalUsd ?? 0);
  const byRoute: Slice[] = [...routeAgg.entries()]
    .sort((a, b) => ROUTE_ORDER.indexOf(a[0] as Lane) - ROUTE_ORDER.indexOf(b[0] as Lane))
    .map(([key, xs]) => ({
      key,
      label: laneNote(key as Lane),
      checks: xs.length,
      perCheckUsd: mean(xs),
      totalUsd: xs.reduce((a, b) => a + b, 0),
    }));

  // ---- the agent's billed seconds. Summed, never re-derived from a rate. ----
  const billed = kept.filter((r) => r.charlieConnectedSeconds != null);
  const sum = (rows2: CheckRow[], pick: (r: CheckRow) => number | null) => rows2.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const agent = {
    n: billed.length,
    connectedSecs: sum(billed, (r) => r.charlieConnectedSeconds),
    speakingSecs: sum(billed, (r) => r.charlieSpeakingSeconds),
    listeningSecs: sum(billed, (r) => r.charlieListeningSeconds),
    silentSecs: sum(billed, (r) => r.charlieSilentSeconds),
    // The dead-air COST rides the whole counted set: it is money we were actually charged on every
    // check, whether or not that check's second columns survived the build it ran on.
    avoidableUsd: sum(kept, (r) => r.costAvoidableUsd),
  };

  // ---- the clock. Each line averages ONLY the checks that measured it. ----
  const measured = (pick: (r: CheckRow) => number | null) => kept.map(pick).filter((v): v is number => v != null);
  const clockOf = (key: string, label: string, pick: (r: CheckRow) => number | null) => {
    const xs = measured(pick);
    return { key, label, avgSecs: mean(xs), n: xs.length };
  };
  const clock = [
    clockOf("toPerson", "Time to a person", (r) => r.navSeconds),
    clockOf("talk", "Time talking to Staff", (r) => r.talkSeconds),
    clockOf("menu", "Time in the phone menu", (r) => r.menuSeconds),
    clockOf("hold", "Time left on hold", (r) => r.holdSeconds),
  ].filter((c) => c.n > 0);

  // ---- tries per delivered answer ----
  const delivered = kept.filter((r) => isAnswer(byKey.get(r.statusKey || "")?.tone)).length;
  const answers = {
    delivered,
    triesPerAnswer: delivered ? Math.round((kept.length / delivered) * 10) / 10 : null,
    costPerAnswerUsd: costPerResult(totalUsd, delivered),
    retries: kept.filter((r) => r.attemptOf != null).length,
  };

  const times = kept.map((r) => r.startedAt).filter((t) => t > 0);
  return {
    checks: kept.length,
    totalUsd,
    perCheckUsd: kept.length ? Math.round(totalUsd / kept.length) : null,
    firstAt: times.length ? Math.min(...times) : null,
    lastAt: times.length ? Math.max(...times) : null,
    days,
    byOutcome,
    byRoute,
    agent,
    clock,
    answers,
  };
}

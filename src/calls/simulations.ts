// SIMULATIONS — runs of simulated calls, graded by the SAME cards and the SAME meter law as a
// real check, stored in their OWN table, shown behind the Testing section's switch.
// (docs/specs/self-improving-charlie/README.md, THE SIMULATIONS VIEW build contract; the owner's
// go 08-18: "pull staging build everything locally".)
//
// THE PM'S WALLS, held by construction:
//   the grader     `TEST_CARDS` + `meterVerdict` are IMPORTED and re-exported below so a test can
//                  assert they are the very same objects real checks use — never a second grader.
//   the filing     everything here reads and writes `sim_runs` ONLY. Nothing in this module
//                  touches the checks record, the twenty tests' scenes, or the robot store's
//                  settings — asserted by scripts/test-simulations.ts against this file's source.
//   no projection  a simulation carries NO money numbers. `profitPct` is hard-null at the one
//                  grading door, so the meter half grades seconds only and no made-up percent
//                  can exist to print. Real money comes from the robot store confirm call.
//   the numbering  a simulated call is named "call N of M" inside its run, never a check-style id.
//
// WHO GENERATES THE CALLS: an agent session on the owner's own Anthropic plan writes the
// conversations and their measured seconds, then posts the run through the admin API
// (scripts/simulate.ts). This module grades and stores; it never invents a conversation.
import { db } from "../db/client";
import { simRuns } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { TEST_CARDS, cardVerdict, type TestCard } from "./behaved";
import { meterVerdict } from "./meter";

/** Re-exported untouched so the contract test can prove the grader is the same object. */
export { TEST_CARDS as SIM_CARDS, meterVerdict as simMeterGrader, cardVerdict as simCardGrader };

/** One simulated call as the poster sends it: the conversation, the seconds the simulation
 *  measured, and which of the owner's cards it was running. */
export interface SimCallIn {
  cardKey: string;
  statusKey: string | null;
  meterSec: number;
  speakingSec?: number | null;
  listeningSec?: number | null;
  /** The conversation, in order. `who` is "staff" or "charlie". */
  lines: Array<{ who: string; text: string }>;
  /** A short failure name in the owner's colon style, set by the generator when it saw the
   *  conversation go wrong (e.g. "Goodbye: too early"). The grade below can also fail a call. */
  failName?: string | null;
  /** One plain sentence saying why, shown only inside the opened failure. */
  why?: string | null;
}

export interface SimCallStored extends SimCallIn {
  /** "call N of M" — the only name a simulated call ever has. */
  n: number;
  pass: boolean;
  meterFails: string[];
}

export interface SimRunIn {
  /** The run's name in the owner's colon pattern, e.g. "Goodbye: shorter". */
  name: string;
  /** One short sentence under the name. */
  sub?: string;
  /** The longer words behind the info circle. */
  info?: string;
}

/** GRADE ONE SIMULATED CALL — the same two halves a real check gets. The card names the status it
 *  must come back with; the meter half grades the seconds with the owner's colors. `profitPct` is
 *  null BY LAW here: a simulation has no money, so no floor is graded and none can print. */
export function gradeSimCall(c: SimCallIn): { pass: boolean; meterFails: string[] } {
  const card: TestCard | undefined = TEST_CARDS[c.cardKey];
  if (!card) return { pass: false, meterFails: [`No card named ${c.cardKey}.`] };
  const meter = meterVerdict(card, {
    meterSec: Math.max(0, Math.round(c.meterSec)),
    speakingSec: c.speakingSec ?? null, listeningSec: c.listeningSec ?? null,
    profitPct: null,
  });
  const statusOk = card.status == null ? true : c.statusKey === card.status;
  const saidFailed = !!c.failName;
  return { pass: statusOk && meter?.pass !== false && !saidFailed, meterFails: meter?.fails ?? [] };
}

/** The last line of a run's report. Names the robot store, never a real store (PM wall 4). */
export function simVerdictLine(passed: number, failed: number): string {
  return failed === 0 || failed <= Math.max(1, Math.round((passed + failed) * 0.02))
    ? "Worth one real call at the robot store to confirm."
    : "Not ready for the robot store yet.";
}

/** File a run: grade every call, keep the failures whole (their conversations), keep the passes
 *  as numbers, and store ONE row. Returns what the list shows. */
export async function fileSimRun(run: SimRunIn, calls: SimCallIn[]) {
  const graded: SimCallStored[] = calls.slice(0, 5000).map((c, i) => {
    const g = gradeSimCall(c);
    return { ...c, n: i + 1, pass: g.pass, meterFails: g.meterFails };
  });
  const failed = graded.filter((c) => !c.pass);
  const passed = graded.length - failed.length;
  const avg = graded.length ? graded.reduce((s, c) => s + (c.meterSec || 0), 0) / graded.length : 0;
  // Passes are kept as their numbers only; a failure keeps its whole conversation so the owner
  // can read exactly how it went wrong. One row per run, never a row per call.
  const kept = graded.map((c) => c.pass
    ? { n: c.n, cardKey: c.cardKey, statusKey: c.statusKey, meterSec: c.meterSec, pass: true, lines: [], meterFails: [] }
    : { ...c, lines: (c.lines || []).slice(0, 40) });
  const row = {
    name: String(run.name || "Unnamed run").slice(0, 60),
    sub: String(run.sub || "").slice(0, 160),
    info: String(run.info || "").slice(0, 400),
    startedAt: Math.floor(Date.now() / 1000),
    calls: graded.length, passed, failed: failed.length,
    avgMeterSec: Math.round(avg * 10) / 10,
    verdictLine: simVerdictLine(passed, failed.length),
    callsJson: JSON.stringify(kept),
  };
  const r = await db.insert(simRuns).values(row).returning({ id: simRuns.id });
  return { id: r[0]?.id, ...row, callsJson: undefined };
}

/** The list: newest first, numbers only. */
export async function listSimRuns(limit = 50) {
  const rows = await db.select({
    id: simRuns.id, name: simRuns.name, sub: simRuns.sub, startedAt: simRuns.startedAt,
    calls: simRuns.calls, passed: simRuns.passed, failed: simRuns.failed,
  }).from(simRuns).orderBy(desc(simRuns.id)).limit(Math.min(200, limit));
  return rows;
}

/** One run's report: the row plus its calls, failures carrying their conversations. */
export async function readSimRun(id: number) {
  const row = (await db.select().from(simRuns).where(eq(simRuns.id, id)))[0];
  if (!row) return null;
  let calls: SimCallStored[] = [];
  try { calls = JSON.parse(row.callsJson || "[]"); } catch { calls = []; }
  return { ...row, callsJson: undefined, callList: calls };
}

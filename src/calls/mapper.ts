// Mapper — "map until locked". The auto-continue loop the one-shot trainer never had: it keeps
// calling a chain (rotating stores, spaced out) until the fastest human-confirmed path is learned,
// then locks it. Stages per chain:
//   LISTEN    call 1 hears the menu out (listen-first), then acts on the same call if the path is
//             obvious. A direct human answer = locked in one call.
//   BASELINE  keep calling (with everything heard so far as a hint) until a human is reached ONCE.
//             That path locks immediately — live checks benefit right away — and gives the true
//             time-to-human.
//   OPTIMIZE  one experiment per call against the baseline: shorter words ("front", not "front
//             store services") and earlier barges. A menu that loops/regresses = that spot is
//             barge-unsafe → keep the last good version. Wins re-lock the chain with the faster path.
//   LOCKED    nothing left to test. Stamp Alpha/Bravo/Charlie and stop.
// Every call runs confirm-mode: any human contact ends with the real "any Pokémon cards in?" ask in
// the default workflow's voice (Branson global) — a mapping call is never wasted on a silent hangup.
// Safety: hard cap of calls/chain/day, spacing between calls, global kill-switch, per-chain stop.
import { eq } from "drizzle-orm";
import { db } from "./../db/client";
import { chains } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";
import { isCallingPaused } from "../redis";
import { placeNavCall, getNavSession, defaultWorkflowAsk, classifyMode, NavRecipe, NavStep } from "./navigator";
import { storeForChain, lockRecipeToChain, recipeFromSteps } from "./trainer-batch";

const DAILY_CAP = 12;        // calls per chain per day — past this, a human should look at it
const GAP_SEC = 75;          // spacing between calls to the same chain (politeness + IVR cool-down)
const CALL_MAX_SEC = 150;    // per-call watch window (slow IVRs take ~95s to a human)
const BASELINE_TRIES = 5;    // no human in this many attempts → needs-review, stop burning calls

export interface Experiment {
  kind: "shorten" | "barge";
  stepIdx: number;
  value?: string;            // shorten: the shorter word to try
  at?: number;               // barge: the earlier second to act at
  label: string;
  status: "pending" | "win" | "fail";
}
interface Attempt { n: number; phase: string; store: string; experiment?: string; outcome: string; seconds?: number | null }
export interface MapperRun {
  chainId: number; chainName: string;
  phase: "listen" | "baseline" | "optimize" | "locked" | "needs-review" | "stopped";
  running: boolean; stop?: boolean; stopReason?: string;
  attempt: number; callsToday: number;
  usedStores: number[];
  benchmark: number | null;      // the chain's navSeconds BEFORE this run (the CVS comparison)
  baseline: NavRecipe | null;
  best: NavRecipe | null;
  experiments: Experiment[];
  log: Attempt[];
  startedAt: number; updatedAt: number;
  navId?: string;
}

const runs = new Map<number, MapperRun>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Everything the admin UI needs, one poll. */
export function mapperState(): { runs: MapperRun[] } {
  return { runs: [...runs.values()].map((r) => ({ ...r, log: r.log.slice(-30) })) };
}

export function stopMapper(chainId: number) {
  const r = runs.get(chainId);
  if (!r || !r.running) return { ok: false, error: "not running" };
  r.stop = true; r.stopReason = "stopped by admin";
  return { ok: true, stopping: true };
}

/** Build the experiment list from a locked baseline: for every spoken step try the first word alone;
 *  for every step that sat waiting >3s try acting earlier. Bounded — the list IS the remaining work,
 *  so "how many tries" answers itself: as many as there are things left to learn. */
function buildExperiments(recipe: NavRecipe): Experiment[] {
  const out: Experiment[] = [];
  const steps = recipe.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.action === "say") {
      const words = String(st.value || "").trim().split(/\s+/);
      if (words.length > 1 && words[0].length > 2 && !/^(yes|no)$/i.test(words[0])) {
        out.push({ kind: "shorten", stepIdx: i, value: words[0].toLowerCase(), label: `say "${words[0].toLowerCase()}" instead of "${st.value}"`, status: "pending" });
      }
    }
    const prevAt = i === 0 ? 0 : (steps[i - 1].atSec ?? 0);
    const at = st.atSec ?? 0;
    if (at - prevAt > 3) {
      out.push({ kind: "barge", stepIdx: i, at: Math.max(prevAt + 1, at - 3), label: `${st.action} "${st.value}" at ${Math.max(prevAt + 1, at - 3)}s (was ${at}s)`, status: "pending" });
    }
  }
  return out.slice(0, 8); // bounded: 8 experiments ≈ 8 extra calls max on top of the baseline
}

/** Apply one experiment to the best recipe → a timed barge plan for the next call. */
function planFor(recipe: NavRecipe, ex: Experiment): Array<{ action: string; value: string; at: number }> {
  return (recipe.steps || []).map((st, i) => ({
    action: st.action || "say",
    value: ex.kind === "shorten" && i === ex.stepIdx ? (ex.value || st.value || "") : (st.value || ""),
    at: ex.kind === "barge" && i === ex.stepIdx ? (ex.at ?? st.atSec ?? 0) : (st.atSec ?? 0),
  }));
}

async function bumpDaily(chainId: number): Promise<number> {
  const key = `mapper_calls:${chainId}:${today()}`;
  const n = Number((await getSetting(key)) || 0) + 1;
  await setSetting(key, String(n));
  return n;
}

/** Start (or resume) mapping a chain until locked. Fire-and-forget; poll mapperState(). */
export async function startMapper(chainId: number): Promise<{ started?: boolean; error?: string; benchmark?: number | null }> {
  if (!chainId) return { error: "chainId required" };
  const existing = runs.get(chainId);
  if (existing?.running) return { error: "already mapping this chain" };
  const ch = (await db.select().from(chains).where(eq(chains.id, chainId)))[0];
  if (!ch) return { error: "chain not found" };
  const usedToday = Number((await getSetting(`mapper_calls:${chainId}:${today()}`)) || 0);
  if (usedToday >= DAILY_CAP) return { error: `daily cap reached (${DAILY_CAP}) — try tomorrow or raise the cap` };

  const run: MapperRun = {
    chainId, chainName: ch.name,
    phase: "listen", running: true,
    attempt: 0, callsToday: usedToday,
    usedStores: [],
    benchmark: ch.navSeconds ?? null,   // what we're trying to beat (the CVS benchmark readout)
    baseline: null, best: null, experiments: [], log: [],
    startedAt: Date.now(), updatedAt: Date.now(),
  };
  runs.set(chainId, run);

  (async () => {
    const ask = await defaultWorkflowAsk(); // Branson global's opener + voice, fetched once
    let baselineMisses = 0;
    while (run.running && !run.stop) {
      run.updatedAt = Date.now();
      // ---- guards ----
      if (await isCallingPaused()) { run.stopReason = "global kill-switch"; break; }
      if (run.callsToday >= DAILY_CAP) { run.stopReason = `daily cap (${DAILY_CAP} calls)`; run.phase = run.baseline ? run.phase : "needs-review"; break; }
      const ex = run.phase === "optimize" ? run.experiments.find((e) => e.status === "pending") : undefined;
      if (run.phase === "optimize" && !ex) { // nothing left to test → final lock below
        run.phase = "locked"; break;
      }
      const store = await storeForChain(chainId, run.usedStores);
      if (!store) { run.stopReason = "no open store to dial right now"; break; }

      // ---- place this attempt's call ----
      run.attempt++; run.callsToday = await bumpDaily(chainId);
      const isListen = run.phase === "listen";
      const barge = ex && run.best ? { plan: planFor(run.best, ex) } : undefined;
      const placed = await placeNavCall(
        chainId, store.id, store.name, store.phone,
        undefined, undefined, barge, undefined,
        { product: "Pokémon cards" },
        { listenFirst: isListen, askVoiceId: ask.voiceId, askText: ask.text },
      );
      if (placed.error || !placed.id) {
        run.log.push({ n: run.attempt, phase: run.phase, store: store.name, experiment: ex?.label, outcome: "dial failed: " + (placed.error || "?") });
        await sleep(GAP_SEC * 1000); continue;
      }
      run.navId = placed.id;
      run.usedStores.push(store.id);

      // ---- watch the call ----
      const deadline = Date.now() + CALL_MAX_SEC * 1000;
      let s = getNavSession(placed.id);
      while (Date.now() < deadline) {
        s = getNavSession(placed.id);
        if (!s || s.status === "human" || s.status === "done" || s.status === "failed") break;
        await sleep(3000);
      }
      run.navId = undefined;
      const reached = !!(s && s.status === "human" && s.confirmResult !== "redirect");
      const recipe = s ? (s.recipe ?? recipeFromSteps(s.steps as NavStep[], s.humanAtSec)) : null;
      const secs = recipe?.seconds ?? null;

      // ---- learn from the outcome ----
      if (run.phase === "listen" || run.phase === "baseline") {
        if (reached && recipe) {
          run.baseline = recipe as NavRecipe; run.best = recipe as NavRecipe;
          await lockRecipeToChain(chainId, recipe, s?.confidence ?? null); // usable by live checks NOW
          run.experiments = buildExperiments(recipe as NavRecipe);
          run.phase = run.experiments.length ? "optimize" : "locked";
          run.log.push({ n: run.attempt, phase: "baseline", store: store.name, outcome: `human reached — baseline locked (${classifyMode((s?.steps || []) as NavStep[]).label})`, seconds: secs });
          if (run.phase === "locked") break;
        } else {
          baselineMisses++; run.phase = "baseline";
          run.log.push({ n: run.attempt, phase: "baseline", store: store.name, outcome: `no human (${s?.status || "timeout"})${s?.confirmResult === "redirect" ? " — redirected: " + (s?.redirectTo || "") : ""}`, seconds: secs });
          if (baselineMisses >= BASELINE_TRIES) { run.phase = "needs-review"; run.stopReason = `no human in ${BASELINE_TRIES} attempts`; break; }
        }
      } else if (run.phase === "optimize" && ex) {
        const bestSecs = run.best?.seconds ?? Infinity;
        if (reached && recipe && typeof secs === "number" && secs < bestSecs - 1) {
          ex.status = "win";
          run.best = recipe as NavRecipe;
          await lockRecipeToChain(chainId, recipe, s?.confidence ?? null); // faster path → re-lock
          run.log.push({ n: run.attempt, phase: "optimize", store: store.name, experiment: ex.label, outcome: `WIN — ${secs}s (was ${bestSecs}s)`, seconds: secs });
        } else if (reached) {
          ex.status = "fail"; // reached a human but not faster — keep the old best
          run.log.push({ n: run.attempt, phase: "optimize", store: store.name, experiment: ex.label, outcome: `no gain (${secs ?? "?"}s vs ${bestSecs}s) — kept best`, seconds: secs });
        } else {
          ex.status = "fail"; // looped / lost the menu → that tweak is unsafe (e.g. barge point that restarts CVS)
          run.log.push({ n: run.attempt, phase: "optimize", store: store.name, experiment: ex.label, outcome: `unsafe — menu lost (${s?.status || "timeout"}); kept best`, seconds: secs });
        }
        if (!run.experiments.some((e) => e.status === "pending")) { run.phase = "locked"; break; }
      }
      await sleep(GAP_SEC * 1000);
    }

    // ---- wrap up ----
    if (run.stop && !run.stopReason) run.stopReason = "stopped by admin";
    if (run.phase === "locked" && run.best) {
      await lockRecipeToChain(chainId, run.best, null); // final state (idempotent)
      run.stopReason = run.stopReason || "nothing left to learn";
    } else if (run.stop) run.phase = "stopped";
    run.running = false; run.updatedAt = Date.now();
  })().catch((e) => {
    run.running = false; run.phase = run.baseline ? run.phase : "needs-review";
    run.stopReason = "engine error: " + String(e).slice(0, 120);
  });

  return { started: true, benchmark: run.benchmark };
}

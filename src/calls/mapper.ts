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
import { placeNavCall, getNavSession, defaultWorkflowAsk, classifyMode, menuHasCustomerService, NavRecipe, NavStep } from "./navigator";
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
  phase: "verify" | "listen" | "baseline" | "optimize" | "locked" | "needs-review" | "stopped";
  running: boolean; stop?: boolean; stopReason?: string;
  attempt: number; callsToday: number;
  usedStores: number[];
  store?: { id: number; name: string; phone: string } | null; // #3: the ONE store we hold across attempts
  rotate?: boolean;              // set when the held store proved a dead line → pick a fresh one
  target?: string;               // #1: owner-set desk to reach ("customer service" default)
  needsTarget?: boolean;         // #B: department-only tree, no CS option — owner should pick a target
  reachedSecs: number[];         // #A: every human-reached time this run, to measure ring variance
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
      const earlier = Math.max(prevAt + 1, at - 5); // meaningful cut per try; a loop = barge-unsafe, keep last good
      out.push({ kind: "barge", stepIdx: i, at: earlier, label: `${st.action} "${st.value}" at ${earlier}s (was ${at}s)`, status: "pending" });
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

/** #A: flag a recipe whose time-to-human depends on a department pickup — a big spread across this
 *  run's reached times, OR a navigated path with no customer-service option — so a lucky fast call
 *  doesn't set a misleading benchmark. Mutates the recipe in place. */
function markVariance(run: MapperRun, recipe: NavRecipe): void {
  const secs = run.reachedSecs.filter((n) => typeof n === "number");
  const spread = secs.length > 1 ? Math.max(...secs) - Math.min(...secs) : 0;
  const noCS = !menuHasCustomerService(recipe.menu);
  const navigated = recipe.type !== "direct" && (recipe.steps?.length ?? 0) > 0;
  if (spread > 40 || (noCS && navigated)) recipe.ringVariable = true;
}

/** Persist a reached recipe as the chain's locked path — stamping the owner target + the ring-variance
 *  flag (#A), and, for a department-only tree with NO customer-service option, raising a needs-target
 *  flag (#B) with the captured menu so the owner can pick the desk. Clears the flag once resolved. */
async function finalizeAndLock(run: MapperRun, chainId: number, recipe: NavRecipe, confidence: number | null): Promise<void> {
  if (run.target && !recipe.target) recipe.target = run.target;
  markVariance(run, recipe);
  await lockRecipeToChain(chainId, recipe, confidence);
  const navigated = recipe.type !== "direct" && (recipe.steps?.length ?? 0) > 0;
  const deptOnly = navigated && !menuHasCustomerService(recipe.menu);
  if (!run.target && deptOnly) {
    run.needsTarget = true;
    await setSetting(`nav_needs_target:${chainId}`, JSON.stringify({ menu: recipe.menu || [], menuPrompts: recipe.menuPrompts || [] }));
  } else {
    await setSetting(`nav_needs_target:${chainId}`, ""); // CS path found or owner target set → clear
  }
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
  // #4: never map a chain with no direct store line — muted (owner-hidden / no line) or callTarget off
  // (online-only / national call-center, e.g. Micro Center, Best Buy). These answer a call center, not
  // the store, so a "recipe" is meaningless and it wastes a real call.
  if (ch.muted) return { error: `${ch.name} is muted — skipped (no direct store line / owner-hidden)` };
  if (ch.callTarget === false) return { error: `${ch.name} has no direct store line (online-only / call-center) — skipped` };
  const usedToday = Number((await getSetting(`mapper_calls:${chainId}:${today()}`)) || 0);
  if (usedToday >= DAILY_CAP) return { error: `daily cap reached (${DAILY_CAP}) — try tomorrow or raise the cap` };
  // #1: the owner-set desk to aim for (customer service by default; a chosen department for dept-only chains).
  const target = ((await getSetting(`nav_target:${chainId}`)) || "").trim() || undefined;

  // Already-mapped chain (e.g. CVS): VERIFY the locked recipe first — replay it as a timed barge plan,
  // measure the REAL seconds, then optimize from there. Fresh discovery only if the replay misses twice.
  let lockedRecipe: NavRecipe | null = null;
  try { const r = ch.navRecipe ? (JSON.parse(ch.navRecipe) as NavRecipe) : null; if (r && Array.isArray(r.steps) && r.steps.length) lockedRecipe = r; } catch { /* fresh discovery */ }

  const run: MapperRun = {
    chainId, chainName: ch.name,
    phase: lockedRecipe ? "verify" : "listen", running: true,
    attempt: 0, callsToday: usedToday,
    usedStores: [], store: null, rotate: false, target, needsTarget: false, reachedSecs: [],
    benchmark: ch.navSeconds ?? null,   // what we're trying to beat (the CVS benchmark readout)
    baseline: null, best: null, experiments: [], log: [],
    startedAt: Date.now(), updatedAt: Date.now(),
  };
  runs.set(chainId, run);

  (async () => {
    const ask = await defaultWorkflowAsk(); // Branson global's opener + voice, fetched once
    let baselineMisses = 0, verifyMisses = 0;
    while (run.running && !run.stop) {
      run.updatedAt = Date.now();
      // ---- guards ----
      if (await isCallingPaused()) { run.stopReason = "global kill-switch"; break; }
      if (run.callsToday >= DAILY_CAP) { run.stopReason = `daily cap (${DAILY_CAP} calls)`; run.phase = run.baseline ? run.phase : "needs-review"; break; }
      const ex = run.phase === "optimize" ? run.experiments.find((e) => e.status === "pending") : undefined;
      if (run.phase === "optimize" && !ex) { // nothing left to test → final lock below
        run.phase = "locked"; break;
      }
      // Daytime gate (#5): storeForChain only returns a store that's OPEN NOW (real hours) and in 9am–8pm
      // LOCAL — naturally works east → west across the day, the owner's dialing order.
      // #3: hold ONE store across attempts — ring variance must not rotate us. Pick a fresh store only on
      // the first attempt or after the held line proved DEAD (disconnected / voicemail / store closed).
      if (!run.store || run.rotate) {
        const picked = await storeForChain(chainId, run.usedStores, true);
        if (!picked) { run.stopReason = "no store in local daytime hours right now — re-run when stores are open (mornings hit the east coast first)"; run.phase = run.baseline ? run.phase : "needs-review"; break; }
        run.store = { id: picked.id, name: picked.name, phone: picked.phone };
        run.usedStores.push(picked.id); run.rotate = false;
      }
      const store = run.store;

      // ---- place this attempt's call ----
      run.attempt++; run.callsToday = await bumpDaily(chainId);
      const isListen = run.phase === "listen";
      // Verify phase: replay the LOCKED recipe as a timed barge plan (the known "no → front →
      // general" words at their known seconds). Optimize phase: the current best with one tweak.
      const replay = run.phase === "verify" && lockedRecipe ? { plan: lockedRecipe.steps.map((st) => ({ action: st.action || "say", value: st.value || "", at: st.atSec ?? 0 })) } : undefined;
      const barge = ex && run.best ? { plan: planFor(run.best, ex) } : replay;
      // The PROVEN word-path rides along as the recovery playbook: if a barge misses or the menu
      // varies (Spanish intro, pharmacy-closed detour), the in-call brain answers each prompt with
      // the known words in order instead of flailing — the same logic live calls already use.
      const known = (run.best ?? lockedRecipe)?.steps || [];
      const hint = known.length
        ? known.map((st) => (st.action === "press" ? `press ${st.value}` : `say "${st.value}"`)).join(", then ")
          + ". If the menu restarts, speaks Spanish first, or mentions the pharmacy being closed, keep answering each prompt with these words in this order — they route to the FRONT STORE."
        : undefined;
      const placed = await placeNavCall(
        chainId, store.id, store.name, store.phone,
        undefined, hint, barge, undefined,
        { product: "Pokémon cards" },
        { listenFirst: isListen, askVoiceId: ask.voiceId, askText: ask.text, target: run.target },
      );
      if (placed.error || !placed.id) {
        run.log.push({ n: run.attempt, phase: run.phase, store: store.name, experiment: ex?.label, outcome: "dial failed: " + (placed.error || "?") });
        await sleep(GAP_SEC * 1000); continue;
      }
      run.navId = placed.id;

      // ---- watch the call ----
      const deadline = Date.now() + CALL_MAX_SEC * 1000;
      let s = getNavSession(placed.id);
      while (Date.now() < deadline) {
        s = getNavSession(placed.id);
        if (!s || s.status === "human" || s.status === "done" || s.status === "failed") break;
        await sleep(3000);
      }
      run.navId = undefined;
      // Reached = ANY hard evidence of a person/transfer (status, the path-confirmed timestamp, or an
      // answered confirm) — a raced Twilio "ended" callback must not score a good call as unsafe.
      const reached = !!(s && (s.status === "human" || s.humanAtSec != null || s.confirmResult === "answered") && s.confirmResult !== "redirect");
      const recipe = s ? (s.recipe ?? recipeFromSteps(s.steps as NavStep[], s.humanAtSec)) : null;
      const secs = recipe?.seconds ?? null;
      // #3: rotate to a fresh store ONLY on a confirmed dead line; ring-outs / menu-loops keep the same
      // store (per owner). #A: record every reached time so markVariance can spot department-ring swings.
      if (!reached && s?.deadLine) run.rotate = true;
      if (reached && typeof secs === "number") run.reachedSecs.push(secs);

      // ---- learn from the outcome ----
      if (run.phase === "verify" || run.phase === "listen" || run.phase === "baseline") {
        const wasVerify = run.phase === "verify";
        if (reached && recipe) {
          run.baseline = recipe as NavRecipe; run.best = recipe as NavRecipe;
          await finalizeAndLock(run, chainId, recipe as NavRecipe, s?.confidence ?? null); // usable by live checks NOW
          run.experiments = buildExperiments(recipe as NavRecipe);
          run.phase = run.experiments.length ? "optimize" : "locked";
          run.log.push({ n: run.attempt, phase: wasVerify ? "verify" : "baseline", store: store.name, outcome: `${wasVerify ? `locked map VERIFIED — real time ${secs ?? "?"}s (stored ${run.benchmark ?? "?"}s)` : "human reached — baseline locked"} (${classifyMode((s?.steps || []) as NavStep[]).label})`, seconds: secs });
          if (run.phase === "locked") break;
        } else if (wasVerify) {
          verifyMisses++;
          run.log.push({ n: run.attempt, phase: "verify", store: store.name, outcome: `replay missed (${s?.status || "timeout"})${verifyMisses >= 2 ? " — relearning from scratch" : ""}`, seconds: secs });
          if (verifyMisses >= 2) run.phase = "listen"; // the stored map may be stale — rediscover
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
          await finalizeAndLock(run, chainId, recipe as NavRecipe, s?.confidence ?? null); // faster path → re-lock
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
      await finalizeAndLock(run, chainId, run.best, null); // final state (idempotent)
      run.stopReason = run.stopReason || (run.needsTarget
        ? "locked, but no customer-service option in the menu — pick a target desk to re-map"
        : "nothing left to learn");
    } else if (run.stop) run.phase = "stopped";
    run.running = false; run.updatedAt = Date.now();
  })().catch((e) => {
    run.running = false; run.phase = run.baseline ? run.phase : "needs-review";
    run.stopReason = "engine error: " + String(e).slice(0, 120);
  });

  return { started: true, benchmark: run.benchmark };
}

// Mapper — the owner's three stages (07-30, docs/specs/mapping-admin/build-contract.md). The goal is
// never a department name: it is an ANSWER about the product, because a real yes or no from Staff is
// the only proof of the right door, and that is what lets this scale to any chain with no human help.
//   MAPPING MENU        one store. Answer every question with the FULL phrase, reach a person, ask
//                       about the product. The answer proves the door; a wrong desk kills that door
//                       for good and the next check takes the next one.
//   OPTIMIZING SPEED    the SAME store, inside its open hours, hang up on the second ring — no Staff,
//                       ever. ONE change per check; a win becomes the recipe, a loss is thrown away
//                       and a move that broke the walk is remembered as never-again.
//   PROVING DEPARTMENT  the finished recipe at DIFFERENT stores, one ask per store, never the same
//                       store twice. Three stores agree = map recipe locked, dated.
// Every check is GRADED by machine in finish (navigator) — this loop reads the same verdict the run
// log and the map fold carry, so it can never disagree with the screens.
// Safety: hard cap of calls/chain/day, spacing between calls, global kill-switch, per-chain stop.
import { eq } from "drizzle-orm";
import { db } from "./../db/client";
import { chains, retailers } from "../db/schema";
import { getSetting, setSetting, allSettings } from "../db/settings";
import { isCallingPaused } from "../redis";
import { placeNavCall, getNavSession, defaultWorkflowAsk, classifyMode, menuHasCustomerService, NavRecipe, NavStep } from "./navigator";
import { storeForChain, lockRecipeToChain, recipeFromSteps } from "./trainer-batch";
import { chainDialable } from "./recipe";
import { pathSignature, reportUnknown, recordObservation, recordCallPath, recordFailedAttempt, storeLocalTime, activeMap, MapRecipe, MapStep, type EvidenceCall } from "./mapgraph";
import { recipeFromCall, evidenceFromCall, CapturedStep } from "./map-capture";

const DAILY_CAP = 60;        // runaway guard only — owner 2026-07-10: the old 12/day cap is gone, a
                             // sweep converges every mapped chain in one day. Tune without a deploy
                             // via the "mapper_daily_cap" setting (0/unset = this default).
const GAP_SEC = 75;          // spacing between calls to the same chain (politeness + IVR cool-down)
const CALL_MAX_SEC = 150;    // per-call watch window (slow IVRs take ~95s to a human)
const TRANSFER_WAIT_SEC = 40; // after "transferring you now", how long we allow for a real voice before
                              // hanging up. The transfer is NOT the person (the 07-26 CVS finding).
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
  phase: "map" | "speed" | "prove" | "locked" | "needs-review" | "stopped";
  running: boolean; stop?: boolean; stopReason?: string;
  attempt: number; callsToday: number;
  usedStores: number[];
  store?: { id: number; name: string; phone: string } | null; // #3: the ONE store we hold across attempts
  rotate?: boolean;              // set when the held store proved a dead line → pick a fresh one
  target?: string;               // #1: owner-set desk to reach ("customer service" default)
  needsTarget?: boolean;         // #B: department-only tree, no CS option — owner should pick a target
  reachedSecs: number[];         // #A: every human-reached time this run, to measure ring variance
  bestMenuSecs?: number;         // the fastest MENU walk proved so far — what experiments are judged on
  bargeState?: Record<number, { lo: number; hi: number }>; // per-step binary-search bounds for "earliest second the IVR accepts"
  benchmark: number | null;      // the chain's navSeconds BEFORE this run (the CVS comparison)
  provedStores: number[];        // stores where Staff gave a real answer on THIS recipe (prove stage)
  doorsDead: string[];           // menu doors proven to reach the wrong desk — never chosen again
  expectedGreeting?: string;     // the menu's opening line as heard on the locked run (wrong-menu guard)
  proveMisses: number;           // prove-stage checks where nobody picked up (next store each time)
  winnerSession?: NavSessionLike; // the check whose route IS the recipe — written to the map at the lock
  baseline: NavRecipe | null;
  best: NavRecipe | null;
  experiments: Experiment[];
  log: Attempt[];
  startedAt: number; updatedAt: number;
  navId?: string;
  // Everything below exists so a run SURVIVES a redeploy (owner 07-30: two runs shot in the back by
  // teammates shipping). These were loop-local variables; on the run they ride the saved copy.
  lockedRecipe?: NavRecipe | null;  // the chain's recipe as read at start
  pinnedStoreId?: number;           // owner-named store for the whole run (was opts.storeId)
  mapMisses?: number;               // mapping-menu checks where nobody answered (was loop-local)
}

const runs = new Map<number, MapperRun>();

// ---- A run survives a restart (owner 07-30) ----
// The run's whole memory is saved to the settings table after every attempt; on boot, any run still
// marked running is reloaded and continues from its next step. The in-flight call at the moment of
// the restart dies with the old process — it is logged and never counted as evidence. The prod→staging
// settings mirror copies a fixed whitelist only, so these keys are never stomped (settings-sync.ts).
const runKey = (chainId: number) => `mapper_run:${chainId}`;
async function saveRun(run: MapperRun): Promise<void> {
  try { await setSetting(runKey(run.chainId), JSON.stringify(run)); } catch { /* best effort — the run must not die on a save */ }
}
async function clearRun(chainId: number): Promise<void> {
  try { await setSetting(runKey(chainId), ""); } catch { /* same */ }
}
// On SIGTERM (a redeploy draining us) the loop stops BEFORE its next call and leaves the saved copy
// marked running, so the replacement process resumes it. Without this, old and new would both dial.
let draining = false;
process.once("SIGTERM", () => { draining = true; });

/** Boot-time: reload every run that was mid-flight when the last process died and keep it going. */
export async function resumeMapperRuns(): Promise<number> {
  const all = await allSettings();
  let resumed = 0;
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith("mapper_run:") || !v) continue;
    let saved: MapperRun | null = null;
    try { saved = JSON.parse(v) as MapperRun; } catch { continue; }
    if (!saved?.chainId) continue;
    if (!saved.running || saved.stop) { await clearRun(saved.chainId); continue; } // finished or stopped stays that way
    if (runs.get(saved.chainId)?.running) continue;
    saved.navId = undefined;
    saved.log.push({ n: saved.attempt, phase: saved.phase, store: saved.store?.name || "", outcome: "restart wiped the call in flight — resumed from the last saved step; that attempt is not evidence" });
    runs.set(saved.chainId, saved);
    driveMapper(saved);
    resumed++;
  }
  return resumed;
}
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
  void saveRun(r); // a restart right after the tap must not resurrect a run the admin stopped
  return { ok: true, stopping: true };
}

/** Build the experiment list from a locked baseline. Two levers, per the owner's rule that reaching a
 *  human is only HALF the job — the other half is reaching them as fast as possible:
 *   - shorten: for every spoken step, try the first word alone ("front" not "front store services").
 *   - barge:   for every step the recipe sat >3s before acting, binary-search the EARLIEST second the
 *              IVR still accepts the press/word. Seed at the midpoint of (prev step, this step); the
 *              optimize loop then bisects toward the floor (see enqueueBinaryBarge). This converges on
 *              "as early as the machine allows" in a handful of calls instead of one 5s nibble. */
function buildExperiments(run: MapperRun, recipe: NavRecipe): Experiment[] {
  const out: Experiment[] = [];
  const steps = recipe.steps || [];
  run.bargeState = {};
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.action === "say") {
      const words = String(st.value || "").trim().split(/\s+/);
      if (words.length > 1 && words[0].length > 2 && !/^(yes|no)$/i.test(words[0])) {
        out.push({ kind: "shorten", stepIdx: i, value: words[0].toLowerCase(), label: `say "${words[0].toLowerCase()}" instead of "${st.value}"`, status: "pending" });
      }
    }
    // A step we have ALREADY PROVED cannot be barged is never tested again (owner 07-27: at CVS you
    // can barge in with "general" but not with "front"). That fact was learned by a real call that
    // looped the menu; re-proving it costs another call and another loop every single run.
    if ((st as { bargeSafe?: boolean }).bargeSafe === false) continue;
    const prevAt = i === 0 ? 0 : (steps[i - 1].atSec ?? 0);
    const at = st.atSec ?? 0;
    if (at - prevAt > 3) {
      const lo = prevAt, hi = at;                          // hi = known-good (baseline) time; lo = floor
      const mid = Math.max(lo + 1, Math.round((lo + hi) / 2));
      run.bargeState[i] = { lo, hi };
      out.push({ kind: "barge", stepIdx: i, at: mid, label: `${st.action} "${st.value}" at ${mid}s (was ${at}s)`, status: "pending" });
    }
  }
  return out.slice(0, 10); // initial list; convergence appends earlier bisections as it wins/backs off
}

/** Convergence step: after trying a barge at `mid`, tighten the bounds and queue the next bisection.
 *  A real early-accept SHOWS UP AS A TIME GAIN (the press advanced the menu sooner). If the press was
 *  dropped, the recovery brain still reaches the human but at ~the old time — so "reached, no gain" is
 *  a DROP, not an accept, and we back off later. Stops when the window closes to <=3s. */
function enqueueBinaryBarge(run: MapperRun, stepIdx: number, mid: number, accepted: boolean): void {
  const map = run.bargeState || (run.bargeState = {});
  const b = map[stepIdx];
  if (!b) return;
  if (accepted) b.hi = mid; else b.lo = mid;             // accepted here → can we go earlier? dropped → must go later
  if (b.hi - b.lo <= 3) return;                          // converged: earliest accepted second is pinned
  if (run.experiments.filter((e) => e.kind === "barge" && e.stepIdx === stepIdx).length >= 8) return; // runaway guard
  const next = Math.max(b.lo + 1, Math.round((b.lo + b.hi) / 2));
  if (next >= b.hi || next <= b.lo) return;
  const st = (run.best?.steps || [])[stepIdx];
  const label = st ? `${st.action} "${st.value}" at ${next}s (window ${b.lo}-${b.hi}s)` : `step ${stepIdx} at ${next}s`;
  run.experiments.push({ kind: "barge", stepIdx, at: next, label, status: "pending" });
}

/** Apply one experiment to the best recipe → a timed barge plan for the next call. */
function planFor(recipe: NavRecipe, ex: Experiment): Array<{ action: string; value: string; at: number; early?: boolean }> {
  return (recipe.steps || []).map((st, i) => ({
    action: st.action || "say",
    value: ex.kind === "shorten" && i === ex.stepIdx ? (ex.value || st.value || "") : (st.value || ""),
    at: ex.kind === "barge" && i === ex.stepIdx ? (ex.at ?? st.atSec ?? 0) : (st.atSec ?? 0),
    // ONE STEP FIRES ON THE CLOCK, the one this run is asking about. Everything else answers its own
    // prompt, exactly like every other check, so the only thing that changed between two checks of the
    // same store is the thing we are testing.
    early: ex.kind === "barge" && i === ex.stepIdx ? true : undefined,
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
 *  flag (#B) with the captured menu so the owner can pick the desk. Clears the flag once resolved.
 *
 *  ALSO (07-26) writes the call into the versioned map: the route we just proved, the recording each
 *  step follows, and the evidence behind it. The chain row keeps working exactly as before — the map
 *  is the history and the confidence the row could never hold. */
async function finalizeAndLock(run: MapperRun, chainId: number, recipe: NavRecipe, confidence: number | null, session?: NavSessionLike, opts?: { activate?: boolean }): Promise<void> {
  if (run.target && !recipe.target) recipe.target = run.target;
  markVariance(run, recipe);
  await recordMapVersion(run, chainId, recipe, confidence, session, opts);
  const navigated = recipe.type !== "direct" && (recipe.steps?.length ?? 0) > 0;
  const deptOnly = navigated && !menuHasCustomerService(recipe.menu);
  if (!run.target && deptOnly) {
    run.needsTarget = true;
    await setSetting(`nav_needs_target:${chainId}`, JSON.stringify({ menu: recipe.menu || [], menuPrompts: recipe.menuPrompts || [] }));
  } else {
    await setSetting(`nav_needs_target:${chainId}`, ""); // CS path found or owner target set → clear
  }
}

/** The bit of a nav session this file needs to write evidence — kept structural so mapper never has
 *  to reach further into the navigator. */
interface NavSessionLike {
  id?: string; steps?: unknown[]; humanAtSec?: number | null; status?: string;
  transferAtSec?: number | null; greeting?: string; callSid?: string;
}

/** Write this call into the versioned map. Best-effort by design: a map-store hiccup must never take
 *  down a mapping run that is holding a live phone call open. */
async function recordMapVersion(run: MapperRun, chainId: number, recipe: NavRecipe, confidence: number | null, session?: NavSessionLike, opts?: { activate?: boolean }): Promise<void> {
  let evidence: EvidenceCall | undefined;
  try {
    const steps = (session?.steps || []) as CapturedStep[];
    // Barge wins from the optimize phase = the steps we PROVED can be fired before the recording ends.
    const bargeProven = new Set(run.experiments.filter((e) => e.kind === "barge" && e.status === "win").map((e) => e.stepIdx));
    // Prefer the turn-by-turn record (it carries which recording each step followed); fall back to the
    // recipe we were handed when a call ended without a full record.
    const captured = steps.length ? recipeFromCall(steps, recipe.seconds ?? null, bargeProven) : null;
    const mapRecipe: MapRecipe = captured && captured.steps.length === (recipe.steps?.length || 0)
      ? { ...captured, target: recipe.target, menu: recipe.menu, menuPrompts: recipe.menuPrompts, ringVariable: recipe.ringVariable, seconds: recipe.seconds ?? captured.seconds }
      : {
        type: (recipe.type as MapRecipe["type"]) || "direct",
        steps: (recipe.steps || []).map((s) => ({ action: s.action === "press" ? "press" : "say", value: String(s.value || ""), atSec: Math.round(s.atSec ?? 0) })) as MapStep[],
        seconds: recipe.seconds ?? 0, target: recipe.target, menu: recipe.menu, menuPrompts: recipe.menuPrompts, ringVariable: recipe.ringVariable,
      };
    const when = await storeLocalTime(run.store?.id || 0);
    evidence = evidenceFromCall({
      navId: session?.id, storeId: run.store?.id, storeName: run.store?.name, steps,
      seconds: recipe.seconds ?? null, reachedHuman: true, path: pathSignature(mapRecipe),
      greeting: session?.greeting, transferAtSec: session?.transferAtSec ?? null,
      hourLocal: when.hour, dow: when.dow,
      stage: "prove", grade: "pass", callSid: session?.callSid,
      note: `${run.phase} attempt ${run.attempt}`,
    });
    mapRecipe.language = evidence.language;
    // THE GRAPH: every prompt this call heard becomes a node, every action an edge to where it landed.
    // The flat route above is what the runtime executes; this is the knowledge underneath it, and it
    // is the only thing that can answer "we have never heard this prompt before".
    await recordCallPath({
      chainId, storeId: run.store?.id,
      prompts: steps.filter((st) => st.who === "ivr" && st.text).map((st) => ({ text: String(st.text), atSec: Math.round(st.atSec ?? 0) })),
      actions: mapRecipe.steps.map((st) => ({ action: st.action, value: st.value, atSec: st.atSec, afterPrompt: st.afterPrompt })),
      reachedHuman: true, seconds: recipe.seconds ?? null, outcome: "person",
    });
    // The captured route is richer than the one the run carries: it knows WHICH recording each step
    // follows. But the run may hold a fact the fresh capture cannot see — a step proved unbargeable by
    // a call that looped — so carry those forward rather than letting a later call forget them.
    mapRecipe.steps = mapRecipe.steps.map((st, i) => {
      const known = (recipe.steps?.[i] as { bargeSafe?: boolean } | undefined)?.bargeSafe;
      return known === false ? { ...st, bargeSafe: false } : st;
    });
    recipe = { ...recipe, steps: mapRecipe.steps as unknown as NavRecipe["steps"] };
    // THE WAIT AFTER THE TRANSFER, measured. The store announces the hand-off and the person speaks
    // some seconds later; the paid agent currently opens on the announcement, so this gap is money
    // burned on every check of this chain. Recorded per call so the dashboard can show it and Echo can
    // aim at it — Mapper measures, the runtime decides what to do about it.
    if (typeof session?.transferAtSec === "number" && typeof recipe.seconds === "number" && recipe.seconds > session.transferAtSec) {
      await recordObservation({
        chainId, storeId: run.store?.id, navId: session?.id, kind: "transfer-gap",
        expected: `transfer at ${session.transferAtSec}s`, observed: `person at ${recipe.seconds}s`,
        detail: { gapSeconds: recipe.seconds - session.transferAtSec, greeting: session?.greeting ?? null },
      });
    }
  } catch { /* evidence is best-effort — a bad session must not stop the route being locked */ }
  // ONE writer: the chain row the runtime reads and the map version land together (trainer-batch.ts).
  await lockRecipeToChain(chainId, recipe, confidence, evidence, opts);
}

async function bumpDaily(chainId: number): Promise<number> {
  const key = `mapper_calls:${chainId}:${today()}`;
  const n = Number((await getSetting(key)) || 0) + 1;
  await setSetting(key, String(n));
  return n;
}

/** Start (or resume) mapping a chain until locked. Fire-and-forget; poll mapperState(). */
export async function startMapper(chainId: number, opts: { storeId?: number } = {}): Promise<{ started?: boolean; error?: string; benchmark?: number | null }> {
  if (!chainId) return { error: "chainId required" };
  const existing = runs.get(chainId);
  if (existing?.running) return { error: "already mapping this chain" };
  const ch = (await db.select().from(chains).where(eq(chains.id, chainId)))[0];
  if (!ch) return { error: "chain not found" };
  // #4: never map a chain we don't call. chainDialable() is the ONE shared rule (recipe.ts) used by the
  // board, the overnight batch, and here — muted (owner-hidden), callTarget off (national call-center /
  // online-only like Micro Center, Best Buy), or site-check (its accurate website is the answer). These
  // answer a call center or need no call at all, so a "recipe" is meaningless and it wastes a real call.
  if (!chainDialable(ch)) return { error: `${ch.name} isn't a call target (muted / call-center / check-online) — skipped` };
  // Rings-direct chains have NO phone tree — a person answers straight through. Independents + co-ops
  // (thrift banners, local card shops, Ace) are defaulted to direct in code (curated list + boot pass),
  // so there is nothing to map. Mapping them wastes calls AND a stray chain-level recipe (e.g. Ace's old
  // "press 4") mutes the live agent on every store that actually rings direct. Co-ops with no uniform
  // tree get per-store nav learned from real calls, not one chain recipe — never map them as one tree.
  if (ch.ringsDirect === true || ch.answerPath === "direct_human") return { error: `${ch.name} rings direct (no phone tree) — skipped, nothing to map` };
  const usedToday = Number((await getSetting(`mapper_calls:${chainId}:${today()}`)) || 0);
  const cap = Number((await getSetting("mapper_daily_cap")) || 0) || DAILY_CAP;
  if (usedToday >= cap) return { error: `daily cap reached (${cap}) — raise the "mapper_daily_cap" setting if this is a real sweep` };
  // #1: the owner-set desk to aim for (customer service by default; a chosen department for dept-only chains).
  const target = ((await getSetting(`nav_target:${chainId}`)) || "").trim() || undefined;

  // THE RUN STARTS FROM THE ROUTE THE MAP HOLDS (owner, 07-31). It used to read the chain row's older
  // summary, find nothing usable, and re-learn a chain we had already proven — the 07-31 run walked
  // CVS from scratch and produced a slower route than the one sitting in the map. The map's live
  // version is the single truth; the chain row is only a stamped copy for live checks.
  let lockedRecipe: NavRecipe | null = null;
  try {
    const live = await activeMap(chainId);
    if (live?.recipe && Array.isArray(live.recipe.steps) && live.recipe.steps.length) {
      lockedRecipe = {
        type: live.recipe.type, seconds: live.recipe.seconds ?? null,
        steps: live.recipe.steps.map((st) => ({ ...st })),
        menu: live.recipe.menu, menuPrompts: live.recipe.menuPrompts, target: live.recipe.target,
      } as NavRecipe;
    }
  } catch { /* fresh discovery */ }
  const hasPromptPlan = (lockedRecipe?.steps || []).some((st) => typeof (st as { afterPrompt?: number }).afterPrompt === "number");

  // THE OWNER'S THREE STAGES (07-30, build-contract.md). A chain we have never walked starts at
  // mapping menu; a chain whose route we already hold and trust starts at optimizing speed. Proving
  // department always runs before a lock, whatever the entry.
  const run: MapperRun = {
    chainId, chainName: ch.name,
    phase: lockedRecipe && hasPromptPlan ? "speed" : "map", running: true,
    attempt: 0, callsToday: usedToday,
    usedStores: [], store: null, rotate: false, target, needsTarget: false, reachedSecs: [],
    benchmark: ch.navSeconds ?? null,   // what we're trying to beat (the CVS benchmark readout)
    provedStores: [], doorsDead: [], proveMisses: 0,
    baseline: lockedRecipe && hasPromptPlan ? lockedRecipe : null,
    best: lockedRecipe && hasPromptPlan ? lockedRecipe : null,
    experiments: [], log: [],
    startedAt: Date.now(), updatedAt: Date.now(),
    lockedRecipe, pinnedStoreId: opts.storeId, mapMisses: 0,
  };
  if (run.phase === "speed" && run.best) run.experiments = buildExperiments(run, run.best);
  runs.set(chainId, run);
  await saveRun(run);
  driveMapper(run);

  return { started: true, benchmark: run.benchmark };
}

/** The run loop, callable for a fresh start AND a boot-time resume. Everything it needs lives ON the
 *  run object so the saved copy is the whole memory. */
function driveMapper(run: MapperRun): void {
  const chainId = run.chainId;
  (async () => {
    const ask = await defaultWorkflowAsk(); // Branson global's opener + voice, fetched once
    const product = "Pok\u00e9mon cards";
    const cap = Number((await getSetting("mapper_daily_cap")) || 0) || DAILY_CAP;
    while (run.running && !run.stop) {
      if (draining) { await saveRun(run); return; } // a redeploy is taking over — the next process resumes
      run.updatedAt = Date.now();
      await saveRun(run); // the whole memory, after every attempt — this line is what survives a restart
      // ---- guards ----
      if (await isCallingPaused()) { run.stopReason = "global kill-switch"; break; }
      if (run.callsToday >= cap) { run.stopReason = `daily cap (${cap} calls)`; run.phase = run.baseline ? run.phase : "needs-review"; break; }
      const ex = run.phase === "speed" ? run.experiments.find((e) => e.status === "pending") : undefined;
      // NOTHING LEFT TO TEST is not the end — the floor still has to be PROVED at other stores before
      // anything locks. Speed drains into prove, and only prove can lock.
      if (run.phase === "speed" && !ex) run.phase = "prove";

      // ---- the store ----
      // Mapping menu and optimizing speed hold ONE store, so the menu cannot change under us and the
      // comparison is honest. Proving department takes a FRESH store every check and never the same
      // store twice, so no desk is ever asked more than once.
      if (run.phase === "prove") run.rotate = true;
      if (!run.store || run.rotate) {
        // An owner-named store overrides the picker for the whole run — for a store we KNOW is open
        // right now (a late-evening CVS the 9am–8pm gate would refuse), or to re-map one specific
        // store whose menu differs from its chain. Rotation is off: this is the store, or nothing.
        const picked = run.pinnedStoreId && !run.rotate
          ? (await db.select().from(retailers).where(eq(retailers.id, run.pinnedStoreId)))[0]
          : await storeForChain(chainId, run.usedStores, true);
        if (!picked) { run.stopReason = "no store in local daytime hours right now. Re-run when stores are open; mornings hit the east coast first."; run.phase = run.baseline ? run.phase : "needs-review"; break; }
        run.store = { id: picked.id, name: picked.name, phone: picked.phone };
        run.usedStores.push(picked.id); run.rotate = false;
      }
      const store = run.store;

      // ---- place this stage's check ----
      run.attempt++; run.callsToday = await bumpDaily(chainId);
      const stageWord = run.phase === "map" ? "mapping menu" : run.phase === "speed" ? "optimizing speed" : "proving department";
      // Speed walks the route we hold with ONE step under test; prove walks it exactly as locked.
      const barge = run.phase === "speed" && ex && run.best ? { plan: planFor(run.best, ex) }
        : run.phase === "prove" && run.best ? { plan: (run.best.steps || []).map((st) => ({ action: st.action || "say", value: st.value || "", at: st.atSec ?? 0 })) }
        : undefined;
      // Mapping menu: the model walks the tree answering each question with the FULL phrase, steered
      // away from every door already proven wrong, and asks at the person — the answer IS the proof.
      const dead = run.doorsDead.length ? ` NEVER choose ${run.doorsDead.join(" or ")} — those reach the wrong desk.` : "";
      const hint = run.phase === "map"
        ? ((run.best?.steps || []).length
            ? (run.best!.steps || []).map((st) => (st.action === "press" ? `press ${st.value}` : `say "${st.value}"`)).join(", then ") + "." + dead
            : (dead || undefined))
        : undefined;
      const placed = await placeNavCall(
        chainId, store.id, store.name, store.phone,
        undefined, hint, barge, undefined,
        run.phase === "map" || run.phase === "prove" ? { product } : undefined,
        { askVoiceId: ask.voiceId, askText: ask.text, target: run.target,
          maxSec: CALL_MAX_SEC, transferWaitSec: TRANSFER_WAIT_SEC,
          // Optimizing speed never troubles Staff: it hangs up on the second ring, every check.
          relisten: run.phase === "speed",
          stage: run.phase === "map" ? "map" : run.phase === "speed" ? "speed" : "prove",
          expectedGreeting: run.expectedGreeting, recipeSeconds: run.bestMenuSecs,
          // This loop folds its own calls into the map below. `finish` must not fold them again.
          callerRecords: true,
          why: `Mapping ${run.chainName} (${stageWord}, check ${run.attempt})` },
      );
      if (placed.error || !placed.id) {
        run.log.push({ n: run.attempt, phase: run.phase, store: store.name, experiment: ex?.label, outcome: "dial failed: " + (placed.error || "?") });
        await sleep(GAP_SEC * 1000); continue;
      }
      run.navId = placed.id;

      // ---- follow the check to its end ----
      const deadline = Date.now() + CALL_MAX_SEC * 1000;
      let s = getNavSession(placed.id);
      while (Date.now() < deadline) {
        s = getNavSession(placed.id);
        if (!s || s.status === "human" || s.status === "done" || s.status === "failed") break;
        await sleep(3000);
      }
      run.navId = undefined;
      // THE GRADE IS THE VERDICT — the same machine decision the run log and the map fold carry, so
      // this loop can never disagree with the screens about one check.
      const graded = s?.grade === "pass";
      const reason = s?.failReason;
      const answered = s?.confirmResult === "answered";
      const redirected = s?.confirmResult === "redirect";
      const recipe = s ? (s.recipe ?? recipeFromSteps(s.steps as NavStep[], s.humanAtSec)) : null;
      const secs = recipe?.seconds ?? null;
      const menuSecs = s?.transferAtSec ?? [...((s?.steps || []) as NavStep[])].reverse().find((st) => st.who === "us")?.atSec ?? null;
      if (!graded && s?.deadLine) run.rotate = true;
      if (graded && typeof secs === "number") run.reachedSecs.push(secs);

      // ---- learn from the outcome ----
      if (run.phase === "map") {
        if (graded && answered && recipe) {
          // The door is PROVEN — a person at its end gave a real answer about the product. This
          // becomes the route to beat. NOTHING IS WRITTEN YET (owner, 07-31): the run's working state
          // is its own until three stores agree, so the map, the chain row and the owner's screens
          // never see half-finished work as if it were a decision or a winner.
          run.baseline = recipe as NavRecipe; run.best = recipe as NavRecipe;
          if (typeof menuSecs === "number") run.bestMenuSecs = menuSecs;
          run.expectedGreeting = ((s?.steps || []) as NavStep[]).find((st) => st.who === "ivr" && st.text)?.text;
          run.provedStores = [store.id];
          run.winnerSession = { id: s?.id, steps: s?.steps as unknown[], humanAtSec: s?.humanAtSec, status: s?.status, transferAtSec: s?.transferAtSec, greeting: s?.greeting, callSid: s?.callSid };
          run.experiments = buildExperiments(run, recipe as NavRecipe);
          run.phase = "speed";
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `right department — Staff answered about ${product} (${classifyMode((s?.steps || []) as NavStep[]).label})`, seconds: secs });
        } else if (redirected) {
          // The wrong desk answered. That door is dead for good; the next check takes the next one.
          const door = (s?.redirectTo || "").slice(0, 40) || ((s?.steps || []) as NavStep[]).filter((st) => st.who === "us").slice(-1)[0]?.value || "that door";
          if (!run.doorsDead.includes(door)) run.doorsDead.push(door);
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `wrong department — ${door} is dead, trying the next door`, seconds: secs });
        } else {
          run.mapMisses = (run.mapMisses ?? 0) + 1;
          await recordFailedAttempt({
            chainId, storeId: store.id, navId: s?.id,
            reason: reason || (s as { stopReason?: string } | null)?.stopReason || `no answer (${s?.status || "timeout"})`,
            seconds: secs, promptCount: (s?.steps as NavStep[] | undefined)?.filter((st) => st.who === "ivr").length,
          }).catch(() => { /* evidence is best-effort */ });
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: reason || `no answer (${s?.status || "timeout"})`, seconds: secs });
          if ((run.mapMisses ?? 0) >= BASELINE_TRIES) { run.phase = "needs-review"; run.stopReason = `no proven door in ${BASELINE_TRIES} checks`; break; }
        }
      } else if (run.phase === "speed" && ex) {
        // ONE change per check, graded by machine. A win becomes the recipe; a loss is thrown away
        // and, for a step that broke the walk, that exact move is remembered as never-again.
        if (graded && recipe && typeof menuSecs === "number") {
          ex.status = "win"; run.best = recipe as NavRecipe; run.bestMenuSecs = menuSecs;
          run.winnerSession = { id: s?.id, steps: s?.steps as unknown[], humanAtSec: s?.humanAtSec, status: s?.status, transferAtSec: s?.transferAtSec, greeting: s?.greeting, callSid: s?.callSid };
          run.log.push({ n: run.attempt, phase: "speed", store: store.name, experiment: ex.label, outcome: `recipe winner — menu ${menuSecs}s`, seconds: menuSecs });
          if (ex.kind === "barge") enqueueBinaryBarge(run, ex.stepIdx, ex.at ?? 0, true);
        } else {
          ex.status = "fail";
          if (reason === "barge didn't work" && run.best?.steps?.[ex.stepIdx]) {
            // Remembered on the run's own copy of the route; it is written into the map at the lock.
            (run.best.steps[ex.stepIdx] as { bargeSafe?: boolean }).bargeSafe = false;
            run.experiments = run.experiments.filter((e) => !(e.kind === "barge" && e.stepIdx === ex.stepIdx && e.status === "pending"));
          }
          if (ex.kind === "barge") enqueueBinaryBarge(run, ex.stepIdx, ex.at ?? 0, false);
          run.log.push({ n: run.attempt, phase: "speed", store: store.name, experiment: ex.label, outcome: reason || "not faster", seconds: menuSecs });
        }
      } else if (run.phase === "prove") {
        if (graded && answered) {
          run.provedStores.push(store.id);
          run.winnerSession = { id: s?.id, steps: s?.steps as unknown[], humanAtSec: s?.humanAtSec, status: s?.status, transferAtSec: s?.transferAtSec, greeting: s?.greeting, callSid: s?.callSid };
          run.log.push({ n: run.attempt, phase: "prove", store: store.name, outcome: `right department — Staff answered about ${product} (${run.provedStores.length} of 3 stores agree)`, seconds: secs });
          if (run.provedStores.length >= 3) { run.phase = "locked"; break; }
        } else if (redirected || reason === "wrong department") {
          // The recipe keeps its speed, but the door was wrong at THIS store — back to mapping to
          // find the right one, with everything learned still in hand.
          const door = (s?.redirectTo || "").slice(0, 40) || "that door";
          if (!run.doorsDead.includes(door)) run.doorsDead.push(door);
          run.phase = "map"; run.mapMisses = 0;
          run.log.push({ n: run.attempt, phase: "prove", store: store.name, outcome: `wrong department at this store — ${door} marked dead, mapping again`, seconds: secs });
        } else {
          run.proveMisses++;
          run.log.push({ n: run.attempt, phase: "prove", store: store.name, outcome: reason || `nobody answered — next store`, seconds: secs });
          if (run.proveMisses >= 4) { run.phase = "needs-review"; run.stopReason = "nobody picked up at 4 stores"; break; }
        }
      }
      await sleep(GAP_SEC * 1000);
    }

    // ---- wrap up ----
    if (run.stop && !run.stopReason) run.stopReason = "stopped by admin";
    if (run.phase === "locked" && run.best) {
      // THE ONE WRITE (owner, 07-31). Three stores agreed, so the run's route becomes the map's live
      // recipe in a single stroke: version activated, chain row stamped, the winning check's evidence
      // — words, recording, the lot — folded in so the Menu shows the run that won.
      await finalizeAndLock(run, chainId, run.best, null, run.winnerSession, { activate: true });
      run.stopReason = run.stopReason || (run.needsTarget
        ? "Locked, but the menu has no customer-service option. Pick a target desk and re-map."
        : "map recipe locked — three stores agree");
    } else if (run.stop) run.phase = "stopped";
    run.running = false; run.updatedAt = Date.now();
    await clearRun(chainId); // finished for real — a restart must not resurrect it
  })().catch((e) => {
    run.running = false; run.phase = run.baseline ? run.phase : "needs-review";
    run.stopReason = "engine error: " + String(e).slice(0, 120);
    void clearRun(chainId); // a crashing run must not resume into the same crash forever
  });
}

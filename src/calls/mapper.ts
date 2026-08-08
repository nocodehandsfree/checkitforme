// Mapper — the owner's stages, TWO-LEVEL LOCK (07-31 rounds, docs/specs/mapping-admin/build-contract.md).
// The goal is never a department name: it is an ANSWER about the product, because a real yes or no
// from Staff is the only proof of the right door, and that is what lets this scale with no human help.
//
//   MAPPING MENU     one store, ALWAYS FIRST, never skipped even when a recipe is already held
//                    (owner Update 1). One full check: listen to the whole menu, answer each question
//                    with the FULL phrase, reach a person, ask about the product. The answer proves
//                    the door; a wrong desk kills that door for good and the next check takes the
//                    next one. Staff are asked once, never more. Then the run KEEPS LISTENING until
//                    the wording settles: ring-hang-up listens until the same lines are heard twice
//                    in a row. Settled + proven = THE STORE IS LOCKED and the CHAIN GOES LIVE for
//                    customers on the spot (owner Update 2 — one successful map locks it).
//   OPTIMIZING SPEED the SAME store, inside its open hours, hang up on the second ring — no Staff,
//                    ever. ONE change per check: the short word, or cutting in on the menu's OWN
//                    WORDS. NO answer ever fires on a timer — the clock is dead everywhere (owner
//                    Update 4). A win updates the recipe and the Menu immediately (Update 5); a loss
//                    changes nothing and that exact move is remembered as never-again, durably.
//
// PROVING is no longer a dialing stage (owner Updates 2-3): the chain is live at one proven store,
// and agreement arrives FREE from real customer checks that land at new stores — three agreeing
// stores = fully proven (R1). The only reason this run ever tries a new store is that the current
// store never got us to a person.
//
// Every check is GRADED by machine in finish (navigator) — this loop reads the same verdict the run
// log and the map fold carry, so it can never disagree with the screens. A FAILED CHECK CHANGES
// NOTHING: it lives in the run log, collapsed, and is never folded into evidence or confidence.
// Safety: hard cap of calls/chain/day, spacing between calls, global kill-switch, per-chain stop.
import { eq } from "drizzle-orm";
import { db } from "./../db/client";
import { chains, retailers } from "../db/schema";
import { getSetting, setSetting, allSettings } from "../db/settings";
import { isCallingPaused } from "../redis";
import { placeNavCall, getNavSession, defaultWorkflowAsk, classifyMode, menuHasCustomerService, pickedDoorFrom, questionBeforePick, doorsAskedAt, NavRecipe, NavStep } from "./navigator";
import { storeForChain, lockRecipeToChain, recipeFromSteps } from "./trainer-batch";
import { chainDialable } from "./recipe";
import { openState } from "../store-hours";
import { judgeVoice } from "./listen-nav";
import { pathSignature, recordObservation, recordCallPath, storeLocalTime, activeMap, sameMenu, addProvenStore, rememberedMenuLines, MapRecipe, MapStep, type EvidenceCall, type CheckStage } from "./mapgraph";
import { recipeFromCall, evidenceFromCall, CapturedStep } from "./map-capture";

const DAILY_CAP = 60;        // runaway guard only — owner 2026-07-10: the old 12/day cap is gone, a
                             // sweep converges every mapped chain in one day. Tune without a deploy
                             // via the "mapper_daily_cap" setting (0/unset = this default).
const GAP_SEC = 75;          // spacing between calls to the same chain (politeness + IVR cool-down)
const CALL_MAX_SEC = 150;    // per-call watch window (slow IVRs take ~95s to a human)
const TRANSFER_WAIT_SEC = 40; // after "transferring you now", how long we allow for a real voice before
                              // hanging up. The transfer is NOT the person (the 07-26 CVS finding).
const MISSES_PER_STORE = 5;  // no person in this many checks → this store never got us to one, so the
                             // run takes a fresh store (owner Update 3 — the ONLY reason to move).
const SETTLE_TRIES = 6;      // listens without the wording ever reading the same twice → stop, say so

export interface Experiment {
  kind: "shorten" | "cutin";
  stepIdx: number;
  value?: string;            // shorten: the shorter word to try
  label: string;
  status: "pending" | "win" | "fail";
}
interface Attempt { n: number; phase: string; store: string; experiment?: string; outcome: string; seconds?: number | null }
export interface MapperRun {
  chainId: number; chainName: string;
  phase: "map" | "speed" | "locked" | "stopped";
  running: boolean; stop?: boolean; stopReason?: string;
  attempt: number; callsToday: number;
  usedStores: number[];
  store?: { id: number; name: string; phone: string } | null; // the ONE store held across attempts
  rotate?: boolean;              // set when the held store proved a dead line → pick a fresh one
  target?: string;               // owner-set desk to reach ("customer service" default)
  needsTarget?: boolean;         // department-only tree, no CS option — owner should pick a target
  reachedSecs: number[];         // every human-reached time this run, to measure ring variance
  bestMenuSecs?: number;         // the fastest MENU walk proved so far — what experiments are judged on
  benchmark: number | null;      // the chain's navSeconds BEFORE this run (the comparison readout)
  doorsDead: string[];           // menu doors proven to reach the wrong desk — never chosen again
  doorsDeadQ?: Record<string, string>; // the question each dead door answered (a door = question + option)
  expectedGreeting?: string;     // the menu's opening line as heard on the proving check
  // ---- the two-level lock's store half ----
  doorProven?: boolean;          // Staff gave a real answer about the product at this store
  storeLocked?: boolean;         // proven AND the wording settled — the chain went live here
  lastLines?: string[];          // the menu lines the previous check heard (wording-settle comparison)
  settleTries?: number;          // listens spent waiting for the wording to read the same twice
  neverAgain?: string[];         // durable never-again moves, mirrored to the map_never setting
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
  menuNumber?: number;              // which menu this run is learning — marks expire with it
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
    if (!saved.running || saved.stop) {
      // A run that CRASHED keeps its trace for one boot: it loads into the page state so the live
      // card can say what happened, while its saved slot clears so it never resumes into the crash.
      if (String(saved.stopReason || "").startsWith("engine error") && !runs.has(saved.chainId)) runs.set(saved.chainId, saved);
      await clearRun(saved.chainId); continue; // finished or stopped stays that way
    }
    if (runs.get(saved.chainId)?.running) continue;
    // A run saved by the retired shape resumes under the law that replaced it: proving is not a
    // dialing stage any more, learn-menu-first means "map" is always the safe re-entry, and a timed
    // barge experiment becomes a cut-in on the menu's own words — the clock is dead everywhere.
    if ((saved.phase as string) === "prove" || (saved.phase as string) === "needs-review") saved.phase = "map";
    saved.experiments = (saved.experiments || []).map((e) => (e.kind as string) === "barge" ? { ...e, kind: "cutin" as const } : e);
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

// ---- The never-again memory (owner: "that exact move is blacklisted") -------------------------
// A losing move is remembered DURABLY, keyed by the step's own word so it survives the run and a
// re-map alike: a cut-in that broke the walk ("cutin:front"), a short word that was not faster
// ("shorten:front store services->front"). bargeSafe:false rides the recipe steps at the next lock
// as before; this list is what stops a future run from spending a real call re-proving a loss.
const neverKey = (chainId: number) => `map_never:${chainId}`;
async function loadNeverAgain(chainId: number): Promise<string[]> {
  try { return JSON.parse((await getSetting(neverKey(chainId))) || "[]") as string[]; } catch { return []; }
}
async function rememberNever(run: MapperRun, move: string): Promise<void> {
  run.neverAgain = run.neverAgain || [];
  if (run.neverAgain.includes(move)) return;
  run.neverAgain.push(move);
  try { await setSetting(neverKey(run.chainId), JSON.stringify(run.neverAgain.slice(-60))); } catch { /* best effort */ }
}

// A DEAD DOOR IS KNOWLEDGE, NOT A RUN'S SCRATCH NOTE. It cost a real call and a real Staff hello to
// learn that a door reaches the wrong desk; wiping it at run end (as the first build did) meant the
// next run could spend both again. Keyed by the option WE picked PLUS the question it answered —
// a door is question + option, so "1" dead at one question never blocks "1" at another (round-3
// item 4). Chain-wide, durable; old entries saved as bare strings still load (no question = block
// by value, the old behaviour).
const deadDoorsKey = (chainId: number) => `map_doors_dead:${chainId}`;
// A MARK EXPIRES WITH THE MENU IT WAS LEARNED ON (owner, 08-04). A choice proven wrong cost a real
// call and a real Staff hello, so it is enforced for as long as that menu is the menu — but the
// moment we re-map the store, we are learning the menu FRESH, and a rule learned on the menu it
// replaced would stop the new map from ever trying that choice properly. NOTHING IS DELETED: every
// mark stays on file against the map it was learned on, visible on the screen, and simply stops
// being enforced. This counter is what "the menu it was learned on" means: it goes up once per
// re-map, whether the healing loop started it or the owner pressed Map.
const remapCountKey = (chainId: number) => `map_remaps:${chainId}`;
async function currentMenuNumber(chainId: number): Promise<number> {
  return Number((await getSetting(remapCountKey(chainId))) || 0);
}
async function newMenuNumber(chainId: number): Promise<number> {
  const n = (await currentMenuNumber(chainId)) + 1;
  try { await setSetting(remapCountKey(chainId), String(n)); } catch { /* best effort */ }
  return n;
}
interface DeadDoor { door: string; q?: string; menu?: number }
/** Every mark ever learned, in order. Nothing is ever dropped from this. */
async function allDeadDoors(chainId: number): Promise<DeadDoor[]> {
  try {
    const raw = JSON.parse((await getSetting(deadDoorsKey(chainId))) || "[]") as Array<string | DeadDoor>;
    return raw.map((e) => typeof e === "string" ? { door: e } : e).filter((e) => e && e.door);
  } catch { return []; }
}
/** The marks this run must OBEY: the ones learned on the menu we are working on now. Older marks
 *  stay on file and on the screen; they simply no longer block a fresh map. */
async function loadDeadDoors(chainId: number, menu: number): Promise<DeadDoor[]> {
  return (await allDeadDoors(chainId)).filter((e) => Number(e.menu || 0) === menu);
}

async function rememberDeadDoor(run: MapperRun, door: string, q?: string): Promise<void> {
  if (!run.doorsDead.includes(door)) run.doorsDead.push(door);
  if (q) (run.doorsDeadQ = run.doorsDeadQ || {})[door] = q;
  try {
    // APPEND, NEVER REWRITE. Older marks — the ones learned on a menu we have since re-mapped — stay
    // exactly where they are; this run's marks are stamped with the menu this run is learning.
    const older = (await allDeadDoors(run.chainId)).filter((e) => Number(e.menu || 0) !== (run.menuNumber ?? 0));
    const mine = run.doorsDead.map((d) => ({ door: d, q: run.doorsDeadQ?.[d], menu: run.menuNumber ?? 0 }));
    await setSetting(deadDoorsKey(run.chainId), JSON.stringify([...older, ...mine].slice(-80)));
  } catch { /* best effort */ }
}

/** Build the experiment list from the locked route. Two levers, NO CLOCK ANYWHERE (owner Update 4):
 *   - shorten: for every spoken step, try the first word alone ("front" not "front store services").
 *   - cutin:   answer the moment the menu's OWN WORDS start asking this step's question, instead of
 *              waiting for the question to finish. A menu that will not be cut off is remembered
 *              (bargeSafe:false + never-again) and that question is always allowed to finish. */
function buildExperiments(run: MapperRun, recipe: NavRecipe): Experiment[] {
  const out: Experiment[] = [];
  const steps = recipe.steps || [];
  const never = run.neverAgain || [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.action === "say") {
      const words = String(st.value || "").trim().split(/\s+/);
      if (words.length > 1 && words[0].length > 2 && !/^(yes|no)$/i.test(words[0])
        && !never.includes(`shorten:${st.value}->${words[0].toLowerCase()}`)) {
        out.push({ kind: "shorten", stepIdx: i, value: words[0].toLowerCase(), label: `say "${words[0].toLowerCase()}" instead of "${st.value}"`, status: "pending" });
      }
    }
    // A step we have ALREADY PROVED cannot be cut in on is never tested again (owner 07-27: at CVS
    // you can cut in with "general" but not with "front"). That fact was learned by a real call that
    // looped the menu; re-proving it costs another call and another loop every single run.
    if ((st as { bargeSafe?: boolean }).bargeSafe === false) continue;
    if (never.includes(`cutin:${String(st.value || "").toLowerCase()}`)) continue;
    out.push({ kind: "cutin", stepIdx: i, label: `${st.action} "${st.value}" the moment the menu starts asking`, status: "pending" });
  }
  return out.slice(0, 10);
}

/** Apply one experiment to the best recipe → the plan for the next check. Every step answers the
 *  prompt that asks it; the ONE step under test carries `early`, which the navigator reads as "answer
 *  on the first words of this step's own recording" — the menu's words, never a clock. */
function planFor(recipe: NavRecipe, ex: Experiment): Array<{ action: string; value: string; at: number; early?: boolean }> {
  return (recipe.steps || []).map((st, i) => ({
    action: st.action || "say",
    value: ex.kind === "shorten" && i === ex.stepIdx ? (ex.value || st.value || "") : (st.value || ""),
    at: st.atSec ?? 0, // the record of when this step landed before — never a trigger
    early: ex.kind === "cutin" && i === ex.stepIdx ? true : undefined,
  }));
}

/** The plain walk of the route we hold — the wording-settle listens and any check that is not testing
 *  a change. Nothing early, nothing timed: every answer waits for its own question. */
function planPlain(recipe: NavRecipe): Array<{ action: string; value: string; at: number }> {
  return (recipe.steps || []).map((st) => ({ action: st.action || "say", value: st.value || "", at: st.atSec ?? 0 }));
}

/** The MENU lines a check heard — the STORE'S RECORDINGS ONLY, never a person. The handoff line
 *  belongs to the menu, so a known handoff cuts inclusively there; with no handoff, everything from
 *  the person's own moment on is the PERSON (their hello lands AT humanAtSec, so the cut is strict).
 *  Counting a hello as a menu line is what made a store with no menu look like it had one: the
 *  on-the-spot lock could never fire, and the settle listens it should have prevented dialed real
 *  people and hung up on them (round-3 item 1). */
export function menuLinesOf(
  steps: NavStep[], transferAtSec: number | null | undefined, humanAtSec?: number | null,
  knownMenuLines?: string[],
): string[] {
  // TWO GATES, AND A LINE MUST PASS BOTH. The moments come first: nothing at or after the person can
  // ever be a menu line (strict), and the handoff line itself belongs to the menu. Then every
  // surviving line goes to THE ONE JUDGE — because a person can start talking before we recognise
  // them, and the moment alone cannot catch that. Two agreements, or the line is not the menu.
  const person = typeof humanAtSec === "number" ? humanAtSec : Infinity;
  const handoff = typeof transferAtSec === "number" ? transferAtSec : Infinity;
  return (steps || [])
    .filter((st) => {
      if (st.who !== "ivr" || !String(st.text || "").trim()) return false;
      const at = st.atSec ?? 0;
      if (at >= person) return false;                        // strict: the person's own words, never the menu
      if (handoff !== Infinity && at > handoff) return false; // past the handoff, the menu is done with us
      // Reading back what a finished check heard: there is no line to stay silent on any more, so the
      // pause simply never happened. Feeding it a made-up "it kept talking" was a side door through
      // which UNSURE became "machine" (fix pass 6, item 2) — unsure stays unsure, and a line the
      // earpiece cannot call a recording is not one.
      return judgeVoice({
        text: String(st.text), atSec: at, knownMenuLines,
        // Inside the moments above we are, by definition, before the person and inside the menu.
        mappedRoute: true, routeHandoffSeen: false, ringsHeard: 0,
      }).who === "recording";
    })
    .map((st) => String(st.text));
}

/** Same lines heard twice in a row = the wording is settled (contract stage 1). Line for line, with
 *  the same transcription tolerance the fingerprint uses — never a stricter bar than the menu itself. */
export function sameWording(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((line, i) => sameMenu(line, b[i]));
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

/** Persist the proven recipe as the chain's live route — stamping the owner target + the ring-variance
 *  flag (#A), and, for a department-only tree with NO customer-service option, raising a needs-target
 *  flag (#B) with the captured menu so the owner can pick the desk. Clears the flag once resolved.
 *
 *  Fired at the STORE LOCK (one proven store puts the chain live — owner Update 2) and again on every
 *  speed WIN (the faster way updates the recipe box and the Menu — owner Update 5). Never from a
 *  failed check: a failed check changes nothing. */
async function finalizeAndLock(run: MapperRun, chainId: number, recipe: NavRecipe, confidence: number | null, session?: NavSessionLike, opts?: { activate?: boolean; stage?: CheckStage }): Promise<void> {
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

/** THE STORE LOCK, one stroke, one place: the chain goes live, the store opens the proof ledger, and
 *  the run moves to optimizing speed. Every path that locks a store goes through here — the settled
 *  wording, the no-menu store, and the belt for a resumed run already past its listening. */
async function lockStore(run: MapperRun, chainId: number, storeId: number): Promise<void> {
  run.storeLocked = true;
  await finalizeAndLock(run, chainId, run.best!, null, run.winnerSession, { activate: true, stage: "map" });
  await seedProvenStores(chainId, storeId);
  // A STORE THAT TOOK ITSELF OFF THE WEBSITE PUTS ITSELF BACK, right here — the lock IS the re-map
  // succeeding, so there is no separate "did the healing work" question to get wrong. It leaves the
  // list and one line of history lands on the chain page. A store that was never muted is untouched.
  try {
    const { storeIsMuted, remapSucceeded } = await import("./healing");
    if (await storeIsMuted(storeId)) {
      await remapSucceeded(chainId, storeId);
      run.log.push({ n: run.attempt, phase: run.phase, store: run.store?.name || "", outcome: "menu changed, re-mapped successfully, unmuted and back online" });
    }
  } catch (e) { console.error("[mapper] healing unmute", e); }
  run.experiments = buildExperiments(run, run.best!);
  run.phase = "speed";
}

/** The bit of a nav session this file needs to write evidence — kept structural so mapper never has
 *  to reach further into the navigator. */
interface NavSessionLike {
  id?: string; steps?: unknown[]; humanAtSec?: number | null; status?: string;
  transferAtSec?: number | null; greeting?: string; callSid?: string; endedOnRing?: boolean;
}
const sessionLike = (s: ReturnType<typeof getNavSession>): NavSessionLike | undefined => s ? ({
  id: s.id, steps: s.steps as unknown[], humanAtSec: s.humanAtSec, status: s.status,
  transferAtSec: s.transferAtSec, greeting: s.greeting, callSid: s.callSid, endedOnRing: s.endedOnRing,
}) : undefined;

/** Write this call into the versioned map. Best-effort by design: a map-store hiccup must never take
 *  down a mapping run that is holding a live phone call open. */
async function recordMapVersion(run: MapperRun, chainId: number, recipe: NavRecipe, confidence: number | null, session?: NavSessionLike, opts?: { activate?: boolean; stage?: CheckStage }): Promise<void> {
  let evidence: EvidenceCall | undefined;
  try {
    const steps = (session?.steps || []) as CapturedStep[];
    // Cut-in wins from the speed stage = the steps we PROVED can be fired before the recording ends.
    const bargeProven = new Set(run.experiments.filter((e) => e.kind === "cutin" && e.status === "win").map((e) => e.stepIdx));
    // Prefer the turn-by-turn record (it carries which recording each step followed); fall back to the
    // recipe we were handed when a call ended without a full record.
    const captured = steps.length ? recipeFromCall(steps, recipe.seconds ?? null, bargeProven) : null;
    const mapRecipe: MapRecipe = captured && captured.steps.length === (recipe.steps?.length || 0)
      ? { ...captured, target: recipe.target, menu: recipe.menu, menuPrompts: recipe.menuPrompts, ringVariable: recipe.ringVariable, seconds: recipe.seconds ?? captured.seconds }
      : {
        type: (recipe.type as MapRecipe["type"]) || "direct",
        steps: (recipe.steps || []).map((s) => ({ action: s.action === "press" ? "press" : "say", value: String(s.value || ""), atSec: Math.round(s.atSec ?? 0) })) as MapStep[],
        seconds: recipe.seconds ?? null, target: recipe.target, menu: recipe.menu, menuPrompts: recipe.menuPrompts, ringVariable: recipe.ringVariable,
      };
    const when = await storeLocalTime(run.store?.id || 0);
    const reachedHuman = session?.humanAtSec != null;
    evidence = evidenceFromCall({
      navId: session?.id, storeId: run.store?.id, storeName: run.store?.name, steps,
      seconds: recipe.seconds ?? null, reachedHuman, path: pathSignature(mapRecipe),
      greeting: session?.greeting, transferAtSec: session?.transferAtSec ?? null,
      endedOnRing: session?.endedOnRing,
      hourLocal: when.hour, dow: when.dow,
      stage: opts?.stage ?? "map", grade: "pass", callSid: session?.callSid,
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
      reachedHuman, seconds: recipe.seconds ?? null, outcome: reachedHuman ? "person" : (session?.endedOnRing ? "ring" : String(session?.status || "done")),
    });
    // The captured route is richer than the one the run carries: it knows WHICH recording each step
    // follows. But the run may hold a fact the fresh capture cannot see — a step proved un-cut-in-able
    // by a call that looped — so carry those forward rather than letting a later call forget them.
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

/** THE PROOF LEDGER for the chain's second lock level (R1): the stores where a real answer about the
 *  product proved the department. The mapping run's store joins at its proven answer — which is also
 *  the hand-dial path: pin a fresh store, run it, and its answer lands here. Real customer checks at
 *  NEW stores add themselves for free (learnFromReceipt). A UNION always, never an overwrite: a
 *  re-lock can never wipe agreements the customers already earned. Three = fully proven. */
export async function seedProvenStores(chainId: number, storeId: number): Promise<void> {
  try { await addProvenStore(chainId, storeId); } catch { /* best effort */ }
}

async function bumpDaily(chainId: number): Promise<number> {
  const key = `mapper_calls:${chainId}:${today()}`;
  const n = Number((await getSetting(key)) || 0) + 1;
  await setSetting(key, String(n));
  return n;
}

/** The held store must be OPEN for a speed check — the gate is re-read before every check, not only
 *  when the store was picked, and an owner-pinned store obeys it too (the contract's "inside its open
 *  hours" has no exceptions). Unknown hours fall back to 9:00–21:59 in the store's own clock. */
async function storeOpenNow(storeId: number): Promise<boolean> {
  try {
    const r = (await db.select().from(retailers).where(eq(retailers.id, storeId)))[0];
    if (!r) return false;
    const st = openState(r.hours, r.timezone || "America/Chicago", new Date());
    if (st.label === "24h") return true;
    if (st.known) return st.open;
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: r.timezone || "America/Chicago", hour: "numeric", hour12: false }).format(new Date()));
    return h >= 9 && h < 22;
  } catch { return true; } // a lookup hiccup must not strand a run — the pick gate already screened
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

  // THE ROUTE THE MAP HOLDS rides along as steering (which doors worked last time), never as a reason
  // to skip anything: LEARN MENU FIRST, ALWAYS (owner Update 1). A held recipe used to start the run
  // at optimizing speed — the mapping-menu stage never ran, which is the exact gap the owner's rounds
  // closed. Now every run starts with the one full check, recipe or no recipe.
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

  // A fresh map is a fresh MENU. The counter goes up here — the one door every re-map comes through,
  // whether the healing loop opened it or the owner pressed Map — so the marks learned on the menu we
  // just replaced stop being enforced from this moment. They are not deleted: they stay on file and
  // on the screen against the map they were learned on.
  const menuNumber = await newMenuNumber(chainId);
  const knownDead = await loadDeadDoors(chainId, menuNumber);
  const run: MapperRun = {
    chainId, chainName: ch.name,
    phase: "map", running: true,
    attempt: 0, callsToday: usedToday,
    usedStores: [], store: null, rotate: false, target, needsTarget: false, reachedSecs: [],
    benchmark: ch.navSeconds ?? null,   // what we're trying to beat (the readout on the live card)
    doorsDead: knownDead.map((e) => e.door),
    doorsDeadQ: Object.fromEntries(knownDead.filter((e) => e.q).map((e) => [e.door, e.q as string])),
    baseline: lockedRecipe, best: lockedRecipe,
    neverAgain: await loadNeverAgain(chainId),
    experiments: [], log: [],
    startedAt: Date.now(), updatedAt: Date.now(),
    lockedRecipe, pinnedStoreId: opts.storeId, mapMisses: 0, menuNumber,
  };
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
    const product = "Pokémon cards";
    const cap = Number((await getSetting("mapper_daily_cap")) || 0) || DAILY_CAP;
    while (run.running && !run.stop) {
      if (draining) { await saveRun(run); return; } // a redeploy is taking over — the next process resumes
      run.updatedAt = Date.now();
      await saveRun(run); // the whole memory, after every attempt — this line is what survives a restart
      // ---- guards ----
      if (await isCallingPaused()) { run.stopReason = "global kill-switch"; run.phase = run.storeLocked ? run.phase : "stopped"; break; }
      if (run.callsToday >= cap) { run.stopReason = `daily cap (${cap} calls)`; run.phase = run.storeLocked ? run.phase : "stopped"; break; }
      const ex = run.phase === "speed" ? run.experiments.find((e) => e.status === "pending") : undefined;
      // NOTHING LEFT TO TEST = the floor. The chain has been live since the store lock; the recipe
      // simply stops improving here. There is no proving stage to drain into — real customer checks
      // carry the proving from here (owner R1).
      if (run.phase === "speed" && !ex) {
        run.phase = "locked";
        run.stopReason = run.stopReason || "nothing new wins — the recipe is at its floor";
        break;
      }

      // ---- the store ----
      // The whole run holds ONE store, so the menu cannot change under us and every comparison is
      // honest. The ONLY reason to take a new store: this one never got us to a person (Update 3).
      if (!run.store || run.rotate) {
        const picked = run.pinnedStoreId && !run.rotate
          ? (await db.select().from(retailers).where(eq(retailers.id, run.pinnedStoreId)))[0]
          : await storeForChain(chainId, run.usedStores, true);
        if (!picked) { run.stopReason = "no store in local daytime hours right now. Re-run when stores are open; mornings hit the east coast first."; run.phase = run.storeLocked ? run.phase : "stopped"; break; }
        run.store = { id: picked.id, name: picked.name, phone: picked.phone };
        run.usedStores.push(picked.id); run.rotate = false;
        run.mapMisses = 0; run.doorProven = false; run.lastLines = undefined; run.settleTries = 0;
      }
      const store = run.store;

      // A PROVEN DOOR WITH NOTHING TO WALK NEVER DIALS AGAIN. Two shapes, one rule: a store whose
      // menu we heard nothing of, and a store whose proven route has no answers in it at all. Either
      // way a wording-settle listen would have no route to finish, so it could never arm its ring
      // hang-up — its only possible ending is a real person picking up and us hanging up on them.
      // The proving check WAS the settle at such a store; there is nothing a second listen could
      // compare (fix pass 5, item 2).
      const nothingToWalk = !(run.best?.steps || []).length;
      if (run.phase === "map" && run.doorProven && !run.storeLocked && run.best
        && (!(run.lastLines || []).length || nothingToWalk)) {
        await lockStore(run, chainId, store.id);
        run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: "nothing to walk here, so nothing to settle — store locked without another call, the chain is live" });
        continue;
      }

      // ---- what kind of check is this? ----
      const stageWord = run.phase === "map" ? "mapping menu" : "optimizing speed";
      // The learn stage's proving check asks Staff about the product. Staff are asked once per DOOR,
      // never more — the ask ledger is per door, so a spent or dead door is steered around and
      // hard-blocked while the STORE stays held, its other doors still askable. The store is only
      // ever abandoned when it never got us to a person (Update 3) or every door is burnt.
      const proving = run.phase === "map" && !run.doorProven;
      // A PROVEN DOOR IS EXEMPT from the spent-ask block (round-3 item 3). The held recipe's own
      // doors were proven by a real answer — telling a re-map "doors that worked: X" and "never
      // choose X" in the same breath burned every proven chain's best door and failed the store.
      // The full first check may re-ask there (owner Update 1); the proof already exists.
      // The exemption must match how the LEDGER keys a door, not only how the recipe spells it: the
      // winning word is often the SHORTENED one ("front"), while the ask was spent under the full
      // phrase the menu offered ("front store services"). Keying on one and blocking on the other
      // left a proven chain blocking its own best door (fix pass 4, item 2). Either spelling of a
      // proven door — and either containing the other — is exempt.
      const provenWords = (run.lockedRecipe?.steps || []).map((st) => String(st.value || "").toLowerCase()).filter(Boolean);
      const isProvenDoor = (d: string) => provenWords.some((p) => p === d || p.includes(d) || d.includes(p));
      const spentDoors = proving ? (await doorsAskedAt(chainId, store.id)).filter((e) => !isProvenDoor(e.door)) : [];
      const blockedNames = [...new Set([...run.doorsDead, ...spentDoors.map((e) => e.door)])];
      const spentQ = new Map(spentDoors.map((e) => [e.door, e.q] as const));
      const blockedDoors = blockedNames.map((door) => ({ door, q: run.doorsDeadQ?.[door] ?? spentQ.get(door) }));
      // Optimizing speed runs inside the store's open hours, re-checked before EVERY check — a run
      // that crosses closing time stops rather than mapping the night menu as if it were the day's.
      if (run.phase === "speed" && !(await storeOpenNow(store.id))) {
        run.stopReason = "the store is outside its open hours — speed continues when it opens";
        break;
      }

      // What this store has played us before — the judge's first layer, read once and used by the
      // check itself and by every reading of what it heard.
      // What this store has played us: the map's memory PLUS what this very run has already heard.
      // During a first run the map holds nothing yet, so without the run's own lines the judge's
      // first layer is blind exactly when it is needed most (fix pass 6, item 6).
      const known = [...(await rememberedMenuLines(chainId, store.id)), ...(run.lastLines || [])];

      // ---- place this stage's check ----
      run.attempt++; run.callsToday = await bumpDaily(chainId);
      // Speed walks the route with ONE change under test; a settle listen walks it exactly as proven;
      // the proving check has no plan — the model walks the tree on the menu's own questions.
      const barge = run.phase === "speed" && ex && run.best ? { plan: planFor(run.best, ex) }
        : run.phase === "map" && run.doorProven && run.best ? { plan: planPlain(run.best) }
        : undefined;
      // The proving check: the model walks the tree answering each question with the FULL phrase,
      // steered away from every door already proven wrong OR whose one ask is spent, and asks at the
      // person — the answer IS the proof. A held route's doors ride as steering; its old (possibly
      // shortened) words do not.
      const dead = blockedNames.length ? ` NEVER choose ${blockedNames.join(" or ")} — those doors are burnt (wrong desk, or their one ask is spent).` : "";
      const hint = proving
        ? ((run.lockedRecipe?.steps || []).length
            ? "Doors that worked before, in order: "
              + (run.lockedRecipe!.steps || []).map((st) => (st.action === "press" ? `press ${st.value}` : `"${st.value}"`)).join(", then ")
              + "." + dead
            : (dead || undefined))
        : undefined;
      const placed = await placeNavCall(
        chainId, store.id, store.name, store.phone,
        undefined, hint, barge, undefined,
        proving ? { product } : undefined,
        { askVoiceId: ask.voiceId, askText: ask.text, target: run.target,
          maxSec: CALL_MAX_SEC, transferWaitSec: TRANSFER_WAIT_SEC,
          // EVERY check that is not the proving ask hangs up on the second ring — the settle listens
          // and the speed checks alike (voice-calls RULES line 2). No Staff, ever.
          relisten: !proving,
          stage: run.phase === "map" ? "map" : "speed",
          // The proving check LEARNS whatever menu answers — no expected greeting, it is writing the
          // record. Every later check is graded against the menu the proof heard.
          expectedGreeting: proving ? undefined : run.expectedGreeting,
          recipeSeconds: run.bestMenuSecs,
          // Burnt doors (wrong desk, or ask spent) are a HARD block in the navigator, not only a
          // sentence in the prompt.
          deadDoors: proving && blockedDoors.length ? blockedDoors : undefined,
          // THE JUDGE'S FIRST LAYER: what this store has said before. Nothing on file makes this the
          // store's first check — pure listening, hang up on nothing.
          knownMenuLines: known,
          // This loop folds its own calls into the map at the lock. `finish` must not fold them.
          callerRecords: true,
          why: `Mapping ${run.chainName} (${stageWord}, check ${run.attempt})` },
      );
      if (placed.error || !placed.id) {
        run.log.push({ n: run.attempt, phase: run.phase, store: store.name, experiment: ex?.label, outcome: "the call never connected" });
        await sleep(GAP_SEC * 1000); continue;
      }
      run.navId = placed.id;

      // ---- follow the check to its end ----
      // WAIT PAST THE CALL'S OWN CEILING. Watching for exactly as long as the call may run meant a
      // check that ended on its last second was read as a timeout — its grade, and its proof, lost.
      const deadline = Date.now() + (CALL_MAX_SEC + 30) * 1000;
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
      // A fail with NO reason and a held expectation = the menu did not match: a new CONDITION, filed
      // by the navigator already (menu-changed), quarantined here — it can change nothing, and this
      // run cannot keep grading checks against a menu the store is no longer playing.
      const menuChanged = s?.grade === "fail" && !reason && !!run.expectedGreeting && run.phase !== "map" && !s?.confirm?.asked;
      const answered = s?.confirmResult === "answered";
      const redirected = s?.confirmResult === "redirect";
      const recipe = s ? (s.recipe ?? recipeFromSteps(s.steps as NavStep[], s.humanAtSec)) : null;
      const secs = recipe?.seconds ?? null;
      const menuSecs = s?.transferAtSec ?? [...((s?.steps || []) as NavStep[])].reverse().find((st) => st.who === "us" && !st.knock)?.atSec ?? null;
      if (!graded && s?.deadLine) run.rotate = true;
      if (graded && typeof secs === "number") run.reachedSecs.push(secs);
      if (menuChanged) {
        run.stopReason = "the menu's words changed mid-run — filed as its own condition; nothing was touched";
        run.log.push({ n: run.attempt, phase: run.phase, store: store.name, experiment: ex?.label, outcome: "a different menu answered — filed as its own condition, changed nothing" });
        break;
      }

      // ---- learn from the outcome ----
      if (run.phase === "map" && !run.doorProven) {
        if (graded && answered && recipe) {
          // THE DOOR IS PROVEN — a person at its end gave a real answer about the product. The route
          // becomes the one to beat, and the run keeps LISTENING until the wording settles: nothing
          // is locked off a single hearing.
          run.baseline = recipe as NavRecipe; run.best = recipe as NavRecipe;
          if (typeof menuSecs === "number") run.bestMenuSecs = menuSecs;
          run.expectedGreeting = ((s?.steps || []) as NavStep[]).find((st) => st.who === "ivr" && st.text)?.text;
          run.doorProven = true;
          // The proven answer joins the proof ledger NOW — this is also the hand-dial path: pin a
          // fresh store, run it, and its Staff answer counts toward proven-at-three.
          await addProvenStore(chainId, store.id); // never throws — the ledger is best-effort inside
          run.lastLines = menuLinesOf((s?.steps || []) as NavStep[], s?.transferAtSec, s?.humanAtSec, known);
          run.winnerSession = sessionLike(s);
          if (!run.lastLines.length) {
            // A store where Staff just pick up has NO menu wording to settle — the proven answer is
            // the whole map. It locks on the spot; there is nothing a second listen could compare,
            // and a listen here would dial a real person just to hang up on them.
            await lockStore(run, chainId, store.id);
            run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `right department — Staff answered about ${product} with no menu in front of them. Store locked, the chain is live`, seconds: secs });
          } else {
            run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `right department — Staff answered about ${product} (${classifyMode((s?.steps || []) as NavStep[]).label}). Listening until the wording settles`, seconds: secs });
          }
        } else if (redirected) {
          // The wrong desk answered. The door that dies is the option WE PICKED — never the clerk's
          // redirect sentence, which no menu ever offers as a choice — and it dies durably, chain
          // wide. The next check takes the next-best door at the SAME store.
          const door = pickedDoorFrom((s?.steps || []) as NavStep[]) || (s?.redirectTo || "").slice(0, 40) || "that door";
          await rememberDeadDoor(run, door, questionBeforePick((s?.steps || []) as NavStep[]));
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `wrong department — "${door}" is dead, trying the next door at this store`, seconds: secs });
        } else if (s?.confirm?.asked) {
          // Staff heard the question but the check died without a verdict. That DOOR's one ask is
          // spent (the navigator's ledger recorded it); the store is held and the next check takes
          // the next-best door — a store is only ever abandoned when it never gets us to a person.
          const door = pickedDoorFrom((s?.steps || []) as NavStep[]) || "that door";
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: reason ? `${reason} — the ask at "${door}" is spent, trying the next door at this store` : `the ask was heard but the check died — the ask at "${door}" is spent, trying the next door at this store` });
        } else if (s?.stopReason?.includes("only doors already proven wrong")) {
          // Every door at this store is burnt (dead, or its ask spent). The store cannot prove the
          // department any more — the one honest reason left to take a fresh one.
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: "every door here is burnt — taking a fresh store" });
          run.rotate = true;
        } else {
          // Nobody was reached. A failed check changes NOTHING — it stays in the run log, collapsed,
          // and is never folded into evidence or confidence (the fold used to move both).
          run.mapMisses = (run.mapMisses ?? 0) + 1;
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: reason || (s?.humanAtSec != null ? "Staff answered but the check did not pass" : "nobody answered"), seconds: secs });
          if ((run.mapMisses ?? 0) >= MISSES_PER_STORE) {
            // This store never got us to a person — the one legitimate reason to move (Update 3).
            run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: `no person in ${MISSES_PER_STORE} checks — taking a fresh store` });
            run.rotate = true;
          }
        }
      } else if (run.phase === "map" && run.doorProven) {
        // THE WORDING SETTLES: a ring-hang-up listen of the proven route. The same lines twice in a
        // row = settled → THE STORE LOCKS and the chain goes LIVE, in one stroke.
        const lines = menuLinesOf((s?.steps || []) as NavStep[], s?.transferAtSec, s?.humanAtSec, known);
        if (graded && sameWording(run.lastLines, lines)) {
          run.winnerSession = sessionLike(s); // the final locked run IS the wording on the page
          await lockStore(run, chainId, store.id);
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: "the wording settled — store locked, the chain is live. Optimizing speed", seconds: menuSecs });
        } else if (graded) {
          run.lastLines = lines;
          run.settleTries = (run.settleTries ?? 0) + 1;
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: "heard the menu again — the wording has not read the same twice yet", seconds: menuSecs });
          if ((run.settleTries ?? 0) >= SETTLE_TRIES) { run.stopReason = `the menu never reads the same twice in ${SETTLE_TRIES} listens`; run.phase = "stopped"; break; }
        } else {
          run.mapMisses = (run.mapMisses ?? 0) + 1;
          run.log.push({ n: run.attempt, phase: "map", store: store.name, outcome: reason || (s?.humanAtSec != null ? "Staff answered but the check did not pass" : "nobody answered"), seconds: secs });
          if ((run.mapMisses ?? 0) >= MISSES_PER_STORE) { run.stopReason = `no clean walk in ${MISSES_PER_STORE} checks`; run.phase = "stopped"; break; }
        }
      } else if (run.phase === "speed" && ex) {
        // ONE change per check, graded by machine. A win updates the recipe and the Menu on the spot
        // (owner Update 5); a loss changes nothing and that exact move is never tried again.
        if (graded && recipe && typeof menuSecs === "number") {
          ex.status = "win"; run.best = recipe as NavRecipe; run.bestMenuSecs = menuSecs;
          // A ring-ended win never measured Staff, and it CLAIMS nothing: its own record keeps
          // seconds null (no number this call did not measure), and the chain row keeps its last
          // proven numbers through the writer's own fallback (lockRecipeToChain).
          run.winnerSession = sessionLike(s);
          await finalizeAndLock(run, chainId, run.best, null, run.winnerSession, { activate: true, stage: "speed" });
          run.log.push({ n: run.attempt, phase: "speed", store: store.name, experiment: ex.label, outcome: `faster — the recipe and the Menu are updated (menu ${menuSecs}s)`, seconds: menuSecs });
        } else {
          ex.status = "fail";
          const stepValue = String(run.best?.steps?.[ex.stepIdx]?.value || "").toLowerCase();
          if (reason === "barge didn't work" && run.best?.steps?.[ex.stepIdx]) {
            // Remembered on the run's copy (written into the map at the next win) AND durably, so no
            // future run spends a real call re-proving that this question must be allowed to finish.
            (run.best.steps[ex.stepIdx] as { bargeSafe?: boolean }).bargeSafe = false;
            await rememberNever(run, `cutin:${stepValue}`);
            run.experiments = run.experiments.filter((e) => !(e.kind === "cutin" && e.stepIdx === ex.stepIdx && e.status === "pending"));
          } else if (ex.kind === "shorten") {
            await rememberNever(run, `shorten:${run.best?.steps?.[ex.stepIdx]?.value}->${ex.value}`);
          } else if (ex.kind === "cutin") {
            await rememberNever(run, `cutin:${stepValue}`);
          }
          run.log.push({ n: run.attempt, phase: "speed", store: store.name, experiment: ex.label, outcome: reason || "not faster", seconds: menuSecs });
        }
      }
      await sleep(GAP_SEC * 1000);
    }

    // ---- wrap up ----
    // The lock already happened the moment the store proved and the wording settled (the chain has
    // been live since). Wrap-up is bookkeeping only: no write can happen here, so a stopped or
    // crashed run can never half-lock anything.
    if (run.stop) { run.phase = "stopped"; run.stopReason = run.stopReason || "stopped by admin"; }
    if (run.phase === "locked" && run.needsTarget && !run.stopReason?.includes("target")) {
      run.stopReason = "locked, but the menu has no customer-service option. Pick a target desk and re-run.";
    }
    run.running = false; run.updatedAt = Date.now();
    await clearRun(chainId); // finished for real — a restart must not resurrect it
  })().catch((e) => {
    run.running = false; run.phase = run.storeLocked ? run.phase : "stopped";
    run.stopReason = "engine error: " + String(e).slice(0, 120);
    // A crashing run must not resume into the same crash forever — but it must not VANISH either.
    // The final state is SAVED (running:false), so the stop and its reason survive a restart and the
    // live card can show what happened; the next boot's resume pass sees a finished run and clears
    // it. One database hiccup no longer erases a run without a trace.
    void saveRun(run);
  });
}

// Overnight phone-tree batch: dial ONE store per chain, let the cheap-lane navigator learn the
// route to a human, and persist it. Human-confirmed recipes are auto-locked into the chain (so live
// calls + the demo use them); routes that navigated a menu but never reached a human (e.g. the store
// is closed overnight) are saved as a "review" candidate ONLY — they do NOT touch live call behavior.
//
// One call at a time, rate-limited, respects the global calling kill-switch + a stop flag. State is
// in-memory, so a server restart stops it — keep code-deploys frozen while it runs.
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { chains, retailers } from "../db/schema";
import { placeNavCall, getNavSession } from "./navigator";
import { isCallingPaused } from "../redis";
import { openState } from "../store-hours";

type Step = { who?: string; action?: string; value?: string; atSec?: number };
type Recipe = { type?: string; steps?: Array<{ action?: string; value?: string; atSec?: number }>; seconds?: number };

const state = {
  running: false, stop: false, total: 0, done: 0, learned: 0, review: 0, skipped: 0, failed: 0,
  current: "", startedAt: 0,
  results: [] as Array<{ chain: string; outcome: string; seconds?: number }>,
};
export function batchStatus() { return { ...state, results: state.results.slice(-50) }; }
export function stopBatch() { state.stop = true; return { stopping: true, ...batchStatus() }; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build a recipe from the steps the navigator actually took (mirrors navigator's human-path build). */
function recipeFromSteps(steps: Step[], humanAtSec: number | null): Recipe {
  const acts = (steps || []).filter((st) => st.who === "us").map((st) => ({ action: st.action || "say", value: st.value || "", atSec: st.atSec }));
  const type = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
  return { type, steps: acts, seconds: humanAtSec ?? (steps[steps.length - 1]?.atSec ?? 0) };
}

/** Persist a HUMAN-CONFIRMED recipe to the chain — applies to live calls (mirrors trainer/lock). */
async function lockRecipeToChain(chainId: number, recipe: Recipe, confidence: number | null) {
  const ch = (await db.select().from(chains).where(eq(chains.id, chainId)))[0];
  const log = ch?.navLog ? (JSON.parse(ch.navLog) as number[]) : [];
  if (typeof recipe.seconds === "number") log.push(recipe.seconds);
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const direct = recipe.type === "direct" || steps.length === 0;
  const treeText = direct
    ? "A live person usually answers directly — no phone menu to work through."
    : "To reach a live person: " + steps.map((s) => (s.action === "press" ? `press ${s.value}` : `say "${s.value}"`)).join(", then ") + ".";
  const firstPress = steps.find((s) => s.action === "press");
  const now = Math.floor(Date.now() / 1000);
  await db.update(chains).set({
    navType: recipe.type || null, navRecipe: JSON.stringify(recipe),
    navSeconds: typeof recipe.seconds === "number" ? Math.round(recipe.seconds) : null,
    navStatus: "locked", navConfidence: typeof confidence === "number" ? confidence : null,
    navLog: JSON.stringify(log.slice(-10)), navUpdatedAt: now,
    // ↓ applied to LIVE consumer calls:
    phoneTreeDefault: treeText, treeNote: treeText,
    dtmfShortcut: firstPress ? String(firstPress.value || "") : null,
    answerPath: steps.map((s) => `${s.action}:${s.value}`).join(">") || null,
    ringsDirect: direct, avgTreeSeconds: typeof recipe.seconds === "number" ? Math.round(recipe.seconds) : null,
    treeStatus: "learned", treeLearnedAt: now,
  }).where(eq(chains.id, chainId));
}

/** Save an UNCONFIRMED route (never reached a human) as a review candidate — does NOT touch live. */
async function saveCandidate(chainId: number, recipe: Recipe, confidence: number | null) {
  await db.update(chains).set({
    navRecipe: JSON.stringify(recipe),
    navSeconds: typeof recipe.seconds === "number" ? Math.round(recipe.seconds) : null,
    navStatus: "review", navConfidence: typeof confidence === "number" ? confidence : null,
    navUpdatedAt: Math.floor(Date.now() / 1000),
  }).where(eq(chains.id, chainId));
}

const hasRealPhone = (p?: string | null) => !!p && !p.startsWith("nophone:") && /\d{7}/.test(p);

/** Pick the BEST store to dial for a chain RIGHT NOW: one that's actually open. With 101k stores a
 *  national chain almost always has a 24h or west-coast location open at this hour. Score each store
 *  by openState (24h > real-hours-open > daytime-unknown) and dial the best; return null only if every
 *  callable store is genuinely closed (so the chain is skipped tonight, not wasted on a dead line). */
async function storeForChain(chainId: number) {
  const rows = await db.select().from(retailers)
    .where(and(eq(retailers.chainId, chainId), eq(retailers.active, true))).limit(4000);
  const now = new Date();
  const score = (r: typeof rows[number]) => {
    if (!hasRealPhone(r.phone)) return -1;
    const st = openState(r.hours, r.timezone || "America/Chicago", now);
    if (st.label === "Open 24h") return 4;          // best: never a closed-store dead end
    if (st.open && st.known) return 3;               // real hours say open now (e.g. "till 12 AM")
    if (st.open && !st.known) return 2;              // unknown hours but daytime in its tz (west coast now)
    return 0;                                         // known-closed / overnight-unknown
  };
  let best: typeof rows[number] | null = null, bestScore = 0;
  for (const r of rows) { const s = score(r); if (s > bestScore) { best = r; bestScore = s; if (s === 4) break; } }
  return best; // null when nothing scored > 0 (all closed) → batch skips this chain for a daytime run
}

interface BatchOpts { onlyMissing?: boolean; perCallMaxSec?: number; gapSec?: number; limit?: number; }

/** Kick off the batch (fire-and-forget). Returns immediately; poll batchStatus(). */
export async function startBatch(opts: BatchOpts = {}) {
  if (state.running) return { error: "already running", ...batchStatus() };
  const onlyMissing = opts.onlyMissing !== false;       // default: only chains without a locked tree
  const perCallMaxSec = Math.max(40, opts.perCallMaxSec ?? 120);
  const gapSec = Math.max(5, opts.gapSec ?? 15);
  let list = (await db.select().from(chains).where(eq(chains.muted, false)));
  // Match the app's store list EXACTLY: a chain only shows up (and is only callable) when it has at
  // least one active store with a real phone (mirrors /pub/stores). Drops online-only/phantom chains
  // like Amazon so they're never dialed and never clutter the report.
  const callable = await db.select({ chainId: retailers.chainId, phone: retailers.phone })
    .from(retailers).where(eq(retailers.active, true));
  const appChains = new Set(callable.filter((r) => r.chainId && r.phone && !r.phone.startsWith("nophone:") && /\d{7}/.test(r.phone)).map((r) => r.chainId as number));
  list = list.filter((c) => appChains.has(c.id));
  if (onlyMissing) list = list.filter((c) => c.navStatus !== "locked" && !c.phoneTreeDefault);
  if (opts.limit) list = list.slice(0, opts.limit);
  Object.assign(state, { running: true, stop: false, total: list.length, done: 0, learned: 0, review: 0, skipped: 0, failed: 0, current: "", startedAt: Date.now(), results: [] });

  (async () => {
    for (const ch of list) {
      if (state.stop) { state.results.push({ chain: ch.name, outcome: "stopped" }); break; }
      if (await isCallingPaused()) { state.results.push({ chain: ch.name, outcome: "kill-switch — stopping" }); break; }
      state.current = ch.name;
      const store = await storeForChain(ch.id);
      if (!store) { state.skipped++; state.done++; state.results.push({ chain: ch.name, outcome: "all stores closed now — retry daytime" }); continue; }
      const placed = await placeNavCall(ch.id, store.id, store.name, store.phone);
      if (placed.error || !placed.id) { state.failed++; state.done++; state.results.push({ chain: ch.name, outcome: "dial failed: " + (placed.error || "?") }); await sleep(gapSec * 1000); continue; }
      const deadline = Date.now() + perCallMaxSec * 1000;
      let s = getNavSession(placed.id);
      while (Date.now() < deadline) {
        s = getNavSession(placed.id);
        if (!s || s.status === "human" || s.status === "done" || s.status === "failed") break;
        await sleep(3000);
      }
      if (s && s.status === "human") {
        const recipe = s.recipe ?? recipeFromSteps(s.steps as Step[], s.humanAtSec);
        await lockRecipeToChain(ch.id, recipe, s.confidence ?? null);
        state.learned++; state.results.push({ chain: ch.name, outcome: `learned (${recipe.type})`, seconds: recipe.seconds });
      } else if (s && Array.isArray(s.steps) && (s.steps as Step[]).some((st) => st.who === "us")) {
        const recipe = recipeFromSteps(s.steps as Step[], s.humanAtSec);
        await saveCandidate(ch.id, recipe, s.confidence ?? null);
        state.review++; state.results.push({ chain: ch.name, outcome: `review-candidate (${s?.status || "timeout"})`, seconds: recipe.seconds });
      } else {
        state.failed++; state.results.push({ chain: ch.name, outcome: `no route (${s?.status || "timeout"})` });
      }
      state.done++;
      await sleep(gapSec * 1000);
    }
    state.running = false; state.current = "";
  })().catch((e) => { state.running = false; state.results.push({ chain: state.current, outcome: "loop error: " + String(e).slice(0, 90) }); });

  return { started: true, total: list.length, onlyMissing, gapSec, perCallMaxSec };
}

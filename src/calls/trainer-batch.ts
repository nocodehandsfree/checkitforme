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
import { placeNavCall, getNavSession, defaultWorkflowAsk } from "./navigator";
import { isCallingPaused, setBatchState, getBatchState } from "../redis";
import { openState } from "../store-hours";
import { chainDialable, recipeToDtmf } from "./recipe";
import { proposeVersion, pathSignature, type EvidenceCall } from "./mapgraph";

type Step = { who?: string; action?: string; value?: string; atSec?: number };
// `seconds` is TIME TO STAFF and may be null: a call that ended on the desk ringing walked the whole
// phone system but never learned how long Staff take. Null flows through to no join timer, so the
// paid agent waits for a real voice rather than opening on a number nobody measured.
type Recipe = { type?: string; steps?: Array<{ action?: string; value?: string; atSec?: number }>; seconds?: number | null; navSeconds?: number | null; menu?: Array<{ digit: string; label: string; say?: string }>; menuPrompts?: string[]; ringVariable?: boolean; target?: string };

const state = {
  running: false, stop: false, total: 0, done: 0, learned: 0, review: 0, skipped: 0, failed: 0,
  current: "", startedAt: 0,
  results: [] as Array<{ chain: string; outcome: string; seconds?: number }>,
};
export function batchStatus() { return { ...state, results: state.results.slice(-50) }; }
export function stopBatch() { state.stop = true; void setBatchState(null); return { stopping: true, ...batchStatus() }; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build a recipe from the steps the navigator actually took (mirrors navigator's human-path build).
 *  The confirm question ("asked: …") is training scaffolding, not navigation — drop it, or a
 *  direct-answer store's recipe would tell live calls to recite the ask as a menu step. */
export function recipeFromSteps(steps: Step[], humanAtSec: number | null): Recipe {
  const acts = (steps || []).filter((st) => st.who === "us" && !(st as { knock?: boolean }).knock && !String((st as { text?: string }).text || "").startsWith("asked:")).map((st) => ({ action: st.action || "say", value: st.value || "", atSec: st.atSec }));
  const type = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
  return { type, steps: acts, seconds: humanAtSec ?? (steps[steps.length - 1]?.atSec ?? 0) };
}

/** Persist a HUMAN-CONFIRMED recipe to the chain — applies to live calls — AND record it in the map.
 *  ONE writer for every path that locks a route (the Admin Map button, the overnight batch, the mapper,
 *  the sweep), so a route can never reach live calls without its evidence and its version landing too.
 *  `evidence` is what the call proved; without it the version still lands, carrying only what we know. */
export async function lockRecipeToChain(chainId: number, recipe: Recipe, confidence: number | null, evidence?: EvidenceCall, opts?: { activate?: boolean }) {
  const ch = (await db.select().from(chains).where(eq(chains.id, chainId)))[0];
  const log = ch?.navLog ? (JSON.parse(ch.navLog) as number[]) : [];
  if (typeof recipe.seconds === "number") log.push(recipe.seconds);
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  // A GREETING route has no steps but is NOT direct: a recording plays, often hold music follows, and
  // a person arrives seconds later. Treating it as direct is what put the paid agent on the line
  // talking to "thank you for calling Barnes & Noble" (owner 07-27).
  const greeting = recipe.type === "greeting";
  const direct = !greeting && (recipe.type === "direct" || steps.length === 0);
  // navText drives LIVE consumer calls — keep it to the navigation instruction only (unchanged).
  const navText = direct
    ? "Staff usually answer directly. No phone menu to work through."
    : greeting
      ? "A recording answers first, then hands you to Staff. Nothing to press or say, just wait."
      : "To reach a live person: " + steps.map((s) => (s.action === "press" ? `press ${s.value}` : `say "${s.value}"`)).join(", then ") + ".";
  // docText is the DOCUMENTED tree the owner reads (#2/#6): nav path + target desk + menu options +
  // ring-variance warning. Kept out of phoneTreeDefault so it never changes live-call behavior.
  const menuText = Array.isArray(recipe.menu) && recipe.menu.length
    // A spoken menu has no digit to show, so it reads as the word you answer with instead.
    ? " Menu options heard: " + recipe.menu.map((o) => (o.digit ? `[${o.digit}] ${o.label || "?"}` : `say "${o.say || o.label}"`)).join("; ") + "."
    : "";
  const targetText = recipe.target ? ` Reaches: ${recipe.target}.` : "";
  const varText = recipe.ringVariable ? " ⚠ Variable ring (department pickup) — time-to-human varies call to call." : "";
  const docText = navText + targetText + varText + menuText;
  // dtmfShortcut is what the LIVE bridge presses, and it only understands the timed "digit@seconds"
  // form — it scans for `@` and plays nothing at all when it finds none. This used to write the bare
  // first digit ("4"), so every chain locked through this path (HomeGoods, Big 5, Barnes & Noble,
  // GameStop, Kohl's…) pressed NOTHING on live checks while the trainer-locked chains ("2@8,2@16")
  // worked. One converter for both, exactly as recipe.ts says: recipeToDtmf.
  const dtmfPlan = recipeToDtmf(recipe as { steps?: Array<{ action?: string; value?: string; atSec?: number }> });
  const now = Math.floor(Date.now() / 1000);

  // THE MAP DECIDES WHERE THIS BELONGS, BEFORE ANYTHING TOUCHES LIVE CALLS. A route proved at ONE
  // store that disagrees with the chain is that store's exception, not the chain changing its mind
  // (runtime spec §10.2) — so it must not stamp the chain row that five hundred stores read. We ask
  // the map first and only stamp when the answer is "this is the chain's route".
  const mapRecipe = {
    type: (recipe.type as "direct" | "keypad" | "voice" | "greeting") || (direct ? "direct" : "keypad"),
    steps: steps.map((st) => ({
      action: st.action === "press" ? ("press" as const) : ("say" as const),
      value: String(st.value || ""), atSec: Math.round(st.atSec ?? 0),
      afterPrompt: (st as { afterPrompt?: number }).afterPrompt,
    })),
    seconds: typeof recipe.seconds === "number" ? recipe.seconds : null,
    target: recipe.target, menu: recipe.menu, menuPrompts: recipe.menuPrompts,
    ringVariable: recipe.ringVariable, language: evidence?.language,
  };
  let chainLevel = true;
  try {
    const res = await proposeVersion({
      chainId, recipe: mapRecipe, source: evidence ? "mapping call" : "lock",
      // A finished mapping run has EARNED activation: one store proved the department and the wording
      // settled (owner Update 2), so its route goes live in the same stroke instead of waiting as a
      // proposal the owner never asked to judge. Speed wins ride the same flag (Update 5).
      autoActivate: opts?.activate || undefined,
      storeId: evidence?.storeId,
      call: evidence ?? {
        at: now, day: new Date(now * 1000).toISOString().slice(0, 10),
        reachedHuman: true, path: pathSignature(mapRecipe),
        seconds: typeof recipe.seconds === "number" ? recipe.seconds : null,
      },
    });
    chainLevel = res.version.storeId === 0;
  } catch { /* the map is best-effort; a hiccup there must never stop a proven route going live */ }
  if (!chainLevel) return;   // a store exception: recorded, live for that store, chain row untouched

  // A RING-ENDED WIN NEVER NULLS THE CHAIN'S NUMBERS. A settling listen or a speed win hangs up on
  // the second ring by design, so its recipe carries seconds:null — that is "nobody measured Staff on
  // THIS check", not "forget the number the last proven check measured". The held values stand until
  // a check that actually reached Staff moves them.
  const secs = typeof recipe.seconds === "number" ? Math.round(recipe.seconds) : (ch?.navSeconds ?? null);
  const treeSecs = typeof recipe.seconds === "number" ? Math.round(recipe.seconds) : (ch?.avgTreeSeconds ?? null);
  await db.update(chains).set({
    navType: recipe.type || null, navRecipe: JSON.stringify(recipe),
    navSeconds: direct ? null : secs,
    navStatus: "locked", navConfidence: typeof confidence === "number" ? confidence : null,
    navLog: JSON.stringify(log.slice(-10)), navUpdatedAt: now,
    // ↓ applied to LIVE consumer calls (navText only — the menu/notes live in treeNote for the owner):
    phoneTreeDefault: navText, treeNote: docText,
    dtmfShortcut: dtmfPlan || null,
    answerPath: steps.map((s) => `${s.action}:${s.value}`).join(">") || (greeting ? "greeting_then_transfer" : null),
    // Direct chains carry no seconds (a stray value mutes the agent — the silent-agent bug). A GREETING
    // chain is the opposite case: it MUST carry its seconds, because that wait is the whole point.
    ringsDirect: direct, avgTreeSeconds: direct ? null : treeSecs,
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
// Chains that famously run 24h — their stores are staffed at any hour even when our hours data is
// null (WinCo/Sheetz rows have no hours on file). Move to a data flag when hours backfill lands.
const KNOWN_24H = /winco|sheetz|wawa|buc-?ee|7-?eleven|circle k|quiktrip|speedway|casey'?s|kum ?& ?go/i;

export async function storeForChain(chainId: number, excludeIds?: number[], daytimeOnly?: boolean) {
  let rows = await db.select().from(retailers)
    .where(and(eq(retailers.chainId, chainId), eq(retailers.active, true))).limit(4000);
  // Known-24h chain → skip the local-hour gate entirely; night crews answer the phone.
  if (daytimeOnly) {
    const ch = (await db.select({ name: chains.name }).from(chains).where(eq(chains.id, chainId)))[0];
    if (ch && KNOWN_24H.test(ch.name || "")) daytimeOnly = false;
  }
  // Rotation (mapper): skip stores we already dialed this run — unless that would leave nothing.
  if (excludeIds?.length) {
    const ex = new Set(excludeIds);
    const rest = rows.filter((r) => !ex.has(r.id));
    if (rest.length) rows = rest;
  }
  const now = new Date();
  // Local hour in the store's timezone. Mapping needs a FRONT-STORE human, so daytimeOnly gates to
  // 9:00–21:59 local (front stores commonly run to 10pm; pharmacy hours are irrelevant — we never
  // want the pharmacy). Walks east → west across the day, the owner's dialing order.
  const localHour = (tz: string | null) => {
    try { return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", hour: "numeric", hour12: false }).format(now)); }
    catch { return 12; }
  };
  const score = (r: typeof rows[number]) => {
    if (!hasRealPhone(r.phone)) return -1;
    const st = openState(r.hours, r.timezone || "America/Chicago", now);
    if (st.label === "24h") return 4;          // 24h = staffed right now, any hour — always fair game
    if (daytimeOnly) { const h = localHour(r.timezone); if (h < 9 || h >= 22) return 0; }
    if (st.open && st.known) return 3;               // real hours say open now (e.g. "till 12 AM")
    if (st.open && !st.known) return 2;              // unknown hours but daytime in its tz (west coast now)
    return 0;                                         // known-closed / overnight-unknown
  };
  let best: typeof rows[number] | null = null, bestScore = 0;
  for (const r of rows) { const s = score(r); if (s > bestScore) { best = r; bestScore = s; if (s === 4) break; } }
  return best; // null when nothing scored > 0 (all closed) → batch skips this chain for a daytime run
}

interface BatchOpts { onlyMissing?: boolean; perCallMaxSec?: number; gapSec?: number; limit?: number; }

/** RETIRED (owner, 07-31). One call never proves a route: the batch dialed a chain once, took whatever
 *  it heard and locked it — exactly the guesswork the mapping runs replaced. Routes are earned now:
 *  map the menu, optimize the speed, prove the department at three stores, and the map moves once, at
 *  lock. The body below stays only as a record of what the batch did; nothing can reach it. */
export async function startBatch(opts: BatchOpts = {}) {
  void opts;
  return { error: "the batch trainer is retired — routes come from mapping runs now (map the menu, optimize the speed, prove the department)" };
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
  // Shared dialable rule (recipe.ts) — same one the board + single-map read, so the batch never wastes a
  // call on a check-online / call-center / muted chain the other surfaces already exclude.
  list = list.filter((c) => chainDialable(c) && appChains.has(c.id));
  if (onlyMissing) list = list.filter((c) => c.navStatus !== "locked" && !c.phoneTreeDefault);
  if (opts.limit) list = list.slice(0, opts.limit);
  Object.assign(state, { running: true, stop: false, total: list.length, done: 0, learned: 0, review: 0, skipped: 0, failed: 0, current: "", startedAt: Date.now(), results: [] });
  // Durable flag so a redeploy mid-run auto-resumes the remaining chains on boot (resilience).
  await setBatchState(JSON.stringify({ active: true, onlyMissing, perCallMaxSec, gapSec, startedAt: state.startedAt }));

  (async () => {
    const ask = await defaultWorkflowAsk(); // Branson global's opener + voice, once per batch
    for (const ch of list) {
      if (state.stop) { state.results.push({ chain: ch.name, outcome: "stopped" }); break; }
      if (await isCallingPaused()) { state.results.push({ chain: ch.name, outcome: "kill-switch — stopping" }); break; }
      state.current = ch.name;
      const store = await storeForChain(ch.id);
      if (!store) { state.skipped++; state.done++; state.results.push({ chain: ch.name, outcome: "all stores closed now — retry daytime" }); continue; }
      // Every human contact ends with the real ask ("any Pokémon cards in?") in the workflow voice —
      // a mapping call that reaches a person is never wasted on a silent hangup.
      const placed = await placeNavCall(ch.id, store.id, store.name, store.phone, undefined, undefined, undefined, undefined, { product: "Pokémon cards" }, { askVoiceId: ask.voiceId, askText: ask.text, why: `Sweep: ${ch.name}` });
      if (placed.error || !placed.id) { state.failed++; state.done++; state.results.push({ chain: ch.name, outcome: "the call never connected" }); await sleep(gapSec * 1000); continue; }
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
        state.learned++; state.results.push({ chain: ch.name, outcome: `learned (${recipe.type})`, seconds: recipe.seconds ?? undefined });
      } else if (s && Array.isArray(s.steps) && (s.steps as Step[]).some((st) => st.who === "us")) {
        const recipe = recipeFromSteps(s.steps as Step[], s.humanAtSec);
        await saveCandidate(ch.id, recipe, s.confidence ?? null);
        state.review++; state.results.push({ chain: ch.name, outcome: `review-candidate (${s?.status || "timeout"})`, seconds: recipe.seconds ?? undefined });
      } else {
        state.failed++; state.results.push({ chain: ch.name, outcome: `no route (${s?.status || "timeout"})` });
      }
      state.done++;
      await sleep(gapSec * 1000);
    }
    state.running = false; state.current = "";
    await setBatchState(null); // finished/stopped/kill-switched → don't auto-resume on next boot
  })().catch((e) => { state.running = false; state.results.push({ chain: state.current, outcome: "loop error: " + String(e).slice(0, 90) }); });

  return { started: true, total: list.length, onlyMissing, gapSec, perCallMaxSec };
}

/** Called once at server boot: if a batch was active when the process died (redeploy), resume the
 *  remaining chains. Already-locked chains are filtered out by onlyMissing, so resume is idempotent. */
export async function resumeBatchIfFlagged() {
  try {
    const raw = await getBatchState();
    if (!raw) return;
    // The batch trainer is retired — a flag left by an old deploy is cleared, never resurrected.
    await setBatchState(null);
  } catch (e) { console.error("[trainer-batch] resume failed", e); }
}

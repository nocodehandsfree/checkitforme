// THE MORNING SWEEP — call every chain we dial, east coast first, and prove the route to a person.
//
// The owner's order (07-26): "start on the East Coast in the morning and move towards the West Coast
// as things get later… your goal is to reach a human… you can hang up when you get to a human… only
// save the perfect recipe."
//
// What this is NOT: a new calling engine. Every call still goes through the existing mapper
// (mapper.ts → navigator.ts), which learns the menu first at one held store, locks on a real answer
// plus settled wording, then optimizes speed — the short word, or cutting in on the menu's own words,
// never a clock. This file is the ORDER those runs happen in, plus the two things the mapper
// could not do on its own:
//   1. VERIFY the 46 chains marked "a person answers directly". A recorded greeting in front of a
//      human is still a menu, and a chain wrongly marked direct is what let the paid agent talk to a
//      recording (the BoxLunch bug). The mapper skips direct chains by design, so the sweep forces
//      one proving call through the same trainer — never a hand edit.
//   2. Write every result into the versioned map with its evidence (mapgraph.ts).
//
// Money guard: mapping calls use Twilio speech recognition (measured ~8.6c/call), so the sweep
// carries a hard call budget and stops when it is spent. Never runs on its own — it starts only when
// somebody starts it.
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { chains, retailers } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";
import { isCallingPaused } from "../redis";
import { chainDialable } from "./recipe";
import { startMapper, mapperState, stopMapper } from "./mapper";
import { storeForChain } from "./trainer-batch";
import { placeNavCall, getNavSession, defaultWorkflowAsk, NavStep } from "./navigator";
import { judgeVoice } from "./listen-nav";
import { proposeVersion, pathSignature, reportUnknown, rememberedMenuLines, type MapRecipe } from "./mapgraph";
import { recipeFromCall, evidenceFromCall, CapturedStep } from "./map-capture";

/** Hard ceiling on calls in one sweep — the runaway guard. Tune without a deploy via the
 *  "sweep_max_calls" setting. */
const DEFAULT_MAX_CALLS = 250;
/** Seconds between chains — politeness, and it keeps concurrency at one live call. */
const GAP_SEC = 20;
/** How long we WAIT on a single proving call — past the call's own 165s ceiling, so a slow
 *  menu's late proof is read instead of abandoned mid-call (round-3 item 6). */
const PROVE_MAX_SEC = 180;

/** East → west, the owner's dialing order. A chain is queued by the EASTERNMOST timezone it has
 *  stores in, so Wegmans and Publix get the 9am slot and Fry's and Gelson's come up later, while
 *  national chains (stores in every zone) sort east and simply dial whichever store is open. */
const TZ_RANK: Record<string, number> = {
  "America/New_York": 0, "America/Detroit": 0, "America/Toronto": 0,
  "America/Chicago": 1, "America/Winnipeg": 1,
  "America/Denver": 2, "America/Phoenix": 2, "America/Boise": 2,
  "America/Los_Angeles": 3, "America/Vancouver": 3,
  "America/Anchorage": 4, "Pacific/Honolulu": 5,
};
const rankOf = (tz: string | null | undefined) => TZ_RANK[tz || "America/Chicago"] ?? 1;

export interface SweepItem {
  chainId: number; chain: string; rank: number;
  mode: "map" | "prove-direct";
  status: "queued" | "calling" | "done" | "skipped" | "failed";
  outcome?: string; seconds?: number | null; calls: number;
}
interface SweepState {
  running: boolean; stop: boolean; startedAt: number; updatedAt: number;
  calls: number; maxCalls: number; current: string;
  items: SweepItem[];
}
const state: SweepState = {
  running: false, stop: false, startedAt: 0, updatedAt: 0,
  calls: 0, maxCalls: DEFAULT_MAX_CALLS, current: "", items: [],
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sweepStatus() {
  const done = state.items.filter((i) => i.status === "done").length;
  const left = state.items.filter((i) => i.status === "queued").length;
  return { ...state, done, left, items: state.items.slice(0, 200) };
}
export function stopSweep() {
  if (!state.running) return { ok: false, error: "not running" };
  state.stop = true;
  const live = state.items.find((i) => i.status === "calling");
  if (live) stopMapper(live.chainId);
  return { ok: true, stopping: true };
}

/** Build the queue: every chain we actually dial, east first, unmapped and low-confidence first
 *  inside each timezone band. `mode` decides which lane a chain runs in. */
export async function buildQueue(): Promise<SweepItem[]> {
  const rows = await db.select().from(chains);
  const dialable = rows.filter((ch) => chainDialable(ch));
  const items: SweepItem[] = [];
  for (const ch of dialable) {
    const stores = await db.select({ tz: retailers.timezone })
      .from(retailers).where(and(eq(retailers.chainId, ch.id), eq(retailers.active, true))).limit(2000);
    if (!stores.length) continue;                       // no stores on file = nothing to call
    const rank = Math.min(...stores.map((s) => rankOf(s.tz)));
    const direct = ch.ringsDirect === true || ch.answerPath === "direct_human";
    items.push({
      chainId: ch.id, chain: ch.name, rank,
      mode: direct ? "prove-direct" : "map",
      status: "queued", calls: 0,
    });
  }
  // Inside a timezone band: prove the "answers direct" claims first (they are the cheapest calls and
  // the biggest risk — a wrong one wastes the paid agent on a recording), then unmapped chains, then
  // re-verify the mapped ones.
  const weight = (i: SweepItem) => (i.mode === "prove-direct" ? 0 : 1);
  return items.sort((a, b) => a.rank - b.rank || weight(a) - weight(b) || a.chain.localeCompare(b.chain));
}

/** ONE proving call to a chain we believe answers directly. If a person says hello, the direct claim
 *  is now EVIDENCE instead of an assumption. If a recording answers, the chain has a menu we never
 *  mapped — it gets flagged and handed to the normal mapping lane. (The old listen-first mode is
 *  deleted — the learn walk itself sits quiet while a recording talks and answers when asked, which
 *  is everything listen-first did.) */
async function proveDirect(item: SweepItem): Promise<void> {
  const store = await storeForChain(item.chainId, [], true);
  if (!store) { item.status = "skipped"; item.outcome = "no store open right now. Will come round again."; return; }
  const ask = await defaultWorkflowAsk();
  const placed = await placeNavCall(
    item.chainId, store.id, store.name, store.phone,
    undefined, undefined, undefined, undefined,
    { product: "Pokémon cards" },
    // The sweep folds its own result below (it decides direct-vs-menu from what it hears), so `finish`
    // must not fold it a second time.
    // The stage marks this as a RUN's check: the carrier-end path stamps the chain's mapping status
    // only for un-staged calls, so a proving call can never leave "review" behind on its way past.
    { askVoiceId: ask.voiceId, askText: ask.text, callerRecords: true, stage: "map",
      knownMenuLines: await rememberedMenuLines(item.chainId, store.id) },
  );
  if (placed.error || !placed.id) { item.status = "failed"; item.outcome = "the call never connected"; return; }
  state.calls++; item.calls++;
  const deadline = Date.now() + PROVE_MAX_SEC * 1000;
  let s = getNavSession(placed.id);
  while (Date.now() < deadline) {
    s = getNavSession(placed.id);
    if (!s || s.status === "human" || s.status === "done" || s.status === "failed") break;
    await sleep(3000);
  }
  const steps = (s?.steps || []) as CapturedStep[];
  // THE GRADE IS THE GATE. A failed check changes NOTHING — this call used to fold evidence,
  // re-score confidence, auto-activate versions and stamp the chain row whatever its grade (the
  // round-2 audit's biggest surviving break). Now only a check that earned its way in may write;
  // a failed one leaves nothing but its own line in the sweep's list, and the chain comes round
  // again on a later sweep.
  if (s?.grade !== "pass") {
    item.status = "done";
    item.outcome = s?.failReason ? `failed: ${s.failReason} — changed nothing` : "nobody answered — changed nothing";
    return;
  }
  // A MENU asks you to choose. A GREETING just talks at you and hands you on — "thank you for calling
  // Barnes & Noble", then hold music, then a person. Both mean the chain is not "direct", but they
  // need completely different handling, and having only one word for them is what put the paid agent
  // on the line talking to a recording (owner 07-27).
  // WHO SAID IT IS THE JUDGE'S ANSWER, NOT A LENGTH TEST HERE (fix pass 5). Staff's hello and their
  // answer about the cards are long lines of speech; measured by length they read as the store's own
  // recording, which made a passing DIRECT chain look like a chain with a recording in front of it
  // and could put a bogus route live. Every line is put to the one judge, with this store's
  // remembered menu behind it, and only lines it calls a RECORDING count.
  const known = await rememberedMenuLines(item.chainId, store.id);
  const isRecording = (st: CapturedStep) => st.who === "ivr" && String(st.text || "").trim()
    && judgeVoice({
      text: String(st.text), atSec: st.atSec ?? 0, knownMenuLines: known,
      ringsHeard: typeof s?.humanAtSec === "number" && (st.atSec ?? 0) >= s.humanAtSec ? 1 : 0,
      pauseTested: true, keptTalkingAfterPause: String(st.text).trim().split(/\s+/).length > 14,
      product: "Pokémon cards",
    }).who === "recording";
  const heardMenu = steps.some((st) => isRecording(st) && /press \d|para español|main menu|for .{3,30}, press|say the name|automated/i.test(String(st.text || "")));
  const heardRecording = steps.some((st) => isRecording(st));
  const reached = !!(s && (s.status === "human" || s.humanAtSec != null || s.confirmResult === "answered"));
  // "Did we act on a menu" must not count the product QUESTION — the ask is scaffolding, said on
  // every call, person or menu alike. Counting it made every passing direct call read as a menu walk,
  // which false-flagged every direct chain forever (round-3 item 2).
  const acted = steps.some((st) => st.who === "us" && (st.action === "press" || st.action === "say")
    && !String(st.text || "").startsWith("asked:"));

  // Nothing to press, but a recording answered and a person came later: the third shape. It gets its
  // own route type so the runtime knows to WAIT rather than treating pickup as a person.
  if (!heardMenu && !acted && reached && (heardRecording || s?.transferAtSec != null)) {
    const recipe: MapRecipe = {
      type: "greeting", steps: [], seconds: s?.humanAtSec ?? 0,
      menuPrompts: steps.filter((st) => st.who === "ivr" && st.text).slice(0, 3).map((st) => String(st.text).slice(0, 240)),
    };
    const call = evidenceFromCall({
      navId: placed.id, storeId: store.id, storeName: store.name, steps,
      seconds: s?.humanAtSec ?? null, reachedHuman: true, path: pathSignature(recipe),
      greeting: s?.greeting, transferAtSec: s?.transferAtSec ?? null, note: "direct proving call",
    });
    await proposeVersion({
      chainId: item.chainId, recipe, source: "sweep", call,
      why: "A recording answers, then hands you to Staff. Nothing to press, and nobody is there at pickup.",
    });
    item.status = "done";
    item.outcome = `a recording answers, person at ${s?.humanAtSec ?? "?"}s — not direct, and nothing to press`;
    item.seconds = s?.humanAtSec ?? null;
    await reportUnknown({
      chainId: item.chainId, kind: "greeting-not-direct",
      prompt: `Marked "answers directly" but a recording answers first and a person arrives at ${s?.humanAtSec ?? "?"}s`,
      evidence: { navId: placed.id, storeId: store.id, storeName: store.name, transferAtSec: s?.transferAtSec ?? null },
    });
    return;
  }

  if (heardMenu || acted) {
    // The "direct" claim is wrong — there IS something in front of the human. The whole label
    // clears (ringsDirect AND answerPath — half a stamp left the mapper refusing the very chain the
    // sweep was handing it, and the loop never ended), and a LOCKED chain keeps its status: the
    // finding queues mapping, it never downgrades a working map.
    item.status = "done";
    item.outcome = "has a recording or menu. Queued for mapping.";
    await reportUnknown({
      chainId: item.chainId, kind: "wrongly-direct",
      prompt: `Marked "answers directly" but a recording answered: ${steps.find((st) => st.who === "ivr")?.text?.slice(0, 160) || "menu heard"}`,
      evidence: { navId: placed.id, storeId: store.id, storeName: store.name },
    });
    const cur = (await db.select({ navStatus: chains.navStatus }).from(chains).where(eq(chains.id, item.chainId)))[0];
    await db.update(chains).set({
      ringsDirect: false, answerPath: null,
      ...(cur?.navStatus === "locked" ? {} : { navStatus: "review" }),
    }).where(eq(chains.id, item.chainId));
    item.mode = "map";
    await runMapping(item);                       // straight into the mapping lane on the same pass
    return;
  }
  if (reached) {
    const recipe: MapRecipe = recipeFromCall(steps, s?.humanAtSec ?? null);
    const call = evidenceFromCall({
      navId: placed.id, storeId: store.id, storeName: store.name, steps,
      seconds: s?.humanAtSec ?? null, reachedHuman: true, path: pathSignature(recipe), note: "direct proving call",
    });
    await proposeVersion({ chainId: item.chainId, recipe: { ...recipe, type: "direct", steps: [] }, source: "sweep", call, why: "Proved: Staff answer with no menu" });
    item.status = "done"; item.outcome = `person answered directly at ${s?.humanAtSec ?? "?"}s — proved`; item.seconds = s?.humanAtSec ?? null;
    return;
  }
  // A passing check that fit none of the shapes above (reached nobody would have failed the grade
  // gate) — say so plainly and write nothing; the claim stays unproven until a check proves it.
  item.status = "done";
  item.outcome = "the direct claim is still unproven — changed nothing";
}

/** Hand the chain to the existing mapper and wait for it to finish. The mapper owns the calling; the
 *  sweep only owns whose turn it is. */
async function runMapping(item: SweepItem): Promise<void> {
  const started = await startMapper(item.chainId);
  if (started.error) { item.status = "skipped"; item.outcome = started.error; return; }
  item.status = "calling";
  while (!state.stop) {
    await sleep(5000);
    const run = mapperState().runs.find((r) => r.chainId === item.chainId);
    if (!run) break;
    item.calls = run.attempt;
    if (!run.running) {
      // A run that stopped because every store was CLOSED has not failed — it has not been tried.
      // Marking it failed kept pass 2 from ever coming back to it as the country woke up further west.
      const closedOut = /open hours|stores are open|closed/i.test(run.stopReason || "");
      item.status = run.phase === "locked" ? "done" : (closedOut ? "skipped" : (run.phase === "stopped" ? "failed" : "done"));
      item.outcome = run.stopReason || run.phase;
      item.seconds = run.best?.seconds ?? null;
      state.calls += run.attempt;
      return;
    }
    if (state.calls + run.attempt >= state.maxCalls) { stopMapper(item.chainId); item.outcome = "sweep call budget reached"; item.status = "done"; return; }
  }
}

/** Start the sweep. Fire-and-forget; poll sweepStatus(). */
export async function startSweep(opts: { maxCalls?: number; only?: number[] } = {}): Promise<{ started?: boolean; error?: string; queued?: number }> {
  if (state.running) return { error: "a sweep is already running" };
  if (await isCallingPaused()) return { error: "calling is paused (global kill-switch)" };
  const configured = Number((await getSetting("sweep_max_calls")) || 0);
  state.maxCalls = Math.max(1, opts.maxCalls || configured || DEFAULT_MAX_CALLS);
  let queue = await buildQueue();
  if (opts.only?.length) { const keep = new Set(opts.only); queue = queue.filter((i) => keep.has(i.chainId)); }
  if (!queue.length) return { error: "nothing to sweep" };
  Object.assign(state, { running: true, stop: false, startedAt: Date.now(), updatedAt: Date.now(), calls: 0, current: "", items: queue });
  await setSetting("sweep_last_started", String(Math.floor(Date.now() / 1000)));

  (async () => {
    // Two passes: the first walks the queue in order; the second picks up chains that were skipped
    // because every store was still closed — by then the country has woken up further west.
    for (let pass = 0; pass < 2 && !state.stop; pass++) {
      for (const item of state.items) {
        if (state.stop) break;
        if (state.calls >= state.maxCalls) { state.current = "call budget spent"; break; }
        if (item.status !== "queued" && !(pass === 1 && item.status === "skipped" && /right now|closed/i.test(item.outcome || ""))) continue;
        if (await isCallingPaused()) { state.current = "calling paused"; state.stop = true; break; }
        item.status = "queued";
        state.current = item.chain; state.updatedAt = Date.now();
        try {
          if (item.mode === "prove-direct") await proveDirect(item);
          else await runMapping(item);
        } catch (e) {
          item.status = "failed"; item.outcome = "engine error: " + String(e).slice(0, 120);
        }
        state.updatedAt = Date.now();
        await sleep(GAP_SEC * 1000);
      }
    }
    state.running = false; state.current = ""; state.updatedAt = Date.now();
  })().catch(() => { state.running = false; });

  return { started: true, queued: queue.length };
}

export const _test = { rankOf, TZ_RANK };

// THE SELF-HEALING LOOP (owner rounds R2 + R3, docs/specs/mapping-admin/build-contract.md).
//
// A store's phone menu changes. The next customer check walks a route that no longer exists, hears
// words we have never heard, and gets nobody. Before this, that store kept taking checks and kept
// failing them, and somebody had to notice. The owner reviews NOTHING: the store takes itself off
// the website, files ONE job to be re-mapped, and puts itself back when the re-map succeeds.
//
// EVERYTHING HERE IS EXISTING PIECES WIRED TOGETHER. Nothing new was built where something already
// did the job:
//   the filing + the pooling   `reportUnknown` (mapgraph) already folds repeat hearings of the same
//                              greeting into ONE open row per store, counting them. That row IS the
//                              re-map job — there is no second queue.
//   the re-map itself          `startMapper(chainId, { storeId })` — the same run the owner's Map
//                              button starts, inside the same daily cap.
//   the history line           `recordObservation` — what the chain page already reads.
//   closing the job            `resolveUnknown` — the same call the map already uses.
//   the chain's fast route     the chain row's own shortcut columns — clearing them is what makes a
//                              check fall back to the careful full-words way, with no new switch.
//
// THE MUTE IS PER SIDE AND NEVER SYNCS (owner, 08-02). A store mutes itself on whichever side the
// failing check ran, and heals itself there. store-sync.ts pushes staging → production for data a
// person curates; this is earned by a real check failing, so syncing it would let a push from
// staging — where nothing is muted — quietly un-mute live stores.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { retailers, chains } from "../db/schema";
import { getSetting } from "../db/settings";
import { activeMap, rememberedMenuLines, reportUnknown, resolveUnknown, recordObservation, openUnknowns, sameMenu } from "./mapgraph";
import { sameSpokenLine } from "./listen-nav";

/** The reason a store took itself off the website. One string, in the words the screens already use
 *  ("Menu changed" is the flag; this is the sentence under it). Never invented per call site. */
export const MENU_CHANGED = "menu changed";

/** How many stores of one chain on the SAME new menu makes it the CHAIN's menu, not one store's
 *  (owner R2). The same three the map already uses to move a chain's route. */
export const STORES_TO_MOVE_CHAIN = 3;

/** Take one store off the website. Off the consumer list, no checks placed, skipped by zone runs and
 *  auto checks — every one of those reads this same flag, so there is one switch, not five. */
export async function muteStore(storeId: number, reason: string): Promise<void> {
  await db.update(retailers)
    .set({ muted: true, mutedReason: reason.slice(0, 120), mutedAt: Math.floor(Date.now() / 1000) })
    .where(eq(retailers.id, storeId));
}

/** Put it back. Called by the healing run when a re-map succeeds, and by the owner's own Unmute. */
export async function unmuteStore(storeId: number): Promise<void> {
  await db.update(retailers)
    .set({ muted: false, mutedReason: null, mutedAt: null })
    .where(eq(retailers.id, storeId));
}

/** Is this store reachable right now? The ONE question every other path asks (R3). */
export async function storeIsMuted(storeId: number): Promise<boolean> {
  const r = (await db.select({ muted: retailers.muted }).from(retailers).where(eq(retailers.id, storeId)))[0];
  return !!r?.muted;
}

/** The muted ones out of a list of stores, in one read — for the paths that hold many stores at once
 *  (a zone run, the consumer list) so they never ask store by store. */
export async function mutedAmong(storeIds: number[]): Promise<Set<number>> {
  if (!storeIds.length) return new Set();
  const rows = await db.select({ id: retailers.id, muted: retailers.muted, reason: retailers.mutedReason })
    .from(retailers).where(inArray(retailers.id, storeIds));
  return new Set(rows.filter((r) => r.muted).map((r) => r.id));
}

/** Muted stores with their reason, for the paths that have to SAY why (a zone run's skip). */
export async function mutedReasons(storeIds: number[]): Promise<Map<number, string>> {
  if (!storeIds.length) return new Map();
  const rows = await db.select({ id: retailers.id, muted: retailers.muted, reason: retailers.mutedReason })
    .from(retailers).where(inArray(retailers.id, storeIds));
  return new Map(rows.filter((r) => r.muted).map((r) => [r.id, r.reason || MENU_CHANGED]));
}

/** DID THIS CHECK MEET A MENU WE DO NOT KNOW? The store's own remembered lines are the whole test —
 *  the same comparison the fingerprint and the earpiece both use, never a second opinion. A store
 *  with nothing on file cannot have met an unknown menu: it has no known menu to be unlike. */
export function metAnUnknownMenu(heard: string[], remembered: string[]): string | null {
  const known = (remembered || []).filter((l) => String(l || "").trim());
  if (!known.length) return null;
  for (const line of heard || []) {
    const t = String(line || "").trim();
    if (!t) continue;
    if (known.some((k) => sameSpokenLine(k, t))) return null;  // we are on the menu we know
  }
  const first = (heard || []).map((l) => String(l || "").trim()).find(Boolean);
  return first ? first.slice(0, 200) : null;
}

/** A CHECK MET A MENU WE DO NOT KNOW. The store takes itself off the website, joins "Menu changed",
 *  and files ONE job. More failures at the same store pool into that same job: `reportUnknown` folds
 *  a repeat hearing of the same greeting into the row that already exists, so this is safe to call
 *  as often as the store fails. Returns what it did, for the log. */
export async function storeMetUnknownMenu(o: {
  chainId: number; storeId: number; greeting: string; callId?: number; navId?: string; storeName?: string;
}): Promise<{ muted: boolean; filed: boolean }> {
  if (!o.chainId || !o.storeId) return { muted: false, filed: false };
  const was = await storeIsMuted(o.storeId);
  if (!was) await muteStore(o.storeId, MENU_CHANGED);
  await reportUnknown({
    chainId: o.chainId, storeId: o.storeId, kind: "menu-changed",
    prompt: o.greeting.slice(0, 200),
    evidence: { callId: o.callId, navId: o.navId, storeName: o.storeName, mutedItself: true },
  });
  return { muted: !was, filed: true };
}

/** THE ONE HISTORY LINE a healed store writes on its chain page. One place, so the words on the
 *  screen and the words in the closed filing can never drift apart. */
export const HEALED_LINE = "menu changed, re-mapped successfully, unmuted and back online";

/** Every open "menu changed" filing, typed. `openUnknowns` hands back loose rows; this is the one
 *  place that reads them, so nothing else has to know their shape. */
async function filedMenuChanges(): Promise<Array<{ id: number; chainId: number; storeId: number; greeting: string; heardCount: number }>> {
  const rows = await openUnknowns(200);
  return rows
    .filter((r) => String(r.kind) === "menu-changed")
    .map((r) => ({
      id: Number(r.id), chainId: Number(r.chainId || 0), storeId: Number(r.storeId || 0),
      greeting: String(r.prompt || ""), heardCount: Number(r.count || 1),
    }))
    .filter((r) => r.chainId > 0);
}

/** THE JOBS WAITING: one per store that took itself off the website. THE MUTED STORE IS THE JOB —
 *  there is no second queue and no per-store row to keep in step, so "however many times it fails,
 *  there is one job" is true by construction rather than by bookkeeping. The filed greeting rides
 *  along when we have it: `reportUnknown` folds repeat hearings of the SAME greeting into one row
 *  per chain (that fold is what proves several stores are on the same new menu), so it is read as
 *  the chain's evidence, never as the list of jobs. */
export async function remapJobs(limit = 50): Promise<Array<{ chainId: number; storeId: number; storeName: string; greeting: string; since: number }>> {
  const rows = await db.select().from(retailers).where(eq(retailers.muted, true));
  const filed = await filedMenuChanges();
  const out: Array<{ chainId: number; storeId: number; storeName: string; greeting: string; since: number }> = [];
  for (const r of rows) {
    if (!r.chainId) continue;
    const g = filed.find((f) => f.storeId === r.id) ?? filed.find((f) => f.chainId === r.chainId);
    out.push({ chainId: r.chainId, storeId: r.id, storeName: r.name, greeting: g?.greeting || "", since: r.mutedAt || 0 });
    if (out.length >= limit) break;
  }
  return out;
}

/** THE RE-MAP SUCCEEDED. The store goes back on the website, leaves the list, and the chain page
 *  gets ONE line of history. No new status word anywhere: the re-map check itself is an ordinary
 *  mapping check and shows under the header it already has. */
export async function remapSucceeded(chainId: number, storeId: number): Promise<void> {
  await unmuteStore(storeId);
  for (const u of await filedMenuChanges()) {
    if (u.storeId === storeId) await resolveUnknown(u.id, "resolved", HEALED_LINE);
  }
  await recordObservation({
    chainId, storeId, kind: "verify",
    expected: MENU_CHANGED, observed: HEALED_LINE,
    drift: false,
  });
}

/** THREE STORES OF ONE CHAIN ON THE SAME NEW MENU = THE CHAIN'S menu changed, not one store's.
 *  THE SAME-MENU HALF IS ALREADY PROVED before we get here: `reportUnknown` folds a hearing into an
 *  existing filing only when the greeting matches the one on it, the way the fingerprint compares —
 *  so stores that filed against one chain-level row are, by that fold, on the same new menu. What is
 *  left to count is how many of that chain's stores are currently off the website. */
export async function storesOnTheSameNewMenu(chainId: number): Promise<number[]> {
  const rows = await db.select({ id: retailers.id, chainId: retailers.chainId, muted: retailers.muted })
    .from(retailers).where(eq(retailers.chainId, chainId));
  const off = rows.filter((r) => r.muted).map((r) => r.id);
  return off.length >= STORES_TO_MOVE_CHAIN ? off : [];
}

/** THE CHAIN'S MENU CHANGED, not one store's. The chain is NEVER muted (owner R2): its fast route is
 *  set aside, so every check falls back to the careful full-words way — which still works on a menu
 *  nobody has seen — and one re-map run relearns the fast route. Nothing new decides this: clearing
 *  the chain's own shortcut is exactly what makes the runtime stop using it. */
export async function setChainFastRouteAside(chainId: number, agreeing: number[]): Promise<void> {
  await db.update(chains)
    .set({ dtmfShortcut: null, navStatus: "attempted", navUpdatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(chains.id, chainId));
  await recordObservation({
    chainId, kind: "unknown",
    expected: "the route we hold", observed: `${agreeing.length} stores on the same new menu — the fast way is set aside until one re-map relearns it`,
    drift: true, detail: { stores: agreeing },
  });
}

/** The daily cap the mapper already runs under — healing dials live inside it (owner R2, item 7),
 *  never beside it. Same setting, same counter, read the same way. */
export async function healingDialsLeft(chainId: number): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const used = Number((await getSetting(`mapper_calls:${chainId}:${today}`)) || 0);
  const cap = Number((await getSetting("mapper_daily_cap")) || 0) || 60;
  return Math.max(0, cap - used);
}

/** THE HEALING RUN. Take the jobs waiting, and for each one start THE SAME mapping run the owner's
 *  Map button starts, pinned to that store — never a second kind of run and never a new status word:
 *  what it produces is an ordinary mapping check under the header it already has. Dials come out of
 *  the mapper's own daily cap, so healing can never spend beside it (owner, item 7).
 *
 *  Started by hand or by whatever already schedules work; nothing here watches or polls on its own.
 *  Returns what it started, so the caller can log it. */
export async function healOnce(opts: { limit?: number } = {}): Promise<Array<{ storeId: number; chainId: number; started: boolean; why?: string }>> {
  const jobs = await remapJobs(opts.limit ?? 10);
  const out: Array<{ storeId: number; chainId: number; started: boolean; why?: string }> = [];
  const startedChains = new Set<number>();
  for (const j of jobs) {
    if (startedChains.has(j.chainId)) { out.push({ ...j, started: false, why: "a run for this chain is already going" }); continue; }
    if ((await healingDialsLeft(j.chainId)) <= 0) { out.push({ ...j, started: false, why: "the day's calls are spent" }); continue; }
    // THE CHAIN'S OWN MENU MOVED, not this one store's: set the fast way aside first, so the re-map
    // and every check in the meantime walk the careful full words instead of a route that is gone.
    const agree = await storesOnTheSameNewMenu(j.chainId);
    if (agree.length) await setChainFastRouteAside(j.chainId, agree);
    const { startMapper } = await import("./mapper");
    const r = await startMapper(j.chainId, { storeId: j.storeId });
    startedChains.add(j.chainId);
    out.push({ storeId: j.storeId, chainId: j.chainId, started: !!r.started, why: r.error });
  }
  return out;
}

/** Every chain that currently has a store off the website, for the chains list's red alert icon and
 *  its "Menu changed" choice. The list empties itself: a chain leaves it when its last store heals. */
export async function chainsWithAMenuChange(): Promise<Set<number>> {
  const rows = await db.select({ chainId: retailers.chainId, muted: retailers.muted }).from(retailers);
  return new Set(rows.filter((r) => r.muted && r.chainId).map((r) => r.chainId as number));
}

/** Is this chain's route the careful full-words way right now because its menu changed? Read by the
 *  chains list; the fast route being set aside is what the runtime already acts on. */
export async function chainFastRouteIsAside(chainId: number): Promise<boolean> {
  const ch = (await db.select({ navStatus: chains.navStatus }).from(chains).where(eq(chains.id, chainId)))[0];
  return ch?.navStatus === "attempted";
}

/** What a store heard, read off its own check, against what this store has played before. Used by
 *  the receipt hook so a customer check can mute its own store. */
export async function knownMenuFor(chainId: number, storeId: number): Promise<string[]> {
  try { return await rememberedMenuLines(chainId, storeId); } catch { return []; }
}

/** Does this chain hold a map at all? A chain we have never mapped cannot have a changed menu. */
export async function chainIsMapped(chainId: number): Promise<boolean> {
  try { return !!(await activeMap(chainId)); } catch { return false; }
}

// ---- THE MOMENT AN AUTO CHECK CANNOT RUN ------------------------------------------------------
// Somebody has a standing check on a store that has just taken itself off the website. The moment
// says who, which store, and why — and stops there. The email itself, and the sentence a customer
// reads, belong to another agent: nothing here writes, designs or sends one (owner, item 6).
export interface PausedAutoCheck { finderUserId: string; retailerId: number; storeName: string; reason: string; at: number }
type PausedWatcher = (m: PausedAutoCheck) => void;
const pausedWatchers: PausedWatcher[] = [];
/** Register the thing that owns the customer's email. Nothing is registered here on purpose. */
export function onAutoCheckPaused(fn: PausedWatcher): void { pausedWatchers.push(fn); }
/** Fire it. Best-effort by design: a listener that throws can never break the tick that fired it. */
export function autoCheckPaused(m: Omit<PausedAutoCheck, "at">): void {
  const full = { ...m, at: Math.floor(Date.now() / 1000) };
  for (const w of pausedWatchers) { try { w(full); } catch (e) { console.error("[healing] paused watcher", e); } }
}
/** For the tests, and for a health read: how many are listening. */
export function pausedWatcherCount(): number { return pausedWatchers.length; }

void and;

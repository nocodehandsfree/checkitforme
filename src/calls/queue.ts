// Check queue — the waiting-screen feed (owner ask 2026-07-16). Contract: docs/specs/queue-feed/CONTRACT.md.
//
// When the concurrency governor is ON and the pool is full, a single check does not fail — it QUEUES.
// The waiting screen polls a ticket for its PLACE IN LINE and a REAL ETA (seconds until it dials),
// computed from the live calls (how long each has run + expected length → when a slot frees). A 1s
// drainer places queued checks as slots free; the poll then returns the live call id so the page
// flips to the transcript. Governor OFF → none of this runs (checks place instantly, as today).
//
// This layer sits ABOVE the call functions: it never refactors triggerCall/bridgeCheckCall. It probes
// capacity (canPlaceNow, no acquire), and when a slot is free it calls the normal place function —
// which acquires + dials as always. Redis-backed (cross-replica) with an in-memory fallback for
// local/tests, same pattern as the governor.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { callResults } from "../db/schema";
import { redis } from "../redis";
import { getPolicy } from "../policy";
import { canPlaceNow, governorEnabled } from "./concurrency";

export type Lane = "direct" | "bridge" | "live";
export interface QueueArgs { retailerId: number; categoryId: number; categoryIds?: number[]; specificProduct?: string; finderUserId?: string; isPrivate?: boolean; kioskMode?: boolean; live?: boolean }
export interface Ticket {
  id: string; lane: Lane; priority: "interactive" | "batch"; userId?: string;
  args: QueueArgs; enqueuedAt: number;
  status: "queued" | "placed" | "error";
  providerCallId?: string; room?: string; wsHost?: string; error?: string;
}
const TTL_SEC = 300; // a ticket lives 5 min — an abandoned waiting screen self-expires

// ---- store: Redis (queue:t:<id> JSON + queue:pending zset) with in-memory fallback ----
const memT = new Map<string, { t: Ticket; exp: number }>();
const memZ = new Map<string, number>(); // id -> score
function memPrune() { const now = Date.now(); for (const [k, v] of memT) if (v.exp <= now) { memT.delete(k); memZ.delete(k); } }
const rankScore = (t: Ticket) => (t.priority === "interactive" ? 0 : 1) * 1e13 + t.enqueuedAt;

async function saveTicket(t: Ticket): Promise<void> {
  const r = redis();
  if (!r) { memT.set(t.id, { t, exp: Date.now() + TTL_SEC * 1000 }); return; }
  try { await r.set("queue:t:" + t.id, JSON.stringify(t), "EX", TTL_SEC); } catch { memT.set(t.id, { t, exp: Date.now() + TTL_SEC * 1000 }); }
}
async function loadTicket(id: string): Promise<Ticket | null> {
  const r = redis();
  if (!r) { memPrune(); return memT.get(id)?.t ?? null; }
  try { const s = await r.get("queue:t:" + id); return s ? (JSON.parse(s) as Ticket) : null; } catch { memPrune(); return memT.get(id)?.t ?? null; }
}
async function addPending(t: Ticket): Promise<void> {
  const r = redis();
  if (!r) { memZ.set(t.id, rankScore(t)); return; }
  try { await r.zadd("queue:pending", rankScore(t), t.id); await r.pexpire("queue:pending", 30 * 60_000); } catch { memZ.set(t.id, rankScore(t)); }
}
async function removePending(id: string): Promise<void> {
  const r = redis();
  if (!r) { memZ.delete(id); return; }
  try { await r.zrem("queue:pending", id); } catch { memZ.delete(id); }
}
/** Pending ticket ids in SERVICE ORDER (interactive first, then batch; FIFO within each). */
async function pendingIds(): Promise<string[]> {
  const r = redis();
  if (!r) { memPrune(); return [...memZ.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id); }
  try { return await r.zrange("queue:pending", 0, -1); } catch { memPrune(); return [...memZ.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id); }
}

// ---- expected call length: rolling avg of recent finished calls (clamped), cached 10s ----
let expCache: { at: number; s: number } | null = null;
async function expectedCallSeconds(): Promise<number> {
  if (expCache && Date.now() - expCache.at < 10_000) return expCache.s;
  const maxCall = (await getPolicy()).bail.maxCallSeconds || 180;
  let s = 75; // fallback before we have history
  try {
    const rows = await db.select({ cs: callResults.callSeconds }).from(callResults)
      .where(eq(callResults.status, "completed")).orderBy(desc(callResults.startedAt)).limit(50);
    const vals = rows.map((r) => r.cs).filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length >= 5) s = vals.reduce((a, b) => a + b, 0) / vals.length;
  } catch { /* keep fallback */ }
  s = Math.min(Math.max(Math.round(s), 20), maxCall);
  expCache = { at: Date.now(), s };
  return s;
}

/** Real ETA: event-simulate the live calls freeing their slots, serve `pos0` tickets ahead, read off
 *  the second a slot is free for this position. pos0 = number of tickets served before this one. */
async function etaSeconds(pos0: number, priority: "interactive" | "batch"): Promise<number> {
  const S = await expectedCallSeconds();
  const cap = (await canPlaceNow(priority)).totalCap;
  const pol = await getPolicy();
  const reserve = pol.concurrency?.reserveInteractive ?? 2;
  const effCap = Math.max(1, priority === "interactive" ? cap : cap - reserve); // never 0 → no NaN ETA on a degenerate cap
  const now = Date.now();
  const live = await db.select({ startedAt: callResults.startedAt }).from(callResults)
    .where(inArray(callResults.status, ["dialing", "in_progress"]));
  // Remaining seconds for each occupied slot; the soonest effCap of them are what gate this ticket.
  const remaining = live.map((l) => Math.max(0, Math.min(S, S - (now / 1000 - (l.startedAt ?? now / 1000))))).sort((a, b) => a - b);
  const slots: number[] = remaining.slice(0, effCap);
  while (slots.length < effCap) slots.push(0); // free slots free right now
  // Serve pos0 tickets ahead: each takes the earliest slot and holds it S more seconds.
  for (let k = 0; k < pos0; k++) { slots.sort((a, b) => a - b); slots[0] = slots[0] + S; }
  slots.sort((a, b) => a - b);
  return Math.round(slots[0]);
}

/** Position (1-based) + eta for a ticket, from the current queue. */
async function feedFor(t: Ticket): Promise<{ position: number; etaSeconds: number }> {
  const ids = await pendingIds();
  const tickets = (await Promise.all(ids.map(loadTicket))).filter((x): x is Ticket => !!x && x.status === "queued");
  const inter = tickets.filter((x) => x.priority === "interactive");
  const batch = tickets.filter((x) => x.priority === "batch");
  let pos0: number;
  if (t.priority === "interactive") pos0 = inter.findIndex((x) => x.id === t.id);
  else pos0 = inter.length + batch.findIndex((x) => x.id === t.id);
  if (pos0 < 0) pos0 = 0;
  return { position: pos0 + 1, etaSeconds: await etaSeconds(pos0, t.priority) };
}

/** Enqueue a check that couldn't get a slot. Returns the queued response shape (CONTRACT §1). */
export async function enqueueCheck(args: QueueArgs, priority: "interactive" | "batch", lane: Lane): Promise<{ queued: true; ticketId: string; position: number; etaSeconds: number; pollEveryMs: number }> {
  const id = "q_" + Math.random().toString(36).slice(2, 10);
  const t: Ticket = { id, lane, priority, userId: args.finderUserId, args, enqueuedAt: Date.now(), status: "queued" };
  await saveTicket(t);
  await addPending(t);
  const f = await feedFor(t);
  return { queued: true, ticketId: id, position: f.position, etaSeconds: f.etaSeconds, pollEveryMs: 1000 };
}

/** Poll a ticket (CONTRACT §2). The 1s heartbeat the waiting screen calls. */
export async function ticketStatus(ticketId: string): Promise<Record<string, unknown>> {
  const t = await loadTicket(ticketId);
  if (!t) return { status: "gone" };
  if (t.status === "placed") return { status: "dialing", providerCallId: t.providerCallId, room: t.room ?? null, wsHost: t.wsHost ?? null };
  if (t.status === "error") return { status: "error", error: t.error || "could not place the call" };
  const f = await feedFor(t);
  return { status: "queued", position: f.position, etaSeconds: f.etaSeconds };
}

// The place functions are injected by server.ts (avoids a queue→service import cycle). They return
// rich call-row objects; we only read these fields (providerCallId can be null on the row type).
// The live lane (bridgeStoreCall) reports failures as an { error } value rather than throwing, so a
// place fn may carry one — routeCheck/drain treat it like the endpoints do (a real dial error).
export interface PlaceResult { providerCallId?: string | null; room?: string | null; wsHost?: string | null; status?: string; error?: string }
type PlaceFn = (args: QueueArgs) => Promise<PlaceResult>;

/** Route a single check: place now if a slot is free, else queue. Governor OFF → always places
 *  (today's behavior). `placeFn` is the lane's real call function (triggerCall / bridgeCheckCall). */
export async function routeCheck(lane: Lane, placeFn: PlaceFn, args: QueueArgs): Promise<PlaceResult | { queued: true; ticketId: string; position: number; etaSeconds: number; pollEveryMs: number }> {
  if (!(await governorEnabled())) return placeFn(args); // ungoverned → straight through
  const probe = await canPlaceNow("interactive", args.finderUserId);
  if (probe.free) {
    try { const r = await placeFn(args); if (r.error !== "calls_busy") return r; /* else lost the race → queue */ }
    catch (e) { if (String((e as Error)?.message) !== "calls_busy") throw e; /* lost the race → fall through to queue */ }
  }
  return enqueueCheck(args, "interactive", lane);
}

let draining = false;
/** Drain the queue as slots free (1s tick, single-leader). Places queued checks in service order via
 *  the injected place functions; stores the resulting call id so the poll flips the page to live. */
export async function drainCheckQueue(placeDirect: PlaceFn, placeBridge: PlaceFn, placeLive?: PlaceFn): Promise<void> {
  if (draining || !(await governorEnabled())) return;
  draining = true;
  try {
    for (const id of await pendingIds()) {
      const t = await loadTicket(id);
      if (!t || t.status !== "queued") { await removePending(id); continue; }
      if (!(await canPlaceNow(t.priority, t.userId)).free) break; // pool full → stop this tick
      try {
        const place = t.lane === "live" ? (placeLive ?? placeBridge) : t.lane === "bridge" ? placeBridge : placeDirect;
        const r = await place(t.args);
        if (r.error === "calls_busy") break; // lost the race → retry next tick
        if (r.error) { t.status = "error"; t.error = r.error.slice(0, 200); } // a real dial error (store closed, paused…)
        else { t.status = "placed"; t.providerCallId = r.providerCallId ?? undefined; t.room = r.room ?? undefined; t.wsHost = r.wsHost ?? undefined; }
      } catch (e) {
        if (String((e as Error)?.message) === "calls_busy") break; // race lost → retry next tick
        t.status = "error"; t.error = String((e as Error)?.message || e).slice(0, 200);
      }
      await saveTicket(t);
      await removePending(id);
    }
  } finally { draining = false; }
}

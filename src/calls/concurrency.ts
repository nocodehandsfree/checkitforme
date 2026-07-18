// Call concurrency governor — the scale ceiling manager (owner ask 2026-07-16).
//
// THE PROBLEM: ElevenLabs concurrency is per-ACCOUNT (Creator ~10 simultaneous conversations),
// NOT per phone number. Customers' own numbers are caller-ID only — every call's AI still runs on
// our EL account(s). With no cap, a burst (a set-drop, or one big zone) fires past the ceiling and
// the overflow calls FAIL. This module makes overflow WAIT briefly instead of fail, keeps instant
// single checks ahead of batch zone sweeps, stops one user hogging the pool, and spreads load across
// a POOL of EL accounts so concurrency scales by adding cheap accounts (5 × Creator = ~50 at ~$110/mo).
//
// SAFE BY DEFAULT: gated by policy.concurrency.enabled (default OFF). Off → acquireCallSlot is a
// no-op that always grants the primary account = today's behavior, byte-identical. Nothing changes
// until the owner flips it after testing.
//
// LEAK-PROOF: every held slot is a ZSET member scored by its expiry (ttlSec). A crashed call can't
// leak a slot forever — the score expires and the slot frees itself. Explicit release() frees it
// instantly; the TTL is the backstop. Redis-backed so the count is correct across replicas; falls
// back to a per-instance in-memory count when REDIS_URL is unset (local/tests) — fail-OPEN, a
// governor blip must never block a paying call.
import { redis } from "../redis";
import { config } from "../config";
import { getPolicy } from "../policy";

export interface ElAccount {
  id: string;
  apiKey: string;
  agentId: string;
  carryAgentId?: string;
  phoneNumberId: string;
  cap: number; // EL concurrent-conversation limit for THIS account (Creator ~10)
}

export interface CallSlot {
  account: ElAccount;
  release: () => Promise<void>;
}

// ---- Account pool. EL_ACCOUNTS (JSON array) activates the pool; unset = the single primary account
// from config.voice, so today (one account) nothing changes. Each entry may override cap/agent/phone.
let poolCache: { at: number; pool: ElAccount[] } | null = null;
export function callAccounts(): ElAccount[] {
  if (poolCache && Date.now() - poolCache.at < 30_000) return poolCache.pool;
  const primary: ElAccount = {
    id: "primary", apiKey: config.voice.apiKey, agentId: config.voice.agentId,
    carryAgentId: config.voice.carryAgentId, phoneNumberId: config.voice.phoneNumberId,
    cap: 10,
  };
  let pool: ElAccount[] = [primary];
  const raw = process.env.EL_ACCOUNTS;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Array<Partial<ElAccount>>;
      const extra = arr.filter((a) => a.apiKey && a.phoneNumberId).map((a, i) => ({
        id: a.id || `acct${i + 1}`,
        apiKey: a.apiKey!, phoneNumberId: a.phoneNumberId!,
        agentId: a.agentId || config.voice.agentId,
        carryAgentId: a.carryAgentId || config.voice.carryAgentId,
        cap: a.cap && a.cap > 0 ? a.cap : 10,
      }));
      // Primary stays first; EL_ACCOUNTS can also restate primary's cap via id:"primary".
      const primaryOverride = extra.find((e) => e.id === "primary");
      if (primaryOverride) primary.cap = primaryOverride.cap;
      pool = [primary, ...extra.filter((e) => e.id !== "primary")];
    } catch (e) { console.error("[concurrency] bad EL_ACCOUNTS json:", e); }
  }
  poolCache = { at: Date.now(), pool };
  return pool;
}
export function primaryAccount(): ElAccount { return callAccounts()[0]; }

interface GovConfig { enabled: boolean; perAccountCap: number; reserveInteractive: number; maxPerUser: number; interactiveWaitMs: number; batchWaitMs: number }
async function govConfig(): Promise<GovConfig> {
  const c = (await getPolicy()).concurrency;
  return {
    enabled: !!c?.enabled,
    perAccountCap: c?.perAccountCap ?? 10,
    reserveInteractive: c?.reserveInteractive ?? 2,
    maxPerUser: c?.maxPerUser ?? 10,
    interactiveWaitMs: c?.interactiveWaitMs ?? 3000,
    batchWaitMs: c?.batchWaitMs ?? 20_000,
  };
}

// ---- Slot store: Redis ZSET (score = expiry ms) with in-memory fallback. Both prune-on-read so an
// expired (crashed-call) slot never counts. Same decision logic runs on either backend.
const mem = new Map<string, Map<string, number>>(); // key -> (member -> expiresAtMs)
function memPrune(key: string): Map<string, number> {
  const now = Date.now();
  let m = mem.get(key); if (!m) { m = new Map(); mem.set(key, m); }
  for (const [k, exp] of m) if (exp <= now) m.delete(k);
  return m;
}
async function count(key: string): Promise<number> {
  const r = redis();
  if (!r) return memPrune(key).size;
  try { const now = Date.now(); await r.zremrangebyscore("conc:" + key, 0, now); return await r.zcard("conc:" + key); }
  catch { return memPrune(key).size; } // fail-open
}
async function add(key: string, member: string, expiresAt: number): Promise<void> {
  const r = redis();
  if (!r) { memPrune(key).set(member, expiresAt); return; }
  try { await r.zadd("conc:" + key, expiresAt, member); await r.pexpire("conc:" + key, 30 * 60_000); }
  catch { memPrune(key).set(member, expiresAt); }
}
async function del(key: string, member: string): Promise<void> {
  const r = redis();
  if (!r) { memPrune(key).delete(member); return; }
  try { await r.zrem("conc:" + key, member); } catch { memPrune(key).delete(member); }
}
// Tiny key→value store (the hold record: which account+user a call took), so ANY replica can
// release a slot by the call's stable key even if the call finalizes on a different instance.
const memKV = new Map<string, { v: string; exp: number }>();
async function kvSet(key: string, v: string, ttlSec: number): Promise<void> {
  const r = redis();
  if (!r) { memKV.set(key, { v, exp: Date.now() + ttlSec * 1000 }); return; }
  try { await r.set("conc:" + key, v, "EX", ttlSec); } catch { memKV.set(key, { v, exp: Date.now() + ttlSec * 1000 }); }
}
async function kvGet(key: string): Promise<string | null> {
  const r = redis();
  if (!r) { const e = memKV.get(key); return e && e.exp > Date.now() ? e.v : null; }
  try { return await r.get("conc:" + key); } catch { const e = memKV.get(key); return e && e.exp > Date.now() ? e.v : null; }
}
async function kvDel(key: string): Promise<void> {
  const r = redis();
  if (!r) { memKV.delete(key); return; }
  try { await r.del("conc:" + key); } catch { memKV.delete(key); }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Acquire a live-call slot. `key` is the call's stable id (row id / providerCallId) — the slot is
 *  releasable by that key from ANY replica via releaseCallSlot(key). Returns the chosen account +
 *  a same-process release fn, or null if the pool stayed full past the wait budget (caller degrades
 *  gracefully — "busy, try again", never a hard crash). priority "interactive" (an instant single
 *  check) may use the whole pool; "batch" (a zone-sweep call) leaves `reserveInteractive` slots free
 *  so a sweep can never starve the magic instant check. */
export async function acquireCallSlot(opts: { key: string; priority: "interactive" | "batch"; userId?: string; ttlSec: number }): Promise<CallSlot | null> {
  const g = await govConfig();
  const pool = callAccounts();
  // Flag OFF → no governing at all: grant the primary account immediately (today's behavior).
  if (!g.enabled) return { account: pool[0], release: async () => {} };

  const totalCap = pool.reduce((s, a) => s + Math.min(a.cap, g.perAccountCap), 0);
  const batchCeiling = Math.max(0, totalCap - g.reserveInteractive);
  const deadline = Date.now() + (opts.priority === "interactive" ? g.interactiveWaitMs : g.batchWaitMs);
  const member = opts.key; // stable → cross-replica releasable
  const expiresAt = Date.now() + opts.ttlSec * 1000;

  for (;;) {
    // Per-user cap first (a zone can't hold more than maxPerUser of the pool at once).
    if (opts.userId) {
      const mine = await count("user:" + opts.userId);
      if (mine >= g.maxPerUser) { if (Date.now() >= deadline) return null; await sleep(250); continue; }
    }
    // Global ceiling (batch leaves the interactive reserve free).
    const perAcct = await Promise.all(pool.map((a) => count("acct:" + a.id)));
    const totalUsed = perAcct.reduce((s, n) => s + n, 0);
    const ceiling = opts.priority === "interactive" ? totalCap : batchCeiling;
    if (totalUsed >= ceiling) { if (Date.now() >= deadline) return null; await sleep(250); continue; }
    // Pick the least-loaded account that still has room.
    let bestIdx = -1, bestFree = -1;
    for (let i = 0; i < pool.length; i++) {
      const free = Math.min(pool[i].cap, g.perAccountCap) - perAcct[i];
      if (free > bestFree) { bestFree = free; bestIdx = i; }
    }
    if (bestIdx < 0 || bestFree <= 0) { if (Date.now() >= deadline) return null; await sleep(250); continue; }

    const acct = pool[bestIdx];
    await add("acct:" + acct.id, member, expiresAt);
    if (opts.userId) await add("user:" + opts.userId, member, expiresAt);
    await kvSet("hold:" + opts.key, JSON.stringify({ a: acct.id, u: opts.userId || "" }), opts.ttlSec);
    // Re-check we didn't overshoot the per-account cap in a race (two placers grabbing the last slot).
    if ((await count("acct:" + acct.id)) > Math.min(acct.cap, g.perAccountCap)) {
      await del("acct:" + acct.id, member); if (opts.userId) await del("user:" + opts.userId, member);
      await kvDel("hold:" + opts.key);
      if (Date.now() >= deadline) return null; await sleep(120); continue;
    }
    return { account: acct, release: () => releaseCallSlot(opts.key) };
  }
}

/** Free the slot a call took, by its stable key. Idempotent, cross-replica (reads the hold record).
 *  A missed release is not fatal — the ZSET member's expiry auto-frees it after ttlSec. */
export async function releaseCallSlot(key: string): Promise<void> {
  const rec = await kvGet("hold:" + key);
  if (!rec) return;
  try {
    const { a, u } = JSON.parse(rec) as { a: string; u: string };
    await del("acct:" + a, key);
    if (u) await del("user:" + u, key);
  } catch { /* malformed hold record — TTL will reap the ZSET member */ }
  await kvDel("hold:" + key);
}

/** Cheap capacity probe (NO acquire) — the queue uses this to decide place-vs-enqueue and the drainer
 *  uses it to decide when to release the next queued check. Mirrors acquireCallSlot's gates exactly:
 *  batch leaves the interactive reserve free; a user can't exceed maxPerUser. Governor OFF → always
 *  true (place immediately). Returns { free, totalUsed, totalCap } so callers can also show pool load. */
export async function canPlaceNow(priority: "interactive" | "batch", userId?: string): Promise<{ free: boolean; totalUsed: number; totalCap: number }> {
  const g = await govConfig();
  const pool = callAccounts();
  const totalCap = pool.reduce((s, a) => s + Math.min(a.cap, g.perAccountCap), 0);
  if (!g.enabled) return { free: true, totalUsed: 0, totalCap };
  if (userId && (await count("user:" + userId)) >= g.maxPerUser) return { free: false, totalUsed: -1, totalCap };
  const perAcct = await Promise.all(pool.map((a) => count("acct:" + a.id)));
  const totalUsed = perAcct.reduce((s, n) => s + n, 0);
  const ceiling = priority === "interactive" ? totalCap : Math.max(0, totalCap - g.reserveInteractive);
  return { free: totalUsed < ceiling, totalUsed, totalCap };
}

/** Is the governor's master switch on? (queue + drainer only run when true). */
export async function governorEnabled(): Promise<boolean> { return (await govConfig()).enabled; }

/** Live pool utilization — for the Admin readout and the load test. */
export async function concurrencyStatus() {
  const g = await govConfig();
  const pool = callAccounts();
  const accounts = await Promise.all(pool.map(async (a) => ({ id: a.id, used: await count("acct:" + a.id), cap: Math.min(a.cap, g.perAccountCap) })));
  const totalUsed = accounts.reduce((s, a) => s + a.used, 0);
  const totalCap = accounts.reduce((s, a) => s + a.cap, 0);
  return { enabled: g.enabled, reserveInteractive: g.reserveInteractive, maxPerUser: g.maxPerUser, accounts, totalUsed, totalCap };
}

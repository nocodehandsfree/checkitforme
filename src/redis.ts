// Shared Redis (Railway `redis` service, logical DB /1, `caller:` key prefix) — the cross-instance
// state layer that replaces the in-memory Maps once we run >1 app instance: rate limits,
// idempotency/dedupe, single-leader locks for the schedulers, and the spend kill-switch counters.
//
// Design rules:
// - LAZY + OPTIONAL: if REDIS_URL is unset (local/tests) every helper degrades to a safe default,
//   so the app and the test harness run with no Redis at all.
// - FAIL-OPEN for availability-sensitive paths (rate limit, dedupe) — a Redis blip must never block
//   a paying customer's call. FAIL-CLOSED is noted where correctness matters more (locks skip).
// - Nothing here connects at import time; the client is created on first use.
import Redis from "ioredis";

const PREFIX = "caller:";
let client: Redis | null = null;
let tried = false;

/** The shared client, or null when REDIS_URL is unset (degrade gracefully). Lazy singleton. */
export function redis(): Redis | null {
  if (tried) return client;
  tried = true;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false, // fail fast instead of buffering when Redis is down
    lazyConnect: false,
    keyPrefix: PREFIX,
  });
  client.on("error", (e) => console.error("[redis]", e?.message || e));
  return client;
}

export function redisEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

/** Fixed-window rate limit. Returns ok + retryAfter(s). Fails OPEN if Redis is down/unset. */
export async function rlCheck(bucket: string, id: string, windowMs: number, max: number): Promise<{ ok: boolean; retryAfter: number }> {
  const r = redis();
  if (!r) return { ok: true, retryAfter: 0 };
  const key = `rl:${bucket}:${id}`;
  try {
    const n = await r.incr(key);
    if (n === 1) await r.pexpire(key, windowMs);
    if (n > max) {
      const ttl = await r.pttl(key);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch (e) {
    console.error("[redis] rlCheck", e); return { ok: true, retryAfter: 0 }; // fail open
  }
}

/** Idempotency / dedupe gate: true the FIRST time a key is seen within ttl, false afterwards.
 *  Fails OPEN (returns true) if Redis is unavailable — callers needing hard idempotency must also
 *  carry a durable backstop (e.g. call_results.charged_at). */
export async function once(key: string, ttlSec: number): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  try {
    const res = await r.set(`once:${key}`, "1", "EX", ttlSec, "NX");
    return res === "OK";
  } catch (e) { console.error("[redis] once", e); return true; }
}

/** Single-leader lock: run `fn` only if this instance grabs the lock; otherwise skip (returns null).
 *  Used to stop the schedulers double-firing across instances. Fails OPEN with NO Redis (single
 *  instance assumption) but fails CLOSED on a Redis error (skip) to avoid duplicate calls/charges. */
export async function withLock<T>(name: string, ttlSec: number, fn: () => Promise<T>): Promise<T | null> {
  const r = redis();
  if (!r) return fn(); // no Redis = single instance, just run it
  const key = `lock:${name}`;
  let held = false;
  try {
    held = (await r.set(key, String(Date.now()), "EX", ttlSec, "NX")) === "OK";
  } catch (e) { console.error("[redis] withLock acquire", e); return null; } // error → skip (safe)
  if (!held) return null;
  try { return await fn(); }
  finally { try { await r.del(key); } catch { /* lock expires via TTL anyway */ } }
}

// ---- Spend kill-switch counters (IMPLEMENTATION_SPECS §2) ----
const spendKey = () => `spend:${new Date().toISOString().slice(0, 10)}`; // caller:spend:YYYY-MM-DD

/** Add cents to today's running spend (atomic). No-op without Redis. */
export async function incrSpendCents(cents: number): Promise<void> {
  const r = redis(); if (!r || cents <= 0) return;
  try { const k = spendKey(); const n = await r.incrby(k, Math.round(cents)); if (n === Math.round(cents)) await r.expire(k, 60 * 60 * 48); }
  catch (e) { console.error("[redis] incrSpendCents", e); }
}

/** Today's spend in cents (0 if unknown / no Redis). */
export async function spendTodayCents(): Promise<number> {
  const r = redis(); if (!r) return 0;
  try { return Number(await r.get(spendKey())) || 0; } catch { return 0; }
}

/** Manual / auto calling pause (the kill-switch flag). */
export async function isCallingPaused(): Promise<boolean> {
  const r = redis(); if (!r) return false;
  try { return (await r.get("calling_paused")) === "1"; } catch { return false; }
}
export async function setCallingPaused(paused: boolean): Promise<void> {
  const r = redis(); if (!r) return;
  try { await r.set("calling_paused", paused ? "1" : "0"); } catch (e) { console.error("[redis] setCallingPaused", e); }
}

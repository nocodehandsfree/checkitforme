// Lightweight in-memory rate limiter for public mutation endpoints. Protects the money- and
// reward-adjacent surfaces (kiosk free-check rewards, community posts, watches, leads) from spam and
// farming. Fixed-window per (ip + bucket); no deps, self-pruning. For a single Railway instance this is
// plenty; if we ever scale horizontally, swap the Map for Redis behind the same check() signature.
interface Hit { count: number; resetAt: number }
const store = new Map<string, Hit>();
let lastPrune = 0;

function prune(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

export interface Limit { windowMs: number; max: number }
/** Returns ok=false (with retryAfter seconds) when the caller has exceeded `max` hits in `windowMs`. */
export function check(bucket: string, ip: string, limit: Limit): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  prune(now);
  const key = `${bucket}:${ip}`;
  const cur = store.get(key);
  if (!cur || cur.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (cur.count >= limit.max) return { ok: false, retryAfter: Math.ceil((cur.resetAt - now) / 1000) };
  cur.count++;
  return { ok: true, retryAfter: 0 };
}

// Sensible defaults per surface (tuned so a real human never hits them, but farming/spam does).
export const LIMITS: Record<string, Limit> = {
  reward: { windowMs: 60 * 60_000, max: 6 },     // kiosk reports → free checks: 6/hr/IP
  community: { windowMs: 60 * 60_000, max: 12 }, // photo posts: 12/hr/IP
  communityUpload: { windowMs: 60 * 60_000, max: 30 }, // presigned-url mints (separate bucket so a post isn't double-counted): 30/hr/IP
  watch: { windowMs: 10 * 60_000, max: 15 },     // restock watches: 15/10min/IP
  lead: { windowMs: 60 * 60_000, max: 8 },       // email lead gate: 8/hr/IP
  write: { windowMs: 60_000, max: 30 },          // generic public write fallback: 30/min/IP
};

/** Client IP from trusted proxy headers. Prefer `cf-connecting-ip` — Cloudflare OVERWRITES it with
 *  the real client IP, so (unlike the left-most `x-forwarded-for`, which the client can set freely)
 *  it can't be spoofed to rotate fake IPs past the per-IP limits. XFF is the last resort. */
export function clientIp(headers: { get(name: string): string | null | undefined }): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return "unknown";
}

// Unit test for the in-memory rate limiter. Run: ./node_modules/.bin/tsx scripts/test-ratelimit.ts
import { check, clientIp } from "../src/ratelimit";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const limit = { windowMs: 1000, max: 3 };
console.log("▶ window allows up to max, then blocks");
ok(check("t", "1.1.1.1", limit).ok, "hit 1 ok");
ok(check("t", "1.1.1.1", limit).ok, "hit 2 ok");
ok(check("t", "1.1.1.1", limit).ok, "hit 3 ok");
const blocked = check("t", "1.1.1.1", limit);
ok(!blocked.ok && blocked.retryAfter > 0, "hit 4 blocked with retryAfter");

console.log("▶ buckets + IPs are isolated");
ok(check("other", "1.1.1.1", limit).ok, "different bucket, same IP → fresh");
ok(check("t", "2.2.2.2", limit).ok, "same bucket, different IP → fresh");

console.log("▶ window resets after expiry");
await new Promise((r) => setTimeout(r, 1100));
ok(check("t", "1.1.1.1", limit).ok, "after window elapses, allowed again");

console.log("▶ clientIp parses proxy headers");
const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });
ok(clientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })) === "9.9.9.9", "takes first x-forwarded-for");
ok(clientIp(h({ "cf-connecting-ip": "8.8.8.8" })) === "8.8.8.8", "falls back to cf-connecting-ip");
ok(clientIp(h({})) === "unknown", "fallback when no headers");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

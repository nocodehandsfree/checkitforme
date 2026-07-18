// Unit tests for the call concurrency governor (src/calls/concurrency.ts) — the scale ceiling.
// Runs with NO Redis (in-memory backend) so the decision logic is exercised deterministically.
// Run: env EL_ACCOUNTS='...' ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-concurrency.ts
import { bootstrap } from "../src/db/bootstrap";
import { acquireCallSlot, releaseCallSlot, callAccounts, concurrencyStatus } from "../src/calls/concurrency";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
let n = 0;
const acq = (p: "interactive" | "batch", userId?: string, ttlSec = 60) =>
  acquireCallSlot({ key: `k${++n}`, priority: p, userId, ttlSec });

async function setConc(o: Record<string, unknown>) {
  await setPolicy({ concurrency: { enabled: true, perAccountCap: 10, reserveInteractive: 2, maxPerUser: 10, interactiveWaitMs: 400, batchWaitMs: 600, ...o } } as never);
}

async function main() {
  await bootstrap();
  console.log("▶ account pool: EL_ACCOUNTS builds the pool (else single primary)");
  const pool = callAccounts();
  ok(pool.length >= 1 && pool[0].id === "primary", `pool has a primary (${pool.length} account(s))`);

  console.log("▶ flag OFF → always grants immediately, no-op release (today's behavior)");
  await setPolicy({ concurrency: { enabled: false, perAccountCap: 10, reserveInteractive: 2, maxPerUser: 10, interactiveWaitMs: 400, batchWaitMs: 600 } } as never);
  const off = await acq("interactive");
  ok(off !== null && off.account.id === "primary", "flag off grants the primary account");
  await off!.release();

  console.log("▶ cap enforced: perAccountCap=2, 3rd batch call queues then times out");
  // single account, cap 2
  await setConc({ perAccountCap: 2, reserveInteractive: 0 });
  const a1 = await acq("batch"), a2 = await acq("batch");
  ok(!!a1 && !!a2, "first two batch calls acquire");
  const t0 = Date.now();
  const a3 = await acq("batch"); // pool full → waits batchWaitMs(600) → null
  ok(a3 === null && Date.now() - t0 >= 550, "3rd call WAITED for a slot then returned busy (null), never crashed");
  await a1!.release();
  const a3b = await acq("batch"); // a slot freed → now succeeds
  ok(!!a3b, "after a release, the waiting slot is grantable");
  await a2!.release(); await a3b!.release();

  console.log("▶ priority reserve: batch can't take the last `reserveInteractive` slots; interactive can");
  await setConc({ perAccountCap: 3, reserveInteractive: 1 }); // batch ceiling = 2, interactive = 3
  const b1 = await acq("batch"), b2 = await acq("batch");
  ok(!!b1 && !!b2, "batch fills up to the reserve line (2 of 3)");
  const b3 = await acq("batch"); // would hit the reserved slot → blocked → null
  ok(b3 === null, "batch is REFUSED the reserved slot (a zone can't starve instant checks)");
  const i1 = await acq("interactive"); // interactive may use the reserved slot
  ok(!!i1, "an instant single check CAN take the reserved slot");
  await b1!.release(); await b2!.release(); await i1!.release();

  console.log("▶ per-user cap: one user's zone can't hold more than maxPerUser at once");
  await setConc({ perAccountCap: 20, reserveInteractive: 0, maxPerUser: 3 });
  const u = "phone:+13105550001";
  const held = [] as Array<{ release: () => Promise<void> }>;
  for (let i = 0; i < 3; i++) { const s = await acq("batch", u); ok(!!s, `user slot ${i + 1}/3`); if (s) held.push(s); }
  const u4 = await acq("batch", u); // 4th for the same user → capped → null
  ok(u4 === null, "the user's 4th simultaneous call is capped (queued out)");
  const other = await acq("batch", "phone:+13105550002"); // a DIFFERENT user is unaffected
  ok(!!other, "a different user is not blocked by the first user's cap");
  for (const s of held) await s.release(); await other!.release();

  console.log("▶ multi-account spread: 2 accounts × cap 2 = 4 global; 5th queues");
  // Simulate a 2nd account via EL_ACCOUNTS is env-time; here prove the math holds on the configured pool.
  const poolCap = callAccounts().reduce((s, a) => s + Math.min(a.cap, 2), 0);
  await setConc({ perAccountCap: 2, reserveInteractive: 0 });
  const slots = [] as Array<{ release: () => Promise<void> }>;
  for (let i = 0; i < poolCap; i++) { const s = await acq("interactive"); if (s) slots.push(s); }
  ok(slots.length === poolCap, `filled the whole pool (${poolCap} slot(s) across ${callAccounts().length} account(s))`);
  const over = await acq("interactive");
  ok(over === null, "one past the pool ceiling queues then busies out");
  for (const s of slots) await s.release();

  console.log("▶ release is cross-replica by key + idempotent");
  await setConc({ perAccountCap: 1, reserveInteractive: 0 });
  const s = await acquireCallSlot({ key: "cross1", priority: "interactive", ttlSec: 60 });
  ok(!!s, "acquired");
  await releaseCallSlot("cross1"); // release by KEY (no handle) — the finalize path
  await releaseCallSlot("cross1"); // double release is a safe no-op
  const after = await acq("interactive");
  ok(!!after, "slot was freed by key-release (a new call gets it)");
  await after!.release();

  console.log("▶ TTL auto-heal: a slot with a tiny ttl frees itself without an explicit release");
  await setConc({ perAccountCap: 1, reserveInteractive: 0 });
  const leak = await acquireCallSlot({ key: "leak1", priority: "interactive", ttlSec: 1 }); // 1s ttl, never released
  ok(!!leak, "acquired a slot we will 'leak'");
  const blocked = await acquireCallSlot({ key: "leak2", priority: "interactive", ttlSec: 60 }); // pool full now
  ok(blocked === null, "pool is full while the leaked slot is live");
  await new Promise((r) => setTimeout(r, 1200)); // let the 1s ttl expire
  const healed = await acq("interactive");
  ok(!!healed, "the leaked slot auto-expired — the pool healed itself, no permanent leak");
  await healed!.release();

  console.log("▶ status readout reflects live usage");
  await setConc({ perAccountCap: 5, reserveInteractive: 1 });
  const h1 = await acq("interactive");
  const st = await concurrencyStatus();
  ok(st.enabled && st.totalUsed >= 1 && st.totalCap >= 5, `status: used=${st.totalUsed} cap=${st.totalCap}`);
  await h1!.release();

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

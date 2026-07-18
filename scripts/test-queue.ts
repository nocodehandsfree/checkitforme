// Unit test for the check queue / waiting-screen feed (src/calls/queue.ts).
// Proves: governor OFF places instantly · pool full → queues with place-in-line + a REAL ETA computed
// from live-call timing · interactive ahead of batch · drain blocked while full · a freed slot drains
// and flips the ticket to "dialing" (the live-transcript signal). No real calls — a fake place fn.
// Run: env DATABASE_URL=file:./.t-q.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-queue.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { callResults, retailers } from "../src/db/schema";
import { setPolicy } from "../src/policy";
import { acquireCallSlot, releaseCallSlot } from "../src/calls/concurrency";
import { routeCheck, enqueueCheck, ticketStatus, drainCheckQueue } from "../src/calls/queue";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const nowSec = () => Math.floor(Date.now() / 1000);
let placed = 0;
const fakePlace = async () => ({ providerCallId: "conv_" + (++placed), status: "in_progress" });

async function conc(o: Record<string, unknown>) {
  await setPolicy({ concurrency: { enabled: true, perAccountCap: 1, reserveInteractive: 0, maxPerUser: 10, interactiveWaitMs: 200, batchWaitMs: 300, ...o } } as never);
}

async function main() {
  await bootstrap();
  for (const id of [9001, 9002, 9003, 9004]) await db.insert(retailers).values({ id, name: `Q Store ${id}`, location: "LA, CA", phone: `+1310555${id}` } as never).onConflictDoNothing();
  const args = (rid = 9001) => ({ retailerId: rid, categoryId: 1, finderUserId: "phone:+13105550001" });

  console.log("▶ governor OFF → routeCheck places immediately, never queues");
  await setPolicy({ concurrency: { enabled: false, perAccountCap: 1, reserveInteractive: 0, maxPerUser: 10, interactiveWaitMs: 200, batchWaitMs: 300 } } as never);
  const off = await routeCheck("direct", fakePlace, args());
  ok(!("queued" in off) && (off as any).providerCallId?.startsWith("conv_"), "flag off → placed now, no ticket");

  console.log("▶ seed expected call length (~60s) from recent completed calls");
  for (let i = 0; i < 6; i++) await db.insert(callResults).values({ retailerId: 9001, categoryId: 1, mode: "restock", status: "completed", callSeconds: 60, startedAt: nowSec() - 300 } as never);

  console.log("▶ pool FULL → routeCheck queues with place-in-line + a REAL ETA");
  await conc({ perAccountCap: 1 });
  const slot = await acquireCallSlot({ key: "occupy1", priority: "interactive", ttlSec: 300 }); // occupy the 1 slot
  ok(!!slot, "occupied the only slot");
  // A live call that has been running ~30s → its slot frees in ~30s (expected 60 − elapsed 30).
  await db.insert(callResults).values({ retailerId: 9002, categoryId: 1, mode: "restock", status: "in_progress", providerCallId: "conv_live1", startedAt: nowSec() - 30 } as never);
  const q1 = await routeCheck("bridge", fakePlace, args()) as any;
  ok(q1.queued === true && q1.ticketId, "queued: got a ticketId");
  ok(q1.position === 1, `position 1 (next up) — got ${q1.position}`);
  ok(q1.etaSeconds >= 20 && q1.etaSeconds <= 40, `ETA ~30s from the live call's real remaining time — got ${q1.etaSeconds}`);

  console.log("▶ second check → position 2; a batch (zone) ticket sits BEHIND interactive");
  const q2 = await routeCheck("bridge", fakePlace, { retailerId: 9003, categoryId: 1, finderUserId: "phone:+13105550002" }) as any;
  ok(q2.position === 2, `second interactive → position 2 — got ${q2.position}`);
  const batch = await enqueueCheck({ retailerId: 9004, categoryId: 1, finderUserId: "phone:+13105550003" }, "batch", "bridge");
  ok(batch.position === 3, `batch ticket is behind both interactive checks → position 3 — got ${batch.position}`);

  console.log("▶ poll shape while queued");
  const s1 = await ticketStatus(q1.ticketId);
  ok(s1.status === "queued" && s1.position === 1 && typeof s1.etaSeconds === "number", "poll → {queued, position, etaSeconds}");

  console.log("▶ drain is BLOCKED while the pool is full (nothing placed)");
  const before = placed;
  await drainCheckQueue(fakePlace, fakePlace);
  ok(placed === before, "pool full → drain placed nothing");
  const stillQ = await ticketStatus(q1.ticketId);
  ok(stillQ.status === "queued", "ticket still queued");

  console.log("▶ slot frees → drain places the next check and the ticket FLIPS to dialing (live signal)");
  await releaseCallSlot("occupy1"); // free the pool
  await drainCheckQueue(fakePlace, fakePlace);
  const flipped = await ticketStatus(q1.ticketId);
  ok(flipped.status === "dialing" && String(flipped.providerCallId).startsWith("conv_"), `ticket flipped → {dialing, providerCallId} — got ${flipped.status}`);

  console.log("▶ unknown ticket → gone");
  ok((await ticketStatus("q_nope")).status === "gone", "unknown ticket → gone");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

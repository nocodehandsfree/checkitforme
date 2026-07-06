// Tests for THE NUMBER cost model + the launch-hardening surfaces:
//   • cost.ts pure model (talk time, ¢/call under both EL scenarios, ABC savings, aggregation)
//   • /api/cost + /api/readiness admin endpoints (booted server, seeded completed calls)
//   • the per-IP rate limit on /pub/check (the money endpoint)
// No real calls are placed — completed rows are seeded directly. No ADMIN_TOKEN in test env, so the
// /api/* gate falls open (dev mode), which is what lets us hit the admin endpoints here.
// Run: env DATABASE_URL=file:./.t-cost.db PORT=8792 ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-cost.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { callResults, categories, retailers } from "../src/db/schema";
import { talkSeconds, callCostCents, scoreCall, summarizeCosts, RATES, TARGET } from "../src/calls/cost";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();

  console.log("▶ cost model — pure functions");
  ok(talkSeconds({ callSeconds: 90, navSeconds: 60 }) === 30, "talk = call − nav (90−60=30)");
  ok(talkSeconds({ callSeconds: 40, navSeconds: 100 }) === 0, "nav clamped to call → talk never negative");
  ok(talkSeconds({ callSeconds: null, navSeconds: null }) === 0, "missing timing → 0 talk");

  // 90s call, 60s nav → 30s talk. Scenario A EL=$0.22/min.
  //   ABC off: EL bills whole 90s = 1.5min×22¢ = 33¢; Twilio 1.5×1.4¢=2.1¢; LLM 3¢ → ~38¢.
  //   ABC on:  EL bills 30s talk = 0.5min×22¢ = 11¢; Twilio 2.1¢; LLM 3¢ → ~16¢.
  const off = callCostCents({ callSeconds: 90, navSeconds: 60 }, "A", false);
  const on = callCostCents({ callSeconds: 90, navSeconds: 60 }, "A", true);
  ok(off === 38, `A, ABC off ≈ 38¢ (got ${off})`);
  ok(on === 16, `A, ABC on ≈ 16¢ (got ${on})`);
  ok(on < off, "connect-on-human is always cheaper when there's nav time");
  ok(callCostCents({ callSeconds: 90, navSeconds: 60 }, "B", false) < off, "scenario B (cheaper EL) < scenario A");

  const s = scoreCall({ callSeconds: 25, navSeconds: 10 }, "A", true); // 15s talk
  ok(s.talk === 15 && s.talkBox === true, "15s talk lands in the ≤20s box");
  ok(scoreCall({ callSeconds: 200, navSeconds: 20 }, "A", false).talkBox === false, "180s talk misses the box");
  ok(RATES.twilioPerMin === 0.014 && TARGET.talkSeconds === 20, "rates + target constants exposed");

  console.log("▶ aggregation");
  const sample = [
    { callSeconds: 30, navSeconds: 5 },   // 25s talk
    { callSeconds: 90, navSeconds: 60 },  // 30s talk
    { callSeconds: 20, navSeconds: 2 },   // 18s talk → talkBox
    { callSeconds: 0, navSeconds: 0 },    // ignored (no connect)
  ];
  const sum = summarizeCosts(sample, false);
  ok(sum.n === 3, "n counts only connected calls (0s dropped)");
  ok(sum.cost.A.abc.avgCents < sum.cost.A.current.avgCents, "ABC projection beats current on average");
  ok(sum.pctTalkBox === 33, "1 of 3 calls in the ≤20s talk box → 33%");
  ok(summarizeCosts([], false).n === 0, "empty input is safe");

  console.log("▶ seed completed calls + boot server");
  const cat = (await db.select().from(categories))[0];
  const [store] = await db.insert(retailers).values({ name: "Cost Store", location: "LA, CA", phone: "+13105557001" }).returning();
  const [fun] = await db.insert(retailers).values({ name: "Fun", location: "LA, CA", phone: "+13105557002", ownerOnly: true }).returning();
  const now = Date.now();
  await db.insert(callResults).values([
    { retailerId: store.id, categoryId: cat.id, mode: "restock", status: "completed", callSeconds: 30, navSeconds: 5, startedAt: now },
    { retailerId: store.id, categoryId: cat.id, mode: "restock", status: "completed", callSeconds: 85, navSeconds: 55, startedAt: now },
    { retailerId: fun.id, categoryId: cat.id, mode: "restock", status: "completed", callSeconds: 300, navSeconds: 0, startedAt: now }, // Fun → must be excluded
  ]);

  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8792"}`;
  await new Promise((r) => setTimeout(r, 400));
  const J = (r: Response) => r.json() as Promise<any>;

  console.log("▶ GET /api/cost");
  const cost = await J(await fetch(`${base}/api/cost`));
  ok(cost.n === 2, `Fun (owner-only) call excluded → n=2 (got ${cost.n})`);
  ok(cost.headline && cost.headline.avgCentsB > 0, "headline reports avg ¢ (scenario B)");
  ok(cost.cost.B.abc.avgCents <= cost.cost.B.current.avgCents, "ABC projection ≤ current in the payload");
  ok(typeof cost.headline.connectOnHumanSavesCents === "number", "headline quantifies the ABC saving");

  console.log("▶ GET /api/readiness");
  const rd = await J(await fetch(`${base}/api/readiness`));
  ok(Array.isArray(rd.checks) && rd.checks.length >= 6, "readiness returns a checklist");
  ok(rd.checks.some((k: any) => k.id === "rate_limits" && k.status === "pass"), "rate-limit check present + pass");
  ok(rd.checks.some((k: any) => k.id === "cost"), "cost check present");
  ok(typeof rd.ready === "boolean", "readiness has a top-level ready boolean");

  console.log("▶ security headers on a normal response");
  const hres = await fetch(`${base}/api/readiness`);
  ok(hres.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff present");
  ok((hres.headers.get("referrer-policy") || "").includes("strict-origin"), "Referrer-Policy present");

  console.log("▶ rate limit on /pub/check (8/min/IP) → 429 on the 9th");
  let got429 = false, statuses: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${base}/pub/check`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    statuses.push(r.status);
    if (r.status === 429) { got429 = true; break; }
  }
  ok(got429, `9th+ rapid /pub/check returns 429 (sequence: ${statuses.join(",")})`);

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

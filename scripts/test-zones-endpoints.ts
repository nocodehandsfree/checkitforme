// Smoke test for the consumer Manage Zones endpoints (7 x /app/zones/*). Boots the real Hono server
// on a throwaway port + DB, mints a phone-session token, and drives the full CRUD + quote + check +
// run + stop flow. Provider calls use the "test" EL key → they fail fast (row lands `failed`, NO real
// call is placed), which still proves the zoneRunId grouping + run/summary aggregation.
// Run: env DATABASE_URL=file:./.t-zones.db PORT=8791 ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-zones-endpoints.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts, categories, retailers } from "../src/db/schema";
import { getAccountByPhone } from "../src/billing";
import { signSession } from "../src/auth";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  await setPolicy({ pricing: { freeChecks: 1, perCallCents: 25 } } as never);

  // A subscriber (Collector) → zone_sweeps entitled (all features ON by default). Give quota to afford.
  const PHONE = "+13105550042";
  const a = await getAccountByPhone(PHONE);
  await db.update(accounts).set({ subscription: "active", subTier: "collector", quotaCredits: 30 }).where(eq(accounts.clerkUserId, a.clerkUserId));
  const token = await signSession(a.clerkUserId, PHONE);
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  // Two callable stores (sellsPacks default true, no hours → openState unknown → not blocked).
  // Open 24/7 so triggerCall doesn't reject them as "likely closed" (no-hours stores are treated as closed).
  const open24 = JSON.stringify({ mon: "24h", tue: "24h", wed: "24h", thu: "24h", fri: "24h", sat: "24h", sun: "24h" });
  const [r1] = await db.insert(retailers).values({ name: "Zone Store A", location: "Sylmar, CA", phone: "+13105550101", hours: open24 }).returning();
  const [r2] = await db.insert(retailers).values({ name: "Zone Store B", location: "Reseda, CA", phone: "+13105550102", hours: open24 }).returning();
  // A kiosk-only store (not callable) to prove it's filtered out of checks/quote.
  const [r3] = await db.insert(retailers).values({ name: "Kiosk Only", location: "Van Nuys, CA", phone: "+13105550103", sellsPacks: false, hours: open24 }).returning();

  // Boot the server (imports register routes + start listening). Import after seed so DB exists.
  await import("../src/server");
  const PORT = process.env.PORT || "8791";
  const base = `http://127.0.0.1:${PORT}`;
  await new Promise((r) => setTimeout(r, 400)); // let the listener bind
  const J = (r: Response) => r.json() as Promise<any>;

  console.log("▶ gate: no token → 401, wrong entitlement path covered by unit tests");
  ok((await fetch(`${base}/app/zones`)).status === 401, "GET /app/zones without token → 401");

  console.log("▶ empty state");
  ok(JSON.stringify(await J(await fetch(`${base}/app/zones`, { headers: auth }))) === "[]", "list starts empty");

  console.log("▶ quote reflects only callable stores");
  const q = await J(await fetch(`${base}/app/zones/quote?retailerIds=${r1.id},${r2.id},${r3.id}`, { headers: auth }));
  ok(q.checks === 2 && q.stores === 2, `quote counts 2 callable stores (kiosk excluded) — got ${q.checks}`);
  ok(q.cents === 2 * 25, `quote cents = 2 × perCallCents (50) — got ${q.cents}`);

  console.log("▶ create");
  const created = await J(await fetch(`${base}/app/zones`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Valley Zone", retailerIds: [r1.id, r2.id, r3.id] }) }));
  ok(!!created.id && created.name === "Valley Zone", "zone created with a name + id");
  ok(created.stores.length === 3 && created.checkCount === 2, "3 stores stored; checkCount = 2 callable");
  ok(created.lastRun === null, "no lastRun before any check");
  const zid = created.id;

  console.log("▶ create rejects empty store set");
  ok((await fetch(`${base}/app/zones`, { method: "POST", headers: auth, body: JSON.stringify({ name: "x", retailerIds: [] }) })).status === 400, "empty retailerIds → 400 no_stores");

  console.log("▶ list shows the zone; ownership scoping");
  const list = await J(await fetch(`${base}/app/zones`, { headers: auth }));
  ok(list.length === 1 && list[0].id === zid, "owner sees exactly their 1 zone");
  const otherTok = await signSession("phone:+13109990000", "+13109990000");
  await getAccountByPhone("+13109990000");
  await db.update(accounts).set({ subscription: "active", subTier: "collector" }).where(eq(accounts.clerkUserId, "phone:+13109990000"));
  const otherList = await J(await fetch(`${base}/app/zones`, { headers: { Authorization: `Bearer ${otherTok}` } }));
  ok(Array.isArray(otherList) && otherList.length === 0, "a different account does NOT see this zone");

  console.log("▶ patch: rename + replace stores");
  const patched = await J(await fetch(`${base}/app/zones/${zid}`, { method: "PATCH", headers: auth, body: JSON.stringify({ name: "Renamed Zone", retailerIds: [r1.id] }) }));
  ok(patched.name === "Renamed Zone" && patched.stores.length === 1, "rename + store replace applied");
  // restore both callable stores for the check step
  await fetch(`${base}/app/zones/${zid}`, { method: "PATCH", headers: auth, body: JSON.stringify({ retailerIds: [r1.id, r2.id] }) });

  console.log("▶ check: places calls, groups them under one runId");
  const chk = await J(await fetch(`${base}/app/zones/${zid}/check`, { method: "POST", headers: auth, body: JSON.stringify({}) }));
  ok(typeof chk.runId === "string" && chk.runId.startsWith(`z${zid}-`), `runId shaped z<id>-<uuid> — got ${chk.runId}`);
  ok(Array.isArray(chk.stores) && chk.stores.length === 2, "check fired at 2 callable stores");

  console.log("▶ run report: rows grouped + summarized (provider failed on test key → still grouped)");
  const run = await J(await fetch(`${base}/app/zones/run/${encodeURIComponent(chk.runId)}`, { headers: auth }));
  ok(run.total === 2, `run report groups both checks — got ${run.total}`);
  ok(run.summary && typeof run.summary.inStock === "number", "summary carries inStock/no/noAnswer/checking counts");

  console.log("▶ stop: cancels the run (no live Twilio SIDs in test → 0 stopped, still ok)");
  const stop = await J(await fetch(`${base}/app/zones/run/${encodeURIComponent(chk.runId)}/stop`, { method: "POST", headers: auth }));
  ok(stop.ok === true, "stop returns ok");

  console.log("▶ cheap-bridge lane (flags.cheapBridgeAll): fire still groups + terminalizes rows");
  // Flag ON → the zone fire rides bridgeCheckCall. Twilio creds are absent in tests, so each bridge
  // placement fails fast — proving the SAME zoneRunId grouping + a terminal (failed) row per store,
  // with no dial possible. Flag restored OFF after (the shipped default).
  await setPolicy({ flags: { cheapBridgeAll: true } } as never);
  const chk2 = await J(await fetch(`${base}/app/zones/${zid}/check`, { method: "POST", headers: auth, body: JSON.stringify({}) }));
  ok(typeof chk2.runId === "string" && chk2.runId.startsWith(`z${zid}-`), `bridge-lane runId shaped z<id>-<uuid> — got ${chk2.runId}`);
  const run2 = await J(await fetch(`${base}/app/zones/run/${encodeURIComponent(chk2.runId)}`, { headers: auth }));
  ok(run2.total === 2, `bridge-lane run groups both checks — got ${run2.total}`);
  ok(run2.done === run2.total, "bridge-lane rows reach a terminal state (failed fast, no dial possible)");
  await setPolicy({ flags: { cheapBridgeAll: false } } as never);

  console.log("▶ delete");
  ok((await J(await fetch(`${base}/app/zones/${zid}`, { method: "DELETE", headers: auth }))).ok === true, "delete returns ok");
  ok((await J(await fetch(`${base}/app/zones`, { headers: auth }))).length === 0, "list empty after delete");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

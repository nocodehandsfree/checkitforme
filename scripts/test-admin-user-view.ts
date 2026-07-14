// Smoke test for the admin per-customer view (docs/specs/admin-user-view.md):
// GET /api/admin/users/:id (full picture) + POST /api/admin/users/:id/grant (support action).
// Run: env DATABASE_URL=file:./.t-adminview.db PORT=8793 ADMIN_TOKEN=t ELEVENLABS_API_KEY=test \
//      ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-admin-user-view.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts, callResults, customerSchedules, retailers, zoneRetailers, zones } from "../src/db/schema";
import { getAccountByPhone } from "../src/billing";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();

  // A subscriber with a zone, a schedule, and a couple of checks.
  const PHONE = "+13105550071";
  const a = await getAccountByPhone(PHONE);
  await db.update(accounts).set({ subscription: "active", subTier: "collector", quotaCredits: 22, credits: 5, callsMade: 2, totalSpentCents: 2497 }).where(eq(accounts.clerkUserId, a.clerkUserId));
  const [r1] = await db.insert(retailers).values({ name: "View Store — Vine", location: "LA, CA", phone: "+13105550301" }).returning();
  const [z] = await db.insert(zones).values({ name: "SF Valley", ownerUserId: a.clerkUserId }).returning();
  await db.insert(zoneRetailers).values([{ zoneId: z.id, retailerId: r1.id }]);
  await db.insert(customerSchedules).values({ finderUserId: a.clerkUserId, retailerId: r1.id, categoryId: 1, daysOfWeek: "4", timeLocal: "10:00" });
  await db.insert(callResults).values([
    { retailerId: r1.id, categoryId: 1, mode: "restock", status: "completed", statusKey: "in_stock", providerCallId: "conv_t1", finderUserId: a.clerkUserId },
    { retailerId: r1.id, categoryId: 1, mode: "restock", status: "no_answer", statusKey: "nobody_answered", providerCallId: "conv_t2", finderUserId: a.clerkUserId },
  ]);

  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8793"}`;
  await new Promise((r) => setTimeout(r, 400));
  const H = { "x-admin-token": process.env.ADMIN_TOKEN || "t", "content-type": "application/json" };

  console.log("▶ detail view: one call, the full picture");
  const r = await fetch(`${base}/api/admin/users/${encodeURIComponent(a.clerkUserId)}`, { headers: H });
  ok(r.status === 200, `GET /api/admin/users/:id → 200 (got ${r.status})`);
  const v = (await r.json()) as any;
  ok(v.phone === PHONE, "identity: phone");
  ok(v.subscription.status === "active" && v.subscription.tier === "collector" && !!v.subscription.tierName, "plan: active Collector with a display name");
  ok(v.credits.quota === 22 && v.credits.payg === 5 && v.credits.total === 27, `credits: 22 quota + 5 payg = 27 (got ${v.credits.total})`);
  ok(v.credits.lifetimeSpendCents === 2497, "lifetime spend carried");
  ok(v.entitlements && v.entitlements.zone_sweeps === true, "entitlements map present (zone_sweeps on for Collector)");
  ok(v.zones.length === 1 && v.zones[0].name === "SF Valley" && v.zones[0].stores === 1, "zones: name + store count");
  ok(v.schedules.length === 1 && v.schedules[0].days === "Thu" && v.schedules[0].time === "10:00", `schedules: day label + time (got ${JSON.stringify(v.schedules[0])})`);
  ok(v.recentChecks.length === 2 && v.recentChecks[0].statusKey && v.recentChecks[0].store.includes("View Store"), "recent checks with store + statusKey");

  console.log("▶ unknown user → 404");
  ok((await fetch(`${base}/api/admin/users/phone:%2B19999999999`, { headers: H })).status === 404, "missing account → 404");

  console.log("▶ grant credits");
  const g = await fetch(`${base}/api/admin/users/${encodeURIComponent(a.clerkUserId)}/grant`, { method: "POST", headers: H, body: JSON.stringify({ checks: 10 }) });
  ok(g.status === 200, `grant → 200 (got ${g.status})`);
  const gr = (await g.json()) as any;
  ok(gr.granted === 10 && gr.credits === 15, `payg goes 5 → 15 (got ${gr.credits})`);
  ok((await fetch(`${base}/api/admin/users/${encodeURIComponent(a.clerkUserId)}/grant`, { method: "POST", headers: H, body: JSON.stringify({ checks: 0 }) })).status === 400, "0 checks rejected");
  ok((await fetch(`${base}/api/admin/users/${encodeURIComponent(a.clerkUserId)}/grant`, { method: "POST", headers: H, body: JSON.stringify({ checks: 5000 }) })).status === 400, ">1000 rejected");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

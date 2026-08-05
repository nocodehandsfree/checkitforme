// Unit + smoke tests for the prod→staging settings mirror (src/settings-sync.ts):
// the merge rules that keep staging safe (local call-test flags, TEST-mode Stripe ids), the
// statuses exact-mirror, apply idempotence, and the admin-gated export endpoint.
// Run: env DATABASE_URL=file:./.t-setsync.db PORT=8788 ADMIN_TOKEN=t ELEVENLABS_API_KEY=test \
//      ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-settings-sync.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { statuses } from "../src/db/schema";
import { getSetting, setSetting } from "../src/db/settings";
import { applySettingsExport, mergePlansBlob, mergePolicyBlob, type SettingsExport } from "../src/settings-sync";
import { getPolicy } from "../src/policy";
import { callTuning } from "../src/calls/tuning";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();

  console.log("▶ mergePolicyBlob: prod wins, except the keep-local call-test flags");
  const prodPol = JSON.stringify({ pricing: { perCallCents: 30 }, flags: { thrift: false, cheapBridgeAll: true, connectOnHuman: true } });
  const stagPol = JSON.stringify({ flags: { cheapBridgeAll: false } }); // staging mid-test: bridge OFF here
  const merged = JSON.parse(mergePolicyBlob(prodPol, stagPol)!);
  ok(merged.pricing.perCallCents === 30, "prod pricing mirrored");
  ok(merged.flags.thrift === false, "prod feature toggle mirrored");
  ok(merged.flags.cheapBridgeAll === false, "staging's own cheapBridgeAll KEPT (not stomped by prod)");
  ok(!("connectOnHuman" in merged.flags), "keep-local flag staging never set → left to staging defaults");
  ok(mergePolicyBlob("{not json", stagPol) === null, "malformed prod blob → not applied");

  console.log("▶ mergePlansBlob: owner's ladder mirrors, Stripe publish artifacts stay per-env");
  const prodPlans = JSON.stringify({
    tiers: [{ key: "family", name: "Family+", monthlyCents: 599, checksPerMonth: 25, stripeProductId: "prod_LIVE", monthlyPriceId: "price_LIVE_M", annualPriceId: "price_LIVE_Y", pub: { monthlyCents: 599 } }],
    payg: { stripeProductId: "prod_LIVEP", bundles: [{ checks: 10, cents: 300, priceId: "price_LIVE_B", pubCents: 300 }] },
  });
  const stagPlans = JSON.stringify({
    tiers: [{ key: "family", name: "Family", monthlyCents: 499, checksPerMonth: 20, stripeProductId: "prod_TEST", monthlyPriceId: "price_TEST_M", annualPriceId: "price_TEST_Y", pub: { monthlyCents: 499 } }],
    payg: { stripeProductId: "prod_TESTP", bundles: [{ checks: 10, cents: 250, priceId: "price_TEST_B", pubCents: 250 }] },
  });
  const plans = JSON.parse(mergePlansBlob(prodPlans, stagPlans)!);
  ok(plans.tiers[0].name === "Family+" && plans.tiers[0].monthlyCents === 599 && plans.tiers[0].checksPerMonth === 25, "owner's tier edits mirrored (name/price/quota)");
  ok(plans.tiers[0].monthlyPriceId === "price_TEST_M" && plans.tiers[0].stripeProductId === "prod_TEST", "staging keeps its TEST-mode Stripe ids");
  ok(plans.payg.bundles[0].cents === 300 && plans.payg.bundles[0].priceId === "price_TEST_B", "bundle price mirrors, bundle Stripe id stays local");

  console.log("▶ applySettingsExport: end-to-end against the local DB");
  await setSetting("policy_json", JSON.stringify({ flags: { cheapBridgeAll: true } })); // staging mid-test
  const exp: SettingsExport = {
    policy_json: JSON.stringify({ pricing: { perCallCents: 35 }, flags: { thrift: false, cheapBridgeAll: false } }),
    vt_plans: prodPlans,
    support_banner_en: "We're on it!", support_banner_es: "¡Estamos en ello!",
    statuses: [
      { key: "in_stock", emoji: "✅", label: "In stock!!", tone: "in", color: "#4ADE80", note: "Go!", sort: 10 },
      { key: "owner_new_status", emoji: "🆕", label: "Brand new", tone: "unk", color: "#999999", note: "", sort: 900 },
    ],
  };
  const { changed } = await applySettingsExport(exp);
  ok(changed.includes("policy_json") && changed.includes("vt_plans"), `policy + plans applied (${changed.length} changes)`);
  const pol = await getPolicy();
  ok(pol.pricing.perCallCents === 35 && pol.flags.thrift === false, "policy visibly changed via getPolicy");
  ok(pol.flags.cheapBridgeAll === true, "staging's in-test bridge flag SURVIVED the mirror");
  ok((await getSetting("support_banner_en")) === "We're on it!", "banner mirrored");
  const inStock = (await db.select().from(statuses).where(eq(statuses.key, "in_stock")))[0];
  ok(inStock?.label === "In stock!!", "statuses registry updated in place");
  ok((await db.select().from(statuses).where(eq(statuses.key, "owner_new_status"))).length === 1, "owner's new status inserted");
  ok((await db.select().from(statuses).where(eq(statuses.key, "sold_out"))).length === 0, "status the owner deleted on prod removed here (prod is truth)");

  console.log("▶ idempotence: re-applying the same export changes nothing");
  const again = await applySettingsExport(exp);
  ok(again.changed.length === 0, `second apply is a no-op (got ${again.changed.join(",") || "none"})`);

  console.log("▶ export endpoint: admin-gated, serves the whitelist");
  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8788"}`;
  await new Promise((r) => setTimeout(r, 400));
  ok((await fetch(`${base}/api/settings-sync/export`)).status === 401, "export without token → 401");
  const r = await fetch(`${base}/api/settings-sync/export`, { headers: { "x-admin-token": "t" } });
  ok(r.status === 200, `export with token → 200 (got ${r.status})`);
  const body = (await r.json()) as SettingsExport;
  ok(typeof body.policy_json === "string" && Array.isArray(body.statuses) && body.statuses.length > 0, "export carries policy + statuses");
  ok(!("chains" in (body as object)) && !("retailers" in (body as object)), "export NEVER carries store-sync's tables (DD's pipe)");

  console.log("▶ the owner's five numbers: saved from Admin, read by the next check, never mirrored");
  {
    // WHERE THEY LIVE IS NOT OPTIONAL. Production's policy copies down onto staging every sixty
    // seconds whether anything changed or not, so one of these kept in the policy and tuned on
    // staging would be silently overwritten inside a minute, mid test, and would look like the
    // setting simply did not work. They live in call_tuning, which this mirror never carries.
    ok((await fetch(`${base}/api/call-tuning`)).status === 401, "the numbers are admin only");
    const got = await (await fetch(`${base}/api/call-tuning`, { headers: { "x-admin-token": "t" } })).json() as { rows: Array<{ key: string; seconds: number; why: string }> };
    const at = (k: string) => got.rows.find((x) => x.key === k);
    ok(got.rows.length === 5, `five numbers and no more (${got.rows.map((r) => r.key).join(", ")})`);
    ok(at("charlieWrapUpSeconds")?.seconds === 45, `Charlie wrap-up starts at the owner's 45 (${at("charlieWrapUpSeconds")?.seconds})`);
    ok(at("holdCapSeconds")?.seconds === 120, `the hold cap starts at two minutes (${at("holdCapSeconds")?.seconds})`);
    ok(at("holdQuietMs")?.seconds === 6, `silence before he is dropped starts at 6 (${at("holdQuietMs")?.seconds})`);
    // Added 08-03: we never hang up on a count of rings, and how long a check may run stops living
    // in the policy, where production copied down over it every sixty seconds.
    ok(at("ringWaitSeconds")?.seconds === 90, `the ring wait starts at 90 seconds (${at("ringWaitSeconds")?.seconds})`);
    ok(at("maxCheckSeconds")?.seconds === 240, `a whole check may run 240 seconds (${at("maxCheckSeconds")?.seconds})`);
    ok(got.rows.every((r) => !!r.why && !r.why.includes(r.key)), "each one says WHY, in words, never its code name");

    const save = async (body: Record<string, number>) => (await fetch(`${base}/api/call-tuning`, {
      method: "PATCH", headers: { "x-admin-token": "t", "content-type": "application/json" }, body: JSON.stringify(body),
    })).json() as Promise<{ ok?: boolean; rows?: Array<{ key: string; seconds: number }> }>;
    await save({ charlieWrapUpSeconds: 30, holdCapSeconds: 90, holdQuietMs: 5, ringWaitSeconds: 60, maxCheckSeconds: 300 });
    const live = await callTuning();
    ok(live.charlieWrapUpSeconds === 30, `the next check reads 30 seconds of talking (${live.charlieWrapUpSeconds})`);
    ok(live.holdCapSeconds === 90, `…and a 90 second wait cap (${live.holdCapSeconds})`);
    ok(live.holdQuietMs === 5000, `…and 5 seconds of silence, stored in milliseconds beside the rest (${live.holdQuietMs})`);
    ok(live.ringWaitSeconds === 60, `…a phone may ring for 60 seconds (${live.ringWaitSeconds})`);
    ok(live.maxCheckSeconds === 300, `…and a whole check may run 300 (${live.maxCheckSeconds})`);
    ok(live.prewarmLeadMs === 2000, "and every other number in the same setting is untouched by the save");

    // A typo can never produce a check that hangs or a gate that never fires.
    const refused = await save({ charlieWrapUpSeconds: 99999 }) as { error?: string };
    ok(!!refused.error && /between/.test(refused.error), `a number out of range is refused, and says the range (${refused.error})`);
    ok((await callTuning()).charlieWrapUpSeconds === 30, "…and the last good number is what the next check still uses");

    // THE MIRROR. Prod's export is applied over staging exactly as it is every sixty seconds.
    const before = await getSetting("call_tuning");
    await applySettingsExport({ policy_json: JSON.stringify({ pricing: { perCallCents: 30 } }), statuses: [] } as unknown as SettingsExport);
    ok((await getSetting("call_tuning")) === before, "a full mirror from production leaves the owner's numbers exactly as he tuned them");
    ok((await callTuning()).charlieWrapUpSeconds === 30, "…so a number tuned on staging mid test survives the minute");
  }

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

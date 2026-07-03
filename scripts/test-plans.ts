// Plans + entitlements: config normalization, checkout resolution, and the two-bucket credit model
// (subscription quota resets each cycle / PAYG never expires) driven through the real webhook handler.
// Run: env DATABASE_URL=file:./.t-plans.db ./node_modules/.bin/tsx scripts/test-plans.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts } from "../src/db/schema";
import { getAccountByPhone, chargeOneCredit, spendableCredits, handleStripeEvent } from "../src/billing";
import { normalizePlans, annualDefaultCents, resolvePlanCheckout, savePlans, getPlans, tierSync, bundleSync, DEFAULT_PLANS, accountFeatures, FEATURE_KEYS } from "../src/plans";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const acct = (id: string) => db.select().from(accounts).where(eq(accounts.clerkUserId, id)).then((r) => r[0]);

async function main() {
  await bootstrap();
  await setPolicy({ pricing: { freeChecks: 0 } } as never); // no signup free credit → clean balance math

  console.log("▶ normalize + annual default");
  const n = normalizePlans({ tiers: [{ key: "family", monthlyCents: "499" as unknown as number }] });
  ok(n.tiers.length === 4 && n.tiers.map((t) => t.key).join(",") === "family,collector,hunter,operator", "always yields the 4 canonical tiers low→high");
  ok(n.tiers[0].monthlyCents === 499 && n.tiers[0].annualCents === annualDefaultCents(499), "coerces cents + defaults annual to −17%×12");
  ok(n.tiers[3].key === "operator" && n.tiers[3].monthlyCents === 4999 && n.tiers[3].checksPerMonth === 300, "top tier Operator = $49.99 / 300 checks");
  ok(annualDefaultCents(999) === 9950, "annual default: 999/mo → 9950/yr");
  ok(n.payg.bundles.length === 5 && n.payg.bundles[0].checks === 10 && n.payg.bundles[0].cents === 990, "PAYG: 5 bundles, 10 checks = 99¢/check");
  ok(n.payg.bundles[4].checks === 100 && n.payg.bundles[4].cents === 6000, "PAYG top: 100 checks = 60¢/check");

  console.log("▶ premium-feature matrix (8 features, all ON for every paid tier by default)");
  ok(FEATURE_KEYS.length === 8 && FEATURE_KEYS.includes("thrift_hunts") && FEATURE_KEYS.includes("your_voice"), "8 features incl. thrift_hunts + your_voice");
  ok(n.tiers.every((t) => FEATURE_KEYS.every((k) => t.features[k] === true)), "every paid tier defaults ALL features ON");
  const off = normalizePlans({ tiers: [{ key: "family", features: { zone_sweeps: false } }] });
  ok(off.tiers[0].features.zone_sweeps === false && off.tiers[0].features.restock_alerts === true, "admin can turn ONE feature off per tier; others stay on");
  ok(off.tiers[0].premiumAsks === true, "premiumAsks derives from features.exact_products");
  const off2 = normalizePlans({ tiers: [{ key: "family", features: { exact_products: false } }] });
  ok(off2.tiers[0].premiumAsks === false, "turning off exact_products flips premiumAsks off");

  console.log("▶ checkout resolution");
  await savePlans(DEFAULT_PLANS);
  const sub = await resolvePlanCheckout("collector", false);
  ok(sub?.mode === "subscription" && sub.cents === 999 && sub.interval === "month" && sub.metadata.checks === "30", "tier monthly → subscription w/ quota metadata");
  const subY = await resolvePlanCheckout("collector", true);
  ok(subY?.interval === "year" && subY.cents === annualDefaultCents(999), "annual flag → yearly interval + annual cents");
  const family = await resolvePlanCheckout("family", false);
  ok(family?.cents === 499 && family.metadata.checks === "15", "Family = $4.99 / 15 checks");
  const hunter = await resolvePlanCheckout("hunter", false);
  ok(hunter?.metadata.premiumAsks === "1", "Hunter carries premiumAsks entitlement (all-on default)");
  const payg = await resolvePlanCheckout("payg:50", false);
  ok(payg?.mode === "payment" && payg.cents === 3499 && payg.metadata.credits === "50", "payg:50 → one-time 50-credit payment");
  ok((await resolvePlanCheckout("nonsense", false)) === null, "unknown kind → null (legacy fallback)");

  console.log("▶ sync status");
  const cfg = await getPlans();
  ok(tierSync(cfg.tiers[0]) === "pending", "unpublished tier is pending");
  cfg.tiers[0].pub = { name: cfg.tiers[0].name, monthlyCents: cfg.tiers[0].monthlyCents, annualCents: cfg.tiers[0].annualCents };
  ok(tierSync(cfg.tiers[0]) === "in_sync", "matching publish snapshot → in_sync");
  cfg.tiers[0].monthlyCents = 599;
  ok(tierSync(cfg.tiers[0]) === "pending", "a price change flips it back to pending");
  ok(bundleSync({ checks: 10, cents: 999, priceId: null, pubCents: null }) === "pending", "unpublished bundle pending");
  ok(bundleSync({ checks: 10, cents: 999, priceId: "price_x", pubCents: 999 }) === "in_sync", "published+unchanged bundle in_sync");

  console.log("▶ subscription entitlement: quota SET (reset, not add)");
  const buyer = await getAccountByPhone("+13105551111");
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", amount_total: 999, customer: "cus_P1", client_reference_id: buyer.clerkUserId, metadata: { clerkUserId: buyer.clerkUserId, kind: "sub", tierKey: "collector", checks: "30" } } } });
  let a = await acct(buyer.clerkUserId);
  ok(a.subscription === "active" && a.subTier === "collector", "subscription active + tier recorded");
  ok(a.quotaCredits === 30 && a.credits === 0, "quota set to 30 (PAYG untouched)");

  console.log("▶ PAYG stacks on top and never touches quota");
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: { mode: "payment", amount_total: 3499, metadata: { clerkUserId: buyer.clerkUserId, kind: "payg", credits: "50" } } } });
  a = await acct(buyer.clerkUserId);
  ok(a.credits === 50 && a.quotaCredits === 30, "PAYG adds 50 to the permanent balance; quota still 30");
  ok(spendableCredits(a) === 80, "spendable = quota + PAYG = 80");

  console.log("▶ spend order: quota burns first");
  for (let i = 0; i < 30; i++) await chargeOneCredit(buyer.clerkUserId);
  a = await acct(buyer.clerkUserId);
  ok(a.quotaCredits === 0 && a.credits === 50, "30 charges drained quota, PAYG untouched");
  await chargeOneCredit(buyer.clerkUserId);
  a = await acct(buyer.clerkUserId);
  ok(a.credits === 49, "31st charge falls through to PAYG");

  console.log("▶ renewal RESETS quota (no rollover of the 49 unused? PAYG stays; quota→30)");
  await handleStripeEvent({ type: "invoice.paid", data: { object: { billing_reason: "subscription_cycle", customer: "cus_P1", amount_paid: 999 } } });
  a = await acct(buyer.clerkUserId);
  ok(a.quotaCredits === 30, "renewal resets quota to the tier's 30 (not +30)");
  ok(a.credits === 49, "PAYG balance survives the renewal");

  console.log("▶ cancellation forfeits quota, keeps PAYG");
  await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_P1" } } });
  a = await acct(buyer.clerkUserId);
  ok(a.subscription === "none" && a.subTier === null && a.quotaCredits === 0, "cancel: sub off, tier cleared, quota forfeited");
  ok(a.credits === 49, "PAYG credits never expire — still 49 after cancel");

  console.log("▶ feature entitlement by account");
  const paid = await accountFeatures("collector");
  ok(FEATURE_KEYS.every((k) => paid[k] === true), "a subscriber gets their tier's features (all on)");
  const payU = await accountFeatures(null);
  ok(FEATURE_KEYS.every((k) => payU[k] === false), "PAYG/free (no tier) → NO premium features");
  const compU = await accountFeatures(null, true);
  ok(FEATURE_KEYS.every((k) => compU[k] === true), "comp/founder → all features");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

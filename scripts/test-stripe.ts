// Unit tests for the Stripe billing pipe: signature verification + event handling → credits and
// subscription state. Exercises the REAL production code path (verifyStripeSig → handleStripeEvent)
// with synthetic events signed exactly the way Stripe signs them.
// Run: env DATABASE_URL=file:./.t-stripe.db STRIPE_WEBHOOK_SECRET=whsec_test ./node_modules/.bin/tsx scripts/test-stripe.ts
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts } from "../src/db/schema";
import { getAccountByPhone, verifyStripeSig, handleStripeEvent } from "../src/billing";
import { savePlans, getPlans, DEFAULT_PLANS } from "../src/plans";
import { setPolicy, getPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

/** Sign a payload the way Stripe does: HMAC-SHA256 over `t.payload`, header `t=..,v1=..`. */
function stripeSign(payload: string, secret: string, t = 1782900000): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function main() {
  await bootstrap();
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
  const pol = await getPolicy();

  console.log("▶ webhook signature verification");
  const payload = JSON.stringify({ type: "ping" });
  ok(await verifyStripeSig(payload, stripeSign(payload, SECRET)), "correctly-signed payload accepted");
  ok(!(await verifyStripeSig(payload, stripeSign(payload, "whsec_WRONG"))), "wrong-secret signature rejected");
  ok(!(await verifyStripeSig(payload, null)), "missing signature header rejected");
  ok(!(await verifyStripeSig(payload + "tamper", stripeSign(payload, SECRET))), "tampered payload rejected");

  console.log("▶ pack purchase: checkout.session.completed → credits + revenue");
  const buyer = await getAccountByPhone("+13105550001");
  const before = buyer.credits;
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: {
    mode: "payment", amount_total: 2000, client_reference_id: buyer.clerkUserId,
    metadata: { clerkUserId: buyer.clerkUserId, kind: "pack", credits: "100" },
  } } });
  let row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.credits === before + 100, `pack grants 100 credits (${before} → ${row.credits})`);
  ok(row.totalSpentCents >= 2000, "purchase revenue recorded on the account");

  console.log("▶ subscription: checkout.session.completed (mode=subscription) → active + monthly credits");
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: {
    mode: "subscription", amount_total: 499, customer: "cus_TEST1", client_reference_id: buyer.clerkUserId,
    metadata: { clerkUserId: buyer.clerkUserId, kind: "sub", tierKey: "family", checks: "15" },
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.subscription === "active" && row.subTier === "family", "subscription flips active on the Family tier");
  ok(row.stripeCustomerId === "cus_TEST1", "stripe customer id stored");
  ok(row.quotaCredits === 15 && row.credits === before + 100, "quota SET to 15; PAYG (100) untouched");

  console.log("▶ renewal: invoice.paid (subscription_cycle) → quota reset to the tier allotment");
  await db.update(accounts).set({ quotaCredits: 3 }).where(eq(accounts.clerkUserId, buyer.clerkUserId)); // simulate a partly-spent cycle
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_cycle", customer: "cus_TEST1", amount_paid: 499,
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  // Derive the expected quota from the live ladder — hardcoding it went stale when the ladder changed.
  const familyQuota = (await getPlans()).tiers.find((t) => t.key === "family")!.checksPerMonth;
  ok(row.quotaCredits === familyQuota, `renewal RESETS quota to Family's ${familyQuota} (no rollover)`);

  console.log("▶ subscription_create with no mapped price → no-op (hosted path already granted)");
  const beforeCreate = row.credits;
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_create", customer: "cus_TEST1", amount_paid: pol.pricing.sub.cents,
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.credits === beforeCreate, "unmapped subscription_create grants nothing (checkout.session owns hosted)");

  console.log("▶ cancellation: customer.subscription.deleted → back to none");
  await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_TEST1" } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.subscription === "none", "subscription flips off on cancellation");

  console.log("▶ embedded Elements: subscription_create invoice sets the tier (no checkout.session)");
  // Give the collector tier a price id so the webhook can map invoice → tier (look it up by key —
  // indexing tiers[1] broke silently when the ladder was reordered).
  const cfg = await getPlans();
  const coll = cfg.tiers.find((t) => t.key === "collector")!;
  coll.monthlyPriceId = "price_COLL_M"; await savePlans(cfg);
  const collQuota = coll.checksPerMonth;
  const el = await getAccountByPhone("+13105550777");
  await db.update(accounts).set({ stripeCustomerId: "cus_EL1" }).where(eq(accounts.clerkUserId, el.clerkUserId));
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_create", customer: "cus_EL1", amount_paid: 999,
    lines: { data: [{ price: { id: "price_COLL_M" } }] },
  } } });
  let er = (await db.select().from(accounts).where(eq(accounts.clerkUserId, el.clerkUserId)))[0];
  ok(er.subscription === "active" && er.subTier === "collector" && er.quotaCredits === collQuota, `Elements first invoice → active Collector w/ ${collQuota} quota`);

  console.log("▶ embedded Elements: NEW Stripe payload shape (pricing.price_details.price) also maps the tier");
  // Stripe API ≥2025 (e.g. 2026-05-27.dahlia) drops line.price — the id lives at
  // line.pricing.price_details.price. Live staging events carry THIS shape.
  const el2 = await getAccountByPhone("+13105550778");
  await db.update(accounts).set({ stripeCustomerId: "cus_EL2" }).where(eq(accounts.clerkUserId, el2.clerkUserId));
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_create", customer: "cus_EL2", amount_paid: 999,
    lines: { data: [{ pricing: { price_details: { price: "price_COLL_M", product: "prod_X" } }, type: "price_details" }] },
  } } });
  const er2 = (await db.select().from(accounts).where(eq(accounts.clerkUserId, el2.clerkUserId)))[0];
  ok(er2.subscription === "active" && er2.subTier === "collector" && er2.quotaCredits === collQuota, `new-shape invoice.paid → active Collector w/ ${collQuota} quota`);

  console.log("▶ embedded Elements: PAYG payment_intent.succeeded grants once (idempotent)");
  const beforePayg = er.credits;
  const piEvt = { type: "payment_intent.succeeded", data: { object: {
    id: "pi_EL_777", amount_received: 1999, metadata: { source: "elements", kind: "payg", clerkUserId: el.clerkUserId, credits: "25" },
  } } } as const;
  await handleStripeEvent(piEvt);
  await handleStripeEvent(piEvt); // duplicate delivery
  er = (await db.select().from(accounts).where(eq(accounts.clerkUserId, el.clerkUserId)))[0];
  ok(er.credits === beforePayg + 25, "Elements PAYG grants 25 exactly once despite duplicate webhook");
  await handleStripeEvent({ type: "payment_intent.succeeded", data: { object: { id: "pi_hosted", amount_received: 500, metadata: {} } } });
  er = (await db.select().from(accounts).where(eq(accounts.clerkUserId, el.clerkUserId)))[0];
  ok(er.credits === beforePayg + 25, "a non-Elements PI (no metadata) grants nothing (hosted path owns it)");

  console.log("▶ unknown user / malformed events are safe no-ops");
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: { mode: "payment", metadata: { credits: "50" } } } });
  await handleStripeEvent({ type: "invoice.paid", data: { object: { billing_reason: "subscription_cycle", customer: "cus_NOBODY" } } });
  await handleStripeEvent({ type: "some.future.event", data: {} });
  ok(true, "no throws on missing user / unknown customer / unknown event type");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

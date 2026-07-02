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
    mode: "subscription", amount_total: pol.pricing.sub.cents, customer: "cus_TEST1",
    client_reference_id: buyer.clerkUserId,
    metadata: { clerkUserId: buyer.clerkUserId, kind: "sub", credits: String(pol.pricing.sub.credits) },
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.subscription === "active", "subscription flips active");
  ok(row.stripeCustomerId === "cus_TEST1", "stripe customer id stored");
  ok(row.credits === before + 100 + pol.pricing.sub.credits, "first month's credits granted");

  console.log("▶ renewal: invoice.paid (subscription_cycle) → monthly credits again");
  const beforeRenew = row.credits;
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_cycle", customer: "cus_TEST1", amount_paid: pol.pricing.sub.cents,
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.credits === beforeRenew + pol.pricing.sub.credits, "renewal grants the monthly credits");

  console.log("▶ first invoice is NOT double-granted (billing_reason=subscription_create ignored)");
  const beforeCreate = row.credits;
  await handleStripeEvent({ type: "invoice.paid", data: { object: {
    billing_reason: "subscription_create", customer: "cus_TEST1", amount_paid: pol.pricing.sub.cents,
  } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.credits === beforeCreate, "subscription_create invoice grants nothing (checkout already did)");

  console.log("▶ cancellation: customer.subscription.deleted → back to none");
  await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_TEST1" } } });
  row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, buyer.clerkUserId)))[0];
  ok(row.subscription === "none", "subscription flips off on cancellation");

  console.log("▶ unknown user / malformed events are safe no-ops");
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: { mode: "payment", metadata: { credits: "50" } } } });
  await handleStripeEvent({ type: "invoice.paid", data: { object: { billing_reason: "subscription_cycle", customer: "cus_NOBODY" } } });
  await handleStripeEvent({ type: "some.future.event", data: {} });
  ok(true, "no throws on missing user / unknown customer / unknown event type");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

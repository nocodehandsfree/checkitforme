// Runnr billing: per-user accounts, credits, Stripe Checkout (packs + subscription), webhooks.
// Uses the Stripe REST API directly (no SDK) and Drizzle for the accounts table.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { accounts } from "./db/schema";
import { getPolicy } from "./policy";

/** Constant-time string compare (length-checked) — avoids timing side-channels on HMAC checks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Pricing catalog (one-time credit packs + the $4.99 subscription) ----
export const SUB = { cents: 499, credits: 20, label: "Fungibles Membership" };
export const PACKS: Record<string, { credits: number; cents: number; label: string }> = {
  starter: { credits: 20, cents: 500, label: "20 store checks" },
  hunter: { credits: 100, cents: 2000, label: "100 store checks" },
  pro: { credits: 300, cents: 5000, label: "300 store checks" },
};

// ---- Accounts ----
// Comp accounts (owner/testers) get unlimited free checks — never gated, never charged.
export function isComp(email?: string | null): boolean {
  const list = (process.env.COMP_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export async function getAccount(userId: string, email?: string) {
  let row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, userId)))[0];
  if (!row) {
    // Phone-first model: free checks land on the ACCOUNT at signup (replaces the anonymous pool).
    // Flag-gated so the live anonymous flow is unchanged until we flip the whole model on.
    const pol = await getPolicy();
    const free = pol.flags.requirePhoneSignup ? Math.max(0, pol.pricing.freeChecks || 0) : 0;
    await db.insert(accounts).values({ clerkUserId: userId, email: email ?? null, credits: free }).onConflictDoNothing();
    row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, userId)))[0];
  } else if (email && !row.email) {
    await db.update(accounts).set({ email }).where(eq(accounts.clerkUserId, userId));
    row = { ...row, email };
  }
  return row;
}

export async function chargeOneCredit(userId: string): Promise<boolean> {
  // Atomic guarded decrement: the WHERE credits>0 makes concurrent charges race-safe (no
  // read-then-write window, can never go negative). rowsAffected===1 ⇒ we actually charged.
  await getAccount(userId); // ensure the account row exists first
  const res = await db.update(accounts)
    .set({ credits: sql`${accounts.credits} - 1`, callsMade: sql`${accounts.callsMade} + 1` })
    .where(and(eq(accounts.clerkUserId, userId), gt(accounts.credits, 0)));
  return (res.rowsAffected ?? 0) > 0;
}

export async function grantCredits(userId: string, n: number, spentCents = 0) {
  const a = await getAccount(userId);
  if (!a) return;
  await db.update(accounts)
    .set({ credits: a.credits + n, totalSpentCents: a.totalSpentCents + spentCents })
    .where(eq(accounts.clerkUserId, userId));
}

async function setSubscription(userId: string, active: boolean, customerId?: string) {
  const a = await getAccount(userId);
  if (!a) return;
  await db.update(accounts)
    .set({ subscription: active ? "active" : "none", stripeCustomerId: customerId ?? a.stripeCustomerId })
    .where(eq(accounts.clerkUserId, userId));
}

// ---- Stripe Checkout (inline price_data — no pre-created products needed) ----
export async function createCheckout(userId: string, email: string | undefined, kind: string, origin: string): Promise<string | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return null;
  const p = new URLSearchParams();
  p.set("success_url", `${origin}/?paid=1`);
  p.set("cancel_url", `${origin}/`);
  p.set("client_reference_id", userId);
  if (email) p.set("customer_email", email);
  p.set("metadata[clerkUserId]", userId);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "usd");
  const pol = await getPolicy(); // owner-tunable pricing
  if (kind === "sub") {
    p.set("mode", "subscription");
    p.set("line_items[0][price_data][unit_amount]", String(pol.pricing.sub.cents));
    p.set("line_items[0][price_data][product_data][name]", pol.pricing.sub.label);
    p.set("line_items[0][price_data][recurring][interval]", "month");
    p.set("metadata[kind]", "sub");
    p.set("metadata[credits]", String(pol.pricing.sub.credits));
    p.set("subscription_data[metadata][clerkUserId]", userId);
  } else {
    const pack = pol.pricing.packs.find((x) => x.key === kind);
    if (!pack) return null;
    p.set("mode", "payment");
    p.set("line_items[0][price_data][unit_amount]", String(pack.cents));
    p.set("line_items[0][price_data][product_data][name]", `Runnr — ${pack.label}`);
    p.set("metadata[kind]", "pack");
    p.set("metadata[credits]", String(pack.credits));
  }
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${sk}`, "content-type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  if (!r.ok) { console.error("stripe checkout failed:", await r.text()); return null; }
  const d = (await r.json()) as { url?: string };
  return d.url ?? null;
}

// ---- Webhook: verify Stripe signature, then grant credits / toggle subscription ----
export async function verifyStripeSig(payload: string, header: string | null): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true; // not configured (dev) — accept
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const actual = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(actual, v1);
}

interface StripeEvent { type: string; data?: { object?: Record<string, unknown> } }
export async function handleStripeEvent(event: StripeEvent) {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  if (event.type === "checkout.session.completed") {
    const md = (obj.metadata ?? {}) as Record<string, string>;
    const userId = md.clerkUserId || (obj.client_reference_id as string);
    const credits = Number(md.credits || 0);
    const amount = Number(obj.amount_total || 0);
    if (!userId) return;
    if (obj.mode === "subscription") {
      await setSubscription(userId, true, obj.customer as string);
      if (credits) await grantCredits(userId, credits, amount);
    } else if (credits) {
      await grantCredits(userId, credits, amount);
    }
  } else if (event.type === "invoice.paid") {
    // Only renewals (subscription_cycle) — the first invoice is handled by checkout.session.completed.
    if (obj.billing_reason !== "subscription_cycle") return;
    const customer = obj.customer as string;
    const amount = Number(obj.amount_paid || 0);
    const a = (await db.select().from(accounts).where(eq(accounts.stripeCustomerId, customer)))[0];
    if (a) await grantCredits(a.clerkUserId, (await getPolicy()).pricing.sub.credits, amount);
  } else if (event.type === "customer.subscription.deleted") {
    const customer = obj.customer as string;
    const a = (await db.select().from(accounts).where(eq(accounts.stripeCustomerId, customer)))[0];
    if (a) await setSubscription(a.clerkUserId, false);
  }
}

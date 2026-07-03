// Runnr billing: per-user accounts, credits, Stripe Checkout (packs + subscription), webhooks.
// Uses the Stripe REST API directly (no SDK) and Drizzle for the accounts table.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { accounts } from "./db/schema";
import { getPolicy } from "./policy";
import { resolvePlanCheckout, tierQuota } from "./plans";

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
// The owner's "master line": signing in from this verified cell ties the phone account to the owner
// email (a comp email), so the master user gets unlimited checks + master powers (any-ZIP search,
// live-listen) the moment they log in by phone. Both are env-overridable; the defaults are the owner's
// already-committed caller-ID number and master email.
const OWNER_PHONE = (process.env.OWNER_PHONE || "+13106662331").trim();
// The master IDENTITY email — the account that owns history/credits across every login. This is NOT
// process.env.OWNER_EMAIL (that var is the alerts inbox); it's the owner's comp identity. The phone
// login ties to THIS so the master's existing history + credits follow them.
const MASTER_EMAIL = (process.env.MASTER_EMAIL || "fun@fungibles.com").trim().toLowerCase();

// Comp accounts (owner/testers) get unlimited free checks — never gated, never charged.
export function isComp(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if (e === MASTER_EMAIL) return true; // master email is always comp, even if COMP_EMAILS is unset
  const list = (process.env.COMP_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(e);
}

/** Comp by PHONE (COMP_PHONES, E.164) — so a phone-first master/owner account is comp even with no email. */
export function isCompPhone(phone?: string | null): boolean {
  const list = (process.env.COMP_PHONES || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!phone && list.includes(phone.toLowerCase());
}
/** True if this account is comp by EITHER its email or its verified phone (the phone-first path). */
export function isCompAccount(a?: { email?: string | null; phone?: string | null } | null): boolean {
  return !!a && (isComp(a.email) || isCompPhone(a.phone));
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
  // Pin the owner's phone account to the master identity so the master's history + credits unify —
  // repairs an account created on the wrong email before the master-tie fix (runs on next /app/me).
  if (row && userId === `phone:${OWNER_PHONE}` && (row.email || "").toLowerCase() !== MASTER_EMAIL) {
    await db.update(accounts).set({ email: MASTER_EMAIL }).where(eq(accounts.clerkUserId, userId));
    row = { ...row, email: MASTER_EMAIL };
  }
  return row;
}

/** Find or create the account for a phone-first user (keyed by `phone:<E.164>`), granting the
 *  signup free checks on creation. The phone IS the identity in the new (Clerk-free) model. */
export async function getAccountByPhone(phone: string) {
  const id = `phone:${phone}`;
  // Owner's cell → tie this phone account to the master email so comp/master powers light up on login.
  const ownerEmail = phone === OWNER_PHONE ? MASTER_EMAIL : null;
  let row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  if (!row) {
    const free = Math.max(0, (await getPolicy()).pricing.freeChecks || 0);
    // NOTE: do NOT set caller_id here — a number is only usable as a From after Twilio's caller-ID
    // verification call (/auth/callerid). caller_id stays null until then; calls fall back to the house line.
    await db.insert(accounts).values({ clerkUserId: id, phone, email: ownerEmail, credits: free }).onConflictDoNothing();
    row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  } else if (ownerEmail && row.email !== ownerEmail) {
    // Backfill the master tie on a phone account that predates this mapping.
    await db.update(accounts).set({ email: ownerEmail }).where(eq(accounts.clerkUserId, id));
    row = { ...row, email: ownerEmail };
  }
  return row;
}

/** Read-only: does a phone-first account already exist? (Never creates one — used by the login screen
 *  to show "Welcome back" vs "First check's on us" without registering the number.) */
export async function phoneAccountExists(phone: string): Promise<boolean> {
  const row = (await db.select().from(accounts).where(eq(accounts.clerkUserId, `phone:${phone}`)))[0];
  return !!row;
}

/** Total spendable checks = subscription quota (use-it-or-lose-it) + PAYG balance (permanent). */
export function spendableCredits(a?: { credits?: number; quotaCredits?: number } | null): number {
  return a ? (a.credits ?? 0) + (a.quotaCredits ?? 0) : 0;
}

export async function chargeOneCredit(userId: string): Promise<boolean> {
  // Spend the subscription quota FIRST (it resets each cycle and doesn't roll over — burn it before
  // touching the PAYG balance, which never expires). Each decrement is an atomic guarded update
  // (WHERE bucket>0) so concurrent charges are race-safe and can never go negative.
  await getAccount(userId); // ensure the account row exists first
  const fromQuota = await db.update(accounts)
    .set({ quotaCredits: sql`${accounts.quotaCredits} - 1`, callsMade: sql`${accounts.callsMade} + 1` })
    .where(and(eq(accounts.clerkUserId, userId), gt(accounts.quotaCredits, 0)));
  if ((fromQuota.rowsAffected ?? 0) > 0) return true;
  const fromPayg = await db.update(accounts)
    .set({ credits: sql`${accounts.credits} - 1`, callsMade: sql`${accounts.callsMade} + 1` })
    .where(and(eq(accounts.clerkUserId, userId), gt(accounts.credits, 0)));
  return (fromPayg.rowsAffected ?? 0) > 0;
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

/** Grant a subscription tier: activate, record the tier, and RESET the monthly quota to `checks`
 *  (a reset, not an add — unused checks don't roll over). PAYG `credits` are untouched. */
export async function setSubEntitlement(userId: string, tierKey: string, checks: number, customerId?: string) {
  const a = await getAccount(userId);
  if (!a) return;
  await db.update(accounts)
    .set({ subscription: "active", subTier: tierKey, quotaCredits: Math.max(0, Math.round(checks)), stripeCustomerId: customerId ?? a.stripeCustomerId })
    .where(eq(accounts.clerkUserId, userId));
}
/** Reset the monthly quota for an active subscriber (billing-cycle renewal). No rollover. */
export async function resetQuota(userId: string, checks: number) {
  await db.update(accounts).set({ quotaCredits: Math.max(0, Math.round(checks)) }).where(eq(accounts.clerkUserId, userId));
}
/** End a subscription: drop the tier + forfeit the remaining quota; PAYG credits stay. */
export async function clearSubEntitlement(userId: string) {
  await db.update(accounts).set({ subscription: "none", subTier: null, quotaCredits: 0 }).where(eq(accounts.clerkUserId, userId));
}

// ---- Stripe Checkout ----
// Resolution order: (1) the owner's Plans config (tiers `starter|collector|hunter`, or `payg:<n>`)
// — uses the published Price id when synced, else an inline price_data fallback so checkout works
// before/without a publish; (2) legacy policy packs/`sub` for back-compat during the migration.
export async function createCheckout(userId: string, email: string | undefined, kind: string, origin: string, annual = false): Promise<string | null> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return null;
  const p = new URLSearchParams();
  p.set("success_url", `${origin}/?paid=1`);
  p.set("cancel_url", `${origin}/`);
  p.set("client_reference_id", userId);
  if (email) p.set("customer_email", email);
  p.set("metadata[clerkUserId]", userId);
  p.set("line_items[0][quantity]", "1");

  const plan = await resolvePlanCheckout(kind, annual);
  if (plan) {
    p.set("mode", plan.mode);
    if (plan.priceId) {
      p.set("line_items[0][price]", plan.priceId);
    } else {
      p.set("line_items[0][price_data][currency]", "usd");
      p.set("line_items[0][price_data][unit_amount]", String(plan.cents));
      p.set("line_items[0][price_data][product_data][name]", plan.productName);
      if (plan.interval) p.set("line_items[0][price_data][recurring][interval]", plan.interval);
    }
    for (const [k, v] of Object.entries(plan.metadata)) p.set(`metadata[${k}]`, v);
    if (plan.mode === "subscription") {
      p.set("subscription_data[metadata][clerkUserId]", userId);
      p.set("subscription_data[metadata][tierKey]", plan.metadata.tierKey || "");
    }
  } else {
    // Legacy fallback (policy packs / the old $ sub) — keeps pre-migration checkout links alive.
    const pol = await getPolicy();
    p.set("line_items[0][price_data][currency]", "usd");
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
      p.set("line_items[0][price_data][product_data][name]", `Check It For Me — ${pack.label}`);
      p.set("metadata[kind]", "pack");
      p.set("metadata[credits]", String(pack.credits));
    }
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
    const amount = Number(obj.amount_total || 0);
    if (!userId) return;
    if (obj.mode === "subscription") {
      // Tier subscription: activate + SET the monthly quota (reset, not add). `checks` is the tier
      // allotment; falls back to legacy `credits` for old sub links.
      const tierKey = md.tierKey || "sub";
      const checks = Number(md.checks || md.credits || 0);
      await setSubEntitlement(userId, tierKey, checks, obj.customer as string);
      if (amount) await bumpRevenue(userId, amount);
    } else {
      // PAYG one-time: add permanent credits.
      const credits = Number(md.credits || 0);
      if (credits) await grantCredits(userId, credits, amount);
    }
  } else if (event.type === "invoice.paid") {
    // Only renewals (subscription_cycle) — the first invoice is checkout.session.completed's job.
    if (obj.billing_reason !== "subscription_cycle") return;
    const customer = obj.customer as string;
    const amount = Number(obj.amount_paid || 0);
    const a = (await db.select().from(accounts).where(eq(accounts.stripeCustomerId, customer)))[0];
    if (a) { await resetQuota(a.clerkUserId, await tierQuota(a.subTier)); await bumpRevenue(a.clerkUserId, amount); }
  } else if (event.type === "customer.subscription.deleted") {
    const customer = obj.customer as string;
    const a = (await db.select().from(accounts).where(eq(accounts.stripeCustomerId, customer)))[0];
    if (a) await clearSubEntitlement(a.clerkUserId);
  }
}

/** Record subscription revenue without granting credits (quota is set separately). */
async function bumpRevenue(userId: string, cents: number) {
  if (cents <= 0) return;
  await db.update(accounts).set({ totalSpentCents: sql`${accounts.totalSpentCents} + ${cents}` }).where(eq(accounts.clerkUserId, userId));
}

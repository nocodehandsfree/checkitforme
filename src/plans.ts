// Plans + PAYG: the owner-editable pricing source of truth (settings key `vt_plans`), and the Stripe
// Product/Price publishing that mirrors it. The Admin "Plans" tab (God View) edits this config and
// hits /api/admin/plans/publish; quota enforcement + checkout read it. Stripe Prices are immutable,
// so a price change = create a NEW price + archive the old one; Products are only ever archived,
// never deleted (never orphan an active subscriber).
import { getSetting, setSetting } from "./db/settings";

export interface Tier {
  key: string;            // stable id ("starter"|"collector"|"hunter") — checkout `kind` + entitlement key
  name: string;
  monthlyCents: number;
  annualCents: number;    // billed once/year; default = −17% of 12×monthly (owner-editable)
  checksPerMonth: number; // subscription quota, reset each billing cycle (no rollover)
  premiumAsks: boolean;   // exact set/product/price questions on the call (Hunter)
  stripeProductId: string | null;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  pub: { name: string; monthlyCents: number; annualCents: number } | null; // last-published snapshot → sync status
}
export interface Bundle { checks: number; cents: number; priceId: string | null; pubCents: number | null }
export interface PlansConfig {
  tiers: Tier[];
  payg: { stripeProductId: string | null; bundles: Bundle[] };
}

/** Annual default: 12 months at −17% (matches the site comps). Owner can override per tier. */
export const annualDefaultCents = (monthlyCents: number): number => Math.round(monthlyCents * 12 * 0.83);

export const DEFAULT_PLANS: PlansConfig = {
  tiers: [
    { key: "starter",   name: "Starter",   monthlyCents: 499,  annualCents: annualDefaultCents(499),  checksPerMonth: 15,  premiumAsks: false, stripeProductId: null, monthlyPriceId: null, annualPriceId: null, pub: null },
    { key: "collector", name: "Collector", monthlyCents: 999,  annualCents: annualDefaultCents(999),  checksPerMonth: 30,  premiumAsks: false, stripeProductId: null, monthlyPriceId: null, annualPriceId: null, pub: null },
    { key: "hunter",    name: "Hunter",    monthlyCents: 1999, annualCents: annualDefaultCents(1999), checksPerMonth: 100, premiumAsks: true,  stripeProductId: null, monthlyPriceId: null, annualPriceId: null, pub: null },
  ],
  payg: {
    stripeProductId: null,
    bundles: [
      { checks: 10,  cents: 999,  priceId: null, pubCents: null },
      { checks: 25,  cents: 1999, priceId: null, pubCents: null },
      { checks: 50,  cents: 3499, priceId: null, pubCents: null },
      { checks: 75,  cents: 4799, priceId: null, pubCents: null },
      { checks: 100, cents: 5999, priceId: null, pubCents: null },
    ],
  },
};

const clampCents = (n: unknown): number => Math.max(0, Math.round(Number(n) || 0));

/** Merge a stored/partial config onto the defaults, coercing numbers and preserving Stripe ids. */
export function normalizePlans(raw: unknown): PlansConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlansConfig>;
  const tiers = DEFAULT_PLANS.tiers.map((d) => {
    const t = (r.tiers || []).find((x) => x && x.key === d.key) as Partial<Tier> | undefined;
    if (!t) return { ...d };
    const monthlyCents = clampCents(t.monthlyCents ?? d.monthlyCents);
    return {
      key: d.key,
      name: String(t.name ?? d.name).slice(0, 40) || d.name,
      monthlyCents,
      annualCents: t.annualCents != null ? clampCents(t.annualCents) : annualDefaultCents(monthlyCents),
      checksPerMonth: Math.max(0, Math.round(Number(t.checksPerMonth ?? d.checksPerMonth) || 0)),
      premiumAsks: !!(t.premiumAsks ?? d.premiumAsks),
      stripeProductId: t.stripeProductId ?? null,
      monthlyPriceId: t.monthlyPriceId ?? null,
      annualPriceId: t.annualPriceId ?? null,
      pub: t.pub ?? null,
    } as Tier;
  });
  const rawBundles = (r.payg?.bundles && r.payg.bundles.length ? r.payg.bundles : DEFAULT_PLANS.payg.bundles) as Partial<Bundle>[];
  const bundles = rawBundles
    .map((b) => ({ checks: Math.max(1, Math.round(Number(b.checks) || 0)), cents: clampCents(b.cents), priceId: b.priceId ?? null, pubCents: b.pubCents ?? null }))
    .filter((b) => b.checks > 0)
    .sort((a, b) => a.checks - b.checks);
  return { tiers, payg: { stripeProductId: r.payg?.stripeProductId ?? null, bundles } };
}

export async function getPlans(): Promise<PlansConfig> {
  try { return normalizePlans(JSON.parse((await getSetting("vt_plans")) || "null")); }
  catch { return normalizePlans(null); }
}
export async function savePlans(cfg: PlansConfig): Promise<PlansConfig> {
  const clean = normalizePlans(cfg);
  await setSetting("vt_plans", JSON.stringify(clean));
  return clean;
}

/** Per-tier / per-bundle sync status vs the last publish. */
export function tierSync(t: Tier): "in_sync" | "pending" {
  return t.pub && t.pub.name === t.name && t.pub.monthlyCents === t.monthlyCents && t.pub.annualCents === t.annualCents ? "in_sync" : "pending";
}
export function bundleSync(b: Bundle): "in_sync" | "pending" {
  return b.priceId && b.pubCents === b.cents ? "in_sync" : "pending";
}
export function plansSyncView(cfg: PlansConfig) {
  return {
    tiers: cfg.tiers.map((t) => ({ ...t, sync: tierSync(t) })),
    payg: { ...cfg.payg, bundles: cfg.payg.bundles.map((b) => ({ ...b, sync: bundleSync(b) })) },
  };
}

/** The public shape Website's checkout sheet renders from (no Stripe ids). */
export function publicPlans(cfg: PlansConfig) {
  return {
    tiers: cfg.tiers.map((t) => ({ key: t.key, name: t.name, monthlyCents: t.monthlyCents, annualCents: t.annualCents, checksPerMonth: t.checksPerMonth, premiumAsks: t.premiumAsks })),
    payg: cfg.payg.bundles.map((b) => ({ checks: b.checks, cents: b.cents })),
  };
}

// ---- Stripe REST (no SDK; same style as billing.ts) ----
async function stripe(path: string, params?: Record<string, string>, method = "POST"): Promise<Record<string, unknown>> {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error("stripe_key_missing");
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: { Authorization: `Bearer ${sk}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const d = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`stripe ${path}: ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

/**
 * Mirror the config into Stripe. Idempotent: only creates a new Price when the amount changed (or none
 * exists), archiving the price it replaces. Products are created once and only renamed/archived —
 * never deleted, so an active subscriber's product never disappears. Mutates + returns `cfg`.
 */
export async function publishPlansToStripe(cfg: PlansConfig): Promise<PlansConfig> {
  for (const t of cfg.tiers) {
    if (!t.stripeProductId) {
      const p = await stripe("/products", { name: `Check ${t.name}`, "metadata[tierKey]": t.key });
      t.stripeProductId = p.id as string;
    } else if (!t.pub || t.pub.name !== t.name) {
      await stripe(`/products/${t.stripeProductId}`, { name: `Check ${t.name}` });
    }
    // monthly
    if (!t.monthlyPriceId || !t.pub || t.pub.monthlyCents !== t.monthlyCents) {
      const old = t.monthlyPriceId;
      const price = await stripe("/prices", { product: t.stripeProductId, currency: "usd", unit_amount: String(t.monthlyCents), "recurring[interval]": "month", "metadata[tierKey]": t.key, "metadata[dim]": "monthly" });
      t.monthlyPriceId = price.id as string;
      if (old) await stripe(`/prices/${old}`, { active: "false" }).catch(() => {});
    }
    // annual
    if (!t.annualPriceId || !t.pub || t.pub.annualCents !== t.annualCents) {
      const old = t.annualPriceId;
      const price = await stripe("/prices", { product: t.stripeProductId, currency: "usd", unit_amount: String(t.annualCents), "recurring[interval]": "year", "metadata[tierKey]": t.key, "metadata[dim]": "annual" });
      t.annualPriceId = price.id as string;
      if (old) await stripe(`/prices/${old}`, { active: "false" }).catch(() => {});
    }
    t.pub = { name: t.name, monthlyCents: t.monthlyCents, annualCents: t.annualCents };
  }
  if (!cfg.payg.stripeProductId) {
    const p = await stripe("/products", { name: "Check — Pay as you go", "metadata[kind]": "payg" });
    cfg.payg.stripeProductId = p.id as string;
  }
  for (const b of cfg.payg.bundles) {
    if (!b.priceId || b.pubCents !== b.cents) {
      const old = b.priceId;
      const price = await stripe("/prices", { product: cfg.payg.stripeProductId, currency: "usd", unit_amount: String(b.cents), "metadata[checks]": String(b.checks) });
      b.priceId = price.id as string;
      b.pubCents = b.cents;
      if (old) await stripe(`/prices/${old}`, { active: "false" }).catch(() => {});
    }
  }
  return cfg;
}

// ---- Checkout resolution (called by billing.createCheckout) ----
export interface PlanLineItem {
  mode: "subscription" | "payment";
  priceId: string | null;   // published price → use it; null → inline price_data fallback (pre-publish/test)
  cents: number;
  interval?: "month" | "year";
  productName: string;
  metadata: Record<string, string>;
}
/** Resolve a checkout `kind` against the live plans config. kind = tier key (sub, uses `annual`),
 *  or "payg:<checks>" (one-time bundle). Returns null if `kind` isn't a plan (caller falls back). */
export async function resolvePlanCheckout(kind: string, annual: boolean): Promise<PlanLineItem | null> {
  const cfg = await getPlans();
  const tier = cfg.tiers.find((t) => t.key === kind);
  if (tier) {
    return {
      mode: "subscription",
      priceId: annual ? tier.annualPriceId : tier.monthlyPriceId,
      cents: annual ? tier.annualCents : tier.monthlyCents,
      interval: annual ? "year" : "month",
      productName: `Check ${tier.name}`,
      metadata: { kind: "sub", tierKey: tier.key, checks: String(tier.checksPerMonth), premiumAsks: tier.premiumAsks ? "1" : "" },
    };
  }
  const m = /^payg:(\d+)$/.exec(kind);
  if (m) {
    const checks = Number(m[1]);
    const b = cfg.payg.bundles.find((x) => x.checks === checks);
    if (b) return { mode: "payment", priceId: b.priceId, cents: b.cents, productName: `Check — ${b.checks} checks`, metadata: { kind: "payg", credits: String(b.checks) } };
  }
  return null;
}

/** The monthly quota for a tier key (for renewal resets). 0 if unknown. */
export async function tierQuota(tierKey: string | null | undefined): Promise<number> {
  if (!tierKey) return 0;
  const cfg = await getPlans();
  return cfg.tiers.find((t) => t.key === tierKey)?.checksPerMonth ?? 0;
}

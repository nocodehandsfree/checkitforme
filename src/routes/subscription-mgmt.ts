// Plans and paying: the public plan list, Stripe checkout, and spending a credit.

import type { Hono } from "hono";
import { createCheckout, createCheckoutIntent, getAccount, isCompAccount, spendableCredits } from "../billing";
import { getPlans, publicPlans } from "../plans";
import { verifyClerkToken } from "./shared-helpers";

export function register(app: Hono) {
  // Charge one credit for a definitive answer (idempotent per call id).
  app.post("/app/charge", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    // Charging is now SERVER-SIDE on call completion (ingestPending, atomic + idempotent). This
    // This does not bill: the charge happens on the check itself. It returns the live balance.
    const a = await getAccount(u.id, u.email);
    return c.json({ credits: isCompAccount(a) ? 9999 : spendableCredits(a) });
  });

  // Create a Stripe Checkout session (kind = "sub" | pack key). Returns a redirect URL.
  app.post("/app/checkout", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { kind, email, annual } = await c.req.json();
    const origin = (c.req.header("origin") || "https://runner.fungibles.com").replace(/\/$/, "");
    const url = await createCheckout(u.id, u.email || email, kind, origin, !!annual);
    if (!url) return c.json({ error: "checkout_failed" }, 400);
    return c.json({ url });
  });

  // Embedded checkout (Stripe Elements — the custom BRANDED on-site page). Returns the client_secret +
  // publishable key the Website confirms with Elements. kind = tier key or "payg:<checks>".
  app.post("/app/checkout-intent", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { kind, annual } = await c.req.json();
    try {
      const intent = await createCheckoutIntent(u.id, u.email || undefined, String(kind || ""), !!annual);
      if (!intent) return c.json({ error: "checkout_unavailable" }, 400);
      return c.json(intent);
    } catch (e) { return c.json({ error: String(e).slice(0, 200) }, 400); }
  });

  // Public: the live tiers + PAYG ladder for the consumer checkout sheet (Website's lane renders it).
  app.get("/pub/plans", async (c) => c.json(publicPlans(await getPlans())));
}

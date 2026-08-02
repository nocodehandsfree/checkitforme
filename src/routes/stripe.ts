// What Stripe sends us when a payment settles. Signature-verified, public by design.

import type { Hono } from "hono";
import { handleStripeEvent, verifyStripeSig } from "../billing";

export function register(app: Hono) {
  // ---- Stripe webhook (public, signature-verified) ----
  app.post("/webhooks/stripe", async (c) => {
    const raw = await c.req.text();
    if (!(await verifyStripeSig(raw, c.req.header("stripe-signature") ?? null))) return c.json({ error: "bad signature" }, 400);
    try { await handleStripeEvent(JSON.parse(raw)); } catch (e) { console.error("stripe webhook:", e); }
    return c.json({ received: true });
  });
}

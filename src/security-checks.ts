// Fail-fast security config checks at boot. In production (RAILWAY_ENVIRONMENT is set) a misconfigured
// CRITICAL secret REFUSES to start — so we can never accidentally ship an open admin API or forgeable
// sessions. Non-critical gaps warn loudly but don't block. Locally/CI (no RAILWAY_ENVIRONMENT) nothing
// is fatal so tests + dev boot freely.
import { config } from "./config";

export function assertProdSecurity(): void {
  const prod = !!process.env.RAILWAY_ENVIRONMENT;
  const fatal: string[] = [];
  const warn: string[] = [];

  // CLERK_ENFORCE off ⇒ the whole /api/* admin surface (store import/delete, pricing, voice clone,
  // the AI agent that spends money) is reachable UNAUTHENTICATED.
  if (!config.clerk.enforce) fatal.push("CLERK_ENFORCE is not 'true' — the admin API would be UNAUTHENTICATED.");

  // Missing/weak SESSION_SECRET ⇒ anyone can forge a phone session token = total auth bypass.
  const sec = process.env.SESSION_SECRET || "";
  if (!sec || sec === "dev-insecure-secret-change-me" || sec.length < 32) {
    fatal.push("SESSION_SECRET is missing or weak (need ≥32 chars) — phone sessions would be forgeable.");
  }

  // Webhook secrets: missing ⇒ fake payment/credit events or unverified call results get accepted.
  if (!process.env.STRIPE_WEBHOOK_SECRET) warn.push("STRIPE_WEBHOOK_SECRET not set — Stripe webhook accepts UNSIGNED events.");
  if (!config.voice.webhookSecret) warn.push("ELEVENLABS_WEBHOOK_SECRET not set — EL webhook signatures are not verified.");

  for (const w of warn) console.warn("[security] WARN:", w);
  if (fatal.length) {
    for (const f of fatal) console.error("[security] FATAL:", f);
    if (prod) {
      console.error("[security] Refusing to start in production. Fix the above env vars and redeploy.");
      process.exit(1);
    }
    console.warn("[security] (non-prod boot: continuing despite the above)");
  }
}

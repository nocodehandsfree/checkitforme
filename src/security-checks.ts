// Fail-fast security config checks at boot. In production (RAILWAY_ENVIRONMENT is set) a misconfigured
// CRITICAL secret REFUSES to start — so we can never accidentally ship an open admin API or forgeable
// sessions. Non-critical gaps warn loudly but don't block. Locally/CI (no RAILWAY_ENVIRONMENT) nothing
// is fatal so tests + dev boot freely.
import { config } from "./config";

export function assertProdSecurity(): void {
  const prod = !!process.env.RAILWAY_ENVIRONMENT;
  const fatal: string[] = [];
  const warn: string[] = [];

  // Clerk is gone — the /api/* admin surface is now gated by the signed `admin_session` cookie, minted
  // ONLY by /admin-login?token=ADMIN_TOKEN. If ADMIN_TOKEN is unset that gate falls open (see server.ts),
  // exposing store import/delete, pricing, voice clone, and the money-spending agent UNAUTHENTICATED.
  if (!config.adminToken) fatal.push("ADMIN_TOKEN is not set — the admin API (/api/*) would be UNAUTHENTICATED. Set ADMIN_TOKEN, then log in via /admin-login?token=…");

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

export interface ReadinessCheck { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }

/** Non-throwing sibling of assertProdSecurity: the same secret/config checks as a structured list the
 *  admin readiness endpoint can render. `fail` = the boot-fatal ones; `warn` = the loud-but-ok ones. */
export function securityReport(): ReadinessCheck[] {
  const out: ReadinessCheck[] = [];
  out.push(config.adminToken
    ? { id: "admin_token", label: "Admin API authenticated", status: "pass", detail: "ADMIN_TOKEN set — /api/* is gated." }
    : { id: "admin_token", label: "Admin API authenticated", status: "fail", detail: "ADMIN_TOKEN unset — /api/* would be OPEN." });
  const sec = process.env.SESSION_SECRET || "";
  out.push(!sec || sec === "dev-insecure-secret-change-me" || sec.length < 32
    ? { id: "session_secret", label: "Session tokens unforgeable", status: "fail", detail: "SESSION_SECRET missing/weak (need ≥32 chars)." }
    : { id: "session_secret", label: "Session tokens unforgeable", status: "pass", detail: "SESSION_SECRET is strong." });
  out.push(process.env.STRIPE_WEBHOOK_SECRET
    ? { id: "stripe_webhook", label: "Stripe webhook signed", status: "pass", detail: "STRIPE_WEBHOOK_SECRET set." }
    : { id: "stripe_webhook", label: "Stripe webhook signed", status: "warn", detail: "STRIPE_WEBHOOK_SECRET unset — unsigned events accepted." });
  out.push(config.voice.webhookSecret
    ? { id: "el_webhook", label: "ElevenLabs webhook verified", status: "pass", detail: "ELEVENLABS_WEBHOOK_SECRET set." }
    : { id: "el_webhook", label: "ElevenLabs webhook verified", status: "warn", detail: "ELEVENLABS_WEBHOOK_SECRET unset — EL signatures unverified." });
  return out;
}

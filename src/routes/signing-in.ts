// Signing in and out: the SMS code exchange, the caller-ID verification call, the admin door,
// and the two links every alert email carries (confirm your address, unsubscribe).

import type { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, alertSubscriptions, watches } from "../db/schema";
import { config } from "../config";
import { LIMITS, check as rlCheck, clientIp } from "../ratelimit";
import { checkEmailToken } from "../alerts";
import { getAccountByPhone, phoneAccountExists, spendableCredits } from "../billing";
import { checkPhoneVerify, e164 as authE164, isCallerIdVerified, signSession, startCallerIdVerify, startPhoneVerify } from "../auth";
import { cookieRootDomain, isAdminPhone, verifyClerkToken } from "./shared-helpers";

// Unsubscribe: signed one-click. Kills every EMAIL alert for this address (subscriptions + watches)
// and un-verifies it so nothing else emails them until they re-confirm. GET renders the page;
// POST serves RFC 8058 one-click (the List-Unsubscribe-Post header) — same effect, no body needed.
export async function unsubscribeEmail(e: string): Promise<void> {
  const owners = await db.select().from(accounts).where(eq(accounts.email, e));
  for (const a of owners) {
    await db.update(alertSubscriptions).set({ active: 0 }).where(and(eq(alertSubscriptions.userId, a.clerkUserId), eq(alertSubscriptions.channel, "email")));
  }
  await db.update(accounts).set({ emailVerifiedAt: null }).where(eq(accounts.email, e));
  await db.update(watches).set({ active: false }).where(eq(watches.contact, e));
}

export function register(app: Hono) {
  // The admin door: /admin-login?token=ADMIN_TOKEN once → a signed httpOnly session cookie the
  // /api/* wall accepts. Set on the shared root domain so the site and Admin share one sign-in.
  app.get("/admin-login", async (c) => {
    const token = c.req.query("token") || "";
    if (!config.adminToken || token !== config.adminToken) return c.text("unauthorized", 401);
    const jwt = await signSession("admin", "");
    const domain = cookieRootDomain(c.req.header("host"));
    setCookie(c, "admin_session", jwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, ...(domain ? { domain } : {}) });
    return c.redirect("/");
  });

  app.get("/admin-logout", (c) => {
    setCookie(c, "admin_session", "", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 0 });
    return c.redirect("/");
  });

  // ---- Signing in by phone: SMS code → our session → caller-ID verify call ----
  // Step 1: send an SMS code to the cell (browser auto-fills it). Rate-limited (SMS costs money).
  app.post("/auth/phone/start", async (c) => {
    const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const { phone } = await c.req.json().catch(() => ({}));
    const e = authE164(String(phone || ""));
    if (!/^\+1\d{10}$/.test(e)) return c.json({ error: "us_number_required" }, 400); // US only for now
    const r = await startPhoneVerify(e);
    return r.ok ? c.json({ ok: true, dev: !!r.dev, devCode: r.devCode }) : c.json({ error: r.error }, 400);
  });

  // Read-only: is this number a returning account? Lets the login screen show "Welcome back" vs
  // "First check's on us" before they submit. Rate-limited (anti-enumeration); never creates an account.
  app.post("/auth/phone/known", async (c) => {
    const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
    if (!rl.ok) return c.json({ error: "rate_limited" }, 429);
    const { phone } = await c.req.json().catch(() => ({}));
    const e = authE164(String(phone || ""));
    if (!/^\+1\d{10}$/.test(e)) return c.json({ known: false });
    return c.json({ known: await phoneAccountExists(e) });
  });

  // Step 2: confirm the code → find/create the phone account → issue our session token.
  app.post("/auth/phone/check", async (c) => {
    const { phone, code } = await c.req.json().catch(() => ({}));
    const e = authE164(String(phone || ""));
    if (!/^\+1\d{10}$/.test(e) || !code) return c.json({ error: "phone_and_code_required" }, 400);
    if (!(await checkPhoneVerify(e, String(code)))) return c.json({ error: "bad_code" }, 401);
    const a = await getAccountByPhone(e);
    if (!a) return c.json({ error: "account_error" }, 500);
    const token = await signSession(a.clerkUserId, e);
    // Owner phone → also mint the admin session on the shared root domain, so signing into the site
    // logs the operator into the admin (a sibling subdomain). No effect for non-owner numbers.
    if (isAdminPhone(e)) {
      const adminJwt = await signSession("admin", "");
      const domain = cookieRootDomain(c.req.header("host"));
      setCookie(c, "admin_session", adminJwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, ...(domain ? { domain } : {}) });
    }
    return c.json({ token, account: { phone: e, credits: spendableCredits(a), subscription: a.subscription, callerIdReady: !!a.callerId && a.callerId === e } });
  });

  // Step 3 (after login): kick off the caller-ID verification CALL; show the code to enter.
  app.post("/auth/callerid/start", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u || !u.phone) return c.json({ error: "unauthorized" }, 401);
    const r = await startCallerIdVerify(u.phone);
    return r.ok ? c.json({ validationCode: r.validationCode }) : c.json({ error: r.error }, 400);
  });

  // Poll whether the caller-ID call finished; on success, mark it on the account.
  app.get("/auth/callerid/status", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u || !u.phone) return c.json({ error: "unauthorized" }, 401);
    const verified = await isCallerIdVerified(u.phone);
    if (verified) await db.update(accounts).set({ callerId: u.phone }).where(eq(accounts.clerkUserId, u.id));
    return c.json({ verified });
  });

  // Confirm: the signed link from the confirm email. Marks every account carrying this address
  // verified, then drops them back on the site — My checks opens with a pill saying the email is
  // confirmed (emconf=1) or that the link did not work (emconf=0). No landing page (site RULES 1).
  app.get("/confirm-email", async (c) => {
    const e = String(c.req.query("e") || "").trim().toLowerCase();
    if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.redirect("/?emconf=0");
    await db.update(accounts).set({ emailVerifiedAt: Math.floor(Date.now() / 1000) }).where(eq(accounts.email, e));
    return c.redirect("/?emconf=1");
  });

  // The human unsubscribe click opens the Alerts sheet, where they mute or stop the exact alert.
  // The POST below is the RFC 8058 one-click path mail apps call machine-to-machine (site RULES 1).
  app.get("/unsubscribe", async (c) => c.redirect("/?alerts=1"));

  app.post("/unsubscribe", async (c) => {
    const e = String(c.req.query("e") || "").trim().toLowerCase();
    if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.json({ error: "bad_token" }, 400);
    await unsubscribeEmail(e);
    return c.json({ ok: true });
  });
}

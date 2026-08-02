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

// ---- Email confirm + one-click unsubscribe (the two live links every alert email carries) ----
// Tiny branded landing page (dark board, wordmark, one line + Spanish, one CTA back to the site).
export function emailLandingPage(title: string, line: string, lineEs: string, cta: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Check It For Me</title>
<style>body{margin:0;background:#08090D;color:#fff;font-family:Inter,'Segoe UI',Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{max-width:420px;margin:16px;background:#14141A;border-radius:26px;padding:34px 36px}
h1{font-size:30px;font-weight:900;letter-spacing:-1px;margin:18px 0 0}p{color:#B9B9C4;font-size:15px;line-height:1.5;margin:14px 0 0}.es{color:#8A8A96;font-size:13px}
a.cta{display:block;text-align:center;margin-top:26px;background:#16161C;border:2px solid #4ADE80;border-radius:999px;padding:17px 24px;color:#fff;font-weight:800;font-size:13px;letter-spacing:1.6px;text-decoration:none;text-transform:uppercase}</style></head>
<body><div class="card"><img src="/logos/brand/check.png" alt="Check" style="height:26px;display:block">
<h1>${title}</h1><p>${line}</p><p class="es">${lineEs}</p><a class="cta" href="/">${cta}&nbsp;&nbsp;&rarr;</a></div></body></html>`;
}

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
  // Clerk-free admin login: visit /admin-login?token=ADMIN_TOKEN once → sets a signed httpOnly
  // session cookie the /api/* gate accepts. No Clerk. The existing app.html then loads unchanged.
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

  // ---- Phone-first auth (Clerk-free): SMS code → our session → caller-ID verify call ----
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

  // Confirm: the signed link from the confirm email. Marks every account carrying this address verified.
  // No landing page (owner 07-16): confirm, then drop them straight back on the site — My checks opens
  // with a pill saying the email is confirmed (emconf=1) or that the link didn't work (emconf=0).
  app.get("/confirm-email", async (c) => {
    const e = String(c.req.query("e") || "").trim().toLowerCase();
    if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.redirect("/?emconf=0");
    await db.update(accounts).set({ emailVerifiedAt: Math.floor(Date.now() / 1000) }).where(eq(accounts.email, e));
    return c.redirect("/?emconf=1");
  });

  // The human unsubscribe click goes straight to the Alerts sheet — they mute or stop the exact alert
  // there (owner 07-16: no unsubscribe landing page, no blanket kill). The POST below stays: it's the
  // RFC 8058 one-click header path mail apps call machine-to-machine.
  app.get("/unsubscribe", async (c) => c.redirect("/?alerts=1"));

  app.post("/unsubscribe", async (c) => {
    const e = String(c.req.query("e") || "").trim().toLowerCase();
    if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.json({ error: "bad_token" }, 400);
    await unsubscribeEmail(e);
    return c.json({ ok: true });
  });

  // Clerk-free admin login: visit /admin-login?token=ADMIN_TOKEN once → sets a signed httpOnly
  // session cookie the /api/* gate accepts. No Clerk. The existing app.html then loads unchanged.
  app.get("/admin-login", async (c) => {
    const token = c.req.query("token") || "";
    if (!config.adminToken || token !== config.adminToken) return c.text("unauthorized", 401);
    const jwt = await signSession("admin", "");
    setCookie(c, "admin_session", jwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return c.redirect("/");
  });

  app.get("/admin-logout", (c) => {
    setCookie(c, "admin_session", "", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 0 });
    return c.redirect("/");
  });
}

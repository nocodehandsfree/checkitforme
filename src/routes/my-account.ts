// The signed-in customer's own record: who am I, check history, credits, referrals, the scheduled
// auto-checks, and the store requests they filed.

import type { Hono } from "hono";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, callResults } from "../db/schema";
import { getPolicy } from "../policy";
import { createSchedule, deleteSchedule, listSchedulesDetailed } from "../customer-schedules";
import { cachedChains, categoryLabelMap, retailerMap } from "../refcache";
import { claimReferral, referralStatus } from "../referrals";
import { sendConfirmEmail } from "../alerts";
import { PACKS, SUB, getAccount, isComp, isCompAccount, spendableCredits } from "../billing";
import { accountFeatures } from "../plans";
import { brevoUpsertContact } from "../brevo";
import { chainLogoInfo, pubCredits, storeChainName, verifyClerkToken } from "./shared-helpers";

export function register(app: Hono) {
  // Set/clear the optional email for alerts + newsletter (Brevo). Collected in the You section only.
  app.post("/app/email", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { email, lang } = await c.req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
    const language = lang === "es" ? "es" : lang === "en" ? "en" : undefined; // the site sends its LANG; keep whatever's there otherwise
    const before = await getAccount(u.id);
    const changed = e !== (before?.email || ""); // new or different address → it needs confirming again
    const resend = !!e && !changed && !before?.emailVerifiedAt; // same still-pending address submitted again = "send the confirmation again" (owner 07-16)
    await db.update(accounts).set({ email: e || null, ...(language ? { language } : {}), ...(changed ? { emailVerifiedAt: null } : {}) }).where(eq(accounts.clerkUserId, u.id));
    // Opt-in email → Brevo (newsletter/alerts). Fire-and-forget so the UI isn't blocked on Brevo.
    if (e) brevoUpsertContact(e, { PHONE: u.phone || "" }).catch(() => {});
    // New/changed address (or a pending resend) → the confirm email goes out in their language.
    if (e && (changed || resend)) { try { await sendConfirmEmail(u.id, e, language || (before?.language === "es" ? "es" : "en")); } catch { /* never block saving the email */ } }
    return c.json({ ok: true, email: e || null, verified: !changed && !!before?.emailVerifiedAt, resent: resend });
  });

  app.get("/pub/credits", async (c) => c.json({ balance: await pubCredits() }));

  // ---- Runnr customer accounts + billing (Clerk-authenticated, any signed-in user) ----
  app.get("/app/me", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    // getAccount maps the owner phone → master email, so comp/master resolves from the account itself.
    const a = await getAccount(u.id, u.email || undefined);
    const comp = isCompAccount(a) || isComp(u.email || undefined);
    // Phone-first: store the verified cell straight from the session token (can't be spoofed) and default
    // the caller ID to it.
    if (a && !a.phone && u.phone) {
      await db.update(accounts).set({ phone: u.phone }).where(eq(accounts.clerkUserId, u.id)); a.phone = u.phone;
    }
    // Premium entitlements (subscription-only): per-feature map the UI gates on. premiumAsks (exact
    // set/product/price questions on the call) is for EVERY account since 2026-07-15 (owner).
    const features = await accountFeatures(a?.subTier, comp);
    const premiumAsks = true;
    return c.json({
      // Displayed balance = subscription quota + PAYG (both spendable). quota/payg broken out for the UI.
      credits: comp ? 9999 : spendableCredits(a), subscription: comp ? "active" : (a?.subscription ?? "none"),
      subTier: comp ? "founder" : (a?.subTier ?? null), quota: comp ? 9999 : (a?.quotaCredits ?? 0), payg: comp ? 9999 : (a?.credits ?? 0), premiumAsks, features,
      comp, callsMade: a?.callsMade ?? 0, phone: a?.phone ?? null,
      // Alerts email UI (Addie 07-15): the saved address + whether the confirm link was tapped.
      email: a?.email ?? null, emailVerified: !!a?.emailVerifiedAt,
      // caller_id is only set after Twilio's caller-ID verify call → the "create your agent" panel uses
      // callerIdReady to know whether to prompt for it.
      callerId: a?.callerId ?? null, callerIdReady: !!a?.callerId,
      catalog: { sub: SUB, packs: PACKS },
    });
  });

  // ---- Subscriber auto-checks (scheduled shipment-day calls) ----
  app.get("/app/schedules", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(await listSchedulesDetailed(u.id));
  });

  app.post("/app/schedule", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const pol = await getPolicy();
    if (!pol.flags.scheduling) return c.json({ error: "scheduling_off" }, 403);
    const a = await getAccount(u.id, u.email);
    if (!isCompAccount(a) && a?.subscription !== "active") return c.json({ error: "members_only" }, 402);
    const b = await c.req.json();
    if (!b.retailerId || !b.categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
    // The site sends its language with the signup — store it so this account's alerts go out in it.
    const schedLang = b.lang === "es" ? "es" : b.lang === "en" ? "en" : undefined;
    if (schedLang) await db.update(accounts).set({ language: schedLang }).where(eq(accounts.clerkUserId, u.id));
    const row = await createSchedule(u.id, { ...b, contact: b.contact || a?.email || undefined });
    return c.json({ ok: true, schedule: row });
  });

  app.delete("/app/schedules/:id", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(await deleteSchedule(u.id, Number(c.req.param("id"))));
  });

  // ---- Referrals: give free checks, get free checks ----
  app.get("/app/referral", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(await referralStatus(u.id, u.email));
  });

  app.post("/app/referral/claim", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { code } = await c.req.json().catch(() => ({}));
    const r = await claimReferral(u.id, code, u.email);
    if (!r.ok) return c.json({ error: r.reason }, r.reason === "disabled" ? 403 : 400);
    const a = await getAccount(u.id, u.email);
    return c.json({ ok: true, reward: r.reward, credits: a?.credits ?? 0 });
  });

  // The signed-in user's past checks — server-side, so history survives devices AND the Clerk
  // instance migration: rows are matched by every clerk id that ever used this email, not just
  // the current session's id (old-instance calls keep showing for the same person).
  app.get("/app/history", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    let email = (u.email || c.req.query("email") || "").toLowerCase();
    // Phone-session tokens carry no email — resolve it from the account so the master's history
    // (calls made under the email/Clerk account) unifies with the phone login.
    if (!email) { const a = await getAccount(u.id); email = (a?.email || "").toLowerCase(); }
    const ids = new Set<string>([u.id]);
    if (email) {
      // Match by email with a WHERE clause (was a full accounts-table scan on every load — slow on the file DB).
      for (const a of await db.select({ clerkUserId: accounts.clerkUserId }).from(accounts).where(eq(accounts.email, email))) ids.add(a.clerkUserId);
    }
    const stores = await retailerMap();
    const cats = await categoryLabelMap();
    const histChains = new Map((await cachedChains()).map((x) => [x.id, x.name]));
    const rows = (await db.select().from(callResults)
      .where(inArray(callResults.finderUserId, [...ids]))
      .orderBy(desc(callResults.startedAt)).limit(80))
      .filter((r) => r.providerCallId);
    return c.json(rows.map((r) => {
      const st = stores.get(r.retailerId);
      const sName = st?.name || "A store";
      // Chain logo via chainId first (like the homepage list) — bare name matching missed most stores.
      const l = chainLogoInfo((st?.chainId && histChains.get(st.chainId)) || storeChainName(sName));
      return {
        cid: r.providerCallId, storeId: r.retailerId, storeName: sName,
        categoryId: r.categoryId, category: cats.get(r.categoryId) || "",
        ts: (r.startedAt || 0) * 1000, status: r.status, confirmed: r.confirmed,
        statusKey: r.statusKey, productDetail: r.productDetail, shipmentDay: r.shipmentDayHeard, shipmentTime: r.shipmentTimeHeard ?? null, charged: !!r.chargedAt, zoneRunId: r.zoneRunId || null,
        logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct,
      };
    }));
  });
}

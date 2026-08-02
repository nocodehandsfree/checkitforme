// In stock alerts: subscribing a store, pausing, muting, the alert list, the editable email
// templates and the send log, plus the owner's own alert preferences.

import type { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, alertSends, alertSubscriptions, chains, retailers } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";
import { ALERT_SLOT_CAP, alertExists, alertMute, alertSlotsUsed, alertSubscribe, getAlertTemplatesPublic, monthKey, myAlerts, pauseAllAlerts, sendOwnerInStockEmail, sendTestAlert, setAlertTemplates } from "../alerts";
import { notifyContact, ownerAlertPrefs } from "../calls/notify";
import { getAccount } from "../billing";
import { chainLogoInfo, storeChainName, verifyClerkToken } from "./shared-helpers";

// ---- Customer alerts (restock opt-in + status) ----
// Paint each watched store in the Alerts list with the SAME logo the homepage store row uses:
// chainLogoInfo(chainName) + the chain's type. Without this the list falls back to a made-up monogram.
export async function enrichAlertStores<T extends { subscriptions?: Array<{ retailerId?: number | null }> }>(me: T): Promise<T> {
  const subs = (me.subscriptions || []) as Array<Record<string, unknown>>;
  const ids = [...new Set(subs.map((s) => s.retailerId as number | null).filter((x): x is number => x != null))];
  if (!ids.length) return me;
  const rets = await db.select({ id: retailers.id, name: retailers.name, chainId: retailers.chainId }).from(retailers).where(inArray(retailers.id, ids));
  const chainRows = await db.select({ id: chains.id, name: chains.name, type: chains.type }).from(chains);
  const cName = new Map(chainRows.map((x) => [x.id, x.name]));
  const cType = new Map(chainRows.map((x) => [x.id, x.type]));
  const byId = new Map(rets.map((r) => [r.id, r]));
  (me as { subscriptions?: unknown }).subscriptions = subs.map((s) => {
    const r = s.retailerId != null ? byId.get(s.retailerId as number) : null;
    if (!r) return s;
    const chainName = (r.chainId && cName.get(r.chainId)) || storeChainName(r.name);
    const l = chainLogoInfo(chainName);
    return { ...s, storeType: (r.chainId && cType.get(r.chainId)) || "Other", logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct };
  });
  return me;
}

export function register(app: Hono) {
  app.post("/app/alerts/subscribe", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const b = await c.req.json().catch(() => ({}));
    const acct = await getAccount(u.id, u.email || undefined);
    // The site sends its language with the signup — store it so this account's alerts go out in it.
    const subLang = b.lang === "es" ? "es" : b.lang === "en" ? "en" : undefined;
    if (subLang) await db.update(accounts).set({ language: subLang }).where(eq(accounts.clerkUserId, u.id));
    const retailerId = b.retailerId != null ? Number(b.retailerId) : null;
    const productLabel = b.productLabel ? String(b.productLabel).slice(0, 120) : null;
    // CAP: 10 slots (ON or OFF both hold one). A store already on the list re-subscribes for free; a NEW
    // store at the cap gets bounced back so the client can open the list in make-room mode.
    const already = await alertExists(u.id, retailerId, productLabel);
    if (!already && (await alertSlotsUsed(u.id)) >= ALERT_SLOT_CAP) {
      return c.json({ error: "cap", cap: ALERT_SLOT_CAP, ...(await enrichAlertStores(await myAlerts(u.id))) }, 200);
    }
    // Email is the one alert channel here (SMS/toll-free still dark) — every opt-in rides the account email.
    const r = await alertSubscribe(u.id, {
      kind: b.kind ? String(b.kind) : "restock",
      retailerId,
      categoryId: b.categoryId != null ? Number(b.categoryId) : null,
      productLabel,
      channel: "email",
    });
    // Confirmed email → instant ON, nothing else asked. No email → the client asks inline then POSTs
    // /app/email (one confirm). Pending email → tell them to check their inbox. The sub is live either way;
    // delivery is globally gated on emailVerifiedAt, so a pending watch turns on by itself once confirmed.
    const status = acct?.emailVerifiedAt ? "on" : acct?.email ? "pending" : "need_email";
    return c.json({ ...r, status, hasEmail: !!acct?.email, emailVerified: !!acct?.emailVerifiedAt });
  });

  // Master "Pause all alerts" — the switch on top of the Alerts list.
  app.post("/app/alerts/pause-all", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { paused } = await c.req.json().catch(() => ({}));
    return c.json(await enrichAlertStores(await pauseAllAlerts(u.id, !!paused)));
  });

  app.get("/app/alerts/me", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(await enrichAlertStores(await myAlerts(u.id)));
  });

  // Turn one alert off (the My Checks alerts sheet). Only the caller's own subscriptions.
  app.post("/app/alerts/unsubscribe", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { id } = await c.req.json().catch(() => ({}));
    if (!id) return c.json({ error: "id required" }, 400);
    await db.update(alertSubscriptions).set({ active: 0 }).where(and(eq(alertSubscriptions.id, Number(id)), eq(alertSubscriptions.userId, u.id)));
    return c.json(await enrichAlertStores(await myAlerts(u.id)));
  });

  // Mute = pause without losing the alert (owner 07-16): stays on the sheet, never sends until unmuted.
  app.post("/app/alerts/mute", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { id, muted } = await c.req.json().catch(() => ({}));
    if (!id) return c.json({ error: "id required" }, 400);
    return c.json(await enrichAlertStores(await alertMute(u.id, Number(id), !!muted)));
  });

  // ---- Admin: editable alert message templates + the send log (tracking) ----
  app.get("/api/alerts/templates", async (c) => c.json(await getAlertTemplatesPublic()));

  // Admin: fire one template to yourself with sample data — the fastest way to eyeball a real send.
  app.post("/api/alerts/test", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const event = String(b.event || "confirm_email");
    const to = String(b.to || "").trim();
    const channel = b.channel === "email" ? "email" as const : b.channel === "sms" ? "sms" as const : undefined;
    if (!to) return c.json({ error: "recipient required" }, 400);
    // The hands-free owner ping (call confirmed stock) is its own template, email only.
    if (event === "instock_owner") {
      return c.json(await sendOwnerInStockEmail(to, { store: "Target Glendale", product: "151 Booster Box", day: "Tuesdays", url: "https://checkitforme.com" }, { test: true }));
    }
    // Customer-composed share texts (in-stock / referral / zone): text the owner the composed message so
    // they can read it. Copy is the Admin-edited alerts_json override, or the approved default.
    if (["instock_share", "referral", "zone_instock"].includes(event)) {
      let over: Record<string, { sms?: string }> = {};
      try { over = JSON.parse((await getSetting("alerts_json")) || "{}"); } catch { /* ignore */ }
      const SHARE_DEFAULTS: Record<string, string> = {
        instock_share: "Yo. {store} has {product} in stock right now. An AI called the store for me. Check it:",
        referral: "Yo! Check this tech out. It's sick.\nAn AI calls stores and finds {product} in stock at retail prices.\nSign up and we both get {reward}:",
        zone_instock: "Checked {n} stores at once. {i} had it in stock. Wild:",
      };
      let body = over[event]?.sms || SHARE_DEFAULTS[event];
      const sample: Record<string, string> = { store: "Target Glendale", product: "151 Booster Box", reward: "a free check", n: "10", i: "3" };
      for (const kk of Object.keys(sample)) body = body.split(`{${kk}}`).join(sample[kk]);
      await notifyContact("sms", to, "Check", body, "https://checkitforme.com");
      return c.json({ status: "test_sent", channel: "sms" });
    }
    if (!["restock", "store_added", "waitlist", "confirm_email", "auto_check"].includes(event)) return c.json({ error: "bad_event" }, 400);
    const r = await sendTestAlert(event as "restock" | "store_added" | "waitlist" | "confirm_email" | "auto_check", to, channel);
    return c.json(r);
  });

  // Owner's hands-free in-stock ping: address + channel, editable live (settings beat the env defaults).
  app.get("/api/admin/owner-alert", async (c) => c.json(await ownerAlertPrefs()));

  app.post("/api/admin/owner-alert", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (b.email !== undefined) {
      const e = String(b.email || "").trim().toLowerCase();
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
      await setSetting("owner_alert_email", e);
    }
    if (b.channel !== undefined) {
      const ch = String(b.channel);
      if (!["email", "sms"].includes(ch)) return c.json({ error: "bad_channel" }, 400); // owner: text or email, nothing else
      await setSetting("owner_alert_channel", ch);
    }
    return c.json(await ownerAlertPrefs());
  });

  app.patch("/api/alerts/templates", async (c) => {
    try { return c.json(await setAlertTemplates(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  app.get("/api/alerts/log", async (c) => {
    const rows = await db.select().from(alertSends).orderBy(desc(alertSends.createdAt)).limit(200);
    // Rollup: sends this month by event+channel+status, so the dashboard can show volume at a glance.
    const mk = monthKey(); const roll: Record<string, number> = {};
    for (const r of rows) { if (r.monthKey === mk) { const k = `${r.event}.${r.channel}.${r.status}`; roll[k] = (roll[k] || 0) + 1; } }
    // Who's signed up (active restock opt-ins), newest first — so Admin sees the customer list.
    const subs = await db.select().from(alertSubscriptions).where(eq(alertSubscriptions.active, 1)).orderBy(desc(alertSubscriptions.createdAt));
    const subUsers = new Set(subs.map((s) => s.userId));
    // Delivery readiness: are the provider creds actually set? (drives the "live vs stubbed" banner in Admin)
    const smsLive = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
    const emailLive = !!process.env.BREVO_API_KEY;
    return c.json({
      month: mk, rollup: roll,
      delivery: { sms: smsLive, email: emailLive },
      subscribers: { total: subUsers.size, subscriptions: subs.length, recent: subs.slice(0, 50).map((s) => ({ id: s.id, userId: s.userId, kind: s.kind, retailerId: s.retailerId, productLabel: s.productLabel, channel: s.channel, at: s.createdAt })) },
      recent: rows.map((r) => ({ id: r.id, userId: r.userId, event: r.event, channel: r.channel, to: r.toAddr, status: r.status, detail: r.detail, at: r.createdAt })),
    });
  });
}

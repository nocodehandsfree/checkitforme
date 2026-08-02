// Users and growth: the user list and one user's record, granting credits, marking staff, deleting
// an account, the morning pulse, the overview, email leads and the waitlist.

import type { Hono } from "hono";
import { and, desc, eq, gte, inArray, like } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, alertSubscriptions, callResults, categories, chains, communityPosts, customerSchedules, kioskReports, leads, storeRequests, waitlist, watches, zoneRetailers, zones } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";
import { categoryLabelMap, retailerMap } from "../refcache";
import { sendAnonEmail } from "../alerts";
import { grantCredits, isComp, isCompAccount, spendableCredits } from "../billing";
import { accountFeatures, getPlans } from "../plans";
import { classifyCallReality } from "./admin-restock";
import { getStatsSince, ownerOnlyRetailerIds, retailerTimeToHuman } from "./shared-helpers";

// ---- Growth pulse: the funnel + engagement snapshot the owner reads each morning ----
// Manually-flagged admin/test accounts (Clerk-free, so we can't rely on email domains). These are
// non-customers — excluded from signups/activity like the comp/owner accounts.
export async function staffAccountIds(): Promise<Set<string>> {
  try { const raw = await getSetting("staff_accounts"); const arr = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(arr) ? arr.map(String) : []); } catch { return new Set<string>(); }
}

// Is this account a non-customer (owner/comp by email, or manually flagged admin/test)?
export const isStaffAcct = (a: typeof accounts.$inferSelect, flagged: Set<string>) => isComp(a.email) || isCompAccount(a) || flagged.has(a.clerkUserId);

export function register(app: Hono) {
  // "Start fresh": stamp a cutoff so real-call stats only count calls from now on (e.g. after going live
  // on real stores). GET reads it; POST sets it to now (or {clear:true} to count everything again).
  app.get("/api/admin/stats-since", async (c) => c.json({ statsSince: await getStatsSince() }));

  app.post("/api/admin/stats-since", async (c) => {
    const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const now = Math.floor(Date.now() / 1000);
    const ts = b.clear === true ? 0 : (typeof b.at === "number" && b.at > 0 ? Math.floor(b.at) : now);
    await setSetting("stats_since", String(ts));
    return c.json({ ok: true, statsSince: ts });
  });

  // User dashboard — everyone who's signed up (phone-first accounts, Clerk-free). Newest first.
  app.get("/api/admin/users", async (c) => {
    const accs = await db.select().from(accounts).orderBy(desc(accounts.createdAt));
    const flagged = await staffAccountIds();
    return c.json(accs.map((a) => {
      const comp = isComp(a.email) || isCompAccount(a);
      const staff = comp || flagged.has(a.clerkUserId);
      const plan = a.subscription === "active" ? "Subscriber" : (a.totalSpentCents > 0 ? "Pay-as-you-go" : (staff ? (comp ? "Comp / owner" : "Admin / test") : "Free"));
      return {
        id: a.clerkUserId,
        phone: a.phone || (a.clerkUserId?.startsWith("phone:") ? a.clerkUserId.slice(6) : null),
        email: a.email || null,
        plan, subscription: a.subscription, comp, staff, manualStaff: flagged.has(a.clerkUserId),
        credits: a.credits, callsMade: a.callsMade, spentCents: a.totalSpentCents,
        callerIdVerified: !!a.callerId, referredBy: a.referredBy || null,
        createdAt: a.createdAt, renewsAt: a.subRenewsAt || null,
      };
    }));
  });

  // Per-customer detail view (docs/specs/admin-user-view.md): everything one account is set up
  // with, in one call — identity/plan/entitlements/credits, their zones + schedules, last 20 checks.
  app.get("/api/admin/users/:id", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
    if (!a) return c.json({ error: "not_found" }, 404);
    const comp = isComp(a.email) || isCompAccount(a);
    const staff = comp || (await staffAccountIds()).has(a.clerkUserId);
    const features = await accountFeatures(a.subTier, comp);
    const tier = a.subTier ? (await getPlans()).tiers.find((t) => t.key === a.subTier) ?? null : null;

    const zs = await db.select().from(zones).where(eq(zones.ownerUserId, id));
    const zoneLinks = zs.length ? await db.select().from(zoneRetailers).where(inArray(zoneRetailers.zoneId, zs.map((z) => z.id))) : [];
    const lastRunByZone = new Map<number, number>();
    if (zs.length) {
      for (const z of zs) {
        const last = (await db.select().from(callResults).where(like(callResults.zoneRunId, `z${z.id}-%`)).orderBy(desc(callResults.startedAt)).limit(1))[0];
        if (last?.startedAt) lastRunByZone.set(z.id, last.startedAt);
      }
    }
    const scheds = (await db.select().from(customerSchedules).where(eq(customerSchedules.finderUserId, id))).filter((s) => s.active);
    const recent = await db.select().from(callResults).where(eq(callResults.finderUserId, id)).orderBy(desc(callResults.startedAt)).limit(20);
    const stores = await retailerMap();
    const cats = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
    const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return c.json({
      id: a.clerkUserId,
      phone: a.phone || (a.clerkUserId.startsWith("phone:") ? a.clerkUserId.slice(6) : null),
      email: a.email || null,
      createdAt: a.createdAt, comp, staff,
      subscription: {
        status: comp ? "active" : (a.subscription ?? "none"),
        tier: comp ? "founder" : (a.subTier ?? null),
        tierName: comp ? "Founder" : (tier?.name ?? null),
        priceCents: tier?.monthlyCents ?? null,
        renewsAt: a.subRenewsAt || null,
      },
      entitlements: features,
      credits: {
        quota: comp ? 9999 : (a.quotaCredits ?? 0),
        payg: comp ? 9999 : (a.credits ?? 0),
        total: comp ? 9999 : spendableCredits(a),
        checksMade: a.callsMade ?? 0,
        lifetimeSpendCents: a.totalSpentCents ?? 0,
      },
      zones: zs.map((z) => ({ id: z.id, name: z.name, stores: zoneLinks.filter((l) => l.zoneId === z.id).length, lastRun: lastRunByZone.get(z.id) ?? null })),
      schedules: scheds.map((s) => ({
        id: s.id,
        target: (stores.get(s.retailerId)?.name || "A store").split("—")[0].trim(),
        category: cats.get(s.categoryId) || "cards",
        days: (s.daysOfWeek || "").split(",").filter(Boolean).map((d) => DOWS[Number(d)] ?? d).join(", ") || "shipment day",
        time: s.timeLocal || "10:00",
      })),
      recentChecks: recent.map((r) => ({
        cid: r.providerCallId, store: stores.get(r.retailerId)?.name || "A store",
        category: cats.get(r.categoryId) || "cards", status: r.status, statusKey: r.statusKey, at: r.startedAt,
      })),
    });
  });

  // Grant free checks to an account (support/ops action from the detail panel).
  app.post("/api/admin/users/:id/grant", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const { checks } = await c.req.json().catch(() => ({}));
    const n = Math.round(Number(checks));
    if (!n || n < 1 || n > 1000) return c.json({ error: "checks must be 1-1000" }, 400);
    const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
    if (!a) return c.json({ error: "not_found" }, 404);
    await grantCredits(id, n, 0);
    const after = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
    return c.json({ ok: true, granted: n, credits: after?.credits ?? null });
  });

  // Flag / unflag an account as admin/test (won't count as a customer).
  app.post("/api/admin/users/staff", async (c) => {
    const { id, on } = await c.req.json().catch(() => ({}));
    if (!id) return c.json({ error: "id required" }, 400);
    const set = await staffAccountIds();
    if (on) set.add(String(id)); else set.delete(String(id));
    await setSetting("staff_accounts", JSON.stringify([...set]));
    return c.json({ ok: true });
  });

  // Delete/reset an account: wipe an account and everything it owns so a phone can re-sign-up as a
  // brand-new user (free check regranted on next login). Cancels any live Stripe subscription first so
  // a reset customer isn't still billed. `?dry=1` reports what WOULD be removed without deleting.
  // The account row itself is the "reset" — getAccountByPhone recreates it fresh on next login.
  app.post("/api/admin/users/:id/delete", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const dry = c.req.query("dry") === "1";
    const acc = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
    if (!acc) return c.json({ error: "no such account", id }, 404);
    const contacts = [acc.phone, acc.email].filter(Boolean) as string[];
    // Count everything owned (by userId, plus watches/leads by contact) so the response is auditable.
    const ownedZones = await db.select({ id: zones.id }).from(zones).where(eq(zones.ownerUserId, id));
    const zoneIds = ownedZones.map((z) => z.id);
    const counts = {
      account: 1,
      callResults: (await db.select({ id: callResults.id }).from(callResults).where(eq(callResults.finderUserId, id))).length,
      customerSchedules: (await db.select({ id: customerSchedules.id }).from(customerSchedules).where(eq(customerSchedules.finderUserId, id))).length,
      alertSubscriptions: (await db.select({ id: alertSubscriptions.id }).from(alertSubscriptions).where(eq(alertSubscriptions.userId, id))).length,
      storeRequests: (await db.select({ id: storeRequests.id }).from(storeRequests).where(eq(storeRequests.userId, id))).length,
      communityPosts: (await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.finderUserId, id))).length,
      zones: zoneIds.length,
      watches: contacts.length ? (await db.select({ id: watches.id }).from(watches).where(inArray(watches.contact, contacts))).length : 0,
    };
    // Cancel any live Stripe subscription so the reset customer stops being billed.
    let stripeCanceled: string[] = [];
    if (acc.stripeCustomerId && (process.env.STRIPE_SECRET_KEY || "")) {
      try {
        const sk = process.env.STRIPE_SECRET_KEY!;
        const list = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${acc.stripeCustomerId}&status=active&limit=100`, { headers: { Authorization: `Bearer ${sk}` } });
        const subs = (await list.json()) as { data?: { id: string }[] };
        for (const s of subs.data || []) {
          if (!dry) await fetch(`https://api.stripe.com/v1/subscriptions/${s.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${sk}` } });
          stripeCanceled.push(s.id);
        }
      } catch (e) { return c.json({ error: `stripe cancel failed — aborted before any local delete: ${String(e).slice(0, 160)}` }, 502); }
    }
    if (dry) return c.json({ dry: true, id, phone: acc.phone, wouldRemove: counts, stripeSubsToCancel: stripeCanceled });
    // Delete owned rows first (children before the account), then the account itself.
    if (zoneIds.length) await db.delete(zoneRetailers).where(inArray(zoneRetailers.zoneId, zoneIds));
    await db.delete(zones).where(eq(zones.ownerUserId, id));
    await db.delete(callResults).where(eq(callResults.finderUserId, id));
    await db.delete(customerSchedules).where(eq(customerSchedules.finderUserId, id));
    await db.delete(alertSubscriptions).where(eq(alertSubscriptions.userId, id));
    await db.delete(storeRequests).where(eq(storeRequests.userId, id));
    await db.delete(communityPosts).where(eq(communityPosts.finderUserId, id));
    if (contacts.length) await db.delete(watches).where(inArray(watches.contact, contacts));
    await db.delete(accounts).where(eq(accounts.clerkUserId, id));
    console.log(`[admin] account deleted ${id} — removed ${JSON.stringify(counts)} stripeCanceled=${stripeCanceled.join(",") || "none"}`);
    return c.json({ ok: true, deleted: id, phone: acc.phone, removed: counts, stripeCanceled });
  });

  app.get("/api/admin/pulse", async (c) => {
    const now = Math.floor(Date.now() / 1000), d1 = now - 86400, d7 = now - 7 * 86400;
    const [accts, leadRows, watchRows, kReports, posts, calls] = await Promise.all([
      db.select().from(accounts), db.select().from(leads), db.select().from(watches),
      db.select().from(kioskReports), db.select().from(communityPosts), db.select().from(callResults),
    ]);
    const since = (ts: number, at: (r: { createdAt?: number | null; startedAt?: number | null }) => number | null | undefined, rows: Array<Record<string, unknown>>) =>
      rows.filter((r) => (at(r as never) ?? 0) >= ts).length;
    const ownerOnly = await ownerOnlyRetailerIds();
    // Real calls only: drop the Fun/MVPs demo stores, the owner's own admin test calls (attributed to the
    // master account), and admin-canceled calls — so the Pulse reflects genuine consumer activity.
    const masterUid = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
    const flagged = await staffAccountIds();
    const statsSince = await getStatsSince();
    const real = calls.filter((r) => !ownerOnly.has(r.retailerId) && r.finderUserId !== masterUid && !(r.finderUserId && flagged.has(r.finderUserId)) && r.status !== "admin_hangup" && (r.startedAt || 0) >= statsSince);
    const completed = real.filter((r) => r.status === "completed");
    // Real human-talk = connected seconds MINUS the learned time-to-human (chain recipe), counted ONLY for
    // calls that actually reached a person. Never-reached IVR calls have zero human-talk. (The old code
    // subtracted ~2s — the IVR's first words — over every call, so "talk" was really the whole call.)
    const tthMap = await retailerTimeToHuman();
    const timed = real.filter((r) => r.callSeconds != null);
    const reachedT = timed.filter((r) => classifyCallReality(r.transcript) !== "never_reached");
    const talkOf = (r: (typeof reachedT)[number]) => Math.max(0, (r.callSeconds || 0) - (tthMap.get(r.retailerId) ?? r.navSeconds ?? 0));
    const avgTalkSec = reachedT.length ? Math.round(reachedT.reduce((s, r) => s + talkOf(r), 0) / reachedT.length) : 0;
    const avgCallSec = timed.length ? Math.round(timed.reduce((s, r) => s + (r.callSeconds || 0), 0) / timed.length) : 0;
    return c.json({
      funnel: {
        leads: leadRows.length,
        signups: accts.filter((a) => !isStaffAcct(a, flagged)).length, // real signups — not owner/comp or flagged admin/test
        paying: accts.filter((a) => a.totalSpentCents > 0).length,
        members: accts.filter((a) => a.subscription === "active").length,
        revenueCents: accts.reduce((s, a) => s + (a.totalSpentCents || 0), 0),
      },
      activity: {
        checks: completed.length,
        checks24h: since(d1, (r) => r.startedAt, completed),
        checks7d: since(d7, (r) => r.startedAt, completed),
        confirms: completed.filter((r) => r.confirmed === true).length,
        callsBilled: accts.reduce((s, a) => s + (a.callsMade || 0), 0),
        avgTalkSec, avgCallSec, callsTimed: timed.length, callsReached: reachedT.length,
      },
      community: {
        watches: watchRows.filter((w) => w.active !== false).length,
        kioskReports: kReports.length,
        posts: posts.length, postsPending: posts.filter((p) => !p.approved).length,
        newLeads7d: since(d7, (r) => r.createdAt, leadRows),
      },
      statsSince,
    });
  });

  // ---- God view: one read of everything moving right now (live calls, outcomes, cost signals) ----
  app.get("/api/admin/overview", async (c) => {
    const now = Math.floor(Date.now() / 1000);
    const d1 = now - 86400, d7 = now - 7 * 86400, d30 = now - 30 * 86400;
    const stores = await retailerMap();
    const cats = await categoryLabelMap();
    const ownerOnly = await ownerOnlyRetailerIds();
    // Production-only: the god view is the launch dashboard, so it counts REAL customer demand — exclude
    // owner-only stores (Fun/MVP), the master/owner account's own test checks, and flagged staff/test
    // accounts. (Same "real" definition the Metrics view uses.)
    const masterUid = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
    const flagged = await staffAccountIds();
    const recent = (await db.select().from(callResults).where(gte(callResults.startedAt, d30)).orderBy(desc(callResults.startedAt)))
      .filter((r) => !ownerOnly.has(r.retailerId) && r.status !== "admin_hangup" && r.finderUserId !== masterUid && !(r.finderUserId && flagged.has(r.finderUserId)));
    // Live: anything started in the last 30 min that hasn't finished.
    const live = recent.filter((r) => ["queued", "dialing", "in_progress"].includes(r.status) && r.startedAt >= now - 1800)
      .map((r) => ({ id: r.id, store: stores.get(r.retailerId)?.name || "?", category: cats.get(r.categoryId) || "", secs: now - r.startedAt, cid: r.providerCallId }));
    const finished = recent.filter((r) => r.completedAt != null);
    const durs = finished.map((r) => (r.completedAt as number) - r.startedAt).filter((s) => s > 0 && s < 1200);
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
    const tally = (rows: typeof recent) => {
      const t: Record<string, number> = {};
      for (const r of rows) t[r.status] = (t[r.status] || 0) + 1;
      return t;
    };
    const slice = (since: number) => {
      const rows = recent.filter((r) => r.startedAt >= since);
      const done = rows.filter((r) => r.completedAt != null);
      return {
        calls: rows.length,
        confirms: rows.filter((r) => r.confirmed === true).length,
        byStatus: tally(rows),
        avgCallSeconds: avg(done.map((r) => (r.completedAt as number) - r.startedAt).filter((s) => s > 0 && s < 1200)),
        minutes: Math.round(done.reduce((s, r) => s + Math.max(0, Math.min(1200, (r.completedAt as number) - r.startedAt)), 0) / 60),
      };
    };
    // Per-chain rollup (30d) — feeds the answer-path classification screen.
    const chainRows = await db.select().from(chains);
    const chainOf = new Map<number, number>(); // retailerId -> chainId
    for (const [id, s] of stores) if (s.chainId != null) chainOf.set(id, s.chainId);
    const byChain = new Map<number, { calls: number; confirms: number; durs: number[] }>();
    for (const r of recent) {
      const cid = chainOf.get(r.retailerId); if (!cid) continue;
      const e = byChain.get(cid) || { calls: 0, confirms: 0, durs: [] };
      e.calls++; if (r.confirmed === true) e.confirms++;
      if (r.completedAt) { const s = r.completedAt - r.startedAt; if (s > 0 && s < 1200) e.durs.push(s); }
      byChain.set(cid, e);
    }
    const chainStats = chainRows.map((ch) => {
      const e = byChain.get(ch.id);
      return { id: ch.id, name: ch.name, type: ch.type, answerPath: ch.answerPath, avgTreeSeconds: ch.avgTreeSeconds,
        repackOnly: ch.repackOnly === true, muted: ch.muted === true, hasTree: !!ch.phoneTreeDefault, dtmf: ch.dtmfShortcut || null,
        calls30d: e?.calls ?? 0, confirms30d: e?.confirms ?? 0, avgCallSeconds: e ? avg(e.durs) : 0 };
    }).sort((a, b) => b.calls30d - a.calls30d);
    const recentCalls = recent.slice(0, 12).map((r) => ({
      id: r.id, store: (stores.get(r.retailerId)?.name || "?").split("—")[0].trim(), category: cats.get(r.categoryId) || "",
      status: r.status, confirmed: r.confirmed, at: r.startedAt, secs: r.completedAt ? r.completedAt - r.startedAt : null, cid: r.providerCallId,
    }));
    // Seven trailing 24h buckets (oldest first) — feeds the dashboard's trend chip + sparkline.
    // days[6] matches today (last 24h); days[5] is "yesterday" for the vs-yesterday delta.
    const days = Array.from({ length: 7 }, (_, i) => {
      const from = now - (7 - i) * 86400, to = now - (6 - i) * 86400;
      return recent.filter((r) => r.startedAt >= from && r.startedAt < to).length;
    });
    return c.json({ live, today: slice(d1), week: slice(d7), month: slice(d30), days, avgCallSeconds30d: avg(durs), chainStats, recentCalls });
  });

  // Admin: list captured email leads (newest first).
  app.get("/api/leads", async (c) => c.json(await db.select().from(leads).orderBy(desc(leads.createdAt))));

  // Set/clear an account's email from Admin (support action). Admin-set addresses count as confirmed.
  app.post("/api/admin/users/:id/email", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const b = await c.req.json().catch(() => ({}));
    const e = String(b.email || "").trim().toLowerCase();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
    const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
    if (!a) return c.json({ error: "not_found" }, 404);
    await db.update(accounts).set({ email: e || null, emailVerifiedAt: e ? Math.floor(Date.now() / 1000) : null }).where(eq(accounts.clerkUserId, id));
    return c.json({ ok: true, email: e || null });
  });

  app.get("/api/waitlist", async (c) => {
    const rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
    // Group by region (or 'Unknown') for the rollout view.
    const byRegion: Record<string, number> = {};
    for (const r of rows) byRegion[r.region || "Unknown"] = (byRegion[r.region || "Unknown"] || 0) + 1;
    return c.json({ total: rows.length, byRegion: Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([region, n]) => ({ region, n })), recent: rows.slice(0, 50) });
  });

  // Admin: "we're live in your area" — email every not-yet-notified waitlist signup in a region, then mark
  // them notified so nobody gets it twice. Email-only (owner: never text the waitlist). Preview with dry=1.
  app.post("/api/waitlist/notify", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const region = String(b.region || "").trim();
    if (!region) return c.json({ error: "region required" }, 400);
    const rows = (await db.select().from(waitlist).where(and(eq(waitlist.region, region), eq(waitlist.notified, false))))
      .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.contact)); // email-only
    if (b.dry) return c.json({ dry: true, region, would_notify: rows.length });
    let sent = 0;
    for (const r of rows) {
      try { await sendAnonEmail("waitlist", { city: r.area || region }, r.contact); sent++; } catch { /* keep going */ }
      await db.update(waitlist).set({ notified: true }).where(eq(waitlist.id, r.id));
    }
    return c.json({ ok: true, region, notified: sent });
  });
}

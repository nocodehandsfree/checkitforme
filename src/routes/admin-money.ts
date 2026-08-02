// The money screens: plans and publishing them to Stripe, measured cost inputs, call rates, cost
// per check, monthly services, margin, and one user's spend history.

import type { Hono } from "hono";
import { desc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, callResults, statuses } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";
import { getCreditStatus } from "../calls/service";
import { currentRates } from "../calls/receipt-store";
import { money } from "../calls/cost";
import { opsRollup, type CheckRow } from "../calls/ops";
import { llm } from "../llm";
import { categoryLabelMap, retailerMap } from "../refcache";
import { SUB } from "../billing";
import { getPlans, normalizePlans, plansSyncView, publishPlansToStripe, savePlans } from "../plans";
import { getStatsSince, ownerOnlyRetailerIds } from "./shared-helpers";

export function register(app: Hono) {
  // ---- Admin Plans manager (God View → Plans): edit tiers/PAYG, publish to Stripe. Admin-gated by /api/*. ----
  app.get("/api/admin/plans", async (c) => c.json(plansSyncView(await getPlans())));

  app.post("/api/admin/plans", async (c) => {
    try {
      const body = await c.req.json();
      // The editor sends names/prices/quotas/flags; preserve Stripe ids + publish snapshots server-side.
      const cur = await getPlans();
      const merged = normalizePlans({
        tiers: (body.tiers || []).map((t: Record<string, unknown>) => {
          const ex = cur.tiers.find((x) => x.key === t.key);
          return { ...ex, ...t, stripeProductId: ex?.stripeProductId ?? null, monthlyPriceId: ex?.monthlyPriceId ?? null, annualPriceId: ex?.annualPriceId ?? null, pub: ex?.pub ?? null };
        }),
        // The service NAMES ride the same save as everything else on the page (owner's brief). Omitted
        // entirely = leave what is stored; sent = replace it, so clearing a box really clears it.
        featureLabels: body.featureLabels === undefined ? cur.featureLabels : body.featureLabels,
        payg: { stripeProductId: cur.payg.stripeProductId, bundles: (body.payg || []).map((b: Record<string, unknown>) => {
          const ex = cur.payg.bundles.find((x) => x.checks === Number(b.checks));
          return { ...b, priceId: ex?.priceId ?? null, pubCents: ex?.pubCents ?? null };
        }) },
      });
      return c.json(plansSyncView(await savePlans(merged)));
    } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  app.post("/api/admin/plans/publish", async (c) => {
    if (!process.env.STRIPE_SECRET_KEY) return c.json({ error: "stripe_key_missing" }, 400);
    try {
      const published = await publishPlansToStripe(await getPlans());
      return c.json(plansSyncView(await savePlans(published)));
    } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  // ---- Admin: real-time COGS / margin (owner-gated via the /api/* Clerk middleware) ----
  app.get("/api/admin/metrics", async (c) => {
    const accs = await db.select().from(accounts);
    const revenueCents = accs.reduce((s, a) => s + a.totalSpentCents, 0);
    const subs = accs.filter((a) => a.subscription === "active").length;
    const creditsOutstanding = accs.reduce((s, a) => s + a.credits, 0);
    const callsMade = accs.reduce((s, a) => s + a.callsMade, 0);
    const credit = await getCreditStatus(); // ElevenLabs usage
    // COGS estimate: ElevenLabs credits used so far valued at $1.82 / 10k credits + Stripe fees (2.9% + $0.30/charge).
    const elevenCostCents = Math.round((credit.used / 10000) * 182);
    const stripeFeeCents = Math.round(revenueCents * 0.029) + accs.filter((a) => a.totalSpentCents > 0).length * 30;
    const cogsCents = elevenCostCents + stripeFeeCents;
    return c.json({
      users: accs.length, subscribers: subs, mrrCents: subs * SUB.cents,
      revenueCents, creditsOutstanding, callsMade,
      cogs: { elevenLabsCents: elevenCostCents, stripeFeesCents: stripeFeeCents, totalCents: cogsCents },
      profitCents: revenueCents - cogsCents,
      marginPct: revenueCents > 0 ? Math.round(((revenueCents - cogsCents) / revenueCents) * 100) : 0,
      elevenLabsCreditsUsed: credit.used,
    });
  });

  // Support diagnostic: does this email have any checks on record? (admin-gated). Mirrors the
  // /app/history join (all accounts sharing the email → their finderUserId calls) so we can answer
  // "do I have history?" without the user's Clerk token.
  app.get("/api/admin/user-history", async (c) => {
    const email = (c.req.query("email") || "").toLowerCase();
    if (!email) return c.json({ error: "email required" }, 400);
    const accs = (await db.select().from(accounts)).filter((a) => (a.email || "").toLowerCase() === email);
    const ids = accs.map((a) => a.clerkUserId);
    const stores = await retailerMap();
    const cats = await categoryLabelMap();
    const ownerOnly = await ownerOnlyRetailerIds();
    const rows = (ids.length
      ? (await db.select().from(callResults).where(inArray(callResults.finderUserId, ids)).orderBy(desc(callResults.startedAt)).limit(80))
      : []).filter((r) => !ownerOnly.has(r.retailerId) && r.status !== "admin_hangup");
    const withCid = rows.filter((r) => r.providerCallId);
    return c.json({
      email,
      accounts: accs.map((a) => ({ clerkUserId: a.clerkUserId, credits: a.credits, subscription: a.subscription, callsMade: a.callsMade, totalSpentCents: a.totalSpentCents })),
      totalCalls: rows.length, replayable: withCid.length,
      calls: withCid.map((r) => ({ cid: r.providerCallId, store: stores.get(r.retailerId)?.name || r.retailerId, category: cats.get(r.categoryId) || r.categoryId, status: r.status, confirmed: r.confirmed, at: r.startedAt })),
    });
  });

  // In-admin Claude agent ("Admin dev"): chat to manage the store DB. Client sends the running
  // transcript [{role,text}]; the server runs one turn (with an internal tool loop) and returns
  // the reply + a list of actions taken. Admin-gated like the rest of /api/*.
  // Call-timing breakdown for the God view: total / time-to-human (nav) / talk, aggregate + per store.
  // ---- Calc: re-read the MEASURED cost inputs off the real accounts ----
  // Three numbers on the Calc page are measurements, not settings, and they drift the moment the voice
  // or the brain changes. This reads them back from the accounts themselves so the page can never go
  // quietly stale: what the ElevenLabs plan actually includes (the account's real allowance, NOT the
  // number on the price page), how many credits a minute of conversation really burns, and what the
  // phone company is really charging per minute.
  app.get("/api/admin/cost-inputs", async (c) => {
    const out: Record<string, unknown> = { measuredAt: new Date().toISOString().slice(0, 10) };
    const elKey = process.env.ELEVENLABS_API_KEY;
    if (elKey) {
      try {
        const sub = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": elKey } }).then((r) => r.json()) as { character_limit?: number };
        if (sub?.character_limit) out.planCredits = sub.character_limit;
        // Credits a minute = ConvAI credits burned / minutes of conversation, over the days that have both.
        const now = Date.now(), from = now - 60 * 86400_000;
        const usage = await fetch(`https://api.elevenlabs.io/v1/usage/character-stats?start_unix=${from}&end_unix=${now}&breakdown_type=product_type`, { headers: { "xi-api-key": elKey } }).then((r) => r.json()) as { time?: number[]; usage?: Record<string, number[]> };
        const convs = await fetch("https://api.elevenlabs.io/v1/convai/conversations?page_size=100", { headers: { "xi-api-key": elKey } }).then((r) => r.json()) as { conversations?: Array<{ start_time_unix_secs?: number; call_duration_secs?: number }> };
        const secByDay = new Map<string, number>();
        for (const cv of convs?.conversations ?? []) {
          if (!cv.start_time_unix_secs) continue;
          const day = new Date(cv.start_time_unix_secs * 1000).toISOString().slice(0, 10);
          secByDay.set(day, (secByDay.get(day) ?? 0) + (cv.call_duration_secs ?? 0));
        }
        const times = usage?.time ?? [], conv = usage?.usage?.["Conversational AI"] ?? [], llm = usage?.usage?.["Conversational AI - LLM"] ?? [];
        let credits = 0, secs = 0;
        times.forEach((ms, i) => {
          const day = new Date(ms).toISOString().slice(0, 10), s = secByDay.get(day) ?? 0;
          if (s > 0 && (conv[i] ?? 0) > 0) { credits += (conv[i] ?? 0) + (llm[i] ?? 0); secs += s; }
        });
        if (secs > 0) out.creditsPerMinute = Math.round(credits / (secs / 60));
      } catch (e) { out.elevenLabsError = String(e); }
    }
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    if (sid && tok) {
      try {
        const auth = "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
        const calls = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=200`, { headers: { Authorization: auth } }).then((r) => r.json()) as { calls?: Array<{ status?: string; duration?: string; price?: string | null }> };
        // The per-minute rate we pay most often, derived from whole-minute billing on completed calls.
        const tally = new Map<number, number>();
        for (const cl of calls?.calls ?? []) {
          if (cl.status !== "completed" || !cl.price) continue;
          const s = Number(cl.duration ?? 0), p = Math.abs(Number(cl.price));
          if (s <= 0 || p <= 0) continue;
          const per = Math.round((p / Math.ceil(s / 60)) * 100000) / 100000;
          tally.set(per, (tally.get(per) ?? 0) + 1);
        }
        const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) { out.twilioPerMin = top[0]; out.twilioRateCalls = top[1]; }
      } catch (e) { out.twilioError = String(e); }
    }
    return c.json(out);
  });

  // The rates every cost on every screen is built from. ONE table: `src/calls/cost.ts` is what the
  // receipt bills a real call with, so the Calc page and the Chains page read it rather than keeping
  // their own copy. A second copy is how a forecast and a bill quietly stop agreeing.
  app.get("/api/admin/call-rates", async (c) => c.json(await currentRates()));

  // WHAT OUR CHECKS ACTUALLY COST — the live readout behind the dashboard hero. Every figure is summed
  // off the columns the receipt stamped on a finished check; nothing here is modelled, and a check the
  // check with no stamped record is not counted (admin RULES 2 — the clean slate). The
  // maths is pure and unit-tested in `src/calls/ops.ts` — this only fetches the rows and the scales.
  app.get("/api/admin/check-costs", async (c) => {
    const days = Math.max(1, Math.min(90, Number(c.req.query("days") || 7)));
    const [rows, statusRows, ownerOnly, since] = await Promise.all([
      db.select().from(callResults),
      db.select().from(statuses).orderBy(statuses.sort),
      ownerOnlyRetailerIds(),
      getStatsSince(),
    ]);
    const report = opsRollup(
      rows as unknown as CheckRow[],
      statusRows.map((s) => ({ key: s.key, label: s.label, emoji: s.emoji, color: s.color, tone: s.tone })),
      { ownerOnly, since, nowSec: Math.floor(Date.now() / 1000), sparkDays: days },
    );
    // The same money strings the receipt prints, so a total on the dashboard and a cost on one check
    // are never formatted two different ways. Every figure the page shows is rendered HERE, by
    // `money()` in the cost module — the page holds no money formatter of its own to drift from it.
    const say = (s: { perCheckUsd: number; totalUsd: number }) => ({ ...s, perCheck: money(s.perCheckUsd), total: money(s.totalUsd) });
    // ---- THE BASELINE (owner 07-29) ----------------------------------------------------------------
    // A check has to cost less than a THIRD of what it earns, or his 67% margin floor breaks. He set
    // that floor against the $9.99 / 50 checks plan: 20¢ earned a check, so 6.6¢ is the ceiling. It is
    // read from the LIVE plan prices here, so changing a price moves the ceiling with it instead of
    // leaving a stale number on the dashboard. The thinnest plan is carried too, because that is the
    // one a ceiling really has to survive, and the two differ enough for him to want to see both.
    const BASELINE_PLAN = "collector"; // the plan the 67% floor was priced against (owner 07-29)
    const MARGIN_FLOOR_DIVISOR = 3;    // "a third of what a check earns" — his words
    const centsToUsd = (cents: number) => Math.round(cents * 10_000); // 1¢ = 10,000 microdollars
    const plans = await getPlans();
    const earning = plans.tiers
      .filter((t) => t.checksPerMonth > 0 && t.monthlyCents > 0)
      .map((t) => ({ name: t.name, key: t.key, perCheckUsd: centsToUsd(t.monthlyCents / t.checksPerMonth) }));
    const ref = earning.find((t) => t.key === BASELINE_PLAN) ?? earning[0] ?? null;
    const thinnest = earning.length ? earning.reduce((a, b) => (b.perCheckUsd < a.perCheckUsd ? b : a)) : null;
    const ceilingOf = (t: { perCheckUsd: number }) => Math.round(t.perCheckUsd / MARGIN_FLOOR_DIVISOR);
    const baseline = ref ? {
      plan: ref.name,
      earnsPerCheck: money(ref.perCheckUsd),
      ceilingUsd: ceilingOf(ref),
      ceiling: money(ceilingOf(ref)),
      thinnestPlan: thinnest && thinnest.key !== ref.key ? thinnest.name : null,
      thinnestCeiling: thinnest && thinnest.key !== ref.key ? money(ceilingOf(thinnest)) : null,
      // What one check actually cost the last time it was driven end to end, before any prod check was
      // stamped. The moment real checks land, "How we got in" below is the live version of these two
      // and the screen shows THAT instead. Update these only from a check you drove yourself.
      measuredOn: "2026-07-29",
      measuredDirect: "5.3¢",
      measuredWorstMenu: "8.5¢",
    } : null;
    return c.json({
      ...report,
      byOutcome: report.byOutcome.map(say),
      byRoute: report.byRoute.map(say),
      baseline,
      readable: {
        perCheck: report.perCheckUsd != null ? money(report.perCheckUsd) : null,
        total: money(report.totalUsd),
        avoidable: money(report.agent.avoidableUsd),
        perAnswer: report.answers.costPerAnswerUsd != null ? money(report.answers.costPerAnswerUsd) : null,
        days: report.days.map((d) => (d.perCheckUsd != null ? money(d.perCheckUsd) : null)),
      },
    });
  });

  // The flat monthly bills that are NOT per call: hosting, the database, sign-in, the phone numbers, the
  // gateway, email. They do not move when one more check runs, but they decide what a check costs once
  // volume is spread over them, which is the whole question the Calc page exists to answer.
  app.get("/api/admin/monthly-services", async (c) => {
    const raw = (await getSetting("calc_services")) || "[]";
    try { return c.json({ services: JSON.parse(raw) as unknown[] }); } catch { return c.json({ services: [] }); }
  });

  app.post("/api/admin/monthly-services", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { services?: Array<{ name?: string; usd?: number }> };
    const clean = (b.services ?? [])
      .filter((s) => s && String(s.name ?? "").trim())
      .slice(0, 24)
      .map((s) => ({ name: String(s.name).trim().slice(0, 40), usd: Math.max(0, Number(s.usd) || 0) }));
    await setSetting("calc_services", JSON.stringify(clean));
    return c.json({ ok: true, services: clean });
  });
}

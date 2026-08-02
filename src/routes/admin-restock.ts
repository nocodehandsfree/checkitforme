// The restock intel screens: where and when product actually lands, per chain and per store.

import type { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, retailers } from "../db/schema";
import { cachedChains, categoryLabelMap, retailerMap } from "../refcache";
import { classifyVerdict, productDetailLabel, reconcile } from "../voice/verdict";
import { chainLogoInfo, getStatsSince, ownerOnlyRetailerIds, productForm, productSet, storeChainName } from "./shared-helpers";

// ---- Restock intel: the compounding payoff — where/when product actually lands ----
// Restock product intel, derived at serve time from callResults.productDetail ("form · set", built by
// productDetailLabel). Splits it back into forms / sets / raw details. Exact columns are a DevOps follow-up.
export function topTally(m: Map<string, number>, key: string, lim?: number) {
  const a = [...m.entries()].sort((x, y) => y[1] - x[1]).map(([v, n]) => ({ [key]: v, n }));
  return lim ? a.slice(0, lim) : a;
}

export function parseProducts(rows: { productDetail: string | null }[]) {
  const forms = new Map<string, number>(), sets = new Map<string, number>(), details = new Map<string, number>();
  const bump = (mp: Map<string, number>, k: string) => mp.set(k, (mp.get(k) || 0) + 1);
  for (const r of rows) {
    const d = (r.productDetail || "").trim(); if (!d) continue;
    bump(details, d);
    const parts = d.split("·").map((x) => x.trim()).filter(Boolean);
    if (parts[0]) bump(forms, /etb/i.test(parts[0]) ? "ETB" : parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
    if (parts[1]) bump(sets, parts[1]);
  }
  return { forms: topTally(forms, "form"), sets: topTally(sets, "set", 25), details: topTally(details, "detail") };
}

// What ACTUALLY happened on a call, read from the transcript words — the persisted status conflated
// "stuck in the phone tree" with "nobody answered", which hid the real story: most calls never reach a
// human. Buckets: in_stock | got_some (shipment landed, not shelved) | not_in | reached_no_answer
// (a person picked up but the call dropped before an answer) | never_reached (died in an IVR / pharmacy
// virtual assistant / on hold). Validated against a hand audit of every real-store call.
export type CallReality = "in_stock" | "got_some" | "not_in" | "reached_no_answer" | "never_reached";

export function classifyCallReality(transcript: string | null): CallReality {
  const s = (transcript || "").toLowerCase().replace(/\s+/g, " ");
  if (/\bwe do\b(?!\s*not)|got some in stock|you'?ve got some in stock|we have some|we have a few|yeah[.,]? (we|so you)/.test(s)) return "in_stock";
  if (/we did get some|we did,? but it'?s not out|got some.* not out|not out yet,? but we did/.test(s)) return "got_some";
  if (/we did not\b|we don'?t have|we haven'?t\b|haven'?t seen any|i did not see any|no,? i'?m sorry|no,? we don'?t|not (in|for) this shipment|did not receive any|didn'?t get any|clerk: no[.,]/.test(s)) return "not_in";
  if (/how can i help|can i help you|may i help you|welcome to cvs|this is (cvs|staples|cbs|cds)|hello,? seabass|thanks for calling barnes|hello\? hello\?|can'?t hear you|gonna have to call again/.test(s)) return "reached_no_answer";
  return "never_reached";
}

// The chain a store belongs to, for the per-chain reach breakdown (B&N answers direct; CVS/Walgreens
// hide behind a phone bot). Falls back to the store's own name when it isn't one of the known chains.
export function chainLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cvs")) return "CVS";
  if (n.includes("walgreens")) return "Walgreens";
  if (n.includes("target")) return "Target";
  if (n.includes("barnes")) return "Barnes & Noble";
  if (n.includes("franklin") || n.includes("ace hardware")) return "Ace Hardware";
  if (n.includes("staples")) return "Staples";
  return name.split("—")[0].trim();
}

export function register(app: Hono) {
  app.get("/api/admin/restock-intel", async (c) => {
    const now = Math.floor(Date.now() / 1000);
    const d7 = now - 7 * 86400, d30 = now - 30 * 86400;
    const stores = await retailerMap();
    const cats = await categoryLabelMap();
    const ownerOnly = await ownerOnlyRetailerIds();
    const statsSince = await getStatsSince();
    const rows = (await db.select().from(callResults).where(eq(callResults.status, "completed"))).filter((r) => !ownerOnly.has(r.retailerId) && (r.startedAt || 0) >= statsSince);
    const confirmed = rows.filter((r) => r.confirmed === true);
    // Per-store: how often a confirmation lands + the shipment day staff gave (the gold).
    const byStore = new Map<number, { id: number; store: string; location: string | null; chain: string; chainId: number | null; region: string | null; confirms: number; last: number; days: Record<string, number> }>();
    for (const r of confirmed) {
      const s = stores.get(r.retailerId); if (!s) continue;
      let e = byStore.get(r.retailerId);
      if (!e) { e = { id: r.retailerId, store: s.name.split("—")[0].trim(), location: s.location ?? null, chain: "", chainId: s.chainId ?? null, region: s.region ?? null, confirms: 0, last: 0, days: {} }; byStore.set(r.retailerId, e); }
      e.confirms++;
      const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
      if (r.shipmentDayHeard) e.days[r.shipmentDayHeard] = (e.days[r.shipmentDayHeard] || 0) + 1;
    }
    // Per-shipment-day across the whole network (e.g. "Thursday" dominates) — drives scheduled calls.
    const dayTally: Record<string, number> = {};
    for (const r of confirmed) if (r.shipmentDayHeard) dayTally[r.shipmentDayHeard] = (dayTally[r.shipmentDayHeard] || 0) + 1;
    // Network product mix — which FORMS (booster/hobby box, tin, ETB, pack…) and SETS land most, from
    // the free-text productDetail staff named. Same derivation as the per-store endpoint.
    const formTally: Record<string, number> = {}, setTally: Record<string, number> = {};
    for (const r of confirmed) {
      const f = productForm(r.productDetail); if (f) formTally[f] = (formTally[f] || 0) + 1;
      const s = productSet(r.productDetail); if (s) setTally[s] = (setTally[s] || 0) + 1;
    }
    // Per-category split (which brand line lands most).
    const catTally: Record<string, number> = {};
    for (const r of confirmed) { const label = cats.get(r.categoryId) || String(r.categoryId); catTally[label] = (catTally[label] || 0) + 1; }
    // Paint each row with the SAME logo every other store list uses: chainLogoInfo(chainName) + the
    // chain's type, resolved through the store's chainId (never a name guess). Without these fields the
    // Admin's "By store" list fell back to a made-up two-letter monogram (owner 07-24).
    const rsChains = await cachedChains();
    const rsChainName = new Map(rsChains.map((x) => [x.id, x.name]));
    const rsChainType = new Map(rsChains.map((x) => [x.id, x.type]));
    const topStores = [...byStore.values()].sort((a, b) => b.confirms - a.confirms || b.last - a.last).slice(0, 25)
      .map((e) => {
        const chainName = (e.chainId != null && rsChainName.get(e.chainId)) || storeChainName(e.store);
        const l = chainLogoInfo(chainName);
        return { ...e, bestDay: Object.entries(e.days).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
          storeType: (e.chainId != null && rsChainType.get(e.chainId)) || "Other",
          logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct };
      });
    const prodNet = parseProducts(confirmed);
    const catNet: Record<string, number> = {};
    for (const r of confirmed) { const cl = cats.get(r.categoryId) || "?"; catNet[cl] = (catNet[cl] || 0) + 1; }
    // Answer funnel — the honest "what did these calls actually achieve" read. Most real-store calls die
    // in a phone tree before a human ever picks up; this surfaces that (and the per-chain reach gap).
    const buckets = { in_stock: 0, got_some: 0, not_in: 0, reached_no_answer: 0, never_reached: 0 };
    const chainFn = new Map<string, { chain: string; dialed: number; reached: number; answered: number }>();
    for (const r of rows) {
      const b = classifyCallReality(r.transcript);
      buckets[b]++;
      const s = stores.get(r.retailerId);
      const ch = s ? chainLabel(s.name) : "?";
      let cf = chainFn.get(ch); if (!cf) { cf = { chain: ch, dialed: 0, reached: 0, answered: 0 }; chainFn.set(ch, cf); }
      cf.dialed++;
      if (b !== "never_reached") cf.reached++;
      if (b === "in_stock" || b === "got_some" || b === "not_in") cf.answered++;
    }
    const firstReal = rows.reduce((m, r) => Math.min(m, r.startedAt || Infinity), Infinity);
    const answerFunnel = {
      dialed: rows.length,
      reachedHuman: rows.length - buckets.never_reached,
      gotAnswer: buckets.in_stock + buckets.got_some + buckets.not_in,
      firstCall: isFinite(firstReal) ? firstReal : null,
      buckets,
      byChain: [...chainFn.values()].sort((a, b) => b.dialed - a.dialed),
    };
    return c.json({
      totals: {
        checks: rows.length, confirms: confirmed.length,
        confirmRate: rows.length ? Math.round((confirmed.length / rows.length) * 100) : 0,
        confirms7d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d7).length,
        confirms30d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d30).length,
      },
      shipmentDays: Object.entries(dayTally).sort((a, b) => b[1] - a[1]).map(([day, n]) => ({ day, n })),
      productForms: prodNet.forms,
      productSets: prodNet.sets,
      byCategory: Object.entries(catNet).sort((a, b) => b[1] - a[1]).map(([category, n]) => ({ category, n })),
      topStores: topStores.map((e) => ({ id: e.id, store: e.store, location: e.location, region: e.region, confirms: e.confirms, last: e.last, bestDay: e.bestDay,
        chainId: e.chainId, storeType: e.storeType, logoUrl: e.logoUrl, logoWide: e.logoWide, logoDark: e.logoDark })),
      answerFunnel,
      statsSince,
    });
  });

  // Per-store restock intel (one store's own page) — same serve-time derivation, scoped to this store.
  app.get("/api/admin/store-restock/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const store = (await db.select().from(retailers).where(eq(retailers.id, id)))[0];
    if (!store) return c.json({ error: "not found" }, 404);
    const cats = await categoryLabelMap();
    const rows = await db.select().from(callResults).where(and(eq(callResults.retailerId, id), eq(callResults.status, "completed")));
    const confirmed = rows.filter((r) => r.confirmed === true);
    const tz = store.timezone || "America/Los_Angeles";
    const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    // what staff said (the gold): the shipment day staff gave, across all completed calls
    const staffT: Record<string, number> = {};
    for (const r of rows) if (r.shipmentDayHeard) staffT[r.shipmentDayHeard] = (staffT[r.shipmentDayHeard] || 0) + 1;
    const staffTally = Object.entries(staffT).sort((a, b) => b[1] - a[1]).map(([day, n]) => ({ day, n }));
    const staffMode = staffTally[0]?.day ?? null;
    // empirical — confirmed-in-stock by weekday, in the store's local time
    const wd: Record<string, number> = Object.fromEntries(WD.map((d) => [d, 0]));
    for (const r of confirmed) {
      const at = r.completedAt ?? r.startedAt;
      const day = new Date(at * 1000).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
      if (day in wd) wd[day]++;
    }
    const byWeekday = WD.map((day) => ({ day, confirms: wd[day] }));
    const empBest = [...byWeekday].sort((a, b) => b.confirms - a.confirms)[0];
    const empiricalBestDay = empBest && empBest.confirms > 0 ? empBest.day : null;
    const catT: Record<string, number> = {};
    for (const r of confirmed) { const cl = cats.get(r.categoryId) || "?"; catT[cl] = (catT[cl] || 0) + 1; }
    return c.json({
      store: store.name,
      location: store.location || null,
      timezone: tz,
      storedShipmentDay: store.shipmentDay || null,
      staffSaid: { mode: staffMode, tally: staffTally },
      empirical: { bestDay: empiricalBestDay, byWeekday },
      bestDay: staffMode || empiricalBestDay,           // prefer what staff said; else the empirical peak
      confidence: confirmed.length,                     // # confirmed calls behind it
      confirms: confirmed.length,
      lastConfirm: confirmed.reduce((m, r) => Math.max(m, r.completedAt ?? r.startedAt), 0) || null,
      byCategory: Object.entries(catT).sort((a, b) => b[1] - a[1]).map(([category, n]) => ({ category, n })),
      products: parseProducts(confirmed),
    });
  });

  // Re-scan stored transcripts with the CURRENT consensus verdict — retroactively applies the fix for
  // mis-classified statuses AND recovers the staff-volunteered restock day + product form the old ingest
  // dropped. Reports true before/after counts + the first real call. Real stores only (skips Fun/MVPs).
  app.post("/api/admin/restock-backfill", async (c) => {
    const ownerOnly = await ownerOnlyRetailerIds();
    const cats = await categoryLabelMap();
    const all = await db.select().from(callResults).where(eq(callResults.status, "completed"));
    const rows = all.filter((r) => r.transcript && r.transcript.length > 12 && !ownerOnly.has(r.retailerId));
    const cat = (confirmed: boolean | null, day: string | null) =>
      confirmed === true ? "in_stock" : day ? "restock_coming" : confirmed === false ? "not_in" : "unclear";
    const blank = () => ({ in_stock: 0, restock_coming: 0, not_in: 0, unclear: 0 });
    const before = blank(), after = blank();
    let scanned = 0, flipped = 0, dayAdded = 0, prodAdded = 0;
    for (const r of rows) {
      before[cat(r.confirmed, r.shipmentDayHeard) as keyof ReturnType<typeof blank>]++;
      const second = await classifyVerdict(r.transcript ?? "", cats.get(r.categoryId) || "the product");
      if (!second) { after[cat(r.confirmed, r.shipmentDayHeard) as keyof ReturnType<typeof blank>]++; continue; }
      const consensus = reconcile({ confirmed: r.confirmed, soldOut: r.statusKey === "sold_out", doesNotSell: r.statusKey === "does_not_sell", statusKey: r.statusKey ?? undefined }, second);
      const day = second.restockDay ?? r.shipmentDayHeard;
      const detail = productDetailLabel(second) ?? r.productDetail;
      if (consensus.confirmed !== r.confirmed) flipped++;
      if (day && !r.shipmentDayHeard) dayAdded++;
      if (detail && !r.productDetail) prodAdded++;
      await db.update(callResults).set({ confirmed: consensus.confirmed, statusKey: consensus.statusKey, shipmentDayHeard: day, productDetail: detail }).where(eq(callResults.id, r.id));
      scanned++;
      after[cat(consensus.confirmed, day) as keyof ReturnType<typeof blank>]++;
    }
    const firstReal = all.filter((r) => !ownerOnly.has(r.retailerId)).reduce((m, r) => Math.min(m, r.startedAt || Infinity), Infinity);
    return c.json({ scanned, flipped, dayAdded, prodAdded, before, after, firstRealCall: isFinite(firstReal) ? firstReal : null });
  });

  // Read-only ground-truth audit: every real-store completed call with a transcript head/tail, so we can
  // hand-classify "reached a human" vs "stuck in the phone tree" and tally the true in-stock / not-in /
  // restock-coming numbers (the persisted statusKey was sometimes wrong — this reads the actual words).
  app.get("/api/admin/restock-audit", async (c) => {
    const ownerOnly = await ownerOnlyRetailerIds();
    const cats = await categoryLabelMap();
    const rmap = new Map((await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, region: retailers.region, state: retailers.state }).from(retailers)).map((r) => [r.id, r]));
    const all = (await db.select().from(callResults).where(eq(callResults.status, "completed")))
      .filter((r) => !ownerOnly.has(r.retailerId))
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const rows = all.map((r) => {
      const t = (r.transcript || "").replace(/\s+/g, " ").trim();
      const ret = rmap.get(r.retailerId);
      return {
        id: r.id, started: r.startedAt, store: ret?.name || `#${r.retailerId}`, location: ret?.location || null,
        region: ret?.region || null, state: ret?.state || null, category: cats.get(r.categoryId) || null,
        statusKey: r.statusKey, confirmed: r.confirmed, day: r.shipmentDayHeard, product: r.productDetail,
        navSec: r.navSeconds, callSec: r.callSeconds, len: t.length,
        head: t.slice(0, 900), tail: t.length > 1400 ? t.slice(-500) : "",
      };
    });
    return c.json({ total: rows.length, rows });
  });
}

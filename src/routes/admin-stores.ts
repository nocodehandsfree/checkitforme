// The Stores screen: importing and editing the 100,000 store records, deduping, quarantining,
// relinking, hours and phone numbers, coverage and data health, zones and schedules, the
// staging/production data mirror, and the pricing + feature policy behind them.

import type { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, desc, eq, inArray, isNull, like, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, categories, chains, kiosks, products, retailers, scheduleTargets, schedules, settings as settingsTbl, statuses, zoneRetailers, zones } from "../db/schema";
import { config } from "../config";
import { backfillDirectChains, importZonesData } from "../db/import-data";
import { backfillHours, backfillPhones, callZone, refreshHours, retailersWithStatus, reverifyStampedHours, zoneQuote } from "../calls/service";
import { getPolicy, setPolicy } from "../policy";
import { backfillRegions, importStores } from "../stores-import";
import { cachedChains, invalidateRefCache } from "../refcache";
import { PACKS, SUB } from "../billing";
import { chainLogoInfo, distributorsForChain, hangupTwilioCall, here, ownerOnlyRetailerIds, storeCarriesList, storeChainName } from "./shared-helpers";

// ---- Admin: table dump / load — the staging↔prod DATA MIRROR (STAGING doc, git history). Dump is
// read-only and works anywhere; load REPLACES a table and is staging-ONLY, so prod can never be
// wiped by it. Used to make staging an exact data replica of prod (chains/retailers/catalog). ----
export const MIRROR_TABLES: Record<string, typeof retailers> = { categories: categories as never, chains: chains as never, products: products as never, retailers, statuses: statuses as never, kiosks: kiosks as never, settings: settingsTbl as never };

// table-load is staging-only (403 on prod), so it may write a FEW extra tables that we deliberately
// keep OUT of the public, unauthenticated table-dump above — e.g. call_results, used to seed the
// staging finds ticker / in-stock badges from prod's already-public /pub/finds (no transcripts/PII).
export const LOAD_TABLES: Record<string, typeof retailers> = { ...MIRROR_TABLES, callResults: callResults as never };

// Store Intel — the headline numbers on the Stores tab (cached 60s). The database, at a glance.
export let storeIntelCache: { t: number; v: unknown } | null = null;

// Pokémon-MSRP coverage: what fraction of the genuine-MSRP chains' NATIONAL store footprint we've
// loaded. Denominator = the per-chain US store counts from the scored-chain dataset (tiers 3-5 =
// genuine MSRP); numerator = our active stores of those chains (capped per chain so a stale count
// can't push a chain over 100%). This is chain-FOOTPRINT coverage — how many of the chains' locations
// we hold — NOT a claim every one stocks Pokémon (a tier-3 chain carries, but varies by location).
// There is no national registry of "stores that stock Pokémon," so the scored-chain footprint is the
// benchmark. Read from the committed CSV (cached 5 min).
export let coverageRefCache: { t: number; v: Array<{ chain: string; tier: number; national: number }> } | null = null;

export function coverageRef() {
  if (coverageRefCache && Date.now() - coverageRefCache.t < 300_000) return coverageRefCache.v;
  const out: Array<{ chain: string; tier: number; national: number }> = [];
  try {
    const txt = readFileSync(join(here, "../data/source/chain-scoring-2026-06/chain_scores_final.csv"), "utf8");
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    const head = lines[0].replace(/^﻿/, "").split(",");
    const iN = head.indexOf("chain_name_exact"), iT = head.indexOf("tier_1_5"), iS = head.indexOf("stores");
    // Columns 0-7 (name/tier/…/stores) have no embedded commas — only the trailing score_note does —
    // so a plain split is safe for the indices we read.
    for (const ln of lines.slice(1)) {
      const cols = ln.split(",");
      const chain = (cols[iN] || "").trim();
      const tier = parseInt((cols[iT] || "").trim(), 10);
      const national = parseInt((cols[iS] || "").trim(), 10) || 0;
      if (chain && tier >= 1 && tier <= 5) out.push({ chain, tier, national });
    }
  } catch { /* CSV missing in this build — return empty, coverage reads 0 */ }
  coverageRefCache = { t: Date.now(), v: out };
  return out;
}

// Data-health monitor: ONE pass over active stores flags the gaps that silently break things —
// missing phone, missing hours, junk/markup names, no chain link, and **mis-chained** stores (name
// doesn't start with its chain's name — the exact failure the broken chainId filter used to hide).
// Returns overall counts + the worst chains per issue + samples to eyeball. Cached 5 min (full scan).
export let dataHealthCache: { t: number; v: unknown } | null = null;

export const zoneCallSids = new Map<number, string[]>();

export function register(app: Hono) {
  app.get("/api/policy", async (c) => c.json({ ...(await getPolicy()), catalog: { sub: SUB, packs: PACKS } }));

  app.patch("/api/policy", async (c) => {
    try { return c.json(await setPolicy(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  // ---- Store CMS: import / update / soft-remove from a JSON file ----
  app.post("/api/stores/import", async (c) => {
    const b = await c.req.json();
    const items = Array.isArray(b) ? b : (b.stores || b.items);
    if (!Array.isArray(items)) return c.json({ error: "expected an array of stores, or { stores: [...] }" }, 400);
    try { const r = await importStores(items); invalidateRefCache(); return c.json(r); } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  app.post("/api/stores/backfill-regions", async (c) => { const updated = await backfillRegions(); invalidateRefCache(); return c.json({ updated }); });

  // Soft-remove stores whose name or chain matches any term (e.g. chains that don't sell at MSRP).
  app.post("/api/stores/deactivate", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    // Phone-precise mode: deactivate exact rows by E.164 phone (surgical cleanup, reversible).
    const phones: string[] = (Array.isArray(b.phones) ? b.phones : []).map((p: unknown) => String(p).trim()).filter(Boolean);
    if (phones.length) {
      let deactivated = 0;
      for (let i = 0; i < phones.length; i += 500) {
        const batch = phones.slice(i, i + 500);
        const r = await db.update(retailers).set({ active: false }).where(and(inArray(retailers.phone, batch), eq(retailers.active, true)));
        deactivated += r.rowsAffected ?? 0;
      }
      invalidateRefCache();
      return c.json({ deactivated, by: "phone" });
    }
    const terms: string[] = (Array.isArray(b.terms) ? b.terms : []).map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean);
    if (!terms.length) return c.json({ error: "terms[] or phones[] required" }, 400);
    const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, (x.name || "").toLowerCase()]));
    let deactivated = 0;
    for (const r of await db.select().from(retailers)) {
      const hay = `${r.name || ""} ${r.chainId ? chainName.get(r.chainId) || "" : ""}`.toLowerCase();
      if (terms.some((t) => hay.includes(t)) && r.active !== false) {
        await db.update(retailers).set({ active: false }).where(eq(retailers.id, r.id)); deactivated++;
      }
    }
    invalidateRefCache();
    return c.json({ deactivated });
  });

  // Flag matching stores as kiosks and/or (non-)callable (e.g. mark Vons/Albertsons/Pavilions kiosk-only).
  // Field-safe BULK patch (Data Dev cleanup): updates ONLY the provided fields on matching stores —
  // filter by id list, chain name, and/or state — without touching anything else. `clearHours` blanks
  // fake/placeholder hours. `dryRun` returns the match count + a sample and writes nothing. Admin-gated.
  app.post("/api/stores/patch", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const where = b.where || {};
    const conds: ReturnType<typeof eq>[] = [];
    if (Array.isArray(where.ids) && where.ids.length) conds.push(inArray(retailers.id, where.ids.map(Number)));
    if (where.chain) {
      const ch = (await db.select().from(chains).where(eq(chains.name, String(where.chain))))[0];
      if (!ch) return c.json({ error: "chain not found" }, 404);
      conds.push(eq(retailers.chainId, ch.id));
    }
    if (where.state) conds.push(eq(retailers.state, String(where.state).toUpperCase()));
    if (!conds.length) return c.json({ error: "a where filter (ids | chain | state) is required" }, 400);
    const filter = conds.length === 1 ? conds[0] : and(...conds);
    const set: Record<string, unknown> = { ...(b.set && typeof b.set === "object" ? b.set : {}) };
    if (b.clearHours) { set.hours = null; set.hoursUpdatedAt = null; }
    if (!Object.keys(set).length) return c.json({ error: "set{} or clearHours required" }, 400);
    const matched = await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(filter);
    if (b.dryRun) return c.json({ dryRun: true, matched: matched.length, sample: matched.slice(0, 5), willSet: Object.keys(set) });
    await db.update(retailers).set(set).where(filter);
    invalidateRefCache();
    return c.json({ patched: matched.length, set: Object.keys(set) });
  });

  app.post("/api/stores/flag", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const terms: string[] = (Array.isArray(b.terms) ? b.terms : []).map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean);
    if (!terms.length) return c.json({ error: "terms[] required" }, 400);
    const set: Record<string, boolean> = {};
    if (typeof b.hasKiosk === "boolean") set.hasKiosk = b.hasKiosk;
    if (typeof b.sellsPacks === "boolean") set.sellsPacks = b.sellsPacks;
    if (!Object.keys(set).length) return c.json({ error: "hasKiosk or sellsPacks required" }, 400);
    const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, (x.name || "").toLowerCase()]));
    // Whole-word match so "vons" doesn't catch "Devonshire".
    const rx = new RegExp("\\b(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "i");
    let updated = 0;
    for (const r of await db.select().from(retailers)) {
      const hay = `${r.name || ""} ${r.chainId ? chainName.get(r.chainId) || "" : ""}`;
      if (rx.test(hay)) { await db.update(retailers).set(set).where(eq(retailers.id, r.id)); updated++; }
    }
    invalidateRefCache();
    return c.json({ updated });
  });

  app.get("/api/admin/table-dump", async (c) => {
    const name = String(c.req.query("name") || "");
    const tbl = MIRROR_TABLES[name];
    if (!tbl) return c.json({ error: "unknown table", tables: Object.keys(MIRROR_TABLES) }, 400);
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 5000), 1), 20000);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    const rows = await db.select().from(tbl).limit(limit).offset(offset);
    return c.json({ table: name, offset, count: rows.length, rows });
  });

  app.post("/api/admin/table-load", async (c) => {
    if (!config.staging.on) return c.json({ error: "table-load is staging-only (never wipes prod)" }, 403);
    const b = await c.req.json().catch(() => ({}));
    const name = String(b.name || "");
    const tbl = LOAD_TABLES[name];
    const rows: Record<string, unknown>[] | null = Array.isArray(b.rows) ? b.rows : null;
    if (!tbl || !rows) return c.json({ error: "name + rows[] required" }, 400);
    if (b.mode === "replace") await db.delete(tbl);
    for (let i = 0; i < rows.length; i += 500) await db.insert(tbl).values(rows.slice(i, i + 500) as never);
    invalidateRefCache();
    // The mirror pulls prod's LEARNED nav (Ace's "press 4 @ 10s") into staging's chains. Re-enforce the
    // curated direct default right here so it wins over the mirror — a table-load is a runtime action, so
    // relying on the boot pass alone would leave these chains clobbered until the next redeploy.
    if (name === "chains") await backfillDirectChains();
    return c.json({ table: name, mode: b.mode || "append", inserted: rows.length, ...(name === "chains" ? { directEnforced: true } : {}) });
  });

  // Bulk display-name cleanup (Data Dev) in ONE DB pass:
  //  (0) hygiene: strip store numbers ("Burlington West Hills (#264)" -> "Burlington West Hills"),
  //      Title-Case all-caps streets ("NORTH DEMAREE STREET" -> "North Demaree Street"), and rebuild
  //      junk/HTML-corrupt names from chain + city.
  //  (1) separator normalization: "CVS — Visalia" -> "CVS Visalia". An em/en-dash or a spaced hyphen
  //      between words collapses to a single space; in-word hyphens ("Jewel-Osco", "H-E-B") are preserved.
  //  (2) same-city disambiguation: stores are grouped by (chain, city). A city with one store keeps its
  //      "<chain> <city>" name; a city with several gets each renamed to "<chain> <street>" per the owner's
  //      rule ("Big 5 Victory Blvd"). Streets are compared on a NORMALIZED key (N./North, Blvd/Boulevard,
  //      Rd/Road all fold together) so two stores on the same road are detected even when the raw address
  //      punctuation differs — and the house number is added to tell them apart. Grouping by (chain, city)
  //      rather than by exact name makes the pass idempotent (safe to re-run). Scope with body.state (run a
  //      finished region first to avoid racing a live relabel). dryRun reports counts + a sample, no writes.
  app.post("/api/stores/dedupe", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const stateF = b.state ? String(b.state).toUpperCase() : null;
    const conds = [eq(retailers.active, true)];
    if (stateF) conds.push(eq(retailers.state, stateF));
    // Optional: scope to ONE chain and force-normalize its names to "Chain City"/"Chain Street" even when
    // the current name isn't "corrupt". Franchise imports (e.g. Hallmark's "Trudy's Hallmark Shop Location")
    // are <80 chars, so the default pass preserves them — this forces them onto the house naming scheme.
    let forceChain = false;
    if (b.chain) {
      const ch = (await db.select().from(chains).where(eq(chains.name, String(b.chain))))[0];
      if (!ch) return c.json({ error: "chain not found" }, 404);
      conds.push(eq(retailers.chainId, ch.id));
      forceChain = true;
    }
    const rows = await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, address: retailers.address, chainId: retailers.chainId })
      .from(retailers).where(and(...conds));
    const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, x.name || ""]));
    const normSep = (s: string) => (s || "")
      .replace(/\s*\(#\s*\d+\)/g, " ")                         // drop "(#264)" store numbers
      .replace(/\s+#\s*\d+\b/g, " ")                           // drop " #264" store numbers
      .replace(/\s*[—–]\s*/g, " ").replace(/\s+-\s+/g, " ").replace(/\s{2,}/g, " ").trim();
    // all-caps street from raw data ("NORTH DEMAREE STREET") -> Title Case; mixed-case left untouched.
    const fixCaps = (s: string) => /[a-z]/.test(s) ? s : s.replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
    // Scraped-HTML/markup detector. Names are also "junk" when absurdly long; addresses are NOT length-judged
    // (real street addresses can be long) — only markup makes an address corrupt. This keeps garbage from a
    // corrupt address field from ever flowing into a display name via the street() disambiguator.
    const MARKUP = /[<>]|&#|&lt;|&gt;|Self-Service|Return Policy|Help Center|\bid=|style=|https?:/i;
    const corruptName = (s: string) => MARKUP.test(s || "") || (s || "").length > 80;
    const corruptAddr = (s: string | null) => MARKUP.test(s || "");
    const cityOf = (r: { location: string | null }) => (r.location || "").split(",")[0].trim();
    const street = (addr: string | null) => {
      let a = (addr || "").trim();
      if (!a || corruptAddr(a)) return "";                    // empty or scraped-HTML address -> no street name
      a = a.split(",")[0].trim();                              // drop city/state/zip
      a = a.replace(/^\d+[A-Za-z]?\s+/, "");                   // drop leading house number
      a = a.replace(/\s+(?:Ste|Suite|Unit|Apt|#|Bldg|Fl|Floor)\b.*$/i, "").trim(); // drop suite/unit
      return a.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
    };
    const SUF: Record<string, string> = { street: "st", avenue: "ave", av: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", court: "ct", place: "pl", parkway: "pkwy", pkway: "pkwy", highway: "hwy", terrace: "ter", circle: "cir", square: "sq", trail: "trl", plaza: "plz" };
    const DIR: Record<string, string> = { north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
    const streetKey = (addr: string | null) => street(addr).toLowerCase().replace(/[.,]/g, "").split(/\s+/).map((w) => DIR[w] || SUF[w] || w).filter(Boolean).join(" ");
    const houseNum = (addr: string | null) => { if (corruptAddr(addr)) return ""; const m = (addr || "").trim().match(/^(\d+[A-Za-z]?)/); return m ? m[1] : ""; };
    // final tiebreaker for two stores in the same building (same house # + street) — the suite/unit, e.g. "#183".
    // Keywords are word-bounded so a street like "Old Steese Hwy" can't false-match "Ste" -> "#ese".
    const suite = (addr: string | null) => { if (corruptAddr(addr)) return ""; const m = (addr || "").match(/(?:\b(?:Ste|Suite|Unit|Apt)\b\.?|#)\s*#?\s*([A-Za-z0-9-]+)/i); return m ? `#${m[1]}` : ""; };

    // default name = separator-normalized current name (preserves curated mall/neighborhood names on singles)
    const proposed = new Map<number, string>();
    for (const r of rows) proposed.set(r.id, normSep(r.name || ""));
    // rebuild junk/corrupt names from chain + city (collision pass below may further street-name them).
    // base = the chain name; if a junk row has no chainId, recover the chain from the clean text before the
    // markup begins ("Dollar General 1. Self-Service…" -> "Dollar General"). A long-but-clean independent
    // name with no chain is left alone rather than mangled.
    const namePrefix = (s: string) => (s || "").split(/[<&]|\b\d+\.\s|Self-Service|Return Policy|Help Center|style=|\bid=/i)[0].replace(/\s+/g, " ").trim();
    for (const r of rows) if (corruptName(r.name) || (forceChain && r.chainId)) {
      let base = (r.chainId && chainName.get(r.chainId)) || "";
      if (!base && MARKUP.test(r.name || "")) base = namePrefix(r.name);
      if (!base) continue;
      proposed.set(r.id, cityOf(r) ? `${base} ${cityOf(r)}` : base);
    }
    const baseOf = (r: { chainId: number | null; id: number }) =>
      (r.chainId && chainName.get(r.chainId)) ? chainName.get(r.chainId)! : (proposed.get(r.id) || "");

    // group by (chain | normalized-name, city) so re-runs regroup correctly regardless of prior names
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const gk = (r.chainId ? `c${r.chainId}` : `n:${proposed.get(r.id)}`) + "|||" + (r.location || "");
      let g = groups.get(gk); if (!g) { g = []; groups.set(gk, g); } g.push(r);
    }
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;                            // one store in this city -> keep its name
      const keyCount = new Map<string, number>();
      for (const r of grp) { const k = streetKey(r.address); if (k) keyCount.set(k, (keyCount.get(k) || 0) + 1); }
      for (const r of grp) {
        const disp = fixCaps(street(r.address));
        if (!disp) continue;                                   // no usable address -> can't street-name
        const sameStreet = (keyCount.get(streetKey(r.address)) || 0) > 1;
        const hn = houseNum(r.address);
        proposed.set(r.id, sameStreet && hn ? `${baseOf(r)} ${hn} ${disp}` : `${baseOf(r)} ${disp}`);
      }
      // residual collision (same building, e.g. two mall units) -> append the suite/unit number
      const nmCount = new Map<string, number>();
      for (const r of grp) nmCount.set(proposed.get(r.id)!, (nmCount.get(proposed.get(r.id)!) || 0) + 1);
      for (const r of grp) {
        if ((nmCount.get(proposed.get(r.id)!) || 0) > 1) {
          const su = suite(r.address);
          if (su) proposed.set(r.id, `${proposed.get(r.id)} ${su}`);
        }
      }
    }

    const changes = rows.filter((r) => proposed.get(r.id) && proposed.get(r.id) !== (r.name || ""));
    const addrBad = rows.filter((r) => corruptAddr(r.address));   // scraped-HTML addresses -> blanked
    if (b.dryRun) {
      return c.json({ dryRun: true, scope: stateF || "ALL", active: rows.length, changed: changes.length, addrBlank: addrBad.length,
        sample: changes.slice(0, 24).map((r) => ({ id: r.id, from: r.name, to: proposed.get(r.id), city: r.location })) });
    }
    for (const r of changes) await db.update(retailers).set({ name: proposed.get(r.id)! }).where(eq(retailers.id, r.id));
    for (const r of addrBad) await db.update(retailers).set({ address: null }).where(eq(retailers.id, r.id));
    invalidateRefCache();
    return c.json({ scope: stateF || "ALL", active: rows.length, changed: changes.length, addrBlanked: addrBad.length,
      sample: changes.slice(0, 12).map((r) => ({ from: r.name, to: proposed.get(r.id) })) });
  });

  // Quarantine CVS-inside-Target: the CVS pharmacy counters that live inside a Target share that Target's
  // exact street address — they don't carry cards and must never be called. Match every CVS against every
  // Target by normalized street address (+ a <250m proximity guard so identical addresses in different towns
  // don't collide), then move the matches into a MUTED "CVS Pharmacy at Target" chain (and set sellsPacks
  // false as a hard non-callable backstop) so they drop out of the consumer list and the call workflow.
  // dryRun returns the count + a sample and writes nothing. Admin-gated.
  app.post("/api/stores/quarantine-cvs-in-target", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const allChains = await db.select().from(chains);
    const cvsChain = allChains.find((x) => x.name === "CVS");
    const targetChain = allChains.find((x) => x.name === "Target");
    if (!cvsChain || !targetChain) return c.json({ error: "CVS or Target chain not found" }, 404);
    const SUF: Record<string, string> = { street: "st", avenue: "ave", av: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", highway: "hwy", parkway: "pkwy", place: "pl", court: "ct", circle: "cir", terrace: "ter", trail: "trl" };
    const DIR: Record<string, string> = { north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
    const akey = (addr: string | null) =>
      (addr || "").split(",")[0].toLowerCase().replace(/\b(ste|suite|unit|apt|#|bldg|fl)\b.*$/, "").replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/).filter(Boolean).map((t) => DIR[t] || SUF[t] || t).join(" ").trim();
    const meters = (a: { lat: number | null; lng: number | null }, t: { lat: number | null; lng: number | null }) => {
      if (a.lat == null || a.lng == null || t.lat == null || t.lng == null) return 9e9;
      const R = 6371000, p1 = a.lat * Math.PI / 180, p2 = t.lat * Math.PI / 180;
      const dp = (t.lat - a.lat) * Math.PI / 180, dl = (t.lng - a.lng) * Math.PI / 180;
      const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(x));
    };
    const targets = (await db.select().from(retailers).where(and(eq(retailers.chainId, targetChain.id), eq(retailers.active, true))))
      .filter((t) => t.address && t.lat != null);
    const byAddr = new Map<string, typeof targets>();
    for (const t of targets) { const k = akey(t.address); if (!k) continue; const g = byAddr.get(k); if (g) g.push(t); else byAddr.set(k, [t]); }
    const cvs = await db.select().from(retailers).where(and(eq(retailers.chainId, cvsChain.id), eq(retailers.active, true)));
    const matched: { id: number; name: string; address: string | null; target: string }[] = [];
    for (const s of cvs) {
      const k = akey(s.address);
      const hit = k ? (byAddr.get(k) || []).find((t) => meters(s, t) < 250) : undefined;
      const addrSaysTarget = /\btarget\b/i.test(s.address || "");
      if (hit || addrSaysTarget) matched.push({ id: s.id, name: s.name, address: s.address, target: hit ? hit.name : "addr:Target" });
    }
    if (b.dryRun) return c.json({ dryRun: true, cvsTotal: cvs.length, targetTotal: targets.length, matched: matched.length, sample: matched.slice(0, 25) });
    let q = allChains.find((x) => x.name === "CVS Pharmacy at Target");
    if (!q) { const [row] = await db.insert(chains).values({ name: "CVS Pharmacy at Target", type: "Pharmacy", muted: true }).returning(); q = row; }
    else if (!q.muted) await db.update(chains).set({ muted: true }).where(eq(chains.id, q.id));
    const ids = matched.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ chainId: q.id, sellsPacks: false }).where(inArray(retailers.id, ids.slice(i, i + 500)));
    invalidateRefCache();
    return c.json({ moved: ids.length, intoChain: "CVS Pharmacy at Target", muted: true, chainId: q.id, sample: matched.slice(0, 12) });
  });

  // Re-link orphan stores (active rows with chainId NULL) to an existing chain by their display name.
  // An orphan has no chain → no logo, no chain tier, no phone-tree default. But the name still leads with
  // the brand ("Burlington Jewelry District" → "Burlington"), so we re-attach by matching the LONGEST
  // chain name that is a whole-word prefix of the store name (so "Barnes & Noble" wins over "Barnes").
  // Apostrophes/periods are normalized away ("Sam's Club" ≡ "Sams Club"). Hidden "_…" buckets (merged /
  // quarantined chains) are never a target. No prefix match → the row is left alone. dryRun reports the
  // counts + a per-chain breakdown + samples so the match set can be eyeballed before applying.
  app.post("/api/stores/relink-orphans", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const norm = (s: string) => (s || "").toLowerCase().replace(/[.'‘’]/g, "").replace(/\s+/g, " ").trim();
    const cand = (await db.select({ id: chains.id, name: chains.name }).from(chains))
      .filter((ch) => ch.name && !ch.name.startsWith("_"))
      .map((ch) => ({ id: ch.id, name: ch.name as string, key: norm(ch.name as string) }))
      .filter((ch) => ch.key.length >= 2)
      .sort((a, z) => z.key.length - a.key.length); // longest first → most specific match wins
    const matchChain = (storeName: string) => {
      const n = norm(storeName);
      for (const ch of cand) if (n === ch.key || n.startsWith(ch.key + " ")) return ch;
      return null;
    };
    const orphans = await db.select({ id: retailers.id, name: retailers.name }).from(retailers)
      .where(and(eq(retailers.active, true), isNull(retailers.chainId)));
    const byChain = new Map<string, { chainId: number; n: number; sample: string[] }>();
    const groups = new Map<number, number[]>();
    const unmatched: string[] = [];
    for (const o of orphans) {
      const m = matchChain(o.name);
      if (!m) { if (unmatched.length < 30) unmatched.push(o.name); continue; }
      const arr = groups.get(m.id) ?? []; arr.push(o.id); groups.set(m.id, arr);
      const g = byChain.get(m.name) || { chainId: m.id, n: 0, sample: [] };
      g.n++; if (g.sample.length < 3) g.sample.push(o.name);
      byChain.set(m.name, g);
    }
    const linked = [...groups.values()].reduce((s, a) => s + a.length, 0);
    const breakdown = [...byChain.entries()].map(([chain, v]) => ({ chain, n: v.n, sample: v.sample })).sort((a, z) => z.n - a.n);
    if (b.dryRun) return c.json({ dryRun: true, orphans: orphans.length, willLink: linked, unmatched: unmatched.length, unmatchedSample: unmatched, breakdown: breakdown.slice(0, 50) });
    for (const [chainId, ids] of groups)
      for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ chainId }).where(inArray(retailers.id, ids.slice(i, i + 500)));
    invalidateRefCache();
    return c.json({ orphans: orphans.length, linked, unmatched: unmatched.length, chains: breakdown.length, breakdown: breakdown.slice(0, 50) });
  });

  // Close the "ungraded tail": fill retailers.tier ONLY where it is NULL, per chain, from a supplied
  // { chainName: tier } map (the chain_scores_final.csv values). It NEVER overwrites an existing tier, so
  // deliberate per-store voice overrides and owner tier calls (e.g. TJ Maxx = 3) are preserved — this only
  // grades stores that have no tier yet. Chains absent from the DB are reported as unmatched (no guess).
  // dryRun reports, per scored chain, how many null-tier stores it WOULD fill.
  app.post("/api/stores/grade-from-defaults", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const defaults = (b.defaults && typeof b.defaults === "object") ? b.defaults as Record<string, unknown> : null;
    if (!defaults) return c.json({ error: "defaults{ chainName: tier } required" }, 400);
    const byName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.name, x.id]));
    const out: { chain: string; tier: number; filled: number }[] = [];
    const unmatched: string[] = [];
    for (const [name, tierRaw] of Object.entries(defaults)) {
      const tier = Number(tierRaw);
      if (!Number.isInteger(tier) || tier < 1 || tier > 5) continue;
      const cid = byName.get(name);
      if (!cid) { unmatched.push(name); continue; }
      const nulls = await db.select({ id: retailers.id }).from(retailers)
        .where(and(eq(retailers.chainId, cid), eq(retailers.active, true), isNull(retailers.tier)));
      if (!b.dryRun && nulls.length) {
        const ids = nulls.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ tier }).where(inArray(retailers.id, ids.slice(i, i + 500)));
      }
      out.push({ chain: name, tier, filled: nulls.length });
    }
    if (!b.dryRun) invalidateRefCache();
    const detail = out.filter((o) => o.filled > 0).sort((a, z) => z.filled - a.filled);
    return c.json({ dryRun: !!b.dryRun, scoredChains: out.length, chainsWithGaps: detail.length, totalFilled: detail.reduce((s, o) => s + o.filled, 0), unmatched, detail });
  });

  // Name normalizer: fixes the junk the dedupe doesn't (ALL-CAPS words, `&amp;` entities, " - "
  // separators) across ALL active stores server-side — reaching names past the read API's 1000-row cap.
  // Title-cases all-caps WORDS of length ≥4 (so true brand/dir acronyms — CVS, AFB, NE, plus a keep-set
  // AAFES/IKEA — stay upper, not "Cvs"/"Aafes"). Scoped to names that actually look junk so it never
  // touches a clean name. dryRun previews the rename set.
  app.post("/api/stores/fix-caps", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const KEEP = new Set(["AAFES", "IKEA", "NEX", "MCX", "AMC", "BBQ"]);
    const fix = (n: string): string => {
      let s = n.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?[a-z0-9]+;/gi, "");
      s = s.replace(/\s+-\s+/g, " ");
      s = s.split(/\s+/).map((w) => (!KEEP.has(w) && w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(" ");
      return s.replace(/\s+/g, " ").trim();
    };
    const junky = (n: string) => /&\w+;|<[a-z/]|style=|\(#\d| - | Shop Location/i.test(n) || /\b[A-Z]{4,}\s+[A-Z]{4,}\b/.test(n) || n.length > 80;
    const rows = await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(eq(retailers.active, true)).limit(200000);
    const changes = rows.map((r) => ({ id: r.id, from: r.name || "", to: fix(r.name || "") })).filter((x) => junky(x.from) && x.to && x.to !== x.from);
    if (b.dryRun) return c.json({ dryRun: true, willFix: changes.length, sample: changes.slice(0, 25) });
    for (const ch of changes) await db.update(retailers).set({ name: ch.to }).where(eq(retailers.id, ch.id));
    invalidateRefCache();
    return c.json({ fixed: changes.length, sample: changes.slice(0, 25) });
  });

  // ---- Store hours: backfill all (background) + refresh one + re-verify unverified stamps ----
  app.post("/api/hours/backfill", async (c) => c.json(await backfillHours()));

  // Phone backfill for call-rail stores imported address-only (nophone: sentinel). Scope to a chain
  // via ?chainId= (required in practice — never run unscoped over site-rail chains). ?dryRun=1 previews.
  app.post("/api/phones/backfill", async (c) =>
    c.json(await backfillPhones({ chainId: c.req.query("chainId") ? Number(c.req.query("chainId")) : undefined, dryRun: c.req.query("dryRun") === "1" })));

  app.post("/api/hours/:id/refresh", async (c) => {
    const r = await refreshHours(Number(c.req.param("id")));
    return r ? c.json(r) : c.json({ error: "no address / lookup failed" }, 400);
  });

  // Re-verify stores carrying an UNVERIFIED hours stamp (hours set, hoursUpdatedAt null) so nothing shows
  // open on a guess. dryRun returns the count + sample; otherwise kicks a fire-and-forget background sweep.
  app.post("/api/hours/reverify-stamps", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    return c.json(await reverifyStampedHours({ dryRun: !!b.dryRun }));
  });

  // ---- Reference data ----
  app.get("/api/categories", async (c) => c.json(await db.select().from(categories)));

  // ---- Products (catalog → SKU-level checks) ----
  app.get("/api/products", async (c) => {
    const cat = c.req.query("categoryId");
    const rows = cat
      ? await db.select().from(products).where(eq(products.categoryId, Number(cat)))
      : await db.select().from(products);
    return c.json(rows);
  });

  // ---- Retailers (with green status) ----
  app.get("/api/retailers", async (c) => {
    const rows = await retailersWithStatus({
      q: c.req.query("q") || undefined, state: c.req.query("state") || undefined,
      type: c.req.query("type") || undefined, region: c.req.query("region") || undefined,
      carries: c.req.query("carries") || undefined, online: c.req.query("online") === "1" || undefined,
      chainId: c.req.query("chainId") ? Number(c.req.query("chainId")) : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });
    // Attach the same chain-logo info the consumer surfaces use, so the admin Stores list renders
    // the exact /logos/chains files (per public/logos/chains/README.md) — muted chains included.
    const names = new Map((await db.select().from(chains)).map((x) => [x.id, x.name]));
    return c.json(rows.map((r) => {
      const chainName = (r.chainId && names.get(r.chainId)) || null;
      const l = chainLogoInfo(chainName || storeChainName(r.name));
      return { ...r, carries: storeCarriesList(chainName, r.carries).join(","), distributor: distributorsForChain(chainName), logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct };
    }));
  });

  app.get("/api/admin/store-intel", async (c) => {
    if (storeIntelCache && Date.now() - storeIntelCache.t < 60_000) return c.json(storeIntelCache.v);
    const countWhere = async (w: ReturnType<typeof and> | ReturnType<typeof eq>) =>
      Number((await db.select({ n: sql<number>`count(*)` }).from(retailers).where(w))[0]?.n || 0);
    const active = eq(retailers.active, true);
    const total = await countWhere(active);
    // "Callable" = a REAL dialable line. Exclude the "nophone:" sentinel (address-only / site-check
    // imports) — those have a non-empty phone field but nothing to dial, so they were inflating the count.
    const callable = await countWhere(and(active, sql`${retailers.phone} is not null and ${retailers.phone} != '' and ${retailers.phone} not like 'nophone:%'`));
    const PRODUCTS = ["Pokemon", "One Piece", "Topps", "NeeDoh", "Magic", "Yu-Gi-Oh", "Lorcana", "Sports Cards", "Squishmallows"];
    const byProduct: Record<string, number> = {};
    for (const p of PRODUCTS) byProduct[p] = await countWhere(and(active, like(retailers.carries, `%${p}%`)));
    const stateRows = await db.select({ s: retailers.state }).from(retailers).where(active).groupBy(retailers.state);
    const states = stateRows.filter((r) => r.s).length;
    const chainRows = await cachedChains();
    const types = [...new Set(chainRows.map((x) => x.type).filter(Boolean))].sort();

    // ---- Reports (cached with the rest, 60s) ----
    // Stores by type: group by chain, fold chain → its type ("Other" for chain-less rows).
    const chainTypeOf = new Map(chainRows.map((x) => [x.id, x.type || "Other"]));
    const byChain = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers).where(active).groupBy(retailers.chainId);
    const typeTotals: Record<string, number> = {};
    for (const r of byChain) { const t = (r.cid && chainTypeOf.get(r.cid)) || "Other"; typeTotals[t] = (typeTotals[t] || 0) + Number(r.n || 0); }
    const byType = Object.entries(typeTotals).map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
    // Top regions by store count.
    const topRegions = (await db.select({ region: retailers.region, n: sql<number>`count(*)` }).from(retailers)
      .where(and(active, sql`${retailers.region} is not null and ${retailers.region} != ''`))
      .groupBy(retailers.region).orderBy(desc(sql`count(*)`)).limit(10))
      .map((r) => ({ region: r.region as string, n: Number(r.n || 0) }));
    // Most-checked stores (most call results recorded against them).
    const funIds = [...(await ownerOnlyRetailerIds())]; // owner-only "Fun" store: never counted in reports
    const checkRows = await db.select({ rid: callResults.retailerId, n: sql<number>`count(*)` }).from(callResults)
      .where(and(sql`${callResults.retailerId} is not null`, sql`coalesce(${callResults.status},'') != 'admin_hangup'`, funIds.length ? notInArray(callResults.retailerId, funIds) : undefined))
      .groupBy(callResults.retailerId).orderBy(desc(sql`count(*)`)).limit(10);
    const checkIds = checkRows.map((r) => r.rid).filter((x): x is number => x != null);
    const checkNames = checkIds.length
      ? new Map((await db.select({ id: retailers.id, name: retailers.name, location: retailers.location }).from(retailers).where(inArray(retailers.id, checkIds))).map((r) => [r.id, r]))
      : new Map();
    const topChecks = checkRows.map((r) => ({ name: (r.rid != null && checkNames.get(r.rid)?.name) || `#${r.rid}`, location: (r.rid != null && checkNames.get(r.rid)?.location) || "", n: Number(r.n || 0) }));

    const v = { total, callable, byProduct, states, chains: chainRows.length, types, byType, topRegions, topChecks };
    storeIntelCache = { t: Date.now(), v };
    return c.json(v);
  });

  app.get("/api/admin/coverage", async (c) => {
    const ref = coverageRef();
    const byChain = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
      .where(eq(retailers.active, true)).groupBy(retailers.chainId);
    const idByName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.name, x.id]));
    const ourByCid = new Map(byChain.map((r) => [r.cid, Number(r.n || 0)]));
    const msrp = ref.filter((r) => r.tier >= 3 && r.tier <= 5 && r.national > 0);
    let loaded = 0, national = 0;
    const rows = msrp.map((r) => {
      const cid = idByName.get(r.chain);
      const ours = cid != null ? (ourByCid.get(cid) || 0) : 0;
      loaded += Math.min(ours, r.national); national += r.national;
      return { chain: r.chain, tier: r.tier, national: r.national, ours, pct: Math.round(100 * ours / r.national) };
    });
    return c.json({
      coveragePct: national ? Math.round(1000 * loaded / national) / 10 : 0,
      loaded, national, msrpChains: msrp.length,
      gaps: rows.filter((g) => g.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 25),
      note: "Coverage = the % of the national store footprint of the retail chains we know carry Pokémon at MSRP (tiers 3-5) that we've loaded. It measures chains/locations that CAN carry it — not that every store has it in stock right now (a 'spotty' tier-3 chain carries, but varies by location).",
    });
  });

  app.get("/api/admin/data-health", async (c) => {
    if (!c.req.query("fresh") && dataHealthCache && Date.now() - dataHealthCache.t < 300_000) return c.json(dataHealthCache.v);
    const chainName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.id, x.name || ""]));
    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Mis-chain = store name and chain name share NO significant word. Shared-token (not prefix) so a
    // store correctly chained but named with a franchise prefix / short brand / variant ("Franklin's Ace
    // Hardware" ∈ "Ace Hardware", "Big 5 Reseda" ∈ "Big 5 Sporting Goods", "CVS West Hills" ∈ "_CVS
    // Pharmacy at Target") is NOT flagged — only a genuinely foreign brand (a Savers row under Dick's) is.
    const STOP = new Set(["the", "and", "of", "at", "for", "store", "shop", "inc", "llc"]);
    // Stem a trailing possessive/plural -s so the chain "Mariano's"/"Lowe's"/"Smith's" (tokens mariano/lowe/smith)
    // matches its real stores spelled "Marianos …"/"… Lowes"/"Smiths …". Without this the apostrophe makes
    // mariano ≠ marianos and ~30 correctly-chained grocery stores get false-flagged as mis-chained.
    const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
    const sig = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)).map(stem)); // keep 2-char brands (BJ's, etc.)
    const junkRx = /&lt;|&gt;|style=|<[a-z/]|\(#\d|—| - | Shop Location|Holiday (Décor|Greeting)/i;
    const allCaps = /\b[A-Z]{4,}\s+[A-Z]{4,}\b/;
    const rows = await db.select({ id: retailers.id, name: retailers.name, chainId: retailers.chainId, phone: retailers.phone, hours: retailers.hours, ownerOnly: retailers.ownerOnly })
      .from(retailers).where(eq(retailers.active, true)).limit(200000);
    let missingPhone = 0, missingHours = 0, junk = 0, noChain = 0, misChain = 0;
    const byHours = new Map<number, number>(), byMis = new Map<number, number>();
    const junkSample: string[] = [], misSample: string[] = [];
    for (const r of rows) {
      const nm = r.name || "";
      if (r.ownerOnly) continue; // owner-only demo stores (Fun/MVPs) are intentional fixtures — never "problems"
      if (!r.phone || r.phone.startsWith("nophone:")) missingPhone++;
      if (!r.hours) { missingHours++; if (r.chainId) byHours.set(r.chainId, (byHours.get(r.chainId) || 0) + 1); }
      if (junkRx.test(nm) || allCaps.test(nm) || nm.length > 80) { junk++; if (junkSample.length < 15) junkSample.push(nm.slice(0, 70)); }
      if (!r.chainId) { noChain++; continue; }
      const cn = chainName.get(r.chainId);
      if (cn) {
        const ct = sig(cn), st = sig(nm);
        if (ct.size && st.size && ![...st].some((t) => ct.has(t))) {
          misChain++; byMis.set(r.chainId, (byMis.get(r.chainId) || 0) + 1);
          if (misSample.length < 15) misSample.push(`${nm.slice(0, 40)}  → chain: ${cn}`);
        }
      }
    }
    const top = (m: Map<number, number>) => [...m.entries()].map(([cid, n]) => ({ chain: chainName.get(cid) || `#${cid}`, n })).sort((a, b) => b.n - a.n).slice(0, 20);
    const v = {
      total: rows.length, missingPhone, missingHours, junkNames: junk, noChain, misChained: misChain,
      worstHours: top(byHours), worstMisChain: top(byMis), junkSample, misSample,
      note: "One pass over active stores. misChained = store name shares NO significant word with its chain (possessive -s stemmed, so real Mariano's/Lowe's/Smith's stores no longer false-flag). Remaining hits are independents auto-filed under a big chain by name prefix (e.g. 'Lee Harrison' under Harris Teeter) — real stores wearing the wrong logo, re-home not delete; eyeball misSample. missingHours concentrated in thrift (openState treats blank hours as closed-overnight only). Pass ?fresh=1 to bypass the 5-min cache.",
    };
    dataHealthCache = { t: Date.now(), v };
    return c.json(v);
  });

  app.post("/api/retailers", async (c) => {
    const b = await c.req.json();
    const [row] = await db.insert(retailers).values(b).returning();
    return c.json(row, 201);
  });

  app.patch("/api/retailers/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json();
    // Owner-only demo stores ("Fun"/"MVPs"): the phone number IS the on/off switch — saving a number makes
    // the store appear, clearing it hides it entirely. Derived server-side so it works regardless of which
    // fields the Admin sends. Real stores are untouched (active is managed independently for them).
    if (Object.prototype.hasOwnProperty.call(b, "phone")) {
      const cur = (await db.select({ ownerOnly: retailers.ownerOnly }).from(retailers).where(eq(retailers.id, id)))[0];
      if (cur?.ownerOnly) b.active = !!(b.phone && String(b.phone).trim());
    }
    const [row] = await db.update(retailers).set(b).where(eq(retailers.id, id)).returning();
    return c.json(row);
  });

  // Hard-delete a store (admin) — for purging test/probe rows and confirmed junk. Soft-remove
  // (active:false) hides from consumers; this removes the row entirely. Returns how many were deleted.
  app.delete("/api/retailers/:id", async (c) => {
    const r = await db.delete(retailers).where(eq(retailers.id, Number(c.req.param("id"))));
    invalidateRefCache();
    return c.json({ deleted: r.rowsAffected ?? 0 });
  });

  // ---- Zones ----
  app.get("/api/zones", async (c) => {
    const zs = await db.select().from(zones);
    const links = await db.select().from(zoneRetailers);
    return c.json(zs.map((z) => ({ ...z, retailerIds: links.filter((l) => l.zoneId === z.id).map((l) => l.retailerId) })));
  });

  app.post("/api/zones", async (c) => {
    const [row] = await db.insert(zones).values(await c.req.json()).returning();
    return c.json(row, 201);
  });

  app.post("/api/zones/:id/retailers", async (c) => {
    const { retailerId } = await c.req.json();
    const [row] = await db.insert(zoneRetailers).values({ zoneId: Number(c.req.param("id")), retailerId }).returning();
    return c.json(row, 201);
  });

  // Bulk import zones + stores from a JSON file (de-dupes; coordinates fill in via background geocoding).
  app.post("/api/import-zones", async (c) => c.json(await importZonesData(await c.req.json())));

  // Call every store in a zone (explicit, on-demand — never automatic). Remember the placed callSids so
  // the operator can cancel the whole batch (like Stop & hang-up does for a single call).
  app.post("/api/zones/:id/call-now", async (c) => {
    const zoneId = Number(c.req.param("id"));
    const res = await callZone(zoneId);
    zoneCallSids.set(zoneId, res.callSids ?? []);
    setTimeout(() => zoneCallSids.delete(zoneId), 15 * 60 * 1000); // calls are long done by then
    return c.json({ placed: res.placed });
  });

  // Cancel an in-progress zone call: hang up every Twilio call we placed for it.
  app.post("/api/zones/:id/hangup", async (c) => {
    const zoneId = Number(c.req.param("id"));
    const sids = zoneCallSids.get(zoneId) ?? [];
    await Promise.all(sids.map((s) => hangupTwilioCall(s)));
    zoneCallSids.delete(zoneId);
    return c.json({ ok: true, cancelled: sids.length });
  });

  // Credit feasibility for a zone (one credit/store) — the user-facing zone caller must check this
  // up front so nobody starts a zone they can't finish. (Wired + ready; user firing stays gated off.)
  app.get("/api/zones/:id/quote", async (c) => c.json(await zoneQuote(Number(c.req.param("id")))));

  // The stores a zone will dial — names for the pre-call warning so the operator sees exactly who gets called.
  app.get("/api/zones/:id/stores", async (c) => {
    const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, Number(c.req.param("id"))));
    const ids = links.map((l) => l.retailerId);
    if (!ids.length) return c.json([]);
    return c.json(await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(inArray(retailers.id, ids)));
  });

  // ---- Schedules ----
  app.get("/api/schedules", async (c) => c.json(await db.select().from(schedules)));

  app.post("/api/schedules", async (c) => {
    const [row] = await db.insert(schedules).values(await c.req.json()).returning();
    return c.json(row, 201);
  });

  app.patch("/api/schedules/:id", async (c) => {
    const [row] = await db.update(schedules).set(await c.req.json()).where(eq(schedules.id, Number(c.req.param("id")))).returning();
    return c.json(row);
  });

  app.post("/api/schedules/:id/targets", async (c) => {
    const { retailerId } = await c.req.json();
    const [row] = await db.insert(scheduleTargets).values({ scheduleId: Number(c.req.param("id")), retailerId }).returning();
    return c.json(row, 201);
  });
}

// Store data a customer's page asks for: search and the nearby list, one store, address look-ups,
// store types, the Pokemon set picker, best bet, recent finds, categories, and shelf intel that
// needs no check. Also the two paths that write shelf intel in.

import type { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCookie } from "hono/cookie";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, chains, products, retailers } from "../db/schema";
import { config } from "../config";
import { openState } from "../store-hours";
import { getPolicy, publicPolicy } from "../policy";
import { connectAtSecFor } from "../calls/recipe";
import { cachedCategories, cachedChains, cachedRetailers, categoryLabelMap, invalidateRefCache, retailerMap } from "../refcache";
import { bboxAround, haversineMi } from "../geo";
import { ingestSignals, latestForRetailer, recentStockNear } from "../stock/signals";
import { seedStockCheckIntel } from "../stock/intel";
import { seedSellMethods } from "../stock/sellmethods";
import { LIMITS, check as rlCheck, clientIp } from "../ratelimit";
import { rankBets } from "../best-bet";
import { fanoutRestock } from "../alerts";
import { verifySession } from "../auth";
import { here, logoFields, ownerOnlyRetailerIds, qTokenMatch, requesterFeatures, requesterIsComp, storeCarriesList, storeChainName, tzDow } from "./shared-helpers";

// ---- Canonical Pokémon era/set registry (the Hobby picker's data) ----
// data/pokemon-sets.json is the source of truth: every era back to Base Set 1999, sets with official
// codes + release dates, newest first (Data Dev keeps it current; upcoming sets ship early with future
// dates so the front end can badge them). Serve-time we attach each set's known PRODUCT TYPES + retail
// anchors from the products catalog (recent sets only) — one pull powers era → set → type. Sets with
// no catalog rows return products: [] (front end falls back to generic types). Cached 5 min.
export let pokemonSetsCache: { t: number; v: unknown } | null = null;

// Display polish for the set → product picker: spell out cryptic type codes, and order the cards the way
// a shop lists them (packs → boxes → blisters → ETBs → collections) instead of DB insertion order.
export const PRETTY_TYPE: Record<string, string> = {
  "PC ETB": "Pokémon Center Elite Trainer Box", "Pokémon Center ETB": "Pokémon Center Elite Trainer Box",
  "ETB": "Elite Trainer Box", "Three-Pack Blister": "3-Pack Blister", "Prerelease Kit": "Pre-Release Kit",
};

export const prettyType = (t: string): string => PRETTY_TYPE[t] ?? t;

export const TYPE_ORDER = ["Booster Pack", "Booster Bundle", "Booster Box", "Single-Pack Blister", "1-Pack Blister",
  "2-Pack Blister", "3-Pack Blister", "Checklane Blister", "Elite Trainer Box", "Pokémon Center Elite Trainer Box",
  "Build & Battle", "Build & Battle Stadium", "Theme Deck", "Starter Deck", "Starter Set", "Starter Kit",
  "Trainer Kit", "Pre-Release Kit", "Premium Collection", "Ultra-Premium Collection", "Super-Premium Collection",
  "Special Collection", "Collection Box", "Surprise Box", "Collector Chest", "Standard Tin", "Mini Tin",
  "Stacking Tin", "Poster Collection", "Binder Collection", "Sticker Collection"];

export const orderProducts = (ps: Array<{ type: string; retail: number | null }>) => {
  const seen = new Set<string>();
  return ps.filter((p) => !seen.has(p.type) && !!seen.add(p.type)) // dedup by display label
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a.type), ib = TYPE_ORDER.indexOf(b.type);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.type.localeCompare(b.type);
    });
};

export function register(app: Hono) {
  // The one-time migration that first pushed the file copies into shared storage is GONE (owner 07-31,
  // "no dead code"). Every chain has been on shared storage since; re-running it would have written the
  // OLD file-named copies back over the content-named ones and undone the whole scheme.

  app.get("/pub/stores", async (c) => {
    // 🔒 ADMIN-ONLY (data-exposure lockdown): this hands back the ENTIRE store table in one response.
    // The consumer site never calls it (it uses /pub/stores/near exclusively); the only legit caller is
    // admin tooling, which authenticates exactly like /api/* — x-admin-token header OR admin_session
    // cookie — so the Admin page keeps working with zero changes on its side.
    const okTok = !!config.adminToken && c.req.header("x-admin-token") === config.adminToken;
    let okCookie = false;
    if (!okTok) { const ck = getCookie(c, "admin_session"); if (ck) { const s = await verifySession(ck); okCookie = !!(s && s.id === "admin"); } }
    if (config.adminToken && !okTok && !okCookie) return c.json({ error: "unauthorized" }, 401);
    const rs = await cachedRetailers();
    const chainRows = await db.select().from(chains);
    const types = new Map(chainRows.map((x) => [x.id, x.type]));
    const names = new Map(chainRows.map((x) => [x.id, x.name]));
    // Muted chains (owner toggle, incl. repack-only stores like Fairfield) never reach consumers.
    const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
    return c.json(rs
      .filter((r) => r.phone && r.active !== false)
      .filter((r) => !r.ownerOnly) // owner-only demo store ("Fun") never appears in the admin logo map
      .filter((r) => !(r.chainId && mutedChains.has(r.chainId)))
      .map((r) => ({ id: r.id, name: r.name, location: r.location, storeType: (r.chainId && types.get(r.chainId)) || "Other",
        ...logoFields((r.chainId && names.get(r.chainId)) || storeChainName(r.name)),
        carries: storeCarriesList((r.chainId && names.get(r.chainId)) || null, r.carries),
        lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
        sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true })));
  });

  app.get("/pub/stores/near", async (c) => {
    const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
    const state = (c.req.query("state") || "").trim().toUpperCase();
    const q = (c.req.query("q") || "").trim().toLowerCase();
    if (!hasLoc && !state && !q) return c.json({ error: "lat+lng (or state / q) required" }, 400);
    // Radius ladder (owner 2026-07-11): 0.5 / 1 / 2 / 5 / 10 mi. Free + PAYG cap at 10mi; the "any_town"
    // entitlement (Check Plus) unlocks the full range (zoom anywhere). A capped request that finds nothing
    // dialable still gets the single nearest callable store (rural fallback below) so the screen isn't blank.
    const anyTown = ((await requesterFeatures(c.req.header("Authorization"))).any_town === true);
    const FREE_MAX_MI = 10, HARD_MAX_MI = 150, DEFAULT_MI = 5;
    const maxRadius = anyTown ? HARD_MAX_MI : FREE_MAX_MI;
    const wantRadius = Math.max(Number(c.req.query("radius") || DEFAULT_MI), 0.5);
    const radius = Math.min(wantRadius, maxRadius);
    const radiusCapped = wantRadius > maxRadius; // UI surfaces the Check Plus upsell when true
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 60), 1), 200);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    // 🔒 Text-search hardening (data-exposure lockdown): the q-only path is the one way to page the store
    // table without a location, so it gets its own tight per-IP limit, a 2-char minimum (single letters
    // enumerate everything), and a paging-depth cap. Location/state search behavior is unchanged.
    if (!hasLoc && !state) {
      if (q.length < 2) return c.json({ error: "q must be at least 2 characters" }, 400);
      if (offset > 600) return c.json({ error: "paging too deep for text search" }, 400);
      const rl = rlCheck("storeSearch", clientIp(c.req.raw.headers), LIMITS.storeSearch);
      if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    }
    const mode = c.req.query("mode") || ""; // call | kiosk | site | "" = all
    // Store-type filter (the home chips): ?type=Hobby returns ONLY that type, SERVER-side — in a dense
    // metro the nearest-200 page is wall-to-wall Retail, so client-side filtering would starve the
    // Hobby/Thrift chips. Matches the chain's admin type exactly ("Hobby", "Thrift", …).
    let typeF = (c.req.query("type") || "").trim();
    // Thrift opt-in (Website ask): Thrift chains stay MUTED in every general feed; the Thrift chip
    // requests them EXPLICITLY with ?section=thrift, which lifts the muted filter for Thrift-type
    // chains only and pins the type filter so nothing else rides along. The global thrift master
    // switch (policy.flags.thrift) still wins — flag off = the opt-in is ignored.
    const thriftOptIn = (c.req.query("section") || "").trim().toLowerCase() === "thrift"
      && (await getPolicy()).flags.thrift !== false;
    if (thriftOptIn) typeF = "Thrift";

    const chainRows = await cachedChains();
    const types = new Map(chainRows.map((x) => [x.id, x.type]));
    const names = new Map(chainRows.map((x) => [x.id, x.name]));
    const stockMethod = new Map(chainRows.map((x) => [x.id, x.stockCheckMethod]));
    const sellMethodsByChain = new Map(chainRows.map((x) => [x.id, x.sellMethods]));
    const isMSRPByChain = new Map(chainRows.map((x) => [x.id, x.isMSRP]));
    const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
    // Call-readiness (launch "no dead-end / no wasted paid call" gate): a chain is call-ready if it rings
    // straight to a human OR its phone-tree is mapped. Consumer-direct types (Hobby/Thrift/independent)
    // ring to a person and are ready by nature. Everything else callable-but-unmapped is shown GREYED
    // ("coming soon") and never dialed — no wasted call/$. Mapping a chain (treeStatus/ringsDirect via the
    // admin) flips it ready automatically, so the greyed set shrinks as the mapping lane works.
    const ringsDirectChain = new Set(chainRows.filter((x) => x.ringsDirect === true).map((x) => x.id));
    const treeMappedChain = new Set(chainRows.filter((x) => x.treeStatus === "learned" || x.treeStatus === "verified").map((x) => x.id));
    const READY_TYPES = new Set(["Hobby", "Thrift"]);
    // Time-to-a-human for the consumer UI ("manage the expectation before the call"). Three honest
    // states, EVIDENCE-only — never a guess: {kind:"direct"} = the chain is known to ring straight to a
    // person · {kind:"menu", seconds} = mapped phone tree, seconds from the same guarded number the live
    // call uses (connectAtSecFor — bogus/stray avgTreeSeconds can never leak here) · null = not mapped
    // yet, the front-end shows nothing.
    const chainById = new Map(chainRows.map((x) => [x.id, x]));
    const reachFor = (chainId: number | null): { kind: "direct" } | { kind: "menu"; seconds: number } | null => {
      const ch = chainId != null ? chainById.get(chainId) : null;
      if (!ch) return null;
      if (ch.navType === "direct" || ch.ringsDirect === true || ch.answerPath === "direct_human") return { kind: "direct" };
      const s = connectAtSecFor(ch);
      return s != null ? { kind: "menu", seconds: s } : null;
    };

    let rows: (typeof retailers.$inferSelect)[];
    if (hasLoc) {
      const bb = bboxAround(lat, lng, radius);
      rows = await db.select().from(retailers).where(and(
        eq(retailers.active, true),
        gte(retailers.lat, bb.latMin), lte(retailers.lat, bb.latMax),
        gte(retailers.lng, bb.lngMin), lte(retailers.lng, bb.lngMax),
      ));
    } else if (state) {
      rows = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.state, state)));
    } else {
      // Token-AND search so "barnes westlake" (or the typo "barns westlake") finds "Barnes & Noble
      // Westlake Village": every word must hit name OR city; words 5+ chars drop their last letter to
      // absorb trailing typos/plurals.
      const toks = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
      const conds = toks.map((t) => {
        const pat = `%${t.length >= 5 ? t.slice(0, -1) : t}%`;
        return or(like(retailers.name, pat), like(retailers.location, pat));
      });
      rows = await db.select().from(retailers)
        .where(and(eq(retailers.active, true), ...(conds.length ? conds : [like(retailers.name, `%${q}%`)]))).limit(2000);
    }

    // Callable = a line we can dial at THIS store. Kiosk stores count too: even with no shelf packs
    // (sellsPacks:false) we call to verify the machine is on and stocked — kiosks go down a lot
    // (owner 2026-07-06). The shelf-only surfaces still gate on sellsPacks, so this doesn't add
    // kiosk-only stores to "most likely on the shelf".
    const callable = (r: typeof retailers.$inferSelect) => (r.sellsPacks !== false || r.hasKiosk === true) && !!r.phone && !r.phone.startsWith("nophone:");
    // callReady = safe to place a paid call (we reach a human). callable-but-not-ready → front-end greys it
    // "coming soon" and disables the call button (never dialed). Site-check stores are handled separately via
    // stockCheckMethod; the front-end precedence is muted(hidden) > site("check online") > !callReady(grey) > call.
    const callReady = (r: typeof retailers.$inferSelect) => callable(r) && (
      r.chainId == null
      || ringsDirectChain.has(r.chainId)
      || treeMappedChain.has(r.chainId)
      || READY_TYPES.has(((r.chainId && types.get(r.chainId)) || "Other") as string)
    );
    // inStock badge = a confirmed in-stock call in the last 7 days (drives the brand-check pin/row).
    const inStockSince = Math.floor(Date.now() / 1000) - 7 * 86400;
    const confirmedSet = new Set(
      (await db.select({ rid: callResults.retailerId }).from(callResults)
        .where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed"), gte(callResults.completedAt, inStockSince)))
      ).map((x) => x.rid),
    );
    // Owner-only demo store ("Fun") surfaces only for the signed-in master account.
    const comp = await requesterIsComp(c.req.header("Authorization"));
    // …and for the owner it surfaces from ANYWHERE — owner-only stores (the "Fun" rehearsal store) are
    // merged in regardless of location, so the owner can test from any location, not just near it.
    if (comp) {
      const have = new Set(rows.map((r) => r.id));
      const ownerStores = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.ownerOnly, true)));
      for (const o of ownerStores) if (!have.has(o.id)) rows.push(o);
    }
    // Per-store consumer shape — shared by the main list and the rural fallback so both emit identical rows.
    const shape = (r: typeof retailers.$inferSelect) => {
        const miles = hasLoc && r.lat != null && r.lng != null ? Math.round(haversineMi(lat, lng, r.lat, r.lng) * 10) / 10 : null;
        const chainName = (r.chainId && names.get(r.chainId)) || storeChainName(r.name);
        return { id: r.id, chainId: r.chainId, name: r.name, location: r.location, address: r.address || null, storeType: (r.chainId && types.get(r.chainId)) || "Other",
          ...logoFields(chainName),
          carries: storeCarriesList(chainName, r.carries),
          // shipmentDay is deliberately NOT sent to consumers: it's unverified (auto-learned, junk values
          // like "every single week" rendered as "drops eve"). It returns confidence-gated once a store
          // has 2+ confirmed calls agreeing (learnedShipDow). Admin surfaces still see it via /api paths.
          lat: r.lat, lng: r.lng, region: r.region, state: r.state,
          sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true,
          tier: r.hasKiosk === true ? 5 : (r.tier ?? null), inStock: confirmedSet.has(r.id), // any kiosk store = tier 5; inStock = brand-check pin
          callable: callable(r), callReady: callReady(r), ownerOnly: r.ownerOnly === true, // callReady:false → grey "coming soon", don't dial. ownerOnly → client shows it regardless of radius
          stockCheckMethod: (r.chainId && stockMethod.get(r.chainId)) || "call", // site = check their site, no call needed
          // Sell-methods taxonomy: how to get it (chain default), online flag, and price/source.
          sellMethods: (((r.chainId && sellMethodsByChain.get(r.chainId)) || "in_store").split(",").map((s) => s.trim()).filter(Boolean)),
          online: r.online === true,
          isMSRP: r.chainId ? isMSRPByChain.get(r.chainId) !== false : true, // false = third-party, may exceed MSRP
          mapsUri: r.mapsUri || null,
          reach: reachFor(r.chainId), // time-to-a-human: {kind:"direct"} | {kind:"menu",seconds} | null (unmapped → show nothing)
          beyondRadius: false as boolean, // set true only on the rural-fallback store (nearest dialable past the radius)
          miles, openState: openState(r.hours, r.timezone) };
    };
    const shaped = rows
      .filter((r) => comp || !r.ownerOnly)
      // Muted chains never surface — except Thrift-type chains when the Thrift chip explicitly opted in.
      .filter((r) => !(r.chainId && mutedChains.has(r.chainId)) || (thriftOptIn && r.chainId != null && types.get(r.chainId) === "Thrift"))
      .filter((r) => !mode
        || (mode === "call" && callable(r))
        || (mode === "kiosk" && r.hasKiosk === true)
        || (mode === "site" && r.chainId != null && stockMethod.get(r.chainId) === "site"))
      .filter((r) => !typeF || (((r.chainId && types.get(r.chainId)) || "Other") === typeF))
      .filter((r) => !q || qTokenMatch(`${r.name} ${r.location || ""}`, q))
      .map(shape)
      .filter((r) => r.ownerOnly || !hasLoc || r.miles == null || r.miles <= radius); // owner-only store is never distance-filtered
    // OPEN NOW ONLY (owner law 2026-07-16): a store that's closed at this moment never reaches the list —
    // a shopper can't buy from a closed door, so listing it is dead weight ("it's stupid that it even
    // shows up"). openState already folds in real hours, midnight wraps, and the closed-overnight default
    // for unknown-hours stores. Owner-only test stores are exempt (the owner tests at any hour).
    // hiddenClosed rides the response so the UI can explain a thin/empty night list instead of looking broken.
    const hiddenClosed = shaped.filter((r) => !r.ownerOnly && r.openState.open === false).length;
    const all = shaped
      .filter((r) => r.ownerOnly || r.openState.open !== false)
      .sort((a, b) => (a.miles ?? 9e9) - (b.miles ?? 9e9) || a.name.localeCompare(b.name));
    // Rural fallback: nothing dialable inside the radius → surface the single NEAREST callable+ready store
    // (up to 40mi out) so a rural screen is never blank. Only runs when the in-radius set has none, so it's
    // free in dense metros. Flagged beyondRadius so the UI can badge the distance / prompt Check Plus.
    let fallbackStore: ReturnType<typeof shape> | null = null;
    if (hasLoc && !mode && !all.some((r) => r.callable && r.callReady)) {
      const wide = bboxAround(lat, lng, 40);
      const near = (await db.select().from(retailers).where(and(
        eq(retailers.active, true),
        gte(retailers.lat, wide.latMin), lte(retailers.lat, wide.latMax),
        gte(retailers.lng, wide.lngMin), lte(retailers.lng, wide.lngMax),
      )))
        .filter((r) => !(r.chainId && mutedChains.has(r.chainId)) && callable(r) && r.lat != null && r.lng != null)
        .map((r) => ({ r, mi: haversineMi(lat, lng, r.lat as number, r.lng as number) }))
        .filter((x) => x.mi > radius)
        .sort((a, b) => a.mi - b.mi);
      for (const x of near) { const s = shape(x.r); if (s.callReady && s.openState.open !== false) { s.beyondRadius = true; fallbackStore = s; break; } } // open-now law applies to the fallback too
    }
    // Owner-only stores are pinned into the response (never lost to the distance sort + page limit),
    // so the owner always gets the "Fun" store no matter how far away they are.
    const owned = all.filter((r) => r.ownerOnly);
    // Pin the NEAREST store of each tier-5 ("green group") chain so a far green-group store always
    // surfaces. In a dense metro a 20-mile radius can hold 400+ stores (200+ of them tier-5); the page
    // limit then drops a sparse, far chain like Dollar General (its nearest store sat ~19mi out, past
    // the cut) even though it's in range. `all` is distance-sorted + radius-filtered, so the first store
    // seen per chainId is its nearest. Pinned once, on the first page only (offset 0), to avoid dupes.
    const nearestT5: typeof all = [];
    if (offset === 0) {
      const seen = new Set<number>();
      for (const r of all) {
        if (r.ownerOnly || r.tier !== 5 || r.chainId == null || seen.has(r.chainId)) continue;
        seen.add(r.chainId); nearestT5.push(r);
      }
    }
    const pinIds = new Set([...owned, ...nearestT5].map((r) => r.id));
    const rest = all.filter((r) => !r.ownerOnly && !pinIds.has(r.id));
    const stores = [...owned, ...nearestT5, ...rest.slice(offset, offset + limit)];
    if (fallbackStore && !stores.some((s) => s.id === fallbackStore!.id)) stores.push(fallbackStore);
    // radiusMax + radiusCapped let the UI cap the picker and prompt Check Plus; beyondRadius flags the rural pin.
    // hiddenClosed = in-radius stores suppressed because they're closed right now (UI: explain a thin night list).
    return c.json({ total: all.length + (fallbackStore ? 1 : 0), offset, limit, radiusMax: maxRadius, radiusCapped, hiddenClosed, stores });
  });

  // Single-store fetch (consumer): backfills address/logo/hours for a REOPENED call whose store sits
  // outside the current nearby slice (only near-slice stores carry address on the client). Same
  // per-store shape /pub/stores/near emits; owner-only stores need the comp check; muted stay hidden.
  app.get("/pub/store/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
    const r = (await db.select().from(retailers).where(eq(retailers.id, id)))[0];
    if (!r || r.active === false) return c.json({ error: "not_found" }, 404);
    const chain = r.chainId ? (await cachedChains()).find((x) => x.id === r.chainId) : undefined;
    if (chain?.muted === true) return c.json({ error: "not_found" }, 404);
    if (r.ownerOnly && !(await requesterIsComp(c.req.header("Authorization")))) return c.json({ error: "not_found" }, 404);
    const chainName = chain?.name || storeChainName(r.name);
    return c.json({ id: r.id, chainId: r.chainId, name: r.name, location: r.location, address: r.address || null,
      storeType: chain?.type || "Other",
      ...logoFields(chainName),
      carries: storeCarriesList(chainName, r.carries),
      lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
      sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true,
      tier: r.hasKiosk === true ? 5 : (r.tier ?? null),
      // Kiosk stores are callable too (verify the machine is on) — see the near-feed note above.
      callable: (r.sellsPacks !== false || r.hasKiosk === true) && !!r.phone && !r.phone.startsWith("nophone:"),
      ownerOnly: r.ownerOnly === true,
      stockCheckMethod: chain?.stockCheckMethod || "call",
      sellMethods: (chain?.sellMethods || "in_store").split(",").map((s) => s.trim()).filter(Boolean),
      online: r.online === true, isMSRP: chain ? chain.isMSRP !== false : true,
      mapsUri: r.mapsUri || null, miles: null, openState: openState(r.hours, r.timezone) });
  });

  // Master/dev location override: resolve a ZIP (or free-text "city, ST") to a lat/lng using OUR OWN
  // store coordinates — zero external dependency. Averages the coords of matching stores = a usable
  // center to "stand" in. (Drop-a-pin on the map is the always-available alternative.)
  app.get("/pub/geocode", async (c) => {
    const zip = (c.req.query("zip") || "").trim();
    const q = (c.req.query("q") || "").trim();
    if (!zip && !q) return c.json({ error: "zip or q required" }, 400);
    // ZIP matches the real zip column (exact); free text matches the human location label or zip prefix.
    const where = zip && /^\d{5}$/.test(zip)
      ? and(eq(retailers.active, true), eq(retailers.zip, zip))
      : and(eq(retailers.active, true), or(like(retailers.location, `%${q || zip}%`), like(retailers.zip, `${q || zip}%`)));
    const rows = await db.select({ lat: retailers.lat, lng: retailers.lng }).from(retailers).where(where).limit(60);
    const pts = rows.filter((r) => r.lat != null && r.lng != null) as { lat: number; lng: number }[];
    if (!pts.length) return c.json({ error: "not_found", hint: "no stores match that ZIP yet" }, 404);
    // Median is more robust than mean against a stray far-away match.
    const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    return c.json({ lat: med(pts.map((p) => p.lat)), lng: med(pts.map((p) => p.lng)), n: pts.length, zip: zip || undefined });
  });

  // Pre-location UI: generic store TYPES with counts ("Pharmacy · 8,900 stores") shown before the
  // visitor shares location — the cheap national overview that never ships the store table.
  app.get("/pub/store-types", async (c) => {
    const chainRows = await cachedChains();
    const muted = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
    const counts = await db.select({ chainId: retailers.chainId, n: sql<number>`count(*)` })
      .from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
    const byType = new Map<string, { type: string; stores: number; chains: string[] }>();
    for (const row of counts) {
      const ch = row.chainId != null ? chainRows.find((x) => x.id === row.chainId) : undefined;
      if (ch && muted.has(ch.id)) continue;
      const type = ch?.type || "Other";
      const e = byType.get(type) || { type, stores: 0, chains: [] };
      e.stores += Number(row.n);
      if (ch) e.chains.push(ch.name);
      byType.set(type, e);
    }
    return c.json([...byType.values()].sort((a, b) => b.stores - a.stores));
  });

  // ---- Stock-signal rail: shelf intel WITHOUT a call ----
  // Site checkers (chains whose sites mirror the shelf — Micro Center, Best Buy, Target…) and the
  // Discord cook-group listener write here via /api/stock/ingest; the consumer UI reads the
  // freshest signal per store. The phone rail stays the ground truth for everything else.
  app.get("/pub/stock/near", async (c) => {
    const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
    const radius = Math.min(Math.max(Number(c.req.query("radius") || 25), 1), 150);
    const sinceHours = Math.min(Math.max(Number(c.req.query("sinceHours") || 48), 1), 24 * 14);
    const categoryId = Number(c.req.query("categoryId") || 0) || undefined;
    return c.json(await recentStockNear(hasLoc ? lat : null, hasLoc ? lng : null, radius, sinceHours, categoryId));
  });

  app.get("/pub/stock/store/:id", async (c) => c.json(await latestForRetailer(Number(c.req.param("id")))));

  app.post("/api/stock/ingest", async (c) => {
    const b = await c.req.json();
    const items = Array.isArray(b) ? b : b?.signals;
    if (!Array.isArray(items) || !items.length) return c.json({ error: "signals[] required" }, 400);
    const out = await ingestSignals(items);
    // A confirmed restock at a known store → text everyone watching it (cap + cooldown enforced in fanoutRestock).
    let notified = 0;
    for (const it of items) {
      if (it?.status !== "in_stock" || !it?.retailerId) continue;
      const st = (await db.select({ name: retailers.name }).from(retailers).where(eq(retailers.id, Number(it.retailerId))))[0];
      const r = await fanoutRestock(Number(it.retailerId), { storeName: (st?.name || "the store").split("—")[0].trim(), product: it.product, categoryId: it.categoryId ?? null });
      notified += r.notified;
    }
    return c.json({ ...out, restockNotified: notified });
  });

  // New intel revision landed in data/stock_check_intel.json → push it over already-classified
  // chains (the boot seed only fills blanks). Deliberate owner action, hence force.
  app.post("/api/stock/intel/reapply", async (c) => {
    const applied = await seedStockCheckIntel(true);
    invalidateRefCache();
    return c.json({ applied });
  });

  // Reapply the sell-methods taxonomy (data/sell_methods_intel.json) over already-seeded chains.
  app.post("/api/sell-methods/reapply", async (c) => {
    const applied = await seedSellMethods(true);
    invalidateRefCache();
    return c.json({ applied });
  });

  app.get("/pub/pokemon-sets", async (c) => {
    if (pokemonSetsCache && Date.now() - pokemonSetsCache.t < 300_000) return c.json(pokemonSetsCache.v);
    const file = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")) as
      { v: number; updated: string; category: string; eras: Array<{ era: string; code: string; years: string; sets: Array<Record<string, unknown>> }> };
    // Catalog series names vary slightly from registry names ("Mega Evolution (base)", "Black Bolt/White
    // Flare") — normalize both sides before matching.
    const norm = (s: string) => s.toLowerCase().replace(/\s*\(base\)\s*/g, "").replace(/\s*\/\s*/g, " & ").trim();
    const pokeCats = new Set([...(await categoryLabelMap()).entries()].filter(([, l]) => /pok/i.test(l)).map(([id]) => id));
    const rows = (await db.select().from(products))
      .filter((p) => p.active !== false && pokeCats.has(p.categoryId) && p.series && p.type && p.type !== "Single");
    const bySet = new Map<string, Map<string, number | null>>();
    for (const p of rows) {
      const k = norm(p.series as string);
      let m = bySet.get(k); if (!m) { m = new Map(); bySet.set(k, m); }
      // one entry per type; keep the first real price seen (retailer copies share the same retail price)
      if (!m.has(p.type as string) || (m.get(p.type as string) == null && p.msrp != null)) m.set(p.type as string, p.msrp ?? null);
    }
    // Logo/banner CONTRACT: asset URLs are derived from the set code (stable, verified) as SAME-ORIGIN
    // paths under public/logos/ — the same repo folder + /logo-wall system the logo dev already works
    // in for chains (NOT the R2 bucket). Logo dev drops files at exactly these paths, the front end
    // renders feed.logo/banner with a text fallback until each asset lands, and the images ship with
    // the same branch/promotion as the code. Zero coordination.
    //   set logo  -> public/logos/pokemon/sets/<logoKey>.png    (served at /logos/pokemon/sets/…)
    //   set banner-> public/logos/pokemon/banners/<logoKey>.png (served at /logos/pokemon/banners/…)
    //   era logo  -> public/logos/pokemon/eras/<era-slug>.png   (served at /logos/pokemon/eras/…)
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    // Cache-bust: the service worker caches /logos/* cache-first, so bump this whenever the set assets
    // are re-cut and the front end will request fresh URLs (old cached copies are orphaned harmlessly).
    const av = "?v=9";
    const v = { ...file, logoBase: "/logos/pokemon", eras: file.eras.map((e) => ({ ...e,
      slug: slug(e.era), logo: `/logos/pokemon/eras/${slug(e.era)}.png${av}`,
      sets: e.sets.map((s) => ({ ...s,
        logoKey: slug(String(s.code)),
        logo: `/logos/pokemon/sets/${slug(String(s.code))}.png${av}`,
        banner: `/logos/pokemon/banners/${slug(String(s.code))}.png${av}`,
        products: orderProducts([...(bySet.get(norm(String(s.name))) ?? new Map<string, number | null>()).entries()].map(([type, retail]) => ({ type: prettyType(type), retail }))) })) })) };
    pokemonSetsCache = { t: Date.now(), v };
    return c.json(v);
  });

  app.get("/pub/best-bet", async (c) => {
    const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
    const categoryId = Number(c.req.query("categoryId") || 0);
    const radius = Number(c.req.query("radius") || 25);
    const cat = categoryId ? (await categoryLabelMap()).get(categoryId) : null;
    // Confirm history per store — filter in SQL (confirmed+completed) and pull only the columns we need,
    // so this public path never loads the whole call_results table (transcripts included) into memory.
    const confirmed = (await db.select({ retailerId: callResults.retailerId, categoryId: callResults.categoryId, completedAt: callResults.completedAt, startedAt: callResults.startedAt, shipmentDayHeard: callResults.shipmentDayHeard })
      .from(callResults).where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed"))))
      .filter((r) => !categoryId || r.categoryId === categoryId);
    const byStore = new Map<number, { confirms: number; last: number; days: Record<string, number> }>();
    for (const r of confirmed) {
      const e = byStore.get(r.retailerId) || { confirms: 0, last: 0, days: {} };
      e.confirms++; const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
      // Tally the restock day staff gave on each confirmed call. The mode is the LEARNED day.
      if (r.shipmentDayHeard) e.days[r.shipmentDayHeard] = (e.days[r.shipmentDayHeard] || 0) + 1;
      byStore.set(r.retailerId, e);
    }
    const now = Math.floor(Date.now() / 1000);
    // Pull only the stores in the search box from the DB (rides the lat/lng filter) — never load the
    // whole 100k table into memory here. No location → no best-bet (the consumer only calls with coords).
    if (!hasLoc) return c.json([]);
    const bb = bboxAround(lat, lng, radius);
    const near = await db.select().from(retailers).where(and(
      eq(retailers.active, true),
      gte(retailers.lat, bb.latMin), lte(retailers.lat, bb.latMax),
      gte(retailers.lng, bb.lngMin), lte(retailers.lng, bb.lngMax),
    )).limit(1500);
    const comp = await requesterIsComp(c.req.header("Authorization"));
    const cands = near
      .filter((r) => comp || !r.ownerOnly) // owner-only demo store ("Fun") only for the master account
      .filter((r) => r.phone && r.active !== false)
      .filter((r) => r.sellsPacks !== false) // "most likely to have it on the SHELF" — exclude kiosk-only stores (e.g. Pavilions)
      .filter((r) => openState(r.hours, r.timezone).open !== false) // open or unknown, never closed
      .filter((r) => !cat || !(r.carries) || r.carries.toLowerCase().includes(cat.toLowerCase()))
      .map((r) => {
        const miles = (hasLoc && r.lat != null && r.lng != null) ? haversineMi(lat, lng, r.lat, r.lng) : null;
        const hist = byStore.get(r.id);
        return { id: r.id, name: r.name.split("—")[0].trim(), miles, signals: {
          // shipmentDow stays OFF for consumers: restock day is unverified data, so it neither ranks
          // nor labels a best bet ("usually restocks Friday" is gone) until a store's day is confirmed
          // by 2+ agreeing calls (owner rule, 2026-07-02). learnedShipDow is the comeback path.
          miles, todayDow: tzDow(r.timezone), shipmentDow: null,
          confirms: hist?.confirms ?? 0, lastConfirmAgoHrs: hist ? Math.round((now - hist.last) / 3600) : null,
        } };
      })
      .filter((r) => r.miles == null || r.miles <= radius);
    const top = rankBets(cands, 3).map((t) => ({ id: t.id, name: t.name, miles: t.miles, score: t.bet.score, tag: t.bet.tag, why: t.bet.reasons.join(" · ") }));
    return c.json(top);
  });

  // Recently confirmed in-stock finds (real social proof for the Runnr home screen).
  app.get("/pub/finds", async (c) => {
    const pol = await getPolicy();
    if (!pol.finds.publicFeed) return c.json([]);
    const cats = await categoryLabelMap();
    const stores = await retailerMap();
    // Location: once the visitor has shared where they are, only show finds NEAR them — never finds from
    // hundreds of miles away. Before location is shared, the national feed stands in as social proof.
    const flat = Number(c.req.query("lat")), flng = Number(c.req.query("lng"));
    const fradius = Number(c.req.query("radius")) || 25;
    const fHasLoc = Number.isFinite(flat) && Number.isFinite(flng);
    const ownerOnly = await ownerOnlyRetailerIds(); // Fun / MVP's etc. are rehearsal stores — never real finds
    // Headstart: a paid finder's result stays off the public feed for headstartMin minutes.
    const cutoff = Date.now() - pol.finds.headstartMin * 60_000;
    const rows = (await db.select().from(callResults)
      .where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed")))
      .orderBy(desc(callResults.completedAt)).limit(60))
      // Owner-only rehearsal stores (Fun, MVP's, …) are never genuine finds → keep them out of the banner.
      .filter((r) => !ownerOnly.has(r.retailerId))
      // Privacy: never surface a find marked private (subscriber perk / paid privacy).
      .filter((r) => r.isPrivate !== true)
      // Headstart: only after the finder's lead time has elapsed.
      .filter((r) => (r.completedAt ?? r.startedAt) <= cutoff)
      // Near the visitor only (when they've shared location). No location on the store → can't confirm it's
      // local → leave it out of a localized feed.
      .filter((r) => { if (!fHasLoc) return true; const st = stores.get(r.retailerId); return !!st && st.lat != null && st.lng != null && haversineMi(flat, flng, st.lat, st.lng) <= fradius; })
      .slice(0, 10);
    return c.json(rows.map((r) => ({
      store: (stores.get(r.retailerId)?.name || "A store").split("—")[0].trim(),
      category: cats.get(r.categoryId) || "cards",
      at: r.completedAt ?? r.startedAt,
    })));
  });

  app.get("/pub/categories", async (c) => c.json(await cachedCategories()));

  // ---- Policy: owner-tunable pricing / headstart / privacy / feature flags ----
  app.get("/pub/policy", async (c) => c.json(await publicPolicy()));

  // Public: product list for the Runnr consumer selector (active only, lean fields).
  app.get("/pub/products", async (c) => {
    const cat = Number(c.req.query("categoryId") || 0);
    if (!cat) return c.json([]);
    const rows = (await db.select().from(products).where(eq(products.categoryId, cat)))
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, series: p.series, type: p.type }));
    return c.json(rows);
  });
}

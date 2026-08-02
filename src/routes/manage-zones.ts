// Manage Zones: a subscriber's saved groups of stores, the quote before a run, running one, and
// stopping a run (all of it, or one store).

import type { Hono } from "hono";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, categories, chains, retailers, zoneRetailers, zones } from "../db/schema";
import { canAffordZone } from "../calls/service";
import { openState } from "../store-hours";
import { getPolicy } from "../policy";
import { cachedChains, retailerMap } from "../refcache";
import { getAccount, isComp, isCompAccount, spendableCredits } from "../billing";
import { accountFeatures } from "../plans";
import { bridgeConversationId } from "../voice/bridge";
import { roomCallSids } from "../voice/bridge-place";
import { isCallingPaused } from "../redis";
import { bridgeStoreCall } from "./running-a-check";
import { chainLogoInfo, isFinderPrivate, storeChainName, verifyClerkToken } from "./shared-helpers";

// ============ Manage Zones (consumer, premium `zone_sweeps`) — spec docs/archive/manage-zones-SHIPPED.md ============
export const zoneRunSids = new Map<string, { room: string; retailerId: number }[]>();
 // runId -> per-store bridge rooms (in-memory, for Stop all / stop one)
export async function zoneHangRoom(room: string): Promise<void> {
  // Customer pressed Stop (all / one) — stamp statusKey user_cancelled so the verdict reads
  // "Check cancelled / You stopped this check from happening." status stays admin_hangup: every
  // non-result, aggregate and no-charge rule keys off status, so nothing else changes (owner 07-21).
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  const ids = [room.startsWith("delta:") ? room : `bridge:${room}`, bridgeConversationId(room) || ""].filter(Boolean);
  await db.update(callResults)
    .set({ status: "admin_hangup", statusKey: "user_cancelled", confirmed: null, completedAt: Math.floor(Date.now() / 1000) })
    .where(and(inArray(callResults.providerCallId, ids), inArray(callResults.status, ["dialing", "in_progress", "queued"])))
    .catch((e) => console.error("zone admin_hangup stamp:", e));
  const callSid = roomCallSids.get(room);
  if (sid && tok && callSid) {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: "Status=completed",
    }).catch(() => {});
  }
}

/** Bearer auth + zone_sweeps entitlement. ok:false short-circuits with the right status. */
export async function zoneAuth(authHeader?: string): Promise<
  { ok: true; u: { id: string; email?: string; phone?: string }; a: Awaited<ReturnType<typeof getAccount>>; comp: boolean }
  | { ok: false; status: 401 | 403; error: string }> {
  const u = await verifyClerkToken(authHeader);
  if (!u) return { ok: false, status: 401, error: "unauthorized" };
  const a = await getAccount(u.id, u.email);
  const comp = isCompAccount(a) || isComp(u.email || undefined);
  const feats = await accountFeatures(a?.subTier, comp);
  if (!feats.zone_sweeps) return { ok: false, status: 403, error: "not_entitled" };
  return { ok: true, u, a, comp };
}

/** API shape for one zone: its stores, callable check count, and last-run summary. */
export async function zoneView(z: typeof zones.$inferSelect) {
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, z.id));
  const rows = links.length ? await db.select().from(retailers).where(inArray(retailers.id, links.map((l) => l.retailerId))) : [];
  // Zone cards show the member stores' logos + open state (owner 07-10): same chainLogoInfo + openState
  // the consumer store list rides, so the card and the check-all gate agree with the rest of the app.
  const chainNames = rows.length ? new Map((await db.select().from(chains)).map((x) => [x.id, x.name])) : new Map();
  const stores = rows.map((r) => {
    const chainName = (r.chainId && chainNames.get(r.chainId)) || null;
    const l = chainLogoInfo(chainName || storeChainName(r.name));
    return { retailerId: r.id, name: r.name, location: r.location || "", callable: r.sellsPacks !== false,
      logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct, openState: openState(r.hours, r.timezone) };
  });
  const last = (await db.select().from(callResults).where(like(callResults.zoneRunId, `z${z.id}-%`)).orderBy(desc(callResults.startedAt)).limit(1))[0];
  let lastRun = null;
  if (last?.zoneRunId) {
    const rr = await db.select().from(callResults).where(eq(callResults.zoneRunId, last.zoneRunId));
    lastRun = { at: last.startedAt, runId: last.zoneRunId, inStock: rr.filter((r) => r.statusKey === "in_stock").length, total: rr.length };
  }
  return { id: z.id, name: z.name, stores, checkCount: stores.filter((s) => s.callable).length, lastRun };
}

export function register(app: Hono) {
  app.get("/app/zones", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const zs = await db.select().from(zones).where(eq(zones.ownerUserId, g.u.id)).orderBy(desc(zones.createdAt));
    return c.json(await Promise.all(zs.map(zoneView)));
  });

  app.post("/app/zones", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const b = await c.req.json();
    const retailerIds = (Array.isArray(b.retailerIds) ? b.retailerIds : []).map(Number).filter(Boolean);
    if (!retailerIds.length) return c.json({ error: "no_stores" }, 400);
    const [z] = await db.insert(zones).values({ name: String(b.name || "").trim().slice(0, 24) || "My zone", ownerUserId: g.u.id, centerZip: b.centerZip ?? null, radiusMiles: b.radiusMiles ?? null }).returning();
    await db.insert(zoneRetailers).values(retailerIds.map((rid: number) => ({ zoneId: z.id, retailerId: rid })));
    return c.json(await zoneView(z), 201);
  });

  app.patch("/app/zones/:id", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const id = Number(c.req.param("id"));
    const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
    if (!z) return c.json({ error: "not_found" }, 404);
    const b = await c.req.json();
    if (typeof b.name === "string") await db.update(zones).set({ name: b.name.trim().slice(0, 24) || z.name }).where(eq(zones.id, id));
    if (Array.isArray(b.retailerIds)) {
      const ids = b.retailerIds.map(Number).filter(Boolean);
      await db.delete(zoneRetailers).where(eq(zoneRetailers.zoneId, id));
      if (ids.length) await db.insert(zoneRetailers).values(ids.map((rid: number) => ({ zoneId: id, retailerId: rid })));
    }
    return c.json(await zoneView((await db.select().from(zones).where(eq(zones.id, id)))[0]));
  });

  app.delete("/app/zones/:id", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const id = Number(c.req.param("id"));
    const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
    if (!z) return c.json({ error: "not_found" }, 404);
    await db.delete(zones).where(eq(zones.id, id));
    return c.json({ ok: true });
  });

  app.get("/app/zones/quote", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const ids = (c.req.query("retailerIds") || "").split(",").map(Number).filter(Boolean);
    const rows = ids.length ? await db.select().from(retailers).where(inArray(retailers.id, ids)) : [];
    const checks = rows.filter((r) => r.sellsPacks !== false).length;
    return c.json({ stores: checks, checks, cents: checks * (await getPolicy()).pricing.perCallCents });
  });

  app.post("/app/zones/:id/check", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    if (await isCallingPaused()) return c.json({ error: "calling_paused" }, 503);
    const id = Number(c.req.param("id"));
    const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
    if (!z) return c.json({ error: "not_found" }, 404);
    const afford = await canAffordZone({ zoneId: id, credits: spendableCredits(g.a), comp: g.comp });
    if (!afford.ok) return c.json({ error: "no_credits", need: afford.creditsNeeded, have: afford.have, short: afford.short }, 402);
    const b = await c.req.json().catch(() => ({}));
    const cat = b.categoryId
      ? (await db.select().from(categories).where(eq(categories.id, Number(b.categoryId))))[0]
      : (await db.select().from(categories).where(eq(categories.key, "pokemon")))[0];
    if (!cat) return c.json({ error: "category_not_found" }, 400);
    const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, id));
    // Sweep cap (owner 07-14): one tap never places more than 25 calls — protects telephony/agent
    // concurrency for everyone else. The builder caps selection at 25 too; legacy bigger zones get a
    // clean error instead of a silent partial sweep.
    if (links.length > 25) return c.json({ error: "zone_too_big", max: 25 }, 400);
    const allRows = (await db.select().from(retailers).where(inArray(retailers.id, links.map((l) => l.retailerId)))).filter((r) => r.sellsPacks !== false);
    // Skip stores we KNOW are closed right now — a closed store can't be reached, so don't burn the
    // check on it (owner 07-11: "STORE XYZ is closed but we can still call STORE ABC"). Unknown hours
    // still get called. The confirm sheet already warned the user which ones we're skipping.
    const rows = [];
    for (const r of allRows) {
      const os = openState(r.hours, r.timezone);
      if (os.known && !os.open) continue;
      rows.push(r);
    }
    const runId = `z${id}-${crypto.randomUUID()}`;
    const isPrivate = await isFinderPrivate(g.a);
    const placed: { retailerId: number; cid: string | null }[] = [];
    const rooms: { room: string; retailerId: number }[] = [];
    // A zone store dials EXACTLY like a single check — bridgeStoreCall, the one path that carries the
    // full mapping stack (workflow lanes incl. Alpha/Bravo/Delta, chain nav recipes, connect-on-human,
    // voices). The old cheap lane skipped lane routing and broke every menu store (owner 07-20).
    // Only differences: the row is stamped with the zoneRunId, and the governor slot is "batch" so a
    // sweep can never starve instant single checks.
    for (const s of rows) {
      try {
        const r = await bridgeStoreCall(s.id, [cat.id], undefined, { userId: g.u.id, isPrivate }, false, { zoneRunId: runId, priority: "batch" });
        if (r.room) { placed.push({ retailerId: s.id, cid: r.room.startsWith("delta:") ? r.room : `bridge:${r.room}` }); rooms.push({ room: r.room, retailerId: s.id }); }
        else { console.error("zone check failed", s.id, r.error); placed.push({ retailerId: s.id, cid: null }); }
      } catch (e) { console.error("zone check failed", s.id, e); placed.push({ retailerId: s.id, cid: null }); }
    }
    zoneRunSids.set(runId, rooms); setTimeout(() => zoneRunSids.delete(runId), 30 * 60 * 1000);
    return c.json({ runId, stores: placed });
  });

  app.get("/app/zones/run/:runId", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const rows = await db.select().from(callResults).where(and(eq(callResults.zoneRunId, c.req.param("runId")), eq(callResults.finderUserId, g.u.id)));
    const stores = await retailerMap();
    // Logos resolve exactly like the homepage store list: the CHAIN's registered logo first (via the
    // store's chainId), name-prefix only as a fallback — name-matching alone left most report rows on
    // monogram tiles (owner 07-19).
    const chainNames = new Map((await cachedChains()).map((x) => [x.id, x.name]));
    const results = rows.map((r) => { const st = stores.get(r.retailerId); const nm = st?.name || "A store";
      const l = chainLogoInfo((st?.chainId && chainNames.get(st.chainId)) || storeChainName(nm));
      return { retailerId: r.retailerId, name: nm, location: st?.location || "", logoUrl: l.url || "", logoWide: l.wide, logoDark: l.dark, cid: r.providerCallId, status: r.status, statusKey: r.statusKey, confirmed: r.confirmed, summary: r.summary }; });
    const live = (st: string) => st === "in_progress" || st === "queued";
    const summary = {
      inStock: results.filter((r) => r.statusKey === "in_stock").length,
      no: results.filter((r) => r.statusKey === "not_in_stock" || r.statusKey === "does_not_sell" || r.statusKey === "sold_out").length,
      noAnswer: results.filter((r) => r.statusKey === "nobody_answered" || r.status === "no_answer").length,
      checking: results.filter((r) => live(r.status)).length,
    };
    return c.json({ done: results.filter((r) => !live(r.status)).length, total: results.length, summary, results });
  });

  app.post("/app/zones/run/:runId/stop", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const sids = zoneRunSids.get(c.req.param("runId")) || [];
    for (const { room } of sids) await zoneHangRoom(room);
    return c.json({ ok: true, stopped: sids.length });
  // Stop ONE store's call in a live run (owner 07-19: tap a not-yet-checked store -> "Stop checking").
  // A queued-by-governor ticket (no callSid yet) can't be stopped here — that cancel lives with the
  // queue feed (Pops); for placed calls this hangs up just that store's dial.
  app.post("/app/zones/run/:runId/stop-one", async (c) => {
    const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
    const b = await c.req.json().catch(() => ({}));
    const rid = Number(b.retailerId);
    const all = zoneRunSids.get(c.req.param("runId")) || [];
    const mine = all.filter((x) => x.retailerId === rid);
    for (const { room } of mine) await zoneHangRoom(room);
    return c.json({ ok: true, stopped: mine.length });
  });
  });
}

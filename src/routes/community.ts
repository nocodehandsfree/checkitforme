// Community and requests: the "I scored" wall, kiosks and their receipts, restock watches, the
// launch waitlist, store requests, email leads, and the Discord channels finds get posted to.

import type { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { chains, communityPosts, discordChannels, kioskReceipts, kioskReports, kiosks, leads, retailers, storeRequests, waitlist, watches } from "../db/schema";
import { getPolicy } from "../policy";
import { importStores } from "../stores-import";
import { categoryLabelMap, invalidateRefCache, retailerMap } from "../refcache";
import { haversineMi } from "../geo";
import { photoKey, presignPut, r2Config } from "../r2";
import { LIMITS, check as rlCheck, clientIp } from "../ratelimit";
import { isGmailConfigured } from "../gmail-receipts";
import { sendAlert } from "../alerts";
import { getAccount, grantCredits } from "../billing";
import { verifyClerkToken } from "./shared-helpers";

// ---- Community: kiosks (crowd-sourced refresh intel → free checks) + restock watches ----
export function kioskSummary(minutesCsv: string, interval?: number | null): string {
  const mins = minutesCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const at = mins.length ? mins.map((m) => ":" + m.padStart(2, "0")).join(" & ") : "";
  const every = interval ? ` — every ${interval} min` : "";
  return (at + every).trim() || "timing reported";
}

export function register(app: Hono) {
  // Discord cook-group channel registry — which channels the listener watches, and what chain each maps to.
  app.get("/api/discord/channels", async (c) => c.json(await db.select().from(discordChannels).orderBy(desc(discordChannels.createdAt))));

  app.post("/api/discord/channels", async (c) => {
    const b = await c.req.json();
    const items: Array<{ channelId?: string; label?: string; chain?: string; category?: string; note?: string; active?: boolean }> = Array.isArray(b) ? b : [b];
    let upserted = 0;
    for (const it of items) {
      if (!it.channelId) continue;
      await db.insert(discordChannels)
        .values({ channelId: String(it.channelId), label: it.label ?? null, chain: it.chain ?? null,
          category: it.category || "Pokémon", note: it.note ?? null, active: it.active !== false })
        .onConflictDoUpdate({ target: discordChannels.channelId,
          set: { label: it.label ?? null, chain: it.chain ?? null, category: it.category || "Pokémon", note: it.note ?? null, active: it.active !== false } });
      upserted++;
    }
    invalidateRefCache();
    return c.json({ upserted });
  });

  app.delete("/api/discord/channels/:id", async (c) => {
    await db.delete(discordChannels).where(eq(discordChannels.id, Number(c.req.param("id"))));
    return c.json({ ok: true });
  });

  // Social proof: how many people are actively waiting on this store+category (FOMO + network effect).
  app.get("/pub/watch-count", async (c) => {
    const retailerId = Number(c.req.query("retailerId") || 0), categoryId = Number(c.req.query("categoryId") || 0);
    if (!retailerId || !categoryId) return c.json({ count: 0 });
    const rows = await db.select().from(watches)
      .where(and(eq(watches.retailerId, retailerId), eq(watches.categoryId, categoryId), eq(watches.active, true)));
    return c.json({ count: rows.length });
  });

  // ---- Kiosk receipt verification: email your receipt → verified intel + a free call ----
  app.get("/pub/kiosk-receipt/start", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.kioskReceipts) return c.json({ error: "off" }, 403);
    return c.json({ email: process.env.GMAIL_USER || "restocktimer@gmail.com", since: Date.now(), live: isGmailConfigured() });
  });

  app.get("/pub/kiosk-receipt/poll", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.kioskReceipts) return c.json({ error: "off" }, 403);
    const since = Math.floor(Number(c.req.query("since") || 0) / 1000);
    const device = (c.req.query("device") || clientIp(c.req.raw.headers)).slice(0, 80);
    // Newest unclaimed receipt ingested since this widget opened.
    const cand = (await db.select().from(kioskReceipts)
      .where(and(gte(kioskReceipts.createdAt, since), isNull(kioskReceipts.claimedBy)))
      .orderBy(desc(kioskReceipts.createdAt)).limit(1))[0];
    if (!cand) return c.json({ found: false });
    await db.update(kioskReceipts).set({ claimedBy: device }).where(eq(kioskReceipts.id, cand.id));
    // Reward: logged-in → credits; anon → free device check.
    const reward = pol.rewards.kioskRefreshChecks;
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (u && reward > 0) { await getAccount(u.id, u.email); await grantCredits(u.id, reward); }
    return c.json({ found: true, receipt: { product: cand.product, machineId: cand.machineId, at: cand.txnAt }, reward: u ? { credits: reward } : { freeCheck: reward > 0, checks: reward } });
  });

  app.get("/api/kiosk-receipts", async (c) => c.json(await db.select().from(kioskReceipts).orderBy(desc(kioskReceipts.createdAt))));

  app.get("/pub/kiosks", async (c) => {
    const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng")), radius = Number(c.req.query("radius") || 25);
    let rows = await db.select().from(kiosks);
    if (lat && lng) rows = rows.filter((k) => k.lat != null && k.lng != null && haversineMi(lat, lng, k.lat, k.lng) <= radius)
      .sort((x, y) => haversineMi(lat, lng, x.lat!, x.lng!) - haversineMi(lat, lng, y.lat!, y.lng!));
    return c.json(rows.map((k) => ({ id: k.id, label: k.label, category: k.category, refreshSummary: k.refreshSummary, reports: k.reports, lat: k.lat, lng: k.lng })));
  });

  app.post("/pub/kiosks/report", async (c) => {
    const rl = rlCheck("reward", clientIp(c.req.raw.headers), LIMITS.reward);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json();
    const cat = b.category || "Pokémon";
    let kioskId = Number(b.kioskId) || 0;
    if (!kioskId) {
      if (b.retailerId) {
        const r = (await db.select().from(retailers).where(eq(retailers.id, Number(b.retailerId))))[0];
        if (!r) return c.json({ error: "store not found" }, 400);
        const ex = (await db.select().from(kiosks).where(and(eq(kiosks.retailerId, r.id), eq(kiosks.category, cat))))[0];
        if (ex) kioskId = ex.id;
        else { const [k] = await db.insert(kiosks).values({ retailerId: r.id, label: `${cat} kiosk — ${r.name}`, category: cat, lat: r.lat, lng: r.lng, state: r.state, region: r.region }).returning(); kioskId = k.id; }
      } else if (b.label) {
        const [k] = await db.insert(kiosks).values({ label: b.label, category: cat, lat: b.lat ?? null, lng: b.lng ?? null }).returning(); kioskId = k.id;
      } else return c.json({ error: "need kioskId, retailerId, or label" }, 400);
    }
    const minutes = Array.isArray(b.minutes) ? b.minutes.join(",") : String(b.minutes || "");
    await db.insert(kioskReports).values({ kioskId, minutes, intervalMin: b.intervalMin ?? null, note: b.note ?? null, contact: b.contact ?? null });
    const count = (await db.select().from(kioskReports).where(eq(kioskReports.kioskId, kioskId))).length;
    await db.update(kiosks).set({ refreshSummary: kioskSummary(minutes, b.intervalMin), reports: count }).where(eq(kiosks.id, kioskId));
    // Reward: logged-in → credits; anonymous → unlock a free check on the device.
    const reward = (await getPolicy()).rewards.kioskRefreshChecks;
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (u && reward > 0) { await getAccount(u.id, u.email); await grantCredits(u.id, reward); return c.json({ ok: true, kioskId, reward: { credits: reward } }); }
    return c.json({ ok: true, kioskId, reward: { freeCheck: reward > 0, checks: reward } });
  });

  app.get("/api/kiosks", async (c) => c.json(await db.select().from(kiosks)));

  app.post("/pub/watch", async (c) => {
    const rl = rlCheck("watch", clientIp(c.req.raw.headers), LIMITS.watch);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json();
    if (!b.contact || !b.retailerId || !b.categoryId) return c.json({ error: "contact, retailerId, categoryId required" }, 400);
    const channel = String(b.contact).includes("@") ? "email" : "sms";
    // SMS channel is dark until the toll-free number is approved (flags.smsAlerts) — email only till then.
    if (channel === "sms" && !(await getPolicy()).flags.smsAlerts) return c.json({ error: "email_required" }, 400);
    // Never a second row for the same person + store + product (owner 07-30: two rows meant two emails).
    // An active watch already covers them; an inactive one re-arms instead of piling on a new row.
    const contact = String(b.contact).trim();
    const existing = await db.select().from(watches).where(and(
      eq(watches.contact, contact), eq(watches.retailerId, Number(b.retailerId)), eq(watches.categoryId, Number(b.categoryId)),
    ));
    if (existing.some((w) => w.active)) return c.json({ ok: true, already: true });
    const spent = existing.sort((a, z) => z.id - a.id)[0];
    if (spent) { await db.update(watches).set({ active: true }).where(eq(watches.id, spent.id)); return c.json({ ok: true, rearmed: true }); }
    await db.insert(watches).values({ contact, channel, retailerId: Number(b.retailerId), categoryId: Number(b.categoryId) });
    return c.json({ ok: true });
  });

  app.get("/api/watches", async (c) => c.json(await db.select().from(watches).orderBy(desc(watches.createdAt))));

  // ---- Community "I scored!" wall (moderated, flag-gated) ----
  app.get("/pub/community", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.community) return c.json([]);
    const cats = await categoryLabelMap();
    const stores = await retailerMap();
    // Modular per vertical: a brand site (?categoryId=) shows only ITS scores; the "all" site shows everything.
    const catId = Number(c.req.query("categoryId") || 0);
    const where = catId ? and(eq(communityPosts.approved, true), eq(communityPosts.categoryId, catId)) : eq(communityPosts.approved, true);
    const rows = (await db.select().from(communityPosts).where(where)
      .orderBy(desc(communityPosts.createdAt)).limit(60));
    return c.json(rows.map((p) => ({
      // Inline base64 photos are megabytes each — serve them via a tiny image endpoint so the feed JSON
      // stays small (it was 1MB+ for 4 posts, which left the feed slow/empty). Real URLs pass through.
      id: p.id, handle: p.handle || null, caption: p.caption,
      imageUrl: (p.imageUrl || "").startsWith("data:") ? `/pub/community/${p.id}/image` : p.imageUrl,
      retailerId: p.retailerId ?? null,
      store: p.retailerId ? (stores.get(p.retailerId)?.name || "").split("—")[0].trim() : null,
      storeFull: p.retailerId ? (stores.get(p.retailerId)?.name ?? null) : null,
      location: p.retailerId ? (stores.get(p.retailerId)?.location ?? null) : null,
      region: p.retailerId ? (stores.get(p.retailerId)?.region ?? null) : null,
      state: p.retailerId ? (stores.get(p.retailerId)?.state ?? null) : null,
      category: p.categoryId ? cats.get(p.categoryId) : null, likes: p.likes, at: p.createdAt,
    })));
  });

  // Serve a score photo (decodes the stored base64 data-URI to real image bytes; cached). Keeps the
  // feed JSON tiny while photos load on demand.
  app.get("/pub/community/:id/image", async (c) => {
    const id = Number(c.req.param("id"));
    const row = (await db.select().from(communityPosts).where(eq(communityPosts.id, id)))[0];
    const u = row?.imageUrl || "";
    if (!u) return c.notFound();
    if (!u.startsWith("data:")) return c.redirect(u, 302);
    const m = u.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) return c.notFound();
    const buf = Buffer.from(m[2], "base64");
    // XSS guard: never serve user content as a script-capable type (e.g. image/svg+xml can carry
    // <script>). Whitelist raster types; anything else is forced to a non-renderable download, with
    // no-sniff + a locked-down CSP so the browser can't execute it.
    const SAFE_IMG = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
    const ct = SAFE_IMG.has((m[1] || "").toLowerCase()) ? m[1] : "application/octet-stream";
    c.header("Cache-Control", "public, max-age=86400");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", "default-src 'none'; sandbox");
    return c.body(buf, 200, { "Content-Type": ct });
  });

  // Hand the phone a presigned R2 URL so it uploads the photo directly (bytes never hit our server).
  app.post("/pub/community/upload-url", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
    const rl = rlCheck("communityUpload", clientIp(c.req.raw.headers), LIMITS.communityUpload);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const cfg = r2Config();
    if (!cfg) return c.json({ error: "uploads_not_configured" }, 503);
    const b = await c.req.json().catch(() => ({}));
    const ext = String(b.ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4);
    const key = photoKey(ext);
    const { uploadUrl, publicUrl } = await presignPut(key, cfg, b.contentType || "image/jpeg");
    return c.json({ uploadUrl, publicUrl, key });
  });

  app.post("/pub/community/post", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
    const rl = rlCheck("community", clientIp(c.req.raw.headers), LIMITS.community);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json();
    if (!b.imageUrl || typeof b.imageUrl !== "string") return c.json({ error: "imageUrl required" }, 400);
    // Accept: our R2 public base, our own /uploads, or a small inline data-URL image (pre-R2 fallback).
    const allowed = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
    const okHost = (allowed && b.imageUrl.startsWith(allowed)) || b.imageUrl.startsWith("/uploads/")
      || (b.imageUrl.startsWith("data:image/") && !/^data:image\/svg/i.test(b.imageUrl) && b.imageUrl.length <= 500_000);
    if (!okHost) return c.json({ error: "image must be uploaded via our upload URL" }, 400);
    const u = await verifyClerkToken(c.req.header("Authorization"));
    const [row] = await db.insert(communityPosts).values({
      finderUserId: u?.id ?? null, handle: (b.handle || "").slice(0, 40) || null,
      retailerId: b.retailerId ? Number(b.retailerId) : null, categoryId: b.categoryId ? Number(b.categoryId) : null,
      caption: (b.caption || "").slice(0, 240) || null, imageUrl: b.imageUrl, imageKey: b.imageKey || null,
      approved: pol.flags.communityAutoApprove,
    }).returning();
    return c.json({ ok: true, id: row.id, pending: !pol.flags.communityAutoApprove });
  });

  app.post("/pub/community/:id/like", async (c) => {
    const pol = await getPolicy();
    if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
    const rl = rlCheck("write", clientIp(c.req.raw.headers), LIMITS.write);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const id = Number(c.req.param("id"));
    const p = (await db.select().from(communityPosts).where(eq(communityPosts.id, id)))[0];
    if (!p || !p.approved) return c.json({ error: "not found" }, 404);
    // Atomic increment — avoids the lost-update race of read-then-write under concurrency.
    await db.update(communityPosts).set({ likes: sql`${communityPosts.likes} + 1` }).where(eq(communityPosts.id, id));
    return c.json({ ok: true, likes: p.likes + 1 });
  });

  // Admin moderation: list all, approve/unapprove, delete.
  app.get("/api/community", async (c) => c.json(await db.select().from(communityPosts).orderBy(desc(communityPosts.createdAt))));

  app.patch("/api/community/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json();
    if (typeof b.approved === "boolean") await db.update(communityPosts).set({ approved: b.approved }).where(eq(communityPosts.id, id));
    return c.json({ ok: true });
  });

  app.delete("/api/community/:id", async (c) => {
    await db.delete(communityPosts).where(eq(communityPosts.id, Number(c.req.param("id"))));
    return c.json({ ok: true });
  });

  // Kiosk overlay: reconcile the official TPCi vending list against our stores. For each machine, flag
  // the matching store (same chain, within ~0.3 mi) as a tier-5 kiosk (hasKiosk:true, tier:5) — leaving
  // sellsPacks untouched so a store that also sells on the shelf still shows in both tabs. Machines at a
  // location we don't have yet are inserted as new kiosk rows. `dryRun` returns counts only (no writes).
  app.post("/api/kiosks/overlay", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const machines: Record<string, unknown>[] = Array.isArray(b.machines) ? b.machines : [];
    if (!machines.length) return c.json({ error: "machines[] required" }, 400);
    const dryRun = !!b.dryRun;
    const norm = (s: unknown) => String(s || "").toLowerCase().replace(/['’.]/g, "").replace(/\s+/g, " ").trim();
    const chainRows = await db.select({ id: chains.id, name: chains.name }).from(chains);
    const chainByNorm = new Map<string, number>();
    for (const ch of chainRows) chainByNorm.set(norm(ch.name), ch.id);
    const chainNorms = [...chainByNorm.keys()];
    const resolveChain = (retailer: unknown): number | null => {
      const n = norm(retailer);
      if (!n) return null;
      if (chainByNorm.has(n)) return chainByNorm.get(n)!;
      const hit = chainNorms.find((cn) => cn.length >= 4 && (cn.startsWith(n) || n.startsWith(cn)));
      return hit ? chainByNorm.get(hit)! : null;
    };
    const stores = await db.select({ id: retailers.id, chainId: retailers.chainId, lat: retailers.lat, lng: retailers.lng, zip: retailers.zip }).from(retailers);
    const byChain = new Map<number, typeof stores>();
    for (const s of stores) { if (s.chainId == null) continue; const arr = byChain.get(s.chainId) || []; arr.push(s); byChain.set(s.chainId, arr); }
    let matched = 0, inserted = 0;
    const unresolved: Record<string, number> = {};
    const toInsert: Parameters<typeof importStores>[0] = [];
    for (const m of machines) {
      const retailer = m.retailer ?? m.chain;
      const lat = Number(m.lat), lng = Number(m.lng);
      const zip = String(m.zipPostalCode ?? m.zip ?? "") || null;
      const cid = resolveChain(retailer);
      let hit: { id: number } | null = null;
      if (cid != null) {
        let best: { id: number } | null = null, bestD = Infinity;
        for (const s of byChain.get(cid) || []) {
          if (s.lat != null && s.lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            const d = haversineMi(lat, lng, s.lat, s.lng);
            if (d < bestD) { bestD = d; best = { id: s.id }; }
          } else if (zip && s.zip && s.zip === zip) { best = { id: s.id }; bestD = 0; break; }
        }
        if (best && bestD <= 0.3) hit = best;
      } else {
        unresolved[norm(retailer)] = (unresolved[norm(retailer)] || 0) + 1;
      }
      if (hit) {
        matched++;
        if (!dryRun) await db.update(retailers).set({ hasKiosk: true, tier: 5, ...(m.name ? { externalStoreId: String(m.name) } : {}) }).where(eq(retailers.id, hit.id));
      } else {
        inserted++;
        toInsert.push({
          chain: String(retailer || "Pokémon Vending"),
          name: `${retailer || "Pokémon Vending"} ${m.city || m.stateProvince || ""}`.trim(),
          category: "Grocery",
          address: (m.street as string) || undefined, city: (m.city as string) || undefined,
          state: (m.stateProvince as string) || undefined, zip: zip || undefined,
          lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
          phone: "", carries: "Pokémon", sellsPacks: false, hasKiosk: true, tier: 5,
          store_id: m.name ? String(m.name) : undefined,
        });
      }
    }
    if (!dryRun && toInsert.length) await importStores(toInsert);
    invalidateRefCache();
    return c.json({ machines: machines.length, matched, inserted, dryRun, unresolved });
  });

  // Kiosk reconcile — ENFORCE the rule "a store is a Pokémon kiosk ONLY if it's on the official TPCi
  // vending list" (the store_ids from vending.pokemon.com). Pass the official store_ids; any active
  // hasKiosk store whose externalStoreId is NOT one of them gets hasKiosk:false + tier cleared. This
  // strips over-flagging from non-official sources (e.g. a store-locator scrape, stale numeric codes).
  // dryRun returns counts + a sample of what would be de-kiosked. Admin-gated.
  app.post("/api/kiosks/reconcile", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const official = new Set((Array.isArray(b.officialIds) ? b.officialIds : []).map((s: unknown) => String(s)));
    if (!official.size) return c.json({ error: "officialIds[] required (the store_ids from the vending list)" }, 400);
    const kiosks = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.hasKiosk, true)));
    const bad = kiosks.filter((r) => !r.externalStoreId || !official.has(String(r.externalStoreId)));
    if (b.dryRun) {
      return c.json({ dryRun: true, totalKiosks: kiosks.length, onOfficialList: kiosks.length - bad.length, willDeKiosk: bad.length,
        sample: bad.slice(0, 24).map((r) => ({ id: r.id, name: r.name, extId: r.externalStoreId })) });
    }
    for (let i = 0; i < bad.length; i += 500) {
      await db.update(retailers).set({ hasKiosk: false, tier: null }).where(inArray(retailers.id, bad.slice(i, i + 500).map((r) => r.id)));
    }
    invalidateRefCache();
    return c.json({ totalKiosks: kiosks.length, kept: kiosks.length - bad.length, deKiosked: bad.length });
  });

  // ---- Email lead capture (public Runnr gate: one free call requires an email) ----
  app.post("/pub/lead", async (c) => {
    const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const { email, source } = await c.req.json();
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
    await db.insert(leads).values({ email: e, source: source || "runner_free" }).onConflictDoNothing();
    return c.json({ ok: true });
  });

  // ---- Launch waitlist: capture out-of-area visitors + demand-by-region intel for rollout ----
  app.post("/pub/waitlist", async (c) => {
    const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const contact = String(b.contact || "").trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact), isPhone = /^[+()\d][-()\s\d]{6,}$/.test(contact);
    if (!isEmail && !isPhone) return c.json({ error: "invalid_contact" }, 400);
    const lat = Number(b.lat), lng = Number(b.lng);
    await db.insert(waitlist).values({
      contact, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
      area: (b.area ? String(b.area) : "").slice(0, 120) || null,
      region: b.region ? String(b.region).slice(0, 40) : null,
    });
    return c.json({ ok: true });
  });

  // "Don't see your store?" — submit a store to be added.
  app.post("/pub/store-request", async (c) => {
    const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const storeName = String(b.storeName || "").trim();
    if (!storeName) return c.json({ error: "storeName required" }, 400);
    // Attribute the submitter when they're signed in, so we can grant their free check the moment the store
    // goes live (see the PATCH below). Anonymous submissions still land — they just can't be auto-rewarded.
    const u = await verifyClerkToken(c.req.header("Authorization")).catch(() => null);
    await db.insert(storeRequests).values({
      contact: (b.contact ? String(b.contact) : "").slice(0, 120) || null,
      storeName: storeName.slice(0, 160), chain: (b.chain ? String(b.chain) : "").slice(0, 80) || null,
      address: (b.address ? String(b.address) : "").slice(0, 200) || null,
      city: (b.city ? String(b.city) : "").slice(0, 80) || null,
      state: (b.state ? String(b.state) : "").slice(0, 20) || null,
      note: (b.note ? String(b.note) : "").slice(0, 400) || null,
      userId: u?.id || null,
    });
    return c.json({ ok: true });
  });

  // Consumer: the signed-in user's own store submissions + their live/earned state (Earn-tab "stores you added").
  app.get("/app/my-store-requests", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const rows = await db.select().from(storeRequests).where(eq(storeRequests.userId, u.id)).orderBy(desc(storeRequests.createdAt));
    const reward = (await getPolicy()).rewards.storeAddChecks;
    return c.json({
      reward,
      requests: rows.map((r) => ({ id: r.id, storeName: r.storeName, city: r.city, status: r.status, rewarded: !!r.rewardedAt, createdAt: r.createdAt })),
    });
  });

  app.get("/api/store-requests", async (c) => c.json(await db.select().from(storeRequests).orderBy(desc(storeRequests.createdAt))));

  app.patch("/api/store-requests/:id", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const id = Number(c.req.param("id"));
    if (b.status) {
      const status = String(b.status);
      await db.update(storeRequests).set({ status }).where(eq(storeRequests.id, id));
      // Go-live reward: when a request is marked 'added', grant the submitter their free check(s) — ONCE
      // (rewardedAt guards double-grants across repeated PATCHes). Amount is Admin-tunable (rewards.storeAddChecks).
      if (status === "added") {
        const row = (await db.select().from(storeRequests).where(eq(storeRequests.id, id)))[0];
        const reward = (await getPolicy()).rewards.storeAddChecks;
        if (row && row.userId && !row.rewardedAt && reward > 0) {
          await getAccount(row.userId);
          await grantCredits(row.userId, reward);
          await db.update(storeRequests).set({ rewardedAt: Date.now() }).where(eq(storeRequests.id, id));
          // Tell the submitter their store is live (email — never SMS for this event).
          try { await sendAlert(row.userId, "store_added", { store: row.storeName, city: row.city || "" }); } catch { /* never block the grant */ }
          return c.json({ ok: true, granted: { userId: row.userId, checks: reward } });
        }
      }
    }
    return c.json({ ok: true });
  });
}

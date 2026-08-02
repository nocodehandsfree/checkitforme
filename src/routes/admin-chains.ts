// The Chains screen: the chain list, phone-menu discovery and verification, the trainer and the
// mapper, the map itself (versions, evidence, unknowns, approvals), the sweep, and the admin agent.

import type { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { chains, retailers } from "../db/schema";
import { config } from "../config";
import { createHash } from "node:crypto";
import { getSetting, setSetting } from "../db/settings";
import { isDirectDefaultChain } from "../db/import-data";
import { navPlanFromVersion, previewStorePrompt, triggerCall } from "../calls/service";
import { learnedSyncStatus, learnedSyncTick } from "../store-sync";
import { AGENT_MODELS, runAdminAgent } from "../agent/admin-agent";
import { TREE_MODEL, queueTreeRelearn } from "../calls/tree-learn";
import { NAV_MODEL, confirmAskedStores, getNavSession, latestNavSessionForChain, placeNavCall } from "../calls/navigator";
import { mapperState, startMapper, stopMapper } from "../calls/mapper";
import { activeMap, approveVersion, chainDetail, graphFor, graphSummary, navSecondsOf, openUnknowns, pathSignature, proposeVersion, rejectVersion, resetChainHistory, reshareUnsent, resolveUnknown, type EvidenceCall, type MapRecipe, versionsFor } from "../calls/mapgraph";
import { evidenceFromCall, recipeFromCall, type CapturedStep } from "../calls/map-capture";
import { buildQueue, startSweep, stopSweep, sweepStatus } from "../calls/sweep";
import { tapedeckCall, tdSession } from "../calls/tapedeck";
import { batchStatus, lockRecipeToChain, startBatch, stopBatch } from "../calls/trainer-batch";
import { chainDialable, type Recipe } from "../calls/recipe";
import { llm } from "../llm";
import { cachedCategories, invalidateRefCache } from "../refcache";
import { presignPut, r2Config } from "../r2";
import { chainLogoInfo, distributorsForChain, logoPctFor, refreshChainLogoDb } from "./shared-helpers";
import { artworkSize } from "./store-logos";

// ---- Phone Tree Lab: discover + document + verify the route-to-a-human per brand ----
// Place a normal call to one open, callable store of a chain; its transcript feeds the tree learner in ingest.
export async function placeChainTreeCall(chainId: number): Promise<{ ok: boolean; error?: string; retailer?: string }> {
  const stores = await db.select().from(retailers).where(and(eq(retailers.chainId, chainId), eq(retailers.active, true))).limit(40);
  const callable = stores.filter((s) => s.phone && !s.phone.startsWith("nophone:"));
  if (!callable.length) return { ok: false, error: "no callable store" };
  const cats = await cachedCategories();
  const catId = cats[0]?.id;
  if (!catId) return { ok: false, error: "no categories" };
  for (const s of callable) {
    try { await triggerCall({ retailerId: s.id, categoryId: catId }); return { ok: true, retailer: s.name }; }
    catch { /* closed / no line — try the next store */ }
  }
  return { ok: false, error: "no open store right now (all closed?)" };
}

export function register(app: Hono) {
  app.post("/api/admin/tapedeck/call", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { phone?: string; workflow?: string };
    return c.json(await tapedeckCall(String(b.phone || ""), b.workflow ? String(b.workflow) : undefined));
  });

  app.get("/api/admin/tapedeck/session/:id", (c) => {
    const s = tdSession(c.req.param("id"));
    if (!s) return c.json({ error: "not found" }, 404);
    return c.json({ id: s.id, status: s.status, steps: s.steps, clipText: s.clipText });
  });

  // Upload a chain's logo straight to shared R2 and point the chain row at it (logo_url). Server-side PUT
  // via a presigned URL — one request from the Admin. ?wide=1 / ?dark=1 set the render flags. After this
  // the logo travels to every environment through the DB row and can't drift.
  //
  // The stored name carries a FINGERPRINT of the bytes. A different picture is therefore a different
  // address, so a replacement appears everywhere the instant it lands: no version query to bump by hand,
  // nothing serving a week-old copy out of the delivery network's cache. The name no longer contains the
  // chain's own name either, so renaming a chain can never orphan its artwork.
  app.post("/api/chains/:id/logo", async (c) => {
    const cfg = r2Config();
    if (!cfg) return c.json({ error: "R2 not configured (R2_* env)" }, 503);
    // Staging is the curation home: it pushes chain settings to prod, so a logo set on prod would sit on
    // the losing side of a one-way copy and be silently reverted. Refuse it here rather than lose it.
    if (!config.staging.on) return c.json({ error: "logos are set on staging; production receives them through the store-data copy" }, 409);
    const id = Number(c.req.param("id"));
    const ch = (await db.select().from(chains).where(eq(chains.id, id)))[0];
    if (!ch) return c.json({ error: "chain not found" }, 404);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength < 64) return c.json({ error: "empty or tiny image body" }, 400);
    const ct = c.req.header("content-type") || "image/png";
    const ext = /webp/i.test(ct) ? "webp" : /svg/i.test(ct) ? "svg" : "png";
    // Named after the CONTENT alone. Two chains that share artwork share one stored copy, the chain's id
    // (which differs between staging and production) never leaks into the address, and a rename is a
    // non-event. Different picture = different name = it appears everywhere the moment it lands.
    const key = `chain-logos/${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}.${ext}`;
    const { uploadUrl, publicUrl } = await presignPut(key, cfg, ct);
    const put = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": ct } });
    if (!put.ok) return c.json({ error: `R2 PUT failed: ${put.status}` }, 502);
    const wide = c.req.query("wide") === "1", dark = c.req.query("dark") === "1";
    const size = artworkSize(bytes, ext);
    const pct = size ? logoPctFor(size.w, size.h) : null;
    await db.update(chains).set({ logoUrl: publicUrl, logoWide: wide, logoDark: dark, logoPct: pct }).where(eq(chains.id, id));
    await refreshChainLogoDb();
    return c.json({ id, name: ch.name, logoUrl: publicUrl, wide, dark, pct, artwork: size });
  });

  // Read-only: does the LIVE ElevenLabs agent prompt still carry the dynamic-variable slots? Confirms a
  // workflow's persona / opener actually reach the agent (a stale prompt would silently drop {{personality}}).
  app.get("/api/admin/agent-prompt", async (c) => {
    const key = config.voice.apiKey, agentId = config.voice.agentId;
    if (!key || !agentId) return c.json({ error: "elevenlabs not configured" }, 503);
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": key } });
    if (!r.ok) return c.json({ error: `agent GET ${r.status}` }, 502);
    const d = await r.json() as { conversation_config?: { agent?: { prompt?: { prompt?: string } } } };
    const prompt = d?.conversation_config?.agent?.prompt?.prompt || "";
    const has = (v: string) => prompt.includes(v);
    return c.json({
      agentId, promptLen: prompt.length,
      hasPersonality: has("{{personality}}"), hasOpeningLine: has("{{opening_line}}"),
      hasCategory: has("{{category}}"), hasClarification: has("{{clarification}}"),
      prompt: c.req.query("full") === "1" ? prompt : undefined,
    });
  });

  app.get("/api/chains", async (c) => {
    const rows = await db.select().from(chains);
    // Representative tier per chain = the most common retailers.tier among its active, graded stores
    // (the rating is stored PER STORE; there is no chains.tier column — see docs/data/scoring.md).
    const tr = await db.select({ cid: retailers.chainId, tier: retailers.tier, n: sql<number>`count(*)` })
      .from(retailers).where(and(eq(retailers.active, true), sql`${retailers.tier} is not null`)).groupBy(retailers.chainId, retailers.tier);
    const tierByChain = new Map<number, number>(), bestN = new Map<number, number>();
    for (const r of tr) { const n = Number(r.n || 0); if (r.cid != null && r.tier != null && n > (bestN.get(r.cid) || 0)) { bestN.set(r.cid, n); tierByChain.set(r.cid, r.tier); } }
    // Per-store fields (callable/kiosk/online/stock) vary by location — surface counts so the panel can
    // show the majority state + bulk-set them across the chain.
    const ag = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)`,
      callable: sql<number>`sum(case when ${retailers.sellsPacks} then 1 else 0 end)`,
      kiosk: sql<number>`sum(case when ${retailers.hasKiosk} then 1 else 0 end)`,
      onl: sql<number>`sum(case when ${retailers.online} then 1 else 0 end)`,
      verified: sql<number>`sum(case when ${retailers.stockStatus}='verified' then 1 else 0 end)` })
      .from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
    const aggByChain = new Map(ag.map((r) => [r.cid, { n: Number(r.n || 0), callable: Number(r.callable || 0), kiosk: Number(r.kiosk || 0), online: Number(r.onl || 0), verified: Number(r.verified || 0) }]));
    return c.json(rows.map((ch) => {
      const l = chainLogoInfo(ch.name);
      return { ...ch, logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct, tier: tierByChain.get(ch.id) ?? null, stores: aggByChain.get(ch.id) ?? { n: 0, callable: 0, kiosk: 0, online: 0, verified: 0 } };
    }));
  });

  // Compact store list for the Voice → Test picker: ONE callable store per supported (app-visible) chain
  // — ~80 rows, not the 105k national import. Mirrors the consumer visibility rule (non-muted chain with
  // an active, real-phone store) so the test calls a store that's actually in the product.
  app.get("/api/test-stores", async (c) => {
    const chainRows = await db.select().from(chains);
    const muted = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
    const name = new Map(chainRows.map((x) => [x.id, x.name]));
    const rows = await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, chainId: retailers.chainId, phone: retailers.phone })
      .from(retailers).where(eq(retailers.active, true));
    const seen = new Set<number>();
    const out: Array<{ id: number; name: string; location: string | null; chainName: string | null }> = [];
    for (const r of rows) {
      if (!r.chainId || muted.has(r.chainId) || seen.has(r.chainId)) continue;
      if (!r.phone || r.phone.startsWith("nophone:") || !/\d{7}/.test(r.phone)) continue;
      seen.add(r.chainId);
      out.push({ id: r.id, name: r.name, location: r.location, chainName: name.get(r.chainId) ?? null });
    }
    out.sort((a, b) => (a.chainName || a.name).localeCompare(b.chainName || b.name));
    return c.json(out);
  });

  // Edit a chain's default phone tree (the CHAIN tier of the rule system). Admin-gated via middleware.
  app.patch("/api/chains/:id", async (c) => {
    const b = await c.req.json();
    const patch: Record<string, unknown> = {};
    if (b.phoneTreeDefault !== undefined) patch.phoneTreeDefault = b.phoneTreeDefault || null;
    if (b.dtmfShortcut !== undefined) patch.dtmfShortcut = b.dtmfShortcut || null;
    if (b.name !== undefined) patch.name = b.name;
    if (b.type !== undefined) patch.type = b.type;
    // Answer-path classification + consumer mute (god-view + per-chain cost control).
    if (b.answerPath !== undefined) patch.answerPath = b.answerPath || null;
    if (typeof b.callTarget === "boolean") patch.callTarget = b.callTarget;
    if (typeof b.ringsDirect === "boolean") patch.ringsDirect = b.ringsDirect;
    if (b.stockCheckMethod !== undefined) patch.stockCheckMethod = b.stockCheckMethod || null;
    if (b.avgTreeSeconds !== undefined) patch.avgTreeSeconds = Number.isFinite(Number(b.avgTreeSeconds)) && Number(b.avgTreeSeconds) > 0 ? Number(b.avgTreeSeconds) : null;
    if (typeof b.repackOnly === "boolean") patch.repackOnly = b.repackOnly;
    if (typeof b.muted === "boolean") patch.muted = b.muted;
    if (b.unmappableReason !== undefined) patch.unmappableReason = b.unmappableReason || null; // stored mute reason (online-only / no store line / …)
    // Per-store call settings (Settings page): talk-time cap + voicemail/closed auto-hangup.
    if (b.maxTalkSeconds !== undefined) patch.maxTalkSeconds = Number.isFinite(Number(b.maxTalkSeconds)) && Number(b.maxTalkSeconds) > 0 ? Number(b.maxTalkSeconds) : null;
    if (typeof b.hangupOnVoicemail === "boolean") patch.hangupOnVoicemail = b.hangupOnVoicemail;
    if (b.stockCheckConfidence !== undefined) patch.stockCheckConfidence = b.stockCheckConfidence || null; // e.g. "spotty" = inconsistent stock (off-price/thrift), not a reliable MSRP source
    if (b.sellMethods !== undefined) patch.sellMethods = b.sellMethods || null; // CSV: in_store|pickup|ship
    if (typeof b.isMSRP === "boolean") patch.isMSRP = b.isMSRP;
    // Logo pointer repoint (logos-restructure): accepts a shared-R2 URL or a same-origin /logos/… path;
    // null/"" clears it back to the filesystem resolver. Flags ride along like POST /api/chains/:id/logo.
    if (b.logoUrl !== undefined) patch.logoUrl = b.logoUrl || null;
    if (typeof b.logoWide === "boolean") patch.logoWide = b.logoWide;
    if (typeof b.logoDark === "boolean") patch.logoDark = b.logoDark;
    // How wide to draw the logo, as a percent of its tile. Normally set by the upload; accepted here so
    // an existing logo can be measured and backfilled without re-uploading the artwork.
    if (b.logoPct !== undefined) patch.logoPct = Number.isFinite(Number(b.logoPct)) && Number(b.logoPct) > 0 ? Number(b.logoPct) : null;
    // Invariant: a direct-answer chain has no menu, so it must carry NO tree-seconds — a stray value arms
    // the connect-timer and mutes the agent (silent-agent bug). Enforce it here too, so a manual admin edit
    // that flips a chain to direct can't recreate it (the learn/trainer paths already guard this).
    if (patch.ringsDirect === true || patch.answerPath === "direct_human") patch.avgTreeSeconds = null;
    // MAPPED CHAINS ARE UNTOUCHABLE (owner law 2026-07-20, the Walgreens incident): a chain with a
    // learned/verified tree (or rings-direct) may not be flagged out of the call lane — "check online",
    // callTarget off, or muted — without an explicit force:true in the body. A wrong flag on a mapped
    // tier-5 hides a working recipe from the whole operation. Remap (or force, with the reason written
    // in unmappableReason) is the only way out.
    const _cur = (await db.select().from(chains).where(eq(chains.id, Number(c.req.param("id")))))[0];
    const _mapped = !!_cur && (_cur.treeStatus === "learned" || _cur.treeStatus === "verified" || _cur.ringsDirect === true);
    const _suppressing = patch.stockCheckMethod === "site" || patch.callTarget === false || patch.muted === true;
    if (_mapped && _suppressing && b.force !== true) {
      return c.json({ error: `${_cur.name} is MAPPED (${_cur.treeStatus || "rings direct"}) — refusing to flag it out of the call lane. Pass force:true (and write the reason) if this is deliberate.` }, 409);
    }
    const [row] = await db.update(chains).set(patch).where(eq(chains.id, Number(c.req.param("id")))).returning();
    invalidateRefCache();
    if (patch.logoUrl !== undefined || patch.logoWide !== undefined || patch.logoDark !== undefined) await refreshChainLogoDb();
    return c.json(row);
  });

  // ---- Preview: the exact instructions a store's call will run (Global + Chain + Store) ----
  app.get("/api/preview/:retailerId", async (c) => {
    const rid = Number(c.req.param("retailerId"));
    const cid = Number(c.req.query("categoryId") || 1);
    const product = c.req.query("product") || undefined;
    const p = await previewStorePrompt(rid, cid, product);
    if (!p) return c.json({ error: "store or category not found" }, 404);
    return c.json(p);
  });

  // Sync LEARNED chain-nav fields PROD → STAGING. Nav is learned from real calls on prod; staging is a
  // curation copy that goes stale ("mapped on prod, gray COMING SOON on staging"). The promotion rule:
  // learned fields refresh prod→staging. Keyed by NAME (chain ids differ per env). SKIPS the curated
  // DIRECT_DEFAULT_CHAINS so a stale prod tree (e.g. Ace's old "press 4") can never clobber the
  // independent/co-op direct default. Silent-agent invariant enforced. Admin-gated. `dryRun:true` reports.
  app.post("/api/admin/chains/nav-sync", async (c) => {
    const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const incoming = (Array.isArray(b) ? b : ((b as Record<string, unknown>).chains as unknown[])) || [];
    if (!Array.isArray(incoming) || !incoming.length) return c.json({ error: "expected { chains: [{name, …nav}] }" }, 400);
    const NAV = ["navStatus", "navRecipe", "navType", "navSeconds", "ringsDirect", "treeStatus", "treeNote",
      "phoneTreeDefault", "dtmfShortcut", "answerPath", "avgTreeSeconds", "treeLearnedAt", "treeVerifiedAt"] as const;
    const dry = (b as Record<string, unknown>).dryRun === true;
    const byName = new Map((await db.select().from(chains)).map((x) => [x.name, x]));
    let updated = 0, skippedDirect = 0, missing = 0;
    for (const inc of incoming as Record<string, unknown>[]) {
      const row = inc && typeof inc.name === "string" ? byName.get(inc.name) : null;
      if (!row) { missing++; continue; }
      if (isDirectDefaultChain(row.name)) { skippedDirect++; continue; } // never clobber the curated direct default
      const patch: Record<string, unknown> = {};
      for (const k of NAV) if (k in inc) patch[k] = inc[k];
      if (!Object.keys(patch).length) continue;
      // silent-agent invariant: a direct chain must carry NO tree-seconds
      if (patch.ringsDirect === true || patch.answerPath === "direct_human") patch.avgTreeSeconds = null;
      if (!dry) await db.update(chains).set(patch).where(eq(chains.id, row.id));
      updated++;
    }
    if (!dry) invalidateRefCache();
    return c.json({ [dry ? "wouldUpdate" : "updated"]: updated, skippedDirect, missing, received: incoming.length });
  });

  // Manual "refresh staging from prod" — the same pull the learned-sync tick runs every 3 min, on demand.
  // Learned phone-nav is born on prod (real calls); this drags it back so staging never lags. Staging-only
  // (prod is the source and returns not_staging). GET reports the last run without pulling.
  app.get("/api/admin/learned-sync", async (c) => c.json(await learnedSyncStatus()));

  app.post("/api/admin/learned-sync", async (c) => c.json(await learnedSyncTick()));

  app.get("/api/admin/tree/list", async (c) => {
    const chs = await db.select().from(chains).orderBy(chains.name);
    const rows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
    const cnt = new Map(rows.map((r) => [r.cid, Number(r.n || 0)]));
    // Per-chain count of stores we can ACTUALLY dial (real phone, not a `nophone:` placeholder). A chain
    // with stores but 0 phones can never be mapped no matter how many calls we throw at it — the blocker is
    // a DATA gap (missing phone numbers), not a phone tree. Surfacing this stops the "all stores closed"
    // misdiagnosis (e.g. the verified-kiosk groceries — H-E-B et al. — are 100% kiosks with 0 phones on file).
    const prows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
      .where(and(eq(retailers.active, true), sql`${retailers.phone} is not null and ${retailers.phone} not like 'nophone:%'`)).groupBy(retailers.chainId);
    const pcnt = new Map(prows.map((r) => [r.cid, Number(r.n || 0)]));
    // The mapping board must MATCH the store data: only real, DIALABLE chains. chainDialable() is the ONE
    // shared rule (recipe.ts) the board, the overnight batch, and single-chain map all read — a muted,
    // call-center (callTarget=false), or site-check chain (stockCheckMethod=site, e.g. Micro Center) is
    // never dialed, so it must not look callable here either. EXCEPTION (Walgreens incident 2026-07-20):
    // a MAPPED chain is ALWAYS visible, whatever its flags — hiding a mapped chain from this board is how
    // a flag conflict goes unnoticed until a live call dials blind; it surfaces with a conflict blocker
    // instead. Plus board-only clutter filters: 0 active stores = nothing to call, "_" = retired
    // merge-stub. `?all=1` = unfiltered.
    const isMapped = (ch: typeof chs[number]) => ch.treeStatus === "learned" || ch.treeStatus === "verified" || ch.ringsDirect === true;
    const showAll = c.req.query("all") === "1";
    const visible = showAll ? chs : chs.filter((ch) => (chainDialable(ch) || isMapped(ch)) && !(ch.name || "").startsWith("_") && (cnt.get(ch.id) || 0) > 0);
    return c.json({ model: TREE_MODEL, chains: visible.map((ch) => {
      const stores = cnt.get(ch.id) || 0, phones = pcnt.get(ch.id) || 0;
      // blocker = why this chain can't be mapped/called even though it looks like a call target. A data
      // gap (stores but no numbers), or a FLAG CONFLICT — mapped yet flagged out of the call lane (the
      // Walgreens class of bug; must never hide silently again).
      const conflict = isMapped(ch) && !chainDialable(ch)
        ? `CONFLICT: mapped but flagged ${ch.muted ? "muted" : ch.callTarget === false ? "no-call-target" : "check-online"} — recipe exists yet chain is off the call lane`
        : null;
      const blocker = conflict ?? (stores > 0 && phones === 0 ? "no phone numbers on file (data gap)" : null);
      return { id: ch.id, name: ch.name, type: ch.type, stores, phones, blocker, distributor: distributorsForChain(ch.name), treeStatus: ch.treeStatus, ringsDirect: ch.ringsDirect, dtmf: ch.dtmfShortcut, answerPath: ch.answerPath, avgTreeSeconds: ch.avgTreeSeconds, note: ch.treeNote || ch.phoneTreeDefault, learnedAt: ch.treeLearnedAt, verifiedAt: ch.treeVerifiedAt, muted: ch.muted };
    }) });
  });

  app.post("/api/admin/tree/discover", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; count?: number };
    if (b.chainId) return c.json(await placeChainTreeCall(Number(b.chainId)));
    const count = Math.min(Math.max(Number(b.count) || 5, 1), 25);
    const chs = await db.select().from(chains).where(isNull(chains.treeStatus)).limit(300);
    const names: string[] = []; let placed = 0;
    for (const ch of chs) { if (placed >= count) break; const r = await placeChainTreeCall(ch.id); if (r.ok) { placed++; names.push(ch.name); } }
    return c.json({ placed, names });
  });

  app.post("/api/admin/tree/verify", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; count?: number };
    if (b.chainId) { queueTreeRelearn(Number(b.chainId)); return c.json(await placeChainTreeCall(Number(b.chainId))); }
    const count = Math.min(Math.max(Number(b.count) || 5, 1), 25);
    const chs = await db.select().from(chains).where(sql`${chains.treeStatus} is not null`).limit(300);
    const names: string[] = []; let placed = 0;
    for (const ch of chs) { if (placed >= count) break; queueTreeRelearn(ch.id); const r = await placeChainTreeCall(ch.id); if (r.ok) { placed++; names.push(ch.name); } }
    return c.json({ placed, names });
  });

  // ---- Tree Trainer v2: document the fastest path to a human per chain (the cheap-lane navigator) ----
  // Helicone routing health-check: one tiny live call through the gateway (no phone call). Confirms the
  // LLM "voice switcher" path works and reports which model + latency. Defaults to the cheap nav model.
  app.get("/api/admin/llm-ping", async (c) => {
    const model = c.req.query("model") || NAV_MODEL;
    const t0 = Date.now();
    try {
      const text = await llm(model, "Reply with the single word OK.", { job: "helicone-ping", maxTokens: 5, temperature: 0 });
      return c.json({ ok: true, model, via: "helicone", heliconeConfigured: !!process.env.HELICONE_API_KEY, ms: Date.now() - t0, sample: (text || "").trim().slice(0, 40) });
    } catch (e) {
      return c.json({ ok: false, model, via: "helicone", heliconeConfigured: !!process.env.HELICONE_API_KEY, ms: Date.now() - t0, error: String((e as Error)?.message || e).slice(0, 200) }, 502);
    }
  });

  app.get("/api/admin/trainer/list", async (c) => {
    const chs = await db.select().from(chains).orderBy(chains.name);
    const rows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
      .where(and(eq(retailers.active, true), sql`${retailers.phone} not like 'nophone:%'`)).groupBy(retailers.chainId);
    const cnt = new Map(rows.map((r) => [r.cid, Number(r.n || 0)]));
    return c.json({ chains: chs.filter((ch) => !ch.name.startsWith("_")).map((ch) => ({
      id: ch.id, name: ch.name, type: ch.type, callable: cnt.get(ch.id) || 0,
      navType: ch.navType, navStatus: ch.navStatus || "unmapped", navSeconds: ch.navSeconds,
      navConfidence: ch.navConfidence, navRecipe: ch.navRecipe ? JSON.parse(ch.navRecipe) : null,
      navLog: ch.navLog ? JSON.parse(ch.navLog) : [], navUpdatedAt: ch.navUpdatedAt,
    })) });
  });

  app.post("/api/admin/trainer/document", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; retailerId?: number; model?: string; hint?: string; barge?: { plan: Array<{ action: string; value: string; at: number; early?: boolean }> }; reactivePress?: { digit: string; max: number }; confirm?: boolean; product?: string; why?: string; relisten?: boolean };
    // CONFIRM mode: don't just reach a human — ask "do you have any {product} in stock?" to verify we
    // hit the RIGHT desk. On a chain-level run we ROTATE to a store we haven't asked yet (no script change,
    // just a fresh store) so we never re-ask the same store on a callback.
    const confirm = b.confirm ? { product: (b.product || "Pokémon cards").trim() } : undefined;
    let r: typeof retailers.$inferSelect | undefined;
    if (b.retailerId) r = (await db.select().from(retailers).where(eq(retailers.id, Number(b.retailerId))))[0];
    else if (b.chainId) {
      const cands = await db.select().from(retailers).where(and(
        eq(retailers.chainId, Number(b.chainId)), eq(retailers.active, true), sql`${retailers.phone} not like 'nophone:%'`,
      )).limit(50);
      if (confirm) {
        const asked = new Set(await confirmAskedStores(Number(b.chainId)));
        r = cands.find((x) => x.phone && !asked.has(x.id)) ?? cands[0]; // fresh store first; if all asked, start over
      } else {
        r = cands.find((x) => x.phone) ?? cands[0];
      }
    }
    if (!r || !r.phone) return c.json({ error: "no callable store for that chain" }, 400);
    // Same shared rule as the board + batch: never trainer-dial a chain we don't call — muted, a national
    // call-center (callTarget=false, e.g. Micro Center / Best Buy), or a site-check chain (its accurate
    // website is the answer). chainDialable() is the single source so these can never disagree.
    const _ch = r.chainId != null ? (await db.select().from(chains).where(eq(chains.id, r.chainId)))[0] : undefined;
    if (_ch && !chainDialable(_ch)) return c.json({ error: `${_ch.name} isn't a call target (muted / call-center / check-online) — skipped` }, 400);
    if (b.chainId) await db.update(chains).set({ navStatus: "learning", navUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(chains.id, Number(b.chainId)));
    // RE-LISTEN: we already hold this chain's route, so walk THAT and hang up the instant the desk
    // rings. The plan comes straight off the live version (`navPlanFromVersion`, the same builder a
    // real check uses), so the call re-listens to the exact route customers run, never a fresh guess.
    let barge = b.barge;
    const relisten = b.relisten === true;
    if (relisten) {
      const live = r.chainId != null ? await activeMap(r.chainId, r.id) : null;
      if (!live) return c.json({ error: "nothing to re-listen to: this chain has no route yet" }, 400);
      const plan = navPlanFromVersion(live.recipe?.steps);
      if (!plan.steps.length && live.recipe?.type !== "direct") {
        return c.json({ error: "the live route has no steps to walk" }, 400);
      }
      barge = { plan: plan.steps.map((st) => ({ action: st.action, value: st.value, at: st.atSec })) };
    }
    // The grader's inputs for a walk of a route we already hold: the menu we expect to hear (the locked
    // run's opening line) and the menu time this check has to beat. Both come off the live version, so
    // a night menu grades "wrong menu" and a slower walk grades "not faster" with no one deciding.
    let expectedGreeting: string | undefined; let recipeSeconds: number | undefined;
    if (relisten && r.chainId != null) {
      const live = await activeMap(r.chainId, r.id);
      const ev = live?.evidence?.calls || [];
      const newest = ev.filter((c) => (c.transcript || []).length).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      expectedGreeting = newest?.transcript?.[0]?.replace(/^\s*\d+s\s+/, "");
      recipeSeconds = navSecondsOf(live?.recipe ?? null, ev) ?? undefined;
    }
    const res = await placeNavCall(r.chainId, r.id, r.name, r.phone, b.model, b.hint, barge, b.reactivePress, confirm,
      { why: b.why ? String(b.why).slice(0, 80) : (relisten ? "Re-listen" : "Admin: map this chain"), relisten,
        stage: relisten ? "speed" : "map", expectedGreeting, recipeSeconds });
    return res.error ? c.json({ error: res.error }, 400) : c.json({ sessionId: res.id, store: r.name, confirm: !!confirm, relisten });
  });

  app.get("/api/admin/trainer/session/:id", (c) => {
    const s = getNavSession(c.req.param("id"));
    if (!s) return c.json({ error: "expired" }, 404);
    return c.json({ id: s.id, store: s.retailerName, status: s.status, type: s.type, confidence: s.confidence,
      elapsed: Math.round((Date.now() - s.startMs) / 1000), humanAtSec: s.humanAtSec,
      // Confirm-mode: did we hit the RIGHT desk ("answered") or get sent elsewhere ("redirect" + where)?
      confirm: s.confirm ? (s.confirmResult ?? "asked") : null, redirectTo: s.redirectTo ?? null,
      // #2: the pressable menu tree heard so far + the desk we're aiming for (owner target).
      menu: s.menu ?? [], menuPrompts: s.menuPrompts ?? [], target: s.target ?? null,
      steps: s.steps, recipe: s.recipe });
  });

  // Call log for a chain: every learner run (Alpha/Bravo/Charlie path + the step matrix). Powers the
  // expandable log under the Discover button.
  app.get("/api/admin/trainer/runs", async (c) => {
    const chainId = Number(c.req.query("chainId"));
    if (!chainId) return c.json({ runs: [] });
    const runs = JSON.parse((await getSetting(`nav_runs:${chainId}`)) || "[]") as unknown[];
    return c.json({ runs: runs.slice().reverse() }); // newest first
  });

  // Seed/replace a chain's run log (used to backfill today's real runs; also handy for tests).
  app.post("/api/admin/trainer/runs", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; runs?: unknown[] };
    if (!b.chainId || !Array.isArray(b.runs)) return c.json({ error: "chainId + runs[] required" }, 400);
    await setSetting(`nav_runs:${b.chainId}`, JSON.stringify(b.runs.slice(-20)));
    return c.json({ ok: true, saved: b.runs.length });
  });

  app.post("/api/admin/trainer/lock", async (c) => {
    // The Admin "Map" button ends here. It goes through the SAME writer as the overnight batch, the
    // mapper and the sweep (lockRecipeToChain), so a route locked by hand lands in the map with its
    // evidence exactly like one locked by a sweep — no path can put a recipe on live calls silently.
    const b = (await c.req.json().catch(() => ({}))) as {
      chainId?: number; recipe?: { type?: string; steps?: unknown[]; seconds?: number }; confidence?: number; navId?: string;
    };
    if (!b.chainId || !b.recipe) return c.json({ error: "chainId + recipe required" }, 400);
    const recipe = b.recipe as Recipe;
    // When the lock names the call it came from, that call IS the evidence — its store, its timing, the
    // greeting that proves which desk answered, and which recording each step followed.
    let evidence: EvidenceCall | undefined;
    const sess = b.navId ? getNavSession(String(b.navId)) : latestNavSessionForChain(Number(b.chainId));
    if (sess) {
      const steps = (sess.steps || []) as CapturedStep[];
      const captured = recipeFromCall(steps, sess.humanAtSec ?? null);
      if (captured.steps.length === (recipe.steps?.length || 0)) recipe.steps = captured.steps as unknown as Recipe["steps"];
      const store = (await db.select().from(retailers).where(eq(retailers.id, sess.retailerId)))[0];
      evidence = evidenceFromCall({
        navId: sess.id, storeId: sess.retailerId, storeName: store?.name, steps,
        seconds: recipe.seconds ?? null, reachedHuman: true, path: pathSignature(captured),
        greeting: sess.greeting, transferAtSec: sess.transferAtSec ?? null, note: "locked from Admin",
      });
    }
    await lockRecipeToChain(Number(b.chainId), recipe, typeof b.confidence === "number" ? b.confidence : null, evidence);
    return c.json({ ok: true });
  });

  // Overnight phone-tree batch: dial one store per chain, learn + persist the route. action:
  // "start" (onlyMissing default true; optional limit, gapSec) | "stop" | "status".
  app.post("/api/admin/trainer/batch", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { action?: string; onlyMissing?: boolean; limit?: number; gapSec?: number };
    if (b.action === "stop") return c.json(stopBatch());
    if (b.action === "status") return c.json(batchStatus());
    return c.json(await startBatch({ onlyMissing: b.onlyMissing, limit: b.limit, gapSec: b.gapSec }));
  });

  app.get("/api/admin/trainer/batch", (c) => c.json(batchStatus()));

  // ---- Mapper: "map until locked" — the auto-continue loop (listen → baseline → optimize → lock) ----
  app.post("/api/admin/mapper/start", async (c) => {
    // storeId (optional): map THIS store, skipping the 9am-8pm picker — for a store we know is open now,
    // or one whose menu differs from its chain's.
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; storeId?: number };
    return c.json(await startMapper(Number(b.chainId || 0), { storeId: Number(b.storeId || 0) || undefined }));
  });

  app.post("/api/admin/mapper/stop", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number };
    return c.json(stopMapper(Number(b.chainId || 0)));
  });

  app.get("/api/admin/mapper/state", (c) => c.json(mapperState()));

  // #B: department-only chains (no customer-service option) — read the flag + captured menu so the panel
  // can ask the owner which desk to press; POST sets the per-chain target and clears the flag so the next
  // "Map until locked" aims for it.
  app.get("/api/admin/mapper/target", async (c) => {
    const chainId = Number(c.req.query("chainId"));
    if (!chainId) return c.json({ error: "chainId required" }, 400);
    const flag = (await getSetting(`nav_needs_target:${chainId}`)) || "";
    const target = (await getSetting(`nav_target:${chainId}`)) || "";
    return c.json({ target: target || null, needsTarget: flag ? JSON.parse(flag) : null });
  });

  app.post("/api/admin/mapper/target", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; target?: string };
    const chainId = Number(b.chainId || 0);
    if (!chainId) return c.json({ error: "chainId required" }, 400);
    const target = String(b.target || "").trim();
    await setSetting(`nav_target:${chainId}`, target);
    await setSetting(`nav_needs_target:${chainId}`, ""); // owner chose → clear the needs-target flag
    return c.json({ ok: true, target: target || null });
  });

  // ---- The map: versions, evidence, confidence, drift, unknowns, approvals --------------------
  // Read-only for the dashboard plus the two decisions a human makes (approve / reject a version, close
  // an unknown). The mapping engine writes; nothing here places a call except the sweep endpoints.
  app.get("/api/admin/map/graph", async (c) => c.json({ rows: await graphSummary() }));

  app.get("/api/admin/map/chain/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "chainId required" }, 400);
    // The pencil's corrections ride with the detail: keyed by line, kept beside what was heard, and a
    // future check never overwrites them (owner, 07-30).
    let menuFixes: Record<string, string> = {};
    try { menuFixes = JSON.parse((await getSetting(`menu_fix:${id}`)) || "{}"); } catch { menuFixes = {}; }
    return c.json({ ...(await chainDetail(id)), menuFixes });
  });

  // THE PLAY BUTTON'S AUDIO. Every mapping check is recorded at the carrier; this streams one check's
  // recording to the page, where each menu line seeks to its own second. The carrier's media address
  // needs its own sign-in, so the page cannot fetch it directly — this route carries it across.
  app.get("/api/admin/map/play/:callSid", async (c) => {
    const callSid = String(c.req.param("callSid") || "");
    if (!/^CA[a-zA-Z0-9]{32}$/.test(callSid)) return c.json({ error: "bad call id" }, 400);
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) return c.json({ error: "twilio not configured" }, 500);
    const auth = "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
    const list = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}/Recordings.json`, { headers: { Authorization: auth } });
    if (!list.ok) return c.json({ error: `carrier ${list.status}` }, 502);
    const recs = ((await list.json()) as { recordings?: Array<{ sid: string }> }).recordings || [];
    if (!recs.length) return c.json({ error: "no recording for this check" }, 404);
    const media = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recs[0].sid}.mp3`, { headers: { Authorization: auth } });
    if (!media.ok || !media.body) return c.json({ error: `carrier ${media.status}` }, 502);
    return new Response(media.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  });

  app.post("/api/admin/map/chain/:id/menu-line", async (c) => {
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "chainId required" }, 400);
    const b = (await c.req.json().catch(() => ({}))) as { idx?: number; text?: string };
    if (typeof b.idx !== "number") return c.json({ error: "idx required" }, 400);
    let fixes: Record<string, string> = {};
    try { fixes = JSON.parse((await getSetting(`menu_fix:${id}`)) || "{}"); } catch { fixes = {}; }
    const text = String(b.text || "").slice(0, 300).trim();
    if (text) fixes[String(b.idx)] = text; else delete fixes[String(b.idx)];
    await setSetting(`menu_fix:${id}`, JSON.stringify(fixes));
    return c.json({ ok: true, fixes });
  });

  app.post("/api/admin/map/version/:id/approve", async (c) => {
    const id = Number(c.req.param("id"));
    return c.json(await approveVersion(id, "admin"));
  });

  app.post("/api/admin/map/version/:id/reject", async (c) => {
    const id = Number(c.req.param("id"));
    const b = (await c.req.json().catch(() => ({}))) as { why?: string };
    return c.json(await rejectVersion(id, "admin", String(b.why || "")));
  });

  // The graph behind a chain: every prompt we have heard and every action that led from one to another.
  // START A CHAIN OVER, keeping the route it runs. Clears the mapping calls, the review items, the
  // observations and the recipes that were retired or set aside; the live recipe stays (a re-listen has
  // to walk one) with its evidence emptied and its number reset to 1. Owner-asked, 07-30: the CVS
  // history was made before the system was right, and a page built on bad calls is worse than an empty one.
  app.post("/api/admin/map/chain/:id/reset", async (c) => {
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "chainId required" }, 400);
    return c.json(await resetChainHistory(id));
  });

  app.get("/api/admin/map/graph/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "chainId required" }, 400);
    return c.json(await graphFor(id, Number(c.req.query("storeId") || 0)));
  });

  app.get("/api/admin/map/unknowns", async (c) => c.json({ unknowns: await openUnknowns(Number(c.req.query("limit") || 100)) }));

  // Catch-up: send anything this environment learned while the record was unreachable (production does
  // not carry the map endpoints until the next promote). Safe to run repeatedly.
  app.post("/api/admin/map/reshare", async (c) => c.json(await reshareUnsent()));

  app.post("/api/admin/map/unknown/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const b = (await c.req.json().catch(() => ({}))) as { status?: string; note?: string };
    await resolveUnknown(id, b.status === "dismissed" ? "dismissed" : "resolved", String(b.note || ""));
    return c.json({ ok: true });
  });

  // ---- The record side of the shared map ------------------------------------------------------
  // One set of recipes for both environments (owner 07-26). A follower environment (staging) posts what
  // a mapping call learned HERE, keyed by chain name and store phone — ids are per-database and would
  // cross-wire. Production applies it exactly as if the call had happened here, so the Admin mapping
  // section stays the single source of truth and both environments run the identical recipe.
  app.post("/api/admin/map/ingest", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as {
      chainName?: string; storePhone?: string | null; storeName?: string | null;
      recipe?: MapRecipe; source?: string; call?: EvidenceCall; why?: string;
    };
    const name = String(b.chainName || "").trim();
    if (!name || !b.recipe) return c.json({ error: "chainName and recipe required" }, 400);
    const ch = (await db.select().from(chains).where(eq(chains.name, name)))[0];
    if (!ch) return c.json({ error: `no chain named ${name}` }, 404);
    // Map the store by PHONE — the one key both databases agree on.
    let storeId = 0;
    if (b.storePhone) {
      const st = (await db.select().from(retailers).where(eq(retailers.phone, String(b.storePhone))))[0];
      if (st) storeId = st.id;
    }
    const call = b.call ? { ...b.call, storeId: storeId || undefined } : undefined;
    const res = await proposeVersion({ chainId: ch.id, recipe: b.recipe, source: b.source || "follower", call, why: b.why, local: true });
    return c.json({ ok: true, version: res.version.version, status: res.version.status, confidence: res.version.confidence, activated: res.activated });
  });

  app.post("/api/admin/map/decide", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { chainName?: string; version?: number; decision?: string; by?: string; why?: string };
    const ch = (await db.select().from(chains).where(eq(chains.name, String(b.chainName || "").trim())))[0];
    if (!ch) return c.json({ error: "chain not found" }, 404);
    const all = await versionsFor(ch.id);
    const v = all.find((x) => x.version === Number(b.version));
    if (!v) return c.json({ error: "version not found" }, 404);
    return c.json(b.decision === "reject"
      ? await rejectVersion(v.id, String(b.by || "admin"), String(b.why || ""), true)
      : await approveVersion(v.id, String(b.by || "admin"), true));
  });

  // ---- The sweep: call every chain east → west and prove the route to a person ----------------
  app.post("/api/admin/map/sweep/start", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { maxCalls?: number; only?: number[] };
    return c.json(await startSweep({ maxCalls: Number(b.maxCalls || 0) || undefined, only: Array.isArray(b.only) ? b.only.map(Number) : undefined }));
  });

  app.post("/api/admin/map/sweep/stop", (c) => c.json(stopSweep()));

  app.get("/api/admin/map/sweep", (c) => c.json(sweepStatus()));

  app.get("/api/admin/map/sweep/queue", async (c) => c.json({ queue: await buildQueue() }));

  app.get("/api/admin/agent/models", (c) => c.json(AGENT_MODELS));

  app.post("/api/admin/agent", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { messages?: Array<{ role: "user" | "assistant"; text: string }>; model?: string };
    const history = Array.isArray(body.messages) ? body.messages : [];
    const res = await runAdminAgent(history, body.model);
    return c.json(res);
  });
}

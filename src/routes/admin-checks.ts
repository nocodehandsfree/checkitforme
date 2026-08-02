// The Admin view of checks: test checks, results, the call log and its timing, cost per check,
// starting and hanging up a check by hand, feedback review, and call-data health.

import type { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { client, db } from "../db/client";
import { callEvents, callResults, categories, chains, retailers } from "../db/schema";
import { config } from "../config";
import { getSetting } from "../db/settings";
import { benchTestCall, bridgeCheckCall, placeAdHocCall, provider, resetRotation, triggerCall } from "../calls/service";
import { getPolicy } from "../policy";
import { getReceipt, rollup, rollupFromRow, type Rollup } from "../calls/events";
import { currentRates } from "../calls/receipt-store";
import { costCall, money } from "../calls/cost";
import { agentLinesFrom, behaved } from "../calls/behaved";
import { cachedChains, categoryLabelMap, retailerMap } from "../refcache";
import { debugRecentInbox, isGmailConfigured } from "../gmail-receipts";
import { bridgeRoomForConversation } from "../voice/bridge";
import { isCheckAlive } from "../calls/check-life";
import { classifyCallReality } from "./admin-restock";
import { chainLogoInfo, getStatsSince, hangupTwilioCall, ownerOnlyRetailerIds, page, storeChainName } from "./shared-helpers";

export function register(app: Hono) {
  // ---- THE CALL RECEIPT (owner 07-26) ----------------------------------------------------------
  // Replay one call: what happened, when, how many seconds each piece took, and what it cost. Admin-
  // gated by the /api/* wall. A live call answers from memory (so a call in flight can be watched);
  // a finished one answers from the database. If an engineer cannot explain a runtime decision from
  // this response, the receipt is incomplete.
  app.get("/api/calls/:id/receipt", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "bad call id" }, 400);
    const call = (await db.select().from(callResults).where(eq(callResults.id, id)))[0];
    if (!call) return c.json({ error: "no such call" }, 404);

    // A call still IN FLIGHT is read from memory so it can be watched as it happens. The moment it
    // ends the database is the truth — the in-memory copy lingers for a few minutes but is missing
    // everything written after the line dropped, the verdict most of all.
    const inMemory = call.room ? getReceipt(call.room) : null;
    const live = inMemory && !inMemory.closed ? inMemory : null;
    const rows = live ? [] : await db.select().from(callEvents).where(eq(callEvents.callId, id)).orderBy(callEvents.atMs);
    const timeline = live
      ? live.events.map((e) => ({ atSec: e.atSec, kind: e.kind, note: e.note ?? "", detail: e.detail ?? null }))
      : rows.map((r) => ({ atSec: r.atSec, kind: r.kind, note: r.note ?? "", detail: r.detail ? JSON.parse(r.detail) as unknown : null }));

    // A finished call is served from its own stamped row, so a replay always agrees with the numbers
    // the reports are summing. A null here means we never measured it — not that it was zero.
    // ONE reader for a stamped row (rollupFromRow, in src/calls/events.ts beside the roll-up it has to
    // agree with), so this route and the by-room one can never answer differently about the same call.
    const sums: Rollup = live ? rollup(live) : rollupFromRow(call, timeline);
    const cost = live
      ? costCall({ callSecs: sums.callSecs, charlieSecs: sums.charlieConnectedSeconds, avoidableSecs: sums.charlieSilentSeconds, forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))] }, await currentRates())
      : { lineUsd: call.costLineUsd ?? 0, forkUsd: call.costForkUsd ?? 0, charlieUsd: call.costCharlieUsd ?? 0, clipsUsd: call.costClipsUsd ?? 0, totalUsd: call.costTotalUsd ?? 0, billedMinutes: sums.billedMinutes, charlieSecs: sums.charlieConnectedSeconds, avoidableUsd: call.costAvoidableUsd ?? 0 };

    return c.json({
      call: {
        id: call.id, room: call.room, status: call.status, statusKey: call.statusKey,
        retailerId: call.retailerId, categoryId: call.categoryId, summary: call.summary,
        transcript: call.transcript, startedAt: call.startedAt, completedAt: call.completedAt,
        // Provenance: the provider's own id (so a bill can be checked against this call), which menu
        // version ran, which check this retries, and which build served it.
        providerCallId: call.providerCallId ?? null,
        mapVersion: call.mapVersion ?? null, attemptOf: call.attemptOf ?? null,
        engineVersion: call.engineVersion ?? null,
      },
      live: !!live,
      // Did the receipt ever price this check? A row from before the new engine has no cost at all,
      // and reporting its cost as nought reads as "this call was free" instead of "we never recorded
      // it". The replay uses this to show the timeline and say so, rather than print a row of noughts.
      stamped: live ? true : call.costTotalUsd != null,
      seconds: sums,
      cost: { ...cost, readable: { total: money(cost.totalUsd), charlie: money(cost.charlieUsd), line: money(cost.lineUsd), wasted: money(cost.avoidableUsd) } },
      timeline,
    });
  });

  // Diagnostic: read the ingest inbox + show the parser's verdict per email (incl. rejects) so we can see
  // why a receipt did/didn't land. Read-only, gated by the /api/* admin auth. hours=1..168 (default 72).
  app.get("/api/admin/receipts/inbox-debug", async (c) => {
    const hours = Math.min(168, Math.max(1, Number(c.req.query("hours")) || 72));
    try { return c.json({ ok: true, configured: isGmailConfigured(), rows: await debugRecentInbox(hours * 3600_000) }); }
    catch (e) { return c.json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
  });

  // NOTE: there is deliberately NO staging→prod data promote. PROD is the source of truth for live
  // business data (calls, customers, reports); the Admin manages it directly. CONFIG/feature work flows
  // staging→prod via CODE branches, and staging is refreshed FROM prod (table-dump→table-load, above) —
  // one-way, prod→staging only. We never write staging's data over prod (that once cascade-wiped call
  // history). See STAGING doc, git history "Data direction".

  // RECOVERY: rebuild call_results from ElevenLabs conversation history (the source of truth for what was
  // actually said on each call). Insert-only + idempotent by providerCallId, so it's safe to re-run and
  // can never delete. Maps each call's store/category from the dynamic vars it was placed with, and
  // classifies the verdict from the transcript via the same path live ingest uses. ?dry=1 to preview.
  app.post("/api/admin/restore-calls-from-el", async (c) => {
    const key = config.voice.apiKey, agentId = config.voice.agentId;
    if (!key || !agentId) return c.json({ error: "elevenlabs not configured" }, 503);
    const dry = c.req.query("dry") === "1";
    const fallbackRetailer = Number(c.req.query("fallback")) || null; // unmatched (e.g. Fun test calls) → this store
    const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ""); // punctuation/space-insensitive
    const retByName = new Map<string, number>();
    const retByNorm = new Map<string, number>();
    for (const r of await db.select({ id: retailers.id, name: retailers.name }).from(retailers))
      if (r.name) { retByName.set(r.name.trim().toLowerCase(), r.id); retByNorm.set(normName(r.name), r.id); }
    const catByLabel = new Map<string, number>();
    for (const cat of await db.select({ id: categories.id, label: categories.label }).from(categories))
      catByLabel.set((cat.label || "").trim().toLowerCase(), cat.id);
    const existing = new Set((await db.select({ p: callResults.providerCallId }).from(callResults)).map((r) => r.p).filter(Boolean));
    let cursor = "", restored = 0, scanned = 0, skipped = 0, unmatched = 0;
    for (let page = 0; page < 60; page++) {
      const lr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: { "xi-api-key": key } });
      if (!lr.ok) break;
      const lj = await lr.json() as { conversations?: Array<Record<string, unknown>>; has_more?: boolean; next_cursor?: string };
      for (const conv of (lj.conversations || [])) {
        scanned++;
        const cid = String(conv.conversation_id || "");
        const status = String(conv.status || "");
        if (!cid || existing.has(cid) || (status !== "done" && status !== "completed")) { skipped++; continue; }
        // A LIVE CHECK MUST NEVER BE RESTORED OVER (08-01 audit, family 1). Mid-call the row still
        // carries our own name for the check, not the provider's, so the conversation id is not in
        // `existing` yet — and this inserted a finished duplicate row straight off the provider while
        // the phone was up. A held Charlie's session reads "done" over there, which is how a restore
        // running during a hold would double a check the customer is still watching.
        if (bridgeRoomForConversation(cid) || (await isCheckAlive(cid))) { skipped++; continue; }
        // …and re-check the database right before writing: a check that connected mid-restore has had
        // its row repointed at this conversation since `existing` was built.
        if ((await db.select({ id: callResults.id }).from(callResults).where(eq(callResults.providerCallId, cid)))[0]) { skipped++; existing.add(cid); continue; }
        const dr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${cid}`, { headers: { "xi-api-key": key } });
        if (!dr.ok) { skipped++; continue; }
        const d = await dr.json() as { conversation_initiation_client_data?: { dynamic_variables?: Record<string, string> }; metadata?: { start_time_unix_secs?: number; call_duration_secs?: number } };
        const dv = d.conversation_initiation_client_data?.dynamic_variables || {};
        const rn = String(dv.retailer_name || "").trim();
        let retailerId = retByName.get(rn.toLowerCase()) ?? retByNorm.get(normName(rn)) ?? null; // exact → normalized
        if (retailerId == null) { unmatched++; retailerId = fallbackRetailer; } // leftover (Fun tests) → fallback store
        if (retailerId == null) { skipped++; continue; } // no store + no fallback → can't insert (retailer_id required)
        const categoryId = catByLabel.get(String(dv.category || "").trim().toLowerCase()) ?? null;
        const startedAt = Number(conv.start_time_unix_secs) || d.metadata?.start_time_unix_secs || null;
        const callSeconds = (conv.call_duration_secs as number) ?? d.metadata?.call_duration_secs ?? null;
        const o = await provider.getConversation(cid); // CallOutcome: verdict + transcript + summary
        if (dry) { restored++; existing.add(cid); continue; }
        await db.insert(callResults).values({
          retailerId, categoryId: categoryId ?? undefined, mode: "restock",
          status: o?.status ?? "completed", confirmed: o?.confirmed ?? null, statusKey: o?.statusKey ?? null,
          summary: o?.summary ?? null, transcript: o?.transcript ?? null, providerCallId: cid,
          startedAt: startedAt ?? undefined, completedAt: startedAt && callSeconds ? startedAt + callSeconds : startedAt ?? undefined,
          callSeconds: callSeconds ?? null, navSeconds: o?.navSecs ?? null, isPrivate: false,
        } as never).catch((e) => console.error("restore insert", cid, e));
        existing.add(cid); restored++;
      }
      if (!lj.has_more || !lj.next_cursor) break;
      cursor = lj.next_cursor;
    }
    return c.json({ restored, scanned, skipped, unmatchedStore: unmatched, dry });
  });

  // Admin: recent feedback joined with what we showed + the transcript — the review/training surface.
  app.get("/api/feedback", async (c) => {
    const stores = await retailerMap();
    const r = await client.execute(
      `SELECT f.id, f.cid, f.user_verdict, f.shown_status, f.created_at, f.reviewed, r.confirmed, r.status_key, r.transcript, r.summary, r.retailer_id
     FROM call_feedback f LEFT JOIN call_results r ON r.provider_call_id = f.cid
     ORDER BY f.created_at DESC LIMIT 200`);
    // Flag the disagreements (where the human verdict contradicts what we showed) — the cases to learn from.
    const rows = r.rows.map((x: Record<string, unknown>) => {
      const uv = x.user_verdict, conf = x.confirmed == null ? null : Number(x.confirmed), shownIn = conf === 1, shownOut = conf === 0;
      const disagree = (uv === "in" && !shownIn) || (uv === "out" && !shownOut);
      const rid = x.retailer_id == null ? null : Number(x.retailer_id);
      const store = rid != null ? (stores.get(rid)?.name?.split("—")[0].trim() ?? null) : null;
      return { ...x, store, reviewed: Number(x.reviewed || 0) === 1, disagree };
    });
    return c.json(rows);
  });

  // Triage a poll response: mark it reviewed, and optionally CORRECT our verdict on the underlying call so
  // the record (and the training signal we learn from) reflects what the customer actually saw. id = call_feedback row.
  app.post("/api/feedback/:id/review", async (c) => {
    const id = Number(c.req.param("id")); if (!id) return c.json({ error: "id required" }, 400);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    await client.execute({ sql: "UPDATE call_feedback SET reviewed = 1 WHERE id = ?", args: [id] });
    const correct = String(b.correct ?? "");
    if (correct === "in" || correct === "out") {
      const fb = (await client.execute({ sql: "SELECT cid FROM call_feedback WHERE id = ?", args: [id] })).rows[0];
      const cid = fb ? String(fb.cid) : "";
      if (cid) await client.execute({ sql: "UPDATE call_results SET confirmed = ?, status_key = ? WHERE provider_call_id = ?", args: [correct === "in" ? 1 : 0, correct === "in" ? "in_stock" : "sold_out", cid] });
    }
    return c.json({ ok: true });
  });

  // ---- Call-data integrity: the unfiltered truth about call_results, for the Call-data-health panel ----
  // Full, unfiltered view of every row so the owner can see what's real vs. seed/rehearsal/never-dialed.
  // A call that actually dialed a store has a providerCallId (an ElevenLabs conversation); seed/manual
  // rows don't, and the owner-only "Fun" store is rehearsal — so firstDialedCall is the true first call.
  app.get("/api/admin/calls-audit", async (c) => {
    const ownerOnly = await ownerOnlyRetailerIds();
    const stores = await retailerMap();
    const rows = await db.select({
      id: callResults.id, retailerId: callResults.retailerId, status: callResults.status,
      statusKey: callResults.statusKey, confirmed: callResults.confirmed, providerCallId: callResults.providerCallId,
      startedAt: callResults.startedAt, completedAt: callResults.completedAt,
    }).from(callResults);
    const tally = (f: (r: (typeof rows)[number]) => string | null | undefined) => {
      const t: Record<string, number> = {};
      for (const r of rows) { const k = String(f(r) ?? "—"); t[k] = (t[k] || 0) + 1; }
      return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
    };
    const withTs = rows.filter((r) => r.startedAt).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const dialed = withTs.filter((r) => r.providerCallId && !ownerOnly.has(r.retailerId));
    const desc = (r?: (typeof rows)[number]) => (r ? {
      id: r.id, store: stores.get(r.retailerId)?.name?.split("—")[0].trim() || `#${r.retailerId}`,
      at: r.startedAt, status: r.status, statusKey: r.statusKey, confirmed: r.confirmed, hasProviderCall: !!r.providerCallId,
    } : null);
    const cidCounts: Record<string, number> = {};
    for (const r of rows) if (r.providerCallId) cidCounts[r.providerCallId] = (cidCounts[r.providerCallId] || 0) + 1;
    return c.json({
      total: rows.length,
      ownerOnlyTest: rows.filter((r) => ownerOnly.has(r.retailerId)).length, // "Fun"/rehearsal store calls
      neverDialed: rows.filter((r) => !r.providerCallId).length,             // no EL conversation → never reached a store
      adminHangup: rows.filter((r) => r.status === "admin_hangup").length,   // aborted from the dashboard
      confirmedInStock: rows.filter((r) => r.confirmed === true).length,
      duplicateProviderCalls: Object.values(cidCounts).filter((n) => n > 1).length, // double-ingested = integrity red flag
      byStatus: tally((r) => r.status),
      byStatusKey: tally((r) => r.statusKey),
      firstCall: desc(withTs[0]),                 // earliest row of any kind (may be a seed/manual row)
      firstDialedCall: desc(dialed[0]),           // the true first REAL call into a store
      lastCall: desc(withTs[withTs.length - 1]),
    });
  });

  // Remove un-provable call rows (no ElevenLabs conversation, or never reached a true outcome). Dry-run by
  // default (?dry=0 to actually delete); billed calls are protected and everything is restorable from
  // ElevenLabs. Admin-token gated. The Call-data-health panel calls this dry-run only (preview, no delete).
  app.post("/api/admin/purge-undefined-calls", async (c) => {
    const dry = c.req.query("dry") !== "0";
    const includeOwner = c.req.query("includeOwner") === "1"; // also drop "Fun" rehearsal calls if asked
    const ownerOnly = await ownerOnlyRetailerIds();
    const rows = await db.select({
      id: callResults.id, status: callResults.status, providerCallId: callResults.providerCallId,
      chargedAt: callResults.chargedAt, retailerId: callResults.retailerId,
    }).from(callResults);
    const TRUE_STATUS = new Set(["completed", "no_answer"]); // a placed call that reached a real outcome
    const reasonFor = (r: (typeof rows)[number]): string | null => {
      if (r.chargedAt) return null;                                  // billed → never delete (protected)
      if (!r.providerCallId) return "never_placed";                  // no EL conversation → can't prove we called
      if (!TRUE_STATUS.has(r.status)) return "no_true_status";       // admin_hangup / failed / queued / dialing…
      if (includeOwner && ownerOnly.has(r.retailerId)) return "owner_test"; // optional: drop Fun rehearsal calls
      return null;                                                   // keep
    };
    const doomed = rows.map((r) => ({ r, reason: reasonFor(r) })).filter((x) => x.reason) as Array<{ r: (typeof rows)[number]; reason: string }>;
    const byReason: Record<string, number> = {};
    for (const x of doomed) byReason[x.reason] = (byReason[x.reason] || 0) + 1;
    let deleted = 0;
    if (!dry && doomed.length) {
      const ids = doomed.map((x) => x.r.id);
      for (let i = 0; i < ids.length; i += 200) await db.delete(callResults).where(inArray(callResults.id, ids.slice(i, i + 200)));
      deleted = ids.length;
    }
    return c.json({
      dry, total: rows.length, flagged: doomed.length, keptDefinitive: rows.length - doomed.length,
      byReason, deleted,
      rule: "keep only providerCallId + status in {completed,no_answer}; billed calls protected; restorable from ElevenLabs",
    });
  });

  // Which stores / chains each workflow is assigned to — by NAME, so the Workflows cards can show
  // "Branson Test → Fun" instead of just a count.
  app.get("/api/admin/workflow-assignments", async (c) => {
    const [storeS, chainS] = await Promise.all([getSetting("vt_store_workflows"), getSetting("vt_chain_workflows")]);
    const parse = (s: string | null): Record<string, string> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
    const byStore = parse(storeS), byChain = parse(chainS);
    const storeIds = Object.keys(byStore).map(Number).filter((n) => !isNaN(n));
    const chainIds = Object.keys(byChain).map(Number).filter((n) => !isNaN(n));
    const storeRows = storeIds.length ? await db.select({ id: retailers.id, name: retailers.name, location: retailers.location }).from(retailers).where(inArray(retailers.id, storeIds)) : [];
    const chainRows = chainIds.length ? await db.select({ id: chains.id, name: chains.name }).from(chains).where(inArray(chains.id, chainIds)) : [];
    const sName = new Map(storeRows.map((r) => [r.id, r])), cName = new Map(chainRows.map((r) => [r.id, r]));
    const out: Record<string, { stores: Array<{ id: number; name: string; location: string | null }>; chains: Array<{ id: number; name: string }> }> = {};
    const slot = (wf: string) => (out[wf] ??= { stores: [], chains: [] });
    for (const [id, wf] of Object.entries(byStore)) { const r = sName.get(Number(id)); if (r) slot(wf).stores.push({ id: r.id, name: r.name.split("—")[0].trim(), location: r.location ?? null }); }
    for (const [id, wf] of Object.entries(byChain)) { const r = cName.get(Number(id)); if (r) slot(wf).chains.push({ id: r.id, name: r.name }); }
    return c.json(out);
  });

  // Reset a workflow's opener rotation so the NEXT call to it starts at opener #1 (predictable A→B→C
  // testing). No workflow name → resets the shared global opener rotation.
  app.post("/api/admin/reset-rotation", async (c) => {
    const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const wf = typeof b.workflow === "string" && b.workflow.trim() ? b.workflow.trim() : "";
    // Reset the workflow's own counters (bridge / listen-live path) AND the global ones (scheduled path),
    // so the next call starts at opener #1 AND voice #1 no matter which path places it. Delta shares the
    // same opener/voice counters and adds one per line slot (fu:<wf>:<slot>) — reset those too.
    const FU_SLOTS = ["set", "type", "no", "wrap", "wrapNo", "clarify", "hello", "escalate"];
    const keys = wf ? ["opener:" + wf, "opener", "voice:" + wf, "voice", ...FU_SLOTS.map((s) => `fu:${wf}:${s}`)] : ["opener", "voice"];
    keys.forEach(resetRotation);
    return c.json({ ok: true, keys, workflow: wf || null });
  });

  // Testing log — owner-only / "Fun" rehearsal stores ONLY (never the real-store stats). Per-call: the
  // workflow applied, the opener actually used (pulled from the transcript + matched to its rotation slot),
  // the call status, and the nav / talk / total timing. The owner's working log while messing with the agent.
  app.get("/api/admin/test-calls", async (c) => {
    const ownerOnly = await ownerOnlyRetailerIds();
    const stores = await retailerMap();
    const cats = await categoryLabelMap();
    const [storeS, chainS, defS, libS] = await Promise.all([
      getSetting("vt_store_workflows"), getSetting("vt_chain_workflows"), getSetting("vt_default_workflow"), getSetting("vt_workflows"),
    ]);
    const parseObj = (s: string | null): Record<string, string> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
    const byStore = parseObj(storeS), byChain = parseObj(chainS);
    let lib: Array<{ name: string; openers?: string[] }> = []; try { lib = libS ? JSON.parse(libS) : []; } catch { lib = []; }
    const wfFor = (rid: number) => {
      const s = stores.get(rid);
      const name = byStore[String(rid)] || (s && s.chainId != null ? byChain[String(s.chainId)] : "") || (defS || "");
      return name ? (lib.find((w) => w && w.name === name) || null) : null;
    };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const firstAgentLine = (t: string) => {
      const segs = String(t || "").split(/(?=(?:Clerk|Agent):\s)/);
      const a = segs.find((s) => /^Agent:/.test(s.trim()));
      return a ? a.replace(/^Agent:\s*/, "").trim() : "";
    };
    // Match the spoken opener back to a workflow rotation slot (A/B/C…) by word overlap.
    const matchOpener = (transcript: string | null, wf: ReturnType<typeof wfFor>, cat: string) => {
      const line = firstAgentLine(transcript || "");
      const openers = wf?.openers || [];
      if (!line || !openers.length) return { label: null as string | null, said: line || null, template: null as string | null };
      const nl = norm(line);
      let best = -1, bestScore = 0;
      openers.forEach((o, i) => {
        const ow = norm(String(o).replace(/\{category\}/g, cat)).split(" ").filter((w) => w.length > 2);
        const hit = ow.filter((w) => nl.includes(w)).length;
        const score = ow.length ? hit / ow.length : 0;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      const label = best >= 0 && bestScore >= 0.5 ? String.fromCharCode(65 + best) : null;
      return { label, said: line, template: best >= 0 ? openers[best] : null };
    };
    // Log rows carry the SAME logo fields every other store list on the dashboard uses, so the tile is
    // never a name guess (docs/data/store-logos.md).
    const chainRows = await cachedChains();
    const chainNames = new Map(chainRows.map((ch) => [ch.id, ch.name]));
    const chainTypes = new Map(chainRows.map((ch) => [ch.id, ch.type]));
    // WHAT COUNTS AS A TEST CHECK (owner 07-30). He places every one of them from the website, and he
    // needs to see the store he actually tested — a CVS check has to land here, not just the Fun store.
    //
    // THREE WAYS IN, AND THE THIRD IS WHY THIS WORKS ON PRODUCTION TOO:
    //   • on STAGING, everything: nobody but him is on it, so every check there is a test by definition
    //   • an owner-only store (Fun, MVPs) on either environment
    //   • a check HE placed himself, by his own account, on either environment
    // A real customer's check must never wander onto this screen, which is exactly what the third rule
    // keeps out: it is his account or it does not list.
    const master = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
    const all = (await db.select().from(callResults))
      .filter((r) => config.staging.on || ownerOnly.has(r.retailerId) || r.finderUserId === master)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const rows = all.map((r) => {
      const wf = wfFor(r.retailerId);
      const cat = cats.get(r.categoryId) || "";
      const nav = r.navSeconds, call = r.callSeconds;
      const st = stores.get(r.retailerId);
      const nm = st?.name || `#${r.retailerId}`;
      const l = chainLogoInfo((st?.chainId && chainNames.get(st.chainId)) || storeChainName(nm));
      return {
        id: r.id, started: r.startedAt,
        store: nm.split("—")[0].trim() || `#${r.retailerId}`,
        // BOTH, not one merged field: the verdict renderer reads `statusKey` against the owner's
        // statuses registry FIRST, and a merged value made an in-stock check read as nobody answered.
        category: cat, status: r.statusKey || r.status, statusKey: r.statusKey || null, confirmed: r.confirmed,
        workflow: wf?.name || null, opener: matchOpener(r.transcript, wf, cat),
        navSec: nav ?? null, callSec: call ?? null,
        talkSec: call != null && nav != null ? Math.max(0, call - nav) : null,
        summary: r.summary || null,
        // The join key back to the receipt, so a row opens the SAME sheet the Calls page opens.
        room: r.room || null,
        // The route that really ran, and what the check really cost. A row with no stamped total was
        // written before this engine priced anything, so it says nothing rather than "free".
        lane: r.lane || null,
        cost: r.costTotalUsd != null ? money(r.costTotalUsd) : null,
        chainId: st?.chainId ?? null, storeType: (st?.chainId && chainTypes.get(st.chainId)) || "Other",
        logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct,
      };
    });
    const timed = rows.filter((r) => r.callSec != null);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
    return c.json({
      count: rows.length,
      summary: {
        calls: timed.length,
        avgNavSec: avg(timed.map((r) => r.navSec || 0)),
        avgTalkSec: avg(timed.filter((r) => r.talkSec != null).map((r) => r.talkSec as number)),
        avgCallSec: avg(timed.map((r) => r.callSec as number)),
      },
      rows,
    });
  });

  // The receipt for a call the ADMIN placed. Those calls have no call_results row on purpose (a mapping
  // call is not a customer's check and must stay out of the customer numbers), so they are read by ROOM
  // instead of by call id. Live from memory while the call is still up, from call_events once it ends.
  // Echo's point, 07-27: the call happened and nothing was written down. Now it is.
  app.get("/api/admin/receipt/:room", async (c) => {
    const room = c.req.param("room");
    if (!room) return c.json({ error: "room required" }, 400);
    // Same envelope as GET /api/calls/:id/receipt — { live, seconds, cost, timeline } — so the replay
    // viewer reads one shape and never branches on which kind of call it opened.
    // The money is spelled out HERE, by the cost module, exactly as GET /api/calls/:id/receipt does it.
    // The costs are microdollars, and a page that formatted them itself printed a five-cent call as
    // 5,282,200¢. One printer, one envelope, no second formatter anywhere.
    // `menu` is the walk to a person — the carrier leg plus the listening fork — which is the half of
    // the money the owner reads first, against Charlie's seconds. Two buckets, nothing else.
    const readable = (cost: { totalUsd: number; charlieUsd: number; lineUsd: number; forkUsd?: number; avoidableUsd: number }) =>
      ({ total: money(cost.totalUsd), charlie: money(cost.charlieUsd), line: money(cost.lineUsd),
         menu: money(cost.lineUsd + (cost.forkUsd ?? 0)), wasted: money(cost.avoidableUsd) });
    const live = getReceipt(room);
    if (live && !live.closed) {
      const sums = rollup(live);
      const cost = costCall({ callSecs: sums.callSecs, charlieSecs: sums.charlieConnectedSeconds, avoidableSecs: sums.charlieSilentSeconds, forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))] }, await currentRates());
      const timeline = live.events.map((e) => ({ atSec: e.atSec, kind: e.kind, note: e.note ?? "", detail: e.detail ?? null }));
      return c.json({
        room, live: true, stamped: true,
        timeline,
        seconds: sums,
        cost: { ...cost, readable: readable(cost) },
        // The pass/fail rows, off the record this envelope already carries — no second route and no new
        // listening (src/calls/behaved.ts). A LIVE check knows WHEN each line was said, and the
        // wrong-department rows need that: "did he ask the person who just picked up" is a question
        // about order in time. A finished row has a flat transcript and falls back to the line order.
        behaved: behaved({
          timeline, rollup: sums,
          agentLines: live.transcript.filter((l) => l.who === "Agent")
            .map((l) => ({ text: l.text, atSec: Math.round(l.atMs / 1000) })),
        }),
      });
    }
    const rows = await db.select().from(callEvents).where(eq(callEvents.room, room)).orderBy(callEvents.atMs);
    if (!rows.length) return c.json({ error: "no receipt for that call" }, 404);
    const parse = (s: string | null) => { try { return s ? JSON.parse(s) as Record<string, unknown> : null; } catch { return null; } };
    const timeline = rows.map((r) => ({ atSec: r.atSec, kind: r.kind, note: r.note ?? "", detail: parse(r.detail) }));
    // An UNATTACHED call rolls its seconds and cost onto the LAST event's detail (receipt-store.ts),
    // because there is no call_results row to stamp and the event set is a closed sixteen.
    const tail = parse(rows[rows.length - 1]?.detail ?? null);
    let seconds = (tail?.seconds ?? null) as Rollup | null;
    let cost = (tail?.cost ?? null) as { totalUsd: number; charlieUsd: number; lineUsd: number; forkUsd?: number; avoidableUsd: number } | null;
    // …but an ATTACHED call stamps them on the ROW instead, and this route only ever looked at the
    // tail — so the same finished call came back complete by call id and with the seconds and the cost
    // NULL by room. One envelope, two answers (owner 07-28). Now the row is the second place we look,
    // read by the SAME function the by-id route uses, so the two cannot drift apart again.
    // The row is ALSO where the words live, and the four behaved rows need them, so it is read once
    // here rather than conditionally inside the fallback.
    const callId = rows.find((r) => r.callId != null)?.callId ?? null;
    const attached = (await db.select().from(callResults)
      .where(callId != null ? eq(callResults.id, callId) : eq(callResults.room, room)).limit(1))[0];
    if (!seconds || !cost) {
      if (attached) {
        if (!seconds) seconds = rollupFromRow(attached, timeline);
        // A cost of nought is not a cost: the carrier bills a whole minute the moment we dial, so a row
        // with no total was written before this engine priced anything. Say nothing rather than free.
        if (!cost && attached.costTotalUsd != null) cost = {
          totalUsd: attached.costTotalUsd, charlieUsd: attached.costCharlieUsd ?? 0,
          lineUsd: attached.costLineUsd ?? 0, forkUsd: attached.costForkUsd ?? 0,
          avoidableUsd: attached.costAvoidableUsd ?? 0,
        };
      }
    }
    return c.json({
      room, live: false,
      timeline,
      seconds,
      // Same flag the by-id route sends, so the one viewer can tell "never written down" from "free".
      stamped: !!cost,
      cost: cost ? { ...cost, readable: readable(cost) } : null,
      behaved: behaved({ timeline, rollup: seconds, agentLines: agentLinesFrom(attached?.transcript) }),
    });
  });

  app.get("/api/admin/call-timing", async (c) => {
    const ownerOnly = await ownerOnlyRetailerIds(); // owner-only "Fun"/MVP store excluded from timings
    const stores = await retailerMap();
    const chRows = await db.select({ id: chains.id, navType: chains.navType, navSeconds: chains.navSeconds, navStatus: chains.navStatus }).from(chains);
    const chainById = new Map(chRows.map((c) => [c.id, c]));
    const chainOf = (rid: number) => { const r = stores.get(rid); return r && r.chainId != null ? chainById.get(r.chainId) : null; };
    // time-to-human = the chain's LOCKED nav recipe (phone-tree + hold before a person). REAL talk =
    // callSeconds − this, counted only for calls that reached a person. Falls back to per-call nav.
    const tthOf = (rid: number) => { const ch = chainOf(rid); return (ch && ch.navStatus === "locked" && ch.navSeconds != null) ? ch.navSeconds : null; };
    const all = await db.select().from(callResults);
    const statsSince = await getStatsSince();
    const rows = all.filter((r) => r.callSeconds != null && r.status !== "admin_hangup" && !ownerOnly.has(r.retailerId) && (r.startedAt || 0) >= statsSince);
    // Reached a human (transcript-classified) — ring / voicemail / IVR-only calls have NO human-talk.
    const reachedIds = new Set(rows.filter((r) => classifyCallReality(r.transcript) !== "never_reached").map((r) => r.id));
    const reached = rows.filter((r) => reachedIds.has(r.id));
    const r0 = (n: unknown) => Math.round(Number(n || 0));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const navOf = (r: (typeof rows)[number]) => tthOf(r.retailerId) ?? r.navSeconds ?? 0;
    const talkOf = (r: (typeof rows)[number]) => Math.max(0, (r.callSeconds || 0) - navOf(r));
    const aggregate = {
      calls: rows.length, reached: reached.length,
      avgCallSec: r0(avg(rows.map((r) => r.callSeconds || 0))),
      avgNavSec: r0(avg(reached.map((r) => navOf(r)))),
      avgTalkSec: r0(avg(reached.map((r) => talkOf(r)))),
      totalMinutes: r0(rows.reduce((s, r) => s + (r.callSeconds || 0), 0) / 60),
    };
    // By MODEL — Charlie (direct), Alpha (keypad tree), Bravo (voice tree) — by the chain's nav type, over reached calls.
    const modelOf = (nt: string | null | undefined) => (nt === "direct" ? "Charlie" : nt === "keypad" ? "Alpha" : nt === "voice" ? "Bravo" : "Unknown");
    const typeOf = (m: string) => (m === "Charlie" ? "direct" : m === "Alpha" ? "tone tree" : m === "Bravo" ? "voice tree" : "unmapped");
    const mAgg = new Map<string, { call: number[]; nav: number[]; talk: number[] }>();
    for (const r of reached) {
      const m = modelOf(chainOf(r.retailerId)?.navType);
      const cur = mAgg.get(m) ?? { call: [], nav: [], talk: [] };
      cur.call.push(r.callSeconds || 0); cur.nav.push(navOf(r)); cur.talk.push(talkOf(r));
      mAgg.set(m, cur);
    }
    const byModel = ["Charlie", "Alpha", "Bravo", "Unknown"].filter((m) => mAgg.has(m)).map((m) => {
      const v = mAgg.get(m)!; return { model: m, type: typeOf(m), n: v.call.length, avgCallSec: r0(avg(v.call)), avgNavSec: r0(avg(v.nav)), avgTalkSec: r0(avg(v.talk)) };
    });
    // Talk per verdict (statusKey → status), over reached calls.
    const sAgg = new Map<string, { call: number[]; talk: number[] }>();
    for (const r of reached) {
      const k = String(r.statusKey ?? r.status ?? "unknown");
      const cur = sAgg.get(k) ?? { call: [], talk: [] };
      cur.call.push(r.callSeconds || 0); cur.talk.push(talkOf(r));
      sAgg.set(k, cur);
    }
    const byStatus = [...sAgg.entries()].map(([key, v]) => ({ key, n: v.call.length, avgTalkSec: r0(avg(v.talk)), avgCallSec: r0(avg(v.call)) })).sort((a, b) => b.n - a.n);
    // Per store: connected time over ALL its timed calls (cost), but talk/nav only over the ones that reached a human.
    const stAgg = new Map<number, { call: number[]; navR: number[]; talkR: number[] }>();
    for (const r of rows) {
      const cur = stAgg.get(r.retailerId) ?? { call: [], navR: [], talkR: [] };
      cur.call.push(r.callSeconds || 0);
      if (reachedIds.has(r.id)) { cur.navR.push(navOf(r)); cur.talkR.push(talkOf(r)); }
      stAgg.set(r.retailerId, cur);
    }
    const byStore = [...stAgg.entries()].map(([rid, v]) => ({
      name: stores.get(rid)?.name?.split("—")[0].trim() || `#${rid}`, n: v.call.length,
      avgCallSec: r0(avg(v.call)), avgNavSec: r0(avg(v.navR)), avgTalkSec: r0(avg(v.talkR)),
      totalMin: r0(v.call.reduce((s, x) => s + x, 0) / 60),
    })).sort((a, b) => b.n - a.n).slice(0, 12);
    return c.json({ aggregate, byModel, byStatus, byStore, statsSince });
  });

  // ---- Results ----
  app.get("/api/results", async (c) => {
    // Paginated + lean: return only the page's rows, and look up only the retailers/chains those rows
    // reference. (The old version pulled ALL ~100k retailers on every call — that was the slow part.)
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 10), 1), 200);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    const rows = await db.select().from(callResults).orderBy(desc(callResults.startedAt)).limit(limit).offset(offset);
    const total = Number((await db.select({ n: sql<number>`count(*)` }).from(callResults))[0]?.n || 0);
    const rids = [...new Set(rows.map((r) => r.retailerId).filter((x): x is number => !!x))];
    const rMap = new Map((rids.length ? await db.select().from(retailers).where(inArray(retailers.id, rids)) : []).map((r) => [r.id, r]));
    const names = new Map((await db.select().from(chains)).map((x) => [x.id, x.name]));
    const cMap = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
    return c.json({ total, offset, limit, rows: rows.map((r) => {
      const ret = rMap.get(r.retailerId);
      // Same chain-logo resolution as every other surface, so the Calls feed shows the store's mark.
      const l = chainLogoInfo(ret ? ((ret.chainId && names.get(ret.chainId)) || storeChainName(ret.name)) : null);
      return { ...r, retailer: ret?.name, category: cMap.get(r.categoryId), logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct };
    }) });
  });

  // ---- Actions ----
  app.post("/api/call-now", async (c) => {
    const b = await c.req.json();
    try {
      // An admin-placed check IS the owner placing it. Attribute it to the master website account so it
      // lands in their checks history (and the in-stock banner) exactly like a website call, kept private
      // so it doesn't post to the public finds feed. force = skip the 24h dedup — the owner taps "check
      // again" deliberately and expects a real call every time. (triggerCall throws store_closed for a
      // closed store, which the handler surfaces as {error} below.)
      const finderUserId = b.finderUserId ?? ("phone:" + (process.env.OWNER_PHONE || "+13106662331"));
      // Cheap lane when flagged (bridgeCheckCall falls back to the direct path for carry/overrides).
      const place = (await getPolicy()).flags.cheapBridgeAll ? bridgeCheckCall : triggerCall;
      return c.json(await place({ isPrivate: true, ...b, finderUserId, force: true }));
    } catch (e) {
      return c.json({ error: String((e as Error)?.message || e) }, 400);
    }
  });

  // Admin "Stop & hang up" for a direct (non-bridge) call placed from Store Search. End the Twilio leg
  // and stamp the row admin_hangup (confirmed=null) so it's never mislabeled "nobody answered" — mirrors
  // /pub/bridge-hangup for the call-now path.
  app.post("/api/hangup", async (c) => {
    const { cid, callSid } = await c.req.json().catch(() => ({}));
    if (callSid) await hangupTwilioCall(callSid);
    if (cid) {
      await db.update(callResults)
        .set({ status: "admin_hangup", statusKey: "admin_hangup", confirmed: null, completedAt: Math.floor(Date.now() / 1000) })
        // Mark the cancel UNLESS a real verdict already landed ('completed') — so an admin cancel during
        // ringing isn't left as "Nobody answered" if it rang out before the stamp.
        .where(and(eq(callResults.providerCallId, cid), sql`coalesce(${callResults.status},'') != 'completed'`))
        .catch((e) => console.error("admin_hangup stamp:", e));
    }
    return c.json({ ok: true });
  });

  // Labs: call any number with a chosen agent (restock | carry | open).
  app.post("/api/talk", async (c) => {
    const { phone, mode, personality, name, voiceId } = await c.req.json();
    if (!phone) return c.json({ error: "phone required" }, 400);
    return c.json(await placeAdHocCall(phone, mode ?? "open", personality ?? "professional", name ?? "", voiceId || undefined));
  });

  // Labs simulator: call YOUR number as if you're a store; result records against that store (so it can flip green).
  app.post("/api/simulate", async (c) => {
    const { retailerId, categoryId, mode, toNumber, specificProduct } = await c.req.json();
    if (!retailerId || !categoryId || !toNumber) return c.json({ error: "retailerId, categoryId, toNumber required" }, 400);
    return c.json(await triggerCall({ retailerId, categoryId, mode, toOverride: toNumber, specificProduct }));
  });

  // Test Bench self-call: bench agent (live brain + draft voice) calls YOUR phone with the
  // chosen store's full context; result records against the store like the old simulator.
  app.post("/api/bench/call", async (c) => {
    const b = await c.req.json();
    if (!b.retailerId || !b.categoryId || !b.toNumber) return c.json({ error: "retailerId, categoryId, toNumber required" }, 400);
    try { return c.json(await benchTestCall(b)); } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  // Fetch a call's transcript by conversation id (for reading test-call transcripts in Labs).
  app.get("/api/conversation/:cid", async (c) => {
    const o = await provider.getConversation(c.req.param("cid"));
    return c.json(o ?? { status: "in_progress", transcript: "", summary: "" });
  });
}

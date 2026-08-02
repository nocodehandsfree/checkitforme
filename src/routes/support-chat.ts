// The support chat: the customer side (chat, search, FAQ, banner, tickets) and the Admin side
// (the review queue, chat history, credits spent, stats).

import type { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, supportConversations, supportMessages, supportTickets } from "../db/schema";
import { SUPPORT_CATEGORIES, SUPPORT_MODELS, answerSupport, resolveConversation, type SupportCategory, warmClose } from "../support/ladder";
import { submitTicket } from "../support/tickets";
import { addQa, getFaq, reindexBook, searchBook } from "../support/rag";
import { listCreditGrants } from "../support/credits";
import { getSetting, setSetting } from "../db/settings";
import { photoKey, presignPut, r2Config } from "../r2";
import { LIMITS, check as rlCheck, clientIp } from "../ratelimit";
import { verifyClerkToken } from "./shared-helpers";

export function register(app: Hono) {
  // ---- Support agent (the ladder: cache → free → cheap → big → escalation form) ----
  // Public chat. sessionId is a widget-held uuid; the ladder answers from the book + approved Q&As.
  app.post("/pub/support/chat", async (c) => {
    const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const message = String(b.message || "").trim();
    if (!message) return c.json({ error: "message required" }, 400);
    const sessionId = /^[\w-]{8,64}$/.test(String(b.sessionId || "")) ? String(b.sessionId) : crypto.randomUUID();
    const lang = b.lang === "es" ? "es" : "en";
    const category = SUPPORT_CATEGORIES.includes(b.category) ? (b.category as SupportCategory) : "other";
    // Attribute to the signed-in account when a phone-session bearer is present (anonymous still works).
    const u = await verifyClerkToken(c.req.header("Authorization")).catch(() => null);
    // Where they opened it — the page, and the check id when it came off a status page.
    const src = String(b.source || "").slice(0, 32) || null;
    const pageUrl = String(b.pageUrl || "").slice(0, 300) || null;
    const checkId = /^[\w-]{1,64}$/.test(String(b.checkId || "")) ? String(b.checkId) : null;
    try {
      const r = await answerSupport(sessionId, message, {
        lang, category, account: u ? { id: u.id, phone: (u as { phone?: string }).phone } : null,
        origin: { source: src || undefined, pageUrl: pageUrl || undefined, checkId: checkId || undefined },
      });
      return c.json({ sessionId, reply: r.reply, escalate: r.escalate, answered: r.answered });
    } catch (e) {
      console.error("[support] chat", e);
      return c.json({ sessionId, reply: null, escalate: true, error: "unavailable" }, 500);
    }
  });

  // Instant answers over the book (Help tab search + search-ahead) — no model spend, just retrieval.
  app.post("/pub/support/search", async (c) => {
    const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const q = String(b.q || "").trim();
    if (q.length < 2) return c.json({ hits: [] });
    try { return c.json({ hits: await searchBook(q, 5) }); }
    catch (e) { console.error("[support] search", e); return c.json({ hits: [] }); }
  });

  // FAQ tab — Copper's top-15 questions from the ReadMe, parsed server-side (cached). No chat needed.
  app.get("/pub/support/faq", async (c) => {
    try { return c.json({ items: await getFaq() }); }
    catch (e) { console.error("[support] faq", e); return c.json({ items: [] }); }
  });

  // Known-issue banner shown at the top of the Messenger home. Admin sets it; public reads it.
  app.get("/pub/support/banner", async (c) => {
    const en = (await getSetting("support_banner_en")) || "";
    const es = (await getSetting("support_banner_es")) || "";
    return c.json({ en, es });
  });

  app.post("/api/support/banner", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    await setSetting("support_banner_en", String(b.en || "").slice(0, 240));
    await setSetting("support_banner_es", String(b.es || "").slice(0, 240));
    return c.json({ ok: true });
  });

  // Presigned R2 URL for a bug screenshot (bytes go straight to R2, never our server). Not gated by
  // the community flag — this is the bug-report attach path.
  app.post("/pub/support/upload-url", async (c) => {
    const rl = rlCheck("supportTicket", clientIp(c.req.raw.headers), LIMITS.supportTicket);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const cfg = r2Config();
    if (!cfg) return c.json({ error: "uploads_not_configured" }, 503);
    const b = await c.req.json().catch(() => ({}));
    const ext = String(b.ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4);
    const key = photoKey(ext).replace(/^community\//, "support/");
    const { uploadUrl, publicUrl } = await presignPut(key, cfg, b.contentType || "image/jpeg");
    return c.json({ uploadUrl, publicUrl, key });
  });

  // The signed-in user's own past conversations (the Messages tab), newest first.
  app.get("/app/support/conversations", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ conversations: [] });
    const rows = await db.select().from(supportConversations)
      .where(eq(supportConversations.accountId, u.id))
      .orderBy(desc(supportConversations.updatedAt)).limit(30);
    return c.json({ conversations: rows.map((r) => ({ id: r.id, sessionId: r.sessionId, category: r.category, title: r.title, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt })) });
  });

  // Re-open one conversation's transcript (owner of the session, by sessionId — no account needed for guests).
  app.get("/pub/support/conversation/:sessionId", async (c) => {
    const sid = c.req.param("sessionId");
    if (!/^[\w-]{8,64}$/.test(sid)) return c.json({ error: "bad_session" }, 400);
    const cv = (await db.select().from(supportConversations).where(eq(supportConversations.sessionId, sid)).limit(1))[0];
    if (!cv) return c.json({ error: "not_found" }, 404);
    const msgs = await db.select().from(supportMessages).where(eq(supportMessages.conversationId, cv.id)).orderBy(supportMessages.id);
    return c.json({ sessionId: cv.sessionId, category: cv.category, status: cv.status, createdAt: cv.createdAt,
      messages: msgs.map((m) => ({ role: m.role, content: m.content })) });
  });

  // Thumbs up/down at the end of a chat. helped=true → review queue (the knowledge loop's intake).
  app.post("/pub/support/resolve", async (c) => {
    const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const helped = !!b.helped;
    const ok = await resolveConversation(String(b.sessionId || ""), helped);
    // On "that answered it" the chat stays open and the agent signs off warmly (model-written, with a
    // fixed fallback). Money words never appear in it.
    const close = ok && helped ? await warmClose(b.lang === "es" ? "es" : "en") : undefined;
    return c.json({ ok, close });
  });

  // Escalation form — the only path to a human. Emails the transcript to the support inbox.
  app.post("/pub/support/ticket", async (c) => {
    const rl = rlCheck("supportTicket", clientIp(c.req.raw.headers), LIMITS.supportTicket);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({}));
    const name = String(b.name || "").trim(), email = String(b.email || "").trim(), message = String(b.message || "").trim();
    if (!name || !message) return c.json({ error: "name and message required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "invalid_email" }, 400);
    const sessionId = /^[\w-]{8,64}$/.test(String(b.sessionId || "")) ? String(b.sessionId) : null;
    const category = SUPPORT_CATEGORIES.includes(b.category) ? String(b.category) : undefined;
    const screenshotUrl = typeof b.screenshotUrl === "string" && /^https?:\/\//.test(b.screenshotUrl) ? b.screenshotUrl : null;
    const debug = b.debug && typeof b.debug === "object" ? b.debug : null;
    const t = await submitTicket(sessionId, name, email, message, { category, screenshotUrl, debug });
    return c.json({ ok: true, ticketId: t.id });
  });

  // Admin: credit-machine audit — every auto-grant with the telemetry evidence that justified it,
  // plus the suggested replacement phone when the background re-lookup disagreed with our record.
  app.get("/api/support/credits", async (c) => {
    const grants = await listCreditGrants(Number(c.req.query("limit")) || 50);
    return c.json({ grants });
  });

  // Admin: rebuild the book index in qdrant (run after Copper edits the book).
  app.post("/api/support/reindex", async (c) => {
    try {
      const pages = await reindexBook();
      return c.json({ ok: true, pages });
    } catch (e) {
      return c.json({ error: String((e as Error).message).slice(0, 200) }, 500);
    }
  });

  // Admin: review queue — resolved conversations awaiting approve/reject into the answer cache.
  app.get("/api/support/review", async (c) => {
    const convos = await db.select().from(supportConversations)
      .where(eq(supportConversations.reviewStatus, "pending"))
      .orderBy(desc(supportConversations.updatedAt)).limit(50);
    const out = [];
    for (const cv of convos) {
      const msgs = await db.select().from(supportMessages)
        .where(eq(supportMessages.conversationId, cv.id)).orderBy(supportMessages.id);
      out.push({ id: cv.id, lang: cv.lang, maxTier: cv.maxTier, costUsd: cv.costUsd, updatedAt: cv.updatedAt,
        messages: msgs.map((m) => ({ role: m.role, content: m.content, tier: m.tier })) });
    }
    return c.json({ conversations: out });
  });

  // Admin: approve embeds the Q&A into the qdrant answer cache; reject just clears it from the queue.
  app.post("/api/support/review/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json().catch(() => ({}));
    const convo = (await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1))[0];
    if (!convo) return c.json({ error: "not_found" }, 404);
    if (b.action === "approve") {
      const msgs = await db.select().from(supportMessages)
        .where(eq(supportMessages.conversationId, id)).orderBy(supportMessages.id);
      const question = String(b.question || msgs.find((m) => m.role === "user")?.content || "").trim();
      const answer = String(b.answer || [...msgs].reverse().find((m) => m.role === "assistant")?.content || "").trim();
      if (!question || !answer) return c.json({ error: "no_qa_pair" }, 400);
      await addQa(question, answer, id);
      await db.update(supportConversations).set({ reviewStatus: "approved" }).where(eq(supportConversations.id, id));
      return c.json({ ok: true, embedded: true });
    }
    await db.update(supportConversations).set({ reviewStatus: "rejected" }).where(eq(supportConversations.id, id));
    return c.json({ ok: true, embedded: false });
  });

  // Admin: live-chats list for the dashboard. Filters: category, account (all|members|guests),
  // since/until (unix seconds), q (title/message contains). Newest first.
  app.get("/api/support/chats", async (c) => {
    const q = c.req.query();
    const conds: Array<ReturnType<typeof eq>> = [];
    if (q.category && SUPPORT_CATEGORIES.includes(q.category as SupportCategory)) conds.push(eq(supportConversations.category, q.category));
    if (q.account === "members") conds.push(sql`${supportConversations.accountId} is not null` as never);
    else if (q.account === "guests") conds.push(sql`${supportConversations.accountId} is null` as never);
    const since = Number(q.since), until = Number(q.until);
    if (Number.isFinite(since) && since > 0) conds.push(sql`${supportConversations.updatedAt} >= ${since}` as never);
    if (Number.isFinite(until) && until > 0) conds.push(sql`${supportConversations.updatedAt} <= ${until}` as never);
    if (q.q) conds.push(sql`${supportConversations.title} like ${"%" + q.q + "%"}` as never);
    let sel = db.select().from(supportConversations).$dynamic();
    if (conds.length) sel = sel.where(and(...conds));
    const rows = await sel.orderBy(desc(supportConversations.updatedAt)).limit(Math.min(Number(q.limit) || 100, 200));
    const counts = new Map<number, number>();
    const emails = new Map<string, string | null>();
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      for (const mc of await db.select({ cid: supportMessages.conversationId, n: sql<number>`count(*)` }).from(supportMessages)
        .where(inArray(supportMessages.conversationId, ids)).groupBy(supportMessages.conversationId)) counts.set(mc.cid, Number(mc.n));
      // Batch-resolve the members' emails so the list shows who it was (not just "Guest").
      const acctIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean) as string[])];
      if (acctIds.length) {
        for (const a of await db.select({ id: accounts.clerkUserId, email: accounts.email }).from(accounts)
          .where(inArray(accounts.clerkUserId, acctIds))) emails.set(a.id, a.email);
      }
    }
    return c.json({ chats: rows.map((r) => ({
      id: r.id, category: r.category, accountId: r.accountId, accountPhone: r.accountPhone,
      account: r.accountId ? { id: r.accountId, phone: r.accountPhone, email: emails.get(r.accountId) || null } : null,
      source: r.source, pageUrl: r.pageUrl, checkId: r.checkId,
      title: r.title, maxTier: r.maxTier, status: r.status, escalated: r.status === "escalated",
      msgCount: counts.get(r.id) || 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
    })) });
  });

  // Admin: one chat's full transcript + any escalation ticket (screenshot/debug) + account summary.
  app.get("/api/support/chats/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const cv = (await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1))[0];
    if (!cv) return c.json({ error: "not_found" }, 404);
    const msgs = await db.select().from(supportMessages).where(eq(supportMessages.conversationId, id)).orderBy(supportMessages.id);
    const ticket = (await db.select().from(supportTickets).where(eq(supportTickets.conversationId, id)).orderBy(desc(supportTickets.id)).limit(1))[0] || null;
    // Enrich the signed-in account with the summary the Admin renders (email, plan, credits, checks made).
    const acct = cv.accountId ? (await db.select().from(accounts).where(eq(accounts.clerkUserId, cv.accountId)).limit(1))[0] : null;
    return c.json({
      id: cv.id, category: cv.category, status: cv.status, lang: cv.lang, maxTier: cv.maxTier, costUsd: cv.costUsd,
      account: cv.accountId ? { id: cv.accountId, phone: acct?.phone || cv.accountPhone,
        email: acct?.email || null, subscription: acct?.subscription, credits: acct?.credits, callsMade: acct?.callsMade } : null,
      source: cv.source, pageUrl: cv.pageUrl, checkId: cv.checkId,
      createdAt: cv.createdAt, updatedAt: cv.updatedAt,
      messages: msgs.map((m) => ({ role: m.role, content: m.content, tier: m.tier, model: m.model, createdAt: m.createdAt })),
      ticket: ticket ? { id: ticket.id, name: ticket.name, email: ticket.email, message: ticket.message,
        screenshotUrl: ticket.screenshotUrl, debug: ticket.debug ? JSON.parse(ticket.debug) : null, emailedOk: ticket.emailedOk } : null,
    });
  });

  // Admin: mark a chat done (or reopen it) so the list dot goes green — the operator's "handled" flip.
  // Only open/resolved is settable here; escalation is owned by the ladder, never hand-flipped.
  app.post("/api/support/chats/:id/status", async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json().catch(() => ({}));
    const status = b.status === "resolved" ? "resolved" : b.status === "open" ? "open" : null;
    if (!status) return c.json({ error: "bad_status" }, 400);
    const cv = (await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1))[0];
    if (!cv) return c.json({ error: "not_found" }, 404);
    await db.update(supportConversations).set({ status, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(supportConversations.id, id));
    return c.json({ ok: true, status });
  });

  // Admin: the dashboard numbers — volume, category mix, who answered, escalation, CSAT, spend.
  app.get("/api/support/stats", async (c) => {
    const range = c.req.query("range");
    const cutoff = range === "today" ? Math.floor(Date.now() / 1000) - 86400
      : range === "7d" ? Math.floor(Date.now() / 1000) - 7 * 86400
      : range === "30d" ? Math.floor(Date.now() / 1000) - 30 * 86400 : 0;
    const all = await db.select().from(supportConversations);
    const convos = cutoff ? all.filter((cv) => cv.updatedAt >= cutoff) : all;
    const tickets = await db.select({ n: sql<number>`count(*)` }).from(supportTickets);
    const byTier: Record<number, number> = {}, byCategory: Record<string, number> = {};
    let cost = 0;
    for (const cv of convos) {
      byTier[cv.maxTier] = (byTier[cv.maxTier] || 0) + 1;
      byCategory[cv.category] = (byCategory[cv.category] || 0) + 1;
      cost += cv.costUsd;
    }
    const escalated = convos.filter((cv) => cv.status === "escalated").length;
    const resolved = convos.filter((cv) => cv.status === "resolved").length;
    return c.json({
      models: SUPPORT_MODELS, range: range || "all",
      conversations: convos.length,
      members: convos.filter((cv) => cv.accountId).length,
      guests: convos.filter((cv) => !cv.accountId).length,
      byMaxTier: byTier, byCategory,
      escalated, resolved,
      escalationRate: convos.length ? Math.round((escalated / convos.length) * 100) : 0,
      selfServed: convos.length - escalated,
      pendingReview: all.filter((cv) => cv.reviewStatus === "pending").length,
      tickets: tickets[0]?.n || 0,
      estCostUsd: Math.round(cost * 10000) / 10000,
    });
  });
}

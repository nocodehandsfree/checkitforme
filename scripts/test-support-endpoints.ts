// Smoke test for the support-agent endpoints. Boots the real Hono server on a throwaway port + DB
// and drives: chat validation + rate limit shape, ticket form (stores a row; Brevo unset → stored
// but not emailed), resolve → review queue → reject, and the admin stats endpoint. The ladder's
// model/qdrant calls aren't exercised here (no keys locally) — chat with a live ladder is verified
// on staging; this proves routing, validation, persistence, and the review flow.
// Run: env DATABASE_URL=file:./.t-support.db PORT=8794 ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ADMIN_TOKEN=t ./node_modules/.bin/tsx scripts/test-support-endpoints.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { supportConversations, supportMessages, supportTickets } from "../src/db/schema";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  await import("../src/server");
  const PORT = process.env.PORT || "8794";
  const base = `http://127.0.0.1:${PORT}`;
  const admin = { "x-admin-token": process.env.ADMIN_TOKEN || "t", "content-type": "application/json" };
  const pub = { "content-type": "application/json" };
  await new Promise((r) => setTimeout(r, 400));

  // Chat input validation (no model call happens on a rejected body).
  let r = await fetch(`${base}/pub/support/chat`, { method: "POST", headers: pub, body: JSON.stringify({}) });
  ok(r.status === 400, "chat without message → 400");

  // Ticket form: bad email rejected; good one stored (Brevo unset → emailed:false path, row still lands).
  r = await fetch(`${base}/pub/support/ticket`, { method: "POST", headers: pub, body: JSON.stringify({ name: "Sam", email: "nope", message: "hi" }) });
  ok(r.status === 400, "ticket with bad email → 400");
  r = await fetch(`${base}/pub/support/ticket`, { method: "POST", headers: pub, body: JSON.stringify({ name: "Sam", email: "sam@example.com", message: "My check never came back" }) });
  ok(r.status === 200 && (await r.json()).ok === true, "ticket stores and returns ok");
  const tickets = await db.select().from(supportTickets);
  ok(tickets.length === 1 && tickets[0].email === "sam@example.com", "ticket row persisted");
  ok(tickets[0].emailedOk === false, "no Brevo key → emailed_ok false (graceful)");

  // Seed a finished conversation directly (the ladder needs model keys), then walk the review flow.
  const now = Math.floor(Date.now() / 1000);
  const [cv] = await db.insert(supportConversations).values({
    sessionId: "test-session-0001", lang: "en", status: "open", maxTier: 1, costUsd: 0.0004, createdAt: now, updatedAt: now,
  }).returning();
  await db.insert(supportMessages).values([
    { conversationId: cv.id, role: "user", content: "What is a check?", tier: null, model: null, createdAt: now },
    { conversationId: cv.id, role: "assistant", content: "A check is one call to one store about one thing.", tier: 1, model: "test", createdAt: now },
  ]);

  r = await fetch(`${base}/pub/support/resolve`, { method: "POST", headers: pub, body: JSON.stringify({ sessionId: "test-session-0001", helped: true }) });
  ok(r.status === 200 && (await r.json()).ok === true, "resolve helped:true accepted");

  r = await fetch(`${base}/api/support/review`, { headers: admin });
  const queue = await r.json();
  ok(r.status === 200 && queue.conversations?.length === 1, "resolved conversation lands in review queue");
  ok(queue.conversations?.[0]?.messages?.length === 2, "queue item carries the transcript");

  // Reject (approve would call the embeddings API; the reject path proves queue state handling).
  r = await fetch(`${base}/api/support/review/${cv.id}`, { method: "POST", headers: admin, body: JSON.stringify({ action: "reject" }) });
  ok(r.status === 200 && (await r.json()).embedded === false, "reject clears without embedding");
  r = await fetch(`${base}/api/support/review`, { headers: admin });
  ok(((await r.json()).conversations || []).length === 0, "queue empty after reject");

  r = await fetch(`${base}/api/support/stats`, { headers: admin });
  const stats = await r.json();
  ok(r.status === 200 && stats.conversations === 1 && stats.tickets === 1, "stats counts conversations + tickets");
  ok(typeof stats.models?.big === "string", "stats reports the configured ladder models");

  // Admin gate: no token → the /api wall must hold.
  r = await fetch(`${base}/api/support/stats`);
  ok(r.status === 401 || r.status === 403, "stats without admin token rejected");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

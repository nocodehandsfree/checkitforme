// ── Escalation tickets ───────────────────────────────────────────────────────────────────────
// The ladder's last rung. The user never sees an email address: they fill the widget form and we
// email the transcript to the support inbox (Brevo, same transactional pattern as calls/notify).
// The stored row is the hook for the future trouble-ticket system.
import { eq, asc } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/client";
import { supportConversations, supportMessages, supportTickets } from "../db/schema";

const INBOX = process.env.SUPPORT_INBOX || "support@checkitforme.com";
const TIER_LABEL = ["cache", "free", "cheap", "big"];

export interface TicketOpts {
  category?: string;
  screenshotUrl?: string | null;
  debug?: Record<string, unknown> | null;  // auto-captured on bug reports: {brand, page, lastCheckId, ua}
}

export async function submitTicket(sessionId: string | null, name: string, email: string, message: string, opts: TicketOpts = {}): Promise<{ id: number; emailed: boolean }> {
  const convo = sessionId
    ? (await db.select().from(supportConversations).where(eq(supportConversations.sessionId, sessionId)).limit(1))[0]
    : undefined;
  const category = opts.category || convo?.category || "other";
  const row = (await db.insert(supportTickets).values({
    conversationId: convo?.id ?? null, category,
    name: name.slice(0, 120), email: email.slice(0, 200), message: message.slice(0, 4000),
    screenshotUrl: opts.screenshotUrl || null,
    debug: opts.debug ? JSON.stringify(opts.debug).slice(0, 2000) : null,
    emailedOk: false, createdAt: Math.floor(Date.now() / 1000),
  }).returning())[0];

  let transcript = "(no chat before this ticket)";
  if (convo) {
    const msgs = await db.select().from(supportMessages)
      .where(eq(supportMessages.conversationId, convo.id)).orderBy(asc(supportMessages.id));
    transcript = msgs.map((m) => m.role === "user"
      ? `Customer: ${m.content}`
      : `Agent (${TIER_LABEL[m.tier ?? 3] || "?"}): ${m.content}`).join("\n\n");
  }

  const emailed = await emailInbox(
    `[${category}] Support ticket #${row.id} from ${name}`,
    [`From: ${name} <${email}>`, `Category: ${category}`,
      opts.screenshotUrl ? `Screenshot: ${opts.screenshotUrl}` : "",
      opts.debug ? `Debug: ${JSON.stringify(opts.debug)}` : "",
      "", `Their words:\n${message}`, "", `Chat transcript:\n${transcript}`].filter(Boolean).join("\n"),
  );
  if (emailed) await db.update(supportTickets).set({ emailedOk: true }).where(eq(supportTickets.id, row.id));
  return { id: row.id, emailed };
}

async function emailInbox(subject: string, text: string): Promise<boolean> {
  const { brevoApiKey, senderEmail } = config.alerts;
  if (!brevoApiKey) { console.error("[support] BREVO_API_KEY unset; ticket stored but not emailed"); return false; }
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Check It For Me", email: senderEmail },
        to: [{ email: INBOX }],
        subject,
        textContent: text,
      }),
    });
    return r.ok;
  } catch (e) { console.error("[support] ticket email", e); return false; }
}

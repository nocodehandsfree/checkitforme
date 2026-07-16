// ── The support ladder ───────────────────────────────────────────────────────────────────────
// One brain behind every support surface (site chat now, Discord later). Rungs, cheapest first,
// each vetting before the next spends more:
//   0  answer cache — an approved Q&A close enough to the question → serve it verbatim, $0
//   1  free model + RAG (Gemini Flash-Lite free tier)
//   2  cheap paid retry (gpt-4o-mini)
//   3  big model, multi-turn troubleshooting (gpt-4o today; flip SUPPORT_MODEL_BIG to
//      claude-opus-4-8 once Anthropic is funded — no code change)
//   4  ladder exhausted → the widget offers the escalation form (handled by the caller)
// Every rung answers ONLY from retrieved book/QA passages and self-reports confidence; a rung
// that isn't confident hands the same context up. Once a conversation reaches a rung, follow-ups
// start there (no re-vetting mid-troubleshoot).
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { supportConversations, supportMessages } from "../db/schema";
import { llm, type LlmMsg } from "../llm";
import { retrieve } from "./rag";

export const SUPPORT_MODELS = {
  free: process.env.SUPPORT_MODEL_FREE || "gemini-2.5-flash-lite",
  cheap: process.env.SUPPORT_MODEL_CHEAP || "gpt-4o-mini",
  big: process.env.SUPPORT_MODEL_BIG || "gpt-4o",
};

// $/MTok in,out — for the Admin dashboard estimate only; Helicone has the exact spend.
const PRICES: Record<string, [number, number]> = {
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [5, 25],
};
const estCost = (model: string, inChars: number, outChars: number): number => {
  const [pin, pout] = PRICES[model] || [1, 5];
  return (inChars / 4 / 1e6) * pin + (outChars / 4 / 1e6) * pout; // dollars
};

// How close a cached Q&A must be to serve verbatim (cosine). Tuned high: a wrong cached answer
// costs trust; a cache miss costs one free-model call.
const CACHE_MIN = 0.92;

const SYSTEM = `You are the support agent for Check It For Me, the service that phone-checks retail stores for collectible-card stock so customers don't have to. The customer currency is a "check" (one call to one store about one thing); the literal phone call is a "call"; the AI that calls stores is "Check AI".
Rules, all hard:
- Answer ONLY from the reference passages provided. If they don't answer the question, say you're not sure instead of guessing. NEVER invent policy, prices, or features.
- Never claim a page, link, button, or menu exists, or say where to find something, unless it is named in the reference passages or the site facts below. If you don't know where something lives, say so. There is no Contact page: never send anyone to one.
- Reply in the language of the user's last message (English or Spanish). The product words "check" and "Check AI" stay in English in every language: never translate check to "cheque" or "verificación" when it means the customer currency.
- Talk like a friend who already did the annoying thing for you: plain words, short sentences, no corporate filler. No dashes inside sentences. No emoji.
- You cannot take account actions (no refunds, no plan changes, no placing checks). For those, or anything you can't resolve, set needs_human true.
Site facts, always true, use these for any "where is X" question:
- The site footer has these links only: Scores, About, Guide, Help, Terms, Privacy, plus a Discord icon and an X (Twitter) icon. There is nothing else in the footer.
- There is no Contact page and no Contact link anywhere. For partnerships, business, or press, the way to reach the team is Discord (the icon in the footer). Point them there.
- The Help link in the footer opens this same chat.
Respond with strict JSON: {"answer": string, "confident": boolean, "needs_human": boolean}. "confident" means the passages genuinely covered it. Set needs_human true ONLY when the user explicitly asks for a person, or the issue requires someone to act on their account (billing disputes, refunds, plan changes, a bug report). A question you simply can't answer from the passages is NOT needs_human: answer that you're not sure and set confident false.`;

export interface LadderResult {
  reply: string;
  tier: number;              // rung that produced the answer (0–3)
  escalate: boolean;         // true → widget offers the escalation form
  conversationId: number;
}

export const SUPPORT_CATEGORIES = ["technical", "bug", "billing", "partnerships", "how_checks_work", "other"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
// Per-category nudge appended to the system prompt so the AI frames the answer for the intent. The
// human path stays buried either way — these only shape how the AI tries first.
const CATEGORY_HINT: Record<string, string> = {
  billing: "This is a billing question. Answer from the plans and pricing passages. Only set needs_human for a real dispute or a change to their account you cannot make.",
  partnerships: "This is a partnership or business inquiry. Answer what the book covers; if it needs a real person to evaluate a deal, set needs_human after you've given what you can.",
  bug: "The user is reporting something broken. Help them try the obvious fixes first from the passages; if it's a genuine bug, set needs_human so they can attach details.",
  technical: "This is a technical/how-to question. Walk them through it from the passages.",
  how_checks_work: "They want to understand how checks work. Explain plainly from the book.",
  other: "",
};

export interface AnswerOpts {
  lang?: string;
  category?: SupportCategory;
  account?: { id: string; phone?: string } | null;
  checkContext?: string;   // a short readout of the signed-in user's recent checks, for grounded specifics
}

/** Answer one user message inside a conversation. Creates the conversation on first call. */
export async function answerSupport(sessionId: string, userMessage: string, opts: AnswerOpts = {}): Promise<LadderResult> {
  const now = Math.floor(Date.now() / 1000);
  const category = SUPPORT_CATEGORIES.includes(opts.category as SupportCategory) ? opts.category! : "other";
  let convo = (await db.select().from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId)).limit(1))[0];
  if (!convo) {
    const ins = await db.insert(supportConversations)
      .values({ sessionId, lang: opts.lang || "en", category, accountId: opts.account?.id || null,
        accountPhone: opts.account?.phone || null, title: userMessage.slice(0, 120),
        status: "open", maxTier: 0, costUsd: 0, createdAt: now, updatedAt: now })
      .returning();
    convo = ins[0];
  } else if (opts.account?.id && !convo.accountId) {
    // User signed in mid-conversation — attach the account now.
    await db.update(supportConversations).set({ accountId: opts.account.id, accountPhone: opts.account.phone || null })
      .where(eq(supportConversations.id, convo.id));
  }
  await db.insert(supportMessages).values({
    conversationId: convo.id, role: "user", content: userMessage.slice(0, 2000), tier: null, model: null, createdAt: now,
  });

  const history = await db.select().from(supportMessages)
    .where(eq(supportMessages.conversationId, convo.id))
    .orderBy(asc(supportMessages.id)).limit(20);
  const firstAsk = !history.some((m) => m.role === "assistant");

  const ctx = await retrieve(userMessage);

  // Rung 0 — answer cache. Only on the opening question: follow-ups depend on conversation
  // context a cached one-shot answer doesn't have.
  if (firstAsk && ctx.qaBest && ctx.qaBest.score >= CACHE_MIN && ctx.qaBest.answer) {
    return finish(convo.id, ctx.qaBest.answer, 0, "cache", false, 0, now);
  }

  const catHint = CATEGORY_HINT[convo.category || category] || "";
  const checkBlock = opts.checkContext ? `\n\nThis signed-in customer's recent checks (use for specifics, never invent):\n${opts.checkContext}` : "";
  const msgs: LlmMsg[] = [
    { role: "system", content: `${SYSTEM}${catHint ? `\n\n${catHint}` : ""}\n\nReference passages:\n${ctx.passages || "(none found)"}${checkBlock}` },
    ...history.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];
  const inChars = msgs.reduce((n, m) => n + m.content.length, 0);

  // Sticky start: a conversation already on the big rung stays there.
  const rungs: { tier: number; model: string }[] = [
    { tier: 1, model: SUPPORT_MODELS.free },
    { tier: 2, model: SUPPORT_MODELS.cheap },
    { tier: 3, model: SUPPORT_MODELS.big },
  ].filter((r) => r.tier >= Math.min(convo.maxTier || 0, 3));

  let cost = 0;
  let last: { answer: string; needsHuman: boolean } | null = null;
  for (const rung of rungs) {
    try {
      const raw = await llm(rung.model, msgs, {
        job: `support-t${rung.tier}`, json: true, maxTokens: rung.tier === 3 ? 700 : 400, temperature: 0,
      });
      cost += estCost(rung.model, inChars, raw.length);
      const p = JSON.parse(raw) as { answer?: string; confident?: boolean; needs_human?: boolean };
      if (!p.answer) continue;
      last = { answer: p.answer, needsHuman: !!p.needs_human };
      if (p.needs_human) return finish(convo.id, p.answer, rung.tier, rung.model, true, cost, now);
      if (p.confident || rung.tier === 3) {
        // Big rung not confident → give its best answer but open the door to a human.
        return finish(convo.id, p.answer, rung.tier, rung.model, rung.tier === 3 && !p.confident, cost, now);
      }
    } catch (e) {
      console.error(`[support] rung ${rung.tier} (${rung.model})`, (e as Error).message.slice(0, 160));
    }
  }
  // Every rung errored or returned nothing usable → apologize and escalate.
  const sorry = last?.answer
    || "Something went wrong on our side and I could not look that up. Leave your details and a person will get back to you.";
  return finish(convo.id, sorry, 3, "error", true, cost, now);
}

async function finish(conversationId: number, reply: string, tier: number, model: string, escalate: boolean, cost: number, now: number): Promise<LadderResult> {
  await db.insert(supportMessages).values({
    conversationId, role: "assistant", content: reply, tier, model, createdAt: now,
  });
  const convo = (await db.select().from(supportConversations)
    .where(eq(supportConversations.id, conversationId)).limit(1))[0];
  await db.update(supportConversations).set({
    maxTier: Math.max(convo?.maxTier || 0, tier),
    costUsd: (convo?.costUsd || 0) + cost,
    ...(escalate ? { status: "escalated" } : {}),
    updatedAt: now,
  }).where(eq(supportConversations.id, conversationId));
  return { reply, tier, escalate, conversationId };
}

/** Thumbs up/down from the widget. helped=true puts the conversation in the review queue. */
export async function resolveConversation(sessionId: string, helped: boolean): Promise<boolean> {
  const convo = (await db.select().from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId)).limit(1))[0];
  if (!convo) return false;
  await db.update(supportConversations).set({
    status: helped ? "resolved" : "unhelped",
    reviewStatus: helped ? "pending" : null,
    updatedAt: Math.floor(Date.now() / 1000),
  }).where(eq(supportConversations.id, convo.id));
  return true;
}

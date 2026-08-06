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
import { verifyCheckIssue, creditReply } from "./credits";

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

// The money-safety wall for model-written warmth. The credit machine's verdict sentences carry the
// ONLY money words a customer ever reads (owner law). A model may add a warm human touch AROUND that
// verdict, but if its line contains ANY money word, price, or number we throw it away and fall back.
// This is what lets us make the agent feel smart without ever letting it author a money promise.
const MONEY_WORDS = /credit|check|charge|refund|\bfree\b|money|cash|dollar|price|cr[eé]dito|cheque|cobr|reembols|gratis|dinero|precio/i;
const cleanTouch = (raw: string, maxLen: number): string => {
  const line = (raw || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!line) return "";
  if (/[-—]/.test(line)) return "";        // no dashes inside sentences (copy law)
  if (/\d|\$/.test(line)) return "";        // no numbers or prices
  if (MONEY_WORDS.test(line)) return "";    // never a money word
  if (line.length > maxLen) return "";      // keep it short
  return line;
};

/** A short, warm, money-word-free opener that shows we heard the customer and are looking into it.
 * Prepended to a check_issue verdict so the reply reads like a person, not a script. Empty on any
 * doubt (model down, keys absent, or the line tripped the money wall) — the verdict still stands. */
async function empathyOpener(userMessage: string, lang: string): Promise<string> {
  const es = lang === "es";
  try {
    const raw = await llm(SUPPORT_MODELS.cheap, [
      { role: "system", content: `You are a warm support agent for Check It For Me. The customer just told you something went wrong with a check we ran for them. Write ONE short, warm opening line that shows you heard them and are looking into it. ${es ? "Reply in Spanish." : "Reply in English."} Hard rules: one sentence, under 11 words, plain friend voice, no dashes, no emoji. Do NOT state any outcome, and NEVER mention credits, checks, charges, refunds, money, prices, or any number. Output only the sentence.` },
      { role: "user", content: userMessage.slice(0, 300) },
    ], { job: "support-empathy", maxTokens: 40, temperature: 0.8 });
    return cleanTouch(raw, 90);
  } catch { return ""; }
}

/** A short warm sign-off when the customer says the answer helped. Model-written for variety, with a
 * deterministic fallback so the close always lands. Money-word-free, same wall as the opener. */
export async function warmClose(lang: string): Promise<string> {
  const es = lang === "es";
  const fallback = es ? "Me alegra haber ayudado. ¿Hay algo más en que pueda ayudarte?" : "Glad I could help. Anything else I can do for you?";
  try {
    const raw = await llm(SUPPORT_MODELS.cheap, [
      { role: "system", content: `You are a warm support agent for Check It For Me. The customer just said your answer helped. Write ONE short, warm closing line: be glad you helped and ask if there is anything else. ${es ? "Reply in Spanish." : "Reply in English."} Hard rules: one short sentence, plain friend voice, no dashes, no emoji. Do NOT mention credits, checks, charges, refunds, money, or numbers. Output only the line.` },
      { role: "user", content: es ? "Eso resolvió mi duda." : "That answered it." },
    ], { job: "support-close", maxTokens: 40, temperature: 0.8 });
    return cleanTouch(raw, 120) || fallback;
  } catch { return fallback; }
}

const SYSTEM = `You are the support agent for Check It For Me, the service that phone-checks retail stores for collectible-card stock so customers don't have to. The customer currency is a "check" (one call to one store about one thing); the literal phone call is a "call"; the AI that calls stores is "Check AI".
Rules, all hard:
- Answer ONLY from what you know below. If it doesn't answer the question, say you're not sure instead of guessing. NEVER invent policy, prices, or features.
- Never claim a page, link, button, or menu exists, or say where to find something, unless it is named in what you know or the site facts below. If you don't know where something lives, say so. There is no Contact page: never send anyone to one.
- Reply in the language of the user's last message (English or Spanish). The product words "check" and "Check AI" stay in English in EVERY language. Writing "cheque" or "verificación" for a check is always wrong: a cheque is a piece of paper you take to a bank, and a Spanish customer reading "10 cheques cuestan $9.90" is being told about the wrong product entirely. In Spanish it is "un check", "tus checks", "tu primer check".
- Talk like a friend who already did the annoying thing for you: plain words, short sentences, no corporate filler. No dashes inside sentences. No emoji.
- KEEP IT UNDER 80 WORDS. This is a chat bubble on a phone, not a page. Answer what they asked and stop. Do not volunteer the charge rules, the price list, or how the whole thing works unless that IS the question. If they need more they will ask, and being asked is better than being scrolled past.
- NEVER say out loud how you work. The customer must never read the words passages, needs_human, confident, escalate, tier, cache, or any other name from these instructions. "I can set needs_human true" and "the passages don't cover that" both tell a person their problem is being handled by a form. Say the human thing: "I don't have that one" or "let me get a person on this".
- You cannot take account actions (no refunds, no plan changes, no placing checks). For those, or anything you can't resolve, set needs_human true.
Site facts, always true, use these for any "where is X" question:
- The site footer has these links only: Scores, About, Guide, Help, Terms, Privacy, plus a Discord icon and an X (Twitter) icon. There is nothing else in the footer.
- There is no Contact page and no Contact link anywhere. For partnerships, business, or press, the way to reach the team is Discord (the icon in the footer). Point them there.
- The customer CANNOT hear a check. They read it: the conversation arrives as text, line by line, as it is spoken, and the screen shows which stage the call is at. Listening to the audio is an internal testing tool, not something a customer has. So "can I hear the call?" is answered no, and then what they DO get. Never answer yes and then describe reading.
- Check is a website you can add to your home screen, and the book calls that the app. It is NOT in the App Store: never tell anyone to download or install it from there. Someone saying "the app" means the home screen one, so help them with it normally.
- The Help link in the footer opens this same chat. So "tap Help" is NEVER an answer to anyone who wants to reach a person, in any wording — not to "let me talk to someone", not to "what's your phone number, I'd rather call someone". It hands them back to you. Set needs_human instead and say a person is coming.
- Discord is for partnerships, business, and press. It is NOT the support path. Never hand a customer with a support problem to Discord to find a person.
- When someone asks for a human, you do not have a link to give them and you must not invent one. Set needs_human true and the app itself hands them over. Still answer what you can in the same reply, warmly, then let the hand over happen.
Charge rules. These OUTRANK any reference passage that disagrees (owner ruling 2026-07-22, extended 08-04). The single test is whether a person picked up, NOT whether we got an answer.
- CHARGED, because someone picked up and spent their time on us, even when the check ends with no answer: they left us on hold, they were too slammed to check, we could not understand each other, the staff hung up on us, or a real back and forth that stayed unclear. Also charged, obviously, when the store did give a real answer.
- FREE, because nobody ever picked up: nobody answered, voicemail, a busy line, a bad number, the store was closed, the call broke on our end, or the check was cancelled.
Any passage saying an endless hold, a store too slammed to check, or staff hanging up is free is OUT OF DATE. Say plainly that those are charged, and why: a real person stopped what they were doing for us.
Never say a check is free just because the answer was unclear. Unclear splits two ways and the split is who picked up: nobody picked up and we could not get an answer is FREE, but somebody picked up, we talked, and we still could not make out the answer is CHARGED. If you are about to write "you only pay for a clear answer" or "an unclear answer is never charged", stop, because both are wrong.
Respond with strict JSON: {"answer": string, "confident": boolean, "needs_human": boolean}. "confident" means the passages genuinely covered it. Set needs_human true ONLY when the user explicitly asks for a person, or the issue requires someone to act on their account (billing disputes, refunds, plan changes, a bug report). A question you simply can't answer from the passages is NOT needs_human: answer that you're not sure and set confident false.
One exception that is never a judgement call: if the user asks for a human, an agent, a real person, someone who works there, or says they do not want to talk to a bot, needs_human is true. It does not matter how well you could have answered them, and it does not matter that you think you already did.
When that happens, never say you cannot connect them: a person really is being brought in right after your reply, so saying otherwise is a lie the screen immediately contradicts. Say a person is coming, warmly and in one line, and ask what to pass along so they arrive knowing the problem.`;

/** An unmistakable ask for a person, EN + ES. Deterministic on purpose: a model deciding this got it
 *  wrong in round 1 (it answered "tap Help", which opens this same chat, to somebody asking twice for
 *  a human). Kept TIGHT — it must fire on a real request and stay silent on chatter that merely says
 *  "person" or "somebody", because offering a human too early is the opposite failure. */
export const HUMAN_ASK = new RegExp([
  // asking to be put through: "talk to a real person", "connect me with an agent"
  /\b(?:speak|speaking|talk|talking|chat|connect|transfer|escalate)\w*\s+(?:me\s+)?(?:to|with)\s+(?:a|an|the|some)?\s*(?:real|actual|live|human)?\s*(?:person|human|agent|rep|representative|someone|somebody|operator|manager)\b/,
  // asking for one outright: "I want a human", "get me a real person"
  /\b(?:want|need|get|give|let)\s+(?:me\s+)?(?:to\s+)?(?:speak|talk)?\s*(?:to\s+)?(?:a|an|the)?\s*(?:real|actual|live)?\s*(?:person|human|agent|rep|representative)\b/,
  /\bhuman\s+(?:please|now|pls|being)\b/,
  // refusing the bot outright
  /\bno\s+(?:more\s+)?bots?\b|\bnot\s+(?:a\s+)?(?:ro)?bot\b|\bno\s+bot\s+answers?\b/,
  /\bsomeone\s+who\s+works\s+(?:there|here|for you)\b/,
  // Spanish
  /\bhablar\s+con\s+(?:una|un|alguien)\b|\bpersona\s+(?:de\s+verdad|real)\b|\bagente\s+(?:humano|real)\b|\bno\s+(?:con\s+)?(?:un\s+)?bot\b/,
].map((r) => r.source).join("|"), "i");

export interface LadderResult {
  reply: string;
  tier: number;              // rung that produced the answer (0–3)
  escalate: boolean;         // true → widget offers the escalation form
  answered: boolean;         // false → this reply is a clarifying question, not an answer (hide "That answered it")
  /** They ASKED for a person, rather than the AI running out of road. The widget offers the human
   *  straight away on this, instead of the two-strike burial — the burial is for our failures, and a
   *  customer who says "I want a human" is not one of them (round 1, scenario 17). */
  humanAsk: boolean;
  conversationId: number;
}

export const SUPPORT_CATEGORIES = ["technical", "bug", "check_issue", "billing", "partnerships", "how_checks_work", "other"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
// Per-category nudge appended to the system prompt so the AI frames the answer for the intent. The
// human path stays buried either way — these only shape how the AI tries first.
const CATEGORY_HINT: Record<string, string> = {
  billing: "This is a billing question. Answer from the plans and pricing passages. Only set needs_human for a real dispute or a change to their account you cannot make.",
  partnerships: "This is a partnership or business inquiry. Answer what the book covers; if it needs a real person to evaluate a deal, set needs_human after you've given what you can.",
  bug: "The user is reporting something broken. Help them try the obvious fixes first from the passages; if it's a genuine bug, set needs_human so they can attach details.",
  check_issue: "The user is reporting that a check went wrong: a wrong or disconnected phone number we called, the wrong store, or a result that looks incorrect. The credit system has already compared their claim to the call record where it could; you are only here because it could not conclude. Acknowledge briefly and sincerely, ask which store or check it was and what specifically was off. NEVER promise, imply, or grant a credit or refund; only the credit system grants. If they push back after being told no, set needs_human true so the team can review.",
  technical: "This is a technical/how-to question. Walk them through it from the passages.",
  how_checks_work: "They want to understand how checks work. Explain plainly from the book.",
  other: "",
};

export interface AnswerOpts {
  lang?: string;
  category?: SupportCategory;
  account?: { id: string; phone?: string } | null;
  checkContext?: string;   // a short readout of the signed-in user's recent checks, for grounded specifics
  // Where the chat was opened from — stamped on the conversation so the Admin renders the context.
  origin?: { source?: string; pageUrl?: string; checkId?: string } | null;
}

/** Answer one user message inside a conversation. Creates the conversation on first call. */
export async function answerSupport(sessionId: string, userMessage: string, opts: AnswerOpts = {}): Promise<LadderResult> {
  const now = Math.floor(Date.now() / 1000);
  const category = SUPPORT_CATEGORIES.includes(opts.category as SupportCategory) ? opts.category! : "other";
  // Read BEFORE any rung runs: whether they asked for a person is the customer's words, not a model's
  // opinion of them, so no rung can talk itself out of it (round 1, scenario 17).
  const askedForHuman = HUMAN_ASK.test(userMessage);
  let convo = (await db.select().from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId)).limit(1))[0];
  const org = opts.origin || null;
  if (!convo) {
    const ins = await db.insert(supportConversations)
      .values({ sessionId, lang: opts.lang || "en", category, accountId: opts.account?.id || null,
        accountPhone: opts.account?.phone || null, title: userMessage.slice(0, 120),
        source: org?.source || null, pageUrl: org?.pageUrl || null, checkId: org?.checkId || null,
        status: "open", maxTier: 0, costUsd: 0, createdAt: now, updatedAt: now })
      .returning();
    convo = ins[0];
  } else {
    // Backfill anything not stamped yet: the user signs in mid-chat, or a later message carries the
    // page context the opener didn't. Never overwrite a value that's already set.
    const patch: Partial<typeof supportConversations.$inferInsert> = {};
    if (opts.account?.id && !convo.accountId) { patch.accountId = opts.account.id; patch.accountPhone = opts.account.phone || null; }
    if (org?.source && !convo.source) patch.source = org.source;
    if (org?.pageUrl && !convo.pageUrl) patch.pageUrl = org.pageUrl;
    if (org?.checkId && !convo.checkId) patch.checkId = org.checkId;
    if (Object.keys(patch).length) await db.update(supportConversations).set(patch).where(eq(supportConversations.id, convo.id));
  }
  await db.insert(supportMessages).values({
    conversationId: convo.id, role: "user", content: userMessage.slice(0, 2000), tier: null, model: null, createdAt: now,
  });

  const history = await db.select().from(supportMessages)
    .where(eq(supportMessages.conversationId, convo.id))
    .orderBy(asc(supportMessages.id)).limit(20);
  const firstAsk = !history.some((m) => m.role === "assistant");

  // The credit machine owns check_issue conversations until it reaches a money decision. It runs
  // BEFORE any model: deterministic evidence checks, deterministic replies, $0. Terminal outcomes
  // (granted / already / denied / not charged / cap) are recorded on the conversation so it never
  // re-litigates. Guiding outcomes stay open: "ambiguous" keeps asking until they name the store
  // (each new message re-runs the verifier, which may then conclude); "guest" and "no recent check"
  // reply deterministically once, then later messages fall through to the normal ladder, whose
  // category hint forbids it from ever promising a credit.
  if ((convo.category || category) === "check_issue" && !convo.creditDecision) {
    const acctId = opts.account?.id || convo.accountId || null;
    // Opened off a check's status page → we already know the exact check. Pass it so the verifier
    // resolves to it and never asks "which store" (the loop the customer hit).
    const pinnedRef = convo.checkId || null;
    try {
      let out = await verifyCheckIssue(acctId, userMessage, convo.id, pinnedRef);
      // Loop-break: if we've already asked which store twice and still can't tell, stop asking and
      // hand it to a person instead of repeating the question forever.
      if (out.kind === "ambiguous") {
        const priorAsks = history.filter((m) => m.role === "assistant" && m.model === "credit-machine").length;
        if (priorAsks >= 2) out = { kind: "unresolved" };
      }
      const terminal = ["granted", "already", "denied_fine", "not_charged", "too_old", "cap", "unresolved"].includes(out.kind);
      if (terminal) {
        await db.update(supportConversations)
          .set({ creditDecision: out.kind, creditCid: "cid" in out ? out.cid : null })
          .where(eq(supportConversations.id, convo.id));
      }
      if (terminal || out.kind === "ambiguous" || firstAsk) {
        const lng = convo.lang || opts.lang || "en";
        const r = creditReply(out, lng);
        // Make the verdict feel human: a model-written warm opener sits in FRONT of the locked money
        // sentence. It can never touch the money words (money wall), and it's skipped for the
        // "which store" question and the sign-in nudge, which aren't verdicts.
        let reply = r.reply;
        if (out.kind !== "ambiguous" && out.kind !== "guest") {
          const opener = await empathyOpener(userMessage, lng);
          if (opener) reply = `${opener} ${reply}`;
        }
        // "ambiguous" is a question back to the customer, not an answer → the widget keeps the
        // "That answered it" button hidden until a real answer lands.
        return finish(convo.id, reply, 0, "credit-machine", r.escalate || askedForHuman, 0, now, out.kind !== "ambiguous", askedForHuman);
      }
    } catch (e) {
      // Verifier down ≠ chat down: log and let the normal ladder answer (its hint forbids promises).
      console.error("[support] credit machine", (e as Error).message.slice(0, 160));
    }
  }

  const ctx = await retrieve(userMessage);

  // Rung 0 — answer cache. Only on the opening question: follow-ups depend on conversation
  // context a cached one-shot answer doesn't have.
  if (firstAsk && ctx.qaBest && ctx.qaBest.score >= CACHE_MIN && ctx.qaBest.answer) {
    return finish(convo.id, ctx.qaBest.answer, 0, "cache", askedForHuman, 0, now, true, askedForHuman);
  }

  const catHint = CATEGORY_HINT[convo.category || category] || "";
  const checkBlock = opts.checkContext ? `\n\nThis signed-in customer's recent checks (use for specifics, never invent):\n${opts.checkContext}` : "";
  const msgs: LlmMsg[] = [
    { role: "system", content: `${SYSTEM}${catHint ? `\n\n${catHint}` : ""}\n\nWhat you know:\n${ctx.passages || "(nothing on this)"}${checkBlock}` },
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
      if (p.needs_human || askedForHuman) return finish(convo.id, p.answer, rung.tier, rung.model, true, cost, now, true, askedForHuman);
      if (p.confident || rung.tier === 3) {
        // Big rung not confident → give its best answer but open the door to a human.
        return finish(convo.id, p.answer, rung.tier, rung.model, (rung.tier === 3 && !p.confident) || askedForHuman, cost, now, true, askedForHuman);
      }
    } catch (e) {
      console.error(`[support] rung ${rung.tier} (${rung.model})`, (e as Error).message.slice(0, 160));
    }
  }
  // Every rung errored or returned nothing usable → apologize and escalate.
  const sorry = last?.answer
    || "Something went wrong on our side and I could not look that up. Leave your details and a person will get back to you.";
  return finish(convo.id, sorry, 3, "error", true, cost, now, true, askedForHuman);
}

async function finish(conversationId: number, reply: string, tier: number, model: string, escalate: boolean, cost: number, now: number, answered = true, humanAsk = false): Promise<LadderResult> {
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
  return { reply, tier, escalate, answered, humanAsk, conversationId };
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

// Second-read consensus verdict. After a call finishes, a cheap LLM (Gemini Flash-Lite — the same
// brain the nav-learner uses) re-reads the transcript INDEPENDENTLY of ElevenLabs' own extraction.
// We only show a DEFINITIVE "in stock" / "not in stock" when the two reads don't conflict; a real
// conflict (one says yes, the other no) drops to an honest "couldn't get a clear answer" and the
// finder is NOT charged. The same pass also captures the product form/set the clerk named
// ("3-pack blister", "Surging Sparks ETB") — kept even when the exact set is unknown.
import { llm } from "../llm";
import { liveReadFor } from "./live-read";

// Cheapest brain that reliably reads a short transcript. Same model the navigator hands off on.
// GROQ, OFF GOOGLE (owner 08-05: "i'm looking for a cheaper solution than Google"). The Groq lane
// was already wired in llm.ts (the groq: prefix, the same OpenAI fallback every vendor gets), and a
// read on llama-3.3-70b costs about a hundredth of a cent, billed to our Groq account instead of the
// exhausted Google one. 70b rather than the tinier 8b on purpose: a weak reader disagrees with
// Charlie more, every disagreement is a "couldn't tell" we cannot charge for, so the cheap model is
// the one that reads WELL, not the one with the smallest sticker.
// MEASURED, NOT GUESSED (owner 08-06: "the least expensive model that will still work"). All three
// candidates scored 6/6 on the robot store's own spec conversations, the trick ones included (the
// no that turns into a yes after a check, the hold), so the smallest won: llama-3.1-8b-instant.
//
// RE-MEASURED 08-13, because Groq is decommissioning that model on 08-16 (their letter to the
// owner). Same bar, scripts/reader-eval.ts, eight robot conversations with the fallback DISABLED so
// a candidate cannot be quietly rescued: the 70b read 8 of 8, the old 8b read 7 of 8 (it missed the
// yes hidden inside a no, the exact coin flip checks 248 and 257 keep showing live), and Groq's own
// suggested replacement gpt-oss-20b read 4 of 8 because half its calls could not produce our JSON
// at all. So the 70b it is: about 0.06 cents a read (900 in at $0.59, 120 out at $0.79 per million),
// ten times the old sticker and still a rounding error next to Charlie's 11 cents a minute, and it
// reads BETTER, which is the whole point of the reader. The same OpenAI fallback catches a Groq
// outage, and a disagreement still costs us the charge, never the customer a wrong answer.
export const VERDICT_MODEL = "groq:llama-3.3-70b-versatile";

export interface ClerkVerdict {
  inStock: "yes" | "no" | "unclear"; // buyable RIGHT NOW for the asked category
  restockDay: string | null;         // future shipment day the clerk named, if any
  restockTime: string | null;        // time of day for that shipment, if named ("around 2 PM", "morning")
  productForm: string | null;        // "booster packs" | "tin" | "3-pack blister" | "ETB" | "booster box" | …
  set: string | null;                // named set, if the clerk knew it
  confidence: number;                // 0..1 — how sure the model is about inStock
  reason: string;                    // one short clause, for the call log
}

const clean = (s: unknown): string | null => {
  const v = String(s ?? "").trim();
  return v && !/^(n\/?a|none|null|unknown|unclear|no|n\/a)$/i.test(v) ? v.slice(0, 80) : null;
};

/** Independent LLM read of the clerk's words. Returns null when there's nothing to read or the
 *  model call fails — the caller then keeps ElevenLabs' own read unchanged. */
export async function classifyVerdict(
  transcript: string,
  category: string,
  specificProduct?: string,
  /** Override for measuring candidate readers against real transcripts. Live calls never pass it. */
  model?: string,
): Promise<ClerkVerdict | null> {
  const t = (transcript || "").trim();
  if (t.length < 12) return null; // nobody really spoke — nothing to second-guess
  const want = specificProduct?.trim()
    ? `the specific item "${specificProduct.trim()}"`
    : `${category} product (ANY ${category} item counts)`;
  const sys =
    `You read a short phone-call transcript between OUR caller (Agent) and a retail-store CLERK. ` +
    `Decide ONLY from what the CLERK said whether ${want} is IN STOCK AND BUYABLE RIGHT NOW.\n` +
    `Guidance:\n` +
    `- "we have some / we got them / they're on the shelf" → yes.\n` +
    `- "we got some but they're not on the floor yet, come grab one" → yes (buyable now, just not shelved).\n` +
    `- "sold out / all gone / cleaned out / none left / can't find any" → no.\n` +
    `- "we don't carry that / we don't sell those" → no.\n` +
    `- "let me check / hold on / I'll go look" and the call ends with NO answer → unclear.\n` +
    `- a FUTURE shipment ("getting more Thursday") with nothing buyable now → no, but put the day in restockDay.\n` +
    `- if the clerk also names a TIME for that shipment ("around 2", "2pm", "in the morning", "first thing"), put it in restockTime (short, as they said it); else null. Never invent a time.\n` +
    `Judge MEANING and TONE, not exact keywords. Casual, indirect, or oddly-phrased affirmatives still mean ` +
    `YES when the surrounding words signal the item is here and buyable — e.g. "yeah come on down", "we're loaded", ` +
    `"got a ton", "plenty left", "just put a bunch out", "oh for sure", "yep got those", "come grab one". ` +
    `Weigh the WHOLE reply: an invitation to come in, a mention of quantity, or a shipment that's already on the ` +
    `floor are positive availability cues → yes (high confidence), even if the clerk never says the literal words "in stock".\n` +
    // THE OWNER'S RULE, 08-06, off his check 348: the clerk said "We haven't, as a matter of fact.
    // Uh, let me double-check though", went and looked, and came back with "It's black boxes, I
    // think." The reader filed NOT IN STOCK. His words: "that is the vague response. If there was no
    // pokemon they would say no pokemon, they wouldn't describe what it looks like."
    `- DESCRIBING WHAT THEY HAVE IS A YES. A clerk who went to look and comes back naming a set, a ` +
    `colour, a box, a tin, a shelf or any product detail is telling you they found it: "it's black ` +
    `boxes, I think", "the ones with the promo card", "just the packs" → yes. Nobody describes ` +
    `what a product looks like when they have none of it; they say they have none. An earlier "we ` +
    `haven't" said BEFORE they went to check is not the answer, it is the reason they went.\n` +
    `Capture productForm (booster packs, tin, 3-pack blister, ETB, booster box, bundle, etc.) and set ONLY if the clerk named them, else null. ` +
    `Clerks describe products loosely; map descriptions to the trade name: "three packs in one" / "a pack with three smaller packs inside" → "3-pack blister"; "the big box of packs" → "booster box"; "the box with a promo card" → "ETB". ` +
    `The transcript comes from phone speech-to-text and mishears words: "10" or "ten" in a product-type answer almost always means "tin" (the metal box) — NEVER report a bare number as a set or product name; "E T B" / "easy B" → "ETB". ` +
    `Reserve "unclear" for GENUINE uncertainty only — no real answer, or hedging with no commitment. A clearly positive answer phrased unusually is YES, not unclear.\n` +
    `Reply with STRICT JSON only: {"inStock":"yes|no|unclear","restockDay":string|null,"restockTime":string|null,"productForm":string|null,"set":string|null,"confidence":0..1,"reason":"short"}`;
  try {
    const raw = await llm(
      model || VERDICT_MODEL,
      [{ role: "system", content: sys }, { role: "user", content: t.slice(0, 6000) }],
      { job: "verdict", json: true, temperature: 0, maxTokens: 220 },
    );
    const d = JSON.parse(raw) as Record<string, unknown>;
    const s = String(d.inStock ?? "").toLowerCase();
    const inStock = s === "yes" ? "yes" : s === "no" ? "no" : "unclear";
    const confRaw = typeof d.confidence === "number" ? d.confidence : Number(d.confidence);
    return {
      inStock,
      restockDay: clean(d.restockDay),
      restockTime: clean(d.restockTime),
      productForm: clean(d.productForm),
      set: clean(d.set),
      confidence: Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.5,
      reason: String(d.reason ?? "").slice(0, 140),
    };
  } catch {
    return null; // no second opinion → caller keeps the ElevenLabs read as-is
  }
}

/**
 * WAS THAT STAFF, OR A RECORDING? (owner, 08-18 night — item 7 of his box.)
 *
 * THE FAULT IT ANSWERS, from check 383: the store's hold music had an advert mixed into it, a
 * recorded voice saying "Thanks for holding. Did you know we price match any local competitor?".
 * On the line an advert measures as a person — it IS a person, recorded — so no listening rule can
 * refuse it, and Echo wrote its words down as Staff. Charlie answered the advert and his meter ran
 * through the whole hold. Nothing about sound can fix that; only the WORDS say it, and a model
 * reads words in any language, which is the same reason this is the honest fix for check 376's
 * hold announced in Spanish (named in the bank at CHECK 376'S SHAPE, unbuilt until now).
 *
 * IT RUNS AFTER THE CALL AND ONLY AFTER THE CALL, and it is a report, never a brake: a live check
 * never waits on it, is never stopped by it, and a wrong answer here costs a line on the record
 * and nothing else. His rule: if it judges wrong, reword it and run it again on the same saved
 * recordings (`scripts/hold-voice-bench.ts`), never stop a live call over it.
 *
 * Same reader, same model, same door as every other second read in this file — nothing new built
 * beside a working piece.
 */
export interface HoldVoiceRead {
  /** The Clerk line as it was written down. */
  line: string;
  /** Who really said it: a live person on the phone, or something the store plays. */
  voice: "person" | "recording";
  /** …and whether that line tells us we are about to be left waiting, in any language. */
  announcesWait: boolean;
  confidence: number;
  why: string;
}
export async function judgeHoldVoice(
  lines: Array<{ who: string; text: string }>,
  /** Override for measuring candidate wordings against the saved recordings. Live checks never pass it. */
  model?: string,
): Promise<HoldVoiceRead[] | null> {
  const clerk = lines.filter((l) => l.who === "Clerk" && String(l.text || "").trim().length > 2);
  if (!clerk.length) return null;
  const sys =
    `You are reading the written record of a phone call OUR caller (Agent) made to a retail store. ` +
    `For each numbered CLERK line, say who really said it: a live person talking to us, or something ` +
    `the store PLAYS at us (hold music with a voice over it, an advert, an automated hold message, a ` +
    `menu, a voicemail greeting).\n` +
    `A RECORDING sounds like this: it thanks you for holding, tells you your call matters, advertises ` +
    `the store or its offers, tells you to ask an associate or visit the website, reads opening hours, ` +
    `says all representatives are busy, or plays on regardless of what we just asked. It never answers ` +
    `our actual question and it never reacts to us.\n` +
    `A PERSON reacts to us: they answer what we asked, they say they will go and look, they greet us, ` +
    `they name a product, they apologise for the wait in their own words.\n` +
    `Also say whether the line tells us we are about to be left waiting ("let me check", "one moment", ` +
    `"I'll go look", "please hold") — in ANY language, judged by meaning, not by matching English words.\n` +
    `Judge only from the words. Reply with STRICT JSON only: ` +
    `{"lines":[{"n":1,"voice":"person|recording","announcesWait":true|false,"confidence":0..1,"why":"short"}]}`;
  const body = clerk.map((l, i) => `${i + 1}. ${String(l.text).slice(0, 400)}`).join("\n");
  try {
    const raw = await llm(
      model || VERDICT_MODEL,
      [{ role: "system", content: sys }, { role: "user", content: body.slice(0, 6000) }],
      { job: "hold-voice", json: true, temperature: 0, maxTokens: 500 },
    );
    const d = JSON.parse(raw) as { lines?: Array<Record<string, unknown>> };
    const out = Array.isArray(d.lines) ? d.lines : [];
    return clerk.map((l, i) => {
      const r = out.find((o) => Number(o.n) === i + 1) || {};
      const conf = Number(r.confidence);
      return {
        line: String(l.text),
        voice: String(r.voice ?? "").toLowerCase() === "recording" ? "recording" : "person",
        announcesWait: r.announcesWait === true,
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
        why: String(r.why ?? "").slice(0, 140),
      };
    });
  } catch {
    return null;   // no read → the record simply does not carry this line. Never a brake.
  }
}

/** A clean one-line label for the verdict card, e.g. "3-pack blister · Surging Sparks". */
export function productDetailLabel(v: ClerkVerdict | null): string | null {
  if (!v) return null;
  if (v.productForm && v.set) return `${v.productForm} · ${v.set}`;
  return v.productForm || v.set || null;
}

// What ElevenLabs' own extraction concluded (the inputs the reconcile needs). The flags are optional
// because the upstream CallOutcome marks them so; a missing flag is treated as "not set" (false / unknown).
export interface ElRead {
  confirmed: boolean | null; // true = in stock, false = not, null = unclear/no answer
  soldOut?: boolean;
  doesNotSell?: boolean;
  statusKey?: string;        // EL's verdict key (in_stock | sold_out | left_on_hold | …)
}

export interface Consensus {
  confirmed: boolean | null; // FINAL: yes/no only when the two reads don't conflict; else null
  definitive: boolean;       // true → a real answer (charge + hard verdict); false → honest "unsure", no charge
  statusKey: string;         // FINAL customer-facing verdict key
  agreed: boolean;           // false when the two reads conflicted (for the call log)
}

/**
 * Reconcile ElevenLabs' extraction with the independent second read.
 * - sold-out / doesn't-carry always force a NO (never risk a false green).
 * - a direct CONFLICT (one yes, one no) → "no clear answer", NOT charged.
 * - both agree, or one is decisive while the other is merely unclear → that answer stands
 *   (a high-confidence second read also rescues an answer the EL extraction missed).
 * - both unclear → honest "no clear answer" (preserving a "left on hold" near-miss).
 */
/**
 * THE READER RULE, IN ONE PLACE (owner 07-29): "when the second reader disagrees with Charlie's
 * status, the customer gets couldn't-tell and NO charge — never a wrong answer."
 *
 * That was NOT how it worked. Three of the five finalize paths decided for themselves whether the
 * second read was worth consulting — `needSecond ? second : null` — and `needSecond` was false
 * whenever the live extraction already had an opinion. So on the one case that matters most, the live
 * read saying IN STOCK while the transcript reader said NOT IN STOCK, the disagreement was discarded
 * and the customer was shown a green and charged for it. A false red was never checked either,
 * because on a decisive "no" the reader was not even run.
 *
 * Getting the second opinion is no longer a caller's decision. Every finalize path calls THIS, so the
 * rule cannot be applied on one path and skipped on another — which is exactly how it drifted. The
 * read is cheap (Flash-Lite over a short transcript) and it already ran on most calls.
 *
 * @returns the reconciled verdict AND the second read itself, because the same pass is what captures
 *          the product form and the set the clerk named.
 */
export async function consensusFor(
  el: ElRead,
  transcript: string,
  category: string,
  specificProduct?: string,
  room?: string | null,
): Promise<{ consensus: Consensus; second: ClerkVerdict | null }> {
  // A hard sold-out / doesn't-carry decides it below before the second read is ever looked at, so
  // there is nothing a second opinion could change and no reason to spend one.
  if (el.soldOut || el.doesNotSell) return { consensus: reconcile(el, null), second: null };
  // READ AS IT GOES (owner 07-30): the reader already ran DURING the check, on the lines as they
  // landed, so on a normal finish the answer is sitting here and the customer waits on nothing. The
  // model call below is now the fallback — a check too short to read, or a restart mid-check. Same
  // reader, same merge, same rule: this only changes WHEN the read happened, never what it decides.
  const ready = liveReadFor(room);
  const second = ready ?? await classifyVerdict(transcript, category, specificProduct).catch(() => null);
  return { consensus: reconcile(el, second), second };
}

export function reconcile(el: ElRead, second: ClerkVerdict | null): Consensus {
  // Hard NO wins outright.
  if (el.soldOut) return { confirmed: false, definitive: true, statusKey: "sold_out", agreed: true };
  if (el.doesNotSell) return { confirmed: false, definitive: true, statusKey: "does_not_sell", agreed: true };
  // No second opinion (no transcript / model failed) → keep the EL read exactly as it was.
  if (!second) return { confirmed: el.confirmed, definitive: el.confirmed !== null, statusKey: el.statusKey ?? "no_clear_answer", agreed: true };

  const elState = el.confirmed === true ? "yes" : el.confirmed === false ? "no" : "unclear";
  const sec = second.inStock;

  // THE VAGUE YES WAS A COIN FLIP, AND THIS IS WHY (owner 08-07, checks 248 and 257). Those two are
  // the SAME words minutes apart: "We did, but it's not out yet, so uh, or I don't think it's out.
  // Let me see." then "It's like a box with, like, three packs in it, I think, or something like
  // that." One came back In stock and the other Couldn't tell.
  //
  // Neither reader was broken. OUR read is settled: it runs at temperature nought and it carries the
  // owner's own 08-06 rule, that a clerk who went to look and comes back describing what they found
  // is telling you they have it. The voice provider's own extraction is a different model with no
  // such rule and no setting we control, so on a vague yes it lands "no" some checks and "unclear"
  // on others. Unclear plus our yes is In stock; no plus our yes was a contradiction, and a
  // contradiction is an honest Couldn't tell. Same words, two answers, decided by a wobble.
  //
  // His own ruling settles it: "If there was no pokemon they would say no pokemon, they wouldn't
  // describe what it looks like." So when the two disagree and the clerk DESCRIBED WHAT THEY HAVE in
  // their own words, that description is the evidence and it wins. Three things are required
  // together, and all three come off the clerk, never off a mood: our reader says yes, it is sure of
  // itself, and it captured a set or a product form the clerk actually named. An earlier "we
  // haven't" said before they went to look is not the answer, it is the reason they went.
  //
  // Narrow on purpose. A bare "yeah" against a provider "no" is still a contradiction and still an
  // honest Couldn't tell, because there is nothing there to weigh.
  const theyDescribedIt = sec === "yes" && second.confidence >= 0.75 && !!(second.set || second.productForm);
  if (elState === "no" && theyDescribedIt) {
    return { confirmed: true, definitive: true, statusKey: "in_stock", agreed: false };
  }
  // Direct contradiction → never guess. Honest "unsure", no charge.
  if ((elState === "yes" && sec === "no") || (elState === "no" && sec === "yes")) {
    return { confirmed: null, definitive: false, statusKey: "no_clear_answer", agreed: false };
  }
  // The decisive read: prefer EL's own call; if EL had no opinion, trust a CONFIDENT second read.
  const decisive = elState !== "unclear" ? elState : (second.confidence >= 0.75 ? sec : "unclear");
  if (decisive === "yes") return { confirmed: true, definitive: true, statusKey: "in_stock", agreed: true };
  if (decisive === "no") return { confirmed: false, definitive: true, statusKey: "not_in_stock", agreed: true };
  // Both unclear → honest unsure (keep "left on hold" / "too busy" near-misses distinct).
  // voicemail rides the preserve list too — flattening it to "no clear answer" hid a real reason
  // from the customer (owner 07-17: phone went to voicemail, status showed no-clear-answer).
  return { confirmed: null, definitive: false, statusKey: (el.statusKey === "left_on_hold" || el.statusKey === "too_busy" || el.statusKey === "language_barrier" || el.statusKey === "voicemail") ? el.statusKey : "no_clear_answer", agreed: true };
}

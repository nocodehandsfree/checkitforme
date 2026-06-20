// Second-read consensus verdict. After a call finishes, a cheap LLM (Gemini Flash-Lite — the same
// brain the nav-learner uses) re-reads the transcript INDEPENDENTLY of ElevenLabs' own extraction.
// We only show a DEFINITIVE "in stock" / "not in stock" when the two reads don't conflict; a real
// conflict (one says yes, the other no) drops to an honest "couldn't get a clear answer" and the
// finder is NOT charged. The same pass also captures the product form/set the clerk named
// ("3-pack blister", "Surging Sparks ETB") — kept even when the exact set is unknown.
import { llm } from "../llm";

// Cheapest brain that reliably reads a short transcript. Same model the navigator hands off on.
export const VERDICT_MODEL = "gemini-2.5-flash-lite";

export interface ClerkVerdict {
  inStock: "yes" | "no" | "unclear"; // buyable RIGHT NOW for the asked category
  restockDay: string | null;         // future shipment day the clerk named, if any
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
    `Capture productForm (booster packs, tin, 3-pack blister, ETB, booster box, bundle, etc.) and set ONLY if the clerk named them, else null. ` +
    `Be conservative: if you are not certain it is buyable right now, answer "unclear".\n` +
    `Reply with STRICT JSON only: {"inStock":"yes|no|unclear","restockDay":string|null,"productForm":string|null,"set":string|null,"confidence":0..1,"reason":"short"}`;
  try {
    const raw = await llm(
      VERDICT_MODEL,
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
      productForm: clean(d.productForm),
      set: clean(d.set),
      confidence: Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.5,
      reason: String(d.reason ?? "").slice(0, 140),
    };
  } catch {
    return null; // no second opinion → caller keeps the ElevenLabs read as-is
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
export function reconcile(el: ElRead, second: ClerkVerdict | null): Consensus {
  // Hard NO wins outright.
  if (el.soldOut) return { confirmed: false, definitive: true, statusKey: "sold_out", agreed: true };
  if (el.doesNotSell) return { confirmed: false, definitive: true, statusKey: "does_not_sell", agreed: true };
  // No second opinion (no transcript / model failed) → keep the EL read exactly as it was.
  if (!second) return { confirmed: el.confirmed, definitive: el.confirmed !== null, statusKey: el.statusKey ?? "no_clear_answer", agreed: true };

  const elState = el.confirmed === true ? "yes" : el.confirmed === false ? "no" : "unclear";
  const sec = second.inStock;

  // Direct contradiction → never guess. Honest "unsure", no charge.
  if ((elState === "yes" && sec === "no") || (elState === "no" && sec === "yes")) {
    return { confirmed: null, definitive: false, statusKey: "no_clear_answer", agreed: false };
  }
  // The decisive read: prefer EL's own call; if EL had no opinion, trust a CONFIDENT second read.
  const decisive = elState !== "unclear" ? elState : (second.confidence >= 0.75 ? sec : "unclear");
  if (decisive === "yes") return { confirmed: true, definitive: true, statusKey: "in_stock", agreed: true };
  if (decisive === "no") return { confirmed: false, definitive: true, statusKey: "not_in_stock", agreed: true };
  // Both unclear → honest unsure (keep a "left on hold" near-miss distinct).
  return { confirmed: null, definitive: false, statusKey: el.statusKey === "left_on_hold" ? "left_on_hold" : "no_clear_answer", agreed: true };
}

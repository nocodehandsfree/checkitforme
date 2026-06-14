// Phone-tree discovery "brain": read the transcript of an IVR (what the store's phone system said
// when we called and listened) and work out the fastest keypad route to a HUMAN. Runs on the cheapest
// funded model — this is short text-in / JSON-out, so it costs a fraction of a cent per chain.
import { config } from "../config";

// Cheapest model with credit for this job (transcript → structured route). Swap if you prefer.
export const TREE_MODEL = "gemini-2.5-flash-lite";

// Chains queued for an accuracy RE-CHECK: ingest force-relearns these and compares to the stored
// tree (verified vs varies), instead of the one-time passive learn it does for unmapped chains.
const relearnChains = new Set<number>();
export function queueTreeRelearn(chainId: number) { relearnChains.add(chainId); }
export function consumeTreeRelearn(chainId: number): boolean { return relearnChains.delete(chainId); }

export interface LearnedTree {
  ringsDirect: boolean;   // a person answers directly, no menu
  dtmf: string;           // keypad route in our KEY@SECONDS form (e.g. "0@4" or "1@3,3@9"); "" if none
  answerPath: "direct_human" | "simple_ivr" | "deep_ivr";
  avgTreeSeconds: number; // seconds of menus/hold before a human
  note: string;           // one-line plain-English "how to reach a human"
}

export async function learnTreeFromTranscript(transcript: string): Promise<LearnedTree | null> {
  if (!config.geminiKey) return null;
  if (!transcript || transcript.trim().length < 5) return null;
  const prompt = `You map a retail store's phone system (IVR) so a caller can reach a HUMAN as fast as possible.
Below is the transcript of what the phone system / store said when we called and listened.
Return ONLY compact JSON, no prose:
{"ringsDirect": <true if a person answers directly with no menu>, "dtmf": "<keypad route in KEY@SECONDS form, chained with commas, e.g. \\"0@4\\" or \\"1@3,3@9\\"; empty string if no keys are needed>", "answerPath": "<direct_human|simple_ivr|deep_ivr>", "avgTreeSeconds": <integer seconds of menus/hold before a human>, "note": "<one short sentence on how to reach a human>"}

TRANSCRIPT:
${transcript.slice(0, 4000)}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TREE_MODEL}:generateContent?key=${config.geminiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    });
    if (!r.ok) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const d: any = await r.json();
    const txt = ((d.candidates?.[0]?.content?.parts || []) as any[]).map((p) => p.text || "").join("");
    const j = JSON.parse(txt);
    const path = ["direct_human", "simple_ivr", "deep_ivr"].includes(j.answerPath) ? j.answerPath : (j.ringsDirect ? "direct_human" : "simple_ivr");
    return {
      ringsDirect: !!j.ringsDirect,
      dtmf: String(j.dtmf || "").trim(),
      answerPath: path,
      avgTreeSeconds: Math.max(0, Math.round(Number(j.avgTreeSeconds) || 0)),
      note: String(j.note || "").slice(0, 240),
    };
  } catch {
    return null;
  }
}

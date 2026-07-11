// ── Embeddings for the support RAG ───────────────────────────────────────────────────────────
// text-embedding-3-small via the same Helicone OpenAI proxy llm.ts uses ($0.02/MTok — a query
// costs thousandths of a cent). Batched: one call embeds the whole book on reindex.
import { config } from "../config";
import { heli } from "../llm";

const MODEL = "text-embedding-3-small";

export async function embed(texts: string[]): Promise<number[][]> {
  const key = config.openaiKey;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const r = await fetch("https://oai.helicone.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...heli("support-embed") },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { data?: { index: number; embedding: number[] }[] };
  const out: number[][] = new Array(texts.length);
  for (const item of d.data || []) out[item.index] = item.embedding;
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

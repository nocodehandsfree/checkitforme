// ── Unified LLM gateway ──────────────────────────────────────────────────────────────────────
// Every model call in the app routes through here so it goes via Helicone — one place for cost
// tracking, latency, caching, and dead-simple model swapping / fallbacks. Tag each call with a
// `job` and the Helicone dashboard breaks spend down by purpose (nav, tree-learn, hours, …).
//
// Routing patterns below are both VERIFIED live (curl → HTTP 200):
//   OpenAI-style → POST https://oai.helicone.ai/v1/chat/completions
//                  Authorization: Bearer <OPENAI_KEY> · Helicone-Auth: Bearer <HELICONE_KEY>
//   Gemini       → POST https://gateway.helicone.ai/v1beta/models/<model>:generateContent
//                  x-goog-api-key: <GEMINI_KEY> · Helicone-Auth · Helicone-Target-Url: https://generativelanguage.googleapis.com
// Adding Groq / DeepSeek (both OpenAI-compatible) later = one branch here once the key lands.
import { config } from "./config";

const HELICONE = process.env.HELICONE_API_KEY || "";
export function heli(job?: string, cache?: boolean): Record<string, string> {
  return {
    ...(HELICONE ? { "Helicone-Auth": `Bearer ${HELICONE}` } : {}),
    ...(job ? { "Helicone-Property-Job": job } : {}),
    ...(cache ? { "Helicone-Cache-Enabled": "true" } : {}),
  };
}

export type LlmMsg = { role: "system" | "user" | "assistant"; content: string };
export interface LlmOpts {
  job?: string;          // Helicone property → cost dashboard breaks down by this
  maxTokens?: number;
  temperature?: number;
  json?: boolean;        // ask the model for strict JSON out
  cache?: boolean;       // let Helicone cache identical prompts
}

function isGemini(model: string): boolean { return model.startsWith("gemini"); }
// Groq is OpenAI-compatible; flag it with a `groq:` (or `groq/`) prefix so we route to Groq's
// Helicone endpoint with the Groq key. The prefix is stripped before the real model name is sent.
function isGroq(model: string): boolean { return model.startsWith("groq:") || model.startsWith("groq/"); }

// Gemini is on a quota'd key (free-tier 429s exhausted it mid-call on 2026-07-10 and every Delta
// classify silently became "unclear"). A dead brain is worse than a slightly pricier one: any Gemini
// failure falls back to a cheap OpenAI model so live calls keep understanding people.
const GEMINI_FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gpt-4o-mini";

/** One call, any model, always through Helicone. Returns the text (or JSON string when json:true). */
export async function llm(model: string, input: string | LlmMsg[], opts: LlmOpts = {}): Promise<string> {
  const messages: LlmMsg[] = typeof input === "string" ? [{ role: "user", content: input }] : input;
  if (isGemini(model)) {
    try { return await geminiCall(model, messages, opts); }
    catch (e) {
      console.error(`[llm] gemini ${model} failed (${String((e as Error)?.message || e).slice(0, 140)}) -> fallback ${GEMINI_FALLBACK} [job=${opts.job || "?"}]`);
      if (!config.openaiKey) throw e;
      return openaiCall(GEMINI_FALLBACK, messages, opts);
    }
  }
  if (isGroq(model)) return groqCall(model.replace(/^groq[:/]/, ""), messages, opts);
  return openaiCall(model, messages, opts);
}

async function openaiCall(model: string, messages: LlmMsg[], o: LlmOpts): Promise<string> {
  const key = config.openaiKey;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const r = await fetch("https://oai.helicone.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...heli(o.job, o.cache) },
    body: JSON.stringify({
      model, messages,
      max_tokens: o.maxTokens ?? 512,
      temperature: o.temperature ?? 0,
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`llm openai ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return d.choices?.[0]?.message?.content ?? "";
}

// Groq via Helicone (OpenAI-compatible). Cheapest/fastest brain for the IVR navigator —
// e.g. "groq:llama-3.1-8b-instant". Routes through Helicone like every other call.
async function groqCall(model: string, messages: LlmMsg[], o: LlmOpts): Promise<string> {
  const key = config.groqKey;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const r = await fetch("https://groq.helicone.ai/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...heli(o.job, o.cache) },
    body: JSON.stringify({
      model, messages,
      max_tokens: o.maxTokens ?? 512,
      temperature: o.temperature ?? 0,
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) throw new Error(`llm groq ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return d.choices?.[0]?.message?.content ?? "";
}

async function geminiCall(model: string, messages: LlmMsg[], o: LlmOpts): Promise<string> {
  const key = config.geminiKey;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const r = await fetch(`https://gateway.helicone.ai/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key, "Content-Type": "application/json",
      "Helicone-Target-Url": "https://generativelanguage.googleapis.com", ...heli(o.job, o.cache),
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature: o.temperature ?? 0,
        maxOutputTokens: o.maxTokens ?? 512,
        ...(o.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!r.ok) throw new Error(`llm gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

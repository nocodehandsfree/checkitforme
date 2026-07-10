// Store phone: looked up per store via the same web-search models as store-hours (OpenAI
// gpt-4o-search-preview primary, Gemini grounded fallback). Returns an E.164 number or null.
// Backfills CALL-RAIL stores that were imported with only an address (the "nophone:" sentinel).

import { heli } from "./llm";

/** Extract a US/Canada phone from free model text → E.164 (+1XXXXXXXXXX), or null. */
export function normalizePhone(text: string): string | null {
  if (!text) return null;
  // Longest phone-ish run, digits only — handles "+1 (210) 555-1234", "210-555-1234", "210.555.1234".
  const candidate = (text.match(/[+(]?\d[\d().\-\s]{6,}\d/g) || [])
    .map((s) => s.replace(/\D/g, ""))
    .sort((a, b) => b.length - a.length)[0] || "";
  let d = candidate;
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1); // drop US country code
  if (d.length !== 10) return null;          // must be a 10-digit NANP number
  if (/^[01]/.test(d)) return null;          // area code can't start with 0 or 1
  if (/^(\d)\1{9}$/.test(d)) return null;    // reject 0000000000 / 5555555555 placeholders
  return `+1${d}`;
}

/** Look up a single store's public local phone via web search. Returns E.164 or null. */
export async function fetchStorePhone(name: string, address: string): Promise<string | null> {
  const oai = process.env.OPENAI_API_KEY;
  const gem = process.env.GEMINI_API_KEY;
  const prompt = `What is the public customer phone number for this exact store location: ${name}, ${address}? `
    + `Respond with ONLY the local store phone number in E.164 format (e.g. +12105551234). `
    + `Use the number for THIS specific location — never a corporate, headquarters, or call-center line. `
    + `If you cannot find the phone number for this exact location, respond with ONLY the word "none".`;
  try {
    let text = "";
    // Primary: OpenAI web-search model (paid, no daily wall, accurate) — same as hours.
    if (oai) {
      const r = await fetch("https://oai.helicone.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${oai}`, "content-type": "application/json", ...heli("store-phone") },
        body: JSON.stringify({ model: "gpt-4o-search-preview", messages: [{ role: "user", content: prompt }] }),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
        text = d.choices?.[0]?.message?.content ?? "";
      }
    }
    // Fallback: Gemini grounded (free tier) if OpenAI missing or empty.
    if (!text && gem) {
      const r = await fetch(`https://gateway.helicone.ai/v1beta/models/gemini-2.5-flash-lite:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": gem, "Helicone-Target-Url": "https://generativelanguage.googleapis.com", ...heli("store-phone") },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
      });
      if (r.ok) {
        const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        text = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      }
    }
    return normalizePhone(text);
  } catch { return null; }
}

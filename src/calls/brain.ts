// THE BRAIN, ON OUR OWN ACCOUNT (spec: the live call runtime, section 7).
//
// Charlie's model runs INSIDE the voice provider's session today and they bill it. Measured on
// 2026-07-24 against the live account: voice 323 credits a minute, the BRAIN 400. The brain is more
// than half the cost of a conversation, and it is the half we can buy far more cheaply ourselves.
//
// The voice provider can be pointed at somebody else's model instead of its own, provided that
// somebody speaks the same wire format the rest of the industry uses: a streaming chat-completions
// endpoint. So this file IS that endpoint. The provider calls us mid-conversation, we ask our own
// account, and we stream the answer straight back. Nothing about the call changes; only who is
// billed for the thinking.
//
// A SWITCH, NOT A MIGRATION. It is a setting, so it can be killed from a phone mid-incident the way
// the menu flag can. Off is exactly today's behaviour and always works.
//
// NO CONVERSATION AUDIO, AND NOW NO CONVERSATION TEXT EITHER. What passes through here is the
// transcript the provider already holds, used to produce the next line and then dropped. It is never
// written to disk, to a log, or to the receipt. The receipt records WHICH brain answered and how
// long it took, never what was said.
import { config } from "../config";
import { getSetting } from "../db/settings";
import { heli } from "../llm";

/** The model our account answers with. Overridable in Admin without a deploy, because the right
 *  model for a phone call is a thing we will keep re-measuring. */
export async function brainModel(): Promise<string> {
  try { return (await getSetting("call_brain_model")) || DEFAULT_BRAIN_MODEL; } catch { return DEFAULT_BRAIN_MODEL; }
}
/**
 * Groq's llama-3.3-70b, and not by default-choice: it already won a bench on this exact job on
 * 2026-07-10, correct on every classify line at 300 to 700ms, and it is the model the recorded-clip
 * lane has been running live ever since. A phone call cannot wait for a slow think, and the system
 * prompt has already settled everything there is to reason about.
 *
 * Free-tier Gemini is deliberately not here: it 429'd mid call once and turned clear answers into
 * "unclear". It is banned from the live path.
 */
const DEFAULT_BRAIN_MODEL = "groq:llama-3.3-70b-versatile";

/** Shared secret the voice provider presents, so this endpoint cannot be driven by anyone else.
 *  Lives in Railway variables on both services, never in a chat and never in a commit. */
export function brainKeyOk(header: string | null): boolean {
  const want = process.env.BRAIN_API_KEY || "";
  if (!want) return false;                       // unset = the endpoint is closed, not open
  const got = (header || "").replace(/^Bearer\s+/i, "").trim();
  // Fixed-time-ish compare: never let a caller learn the key one character at a time from timing.
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

interface ChatMsg { role: string; content: unknown }

/** Flatten whatever shape the caller sent into plain text. Content can be a string or a list of
 *  parts; a call must never fail because of a shape we did not expect. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : String((p as { text?: string })?.text ?? ""))).join("");
  return "";
}

/** One server-sent-events chunk in the shape a chat-completions client expects. */
function chunk(id: string, model: string, delta: Record<string, unknown>, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created: 0, model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

export interface BrainResult { stream: ReadableStream<Uint8Array>; model: string }

/**
 * Answer one turn of a live phone call from our own account, streamed.
 *
 * Streaming is not a nicety here: the provider starts speaking the moment the first words arrive, so
 * a non-streaming reply would add the whole thinking time to the silence the clerk hears. We stream
 * from our own account's stream where we can, and fall back to sending the finished answer as one
 * chunk, which is still a working call.
 */
export async function brainCompletion(body: {
  messages?: ChatMsg[]; model?: string; max_tokens?: number; temperature?: number;
}): Promise<BrainResult> {
  const model = await brainModel();
  const msgs = (body.messages ?? []).map((m) => ({ role: String(m.role), text: textOf(m.content) }));
  const system = msgs.filter((m) => m.role === "system").map((m) => m.text).join("\n\n");
  const turns = msgs.filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }))
    .filter((m) => m.content.trim());
  const id = `chatcmpl-brain-${turns.length}`;
  const enc = new TextEncoder();

  const ask = { system, turns, maxTokens: Math.min(300, body.max_tokens ?? 200), temperature: body.temperature };
  // RUNG ONE OF THE LADDER: one immediate retry on a different account before anything gives up.
  // A clerk is holding a phone, so this is one quick second chance, not a patient backoff.
  let upstream: AsyncGenerator<string>;
  try { upstream = await openStream(model, ask); }
  catch (e) {
    console.error("[brain] first try failed, retrying on the fallback account:", String(e).slice(0, 160));
    upstream = await openStream(FALLBACK_BRAIN_MODEL, ask);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(chunk(id, model, { role: "assistant", content: "" })));
      try {
        for await (const piece of upstream) controller.enqueue(enc.encode(chunk(id, model, { content: piece })));
      } catch (e) {
        // Mid-answer failure. There is nothing useful to say to a clerk here, so we close the turn
        // cleanly and let the runtime's ladder decide — never emit an apology or an error out loud.
        console.error("[brain] stream failed:", e);
      }
      controller.enqueue(enc.encode(chunk(id, model, {}, "stop")));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return { stream, model };
}

/** The second account we try, on a different provider from the first on purpose: an outage that
 *  takes out one is unlikely to take out both, which is the entire value of a retry. */
const FALLBACK_BRAIN_MODEL = "gpt-4o-mini";

interface Ask { system: string; turns: Array<{ role: string; content: string }>; maxTokens: number; temperature?: number }

/** Which account a model id names. Same `groq:` prefix convention the rest of the app already uses,
 *  so a model can be changed from Admin without anybody editing a route. */
export function brainProvider(model: string): { kind: "groq" | "openai" | "anthropic"; id: string } {
  if (/^groq[:/]/.test(model)) return { kind: "groq", id: model.replace(/^groq[:/]/, "") };
  if (/^claude/.test(model)) return { kind: "anthropic", id: model };
  return { kind: "openai", id: model };
}

/** Open a streamed turn on whichever account the model names. Yields text as it arrives, because
 *  the provider starts speaking on the first words and anything else adds silence the clerk hears. */
async function openStream(model: string, o: Ask): Promise<AsyncGenerator<string>> {
  const p = brainProvider(model);
  if (p.kind === "anthropic") {
    const key = config.anthropicKey;
    if (!key) throw new Error("no key for the anthropic account");
    const r = await fetch("https://anthropic.helicone.ai/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...heli("call-brain") },
      body: JSON.stringify({
        model: p.id, system: o.system || undefined, max_tokens: o.maxTokens,
        ...(typeof o.temperature === "number" ? { temperature: o.temperature } : {}),
        messages: o.turns.length ? o.turns : [{ role: "user", content: "(the line is quiet)" }],
        stream: true,
      }),
    });
    if (!r.ok || !r.body) throw new Error(`anthropic ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
    return sse(r.body, (ev) => (ev as { type?: string; delta?: { text?: string } }).type === "content_block_delta"
      ? (ev as { delta?: { text?: string } }).delta?.text ?? "" : "");
  }
  const key = p.kind === "groq" ? config.groqKey : config.openaiKey;
  if (!key) throw new Error(`no key for the ${p.kind} account`);
  // Through Helicone, exactly like every other model call this app makes. Not decoration: the whole
  // point of moving the brain is to PROVE it is cheaper, and the cost has to land on the same
  // dashboard as everything else or the comparison is two numbers from two places.
  const url = p.kind === "groq" ? "https://groq.helicone.ai/openai/v1/chat/completions" : "https://oai.helicone.ai/v1/chat/completions";
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...heli("call-brain") },
    body: JSON.stringify({
      model: p.id, max_tokens: o.maxTokens,
      ...(typeof o.temperature === "number" ? { temperature: o.temperature } : {}),
      messages: [
        ...(o.system ? [{ role: "system", content: o.system }] : []),
        ...(o.turns.length ? o.turns : [{ role: "user", content: "(the line is quiet)" }]),
      ],
      stream: true,
    }),
  });
  if (!r.ok || !r.body) throw new Error(`${p.kind} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return sse(r.body, (ev) => (ev as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content ?? "");
}

/** Read a server-sent-events body and yield whatever `pick` finds in each frame. Shared, so one
 *  partial-frame bug cannot exist in two providers with only one of them fixed. */
async function* sse(body: ReadableStream<Uint8Array>, pick: (ev: unknown) => string): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";           // the tail is a partial frame; the next read completes it
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try { const t = pick(JSON.parse(raw)); if (t) yield t; } catch { /* not a frame we understand */ }
    }
  }
}

export const _test = { textOf, chunk, brainProvider, DEFAULT_BRAIN_MODEL, FALLBACK_BRAIN_MODEL };

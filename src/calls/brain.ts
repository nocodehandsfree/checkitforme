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
// ⚠️ BLOCKED ON A VOICE DECISION, NOT ON CODE (found 2026-07-28, proven both ways against the live
// account). The provider refuses a custom brain on any agent using an INSTANT VOICE CLONE:
//   "Custom LLM is not allowed when using agents with Instant Voice Clones."
// Every voice we call with — Branson HD, Branson, Fungie — is a clone, so the switch cannot engage
// today. The identical agent WAS accepted with a premade voice, so nothing here is wrong; the
// blocker is entirely which voice the store hears. Settling it costs either money (converting to a
// professional clone) or the brand voice (calling with a stock one), and both are the owner's call.
// Until then `ourBrainAgentId` stays unset and every call quietly uses the hosted model.
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
 * THE MODEL THE OWNER APPROVED, and the only one this may default to. It is the same model the
 * hosted agent runs today, so moving the thinking to our own account changes WHO IS BILLED and
 * nothing a store can hear.
 *
 * An engineer swapped this for a cheaper model on 2026-07-28 after hitting a wall, without asking.
 * That is exactly the change that can make a call sound nothing like the one that was signed off,
 * and it must not happen again: a different model here is an owner's decision, not a workaround.
 */
const DEFAULT_BRAIN_MODEL = "claude-sonnet-4-6";

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

// ---- WHAT THIS ENDPOINT ACCEPTS, AND WHAT PROVES THE CALLER ----------------------------------
//
// BE PRECISE ABOUT THIS, because it is the one route on the server that is not behind the admin
// login. The voice provider's custom-model integration sends a plain bearer token — the secret we
// stored with them — and does NOT sign its requests. So there is no signature to verify, and
// anything claiming otherwise would be a comment that lies. What proves the caller is:
//
//   1. THE SHARED SECRET, which only exists in two places: their vault and our Railway variables.
//      Compared in constant time so it cannot be learned one character at a time from timing.
//      Unset = the route is CLOSED, never open.
//   2. THE SHAPE. Only the handful of fields a chat turn actually needs are read; everything else
//      is ignored, and anything oversized is refused before a model is ever called.
//   3. NO REPLAYS. The same exact body inside a short window is rejected, so a captured request
//      cannot be fired back at us to burn tokens on our account.
//   4. A CEILING. Even with the right secret, a fixed number of turns a minute get through.
//
// What this endpoint can do at worst, with the secret, is spend our own model budget. It cannot
// read a customer, place a call, or reach the database: it only forwards a turn to a model.

/** The most a real turn ever needs. A live call sends a system prompt and a short transcript. */
const MAX_MESSAGES = 60;
const MAX_BODY_CHARS = 60_000;
/** How long an identical body is treated as a replay. Long enough to stop a captured request being
 *  fired back, short enough that a genuine repeated turn on a long call is never blocked. */
const REPLAY_WINDOW_MS = 60_000;
/** Turns a minute, even with the right secret. A phone call needs a handful; a runaway needs stopping. */
const MAX_TURNS_PER_MIN = 120;

const seen = new Map<string, number>();
const recent: number[] = [];

/** Cheap, stable fingerprint of a body — enough to spot the identical request twice, and it is
 *  never stored anywhere or logged, so no conversation text is retained by this guard. */
function fingerprint(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${s.length}`;
}

export type BrainReject = "too-big" | "bad-shape" | "replay" | "too-many";

/**
 * Everything that has to be true before a model is called. Pure and testable, so the rules are
 * provable without a phone call or a network.
 */
export function checkBrainRequest(raw: string, now = Date.now()): { ok: true; body: { messages: ChatMsg[]; max_tokens?: number; temperature?: number } } | { ok: false; why: BrainReject } {
  if (raw.length > MAX_BODY_CHARS) return { ok: false, why: "too-big" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, why: "bad-shape" }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, why: "bad-shape" };
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.messages) || !p.messages.length || p.messages.length > MAX_MESSAGES) return { ok: false, why: "bad-shape" };
  for (const m of p.messages) {
    if (!m || typeof m !== "object") return { ok: false, why: "bad-shape" };
    const role = (m as ChatMsg).role;
    if (role !== "system" && role !== "user" && role !== "assistant") return { ok: false, why: "bad-shape" };
  }
  // The ceiling, before the replay check, so a flood of DIFFERENT bodies is stopped too.
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= MAX_TURNS_PER_MIN) return { ok: false, why: "too-many" };
  const fp = fingerprint(raw);
  for (const [k, at] of seen) if (now - at > REPLAY_WINDOW_MS) seen.delete(k);
  if (seen.has(fp)) return { ok: false, why: "replay" };
  seen.set(fp, now);
  recent.push(now);
  // ONLY these fields are read. Anything else the caller sent is dropped on the floor rather than
  // forwarded, so a field we have never heard of can never reach a model with our money behind it.
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  return { ok: true, body: {
    messages: p.messages as ChatMsg[],
    max_tokens: num(p.max_tokens, 1, 1000),
    temperature: num(p.temperature, 0, 2),
  } };
}

/** Test-only: forget the replay and rate windows. */
export function _resetBrainGuards(): void { seen.clear(); recent.length = 0; }

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
  // RUNG ONE OF THE LADDER: one immediate retry, tight timeout, on THE SAME MODEL. Never a second,
  // cheaper model — a voice that changes character mid call is worse than the failure it is
  // covering, and which model speaks to a store is the owner's decision. If this retry fails too,
  // the runtime moves to rung two and hands the call to the provider's hosted agent instead.
  let upstream: AsyncGenerator<string>;
  try { upstream = await openStream(model, ask); }
  catch (e) {
    console.error("[brain] first try failed, one immediate retry:", String(e).slice(0, 160));
    upstream = await openStream(model, ask);
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

/**
 * ONE FINISHED REPLY FROM OUR OWN ACCOUNT (owner's go, 08-20).
 *
 * The blocked road was letting the voice provider CALL us mid conversation, which they refuse on
 * any agent using a quick-made voice copy. This is the other road, and it is the one his fresh
 * "Oh, hey!" already proved: WE run the conversation, and their plain speech service says each
 * finished line in his voice. So what is needed here is not a stream in their wire format, it is a
 * sentence — this returns that, using the same model, the same accounts and the same one-retry
 * ladder the streaming endpoint above uses.
 *
 * NO CONVERSATION TEXT IS KEPT. What goes in is the transcript the check already holds and what
 * comes out is the line to say; neither is written to disk, to a log or to the receipt.
 */
export async function brainReply(
  system: string,
  turns: Array<{ role: string; content: string }>,
  maxTokens = 120,
): Promise<{ text: string; model: string; ms: number; inTokens: number; outTokens: number }> {
  const model = await brainModel();
  const started = Date.now();
  const ask: Ask = { system, turns, maxTokens };
  // WHAT THIS REPLY REALLY COST TO WRITE (owner's order, 08-20, fix 3). The model reports both
  // halves on its own stream, so the check is charged a MEASURED number and never a guess from the
  // length of a sentence. A stream that says nothing about its tokens leaves these at nought and
  // the check simply carries no writing charge, which is the honest answer when nobody told us.
  const used: TokenCount = { inTokens: 0, outTokens: 0 };
  let upstream: AsyncGenerator<string>;
  try { upstream = await openStream(model, ask, used); }
  catch (e) {
    console.error("[brain] first try failed, one immediate retry:", String(e).slice(0, 160));
    upstream = await openStream(model, ask, used);
  }
  let text = "";
  for await (const piece of upstream) text += piece;
  return { text: text.trim(), model, ms: Date.now() - started, inTokens: used.inTokens, outTokens: used.outTokens };
}

/** The tokens one turn really read and wrote, filled in as the stream runs. */
export interface TokenCount { inTokens: number; outTokens: number }

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
async function openStream(model: string, o: Ask, used?: TokenCount): Promise<AsyncGenerator<string>> {
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
    return sse(r.body, (ev) => {
      const e = ev as { type?: string; delta?: { text?: string }; message?: { usage?: { input_tokens?: number; output_tokens?: number } }; usage?: { input_tokens?: number; output_tokens?: number } };
      // Their own counts, off their own frames: the opening frame carries what it read, the closing
      // one what it wrote.
      if (used) {
        const started = e.type === "message_start" ? e.message?.usage : undefined;
        if (started?.input_tokens) used.inTokens = started.input_tokens;
        if (started?.output_tokens) used.outTokens = started.output_tokens;
        if (e.type === "message_delta" && e.usage?.output_tokens) used.outTokens = e.usage.output_tokens;
      }
      return e.type === "content_block_delta" ? e.delta?.text ?? "" : "";
    });
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
      // Ask for the token counts on the last frame. Without this they simply never arrive and a
      // check would carry no writing charge at all (owner's order, 08-20, fix 3).
      stream_options: { include_usage: true },
    }),
  });
  if (!r.ok || !r.body) throw new Error(`${p.kind} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return sse(r.body, (ev) => {
    const e = ev as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    if (used && e.usage) {
      if (e.usage.prompt_tokens) used.inTokens = e.usage.prompt_tokens;
      if (e.usage.completion_tokens) used.outTokens = e.usage.completion_tokens;
    }
    return e.choices?.[0]?.delta?.content ?? "";
  });
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

export const _test = { textOf, chunk, brainProvider, fingerprint, DEFAULT_BRAIN_MODEL, MAX_MESSAGES, MAX_BODY_CHARS, MAX_TURNS_PER_MIN };

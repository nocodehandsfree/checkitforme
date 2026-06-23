// ElevenLabs Conversational AI adapter (default voice engine).
//
// Outbound: POST /v1/convai/twilio/outbound-call  (ElevenLabs dials via your Twilio number)
// Results:  poll GET /v1/convai/conversations/{id}  (works locally — no public URL needed),
//           or parse the post-call transcription webhook once deployed.
//
// We never enable the audio webhook, so no recording is ever stored — only text + the yes/no.
//
// The agent prompt uses dynamic variables ({{category}}, {{clarification}}, {{phone_tree}},
// {{retailer_name}}, {{ask_shipment_day}}) that we fill per call, so one agent serves every
// category and store. It extracts `received_shipment` (yes/no/unclear) + `shipment_day`.

import type {
  AgentTuning,
  CallOutcome,
  StartCallParams,
  StartCallResult,
  VoiceProvider,
} from "./provider";
import { PREMIUM_FOLLOWUP, FREE_NO_FOLLOWUP } from "./prompts";

export interface ElevenLabsConfig {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  webhookSecret?: string;
}

const BASE = "https://api.elevenlabs.io/v1/convai";

export class ElevenLabsProvider implements VoiceProvider {
  constructor(private cfg: ElevenLabsConfig) {}

  private headers() {
    return { "xi-api-key": this.cfg.apiKey, "content-type": "application/json" };
  }

  async startCall(p: StartCallParams): Promise<StartCallResult> {
    const res = await fetch(`${BASE}/twilio/outbound-call`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        agent_id: p.agentId ?? this.cfg.agentId,
        agent_phone_number_id: this.cfg.phoneNumberId,
        to_number: p.toNumber,
        conversation_initiation_client_data: {
          // Per-call voice override (admin "Talk to me" / bench voice picker). Only applies if the
          // agent has voice overrides enabled; otherwise harmlessly ignored — never affects live calls.
          ...(p.voiceId ? { conversation_config_override: { tts: { voice_id: p.voiceId } } } : {}),
          dynamic_variables: {
            internal_call_id: String(p.callId),
            category: p.productName,
            retailer_name: p.retailerName,
            location: p.location,
            clarification: p.clarification ?? "",
            phone_tree: p.phoneTree ?? "",
            special_instructions: p.specialInstructions ?? "",
            voicemail_policy: p.voicemailPolicy ?? "",
            personality: p.personalityTone ?? "",
            opening_line: p.openingLine ?? "",
            other_categories: (p.otherCategories ?? []).join(", "),
            ask_shipment_day: p.askShipmentDay ? "If it comes up naturally, also ask what day they usually get their shipments in." : "",
            // Kiosk-only store: the prompt branches on this to ask about the vending kiosk
            // (working/stocked) instead of a shelf shipment. "" = normal shelf check.
            kiosk_mode: p.kioskMode ? "true" : "",
            // Premium gate: subscribers' calls ask the product-type follow-up; free calls end fast.
            premium_followup: p.premiumFollowup === false ? FREE_NO_FOLLOWUP : PREMIUM_FOLLOWUP,
          },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs outbound-call failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { conversation_id?: string; callSid?: string };
    return { providerCallId: data.conversation_id ?? data.callSid ?? "", callSid: data.callSid };
  }

  async getConversation(providerCallId: string): Promise<CallOutcome | null> {
    const res = await fetch(`${BASE}/conversations/${providerCallId}`, { headers: this.headers() });
    if (!res.ok) return null;
    const d = (await res.json()) as ElevenLabsConversation;

    // Not finished yet — let the poller try again later.
    if (!["done", "completed", "failed"].includes(d.status)) return null;

    return normalize(d);
  }

  async parseWebhook(req: Request): Promise<CallOutcome> {
    const raw = await req.text();
    await verifySignature(raw, req.headers.get("elevenlabs-signature"), this.cfg.webhookSecret);
    const body = JSON.parse(raw) as { data: ElevenLabsConversation };
    return normalize(body.data);
  }

  /** PATCH the live agent's prompt + TTS tuning. Only sends the fields provided. */
  async updateAgent(agentId: string, patch: AgentTuning): Promise<void> {
    const conversation_config: Record<string, unknown> = {};

    if (patch.prompt !== undefined || patch.maxTokens !== undefined || patch.llm !== undefined) {
      const prompt: Record<string, unknown> = {};
      if (patch.prompt !== undefined) prompt.prompt = patch.prompt;
      if (patch.maxTokens !== undefined) prompt.max_tokens = patch.maxTokens;
      if (patch.llm !== undefined) prompt.llm = patch.llm;
      conversation_config.agent = { prompt };
    }

    // Turn-taking: hold through transfer ring-back (silence timeout) + the "beat" (eagerness).
    const turn: Record<string, unknown> = {};
    if (patch.prompt !== undefined) turn.silence_end_call_timeout = 120; // a clerk who went to check can be away 1-2 min — don't end the call on them (was 45)
    if (patch.turnEagerness !== undefined) {
      turn.turn_eagerness = patch.turnEagerness;
      // Speculative turn predicts end-of-turn = snappier replies. Keep it on except for the
      // slowest "patient" setting, which waits for a confirmed pause (good for the opening).
      turn.speculative_turn = patch.turnEagerness !== "patient";
    }
    if (patch.turnTimeout !== undefined) turn.turn_timeout = patch.turnTimeout; // silence (s) before the agent jumps in
    if (patch.softTimeoutSecs !== undefined) {
      // Presence filler on a long pause; -1 disables it. Keeps the line from feeling dead.
      turn.soft_timeout_config = { timeout_seconds: patch.softTimeoutSecs, message: patch.softTimeoutMsg ?? "Yeah—hi, I'm here!", use_llm_generated_message: false };
    }
    if (Object.keys(turn).length) conversation_config.turn = turn;

    const tts: Record<string, unknown> = {};
    if (patch.voiceId !== undefined) tts.voice_id = patch.voiceId;
    if (patch.speed !== undefined) tts.speed = patch.speed;
    if (patch.stability !== undefined) tts.stability = patch.stability;
    if (patch.similarityBoost !== undefined) tts.similarity_boost = patch.similarityBoost;
    if (patch.style !== undefined) tts.style = patch.style;
    if (patch.speakerBoost !== undefined) tts.use_speaker_boost = patch.speakerBoost;
    if (patch.latency !== undefined) tts.optimize_streaming_latency = patch.latency;
    if (patch.modelId !== undefined) tts.model_id = patch.modelId;
    if (Object.keys(tts).length) conversation_config.tts = tts;

    const res = await fetch(`${BASE}/agents/${agentId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ conversation_config }),
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs agent PATCH failed: ${res.status} ${await res.text()}`);
    }
  }

  /** Copy BEHAVIOR (prompt, tools, extraction fields, voice identity) from one agent to another,
   *  leaving the target's draft-owned settings (speed/warmth/latency/model, beat, LLM) alone.
   *  Keeps the test bench's brain identical to the live agent so a bench call is a faithful
   *  rehearsal — only the voice tuning differs. */
  async syncAgentBehavior(fromId: string, toId: string): Promise<void> {
    const res = await fetch(`${BASE}/agents/${fromId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`ElevenLabs agent GET failed: ${res.status} ${await res.text()}`);
    const src = await res.json() as {
      conversation_config?: { agent?: { prompt?: { prompt?: string; max_tokens?: number; built_in_tools?: unknown } }; tts?: { voice_id?: string } };
      platform_settings?: { data_collection?: unknown };
    };
    const p = src.conversation_config?.agent?.prompt;
    const body: Record<string, unknown> = {
      conversation_config: {
        agent: { prompt: { prompt: p?.prompt, max_tokens: p?.max_tokens, built_in_tools: p?.built_in_tools } },
        tts: { voice_id: src.conversation_config?.tts?.voice_id },
      },
      platform_settings: { data_collection: src.platform_settings?.data_collection },
    };
    const r = await fetch(`${BASE}/agents/${toId}`, { method: "PATCH", headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`ElevenLabs bench sync failed: ${r.status} ${await r.text()}`);
  }

  /** Read an agent's current TTS tuning (for defaulting the sandbox sliders to live values). */
  async getAgentTuning(agentId: string): Promise<AgentTuning> {
    const res = await fetch(`${BASE}/agents/${agentId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`ElevenLabs agent GET failed: ${res.status} ${await res.text()}`);
    const d = await res.json() as { conversation_config?: { tts?: Record<string, unknown>; turn?: Record<string, unknown>; agent?: { prompt?: { llm?: string } } } };
    const tts = d.conversation_config?.tts ?? {};
    const turn = d.conversation_config?.turn ?? {};
    const n = (v: unknown) => (typeof v === "number" ? v : undefined);
    return {
      speed: n(tts.speed), stability: n(tts.stability), similarityBoost: n(tts.similarity_boost),
      style: n(tts.style), speakerBoost: typeof tts.use_speaker_boost === "boolean" ? tts.use_speaker_boost : undefined,
      latency: n(tts.optimize_streaming_latency), modelId: typeof tts.model_id === "string" ? tts.model_id : undefined,
      turnEagerness: typeof turn.turn_eagerness === "string" ? turn.turn_eagerness : undefined,
      turnTimeout: n(turn.turn_timeout),
      softTimeoutSecs: n((turn.soft_timeout_config as { timeout_seconds?: number } | undefined)?.timeout_seconds),
      softTimeoutMsg: typeof (turn.soft_timeout_config as { message?: string } | undefined)?.message === "string" ? (turn.soft_timeout_config as { message?: string }).message : undefined,
      llm: d.conversation_config?.agent?.prompt?.llm,
    };
  }
}

function normalize(d: ElevenLabsConversation): CallOutcome {
  const vars = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  const collected = d.analysis?.data_collection_results ?? {};

  // restock agents report `received_shipment`; carry-check agents report `sells_product`.
  const answer = String(collected.received_shipment?.value ?? collected.sells_product?.value ?? "").trim().toLowerCase();
  let confirmed = answer === "yes" ? true : answer === "no" ? false : null;
  // "Came in this morning but it's gone" — arrived, but NOT buyable now. Never count as in stock.
  const soldOut = /^(yes|true)/i.test(String(collected.sold_out?.value ?? "").trim());
  // "We don't carry that at all" — the store doesn't sell this category (distinct from out of stock).
  const doesNotSell = /^(yes|true)/i.test(String(collected.does_not_carry?.value ?? "").trim());
  let shipmentDay = String(collected.shipment_day?.value ?? "").trim() || null;
  // "If they mention a restock, it's a restock." Even when the structured field misses it, detect a
  // future-shipment mention in the clerk's words → surface it as a restock (drives the 🚚 "Restock
  // incoming" verdict on the consumer) instead of a flat "not in stock" or a useless "maybe".
  if (!shipmentDay) {
    const clerkSaid = (d.transcript ?? []).filter((t) => t.role !== "agent" && t.message).map((t) => String(t.message)).join(" ");
    const RESTOCK = /\b(shipment|restock|gett?ing (?:more|some|another|a shipment|it in|those in)|comes? in|coming in|back in stock|expect(?:ing)?|on order|re-?order|due (?:in|back)|next (?:week|month|shipment)|truck)\b/i;
    if (RESTOCK.test(clerkSaid)) {
      const day = clerkSaid.match(/\b(today|tonight|tomorrow|this (?:week|weekend|afternoon|evening)|next (?:week|month)|(?:on |by |this )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?|in (?:a few|a couple|\d+) days?)\b/i);
      shipmentDay = day ? day[0] : "soon";
    }
  }
  // If the clerk named the specific product they have in (e.g. "Knockout packs"), capture it so
  // we can show it on the In-stock verdict ("In stock — Knockout packs").
  const productName = (() => {
    const v = String(collected.product_name?.value ?? "").trim();
    return v && !/^(n\/?a|none|unclear|unknown|no)$/i.test(v) ? v.slice(0, 80) : null;
  })();

  // Multi-category cascade: each tracked line has its own extraction field.
  const CATEGORY_FIELDS: Record<string, string> = {
    got_pokemon: "Pokémon",
    got_one_piece: "One Piece TCG",
    got_topps_nba: "Topps NBA",
    got_needoh: "NeeDoh",
  };
  const categoryResults: Record<string, boolean | null> = {};
  for (const [field, label] of Object.entries(CATEGORY_FIELDS)) {
    const v = String(collected[field]?.value ?? "").trim().toLowerCase();
    if (v === "yes") categoryResults[label] = true;
    else if (v === "no") categoryResults[label] = false;
    // empty/not-asked → omit
  }
  // If single-field flow didn't yield a top-level answer, fall back to any single category result.
  if (confirmed === null && Object.keys(categoryResults).length === 1) {
    confirmed = Object.values(categoryResults)[0];
  }
  // Fallback: the clerk plainly said they have it in ("we got some", "we got one in", "yeah we have")
  // but the structured extraction came back blank. Count a clear, un-negated affirmative as in stock —
  // even when they never named the exact product. (sold-out / doesn't-carry below still override.)
  if (confirmed === null) {
    // Clause-level read: "Yeah we have them, let me check which sets" must count as a YES —
    // the affirmative and the go-check live in different clauses. A checking-phrase only
    // neutralizes ITS OWN clause ("let me see if we have some" stays neutral).
    const POS = /\b(we (do )?(have|got|carry)|got (some|one|a few|a couple|a bunch|'?em)|have (some|one|a few|a couple|plenty)|we do have|we'?re stocked|in stock|on the shelf|just (got|came) in|came in (today|this)|yeah,? we|yes,? we( do)?\b|there('?s| are| is) (some|a few|plenty|a bunch)|plenty of|whole (wall|section|shelf|display))\b/i;
    const NEG = /\b(don'?t|do not|\bno\b|\bnot\b|never|out of|sold out|sold through|none|nothing|haven'?t|used to|all gone|cleaned out|wiped out|can'?t find)\b/i;
    const SOFT = /\b(let me|i'?ll (check|see|look)|gonna (check|see|look)|going to (check|see|look)|see if|might|maybe|i think|should (have|be getting)|we should)\b/i;
    const clerkLines = (d.transcript ?? []).filter((t) => t.role !== "agent" && t.message).map((t) => String(t.message));
    const clauses = clerkLines.flatMap((l) => l.split(/[,.;!?]|—|–| - /));
    if (clauses.some((c) => POS.test(c) && !NEG.test(c) && !SOFT.test(c))) confirmed = true;
  }

  const transcript = (d.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => `${t.role === "agent" ? "Agent" : "Clerk"}: ${t.message}`)
    .join("\n");

  // Sold out always means "not buyable now" — even if the extraction said yes to "arrived".
  // Conservative on purpose: flip any yes to no rather than risk a false green that sends
  // someone driving to a store with empty shelves. (The per-category descriptions also tell
  // the agent "yes ONLY if buyable right now", so this is belt-and-suspenders.)
  if (soldOut || doesNotSell) {
    confirmed = false;
    for (const k of Object.keys(categoryResults)) if (categoryResults[k] === true) categoryResults[k] = false;
  }

  const status = mapStatus(d);
  // The single customer-facing verdict key (rendered from the statuses registry).
  let statusKey: string;
  if (status === "completed") {
    if (doesNotSell) statusKey = "does_not_sell";
    else if (soldOut) statusKey = "sold_out";
    else if (confirmed === true) statusKey = "in_stock";
    else if (confirmed === false) statusKey = "not_in_stock";
    else {
      // Did the agent actually get to ASK a human, or only navigate the menu before time ran out?
      const agentSaid = transcript.split("\n").filter((l) => l.startsWith("Agent:")).join(" ").toLowerCase();
      const cat = String(vars.category ?? "").toLowerCase();
      const asked = (!!cat && agentSaid.includes(cat)) ||
        /checking to see|got any|in stock|do you (have|carry|sell)|shipment|looking for/.test(agentSaid);
      // Left on hold: the clerk went to check ("let me run up front", "hold on") but the call dropped
      // before they came back with an answer. Distinct from "no clear answer" — it's a near-miss.
      const lastClerk = (d.transcript ?? []).filter((t) => t.role !== "agent" && t.message).map((t) => String(t.message).toLowerCase()).slice(-1)[0] || "";
      const onHold = /(hold on|hang on|one (sec|second|moment|minute)|let me (check|see|look|go (check|look|grab)|run (up|to|and check)|find out|ask)|bear with|give me a (sec|second|minute|moment)|i'?ll (check|go check|be right back)|checking (on|for) (that|you)|let me go)/.test(lastClerk);
      statusKey = onHold ? "left_on_hold" : (asked ? "no_clear_answer" : "nobody_answered");
    }
  } else {
    statusKey = ({ no_answer: "nobody_answered", failed: "failed", closed: "closed" } as Record<string, string>)[status] ?? "nobody_answered";
  }

  // Timing: total connected length + time-to-human (when the first non-agent voice spoke).
  const durationSecs = d.metadata?.call_duration_secs;
  const firstHuman = (d.transcript ?? []).find((t) => t.role !== "agent" && t.message != null);
  const navSecs = firstHuman?.time_in_call_secs ?? null;

  return {
    callId: Number(vars.internal_call_id),
    providerCallId: d.conversation_id,
    confirmed,
    soldOut,
    doesNotSell,
    statusKey,
    categoryResults,
    shipmentDay,
    productName,
    summary: d.analysis?.transcript_summary ?? "",
    transcript,
    durationSecs,
    navSecs,
    status,
    failureReason: explainFailure(d),
  };
}

/** Turn an ElevenLabs termination reason into a plain-English, actionable message. */
function explainFailure(d: ElevenLabsConversation): string | null {
  if (mapStatus(d) !== "failed") return null;
  const raw = (d.metadata?.termination_reason ?? "").trim();
  if (!raw) return "Call failed before it connected (no answer, busy, or carrier rejected it).";
  if (/quota|credit|exceeds your quota/i.test(raw)) {
    return "ElevenLabs is out of credits — top up the ElevenLabs account to place calls. (Not a code issue.)";
  }
  return raw;
}

function mapStatus(d: ElevenLabsConversation): CallOutcome["status"] {
  if (d.status === "failed") return "failed";
  // Agent hit a voicemail / answering machine / "we're closed" recording and bailed.
  if (/voicemail|answering machine|closed/i.test(d.metadata?.termination_reason ?? "")) return "closed";
  const secs = d.metadata?.call_duration_secs ?? 0;
  // Connected and exchanged speech → completed; otherwise treat as no-answer.
  if (secs > 0 && (d.transcript?.some((t) => t.role !== "agent") ?? false)) return "completed";
  return "no_answer";
}

// HMAC-SHA256 verification of the `elevenlabs-signature` header (WebCrypto — Node 18+ / Workers).
async function verifySignature(payload: string, header: string | null, secret?: string): Promise<void> {
  if (!secret) return; // verification disabled (local/dev)
  if (!header) throw new Error("Missing ElevenLabs signature header");
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts["t"];
  const expected = parts["v0"];
  if (!t || !expected) throw new Error("Malformed ElevenLabs signature header");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const actual = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare (length-checked) — avoids a timing side-channel on the HMAC check.
  let diff = actual.length === expected.length ? 0 : 1;
  for (let i = 0; i < actual.length && i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error("Invalid ElevenLabs signature");
}

interface ElevenLabsConversation {
  conversation_id: string;
  status: string; // initiated | in-progress | processing | done | failed
  transcript?: { role: string; message: string | null; time_in_call_secs?: number }[];
  metadata?: { call_duration_secs?: number; termination_reason?: string };
  analysis?: {
    transcript_summary?: string;
    data_collection_results?: Record<string, { value?: string | boolean | null }>;
  };
  conversation_initiation_client_data?: { dynamic_variables?: Record<string, string> };
}

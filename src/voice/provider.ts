// Voice provider abstraction.
//
// The dashboard, scheduler, and DB are all provider-agnostic. The only place
// that knows about a specific voice engine (ElevenLabs today) is the adapter
// that implements this interface. Swap the engine by swapping the impl.

export interface StartCallParams {
  /** Our internal call_results id, round-tripped so we can match the post-call webhook back to the row. */
  callId: number;
  /** E.164 destination, e.g. "+16155551234". */
  toNumber: string;
  /** Context the agent uses to sound natural and on-topic. */
  retailerName: string;
  location: string;
  productName: string;
  /** Fully rendered opening line, e.g. "Hi, I was just checking to see if you got a Pokémon shipment in today?" */
  question: string;
  /** Engine voice id — an ElevenLabs library voice or a cloned voice. */
  voiceId: string;
  /** Override which engine agent handles this call (e.g. restock vs carry-check). Defaults to the configured agent. */
  agentId?: string;
  /** Multi-account pool overrides (concurrency governor): dial this call on a specific EL account.
   *  Undefined → the provider's configured (primary) account, i.e. today's behavior. */
  apiKey?: string;
  phoneNumberId?: string;
  /** What the category means / what does NOT count (e.g. excludes repackaged cards). */
  clarification?: string;
  /** Plain-English IVR/transfer navigation for this store. */
  phoneTree?: string;
  /** Store-specific intel injected into the prompt. */
  specialInstructions?: string;
  /** Other tracked lines this store carries — for the cascade ("if not Pokémon, what about One Piece?"). */
  otherCategories?: string[];
  /** Voicemail handling instruction (master toggle): hang up without leaving a message, or "".
   *  NEITHER of these two is in Charlie's WORDS any more: the owner's rewrite cut the voicemail
   *  section (voicemail is handled before Charlie is ever switched on) and the second-product
   *  section (that feature is not built). Both still ride as variables, because the Admin toggle and
   *  the Listen-live multi-select are real and unchanged, and the day either section comes back it
   *  comes back to a lane that already carries its value. */
  voicemailPolicy?: string;
  /** Personality/tone for an open conversation (injected into the agent prompt). */
  personalityTone?: string;
  /** Greeting line the agent uses once the other person speaks. Charlie's own words no longer carry
   *  it: Delta asks the question. It survives inside the joining Charlie's one extra instruction. */
  openingLine?: string;
  /** Kiosk-only store (vending machine, no staffed counter): the agent asks if the kiosk is
   *  working/stocked instead of asking about a shelf shipment. Fills `kiosk_note` with section 4,
   *  or with nothing at all on every other check. */
  kioskMode?: boolean;
  /** THE WRONG-DEPARTMENT SAVE (policy.flags.askForTransfer). On = if we land somewhere that cannot
   *  answer, the agent asks to be put through and asks again when somebody new picks up, instead of
   *  the check failing and the customer paying for a retry. Chooses which of section 5's two texts
   *  fills `department_note`. */
  askForTransfer?: boolean;
  /** The set name section 10's example question carries. Fills `set_example`; empty falls back to
   *  `SET_EXAMPLE`, which is the owner's ruling (08-05) and the only place it changes. */
  setExample?: string;
}

export interface StartCallResult {
  /** Engine-side id (e.g. ElevenLabs conversation id) for correlation/debugging. */
  providerCallId: string;
  /** Twilio call SID when the engine reports it — lets us hang up the live call (zone/single cancel). */
  callSid?: string;
}

/** Normalized post-call payload, after the adapter parses the engine's webhook. */
export interface CallOutcome {
  callId: number;                 // our internal id, recovered from dynamic vars
  providerCallId: string;
  /** true = clerk confirmed the product is buyable RIGHT NOW, false = not in, null = unclear/no answer. */
  confirmed: boolean | null;
  /** A shipment arrived but it has since sold out — not buyable now (confirmed will be false). */
  soldOut?: boolean;
  /** The store doesn't carry this category at all (different from "out of stock right now"). */
  doesNotSell?: boolean;
  /** Key into the statuses registry — the single customer-facing verdict for this call. */
  statusKey?: string;
  /** Per-category outcomes from a multi-category call, keyed by category label → in-stock? */
  categoryResults: Record<string, boolean | null>;
  /** Day the clerk said shipments usually arrive, if asked/heard. */
  shipmentDay: string | null;
  /** Time of day the clerk gave for the shipment, if any (e.g. "around 2 PM", "the morning"). */
  shipmentTime?: string | null;
  /** The specific product the clerk named as in stock, if any (e.g. "Knockout packs"). */
  productName?: string | null;
  summary: string;                // short summary of what the clerk said
  transcript: string;             // text only — we never persist audio
  /** Total connected call length in seconds (from the provider). */
  durationSecs?: number;
  /** Seconds spent navigating the phone tree before a human first spoke (time-to-human). null if never reached. */
  navSecs?: number | null;
  steps?: { n: number; at: number }[]; // real step ladder from the transcript clock (liveStageLabel numbering)
  status: "completed" | "no_answer" | "failed" | "closed";
  /** Why a call ended early, in plain English (e.g. quota exceeded). Only set on failures. */
  failureReason?: string | null;
}

export interface VoiceProvider {
  /** Place an outbound call. Returns immediately; the outcome arrives later via webhook or polling. */
  startCall(p: StartCallParams): Promise<StartCallResult>;
  /** Parse and verify the engine's post-call webhook into a normalized outcome (used when deployed publicly). */
  parseWebhook(req: Request): Promise<CallOutcome>;
  /** Fetch a call's current outcome by its provider id (used to poll results when no public webhook is available). */
  getConversation(providerCallId: string): Promise<CallOutcome | null>;
  /** Push prompt + voice-tuning changes to a live agent (cadence/warmth sliders, prompt edits). */
  updateAgent(agentId: string, patch: AgentTuning): Promise<void>;
}

/** Tunable agent settings the dashboard can push to the live engine. */
export interface AgentTuning {
  prompt?: string;
  voiceId?: string;     // ElevenLabs voice id to speak as (selector / cloned voices)
  llm?: string;         // which LLM powers the agent (e.g. claude-sonnet-4-6, claude-haiku-4-5)
  speed?: number;       // TTS rate (<1 slower/warmer)
  stability?: number;   // lower = more expressive inflection
  similarityBoost?: number;
  style?: number;       // style/expressiveness exaggeration (0 = none, higher = more emotion, too high = artifacts)
  speakerBoost?: boolean; // presence/clarity boost
  latency?: number;     // optimize_streaming_latency 0-4 (lower = more natural prosody, higher = faster/robotic)
  modelId?: string;     // TTS model: English agents -> eleven_turbo_v2 | eleven_flash_v2
  turnEagerness?: string; // "patient" | "normal" | "eager" — the "beat": how long it waits before replying
  turnTimeout?: number;   // seconds of silence before the agent takes its turn (lower = snappier)
  softTimeoutSecs?: number; // presence-filler delay in seconds; -1 disables the filler
  softTimeoutMsg?: string;  // what it says on a long pause when the filler is enabled
  maxTokens?: number;
}

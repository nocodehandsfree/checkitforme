// CHARLIE'S REPLIES, MADE BY OUR OWN BRAIN, SPOKEN IN HIS OWN VOICE (owner's go, 2026-08-20).
//
// THE ROAD THAT WAS BLOCKED, AND THE ROAD THIS TAKES. The old plan plugged our brain INTO the voice
// provider's conversation service, and they refuse that on any agent using a quick-made voice copy
// (`src/calls/brain.ts` carries the refusal, re-tested twice). Every voice we call with is one, so
// that road is closed and the owner ruled we do not go down it again.
//
// This is the other road, and nothing about it is new machinery: it is exactly how his fresh
// "Oh, hey!" already reaches a store. WE run the conversation. Echo keeps listening and writing down
// what Staff say, exactly as it does today. Our own brain writes the reply from those words. The
// voice provider's PLAIN SPEECH service — the same one the opening question, the hold reply and the
// little hello already use — says that reply in the same voice.
//
// IT WEARS THE PROVIDER'S OWN CLOTHES ON PURPOSE. This object speaks the same message protocol the
// hosted session speaks, so the bridge does not know or care which one it is holding: every rule
// built into that file still runs, unchanged. Nothing plays over the person, a recognised hold
// means Charlie is off, the two-word hello still comes first when a person returns, and words that
// land while he is talking are handed to him the moment he stops. A second implementation of any of
// those rules is exactly what would drift.
//
// NO CONVERSATION AUDIO AND NO CONVERSATION TEXT IS KEPT HERE. The turns live for the length of one
// call in memory, are used to write the next line, and go with the call. Nothing is written to disk,
// to a log or to the receipt; the receipt records WHICH brain answered, never what was said.
import { EventEmitter } from "node:events";
import { brainReply } from "../calls/brain";
import { phoneClip, toMediaFrames } from "../calls/clip-cache";
import { RESTOCK_PROMPT, joiningPrompt } from "./prompts";

export interface OurBrainOpts {
  /** The same variables the hosted agent's prompt is filled with, so his instructions are identical. */
  dynamicVars: Record<string, string>;
  /** His voice. Without one there is nothing to speak with and the caller must not open this. */
  voiceId: string;
  voiceTuning?: Record<string, unknown>;
  apiKey?: string;
  log: (s: string) => void;
  /** HE IS JOINING A CALL ALREADY IN PROGRESS: the recorded question has asked and Staff are about
   *  to answer it. The same standing rule the provider's joining agent is configured with, so this
   *  lane cannot greet them or ask the question a second time either. */
  joining?: boolean;
  /** This check's own name. It becomes the conversation id, because there is no conversation at the
   *  voice provider to name: every door that settles a check asks them for the outcome, and on this
   *  lane that question is answered off our own record instead. */
  room: string;
  /** OUR SIDE STUMBLED MID CALL. The runtime hands the call back to the provider's hosted agent in
   *  the same voice and the person never notices — the fallback is law (spec §7, rung two). */
  onStumble: (why: string) => void;
  /** WHAT THIS TURN REALLY COST OUTSIDE (owner's order, 08-20, fix 3). Reported the moment each
   *  charge happens: the tokens Anthropic read and wrote for the reply, and the characters
   *  ElevenLabs was really asked to say. Both go straight onto the check's own record, so the money
   *  on the sheet is measured and never worked out backwards from a transcript. */
  onSpend?: (spend: { inTokens: number; outTokens: number; spokenChars: number; model: string }) => void;
}

/** The longest a reply may be. His instructions already say ONE short sentence; this is the ceiling
 *  under that, so a model having a bad day cannot read an essay at a store. */
const MOST_REPLY_TOKENS = 120;

/**
 * A session that quacks exactly like the provider's conversation socket.
 *
 * What the bridge does to it: `on("open"|"message"|"close"|"error")`, `emit("message", …)` to push a
 * line in, `send(json)`, `close()`, and reads `readyState`. Everything it sends back is one of the
 * message types the bridge already handles.
 */
export class OurBrainSession extends EventEmitter {
  /** 1 = open, 3 = closed. The bridge reads this before every send, the way it reads a real socket. */
  readyState = 1;
  private o: OurBrainOpts;
  private system: string;
  private turns: Array<{ role: string; content: string }> = [];
  /** What Staff have said that he has not answered yet. He answers one turn at a time; anything that
   *  lands while he is still writing rides the next one, which is the same rule the bridge follows
   *  on its own side (owner, 08-20: words that arrive while he is talking are handed when he stops). */
  private waiting: string[] = [];
  private busy = false;
  private closed = false;
  /** Which brain really answered, and how long each reply took. For the record only. */
  brainModelUsed = "";
  lastThinkMs = 0;
  lastSpeakMs = 0;

  constructor(o: OurBrainOpts) {
    super();
    this.o = o;
    // HIS OWN INSTRUCTIONS, WORD FOR WORD. The hosted agent is configured with this same prompt and
    // these same variables (src/calls/service.ts fills it the identical way), so moving where the
    // thinking happens can never change what he was told to do.
    const base = o.joining ? joiningPrompt(RESTOCK_PROMPT) : RESTOCK_PROMPT;
    this.system = base.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => o.dynamicVars[k] ?? "");
    // The socket is already up: there is nothing to dial. Announced on the next tick so the caller
    // has finished wiring its handlers, exactly as a real socket's open lands after the constructor.
    setTimeout(() => {
      if (this.closed) return;
      this.emit("open");
      this.say({ type: "conversation_initiation_metadata", conversation_initiation_metadata_event: { conversation_id: `ours:${this.o.room}` } });
    }, 0);
  }

  /** Push one of the provider's own message shapes back at the bridge. */
  private say(m: Record<string, unknown>): void {
    if (this.closed) return;
    this.emit("message", Buffer.from(JSON.stringify(m)));
  }

  send(raw: string): void {
    if (this.closed) return;
    let m: { type?: string; text?: string; user_audio_chunk?: string };
    try { m = JSON.parse(raw) as typeof m; } catch { return; }
    // THE CALL'S AUDIO IS NOT OURS TO HEAR. Echo listens on the pickup fork and writes every word
    // down; this session is handed those words as turns. Frames are dropped on the floor rather
    // than sent anywhere, which is also why this lane costs nothing to listen with.
    if (m.user_audio_chunk !== undefined) return;
    if (m.type === "conversation_initiation_client_data") return;   // already answered, above
    if (m.type === "pong") return;
    if (m.type === "contextual_update") {
      // A NOTE, NEVER A THING TO ANSWER — the same meaning it has on the hosted session. It rides
      // as an assistant-side aside so the next reply knows it, and draws no reply of its own.
      const t = String(m.text || "").trim();
      if (t) this.turns.push({ role: "assistant", content: t });
      return;
    }
    if (m.type === "user_message") {
      const t = String(m.text || "").trim();
      if (!t) return;
      this.waiting.push(t);
      void this.think();
    }
  }

  /** Write the reply, then say it. One at a time, oldest words first. */
  private async think(): Promise<void> {
    if (this.busy || this.closed || !this.waiting.length) return;
    this.busy = true;
    try {
      const said = this.waiting.splice(0, this.waiting.length).join("\n");
      this.turns.push({ role: "user", content: said });
      const reply = await brainReply(this.system, this.turns, MOST_REPLY_TOKENS);
      if (this.closed) return;
      // WHAT HE SAYS OUT LOUD, AND NOTHING ELSE (check 426: the store heard "have a good one!
      // end_call"). His instructions name the tools the hosted agent is given, and a model writing
      // the words instead of using the tool would otherwise read the tool's name at a person.
      const text = reply.text
        .replace(/\b(end_call|transfer_to_number|transfer_to_agent|skip_turn)\b/gi, "")
        .replace(/\s+/g, " ").trim();
      this.brainModelUsed = reply.model;
      this.lastThinkMs = reply.ms;
      if (!text) { this.o.onStumble("our brain answered with nothing"); return; }
      this.turns.push({ role: "assistant", content: text });
      // HIS WORDS FIRST, HIS SOUND AFTER, exactly the order the hosted session sends them in: the
      // bridge records the line and then plays the frames, and it decides whether either is allowed
      // out at all. Nothing here may reach the line on its own.
      this.say({ type: "agent_response", agent_response_event: { agent_response: text } });
      const startedSpeaking = Date.now();
      const clip = await phoneClip(this.o.voiceId, text, this.o.voiceTuning || {}, this.o.apiKey, true);
      if (this.closed) return;
      if (!clip || !clip.audio.length) { this.o.onStumble("his voice could not be made for that line"); return; }
      this.lastSpeakMs = Date.now() - startedSpeaking;
      // BOTH BILLS FOR THIS TURN, ON THE CHECK'S OWN RECORD. His line was fresh, so ElevenLabs
      // really charged for every character of it, and our own account really paid to write it.
      try {
        this.o.onSpend?.({ inTokens: reply.inTokens, outTokens: reply.outTokens, spokenChars: clip.charsBilled, model: reply.model });
      } catch { /* the money count must never break a call */ }
      for (const f of toMediaFrames(clip.audio)) this.say({ type: "audio", audio_event: { audio_base_64: f } });
      this.o.log(`our brain: "${text.slice(0, 60)}" — ${reply.ms}ms to write on ${reply.model}, ${this.lastSpeakMs}ms to speak, ${clip.ms}ms of sound`);
    } catch (e) {
      this.o.onStumble(`our brain failed: ${String(e).slice(0, 120)}`);
    } finally {
      this.busy = false;
      // Anything Staff said while he was writing that one is his next turn, at once.
      if (this.waiting.length && !this.closed) void this.think();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.turns = [];       // the conversation goes with the call
    this.waiting = [];
    setTimeout(() => this.emit("close", 1000), 0);
  }
}

/** Open one. Kept as a function so the bridge reads the same either way. */
export function openOurBrainSession(o: OurBrainOpts): OurBrainSession {
  return new OurBrainSession(o);
}

// Custom telephony bridge: Twilio <Connect><Stream>  <->  ElevenLabs ConvAI WebSocket, with a
// browser fork. Both legs are ulaw_8000, so audio is a straight passthrough. Nothing is persisted —
// frames are relayed live and dropped. This is what unlocks live audio + per-customer caller ID.
import { WebSocket } from "ws";
import { config } from "../config";

export interface BridgeContext {
  agentId: string;
  // Multi-account pool (concurrency governor): open EL on this account's key when set; else the
  // configured primary account (today's behavior). Caller-ID and everything else unchanged.
  apiKey?: string;
  dynamicVars: Record<string, string>;
  onConversationId?: (id: string) => void;
  // Deterministic keypad presses, e.g. "0@3" = send the DTMF tone for 0 three seconds after the
  // call connects ("1@3,0@9" chains presses). The turn-taking model never wakes the LLM DURING a
  // continuous recorded greeting, so the agent physically cannot press keys then — the bridge
  // does it instead, in code, every time.
  dtmf?: string;
  // Deterministic SPOKEN navigation (Bravo voice IVRs like CVS), e.g. "no@17,front@28,general@48" =
  // speak each word (cheap Polly TTS) at that many seconds from connect, BEFORE opening ElevenLabs.
  // The voice twin of `dtmf` — lets us navigate a voice menu with $0 of the expensive agent.
  say?: string;
  // Connect-on-human (cost saver, OFF by default): don't open the ElevenLabs (billed) session until a
  // human is detected. Twilio handles dial + DTMF + hold for free; ElevenLabs then bills only talk-time.
  connectOnHuman?: boolean;
  // Deterministic hand-off: open ElevenLabs at this many seconds from connect (the LEARNED time-to-human
  // from the locked recipe). Far more reliable than VAD, which trips on the IVR's own recorded voice.
  connectAtSec?: number;
  holdMaxSeconds?: number; // fallback: connect anyway after this many seconds even if no human is detected
  // Give-up cap (bail.ringMaxSeconds, gated on bail.enabled): once the billed agent has joined, if NO
  // real human words arrive within this many seconds, hang the call up. Bounds the "desk rings out,
  // nobody ever answers" case, where the agent otherwise sits billing on a ringing line (the 07-24
  // 16-cent Target call). Voicemail and menus produce words, so they clear it; only true no-pickup fires it.
  giveUpSeconds?: number;
  // Smart join (owner design): the second the recipe's LAST press/word is done (+ settle), open the
  // ear. Charlie joins on a real voice, never on a timer; no voice by earFromSec+giveUpSeconds ends
  // the call with Charlie never billed. Requires giveUpSeconds (bail on) so a call can't ride forever.
  earFromSec?: number;
  // Per-call VOICE + TTS tuning from the assigned workflow (Voice→Designer). Applied as a minimal
  // conversation_config_override.tts ONLY when set — default calls send no override (the override path
  // is otherwise left untouched, since overriding prompt/first-message there once hung calls up).
  voiceId?: string;
  voiceTuning?: Record<string, unknown>;
  // PERMANENT record that this call HAD a nav plan. `dtmf`/`say` are CONSUMED (nulled) by
  // takeBridgeDtmf/takeBridgeSay when the inline TwiML is built — before the media stream ever
  // starts — so any later gate reading them sees empty and thinks the store is direct. That dead
  // gate let VAD run on tree stores, trip on the IVR's recording, and open the billed agent into
  // the middle of the phone tree (owner 07-22: "Charlie was listening to phone trees"). These
  // flags are stamped at context-set time and never consumed, so the VAD gate stays truthful.
  hadDtmf?: boolean;
  hadSay?: boolean;
}
const contexts = new Map<string, BridgeContext>();
export function setBridgeContext(room: string, ctx: BridgeContext) {
  ctx.hadDtmf = !!ctx.dtmf;
  ctx.hadSay = !!ctx.say;
  contexts.set(room, ctx);
  setTimeout(() => contexts.delete(room), 5 * 60 * 1000); // auto-expire
}

// conversation_id -> seconds spent navigating before the human was reached (connect-on-human mode).
// Ingest reads + clears this so the call result records true time-to-human even though ElevenLabs
// (which only joins at human pickup) never saw the nav phase.
const navByConv = new Map<string, number>();
export function takeBridgeNav(convId: string): number | null {
  const v = navByConv.get(convId);
  if (v == null) return null;
  navByConv.delete(convId);
  return v;
}

/** Consume the room's keypad shortcut for TwiML <Play digits> (real carrier DTMF signaling —
 *  IVRs listen for that, not for in-band audio tones). Consuming it here keeps the bridge's
 *  in-band injection from double-pressing. */
export function takeBridgeDtmf(room: string): string | null {
  const ctx = contexts.get(room);
  if (!ctx?.dtmf) return null;
  const d = ctx.dtmf;
  ctx.dtmf = undefined;
  return d;
}

/** Consume the room's SPOKEN nav plan ("word@seconds,…") for TwiML <Say> before the stream — the
 *  voice twin of takeBridgeDtmf. Navigates a voice IVR with cheap Polly TTS, no expensive agent. */
export function takeBridgeSay(room: string): string | null {
  const ctx = contexts.get(room);
  if (!ctx?.say) return null;
  const s = ctx.say;
  ctx.say = undefined;
  return s;
}

// room -> ElevenLabs conversation id (so Runnr can poll transcript/result for a bridged call)
const conversations = new Map<string, string>();
export function bridgeConversationId(room: string): string | null { return conversations.get(room) ?? null; }

// Live-call count for graceful deploys: a deploy restart once killed the owner's call mid-air
// (EL "Client disconnected: 1006", 2026-07-02). The SIGTERM handler in server.ts waits on this
// before letting the old instance exit.
let activeCalls = 0;
export function activeBridgeCalls(): number { return activeCalls; }

// In-memory event log so we can diagnose the bridge live (logs aren't surfacing in Railway).
const debugLog: string[] = [];
function log(msg: string) { debugLog.push(new Date().toISOString().slice(11, 23) + " " + msg); if (debugLog.length > 300) debugLog.shift(); }
export function bridgeDebug(): string[] { return debugLog.slice(-60); }
/** Allow the server (listen-socket relay) to write into the same diagnostic log. */
export function bridgeLog(msg: string) { log(msg); }

async function signedUrl(agentId: string, apiKey?: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { "xi-api-key": apiKey || config.voice.apiKey } });
    if (!r.ok) { log(`signedUrl HTTP ${r.status}: ${(await r.text()).slice(0, 80)}`); return null; }
    const d = (await r.json()) as { signed_url?: string };
    return d.signed_url ?? null;
  } catch (e) { log(`signedUrl threw: ${String(e).slice(0, 80)}`); return null; }
}

// ---- μ-law energy (voice-activity detection for connect-on-human) ----
const ULAW_BIAS = 0x84;
function ulawByteToLinear(u: number): number {
  u = ~u & 0xff;
  let t = ((u & 0x0f) << 3) + ULAW_BIAS;
  t <<= (u & 0x70) >> 4;
  return (u & 0x80) ? (ULAW_BIAS - t) : (t - ULAW_BIAS);
}
/** Mean absolute amplitude of a base64 μ-law frame (~0 silence, higher = louder). */
function frameEnergy(b64: string): number {
  let buf: Buffer; try { buf = Buffer.from(b64, "base64"); } catch { return 0; }
  if (!buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += Math.abs(ulawByteToLinear(buf[i]));
  return sum / buf.length;
}

// ---- DTMF tone synthesis (μ-law 8 kHz, same format as the Twilio stream) ----
// G.711 μ-law encode one 16-bit PCM sample.
function linearToMulaw(sample: number): number {
  const BIAS = 0x84, CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) { /* find */ }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

/** The dual-tone for one keypad digit as μ-law 8 kHz bytes (telephone-line DTMF, ~280 ms). */
function dtmfTone(digit: string, ms = 280): Buffer {
  const [lo, hi] = DTMF_FREQS[digit] ?? DTMF_FREQS["0"];
  const n = Math.round((8000 * ms) / 1000);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const t = i / 8000;
    const v = Math.round((Math.sin(2 * Math.PI * lo * t) + Math.sin(2 * Math.PI * hi * t)) * 0.45 * 32767);
    out[i] = linearToMulaw(v);
  }
  return out;
}

// Handle one Twilio bridge socket. `fanout` forwards audio frames to browser listeners in a room.
export function handleTwilioBridge(twilio: WebSocket, room: string, fanout: (room: string, b64: string, track: string) => void, relayLine?: (room: string, role: string, text: string) => void, relayEnd?: (room: string) => void) {
  let streamSid = "";
  let eleven: WebSocket | null = null;
  let ready = false;
  let frames = 0;
  let ended = false;
  const signalEnd = () => { if (ended) return; ended = true; try { relayEnd?.(room); } catch { /* best-effort */ } };
  const pending: string[] = []; // store audio buffered until the agent WS is ready
  let ctx = room ? contexts.get(room) : undefined;
  activeCalls++;
  // connect-on-human state
  let connecting = false;     // true once we've committed to opening ElevenLabs (buffer from here)
  let humanAtMs = 0;          // when a human was detected (connect-on-human)
  let lastDtmfMs = 0;         // ms-after-start of the last scheduled keypress (VAD waits past this)
  let voiced = 0;             // consecutive voiced frames
  let giveUpTimer: NodeJS.Timeout | null = null; // armed at connect when ctx.giveUpSeconds is set
  let humanWords = false;     // a real store-side transcript line arrived (letters, not "..." junk)
  let earArmed = false;       // smart join: the menu is done, the ear is open for a real voice
  const startMs = Date.now();
  const VOICE_THRESH = 350;   // μ-law mean-abs energy that counts as "someone's talking" (tunable)
  const VOICE_FRAMES = 45;    // ~0.9s of sustained voice → treat as a human (tunable)
  // Echo gate: PSTN lines reflect OUR agent's audio back on the inbound track (no carrier AEC on
  // media streams), and ElevenLabs then transcribes its own attenuated words as the clerk. We know
  // exactly when agent audio is playing (we sent it), so while it plays — plus a short reflection
  // tail — inbound frames are forwarded only if they're loud enough to be a REAL barge-in; line
  // echo comes back well attenuated. Browser fanout is never gated (listeners hear the true line).
  let agentPlayingUntil = 0;  // ms epoch when the queued agent audio finishes playing out
  let echoDropped = 0;        // suppressed-frame counter (logged sparsely for bench tuning)
  // 07-17 retune (owner: agent missed his name said around agent speech): real phone speech often
  // sits in the 350–900 energy band, so a 900 gate ate genuine clerk words spoken over or right
  // after the agent — not just echo, which comes back well attenuated (≲300). Gate lower + shorter.
  const ECHO_TAIL_MS = 150;   // reflection tail after playback ends (was 250)
  const BARGE_THRESH = 520;   // inbound energy that still counts as a human talking (was 900)
  log(`twilio connected room=${room.slice(0, 8)} ctx=${!!ctx}`);

  async function connectEleven() {
    if (!ctx) { log("connectEleven: NO CONTEXT"); return; }
    connecting = true; // from now, buffer inbound audio for the agent
    const c = ctx; // narrowed
    const url = await signedUrl(c.agentId, c.apiKey);
    if (!url) { log("connectEleven: no signed url -> abort"); return; }
    log("connectEleven: opening ElevenLabs WS");
    eleven = new WebSocket(url);
    eleven.on("open", () => {
      log("eleven WS open -> sending init");
      const init: Record<string, unknown> = { type: "conversation_initiation_client_data", dynamic_variables: c.dynamicVars };
      // Workflow voice: minimal per-call TTS override (voice + any tuning). Only when a workflow set
      // one — default calls send nothing extra, so the historically-flaky override path stays dormant.
      if (c.voiceId) {
        const tts: Record<string, unknown> = { voice_id: c.voiceId, ...(c.voiceTuning || {}) };
        init.conversation_config_override = { tts };
        log(`eleven init: voice override ${c.voiceId}`);
      }
      eleven!.send(JSON.stringify(init));
    });
    eleven.on("message", (data: Buffer) => {
      let m: { type?: string; audio_event?: { audio_base_64?: string }; ping_event?: { event_id?: number }; conversation_initiation_metadata_event?: { conversation_id?: string }; user_transcription_event?: { user_transcript?: string }; agent_response_event?: { agent_response?: string } };
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type === "conversation_initiation_metadata") {
        ready = true;
        // Robustly find the conversation_id anywhere in the metadata message.
        const find = (o: unknown): string | null => {
          if (!o || typeof o !== "object") return null;
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            if (k === "conversation_id" && typeof v === "string") return v;
            const r = find(v); if (r) return r;
          }
          return null;
        };
        const convId = find(m);
        if (convId) { conversations.set(room, convId); setTimeout(() => conversations.delete(room), 10 * 60 * 1000); if (c.connectOnHuman && humanAtMs) navByConv.set(convId, Math.max(0, Math.round((humanAtMs - startMs) / 1000))); log(`metadata: convId=${convId}`); try { c.onConversationId?.(convId); } catch (e) { log(`onConversationId threw: ${String(e).slice(0, 80)}`); } }
        else log(`metadata but NO convId: ${JSON.stringify(m).slice(0, 200)}`);
        for (const p of pending) eleven!.send(JSON.stringify({ user_audio_chunk: p }));
        pending.length = 0;
      } else if (m.type === "audio") {
        const b64 = m.audio_event?.audio_base_64;
        if (b64 && twilio.readyState === 1) {
          twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
          fanout(room, b64, "agent");
          // Extend the echo-gate window by this chunk's real playout time (μ-law 8kHz = 8 bytes/ms);
          // Twilio plays queued audio sequentially, so chunks extend the window back-to-back.
          const ms = Math.ceil((b64.length * 3) / 4 / 8);
          agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + ms;
        }
      } else if (m.type === "user_transcript") {
        const txt = m.user_transcription_event?.user_transcript;
        // Real words on the store side (letters, not ringback transcribed as "...") = someone IS
        // there — disarm the give-up cap. Voicemail greetings count: the voicemail bail handles those.
        if (txt && /[a-zA-ZÀ-ɏ]{2,}/.test(String(txt)) && !humanWords) { humanWords = true; if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } }
        if (txt) try { relayLine?.(room, "Clerk", String(txt)); } catch { /* relay best-effort */ }
        // VOICEMAIL = hang up NOW, not after the greeting plays out (owner 07-22: "as soon as it
        // starts hearing the voice message it should hang up to save us money"). Same phrases the
        // outcome mapper stamps `voicemail` from, so the verdict stays consistent. Closing the
        // stream ends the TwiML <Connect> → Twilio hangs the PSTN leg; the EL leg closes with it.
        if (txt && /\b(leave (?:a|your) message|after the (?:tone|beep)|at the (?:tone|beep)|voice ?mail|mailbox|record your message|is not available|unable to take your call|has been forwarded to)\b/i.test(String(txt))) {
          log(`voicemail greeting detected -> hanging up to save the call minutes`);
          signalEnd(); try { eleven?.close(); } catch { /* torn down */ } try { twilio.close(); } catch { /* torn down */ }
        }
      } else if (m.type === "agent_response") {
        const txt = m.agent_response_event?.agent_response; if (txt) try { relayLine?.(room, "Agent", String(txt)); } catch { /* relay best-effort */ }
      } else if (m.type === "ping") {
        eleven!.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id }));
      } else if (m.type === "interruption") {
        if (twilio.readyState === 1) twilio.send(JSON.stringify({ event: "clear", streamSid }));
        agentPlayingUntil = 0; // Twilio's playout buffer was cleared — nothing of ours is on the line now
      }
    });
    eleven.on("close", (code: number) => { log(`eleven WS close code=${code} (frames in=${frames})`); signalEnd(); if (twilio.readyState === 1) twilio.close(); });
    eleven.on("error", (e: Error) => log(`eleven WS error: ${e.message}`));
  }

  // Bridge-injected keypad presses (see BridgeContext.dtmf). Press happens in code at a fixed
  // time after connect — no dependence on the LLM getting a turn during the recording.
  const dtmfTimers: NodeJS.Timeout[] = [];
  function sendDigit(digit: string) {
    if (twilio.readyState !== 1 || !streamSid) { log(`dtmf ${digit}: socket not ready, skipped`); return; }
    const b64 = dtmfTone(digit).toString("base64");
    twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
    fanout(room, b64, "agent"); // the live listener hears the beep — confirmation it fired
    log(`dtmf sent: ${digit}`);
  }
  function scheduleDtmf(spec: string) {
    for (const m of spec.matchAll(/([0-9*#])\s*@\s*(\d+(?:\.\d+)?)/g)) {
      const digit = m[1], delayMs = Number(m[2]) * 1000;
      lastDtmfMs = Math.max(lastDtmfMs, delayMs);
      dtmfTimers.push(setTimeout(() => sendDigit(digit), delayMs));
      log(`dtmf scheduled: ${digit} @ ${m[2]}s`);
    }
  }
  // Connect-on-human: open ElevenLabs once (human detected or hold-timeout fallback).
  function triggerConnect(reason: string) {
    if (connecting) return;
    humanAtMs = Date.now();
    log(`connect-on-human: connecting (${reason}) after ${Math.round((humanAtMs - startMs) / 1000)}s nav`);
    connectEleven();
    // Give-up cap: the agent is now billing. If no real human words land within giveUpSeconds,
    // nobody is coming to the phone — end the call instead of paying to listen to it ring.
    const gu = ctx?.giveUpSeconds;
    if (gu && gu > 0 && !giveUpTimer) {
      giveUpTimer = setTimeout(() => {
        if (humanWords) return;
        log(`give-up: no human words ${gu}s after connect — hanging up (bail.ringMaxSeconds)`);
        try { if (eleven) eleven.close(); } catch { /* best effort */ }
        try { twilio.close(); } catch { /* best effort */ }
      }, gu * 1000);
    }
  }
  // VAD on inbound (store-side) audio: after the keypad nav has had time to finish, sustained voice
  // ⇒ a human is on the line ⇒ bring in the (billed) agent. Imperfect vs hold music — bench-test/tune.
  function maybeDetectHuman(b64: string) {
    if (connecting) return;
    if (Date.now() - startMs < lastDtmfMs + (lastDtmfMs ? 1500 : 300)) return; // settle after keypad nav; on a direct dial only skip the connect click, so the OPENING greeting still counts
    // Direct-dial stores (no keypad nav) ring straight to a person. Detect the greeting FAST and tolerate
    // the pause right after it — a quick "Hello, Fun store" then silence used to take ~20s to trip the old
    // 0.9s-unbroken gate, so the agent sat silent and the caller hung up (owner 07-07). Tree stores keep
    // the stricter gate (a slower, sustained read is safer against hold music).
    const direct = !lastDtmfMs;
    const need = direct ? 22 : VOICE_FRAMES;   // ~0.45s of voice on a direct dial vs ~0.9s through a tree
    const leak = direct ? 0.34 : 1;            // slow leak so the pause between greeting words doesn't reset progress
    if (frameEnergy(b64) > VOICE_THRESH) { if ((voiced += 1) >= need) triggerConnect("human"); }
    else voiced = Math.max(0, voiced - leak);
  }

  twilio.on("message", (data: Buffer) => {
    let m: { event?: string; start?: { streamSid?: string; customParameters?: { room?: string } }; media?: { payload?: string } };
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.event === "start") {
      streamSid = m.start?.streamSid || streamSid;
      if (!room && m.start?.customParameters?.room) room = m.start.customParameters.room; // Twilio puts <Parameter> here
      if (!ctx && room) ctx = contexts.get(room);
      if (ctx?.dtmf) scheduleDtmf(ctx.dtmf);
      if (ctx?.connectOnHuman) {
        if (ctx.connectAtSec && ctx.connectAtSec > 0) {
          // Deterministic: open the agent at the learned time-to-human. No VAD guesswork.
          if (ctx.earFromSec && ctx.earFromSec > 0 && ctx.giveUpSeconds && ctx.giveUpSeconds > 0) {
            // SMART JOIN (owner design, restored 07-24): deaf while the recipe walks the menu — the
            // ear can never hear a recorded menu voice (the 07-20 mistake was listening DURING the
            // menu). The ear opens right after the last press/word; Charlie joins only on a real
            // voice. Nobody ever answers → Charlie never joins; the call ends at ear+ringMaxSeconds
            // for a phone-line-only cost. The learned time (connectAtSec) stays on the recipe as
            // its record; it no longer blind-joins when the smart path is armed.
            const earAt = ctx.earFromSec, quit = ctx.giveUpSeconds;
            // The give-up clock starts at the LEARNED arrival time, not at menu-end: on chains with a
            // transfer hold (CVS: menu done 48s, human ~67s) quitting at menu-end+20s would hang up
            // right as staff normally pick up.
            const quitAt = Math.max(earAt, ctx.connectAtSec || 0) + quit;
            log(`twilio start room=${room.slice(0, 8)} -> connect-on-human EAR: deaf through the menu until ${earAt}s, join on a real voice, give up at ${quitAt}s if nobody comes`);
            dtmfTimers.push(setTimeout(() => { earArmed = true; }, earAt * 1000));
            dtmfTimers.push(setTimeout(() => {
              if (connecting || humanWords) return;
              log(`give-up: no voice by ${quitAt}s — nobody is coming, hanging up (Charlie never joined)`);
              try { if (eleven) eleven.close(); } catch { /* best effort */ }
              try { twilio.close(); } catch { /* best effort */ }
            }, quitAt * 1000));
          } else {
            log(`twilio start room=${room.slice(0, 8)} -> connect-on-human TIMER: connect at ${ctx.connectAtSec}s`);
            dtmfTimers.push(setTimeout(() => triggerConnect("recipe-timer"), ctx.connectAtSec * 1000));
          }
        } else {
          log(`twilio start room=${room.slice(0, 8)} -> connect-on-human (VAD; deferring ElevenLabs until a human)`);
          dtmfTimers.push(setTimeout(() => triggerConnect("hold-timeout"), (ctx.holdMaxSeconds ?? 45) * 1000));
        }
      } else {
        log(`twilio start room=${room.slice(0, 8)} ctx=${!!ctx} -> connectEleven`);
        connectEleven();
      }
    }
    else if (m.event === "media" && m.media?.payload) {
      frames++;
      const b64 = m.media.payload;
      fanout(room, b64, "clerk"); // store/clerk audio -> browser (never gated — listeners hear the true line)
      // Echo gate: while our agent audio is playing (+ reflection tail), only a LOUD inbound frame
      // (a real human barging in) reaches ElevenLabs — attenuated line echo of the agent's own voice
      // is dropped, so it can't come back as a phantom "Clerk:" transcript line.
      const echoWindow = Date.now() < agentPlayingUntil + ECHO_TAIL_MS;
      const suppress = echoWindow && frameEnergy(b64) < BARGE_THRESH;
      if (suppress) { if (++echoDropped % 200 === 1) log(`echo gate: suppressing agent playback echo (dropped=${echoDropped})`); }
      else if (eleven && ready) eleven.send(JSON.stringify({ user_audio_chunk: b64 }));
      else if (connecting) pending.push(b64);          // committed to connect → buffer for the agent
      else if (earArmed || (ctx?.connectOnHuman && !ctx.connectAtSec && !ctx.hadDtmf && !ctx.hadSay)) maybeDetectHuman(b64); // The ear runs in exactly two states: (1) bare direct dials — no nav plan at all (Mapper's 770ffa0 boolean, owner-ordered 07-21: never DURING a menu, where it trips on the recorded greeting — B&N 3:42p); (2) earArmed — the smart join, where the recipe has FINISHED the menu and the ear opens for the real human voice (owner design, restored 07-24). State (1) MUST read hadDtmf/hadSay, NOT ctx.dtmf/ctx.say: those are consumed at TwiML build (takeBridgeDtmf/Say), so by media time they are ALWAYS empty and the ear armed on every timerless keypad/voice chain — the agent opened into the recording and billed through the tree (owner 07-22).
    } else if (m.event === "stop") { log("twilio stop"); signalEnd(); if (eleven) eleven.close(); }
  });
  twilio.on("close", () => { activeCalls = Math.max(0, activeCalls - 1); log(`twilio close (frames in=${frames})`); signalEnd(); dtmfTimers.forEach(clearTimeout); if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } if (eleven) eleven.close(); });
}

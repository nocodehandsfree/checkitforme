// Custom telephony bridge: Twilio <Connect><Stream>  <->  ElevenLabs ConvAI WebSocket, with a
// browser fork. Both legs are ulaw_8000, so audio is a straight passthrough. Nothing is persisted —
// frames are relayed live and dropped. This is what unlocks live audio + per-customer caller ID.
import { WebSocket } from "ws";
import { config } from "../config";
// THE RECEIPT (owner 07-26). Recording only — pure, database-free, wrapped so it can never throw
// into the call path. The bridge is the ONLY place that can honestly measure how Charlie's connected
// seconds split into talking / listening / dead air, because it is the only place the audio passes
// through. Every stamp is "now"; the receipt owns the clock, since it started at dial and this
// socket opens much later.
import { emit, markNow, addMs, linkProviderCall, openSegment, closeSegment, startMeter } from "../calls/events";
// The Ear that stays on the call while a person is talking to us. Pure and dependency-free on
// purpose, so every threshold in it is provable without a phone call.
import { ConversationEar, type HoldReason } from "../calls/listen-nav";
// Delta's opening question: our own line, our own voice, already in phone format and already paid
// for. The bridge only PLAYS it — synthesis and caching live outside the call path (clip-cache.ts).
import { toMediaFrames } from "../calls/clip-cache";

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
  // ---- DELTA ASKS FIRST (spec: docs/specs/live-call-runtime/README.md, sections 4 and 5) ----
  // The opening question as ONE pre-recorded clip in phone format (μ-law 8kHz), synthesized and
  // cached before we dialled. Delta is not an agent: it never interprets an answer and it never
  // decides a call is finished. It exists so the clerk hears the question the instant they say
  // hello, while the expensive agent is still connecting behind it.
  openingClip?: { audio: Buffer; ms: number; text: string };
  // The agent that joins a conversation ALREADY IN PROGRESS: configured once, empty greeting,
  // standing instruction to wait silently for the answer. A DEDICATED AGENT, deliberately, because
  // overriding the prompt or the first message per call once hung calls up — the whole design would
  // otherwise rest on the one thing already known to break. Without this id the clip never plays and
  // the call behaves exactly as it does today.
  midCallAgentId?: string;
  // ---- HOLD AND TRANSFER (spec section 6) ----
  // The Ear stays on the call; the AGENT is what gets suspended. Two shapes, and which one is right
  // is Gate Zero's answer, not ours:
  //   "gate"   — his session stays open, we stop feeding him and suppress his output. Safe, and
  //              saves nothing unless a gated stream really does bill as silence.
  //   "reopen" — close his session for the hold and open a fresh one when somebody comes back,
  //              stitched under the same call as a numbered segment. Definitely saves the money,
  //              and has to hand him back the thread of the conversation.
  // Both are built so the measurement can choose without any of this being rewritten. Default is
  // "gate" because it cannot change what the store hears, and no money claim is made until measured.
  holdStrategy?: "gate" | "reopen";
  /** Charlie's model on OUR account instead of the provider's hosted one (section 7). */
  ourBrain?: boolean;
  /** The agent wired to our own brain. Same voice, same rules — only the thinking is ours. Absent
   *  means the switch cannot engage and every call uses the hosted model, which always works. */
  ourBrainAgentId?: string;
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

// THE DROPPED CALL (spec: the live call runtime, section 8). Rooms where something on OUR side
// broke mid call and the store was hung up on without a word. The bridge cannot write to the
// database, so it records the fact here and the finalizer that owns the verdict reads it — the same
// shape as roomCallSids. A dropped call is never charged, never retried automatically, and must
// never be written as "completed", or the one-hour block would lock the customer out of the very
// store whose check we just broke.
const dropped = new Map<string, string>();   // room -> why
export function wasDropped(room: string): string | null { return dropped.get(room) ?? null; }
export function markDropped(room: string, why: string): void {
  if (dropped.has(room)) return;
  dropped.set(room, why);
  setTimeout(() => dropped.delete(room), 15 * 60 * 1000);
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
// ---- Call-progress tone detection (ringback / busy / dial tone) ----
// The phone network builds these from a FIXED pair of pure tones, published in the North American
// plan: ringback 440+480 Hz, busy and reorder 480+620 Hz, dial tone 350+440 Hz. So "is this the desk
// ringing or a person talking?" is not a judgement call, it is a measurement: check how much of the
// frame's energy sits exactly on those frequencies. A tone puts nearly all of it there. Speech never
// does, because a voice carries a pitch around 85 to 255 Hz plus formants spread across the band.
// This replaced an amplitude-steadiness guess that real line noise walked straight through, letting
// the billed agent open onto an empty ringing line (owner 07-24, two Target checks nobody answered).
const TONE_HZ = [350, 440, 480, 620];
/** Share (0..1) of a frame's energy sitting on the call-progress tone frequencies. ~1 = a pure tone
 *  pair, well under 0.2 for speech. Goertzel per frequency, normalized so a clean tone reads 1. */
function toneShare(b64: string): number {
  let buf: Buffer; try { buf = Buffer.from(b64, "base64"); } catch { return 0; }
  const N = buf.length;
  if (N < 80) return 0;
  const x = new Float64Array(N);
  let total = 0;
  for (let i = 0; i < N; i++) { const v = ulawByteToLinear(buf[i]); x[i] = v; total += v * v; }
  if (total <= 0) return 0;
  let tone = 0;
  for (const hz of TONE_HZ) {
    const coeff = 2 * Math.cos((2 * Math.PI * hz) / 8000);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) { s0 = x[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
    tone += s1 * s1 + s2 * s2 - coeff * s1 * s2; // |X(f)|^2
  }
  return tone / (total * (N / 2)); // normalized: a clean single tone at a listed frequency → ~1
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
export function handleTwilioBridge(twilio: WebSocket, room: string, fanout: (room: string, b64: string, track: string) => void, relayLine?: (room: string, role: string, text: string) => void, relayEnd?: (room: string) => void, onStage?: (room: string, n: number, atSec: number) => void) {
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
  let connectReason = "no gate — opened at pickup"; // what let the billed agent on; goes on the receipt
  let humanAtMs = 0;          // when a human was detected (connect-on-human)
  let lastDtmfMs = 0;         // ms-after-start of the last scheduled keypress (VAD waits past this)
  let voiced = 0;             // consecutive voiced frames
  let giveUpTimer: NodeJS.Timeout | null = null; // armed at connect when ctx.giveUpSeconds is set
  let humanWords = false;     // a real store-side transcript line arrived (letters, not "..." junk)
  let earArmed = false;       // smart join: the menu is done, the ear is open for a real voice
  const loudE: number[] = []; // recent above-threshold frame energies (amplitude steadiness, secondary)
  const loudT: number[] = []; // per-frame share of energy on the phone network's tone frequencies
  let toneLogged = false;     // log the "it's a tone" verdict once per call, not per frame
  // SECOND-RING TRACKING (owner 07-24). After the menu transfers us, the DESK rings — a separate
  // ring from the one before pickup. Detecting it POSITIVELY (not just "that wasn't a human") gives
  // three things: an honest log step with real seconds, certainty that Charlie must stay off, and a
  // deterministic "nobody is coming" once enough rings go unanswered.
  let inRing = false;         // currently inside a ring burst
  let ringCount = 0;          // completed ring bursts on the transferred leg
  let firstRingAtMs = 0;      // when the desk started ringing (for the log step)
  const RINGS_UNANSWERED = 6; // ~36s of a US 2s-on/4s-off cadence → nobody is coming
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
  // ---- Delta's clip, and the gate it holds shut ----
  // While the clip plays, the agent is CONNECTING but not conversing: he receives no audio and none
  // of his audio reaches the line. The clerk hears one voice asking one question. The moment the
  // clip is done the gate opens, everything the clerk said in the meantime is released to him, and
  // he owns every turn from there.
  let charlieGateOpen = true;   // true = today's behaviour, agent talks the moment he is ready
  let clipText = "";            // the question Delta asked, handed to the agent as context
  const clipTimers: NodeJS.Timeout[] = [];
  let prewarmTimer: NodeJS.Timeout | null = null;
  const CLIP_MARK = "delta-opening";
  /** A breath after the clip so the agent can never clip its own tail. */
  const CLIP_SETTLE_MS = 250;
  /** If every signal fails, open him anyway this long after the clip should have ended. A slightly
   *  early agent is recoverable; a live clerk saying hello into silence is not. */
  const CLIP_BACKSTOP_MS = 4000;
  /** How early to start connecting him, measured back from the END of the clip.
   *
   *  He bills from the second his session opens, talking or not, so every moment he spends warming
   *  up behind a clip is dead air we chose to buy. A real opening question measured 5.1 seconds, so
   *  starting him with it would buy five of them on every call. Opening a session takes well under a
   *  second; two is generous cover and keeps the rest.
   *
   *  Being late is safe by construction: the gate opens on its own signals whatever he is doing, and
   *  whatever the clerk said meanwhile is already buffered and released the moment he reports ready. */
  const PREWARM_LEAD_MS = 2000;
  // ---- hold and transfer ----
  let onHold = false;             // the person is away; the agent must not be fed or heard
  let holdReason: HoldReason | null = null;
  let heldWords: string[] = [];   // the first thing they say on coming back, so it is never lost
  let convEar: ConversationEar | null = null;   // attached the moment a real person is on the line
  let segmentBrain: "hosted" | "ours" = "hosted";
  // THE LADDER (section 7). Once our own brain has failed on this call we do not try it again on
  // this call, and once the agent has SPOKEN there is no live model swap at all — a voice changing
  // mid sentence is worse than any saving.
  let brainFellBack = false;
  let charlieSpoke = false;
  log(`twilio connected room=${room.slice(0, 8)} ctx=${!!ctx}`);

  /** Release everything the clerk said while we were still asking. Only ever runs with the gate
   *  open and the agent ready, so a buffered word can never be delivered to a session that is not
   *  listening yet. */
  function flushPending() {
    if (!eleven || !ready || !charlieGateOpen) return;
    for (const p of pending) eleven.send(JSON.stringify({ user_audio_chunk: p }));
    pending.length = 0;
  }

  /** The clip is over: hand the conversation to the agent. Idempotent — three signals race to call
   *  this and a backstop calls it if all three miss, so it must only ever act once. */
  function openCharlieGate(via: string) {
    if (charlieGateOpen) return;
    charlieGateOpen = true;
    clipTimers.forEach(clearTimeout); clipTimers.length = 0;
    // The question ended sooner than his warm-up was due to start — a short clip, or the carrier
    // confirming early. Open him NOW rather than let the conversation begin with nobody on our end.
    if (!eleven) { if (prewarmTimer) { clearTimeout(prewarmTimer); prewarmTimer = null; } void connectEleven(); }
    emit(room, "charlie_join", "Question asked, the agent has the conversation from here", { handover: true, via, held: pending.length });
    log(`delta: clip finished (${via}) -> agent gate open, releasing ${pending.length} buffered frame(s)`);
    flushPending();
  }

  /**
   * Play Delta's question down the line, in code, exactly the way keypad tones already go out.
   * Returns false when the socket is not in a state to carry it, in which case the caller must
   * behave as though there were no clip at all.
   *
   * THE THREE SIGNALS that tell us it finished, whichever lands first:
   *   1. Twilio's `mark` — the accurate one, handled in the message loop below.
   *   2. The clip's own length — exact arithmetic (μ-law 8kHz is 8 bytes per millisecond), known
   *      the moment the clip was built.
   *   3. The playout clock the bridge already keeps (`agentPlayingUntil`), which is how the echo
   *      gate works and is proven on every call. Checked when the length timer lands, so audio that
   *      is genuinely still playing can only ever DELAY the handover.
   */
  function startOpeningClip(clip: { audio: Buffer; ms: number; text: string }): boolean {
    if (twilio.readyState !== 1 || !streamSid) { log("delta: socket not ready, no clip -> agent opens as usual"); return false; }
    charlieGateOpen = false;
    clipText = clip.text;
    // Buffer inbound audio from THIS moment, not from when his session starts opening. He is now
    // connecting later than the clip begins, and a clerk who answers in that window must still be
    // held rather than fed to the human detector, which would drop their words entirely.
    connecting = true;
    for (const frame of toMediaFrames(clip.audio)) {
      twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: frame } }));
      fanout(room, frame, "agent"); // a listener hears the question, same as they hear the agent
    }
    // Our own voice is on the line now, so the echo gate and the playout clock must both know —
    // otherwise the line's reflection of this clip comes straight back as "the clerk answering".
    // Deliberately NOT counted as speaking seconds: the agent is connected and silent through the
    // clip, and that is exactly the dead air the receipt exists to show us.
    agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + clip.ms;
    twilio.send(JSON.stringify({ event: "mark", streamSid, mark: { name: CLIP_MARK } }));
    emit(room, "charlie_join", `Asked the question, warming the agent up behind it`, { prewarm: true, clipMs: clip.ms, question: clip.text });
    log(`delta: playing the opening question (${clip.ms}ms) while the agent connects`);
    // Signal 2, which also reads signal 3 when it lands.
    clipTimers.push(setTimeout(function done() {
      const left = agentPlayingUntil - Date.now();
      if (left > 0) { clipTimers.push(setTimeout(done, Math.min(left, 1000))); return; } // still playing → wait
      openCharlieGate("the clip finished playing");
    }, clip.ms + CLIP_SETTLE_MS));
    // The backstop. Nothing below this line may leave a clerk talking to nobody.
    clipTimers.push(setTimeout(() => openCharlieGate("nothing confirmed the clip, opened anyway"), clip.ms + CLIP_BACKSTOP_MS));
    return true;
  }

  /**
   * THE DROPPED CALL (section 8). Something on our side broke and there is no answer to deliver.
   * Hang up. Say nothing — no apology, no "we'll call back", nothing the clerk has to respond to.
   *
   * Only ever called when we have NOTHING. If the agent already got a usable answer out of the
   * clerk before the failure, that answer is delivered and the call is merely degraded: never throw
   * away a result the customer can use.
   */
  function dropCall(why: string) {
    markDropped(room, why);
    emit(room, "hangup", "The call broke on our end, so we hung up without saying anything", { reason: "dropped", why });
    log(`dropped: ${why} — hanging up silently, nobody is charged`);
    try { eleven?.close(); } catch { /* torn down */ }
    signalEnd();
    try { twilio.close(); } catch { /* torn down */ }
  }

  /**
   * The person went away. Twilio and the Ear keep running — only the agent is suspended, because
   * only the agent costs money by the second.
   */
  function beginHold(reason: HoldReason, atMs: number) {
    if (onHold) return;
    onHold = true; holdReason = reason; heldWords = [];
    const note = reason === "transfer" ? "The menu handed us on and the next desk is ringing"
      : reason === "music" ? "Hold music, the person has stepped away"
      : "The line went quiet, the person has stepped away";
    emit(room, reason === "transfer" ? "transfer" : "hold_start", note, { reason, atMs });
    if (ctx?.holdStrategy === "reopen") {
      // Close him. This is the only thing that actually stops the meter — muting saves nothing.
      // The call, the room and the receipt all continue; when somebody comes back he opens again as
      // the next numbered segment of this same call.
      log(`hold (${reason}): closing the agent — the meter stops until somebody comes back`);
      closeSegment(room);
      markNow(room, "charlieCloseMs");
      emit(room, "charlie_leave", "The agent was closed for the wait, billing stopped", { reason, strategy: "reopen" });
      try { eleven?.close(); } catch { /* torn down */ }
      eleven = null; ready = false; connecting = false;
    } else {
      log(`hold (${reason}): the agent stays open but is fed nothing and cannot be heard`);
    }
  }

  /** Somebody is back on the line. */
  function endHold(gapMs: number, maybeNewPerson: boolean) {
    if (!onHold) return;
    const was = holdReason;
    onHold = false; holdReason = null;
    const secs = Math.round(gapMs / 1000);
    addMs(room, "holdMs", gapMs);   // the number that has been null on every receipt until now
    emit(room, "hold_end", `Somebody is back after ${secs}s${maybeNewPerson ? ", and it may not be the same person" : ""}`, { gapSec: secs, maybeNewPerson, reason: was });
    if (ctx?.holdStrategy === "reopen" && !eleven) {
      log(`hold over after ${secs}s: opening the agent again as the next segment of this call`);
      void connectEleven(`back after a ${secs}s wait`);
      // The buffer is the existing one: everything said from here is held until his session reports
      // ready, then released whole, exactly as it is on the opening handoff.
      connecting = true;
      return;
    }
    // He stayed open through the wait, so he has been fed nothing and believes no time has passed.
    // TELL HIM, or he carries straight on and greets a new clerk as the old one.
    tellCharlieAboutTheGap(secs, maybeNewPerson);
    for (const w of heldWords) { try { eleven?.send(JSON.stringify({ user_audio_chunk: w })); } catch { /* best effort */ } }
    heldWords = [];
  }

  /** A note to the agent that is NOT spoken to the store: time passed and who is on the line may
   *  have changed. The provider's own contextual-update channel, so nothing is said out loud. */
  function tellCharlieAboutTheGap(secs: number, maybeNewPerson: boolean) {
    if (!eleven || !ready) return;
    const text = maybeNewPerson
      ? `[There was a ${secs} second gap. The person who comes back may be someone new who did not hear your question. If they sound like a different person, ask again briefly rather than continuing.]`
      : `[There was a ${secs} second gap while they went to check. Carry on from where you were.]`;
    try { eleven.send(JSON.stringify({ type: "contextual_update", text })); log(`hold: told the agent about the ${secs}s gap`); }
    catch { /* best effort — never break a call over a note */ }
  }

  async function connectEleven(segmentWhy?: string) {
    if (!ctx) { log("connectEleven: NO CONTEXT"); return; }
    connecting = true; // from now, buffer inbound audio for the agent
    const c = ctx; // narrowed
    // Joining mid-conversation is a different agent, not a different prompt: one configured once,
    // with no greeting and a standing instruction to wait for the answer. Only ever used when the
    // clip is actually playing, so every other call opens the same agent it always has.
    const joining = !charlieGateOpen && !!c.midCallAgentId;
    // WHICH BRAIN. Our own account is a different AGENT (one wired to our endpoint), not a different
    // request, so choosing it is choosing which agent to open. The joining agent wins when a clip is
    // playing: never speaking over the question matters more than where the thinking happens, and
    // the ladder below will move to our brain on the next call rather than risk this one.
    const useOurs = !!c.ourBrain && !!c.ourBrainAgentId && !joining && !brainFellBack;
    segmentBrain = useOurs ? "ours" : "hosted";
    const agentId = joining ? c.midCallAgentId! : useOurs ? c.ourBrainAgentId! : c.agentId;
    const url = await signedUrl(agentId, c.apiKey);
    if (!url) {
      // THE LADDER, RUNG ONE AND TWO (section 7). Our own brain could not be reached and the agent
      // has not said a word yet, so nothing is lost by quietly using the provider's hosted model
      // instead. Same voice, same rules; the clerk notices nothing.
      if (useOurs && !charlieSpoke) {
        brainFellBack = true;
        emit(room, "unknown", "Our own brain did not answer, using the provider's instead", { rung: "before-speaking", silent: true });
        log("brain: our account did not answer -> falling back to the hosted model, invisibly");
        return connectEleven(segmentWhy);
      }
      // RUNG THREE. Nobody can take this call. Hang up and say NOTHING: a store takes thousands of
      // calls and a dead line is unremarkable, while a promise to ring back that we might not keep
      // is not. The customer is not charged and is not locked out of this store.
      log("connectEleven: no signed url -> nobody can take this call, hanging up silently");
      dropCall("we could not open an agent for this call");
      return;
    }
    log("connectEleven: opening ElevenLabs WS");
    eleven = new WebSocket(url);
    eleven.on("open", () => {
      // THE BILLED SECOND ZERO. The provider meters from session open, so this is where the money
      // clock starts — not at first word. Everything after this is seconds we are paying for.
      markNow(room, "charlieOpenMs");
      // A NUMBERED STRETCH of this one call, never a separate call (hard rule 1). Ordinary calls
      // have exactly one; a call where he was closed for a wait has two or more.
      const n = openSegment(room, segmentBrain, segmentWhy);
      emit(room, "charlie_join", n === 1 ? "The agent is on the line and billing" : `The agent is back on the line (part ${n} of this call)`, { reason: connectReason, segment: n, brain: segmentBrain, why: segmentWhy });
      log("eleven WS open -> sending init");
      // The question Delta already asked rides in as context, so the joining agent knows what the
      // clerk is answering and never asks it a second time.
      // `opening_line` is a variable the agents already declare, so this adds no new surface.
      const vars = joining && clipText ? { ...c.dynamicVars, opening_line: clipText } : c.dynamicVars;
      const init: Record<string, unknown> = { type: "conversation_initiation_client_data", dynamic_variables: vars };
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
        if (convId) { conversations.set(room, convId); linkProviderCall(room, convId); setTimeout(() => conversations.delete(room), 10 * 60 * 1000); if (c.connectOnHuman && humanAtMs) navByConv.set(convId, Math.max(0, Math.round((humanAtMs - startMs) / 1000))); log(`metadata: convId=${convId}`); try { c.onConversationId?.(convId); } catch (e) { log(`onConversationId threw: ${String(e).slice(0, 80)}`); } }
        else log(`metadata but NO convId: ${JSON.stringify(m).slice(0, 200)}`);
        // Held back while Delta is still asking — openCharlieGate releases them the instant the
        // clip is done, in order, so an early answer reaches him complete instead of half-heard.
        flushPending();
      } else if (m.type === "audio") {
        const b64 = m.audio_event?.audio_base_64;
        // He is warming up behind the question, not talking over it. Nothing he produces before the
        // gate opens reaches the line.
        if (b64 && !charlieGateOpen) { log("delta: agent tried to speak during the clip, suppressed"); }
        // Nobody is there to hear him. Suppressing his voice while the person is away also stops him
        // talking into hold music and then being interrupted by his own tail when they come back.
        else if (b64 && onHold) { /* suspended: not spoken onto the line */ }
        else if (b64 && twilio.readyState === 1) {
          twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
          fanout(room, b64, "agent");
          // Extend the echo-gate window by this chunk's real playout time (μ-law 8kHz = 8 bytes/ms);
          // Twilio plays queued audio sequentially, so chunks extend the window back-to-back.
          const ms = Math.ceil((b64.length * 3) / 4 / 8);
          agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + ms;
          addMs(room, "speakingMs", ms); // SPEAKING = audio that really played out, not a guess
          charlieSpoke = true;           // from here there is no live model swap, whatever fails
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
          emit(room, "voicemail", "Reached a machine, hung up straight away");
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
    eleven.on("close", (code: number) => {
      closeSegment(room); markNow(room, "charlieCloseMs");
      emit(room, "charlie_leave", "The agent is off the line, billing stopped", { code });
      log(`eleven WS close code=${code} (frames in=${frames})`);
      // A close we ASKED for during a wait is not the end of the call — the line is still up and
      // somebody is coming back. Only an unexpected close ends things.
      if (onHold && ctx?.holdStrategy === "reopen") return;
      signalEnd(); if (twilio.readyState === 1) twilio.close();
    });
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
    connectReason = reason;
    if (reason === "human") {
      markNow(room, "humanMs"); emit(room, "human_detected", "A real person is on the line");
      // From here somebody is on the line, so from here it is worth knowing when they stop being on
      // the line. The meter flips from "never checked" to a real measured zero at the same moment.
      startMeter(room, "holdMs");
      convEar = new ConversationEar({ holdStart: beginHold, holdEnd: endHold });
    }
    else emit(room, "unknown", `The agent was let on without hearing a person (${reason})`, { reason });
    log(`connect-on-human: connecting (${reason}) after ${Math.round((humanAtMs - startMs) / 1000)}s nav`);
    // DELTA ASKS, THE AGENT ANSWERS. Only on a real person: a clip played at a hold-timeout or a
    // recipe timer would be a question asked into a menu. Everything else about the call is
    // unchanged, and a store with no clip or no joining agent takes exactly today's path.
    const clip = reason === "human" && ctx?.openingClip && ctx?.midCallAgentId ? ctx.openingClip : null;
    const playing = clip ? startOpeningClip(clip) : false;
    if (playing && clip) {
      // Start him late enough that his session opens as the question finishes, instead of billing
      // through the whole of it. Kept OUT of clipTimers on purpose: those are cleared the moment the
      // gate opens, and clearing this one would leave the clerk talking to an agent that never
      // connected. A call that ends first never opens him at all.
      const lead = Math.max(0, clip.ms - PREWARM_LEAD_MS);
      if (lead > 0) prewarmTimer = setTimeout(() => { prewarmTimer = null; if (!ended && twilio.readyState === 1) void connectEleven(); }, lead);
      else void connectEleven();
      log(`delta: warming the agent up ${Math.round(lead)}ms in, so his meter starts as the question ends`);
    } else connectEleven();
    // Give-up cap: the agent is now billing. If no real human words land within giveUpSeconds,
    // nobody is coming to the phone — end the call instead of paying to listen to it ring.
    const gu = ctx?.giveUpSeconds;
    if (gu && gu > 0 && !giveUpTimer) {
      giveUpTimer = setTimeout(() => {
        if (humanWords) return;
        emit(room, "hangup", `Nobody spoke in the ${gu}s after the agent joined, hung up`, { reason: "no_words", afterSecs: gu });
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
    const e = frameEnergy(b64);
    if (e > VOICE_THRESH) {
      loudE.push(e); if (loudE.length > 150) loudE.shift();
      loudT.push(toneShare(b64)); if (loudT.length > 150) loudT.shift();
      // RINGBACK IS NOT A HUMAN (owner 07-24: Charlie billed 20s on two Target calls nobody answered).
      // After a transfer the desk rings, and a US ringback burst is 2s of loud audio = ~100 frames —
      // more than double the 45-frame gate, so the ear declared "human" on the RING and opened the
      // billed agent into an empty line. Energy alone cannot tell them apart; SHAPE can: a ringback
      // is a steady dual tone (near-constant amplitude, tiny variation), while speech swings hard
      // frame to frame across syllables. So once the gate is met, require real modulation too.
      if ((voiced += 1) >= need) {
        if (isCallProgressTone() || isSteadyTone(loudE)) {
          // Positively THE DESK RINGING. Mark the state, stamp the log step once, and stay off.
          if (!inRing) {
            inRing = true;
            if (!firstRingAtMs) {
              firstRingAtMs = Date.now();
              emit(room, "ringing", "The desk is ringing, the agent stays off", { leg: "desk" });
              log(`ear: the desk is ringing (second ring) — Charlie stays off until someone picks up`);
              try { onStage?.(room, 6, Math.max(0, Math.round((firstRingAtMs - startMs) / 1000))); } catch { /* best-effort */ }
            }
          }
          if (!toneLogged) { toneLogged = true; log(`ear: steady tone (ringback/hold), NOT a human — staying deaf, Charlie not billed`); }
        } else triggerConnect("human"); // modulated speech = a real person. A ring that STOPS and turns into a voice lands here.
      }
    } else {
      // Gap between bursts: a burst that just ended is one completed ring.
      if (inRing) { inRing = false; ringCount++; emit(room, "ringing", `Ring ${ringCount} went unanswered`, { leg: "desk", ring: ringCount, answered: false }); log(`ear: ring ${ringCount} went unanswered`); if (ringCount >= RINGS_UNANSWERED && !connecting && !humanWords) { emit(room, "hangup", `Nobody picked up after ${ringCount} rings, hung up before the agent ever billed`, { reason: "nobody_came", ring: ringCount }); log(`give-up: ${ringCount} rings unanswered — nobody is coming, hanging up (Charlie never joined)`); try { twilio.close(); } catch { /* best effort */ } } }
      voiced = Math.max(0, voiced - leak); if (voiced === 0) { loudE.length = 0; loudT.length = 0; }
    }
  }
  /** True when the recent loud frames look like a machine tone rather than speech. Speech energy
   *  varies wildly across syllables (coefficient of variation well above 0.2); a ringback/hold tone
   *  holds an almost constant amplitude (CV under ~0.1). Needs a full gate's worth of samples so a
   *  short burst can't be judged on noise. */
  /** THE primary "that is the network, not a person" test: across the loud frames we just heard, is
   *  the energy parked on the published call-progress frequencies? A clean tone reads near 1 and a
   *  noisy real-world one still reads high, while speech stays far below, so the bar sits at 0.45.
   *  Median, not mean, so one odd frame cannot swing the verdict either way. */
  function isCallProgressTone(): boolean {
    if (loudT.length < 40) return false;        // too little evidence → treat as speech (never block a real human)
    const w = [...loudT].sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)] >= 0.45;
  }
  function isSteadyTone(samples: number[]): boolean {
    if (samples.length < 40) return false;      // too little evidence → treat as speech (never block a real human)
    // Amplitude steadiness is the WEAK signal: a real line adds noise, so live ringback measured well
    // above the flatness bar a synthesized tone sits at, and the agent still joined an empty line
    // (owner 07-24, Target). It stays only as a secondary confirmation. The primary test is the
    // frequency one below, which keys off the published tone pairs instead of guesswork.
    const w = samples.slice(-100);
    const mean = w.reduce((s, v) => s + v, 0) / w.length;
    if (mean <= 0) return false;
    const cv = Math.sqrt(w.reduce((s, v) => s + (v - mean) * (v - mean), 0) / w.length) / mean;
    return cv < 0.12;
  }

  twilio.on("message", (data: Buffer) => {
    let m: { event?: string; start?: { streamSid?: string; customParameters?: { room?: string } }; media?: { payload?: string }; mark?: { name?: string } };
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
            dtmfTimers.push(setTimeout(() => { earArmed = true; emit(room, "ivr_detected", "Menu finished, now listening for a real person", { earOpenedAtSec: earAt }); }, earAt * 1000));
            dtmfTimers.push(setTimeout(() => {
              if (connecting || humanWords) return;
              emit(room, "hangup", "Nobody ever came to the phone, hung up before the agent billed a second", { reason: "nobody_came" });
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
      // LISTENING SECONDS: while the agent is connected and NOT playing, store-side audio loud
      // enough to be a voice is time he spent listening to a person. Measured off the same frames
      // and the same threshold the ear uses, so the two can never disagree. Everything connected
      // that is neither speaking nor listening is dead air — the seconds we are trying to delete.
      //
      // RINGING IS NOT LISTENING. After a transfer the desk rings, and a ring burst is loud enough
      // to sail past a voice threshold — which would book an empty ringing room as a conversation we
      // needed to pay for. The same published tone frequencies the ear uses before pickup separate
      // them here, so ring seconds are counted as ring seconds even while we are being billed.
      if (eleven && ready && Date.now() >= agentPlayingUntil && frameEnergy(b64) > VOICE_THRESH) {
        if (toneShare(b64) >= 0.45) addMs(room, "ringingMs", 20);
        else addMs(room, "listeningMs", 20);
      }
      // THE EAR STAYS ON THE CALL even when the agent is suspended — that is the whole point of it
      // being acoustic and free. It is fed from OUR OWN audio being silent onwards, so our clip and
      // the agent's own voice can never read as the store still being there.
      if (convEar && Date.now() >= agentPlayingUntil) convEar.feed(frameEnergy(b64), toneShare(b64) >= 0.45);
      const echoWindow = Date.now() < agentPlayingUntil + ECHO_TAIL_MS;
      const suppress = echoWindow && frameEnergy(b64) < BARGE_THRESH;
      if (suppress) { if (++echoDropped % 200 === 1) log(`echo gate: suppressing agent playback echo (dropped=${echoDropped})`); }
      // A clerk who starts answering before we have finished asking is the normal case, not an edge
      // case. Their words go into the SAME buffer the bridge has always used while the agent
      // connects, and are released to him whole the moment the gate opens.
      // Nobody is on the line, so the agent hears nothing. Hold music and an empty room are not a
      // conversation, and feeding him thirty seconds of them is how he ends up talking to himself.
      // The first words on the way back ARE kept, so an answer shouted from the stockroom is not lost.
      else if (onHold) { if (frameEnergy(b64) > VOICE_THRESH) { heldWords.push(b64); if (heldWords.length > 250) heldWords.shift(); } }
      else if (eleven && ready && charlieGateOpen) eleven.send(JSON.stringify({ user_audio_chunk: b64 }));
      else if (connecting) pending.push(b64);          // committed to connect → buffer for the agent
      else if (earArmed || (ctx?.connectOnHuman && !ctx.connectAtSec && !ctx.hadDtmf && !ctx.hadSay)) maybeDetectHuman(b64); // The ear runs in exactly two states: (1) bare direct dials — no nav plan at all (Mapper's 770ffa0 boolean, owner-ordered 07-21: never DURING a menu, where it trips on the recorded greeting — B&N 3:42p); (2) earArmed — the smart join, where the recipe has FINISHED the menu and the ear opens for the real human voice (owner design, restored 07-24). State (1) MUST read hadDtmf/hadSay, NOT ctx.dtmf/ctx.say: those are consumed at TwiML build (takeBridgeDtmf/Say), so by media time they are ALWAYS empty and the ear armed on every timerless keypad/voice chain — the agent opened into the recording and billed through the tree (owner 07-22).
    } else if (m.event === "mark") {
      // SIGNAL 1, the accurate one: the carrier finished playing everything queued before this mark,
      // so Delta's question has actually reached the clerk's ear. New code, and deliberately not the
      // only way we can learn this — see startOpeningClip.
      if (m.mark?.name === CLIP_MARK) openCharlieGate("the carrier confirmed the clip played");
    } else if (m.event === "stop") { log("twilio stop"); signalEnd(); if (eleven) eleven.close(); }
  });
  twilio.on("close", () => { activeCalls = Math.max(0, activeCalls - 1); log(`twilio close (frames in=${frames})`); signalEnd(); dtmfTimers.forEach(clearTimeout); clipTimers.forEach(clearTimeout); if (prewarmTimer) { clearTimeout(prewarmTimer); prewarmTimer = null; } if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } if (eleven) eleven.close(); });
}

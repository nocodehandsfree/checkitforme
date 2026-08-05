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
import { emit, amend, markNow, addMs, linkProviderCall, openSegment, closeSegment, startMeter, recordLine, normSaid, getReceipt } from "../calls/events";
// The Ear that stays on the call while a person is talking to us. Pure and dependency-free on
// purpose, so every threshold in it is provable without a phone call.
import { ConversationEar, looksLikeAPerson, type HoldReason } from "../calls/listen-nav";
import { TUNING_DEFAULTS, type CallTuning } from "../calls/tuning";
// Delta's opening question: our own line, our own voice, already in phone format and already paid
// for. The bridge only PLAYS it — synthesis and caching live outside the call path (clip-cache.ts).
import { toMediaFrames } from "../calls/clip-cache";
// The wrong-department phrase test. It lives beside the standing rule that tells the agent to ask to
// be put through, so the words we act on and the words we look for cannot drift apart. Pure, so it is
// provable without a phone call.
import { heardWrongDepartment, askedToBePutThrough, saysNobodyToTransfer, looksLikeAMenu, staffName, wrappedUp, usedTheirName } from "./prompts";
import { guessLanguage } from "../calls/mapgraph";

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
  /** OUR OWN COST CUTOFF, the number we handed the carrier as the call's time limit. When it fires,
   *  the carrier ends the check and tells us the same way it would tell us a store hung up — so
   *  without this the cap reports as "The store hung up on us", which is our own doing blamed on
   *  them (PM audit, 08-02). */
  timeLimitSec?: number;
  // THIS IS A MAPPING CHECK: NEVER TAKE A HAND-OVER. Riding a transfer can never be part of a map.
  // Staff offering to put us through gets us a good answer from a desk we cannot name and cannot
  // route to, and a customer check cannot count on Staff being willing to hand us on — so the map
  // would lock a way in that only works when somebody is kind. Set only by a mapping check; absent
  // on every customer check, where transfers are still ridden exactly as before.
  neverTakeAHandover?: boolean;
  // (holdMaxSeconds is GONE, not deprecated — owner 08-02. It opened Charlie after a set number of
  // seconds with no voice heard, so he talked to hold music and billed for it. Removing the field
  // outright makes every caller that still passes it fail the typecheck instead of quietly doing
  // nothing.)
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
  /** WHO THE MAPPED ROUTE IS PUTTING US THROUGH TO, in the store's own words as we say them at its
   *  menu ("front", "general"). Absent on a direct dial and on a keypad route, where nobody ever
   *  said a department name out loud and inventing one would fake the record. */
  departmentName?: string;
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
  /** Every number this runtime would otherwise guess at, resolved from the setting the Admin reads
   *  so all of them can be tuned against real calls without a release. */
  tuning?: CallTuning;
}
const contexts = new Map<string, BridgeContext>();
// THE SIGNOFF DOOR (owner 08-04). The reader runs outside this file and knows the moment a check has
// its answer; Charlie lives inside a socket closure in here. Each live check hangs its own door on
// this map so the reader can knock: the note goes to Charlie on the channel that already carries
// notes to him, and he thanks them and ends. Removed when the socket closes, so a late knock after
// the check is over lands on nothing.
const signoffDoors = new Map<string, (answer: string) => void>();
/** The check on this room has its answer. Tell Charlie to wrap up and end. Safe to call late, twice,
 *  or for a room that never had a Charlie: a missing door is a no-op, never an error. */
export function nudgeSignoff(room: string, answer: string): void {
  try {
    const door = signoffDoors.get(room);
    if (!door) { log(`signoff: the answer is in hand for ${room.slice(0, 8)} (${answer}) but no check holds that name`); return; }
    door(answer);
  } catch (e) { log(`signoff: the knock itself failed: ${String(e).slice(0, 90)}`); /* a note may never break a check */ }
}
export function setBridgeContext(room: string, ctx: BridgeContext) {
  ctx.hadDtmf = !!ctx.dtmf;
  ctx.hadSay = !!ctx.say;
  contexts.set(room, ctx);
  // A LEAK GUARD, NEVER A CLOCK A LIVE CALL CAN RUN INTO (08-01 audit, family 3). This used to be
  // five minutes — the SAME length as the longest staging call — so exactly at the cap the
  // hold-reopen rule read an expired context as undefined and a hold-close ended the whole check.
  // Thirty minutes sits far past any call the carrier allows, and deliberately NOT delete-on-close:
  // Twilio can reconnect a blipped stream mid-call and the fresh socket must still find its context.
  setTimeout(() => contexts.delete(room), 30 * 60 * 1000);
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

// WHO PUT THE PHONE DOWN (round 2, item 5). The carrier tells us a check ended; it never tells us who
// ended it, and "Staff hung up on us" and "the check was disconnected" are different things to the
// owner. We cannot hear the difference — but we do not need to, because we know every time WE end a
// check, since we are the ones doing it. So the rule is subtraction: the check ended and it was not
// us, therefore it was the far end. Recorded here rather than guessed at the other end.
const endedByUs = new Map<string, string>();   // room -> why we ended it
export function weEndedCheck(room: string): string | null { return endedByUs.get(room) ?? null; }
export function noteWeEnded(room: string, why: string): void {
  if (!room || endedByUs.has(room)) return;
  endedByUs.set(room, why);
  setTimeout(() => endedByUs.delete(room), 15 * 60 * 1000);
}

// room -> ElevenLabs conversation id (so Runnr can poll transcript/result for a bridged call)
const conversations = new Map<string, string>();
export function bridgeConversationId(room: string): string | null { return conversations.get(room) ?? null; }
/**
 * THE SAME MAP READ THE OTHER WAY. Once Charlie's session exists, the customer's page stops asking
 * about the check by our own name for it and starts asking by HIS session id — so a guard that only
 * knew the first name was no guard at all after the first few seconds. His session ends every time he
 * is dropped for a wait, and the page then read "finished", settled a no-answer verdict and hung the
 * phone up on Staff who were walking back with the answer (owner, live check 07-31, third time).
 * Anything asked about a session has to be answerable against the call it belongs to.
 */
export function bridgeRoomForConversation(convId: string): string | null {
  if (!convId) return null;
  for (const [room, id] of conversations) if (id === convId) return room;
  return null;
}

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
  // Every number this runtime would otherwise guess at, from the setting the Admin reads.
  const tune: CallTuning = contexts.get(room)?.tuning ?? TUNING_DEFAULTS;
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
  /** THE HOLD CAP (round 1, item 1.6). Armed when a wait starts, cleared when somebody comes back.
   *  Nothing ended a mid check wait before this: a store that put us down and forgot ran to the
   *  carrier's own five minute limit. Two minutes, the owner's number, tunable from Admin. */
  let holdCapTimer: NodeJS.Timeout | null = null;
  let humanWords = false;     // a real store-side transcript line arrived (letters, not "..." junk)
  let earArmed = false;       // smart join: the menu is done, the ear is open for a real voice
  const loudE: number[] = []; // recent above-threshold frame energies (amplitude steadiness, secondary)
  const loudT: number[] = []; // per-frame share of energy on the phone network's tone frequencies
  let toneLogged = false;     // log the "it's a tone" verdict once per call, not per frame
  let quietRun = 0;           // frames of quiet since the last loud one — half a second ends a burst
  const BURST_END_FRAMES = 25;
  // SECOND-RING TRACKING (owner 07-24). After the menu transfers us, the DESK rings — a separate
  // ring from the one before pickup. Detecting it POSITIVELY (not just "that wasn't a human") gives
  // three things: an honest log step with real seconds, certainty that Charlie must stay off, and a
  // deterministic "nobody is coming" once enough rings go unanswered.
  let inRing = false;         // currently inside a ring burst
  /** WE NEVER HANG UP ON A COUNT OF RINGS (owner 08-03). A store that lets it ring twenty times may
   *  still pick up, and a count told us nothing about how long anybody had been waiting: six rings is
   *  36 seconds at one cadence and a minute at another. What replaces it is a clock the owner can
   *  tune, started the moment the department's phone starts ringing and stopped the moment somebody
   *  answers. Charlie is off the whole time, so this is the phone line only. */
  let ringWaitTimer: NodeJS.Timeout | null = null;
  // ---- THE PERSON TEST (round 1, item 1.1) ----------------------------------------------------
  // A RECORDING MUST NEVER GET A CHARLIE. What used to open him was crude — about half a second of
  // anything that sounds like a voice — and a recorded greeting is exactly that, so an unmapped store
  // that answers with a recording (Franklin's Ace Hardware, after hours, on the direct path) got a
  // billed Charlie talking to a machine until the give-up rule fired. Thousands of first-ever checks
  // run against stores we have never heard, so this is not an edge case.
  //
  // The test we already trust is `looksLikeAPerson` in listen-nav, and this is the same function, not
  // a second opinion: a greeting that runs under about three and a half seconds of actual talking and
  // is then followed by a real pause is a person. A recording talks longer than that and never stops
  // for you. Nothing is said while we decide, so it cannot trip a store's menu.
  //
  // The talking time accumulates across the WHOLE time the store has been speaking to us — a breath
  // mid greeting must never restart it, or a recording that pauses for breath would read as a fresh
  // short greeting every time and open Charlie on the long silence at the end of a voicemail, which
  // is the one case this exists to stop.
  let storeTalkMs = 0;        // ms of actual talking since the store started speaking to us
  let storeQuietMs = 0;       // unbroken quiet since they stopped
  let storeSpeaking = false;  // a real voice (not a tone) has been heard on this leg
  /** How loud they were while saying it. Kept here and not read off the ear's own rolling window,
   *  which is cleared the moment they stop — and they have to stop for two and a half seconds before
   *  we are sure of them, so by then there would be nothing left to measure. This is the yardstick
   *  the phone-on-the-counter test uses. */
  const storeLoud: number[] = [];
  let firstRingAtMs = 0;      // when the desk started ringing (for the log step)

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
  // ── THE SECOND GATE: HE ANSWERS OUR QUESTION, NEVER THEIR HELLO (owner 08-05, checks 282-286) ──
  //
  // THE FAULT, off ElevenLabs' own record of five checks in a row: Staff's hello is the FIRST user
  // turn his session receives, because it is exactly the audio we buffered while he was connecting.
  // A hello is a question, so he answers it the only way anyone would — he greets back and asks the
  // store the question Delta has just asked. He did it on 282, 283, 284, 285 and 286. Whether the
  // store HEARD it was luck: the gate above drops his voice only while the clip is still playing, so
  // on a 5.3s clip his duplicate died silently (285) and on a 4.1s clip it went out on the line (286)
  // and the store answered it, which threw the rest of that conversation out of step.
  //
  // Two things follow. His stale turn must be DROPPED, never merely delayed, or a longer clip just
  // moves it later. And the words cannot fix this: the joining note already says "Do NOT greet them,
  // do NOT ask the question again" and he did it anyway, five times out of five, because answering
  // the person who just spoke to you beats any standing instruction.
  //
  // So his mouth opens on THEIR ANSWER, not on the clip finishing: the first Staff line after we
  // commit to asking is the hello the recording is answering, and everything he produces before
  // their next words is a reply to that hello and never reaches the line.
  let charlieMaySpeak = true;   // true = every call that has no clip, i.e. today's behaviour exactly
  let helloAlreadyAnswered = false; // the next Staff line is the hello Delta answered, not our answer
  let answerWaitTimer: NodeJS.Timeout | null = null;
  let heldHisHelloReply = false;    // we dropped a turn of his; recorded once, so the record shows it
  let answerVoiceFrames = 0;        // how much of THEIR voice we have heard since the question started
  /** THEIR ANSWER IS HEARD BEFORE IT IS TRANSCRIBED, and that gap is the whole reason this exists.
   *  The provider runs `patient`, so a short answer is not finalised into words until the pause after
   *  it has passed — on check 287 "Yeah." was spoken at 4 seconds and did not land as a line until
   *  past 7, which is how a 5 second wait fired FIRST and let him re-ask into an answer that was
   *  already given. So the ear opens his mouth: about a third of a second of their voice, the same
   *  order the person test uses, well under the time his own reply takes to come back. */
  const ANSWER_VOICE_FRAMES = 15;   // ~0.30s of voice at 20ms a frame
  /** A store that says NOTHING back to the question still needs him. Only ever reached when there was
   *  no voice AND no words at all, so it has to clear the provider's own 5 second turn timeout with
   *  room to spare rather than race it. Leaving a person holding a silent phone is worse than
   *  letting him prompt them, which is all this does. */
  const ANSWER_WAIT_MS = 9000;
  let clipText = "";            // the question Delta asked, handed to the agent as context
  let clipEchoDropped = false;  // his session echoes that question back once — dropped, it is already on the record
  let clipMs = 0;               // how long the question ran, for the one join line's detail
  // ONE AGENT JOINING IS ONE LINE ON THE TIMELINE (owner 07-28: "it opens charlie_join three times").
  // The question starting and the handover when it finished are DETAILS of that join, not joins of
  // their own — the event set is a closed sixteen and the Admin prints every line's note, so three of
  // them read as three separate agents on a call that had one. Whichever happens first (the gate can
  // beat the session open on a short clip) leaves its facts here; the other side picks them up.
  let joinFacts: Record<string, unknown> = {};
  const clipTimers: NodeJS.Timeout[] = [];
  let prewarmTimer: NodeJS.Timeout | null = null;
  let opening = false;          // a session is being opened right now
  const CLIP_MARK = "delta-opening";
  /** The question, held until the person who just spoke stops speaking. */
  let pendingClip: { audio: Buffer; ms: number; text: string } | null = null;
  let waitQuietMs = 0;
  // A PAUSE THIS LONG MEANS THEY HAVE FINISHED SAYING HELLO. 600ms was too short and our question
  // landed on the end of their own sentence: people breathe mid greeting ("thanks for calling the
  // Fun store, ... this is Bob"), and a breath is not the end of a turn (owner, live check 07-31).
  // Both numbers live in the Admin tuning box now, like every other guessed number, so the next
  // retune is a setting rather than a release.
  const GREETING_END_MS = tune.greetingEndMs;
  /** …and if they simply never stop, ask anyway rather than listen forever. */
  const GREETING_MAX_WAIT_MS = tune.greetingMaxWaitMs;
  // WHAT THEY SAID BEFORE WE WERE SURE ANYBODY WAS THERE. The ear needs about half a second of voice
  // to call a person, and buffering only started after that, so the FIRST WORDS of every greeting
  // were thrown away — the store's own name, and whoever they said they were. The customer then read
  // a conversation that opened mid sentence, under our question, with no hello at all (owner
  // screenshot 07-31). A short rolling window of the line is kept from the first voiced frame, and it
  // goes in front of the buffer the moment we commit, so the greeting arrives whole and in order.
  const preRoll: string[] = [];
  /** WHERE THEIR HELLO ENDS AND THEIR ANSWER BEGINS, as an index into the held audio. Both are held
   *  for the same reason — the agent is not listening yet — and handing them over as one unbroken
   *  stretch is how "hi, this is Bob at the phone store" and "let me put you on hold and go find out"
   *  came back as ONE sentence, with our question printed under it and two of our own lines in a row
   *  where the store's answer should have been (owner screenshot 07-31). They are two turns because
   *  we asked a question in between, and the record has to say so. */
  /** Their hello, taken out of what Charlie is handed and transcribed on its own. */
  let helloAudio: string[] = [];
  /** Running while held audio is being paced out. Live frames queue behind it so nothing overtakes. */
  let handoverTimer: NodeJS.Timeout | null = null;
  /** Our question, kept off the live view until the store's hello can be shown above it. */
  let heldQuestion: string | null = null;
  let questionTimer: NodeJS.Timeout | null = null;
  /** …and how long we will wait for that hello before showing the question anyway. A store that says
   *  nothing at all must never leave a customer staring at an empty conversation. */
  const QUESTION_HOLD_MS = 8000;
  const PREROLL_MAX = Math.max(0, Math.round(tune.greetingKeepMs / 20));
  /** When their hello actually started. Their words only exist once the agent has transcribed the
   *  audio we held, which is after our question played — so stamped on arrival, the greeting lands
   *  UNDER the question it came before. This is the time it belongs at, spent on the first line back. */
  let greetingStartedMs = 0;
  let waitTotalMs = 0;
  /** A breath after the clip so the agent can never clip its own tail. */
  const CLIP_SETTLE_MS = tune.clipSettleMs;
  /** If every signal fails, open him anyway this long after the clip should have ended. A slightly
   *  early agent is recoverable; a live clerk saying hello into silence is not. */
  const CLIP_BACKSTOP_MS = tune.clipBackstopMs;
  /** How early to start connecting him, measured back from the END of the clip.
   *
   *  He bills from the second his session opens, talking or not, so every moment he spends warming
   *  up behind a clip is dead air we chose to buy. A real opening question measured 5.1 seconds, so
   *  starting him with it would buy five of them on every call. Opening a session takes well under a
   *  second; two is generous cover and keeps the rest.
   *
   *  Being late is safe by construction: the gate opens on its own signals whatever he is doing, and
   *  whatever the clerk said meanwhile is already buffered and released the moment he reports ready. */
  const PREWARM_LEAD_MS = tune.prewarmLeadMs;
  /** How long Charlie may actually be TALKING before he starts wrapping up. The owner's number, 45
   *  seconds, tuned from Admin against real checks: his own arithmetic says 23 holds 67% profit and
   *  45 does not, so 45 buys a longer conversation at a thinner margin on purpose. */
  const WRAP_UP_MS = Math.max(1, tune.charlieWrapUpSeconds) * 1000;
  /** How long a wait may run before we hang up. The owner's number, two minutes, tunable from Admin.
   *  Waiting is nearly free because Charlie is dropped, and a second check costs more than waiting,
   *  so it is deliberately generous. */
  const HOLD_CAP_MS = Math.max(1, tune.holdCapSeconds) * 1000;
  /** How long the phone may ring while we wait for a human. The owner's number, 90 seconds, tunable
   *  from Admin. Never a count of rings (his ruling 08-03). */
  const RING_WAIT_MS = Math.max(1, tune.ringWaitSeconds) * 1000;
  // ---- hold and transfer ----
  let onHold = false;             // the person is away; the agent must not be fed or heard
  /** Somebody has already stepped away and come back on this call — from here it is a live store
   *  beyond doubt, and no machine-phrase mishearing may hang it up (family 1). */
  let everCameBack = false;
  /** The store has already said something once. A voicemail ANNOUNCES itself in its opening words,
   *  so only that first line may end a check as a machine; everything after it is a conversation,
   *  and a machine phrase inside a conversation is a person talking about voicemail (round 2, item 3). */
  let storeHasSpoken = false;
  /** Recorded once: a hand-over put us back at the store's recorded menu instead of a department. */
  let sentBackToMenu = false;
  /** WHO WE ARE BEING PUT THROUGH TO, in the store's own words when the mapped route holds them
   *  ("front", "general"), and nothing invented when it does not. The website says "Ringing the front
   *  desk" at this same moment; this is the same moment in the owner's words. */
  const department = String(ctx?.departmentName || "").trim();
  const transferNote = department ? `Transferring to ${department}` : "Transferring you to the Staff.";
  // ---- WHAT NOTHING WROTE DOWN (round 1, item 1.3) ---------------------------------------------
  // Four things happen on nearly every check and none of them left a trace, so neither the log nor
  // the owner's card could show them: the question playing as a recording, Charlie warming up behind
  // it, Charlie wrapping up and whether he used their name, and which language was spoken. The set
  // of sixteen kinds stays sixteen — each rides as a note with its own `step` in the detail, which
  // is what the card reads.
  /** The name Staff gave us, if they gave one. */
  let theirName: string | null = null;
  /** He asked to be put through, so from here Staff's answer to that ask is worth reading. */
  let weAskedToBePutThrough = false;
  /** Recorded once: Staff said there is nobody to put us through to. */
  let nobodyToTransfer = false;
  /** Recorded once: he said his goodbye. */
  let wrapRecorded = false;
  /** Every line of his, judged for language, so the check can say what he spoke. */
  let spokeEs = 0, spokeEn = 0;
  /** When the question finished and when his session was actually ready, so "he warmed up in time"
   *  is a measured fact rather than an assumption. */
  let gateOpenedMs = 0;
  /** How close to the cap a stop has to land before we call it ours. The carrier enforces the limit
   *  precisely, so this only has to cover the moment it takes to reach us. A store hanging up inside
   *  the last three seconds of a five minute check would read as our cap; that is rare enough, and
   *  the wrong way round is worse (blaming a store for our own accounting). */
  const CAP_SLACK_SEC = 3;
  /** Seconds since we asked the carrier to dial, which is the clock its time limit runs on. Our own
   *  socket opens later, and on a store with a phone menu MUCH later, so its start is the wrong zero. */
  const elapsedSec = (): number => { const r = getReceipt(room); return r ? Math.round((Date.now() - r.startMs) / 1000) : 0; };
  /** The carrier told us the far end went away. Set before anything else unwinds, because everything
   *  that unwinds afterwards would otherwise look like us ending the check (round 2, item 5). */
  let farEndGone = false;
  let holdReason: HoldReason | null = null;
  let heldWords: string[] = [];   // the first thing they say on coming back, so it is never lost
  /** Recorded once: we landed somewhere that cannot answer. Read off the words, not the audio. */
  let wrongDept = false;
  /** He has ASKED to be put through, so the next wait that ends is a hand-over however it sounded.
   *  Plenty of stores hand you to a SILENT line: no ring tone, so the ear can only see a quiet pause,
   *  and a pause under twenty seconds reads as the same person stepping away. Without this the agent
   *  is told to carry on and answers a stranger mid sentence, which is the save failing at its last
   *  step on exactly the stores that need it. Spent when it fires, so one ask covers one hand-over. */
  let expectHandover = false;
  /** A gap the agent has not been told about yet, because he was CLOSED for it. Delivered the moment
   *  his new session reports ready — see the metadata handler. Without this the reopened agent knows
   *  nothing about the wait, which on a hand-over means he is talking to a stranger blind. */
  let gapNote: { secs: number; newPerson: boolean; replayed?: boolean } | null = null;
  let convEar: ConversationEar | null = null;   // attached the moment a real person is on the line
  let segmentBrain: "hosted" | "ours" = "hosted";
  // THE LADDER (section 7). Once our own brain has failed on this call we do not try it again on
  // this call, and once the agent has SPOKEN there is no live model swap at all — a voice changing
  // mid sentence is worse than any saving.
  let brainFellBack = false;
  let charlieSpoke = false;
  log(`twilio connected room=${room.slice(0, 8)} ctx=${!!ctx}`);

  /** Release whatever we had to hold before his session was ready, AT THE SPEED IT WAS SPOKEN. */
  function flushPending() {
    if (!eleven || !ready) return;
    if (pendingClip) return;     // still waiting for their hello to end: NONE of this is his yet
    if (handoverTimer) return;   // already draining; live frames are queueing behind it
    if (!pending.length) return;
    // AT THE SPEED IT WAS SPOKEN, NEVER ALL AT ONCE. A phone line carries one 20ms frame every 20ms,
    // and the transcriber on the other end works on that clock: it decides a sentence has ended by
    // hearing a real pause pass in real time. Sent as fast as the socket will take them, three
    // seconds of somebody talking arrive in a few thousandths of a second, so there is no pause
    // anywhere inside it and no pause after it either. That is why his greeting came back slurred
    // into different words AND welded to his answer, and why inserting silence into the burst
    // changed nothing: the silence went past at the same impossible speed (owner's checks, 08-01).
    // Paced out, every gap that was in the room is in the audio again. Nobody is waiting on this:
    // our recorded question is playing over the top of it and runs longer than any handover.
    // NO INVENTED SILENCE. Earlier fixes tried to force a turn break by injecting 800ms of quiet
    // into the burst, and it did nothing: sent at burst speed the silence went past just as fast as
    // the speech. Paced properly it would work, but it would also put us permanently that far
    // behind the live line, because the queue drains at exactly the speed it fills. It is not
    // needed either way now: his ears open when a person is found, so the only thing ever held is
    // the moment before his session answers, and every real pause the room had is already in the
    // audio itself, in real time, where the transcriber can hear it.
    log(`delta: handing over ${pending.length} frame(s) at the speed they were spoken`);
    const step = () => {
      if (!eleven || eleven.readyState !== 1) { handoverTimer = null; return; }
      // …AND CATCH UP AT THE END, or we stay behind the live line for the rest of the check. Once
      // the backlog is down to a fraction of a second it goes out in one go: too short to slur a
      // syllable, and from there he is hearing the room as it happens.
      if (pending.length <= CATCHUP_FRAMES) {
        for (const f of pending) { try { eleven.send(JSON.stringify({ user_audio_chunk: f })); } catch { /* torn down */ } }
        pending.length = 0; handoverTimer = null;
        log("delta: caught up with the live line");
        return;
      }
      const f = pending.shift();
      if (f !== undefined) { try { eleven.send(JSON.stringify({ user_audio_chunk: f })); } catch { /* torn down */ } }
      handoverTimer = setTimeout(step, FRAME_MS);
    };
    handoverTimer = setTimeout(step, 0);
    // THE QUESTION IS STILL WAITING ON THEIR HELLO, and only now is their hello on its way to
    // anybody who can turn it into words. The countdown that gives up and shows our question anyway
    // starts HERE: started when the question began playing it ran out while their voice was still
    // sitting in our hands, and the customer watched our question appear first (owner, 08-01).
    if (heldQuestion && questionTimer) { clearTimeout(questionTimer); questionTimer = setTimeout(releaseHeldQuestion, QUESTION_HOLD_MS); }
  }
  /** Show our question on the live view without their hello above it — only ever because their hello
   *  never became words at all. A store that says nothing must not leave a customer staring at an
   *  empty conversation. */
  function releaseHeldQuestion() {
    const q = heldQuestion; heldQuestion = null; questionTimer = null;
    if (q) { log("delta: no words back from the store yet, showing our question on its own"); try { relayLine?.(room, "Agent", q); } catch { /* relay best-effort */ } }
  }
  /** One frame of μ-law silence, and how many of them read as "they stopped talking". */
  const QUIET_FRAME = Buffer.alloc(160, 0x7f).toString("base64");
  const TURN_GAP_FRAMES = 40; // 800ms — past any natural pause inside one sentence
  /** What a phone line actually is: one 20ms frame every 20ms. Held audio goes out at exactly this
   *  rate, because the transcriber measures pauses on a real clock and anything faster erases them. */
  const FRAME_MS = 20;
  /** How small the backlog has to get before the rest goes out in one go. A fifth of a second is far
   *  too short to slur a syllable, and it is what stops us trailing the live line forever. */
  const CATCHUP_FRAMES = 10;

  /** WE ARE ABOUT TO ASK THE QUESTION. Shut both gates: his voice off the line while the clip plays,
   *  and his voice off the line after it until Staff answer. Called at the opening and again when the
   *  recording re-asks a new person after a hand-over, so both journeys behave the same way. */
  function holdHimForTheirAnswer() {
    charlieGateOpen = false;
    charlieMaySpeak = false;
    helloAlreadyAnswered = true;   // their next line is the hello the recording is answering
    // Zeroed HERE, and `startOpeningClip` is the caller that matters: the question only starts once
    // their hello has finished, so everything voiced from this moment on is an answer to it.
    answerVoiceFrames = 0;
    if (answerWaitTimer) { clearTimeout(answerWaitTimer); answerWaitTimer = null; }
  }
  /** Staff have said something that is not the hello, so it is his conversation now. */
  function letHimAnswer(via: string) {
    if (charlieMaySpeak) return;
    charlieMaySpeak = true;
    if (answerWaitTimer) { clearTimeout(answerWaitTimer); answerWaitTimer = null; }
    log(`delta: ${via} -> Charlie may speak`);
  }

  /** The clip is over: hand the conversation to the agent. Idempotent — three signals race to call
   *  this and a backstop calls it if all three miss, so it must only ever act once. */
  function openCharlieGate(via: string) {
    if (charlieGateOpen) return;
    charlieGateOpen = true;
    clipTimers.forEach(clearTimeout); clipTimers.length = 0;
    // The question ended sooner than his warm-up was due to start — a short clip, or the carrier
    // confirming early. Open him NOW rather than let the conversation begin with nobody on our end.
    // THE HANDOVER IS A DETAIL OF THE JOIN, NOT A SECOND JOIN. Which signal confirmed the question
    // had played, and how much of the answer we were holding while it did, are exactly what you want
    // when a call goes wrong — so they are kept, on the one line that says the agent joined.
    // THE QUESTION HAS FINISHED. From here, every moment his session is not yet ready is dead air a
    // real person is listening to (card row 3: "Charlie warmed up late. There was dead air for 2
    // seconds."). Measured, not assumed: stamped here, closed out when he reports ready.
    gateOpenedMs = Date.now();
    joinFacts = { ...joinFacts, handoverVia: via, heldFrames: pending.length, warmedUpInTime: ready };
    if (ready) joinFacts = { ...joinFacts, deadAirMs: 0 };
    amend(room, "charlie_join", joinFacts);
    if (!eleven) { if (prewarmTimer) { clearTimeout(prewarmTimer); prewarmTimer = null; } void connectEleven(); }
    log(`delta: clip finished (${via}) -> agent gate open, releasing ${pending.length} buffered frame(s)`);
    // …BUT HIS MOUTH IS STILL SHUT until Staff answer the question (the second gate above). If they
    // never do, this is what lets him in rather than leaving a person on a silent line.
    if (!charlieMaySpeak && !answerWaitTimer) {
      answerWaitTimer = setTimeout(() => {
        answerWaitTimer = null;
        if (ended || charlieMaySpeak) return;
        emit(room, "unknown", `Nothing was said back to the question in ${Math.round(ANSWER_WAIT_MS / 1000)}s, so Charlie was let in`,
          { step: "no_answer_to_the_question", afterMs: ANSWER_WAIT_MS });
        letHimAnswer("nobody answered the question");
      }, ANSWER_WAIT_MS);
    }
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
    holdHimForTheirAnswer();
    clipText = clip.text;
    clipMs = clip.ms;
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
    // NOT a join: the agent has not opened, is not billing, and cannot be heard. It used to write a
    // "charlie_join" line here, which is how one agent came to join three times on one receipt. The
    // question itself is not lost — recordLine below puts it on the transcript at its real second,
    // where it belongs, and its length rides the real join line.
    joinFacts = { ...joinFacts, question: clip.text, clipMs: clip.ms };
    // …but it IS a step of the check, and nothing wrote it down (round 1, item 1.3). Asking from our
    // own recording is what makes a check cheap, and the card has a row for it — so the log has to
    // be able to say it happened, at the second it happened, and that Charlie did not ask it himself.
    emit(room, "unknown", "The question played as a recording", { step: "question_clip", ms: clip.ms, text: clip.text });
    // ── THEIR HELLO IS NOT HIS TO ANSWER, SO HE NEVER RECEIVES IT (owner 08-05) ──
    //
    // Everything held up to this instant is their hello; everything after it answers our question.
    // For months Charlie worked because HE said the opening line: their hello was his cue to speak,
    // and answering it was exactly right. On the new shape a RECORDING asks the question and Charlie
    // is opened as a second agent mid call, but he was still handed their hello as his first turn.
    // A hello is a question, so he answered it, on all five of checks 282-286.
    //
    // Blocking his voice was not enough (check 288): the reply he was never allowed to say STAYS IN
    // HIS OWN HISTORY, so from there he believes he asked whether they had any in stock, and every
    // turn after that is one behind the store. That is why he asked the set question twice.
    //
    // So the hello is taken out here and never reaches him. His conversation begins where the owner
    // says it begins: after the store has finished talking, with their answer to our question. It is
    // still written down and their name is still used — `transcribeTheirHello` below does both,
    // off this same audio, without putting a turn in front of him.
    helloAudio = pending.splice(0, pending.length);
    void transcribeTheirHello(helloAudio, ctx?.apiKey || config.voice.apiKey);
    // THE QUESTION WE ACTUALLY ASKED IS A LINE OF THE CONVERSATION. It is played from a recording
    // rather than generated, so nothing in the provider's transcript knows it happened — which left
    // our own record missing the single most important line on the call, and left the live view with
    // no way to know we had asked. It then sat on "Staff picked up" forever, and any short word the
    // agent said next got painted as walking a phone menu at a store with no menu at all.
    recordLine(room, "Agent", clip.text, undefined, true /* we played it ourselves, so it is never an echo */);
    // HELD BACK FROM THE LIVE VIEW UNTIL THEIR HELLO CAN GO IN FRONT OF IT. Staff speak first, always,
    // but their words do not exist until the agent has transcribed the audio we held for him — several
    // seconds later. Sent the instant it plays, our question is therefore the FIRST thing a customer
    // watching ever sees, with the store's hello dropping in underneath it afterwards. The record is
    // already in the right order; this is the one place the screen could still get it wrong. Nobody is
    // waiting on this line: the page says Talking to Staff throughout, and a few seconds is invisible
    // on a check that runs half a minute.
    heldQuestion = clip.text;
    questionTimer = setTimeout(releaseHeldQuestion, QUESTION_HOLD_MS);
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
    noteWeEnded(room, "dropped");   // WE ended it (item 5)
    emit(room, "hangup", "The check broke on our end, so we hung up without saying anything", { reason: "dropped", why });
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
    // THE QUIET AFTER THE GOODBYE IS THE CHECK ENDING, NOT STAFF STEPPING AWAY (owner 08-04,
    // check 282). Charlie was told to wrap up and said his goodbye, and the next quiet was read
    // as a wait: he was dropped, his own session's close was then swallowed by the wait rule
    // (a close during a hold never ends the check), and the line sat open for 70 more seconds
    // until the STORE hung up on us. Once the wrap-up was asked for AND the goodbye is on the
    // record, a quiet or empty line is us being done, so WE put the phone down. The ear only
    // counts quiet after our audio has finished playing, so his goodbye is always fully out
    // before this fires. Music or a transfer starting after a goodbye is somebody acting, and
    // the usual wait rules keep owning those.
    if (signoffNudged && wrapRecorded && (reason === "quiet" || reason === "room")) {
      noteWeEnded(room, "signed_off");
      emit(room, "hangup", "Charlie said goodbye and the line went quiet, so we hung up", { reason: "signed_off", atMs });
      log("signoff: goodbye said and the line went quiet — the check is over, hanging up");
      try { eleven?.close(); } catch { /* torn down */ }
      signalEnd();
      try { twilio.close(); } catch { /* best effort */ }
      return;
    }
    onHold = true; holdReason = reason; heldWords = [];
    // EVERY WAIT THAT ENDS HAS TO HAVE STARTED. A transfer used to write ONLY its own line, and then
    // the wait it caused ended with a "back off hold" that had no "put on hold" anywhere above it —
    // a receipt you cannot read straight through (owner 07-28). Being handed on and being made to
    // wait are two facts, so a real transfer now says both, in that order. No new event kinds: the
    // set is a closed sixteen and both of these are already in it.
    if (reason === "transfer") emit(room, "transfer", transferNote, { reason, atMs, department: department || null });
    const note = reason === "transfer" ? "Waiting for the next department to pick up"
      : reason === "music" ? "Staff stepped away, hold music"
      // A HANDSET ON THE COUNTER. The store is still audible, nobody is talking to us, and the meter
      // stops exactly as it does on silence.
      : reason === "room" ? "The room went quiet, Staff put the phone down"
      : "Staff stepped away, the line went quiet";
    emit(room, "hold_start", note, { reason, atMs });
    // …AND THIS WAIT HAS AN ENDING NOW (round 1, item 1.6). Nothing ended a mid check wait before
    // this: a store that put the phone down and forgot about us ran to the carrier's own five minute
    // limit, and the customer waited all of it to be told nothing. Waiting is nearly free because
    // Charlie is dropped, so the cap is generous — but it exists.
    //
    // Every kind of wait, including one that follows a hand-over: from the customer's side the
    // outcome is identical, nobody came back. The status is the one we already have, "left on hold";
    // no new word for a customer to read (owner's ruling 08-01).
    if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; }
    holdCapTimer = setTimeout(() => {
      holdCapTimer = null;
      if (!onHold || ended) return;
      const waited = Math.round(HOLD_CAP_MS / 1000);
      noteWeEnded(room, "held_too_long");   // WE ended it (round 2, item 5)
      emit(room, "hangup", "The store put us on hold too long, so we hung up", { reason: "held_too_long", afterSec: waited, holdReason: reason });
      log(`hold cap: ${waited}s on hold with nobody coming back — hanging up (Charlie was never billing for it)`);
      try { if (eleven) eleven.close(); } catch { /* best effort */ }
      try { twilio.close(); } catch { /* best effort */ }
    }, HOLD_CAP_MS);
    if (ctx?.holdStrategy === "reopen") {
      // Close him. This is the only thing that actually stops the meter — muting saves nothing.
      // The call, the room and the receipt all continue; when somebody comes back he opens again as
      // the next numbered segment of this same call.
      log(`hold (${reason}): closing the agent — the meter stops until somebody comes back`);
      closeSegment(room);
      markNow(room, "charlieCloseMs");
      emit(room, "charlie_leave", "Charlie dropped", { reason, strategy: "reopen" });
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
    onHold = false; holdReason = null; everCameBack = true;
    // Somebody came back, so the wait had an ending of its own and the cap has nothing to end.
    if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; }
    const secs = Math.round(gapMs / 1000);
    // A HAND-OVER IS ALWAYS A NEW PERSON. The twenty-second bar is right for somebody stepping away
    // to look at a shelf and coming back: same person, same conversation. Being handed to another desk
    // is the opposite fact — whoever picks up never heard the question, however fast the hand-over
    // was. Timing it decided that for us, so a quick transfer left the agent carrying on mid answer
    // with a stranger, which is exactly the wrong-department save failing at the last step.
    const newPerson = maybeNewPerson || was === "transfer" || expectHandover;
    // WHY it counted as a new person, not just that it did. A silent hand-over and a ringing one are
    // the same fact and different evidence, and the screen that grades this check has to be able to
    // tell "we were handed on" from "somebody wandered off", which the sound alone cannot say.
    const asked = expectHandover;
    if (expectHandover) expectHandover = false;
    // WHOEVER COMES BACK MAY NOT BE WHO LEFT, so the name we hold is no longer theirs. Thanking a
    // new person by the last person's name is worse than not using a name at all.
    if (newPerson) theirName = null;
    addMs(room, "holdMs", gapMs);   // the number that has been null on every receipt until now
    emit(room, "hold_end", `Staff back after ${secs}s${newPerson ? ", and it may not be the same person" : ""}`, { gapSec: secs, maybeNewPerson: newPerson, reason: was, ...(asked ? { afterAskingToBePutThrough: true } : {}) });
    // DELTA PLAYS THE RECORDING AGAIN AFTER A TRANSFER (owner 08-04: "Echo absolutely needs to
    // build this"). Whoever picks up the next department never heard the question, and Charlie
    // re-asking it himself is exactly the expensive way: the recording asks for free, in the same
    // voice, and Charlie stays off the line until Staff answer it. The machinery is the OPENING's
    // own, called a second time — the clip waits for the new greeting to end, his mouth stays shut
    // behind the same gate, and closing the gate before his session opens is also what picks the
    // joining Charlie, the one whose standing instruction is to wait silently for the answer.
    // Only a real hand-over: Staff who walked away and came back themselves are mid conversation,
    // and playing the question at them again would be asking twice.
    const handedOn = (was === "transfer" || asked) && !!ctx?.openingClip && !!ctx?.midCallAgentId;
    if (handedOn) {
      holdHimForTheirAnswer();   // the new person's hello is theirs to make, and the recording answers it
      clipEchoDropped = false;   // his session will echo the re-played question once more; drop it once more
      pendingClip = ctx!.openingClip!; waitQuietMs = 0; waitTotalMs = 0;
      log("hand-over over: the recording will ask the new person, Charlie stays off the line until they answer");
    }
    // NOBODY IS ON OUR END AND SOMEBODY IS BACK ON THEIRS — open a session, whatever the strategy
    // (family 2). This used to run only for "reopen"; a hold that began around the opening question
    // could leave the gate strategy here with no session at all and nothing left to open one, and a
    // refused open during the hold (the one-door rule above) must always be made good right here.
    if (!eleven) {
      log(`hold over after ${secs}s: opening the agent for whoever is back (next segment of this call)`);
      // HE WAS CLOSED, SO HE CANNOT BE TOLD YET, AND HE STILL HAS TO BE TOLD. The note is held and
      // sent the instant his new session reports ready. Skipping it is how a reopened agent greets a
      // brand new person as though they had been on the line the whole time.
      gapNote = { secs, newPerson, replayed: handedOn };
      void connectEleven(`back after a ${secs}s wait`);
      // The buffer is the existing one: everything said from here is held until his session reports
      // ready, then released whole, exactly as it is on the opening handoff.
      connecting = true;
      return;
    }
    // He stayed open through the wait, so he has been fed nothing and believes no time has passed.
    // TELL HIM, or he carries straight on and greets a new clerk as the old one.
    tellCharlieAboutTheGap(secs, newPerson, handedOn);
    for (const w of heldWords) { try { eleven?.send(JSON.stringify({ user_audio_chunk: w })); } catch { /* best effort */ } }
    heldWords = [];
  }

  // ---- THE WRAP-UP LIMIT (round 1, item 1.5) ---------------------------------------------------
  // THE CHATTY CLERK. The one case no drop rule catches: somebody genuinely IS talking, hemming and
  // hawing, never landing on an answer. Every rule is working correctly and the check runs away with
  // the margin — he costs 11 cents a minute, and the whole check is meant to cost 6.6.
  //
  // The limit is on Charlie ACTUALLY TALKING, not on the check: waiting is nearly free because he is
  // dropped, and it is talk time that breaks the margin. And it NEVER ends the check. A hard hang up
  // at a limit is the thing the owner is right to fear: the clerk is mid help, the check dies, and
  // the customer paid for all of it. The limit tells him to START WRAPPING UP, once.
  let charlieSpokenMs = 0;
  let wrapUpNudged = false;
  /** His line, the owner's words. NO DASHES: they read strangely through ElevenLabs. */
  function nudgeToWrapUp() {
    if (wrapUpNudged || !eleven || !ready) return;
    wrapUpNudged = true;
    const what = String(ctx?.dynamicVars?.category || "").trim();
    const line = `Don't want to keep you, did you find out if you have ${what ? `${what} cards` : "them"}?`;
    const secs = Math.round(charlieSpokenMs / 1000);
    emit(room, "unknown", "Charlie has talked long enough, so he starts wrapping up", { step: "wrap_up_limit", talkingSec: secs, line });
    log(`wrap-up limit: ${secs}s of talking — telling him to close, never hanging up`);
    try {
      eleven.send(JSON.stringify({ type: "contextual_update", text:
        `[You have been talking for ${secs} seconds and this check is costing money. Say exactly this, once, in your own voice: "${line}" `
        + `Then take whatever answer you get, thank them warmly and end the check. If they still cannot answer, saying you will call back is fine. `
        + `Do NOT cut them off mid sentence and do NOT hang up on somebody who is helping you.]` }));
    } catch { /* best effort — never break a check over a note */ }
  }

  // THE SIGNOFF (owner 08-04). The reader runs on every line as it lands, so the moment a check has
  // its answer is known DURING the check — and until now nobody told Charlie, so he asked his next
  // follow-up into a conversation that was already over and eight of ten robot store checks ended
  // without a goodbye. Once, on the same note channel every other note rides; never a hang up. His
  // own instructions still govern the one follow-up they call for, so the note allows it and then
  // requires the goodbye, which is the thing that was missing.
  let signoffNudged = false;
  // HUNG ON THE CHECK'S NAME, WHEN THE NAME IS KNOWN. The carrier's socket connects bare and the
  // room only arrives in its start message a moment later — so a door hung at connect time was
  // registered under an empty name on EVERY real check, and the knock ("the answer is in hand…")
  // found nobody. The rig never saw it because the rig hands the room in up front. Hung here for
  // callers that do, and hung AGAIN from the start handler for the carrier's way in.
  const hangSignoffDoor = () => { if (room) signoffDoors.set(room, signoffDoor); };
  const signoffDoor = (answer: string) => {
    if (signoffNudged || ended || onHold || !eleven || !ready) {
      log(`signoff: knock for ${room.slice(0, 8)} (${answer}) not deliverable: ${signoffNudged ? "already told" : ended ? "the check is over" : onHold ? "Staff are away" : !eleven ? "Charlie is not open" : "his session is not ready"}`);
      return;
    }
    signoffNudged = true;
    emit(room, "unknown", "The answer is in hand, so Charlie was told to wrap up", { step: "signoff", answer });
    log(`signoff: the answer is in hand (${answer}) — telling him to thank them and end`);
    try {
      eleven.send(JSON.stringify({ type: "contextual_update", text:
        `[The answer is in hand. If your instructions call for one quick follow-up, ask it once; otherwise wrap up NOW: `
        + `thank them warmly, by name if they gave one, and end the check with end_call. `
        + `From here NEVER repeat a question you already asked, in any wording, even if their answer did not fit it. `
        + `If you already asked a follow-up and they have not answered it, or their answer made no sense, let it go and say your goodbye anyway. `
        + `Never leave the check without saying goodbye, and never hang up on somebody mid sentence.]` }));
    } catch { /* best effort — never break a check over a note */ }
  };
  hangSignoffDoor();

  /** A note to the agent that is NOT spoken to the store: time passed and who is on the line may
   *  have changed. The provider's own contextual-update channel, so nothing is said out loud. */
  /**
   * THEIR HELLO, WRITTEN DOWN WITHOUT BEING PUT IN FRONT OF CHARLIE (owner 08-05).
   *
   * Charlie's session used to be our only transcriber, which is the whole reason their hello was
   * handed to him: the greeting is the first line of the record and it is where Staff give their
   * name. It is also a question, so he answered it, and everything after that ran one turn behind
   * the store. Now the hello is transcribed on its own, off the very same audio, by the same account
   * we already pay — and it goes back through the SOCKET'S OWN message handler, so the name, the
   * wrong department test, the voicemail bail, the record and the customer's page are all the ONE
   * copy that already works rather than a second one written here (LAW 1).
   *
   * Best effort in the truest sense: nothing waits on it, and a failure costs the greeting LINE, not
   * the check. Never a fallback to handing him the audio — that is the fault this exists to end.
   */
  async function transcribeTheirHello(frames: string[], apiKey: string) {
    const audio = Buffer.concat(frames.map((f) => Buffer.from(f, "base64")));
    if (!audio.length || !apiKey) return;
    try {
      // μ-law 8kHz is what the carrier gives us; the header says so and no sample is touched.
      const head = Buffer.alloc(58);
      head.write("RIFF", 0); head.writeUInt32LE(50 + audio.length, 4); head.write("WAVEfmt ", 8);
      head.writeUInt32LE(18, 16); head.writeUInt16LE(7, 20); head.writeUInt16LE(1, 22);
      head.writeUInt32LE(8000, 24); head.writeUInt32LE(8000, 28); head.writeUInt16LE(1, 32);
      head.writeUInt16LE(8, 34); head.writeUInt16LE(0, 36);
      head.write("fact", 38); head.writeUInt32LE(4, 42); head.writeUInt32LE(audio.length, 46);
      head.write("data", 50); head.writeUInt32LE(audio.length, 54);
      const body = new FormData();
      body.append("model_id", "scribe_v1");
      body.append("file", new Blob([Buffer.concat([head, audio])], { type: "audio/wav" }), "hello.wav");
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": apiKey }, body });
      if (!r.ok) { log(`hello: not transcribed (${r.status})`); return; }
      const text = String(((await r.json()) as { text?: string }).text || "").trim();
      // Real words only. A quiet line comes back as an audio event in brackets, and writing
      // "[outro jingle]" onto the owner's transcript as something Staff said is worse than nothing.
      if (!text || !/[a-zA-ZÀ-ɏ]{2,}/.test(text) || /^\[[^\]]*\]$/.test(text)) { log(`hello: nothing worth writing down (${text.slice(0, 40)})`); return; }
      log(`hello: transcribed on its own -> ${text.slice(0, 60)}`);
      // …and back through the one door every other line uses.
      eleven?.emit("message", Buffer.from(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: text } })));
      // HE NEVER HEARD THEM SAY IT, so the one thing he would have taken from it is handed over as
      // context rather than as a turn: the owner grades whether he thanked them by name.
      const n = staffName(text);
      if (n && eleven && ready) {
        try { eleven.send(JSON.stringify({ type: "contextual_update", text: `[The person who answered is called ${n}. They said hello before your recorded question played, so do not greet them again. Use their name once, naturally.]` })); }
        catch { /* best effort — never break a check over a note */ }
      }
    } catch (e) { log(`hello: transcribe threw ${String(e).slice(0, 80)}`); }
  }

  function tellCharlieAboutTheGap(secs: number, maybeNewPerson: boolean, replayed?: boolean) {
    if (!eleven || !ready) return;
    const text = replayed
      // The recording owns the question after a hand-over. Told, or he asks it a second time over
      // the top of his own recording, which is the asking twice fault through a new door.
      ? `[There was a ${secs} second gap and somebody new picked up. The recording is asking your question again for you. Say NOTHING until they answer it, then carry on from their answer exactly as if you had asked it yourself. Do not ask the question again.]`
      : maybeNewPerson
      ? `[There was a ${secs} second gap. The person who comes back may be someone new who did not hear your question. If they sound like a different person, ask again briefly rather than continuing.]`
      : `[There was a ${secs} second gap while they went to check. Carry on from where you were.]`;
    try { eleven.send(JSON.stringify({ type: "contextual_update", text })); log(`hold: told the agent about the ${secs}s gap`); }
    catch { /* best effort — never break a call over a note */ }
  }

  async function connectEleven(segmentWhy?: string) {
    if (!ctx) { log("connectEleven: NO CONTEXT"); return; }
    // EVERY ROAD INTO CHARLIE ENDS AT THIS ONE DOOR (08-01 audit, family 2). The run-5 fix guarded
    // triggerConnect, but the clip path never passes through it: the warm-up timer, the short-clip
    // open, the socket-retry open and all four racers into openCharlieGate call HERE directly — so a
    // hold starting around the question could still open a ghost Charlie into the hold music. The
    // rule lives at the door itself now: while Staff are away, nothing opens Charlie. endHold clears
    // the hold BEFORE it reopens him, so the one legitimate road back in still passes.
    if (onHold) { log(`connectEleven refused (${segmentWhy ?? "clip path"}): Staff are away — only somebody coming back opens Charlie`); return; }
    // ONE SESSION AT A TIME. `connecting` used to be set here and nowhere else, so it doubled as the
    // guard; now that buffering starts earlier it no longer guards anything, and two routes into this
    // (the warm-up timer and the gate opening) could each open a socket. The second one replaced the
    // first mid-handshake and the call died on "WebSocket is not open".
    // Set BEFORE the signed-url await, or two callers both pass the check while the first is still
    // fetching and the second's socket replaces the first mid-handshake.
    if (eleven || opening) { log("connectEleven: already open or opening, ignored"); return; }
    opening = true;
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
    opening = false;   // the handshake is decided; from here `eleven` itself is the guard
    // …AND THE SAME QUESTION AGAIN, because time passed. Fetching the address to open him with takes
    // a moment, and Staff can step away inside it — the check at the top of this function was true
    // when it ran and stale by the time we get here, which opens a billing session into hold music.
    // Somebody coming back always opens him afresh, so refusing here can never lose the agent.
    if (onHold) { log(`connectEleven refused after the handshake (${segmentWhy ?? "clip path"}): Staff stepped away while we were opening`); return; }
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
    const ws = new WebSocket(url);
    eleven = ws;
    ws.on("open", () => {
      // Each session gets its own one-shot echo allowance: a reopened session is handed the recorded
      // question as context again and reports it as its own line again (open fault 4).
      clipEchoDropped = false;
      // THE BILLED SECOND ZERO. The provider meters from session open, so this is where the money
      // clock starts — not at first word. Everything after this is seconds we are paying for.
      markNow(room, "charlieOpenMs");
      // A NUMBERED STRETCH of this one call, never a separate call (hard rule 1). Ordinary calls
      // have exactly one; a call where he was closed for a wait has two or more.
      const n = openSegment(room, segmentBrain, segmentWhy);
      // THE ONE LINE that says the agent joined. Everything the recorded question and the handover
      // know about this join rides in its detail rather than writing lines of its own.
      emit(room, "charlie_join", n === 1 ? "Charlie joined" : `Charlie reconnected, part ${n} of this check`, { reason: connectReason, segment: n, brain: segmentBrain, why: segmentWhy, ...joinFacts });
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
      ws.send(JSON.stringify(init));
    });
    eleven.on("message", (data: Buffer) => {
      let m: { type?: string; audio_event?: { audio_base_64?: string }; ping_event?: { event_id?: number }; conversation_initiation_metadata_event?: { conversation_id?: string }; user_transcription_event?: { user_transcript?: string }; agent_response_event?: { agent_response?: string } };
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type === "conversation_initiation_metadata") {
        ready = true;
        // HOW LATE HE WAS, IF HE WAS LATE. The question has already finished when this lands after
        // the gate opened, and every one of those milliseconds is a person listening to silence.
        if (gateOpenedMs) {
          const deadAirMs = Math.max(0, Date.now() - gateOpenedMs);
          joinFacts = { ...joinFacts, deadAirMs, warmedUpInTime: deadAirMs < 250 };
          amend(room, "charlie_join", joinFacts);
          gateOpenedMs = 0;
        }
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
        // 30 minutes, not 10 (08-01 audit, family 3): this map used to die five minutes before the
        // in-memory receipt did, and in that gap the page's session-id poll fell back to the
        // provider. Past 30 minutes the gatekeeper's database row answers instead — the map is only
        // the fast path, never the last word.
        if (convId) { conversations.set(room, convId); linkProviderCall(room, convId); setTimeout(() => conversations.delete(room), 30 * 60 * 1000); if (c.connectOnHuman && humanAtMs) navByConv.set(convId, Math.max(0, Math.round((humanAtMs - startMs) / 1000))); log(`metadata: convId=${convId}`); try { c.onConversationId?.(convId); } catch (e) { log(`onConversationId threw: ${String(e).slice(0, 80)}`); } }
        else log(`metadata but NO convId: ${JSON.stringify(m).slice(0, 200)}`);
        // Held back while Delta is still asking — openCharlieGate releases them the instant the
        // clip is done, in order, so an early answer reaches him complete instead of half-heard.
        flushPending();
        // THE WAIT HE SLEPT THROUGH. This session was opened because somebody came back, so it starts
        // with no idea a gap happened at all. Told here, before a single held word reaches him.
        if (gapNote) { const g = gapNote; gapNote = null; tellCharlieAboutTheGap(g.secs, g.newPerson, g.replayed); }
      } else if (m.type === "audio") {
        const b64 = m.audio_event?.audio_base_64;
        // He is warming up behind the question, not talking over it. Nothing he produces before the
        // gate opens reaches the line.
        if (b64 && !charlieGateOpen) { log("delta: agent tried to speak during the clip, suppressed"); }
        // HIS REPLY TO THEIR HELLO NEVER REACHES THE LINE. The recording already answered it, and this
        // is the whole fault: it is a fresh greet-back plus the question again, and on a short clip it
        // used to escape and the store answered it (check 286). Dropped, not queued — a delay would
        // only put the same duplicate on the line a second later. Recorded ONCE, because a check where
        // it was silently dropped looks identical to a check where he never tried (rule 8).
        else if (b64 && !charlieMaySpeak) {
          if (!heldHisHelloReply) {
            heldHisHelloReply = true;
            emit(room, "unknown", "Charlie went to answer their hello, which the recording had already answered, so it was not spoken",
              { step: "hello_reply_held" });
            log("delta: agent tried to answer their hello, suppressed (the recording already did)");
          }
        }
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
          // …and the same milliseconds are what the wrap-up limit counts: audio that really reached
          // Staff's ear, never a stopwatch on the whole check (round 1, item 1.5).
          charlieSpokenMs += ms;
          if (!wrapUpNudged && charlieSpokenMs >= WRAP_UP_MS) nudgeToWrapUp();
        }
      } else if (m.type === "user_transcript") {
        const txt = m.user_transcription_event?.user_transcript;
        // Real words on the store side (letters, not ringback transcribed as "...") = someone IS
        // there — disarm the give-up cap. Voicemail greetings count: the voicemail bail handles those.
        if (txt && /[a-zA-ZÀ-ɏ]{2,}/.test(String(txt)) && !humanWords) { humanWords = true; if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } }
        // THEIR HELLO, THEN THEIR ANSWER (the second gate, declared at the top of this file).
        //
        // The first Staff line after we commit to asking is the hello: it is the audio we buffered
        // while his session opened, it is what triggered the recording in the first place, and the
        // recording is what answers it. His mouth opens on the line AFTER it, which is their answer to
        // our question and the first thing in this call that is genuinely his to reply to.
        //
        // Read off the WORDS, not the audio, and deliberately so: ElevenLabs transcribes a user turn
        // before its model answers it, so a Staff line can never arrive after the reply it caused.
        // That ordering is what makes this a gate and not a race. Junk ("...", ringback) is not words.
        if (txt && /[a-zA-ZÀ-ɏ]{2,}/.test(String(txt)) && !charlieMaySpeak) {
          if (helloAlreadyAnswered) { helloAlreadyAnswered = false; log("delta: that was their hello, the recording has it, still holding him"); }
          else letHimAnswer("Staff answered the question");
        }
        // THEIR NAME, IF THEY GAVE ONE (round 1, item 1.3). Staff name themselves in the greeting far
        // more often than not, and Charlie thanking them by name is a row on the owner's card. Kept
        // from the first line that has one, and dropped when somebody new comes on, so the name we
        // hold always belongs to the person Charlie is actually talking to.
        // "THERE IS NOBODY UP FRONT RIGHT NOW." The one honest ending to a wrong department: he asked
        // once, and there is nobody to ask. Nothing wrote that moment down, so the row that grades it
        // (Staff said no, and did he wrap up warmly rather than nag) had nothing to read. Only ever
        // heard AFTER he asked, so an ordinary "nobody here knows" mid conversation cannot trip it.
        if (txt && weAskedToBePutThrough && !nobodyToTransfer && saysNobodyToTransfer(String(txt))) {
          nobodyToTransfer = true;
          emit(room, "unknown", "Staff said there was nobody to transfer to", { step: "nobody_to_transfer", said: String(txt).slice(0, 200) });
          log("wrong department: Staff said there is nobody to put us through to");
        }
        if (txt && !theirName) {
          const n = staffName(String(txt));
          if (n) { theirName = n; log(`staff name heard: ${n}`); }
        }
        // OUR record of what was said, written live against this call's own clock — not read back
        // from the provider afterwards (hard rule 2). Text only, never audio. The record's answer
        // (fresh or a repeat) gates the relay below, so the page can never show a line twice that
        // the record holds once (08-01 audit, open fault 4).
        let freshLine = false;
        if (txt) { freshLine = recordLine(room, "Clerk", String(txt), greetingStartedMs || undefined); greetingStartedMs = 0; }
        // Flipped AFTER the voicemail test below has had its one look at this line, so the store's
        // FIRST words are the only ones that may end a check as a machine (round 2, item 3).
        const wasStoreFirstLine = txt ? !storeHasSpoken : false;
        // Their hello has arrived, so it goes out FIRST and our question follows it, which is the
        // order the call actually happened in.
        if (txt && heldQuestion) {
          const q = heldQuestion; heldQuestion = null;
          if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
          try { relayLine?.(room, "Clerk", String(txt)); relayLine?.(room, "Agent", q); } catch { /* relay best-effort */ }
        } else if (txt && freshLine) try { relayLine?.(room, "Clerk", String(txt)); } catch { /* relay best-effort */ }
        // VOICEMAIL = hang up NOW, not after the greeting plays out (owner 07-22: "as soon as it
        // starts hearing the voice message it should hang up to save us money"). Same phrases the
        // outcome mapper stamps `voicemail` from, so the verdict stays consistent. Closing the
        // stream ends the TwiML <Connect> → Twilio hangs the PSTN leg; the EL leg closes with it.
        // WE LANDED IN THE WRONG DEPARTMENT. Not something the Ear can ever say (spec §10: it needs
        // somebody to understand *this is the pharmacy*, which is words), so it is read here, off our
        // own transcript, next to the voicemail phrases. Recorded ONCE: the save is one ask, and a
        // second line about the same landing would fold into the same review item anyway. Nothing on
        // the line changes because of this — the agent is what does the asking. This only makes sure
        // the receipt CARRIES it, so the map learns from a check that had to be saved.
        // WE WERE SENT BACK THROUGH THE PHONE MENU (round 2, item 4 — the owner sees this often).
        // Staff hand us on and instead of another department we land back at the recorded menu. The
        // Ear cannot say this: a menu and a person are both sound, and telling them apart is WORDS
        // (runtime spec §10). A menu names its own options, so its words give it away. Only counted
        // AFTER a hand-over, because a menu before one is simply the store's front menu doing its job,
        // and only once, because the same menu says the same thing several times over.
        if (txt && (expectHandover || wrongDept || everCameBack) && !sentBackToMenu && looksLikeAMenu(String(txt))) {
          sentBackToMenu = true;
          emit(room, "unknown", "We were sent back through the phone menu", { sentBackToMenu: true, said: String(txt).slice(0, 160) });
          log("hand-over landed back in the phone menu, not at a department");
        }
        if (txt && !wrongDept) {
          const wd = heardWrongDepartment(String(txt));
          if (wd) {
            wrongDept = true;
            emit(room, "unknown", `We reached the wrong department: ${wd.why}`, { wrongDepartment: true, why: wd.why, said: wd.said });
            log(`wrong department: ${wd.why}`);
            // STAFF CAN HAND US ON WITHOUT BEING ASKED, and until now only OUR asking marked the next
            // wait as a hand-over. So "let me transfer you to electronics" followed by a silent, quick
            // hand-over read as the same person stepping away, and the agent carried straight on with
            // a stranger who never heard the question — the exact failure the save exists to prevent,
            // arriving through the door we did not watch. Their own words are the same evidence ours
            // are, so they mark it the same way. Only the offer to MOVE us counts; being told we are
            // in the wrong place predicts nothing until somebody actually asks.
            if (wd.handingOver && ctx?.neverTakeAHandover) {
              // A MAPPING CHECK ENDS HERE. This is the wrong desk and we are not riding a transfer
              // to a better one: the way in we took is wrong, and mapping's own next check takes the
              // next choice at the same store. Charlie wraps up warmly in his own words on the
              // channel that already carries notes to him; nothing is said for him and nothing hangs
              // up on Staff mid-sentence.
              log("wrong department: this is a mapping check, so the hand-over is declined");
              try {
                eleven?.send(JSON.stringify({ type: "contextual_update",
                  text: "[This is the wrong department and you must NOT be put through to another one. Thank them warmly in one short sentence and end_call now.]" }));
              } catch { /* best effort — never break a check over a note */ }
            } else if (wd.handingOver && !expectHandover) {
              expectHandover = true;
              log("wrong department: STAFF offered to hand us on, so the next wait is a hand-over");
            }
          }
        }
        if (txt && /\b(leave (?:a|your) message|after the (?:tone|beep)|at the (?:tone|beep)|voice ?mail|mailbox|record your message|is not available|unable to take your call|has been forwarded to)\b/i.test(String(txt))) {
          // A MACHINE PHRASE IS ONLY PROOF IN THE STORE'S VERY FIRST WORDS.
          //
          // A voicemail ANNOUNCES itself: "leave a message after the tone" is the first thing it
          // says, into a silence, before anybody has spoken to it. Every phrase in the pattern above
          // is also something a live person plausibly says once a conversation is running: "the
          // manager is not available", "that's been forwarded to the front", "you can leave a
          // message with me". So the first store-side line may end a check and nothing after it can.
          //
          // NOT the gate the spec asked for, and this is the reason, in full. The spec says go inert
          // once a person has been found, on the grounds that "a machine that answers the phone is
          // caught before that point anyway". It is not: nothing else catches it, and the recorded
          // voice of a voicemail greeting is exactly what trips the person detector, so that gate
          // switches this off on the one case it exists for and we pay for the whole announcement.
          // The PM audit found the same hole in the previous attempt (gating on our having asked:
          // the recorded question plays on that same person detection, so it disarmed too). Both
          // gates fail for one shared reason — today the thing that says "a person answered" cannot
          // tell a person from a recording. Round 1 fixes THAT (Charlie opens on the person test,
          // README section 6), and when it lands the person gate becomes the right one and this
          // first-line rule becomes belt and braces. Until then this is the only version that
          // protects a live person WITHOUT deleting the bail. Raised for the owner to rule.
          if (onHold || everCameBack || !wasStoreFirstLine) {
            emit(room, "unknown", "A recorded voice mentioned a message mid call, ignored — a live store, not voicemail", { said: String(txt).slice(0, 120) });
            log("voicemail phrase during/after a hold ignored — not hanging up on a live store");
          } else {
            log(`voicemail greeting detected -> hanging up to save the call minutes`);
            noteWeEnded(room, "voicemail");   // WE ended it (item 5)
            emit(room, "voicemail", "Reached a machine, hung up straight away");
            signalEnd(); try { eleven?.close(); } catch { /* torn down */ } try { twilio.close(); } catch { /* torn down */ }
          }
        }
        if (txt) storeHasSpoken = true;
      } else if (m.type === "agent_response") {
        const txt = m.agent_response_event?.agent_response;
        // THE QUESTION COMES BACK TO US AS IF CHARLIE SAID IT. The recorded question is handed to his
        // session as context, and the session then reports it as a line of its own — but it is already
        // on the record and already on the customer's page from the moment it PLAYED, so this echo
        // printed the question twice in a row (owner screenshot, 08-01). Dropped FUZZILY — the
        // session's styling of it rarely matches the recording word-perfectly, which is why the
        // exact-string drop still doubled it — and once per SESSION: every reopened session is handed
        // the question again and echoes it again (08-01 audit, open fault 4).
        if (txt && !clipEchoDropped && clipText && normSaid(String(txt)) === normSaid(clipText)) { clipEchoDropped = true; return; }
        // A LINE THE STORE NEVER HEARD IS NOT A LINE. Either gate being shut means his audio was
        // dropped rather than played, so recording the words would put a sentence on the customer's
        // page, on the owner's transcript and in front of the reader that nobody on the phone ever
        // heard. The echo drop above only catches his duplicate when he words it EXACTLY like the
        // recording; reworded, it was written down as a real line twice (checks 282 and 286).
        if (txt && (!charlieGateOpen || !charlieMaySpeak)) return;
        // HE HAS ASKED TO BE PUT THROUGH. From here the next wait that ends is a hand-over, whether or
        // not the next desk audibly rings — a silent hand-over is a quiet pause to the ear and nothing
        // else, and the ear must never be asked to judge this. It is also the ONE line of ours worth
        // reading: everything else he says changes nothing about how the call is run.
        if (txt && !expectHandover && askedToBePutThrough(String(txt))) {
          expectHandover = true;
          weAskedToBePutThrough = true;
          log("wrong department: he asked to be put through, so the next wait is a hand-over");
        }
        // The record's verdict on freshness gates the relay, same as the clerk side (open fault 4).
        // HE SAID GOODBYE, AND WHETHER HE USED THEIR NAME (round 1, item 1.3). "The check ended
        // without Charlie wrapping up" is a fail on the owner's card and nothing recorded it, so a
        // check that simply stopped and one that ended warmly looked identical afterwards. Words,
        // never the ear (§10), and once per check — he may say goodbye twice.
        if (txt && !wrapRecorded && wrappedUp(String(txt))) {
          wrapRecorded = true;
          const byName = usedTheirName(String(txt), theirName);
          emit(room, "unknown", byName ? "Charlie wrapped up and thanked them by name" : "Charlie wrapped up and thanked them",
            { step: "wrap_up", usedName: byName, name: byName ? theirName : null });
        }
        // WHICH LANGUAGE HE SPOKE, counted line by line off the same judge the map uses — never a
        // second opinion about what language a sentence is in.
        if (txt) { const l = guessLanguage(String(txt)); if (l === "es") spokeEs++; else if (l === "en") spokeEn++; }
        if (txt && recordLine(room, "Agent", String(txt))) try { relayLine?.(room, "Agent", String(txt)); } catch { /* relay best-effort */ }
      } else if (m.type === "ping") {
        // THE PING CRASH (owner 08-04). This used to answer on whatever `eleven` pointed at RIGHT
        // NOW, and after Charlie is dropped for a wait that is null — so a late are you there from
        // a session already torn down answered on a dead connection, threw, and the safety net
        // emailed the owner about a crash on an ordinary hold. A question is answered on the
        // connection it arrived on, and once that session has been replaced or closed it is nobody:
        // ignored, never answered on its successor's line.
        if (ws === eleven && ws.readyState === 1) ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id }));
        else log("ping from a session already replaced or closed — ignored");
      } else if (m.type === "interruption") {
        if (twilio.readyState === 1) twilio.send(JSON.stringify({ event: "clear", streamSid }));
        agentPlayingUntil = 0; // Twilio's playout buffer was cleared — nothing of ours is on the line now
      }
    });
    eleven.on("close", (code: number) => {
      // ONLY THE SESSION THAT IS ACTUALLY OURS MAY END THE CHECK. This close belongs to one specific
      // session, and by the time it arrives that session may already have been replaced: we close him
      // for a wait, Staff come back FAST, a fresh session is opened — and only then does the old
      // socket's close land. It read the check as "not on hold any more", fell through, and hung up
      // the phone on Staff who were back and talking. It also wrote a second "Charlie left" onto a
      // timeline where the wait had already recorded one. A stale close is bookkeeping that already
      // happened in beginHold, so it is simply dropped.
      if (ws !== eleven) { log(`eleven WS close code=${code} from a session we already replaced — ignored, the check is still running`); return; }
      closeSegment(room); markNow(room, "charlieCloseMs");
      log(`eleven WS close code=${code} (frames in=${frames})`);
      // "CHARLIE LEFT" IS DELETED (round 1, item 1.7). Charlie stops for exactly two reasons:
      // DROPPED, to save money, and he comes back; or he ENDED THE CHECK. This line was neither. It
      // was the connection closing BEHIND one of those two, written a second time onto a timeline
      // that had already said what happened — plumbing showing through on the owner's screen. So the
      // line is written where it is true and nowhere else: the wait already writes "Charlie dropped"
      // in beginHold, and a store hanging up on us is the store's line, not his.
      // NOBODY IS TALKING TO US, SO NOTHING HE DOES ENDS THE CHECK. A close during a wait used to be
      // forgiven only when we had asked for it; the other way round — Staff step away and the
      // provider then drops the session on its own silence timer — hung the phone up on a store that
      // was coming back. While Staff are away the wait owns what happens next: he is simply not
      // open, and somebody coming back opens him again.
      if (onHold) { eleven = null; ready = false; return; }
      // Charlie finishing is Charlie ENDING THE CHECK, and it is us putting the phone down, not the
      // store (item 5). ONLY while the phone leg is still up, though: when the STORE hangs up, the
      // carrier tears its leg down first and his session closes as a consequence, and claiming that
      // as ours would report every store hang-up as a normal finish, which is the exact thing this
      // is being built to tell apart. The close code rides along so a session that broke can be told
      // from one that finished.
      if (!farEndGone && twilio.readyState === 1) {
        noteWeEnded(room, code === 1000 ? "charlie_ended" : `charlie_ended_${code}`);
        emit(room, "charlie_leave", "Charlie ended the check", { code });
      }
      signalEnd(); if (twilio.readyState === 1) twilio.close();
    });
    eleven.on("error", (e: Error) => log(`eleven WS error: ${e.message}`));
  }

  // Bridge-injected keypad presses (see BridgeContext.dtmf). Press happens in code at a fixed
  // time after connect — no dependence on the LLM getting a turn during the recording.
  const dtmfTimers: NodeJS.Timeout[] = [];
  function sendDigit(digit: string) {
    if (twilio.readyState !== 1 || !streamSid) { log(`dtmf ${digit}: socket not ready, skipped`); return; }
    // STOP PRESSING THE MOMENT A REAL PERSON ANSWERS (runtime spec §10; 08-01 audit, family 2). The
    // recipe's scheduled presses kept firing after a person was found — stopKeysOnHuman only covers
    // the listening-navigation lane — which sends keypad tones into a live human's ear. One guard at
    // the one place a tone leaves the bridge.
    if (humanAtMs > 0) {
      log(`dtmf ${digit}: a person is on the line, press skipped`);
      emit(room, "unknown", "A mapped keypad press was due after a person answered, skipped", { digit });
      return;
    }
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
    // A STOPWATCH MAY NEVER JOIN A CALL A HUMAN IS ALREADY ON. The fallback timer armed at the start
    // of the call kept ticking after Staff answered, and 60 seconds in — while they had us on hold and
    // Charlie was rightly closed, so nothing else was holding the door shut — it fired and opened a
    // SECOND Charlie, blind, into their hold (owner's check, 08-01: a voice started talking while he
    // stood away from the phone). Once a human has been found, the only thing that may reopen Charlie
    // is that person, or their colleague, actually coming back — endHold owns that, nothing timed.
    if (reason !== "human" && (humanAtMs > 0 || onHold)) { log(`connect-on-human: ${reason} ignored, a human was already found — only somebody coming back reopens Charlie`); return; }
    humanAtMs = Date.now();
    connectReason = reason;
    // Somebody is there, so the phone is not ringing at nobody any more.
    if (ringWaitTimer) { clearTimeout(ringWaitTimer); ringWaitTimer = null; }
    if (reason === "human") {
      markNow(room, "humanMs"); emit(room, "human_detected", "Staff greeting");
      // From here somebody is on the line, so from here it is worth knowing when they stop being on
      // the line. The meter flips from "never checked" to a real measured zero at the same moment.
      startMeter(room, "holdMs");
      convEar = new ConversationEar({
        holdStart: beginHold, holdEnd: endHold,
        // NOBODY IS COMING BACK. Not the same as stepping away to check a shelf: this is a handset
        // left on a counter. Recorded, and the give-up cap owns what to do about it.
        deadAir: (quietMs) => emit(room, "unknown", `Nothing has been said for ${Math.round(quietMs / 1000)}s, the line is dead air`, { deadAirSec: Math.round(quietMs / 1000) }),
        // THE LINE IS GONE. A dropped leg stops sending audio entirely, which is an absence no
        // silence detector can see — so it is reported by whoever owns the socket, not heard.
        // THE LINE IS GONE. If we were mid hand-over when it went, that is its own thing and the
        // owner sees it often (round 2, item 4): the transfer itself drops the check, rather than
        // Staff hanging up or the check simply finishing. Same event either way — the closed set of
        // sixteen stays sixteen — with the detail saying which.
        disconnected: () => {
          farEndGone = true;   // the far end went, not us (round 2, item 5)
          const midTransfer = onHold && (holdReason === "transfer" || expectHandover);
          if (midTransfer) emit(room, "hangup", "The check was disconnected during the transfer", { reason: "disconnected_in_transfer", duringTransfer: true });
          else emit(room, "hangup", "The line dropped from the far end", { reason: "carrier_gone" });
        },
      }, tune);
      // THE GREETING WE ALREADY HEARD IS THEIRS. The ear is attached after the person test, which by
      // then has heard the whole hello and the pause after it — so without this it is an ear that has
      // never heard anybody, and Staff who say "Fun store" and walk straight off would never be
      // recorded as away and Charlie would bill through it.
      // …and HOW LOUD they said it. That is the yardstick the room test measures against: a handset
      // put down on the counter is still sound, just far quieter than somebody speaking into it. The
      // frames we just judged are the only recording we have of this person talking to us.
      const heard = [...storeLoud].sort((a, b) => a - b);
      convEar.heardAlready(storeTalkMs, heard.length ? heard[Math.floor(heard.length / 2)] : 0);
    }
    else emit(room, "unknown", `Charlie was let on without hearing Staff (${reason})`, { reason });
    log(`connect-on-human: connecting (${reason}) after ${Math.round((humanAtMs - startMs) / 1000)}s nav`);
    // DELTA ASKS, THE AGENT ANSWERS. Only on a real person: a clip played at a hold-timeout or a
    // recipe timer would be a question asked into a menu. Everything else about the call is
    // unchanged, and a store with no clip or no joining agent takes exactly today's path.
    const clip = reason === "human" && ctx?.openingClip && ctx?.midCallAgentId ? ctx.openingClip : null;
    if (clip) {
      // LET THEM FINISH. The ear calls a person after about half a second of voice, which lands in
      // the MIDDLE of "thank you for calling the Fun store" — so the question talked straight over
      // the greeting (owner, live Fun call 07-28: "he rushed in"). A greeting is short and ends in a
      // pause, so we wait for that pause. The watcher on the inbound frames starts the clip, and
      // warms the agent up behind it exactly as before.
      // THE PAUSE WE ALREADY HEARD COUNTS. The question waits for the end of the greeting, and the
      // person test above has just spent two and a half seconds proving that greeting ended. Starting
      // that wait again from zero buys another half second of silence on every single check, for
      // nothing — they stopped talking a while ago. Carry what we measured.
      pendingClip = clip; waitQuietMs = storeQuietMs; waitTotalMs = storeQuietMs;
      connecting = true;   // buffer from here, so nothing they say in the gap is lost
      // …and everything from BEFORE here too: their hello started before we were sure of them.
      if (preRoll.length) {
        // KEEP THE HELLO, NOT THE WAIT AFTER IT. The person test spends about two and a half seconds
        // of silence making sure somebody is there, and every one of those frames would otherwise be
        // handed to Charlie ahead of the real audio and paced out at speaking speed — two and a half
        // seconds of nothing, in front of everything he is waiting to hear. The pause at the end of
        // their sentence still goes: that is what tells the transcriber the greeting finished.
        let keep = preRoll.length;
        const tail = Math.max(1, Math.round(GREETING_END_MS / FRAME_MS));
        while (keep > 0 && frameEnergy(preRoll[keep - 1]) <= VOICE_THRESH) keep--;
        keep = Math.min(preRoll.length, keep + tail);
        const held = preRoll.slice(0, keep);
        pending.unshift(...held);
        log(`delta: keeping the ${held.length} frame(s) of hello we heard before we were sure (${preRoll.length - held.length} of our own waiting dropped)`);
        preRoll.length = 0;
      }
      // HIS EARS OPEN NOW, NOT TWO SECONDS BEFORE THE QUESTION ENDS (owner's checks, 08-01).
      //
      // He used to be warmed up late and handed the whole greeting in one go when the question
      // finished: three and a bit seconds of somebody talking, delivered in a few thousandths of a
      // second. The words come back wrong and two turns come back as one line, and no amount of
      // silence inserted into that burst fixes either, because the transcriber decides where a
      // sentence ends by hearing a REAL pause on a REAL clock. A burst has no pauses in it at all.
      // Proven on his check 229: 157 frames handed over at once, and "Thank you for calling the Fun
      // store, this is Bob" plus his answer came back as ONE line reading "Thank you for calling the
      // front door. This is Bob. I do not."
      //
      // So nothing is held that does not have to be. His session opens the moment a person is there
      // and the line flows to him live from then on, at the speed it was spoken. His MOUTH is still
      // shut until the question finishes — that gate is separate and unchanged, and it is the only
      // thing the question ever needed. He bills a few seconds earlier per check; a check whose
      // words are wrong is worth nothing at all.
      // SHUT HIS MOUTH BEFORE HIS SESSION EXISTS. This gate is also what picks the agent that joins a
      // conversation already in progress — the one with no greeting, told to wait for the answer.
      // Opening him before it was shut would open the ORDINARY agent, who greets the store, straight
      // over the top of our recorded question. It is closed here, the moment we commit to asking.
      holdHimForTheirAnswer();
      clipText = clip.text;
      log("delta: person heard, opening his ears now and waiting for them to finish before asking");
      void connectEleven();
    } else {
      // NO RECORDING, SO CHARLIE ASKS IT HIMSELF, NOW (round 1, item 1.4). We know the instant it is
      // not there — it is either on the check or it is not — so there is nothing to wait for and
      // nothing to fall back through. He opens on the same person test, with his own opening line,
      // and the ONE thing that must never happen is a person saying hello into silence while our
      // side works out that a file is missing.
      //
      // It costs a few cents more than asking from a recording and the check still happens, which is
      // the right trade every time. But it has to be VISIBLE, because "how often did that happen"
      // is otherwise unanswerable, and it is the fail side of a row on the owner's card.
      const shouldHaveBeenRecorded = reason === "human" && !!ctx?.midCallAgentId && !!ctx?.dynamicVars?.opening_line;
      if (shouldHaveBeenRecorded) {
        emit(room, "unknown", "The recording did not play, so Charlie asked the question himself",
          { step: "question_live", why: ctx?.openingClip ? "the line was not ready to carry it" : "no recording was made before we dialled" });
      }
      connectEleven();
    }
    // Give-up cap: the agent is now billing. If no real human words land within giveUpSeconds,
    // nobody is coming to the phone — end the call instead of paying to listen to it ring.
    const gu = ctx?.giveUpSeconds;
    if (gu && gu > 0 && !giveUpTimer) {
      giveUpTimer = setTimeout(() => {
        if (humanWords) return;
        noteWeEnded(room, "no_words");   // WE ended it (item 5)
        emit(room, "hangup", `Nobody spoke in the ${gu}s after Charlie joined, hung up`, { reason: "no_words", afterSecs: gu });
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
      quietRun = 0;
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
              // …AND THE CLOCK STARTS HERE, not a counter. Cleared the moment a person is found or
              // the check ends; if it runs out, nobody is at that department and we stop paying for
              // a phone to ring in an empty room.
              ringWaitTimer = setTimeout(() => {
                ringWaitTimer = null;
                if (ended || connecting || humanWords) return;
                const secs = Math.round(RING_WAIT_MS / 1000);
                noteWeEnded(room, "nobody_came");   // WE ended it (round 2, item 5)
                emit(room, "hangup", `Nobody picked up after ${secs} seconds of ringing, hung up before Charlie ever billed`, { reason: "nobody_came", ringingSec: secs });
                log(`give-up: ${secs}s of ringing with nobody answering — hanging up (Charlie never joined)`);
                try { twilio.close(); } catch { /* best effort */ }
              }, RING_WAIT_MS);
              emit(room, "ringing", transferNote, { leg: "desk", department: department || null });
              log(`ear: the department's phone is ringing — Charlie stays off until somebody picks up`);
              try { onStage?.(room, 6, Math.max(0, Math.round((firstRingAtMs - startMs) / 1000))); } catch { /* best-effort */ }
            }
          }
          if (!toneLogged) { toneLogged = true; log(`ear: steady tone (ringback/hold), NOT a human — staying deaf, Charlie not billed`); }
          // A RINGING LINE IS NOT A GREETING, AND THE GAPS BETWEEN RINGS ARE NOT SOMEBODY WAITING
          // FOR US. It takes about a second of a burst before there are enough samples to call it a
          // tone, so the front of every ring lands in the speech branch below — and the four second
          // gaps then add up. Six rings' worth of them cleared the person test on a desk nobody ever
          // answered, and Charlie opened onto it. Both are wiped the moment the network's own tone
          // is positively identified: whatever we thought we were hearing, it was the phone.
          storeSpeaking = false; storeTalkMs = 0; storeQuietMs = 0;
        } else {
          // A REAL VOICE IS ON THE LINE — modulated speech, not the network. That is no longer enough
          // to open Charlie on its own: it is the same thing a recording sounds like. All it does is
          // start the clock on how long they have been talking; the person test below decides.
          if (!storeSpeaking) { storeSpeaking = true; storeTalkMs += need * FRAME_MS; storeLoud.push(...loudE); }
          else storeTalkMs += FRAME_MS;
          storeQuietMs = 0;
          storeLoud.push(e);
          if (storeLoud.length > 400) storeLoud.shift();
        }
      }
    } else {
      // THEY STOPPED. A person stops for you; a recording does not. Once the pause is long enough to
      // be a real one, and what came before it was short enough to be a greeting rather than a read,
      // somebody is there and Charlie may open.
      if (storeSpeaking && !connecting) {
        storeQuietMs += FRAME_MS;
        if (looksLikeAPerson({ stepsFired: 0, promptCount: 1, lastPromptMs: storeTalkMs, quietMs: storeQuietMs }, tune)) {
          log(`ear: person test passed — ${Math.round(storeTalkMs)}ms of talking then ${Math.round(storeQuietMs)}ms of quiet`);
          triggerConnect("human");
        }
      }
      // Gap between bursts: a burst that just ended is one completed ring.
      // ONE RING PER LINE IS DELETED (round 1, item 1.8), and so is counting them at all (owner
      // 08-03). Neither the line nor the count told him anything: Charlie is off while a phone rings,
      // and how many times it rang is not how long we waited. The clock armed above owns the ending.
      if (inRing) inRing = false;
      voiced = Math.max(0, voiced - leak); if (voiced === 0) { loudE.length = 0; loudT.length = 0; }
      // EVERY BURST IS JUDGED ON ITSELF. Ringing and a voice are told apart from the last few
      // seconds of loud audio, and that window used to survive a whole ring cadence: after a real
      // two second ring it took about six seconds of silence to clear, so the person who picked up
      // in the four second gap was judged against a window that was still mostly ringing, and read
      // as more ringing. A department that rings and is then answered is the ordinary shape of a
      // hand-over, so half a second of quiet now ends the burst and the next one starts clean.
      if (++quietRun >= BURST_END_FRAMES && loudE.length) { loudE.length = 0; loudT.length = 0; voiced = 0; }
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
      if (!room && m.start?.customParameters?.room) { room = m.start.customParameters.room; hangSignoffDoor(); } // Twilio puts <Parameter> here; the check has its name NOW, so its door hangs now
      if (!ctx && room) ctx = contexts.get(room);
      if (ctx?.dtmf) scheduleDtmf(ctx.dtmf);
      if (ctx?.connectOnHuman) {
        if (ctx.connectAtSec && ctx.connectAtSec > 0) {
          // Deterministic: open the agent at the learned time-to-human. No VAD guesswork.
          // THE EAR IS NOT OPTIONAL, AND IT NEVER DEPENDED ON BAIL (owner 07-28). This condition used
          // to require giveUpSeconds, which is only set when bail is switched ON in Admin. So turning
          // bail off silently dropped every call back to the `else` below: the agent opening on a
          // STOPWATCH, straight into a ringing desk or a transfer message. That is the exact behaviour
          // two days were spent killing, reachable by an operator toggling an unrelated switch.
          // The two are now separate concerns, as they always should have been:
          //   the EAR decides WHEN the agent may open (always, on a real voice, never on a clock)
          //   BAIL decides WHETHER we hang up on a call nobody answers (a cap, and optional)
          if (ctx.earFromSec && ctx.earFromSec > 0) {
            // SMART JOIN (owner design, restored 07-24): deaf while the recipe walks the menu — the
            // ear can never hear a recorded menu voice (the 07-20 mistake was listening DURING the
            // menu). The ear opens right after the last press/word; Charlie joins only on a real
            // voice. Nobody ever answers → Charlie never joins; the call ends at ear+ringMaxSeconds
            // for a phone-line-only cost. The learned time (connectAtSec) stays on the recipe as
            // its record; it no longer blind-joins when the smart path is armed.
            const earAt = ctx.earFromSec, quit = ctx.giveUpSeconds || 0;
            // The give-up clock starts at the LEARNED arrival time, not at menu-end: on chains with a
            // transfer hold (CVS: menu done 48s, human ~67s) quitting at menu-end+20s would hang up
            // right as staff normally pick up.
            const quitAt = Math.max(earAt, ctx.connectAtSec || 0) + quit;
            log(`twilio start room=${room.slice(0, 8)} -> connect-on-human EAR: deaf through the menu until ${earAt}s, join on a real voice${quit > 0 ? `, give up at ${quitAt}s if nobody comes` : " (no give-up cap: bail is off)"}`);
            dtmfTimers.push(setTimeout(() => { earArmed = true; emit(room, "ivr_detected", "Menu finished, now listening for a real person", { earOpenedAtSec: earAt }); }, earAt * 1000));
            // The give-up cap is bail's job and only exists when bail is on. Without it the call still
            // ends on the carrier's own time limit; the agent simply never opens without a real voice.
            if (quit > 0) dtmfTimers.push(setTimeout(() => {
              if (connecting || humanWords) return;
              noteWeEnded(room, "nobody_came");   // WE ended it (item 5)
              emit(room, "hangup", "Nobody ever came to the phone, hung up before Charlie billed a second", { reason: "nobody_came" });
              log(`give-up: no voice by ${quitAt}s — nobody is coming, hanging up (Charlie never joined)`);
              try { if (eleven) eleven.close(); } catch { /* best effort */ }
              try { twilio.close(); } catch { /* best effort */ }
            }, quitAt * 1000));
          } else {
            log(`twilio start room=${room.slice(0, 8)} -> connect-on-human TIMER: connect at ${ctx.connectAtSec}s`);
            dtmfTimers.push(setTimeout(() => triggerConnect("recipe-timer"), ctx.connectAtSec * 1000));
          }
        } else {
          // NOTHING BUT A REAL PERSON OPENS CHARLIE (owner's check log, 08-01: "Charlie was let on
          // without hearing Staff (hold-timeout)" at 63 seconds, with nobody having spoken).
          //
          // A stopwatch used to sit here: if no voice had been heard by "Hold max seconds", it opened
          // Charlie anyway. The name made it sound like a give-up. It was the opposite — it switched
          // the expensive agent ON to talk to hold music, at 11p a minute, on a check where the whole
          // point of waiting was that we were paying nothing. It is deleted, not shortened: there is
          // no number of seconds at which talking to nobody becomes a good idea.
          //
          // What ends a check nobody ever answers is a give-up, and that is a separate job with its
          // own rules (the hold cap). Until it lands, such a check ends on the carrier's own time
          // limit having spent phone line only, which is pennies against what this used to cost.
          log(`twilio start room=${room.slice(0, 8)} -> connect-on-human (listening; Charlie opens on a real voice and nothing else)`);
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
      // THEY ARE ANSWERING: his mouth opens on their voice, not on a clock (the second gate). While
      // our own question is still playing only a real barge-in counts, because the line is carrying
      // us; after it, ordinary speaking energy does. A ring burst is not somebody answering. The
      // count leaks rather than resets so the gaps between their words do not undo it.
      if (!charlieMaySpeak) {
        const e2 = frameEnergy(b64);
        const theirVoice = Date.now() < agentPlayingUntil ? e2 >= BARGE_THRESH : e2 > VOICE_THRESH;
        if (theirVoice && toneShare(b64) < 0.45) {
          if (++answerVoiceFrames >= ANSWER_VOICE_FRAMES) letHimAnswer("Staff started answering");
        } else if (answerVoiceFrames > 0) answerVoiceFrames--;
      }
      // Waiting for the greeting to end so the question does not talk over it.
      if (pendingClip) {
        waitTotalMs += 20;
        waitQuietMs = frameEnergy(b64) > VOICE_THRESH ? 0 : waitQuietMs + 20;
        if (waitQuietMs >= GREETING_END_MS || waitTotalMs >= GREETING_MAX_WAIT_MS) {
          const c = pendingClip; pendingClip = null;
          log(`delta: they finished after ${waitTotalMs}ms, asking now`);
          if (startOpeningClip(c)) {
            const lead = Math.max(0, c.ms - PREWARM_LEAD_MS);
            // HE STARTS CONNECTING HERE, and he bills from the second he connects — which is why he
            // starts two seconds before the question ends and not at the top of it. Nothing recorded
            // the moment, so nobody could see whether he was ready in time (round 1, item 1.3).
            const warmUp = () => {
              emit(room, "unknown", "Charlie warmed up", { step: "prewarm", leadMs: PREWARM_LEAD_MS, clipMs: c.ms, beforeQuestionEndsMs: Math.max(0, c.ms - lead) });
              void connectEleven();
            };
            if (lead > 0) prewarmTimer = setTimeout(() => { prewarmTimer = null; if (!ended && twilio.readyState === 1) warmUp(); }, lead);
            else warmUp();
          } else {
            // The recording exists but the line would not carry it. Same answer: he asks it himself,
            // straight away, and the record says the recording did not play (round 1, item 1.4).
            emit(room, "unknown", "The recording did not play, so Charlie asked the question himself",
              { step: "question_live", why: "the line was not ready to carry it" });
            void connectEleven();
          }
        }
      }
      const echoWindow = Date.now() < agentPlayingUntil + ECHO_TAIL_MS;
      const suppress = echoWindow && frameEnergy(b64) < BARGE_THRESH;
      if (suppress) { if (++echoDropped % 200 === 1) log(`echo gate: suppressing agent playback echo (dropped=${echoDropped})`); }
      // A clerk who starts answering before we have finished asking is the normal case, not an edge
      // case. Their words go into the SAME buffer the bridge has always used while the agent
      // connects, and are released to him whole the moment the gate opens.
      // Nobody is on the line, so the agent hears nothing. Hold music and an empty room are not a
      // conversation, and feeding him thirty seconds of them is how he ends up talking to himself.
      // The first words on the way back ARE kept, so an answer shouted from the stockroom is not lost.
      // …and the same rule for the words on the way back from a wait: contiguous once a voice
      // starts, because keeping only the loud frames squeezes the sentence and it comes back as
      // different words. A rolling window, so the newest speech is always the part we keep.
      else if (onHold) {
        if (heldWords.length || frameEnergy(b64) > VOICE_THRESH) { heldWords.push(b64); if (heldWords.length > 250) heldWords.shift(); }
      }
      // HIS EARS ARE NOT HIS MOUTH. This used to require the question to have finished before a
      // single frame reached him, which is what forced everything said during it into a buffer and
      // then out as one burst. The question only ever needed him not to TALK, and his voice is
      // suppressed separately (see the audio handler). While a held handover is still being paced
      // out, live frames queue behind it so nothing arrives out of order.
      else if (eleven && ready) { if (handoverTimer) pending.push(b64); else eleven.send(JSON.stringify({ user_audio_chunk: b64 })); }
      // Buffer what the CLERK says — never our own voice coming back off the line. A PSTN line
      // reflects our audio, and loud enough reflections clear the barge threshold, so anything
      // arriving while our own clip is still playing goes into the buffer and is then handed to the
      // agent AS THE CLERK. That is how a silent store produced "…calling the bundle" and how the
      // agent then wrapped up a call nobody had answered (owner, live Fun call 07-28). While our own
      // audio is on the line there is nothing worth keeping.
      else if (connecting) { if (Date.now() >= agentPlayingUntil + ECHO_TAIL_MS) pending.push(b64); }
      else if (earArmed || (ctx?.connectOnHuman && !ctx.connectAtSec && !ctx.hadDtmf && !ctx.hadSay)) {
        // Keep the last few seconds of the line while the ear makes up its mind. Rolling, capped, and
        // dropped the moment it is handed on or the call ends — no store audio ever outlives the call
        // (hard rule 3). Steady tones are ringback, not a person, and never worth keeping.
        // KEEP THE SENTENCE, NOT JUST THE LOUD BITS OF IT. This used to keep ONLY frames above the
        // voice threshold, which deletes every small pause INSIDE the greeting — the breath between
        // "thank you for calling" and "the Fun store", the gap before a name. Handed over, the
        // sentence is played back with those gaps missing, so it is squeezed and slurred and comes
        // back transcribed as different words: "thank you for calling the Fun store" was written
        // down as "do you recall Fun Store" (owner screenshot, 08-01). A real person's speech IS the
        // gaps as much as the sound. So the moment a voice starts we keep the line CONTIGUOUSLY,
        // exactly as it arrived, and only the newest few seconds are held (still capped, still
        // dropped the instant it is handed on — no store audio outlives the check).
        if (PREROLL_MAX > 0) {
          if (!preRoll.length) {
            // Start on a real voice, never on ringback or an empty line, so the window holds the
            // greeting rather than the silence in front of it.
            if (frameEnergy(b64) > VOICE_THRESH && toneShare(b64) < 0.45) {
              greetingStartedMs = Math.max(0, Date.now() - startMs);
              preRoll.push(b64);
            }
          } else {
            preRoll.push(b64);
            if (preRoll.length > PREROLL_MAX) preRoll.shift();
          }
        }
        maybeDetectHuman(b64);
      } // The ear runs in exactly two states: (1) bare direct dials — no nav plan at all (Mapper's 770ffa0 boolean, owner-ordered 07-21: never DURING a menu, where it trips on the recorded greeting — B&N 3:42p); (2) earArmed — the smart join, where the recipe has FINISHED the menu and the ear opens for the real human voice (owner design, restored 07-24). State (1) MUST read hadDtmf/hadSay, NOT ctx.dtmf/ctx.say: those are consumed at TwiML build (takeBridgeDtmf/Say), so by media time they are ALWAYS empty and the ear armed on every timerless keypad/voice chain — the agent opened into the recording and billed through the tree (owner 07-22).
    } else if (m.event === "mark") {
      // SIGNAL 1, the accurate one: the carrier finished playing everything queued before this mark,
      // so Delta's question has actually reached the clerk's ear. New code, and deliberately not the
      // only way we can learn this — see startOpeningClip.
      if (m.mark?.name === CLIP_MARK) openCharlieGate("the carrier confirmed the clip played");
    } else if (m.event === "stop") {
      // …UNLESS IT IS OUR OWN COST CUTOFF. We hand the carrier a time limit on every check, and when
      // it expires the carrier ends the check and reports it exactly as it reports a store hanging
      // up. Blaming the store for our own cap would put a wrong line on his card, so the cap is
      // recognised here first, by its own number, before anything is decided (PM audit, 08-02).
      const capSec = ctx?.timeLimitSec ?? 0;
      const ranSec = elapsedSec();
      if (capSec > 0 && ranSec > 0 && ranSec >= capSec - CAP_SLACK_SEC) {
        noteWeEnded(room, "time_cap");
        emit(room, "hangup", "The check hit our own time limit, so we ended it", { reason: "time_cap", capSec, ranSec });
        log(`twilio stop at ${ranSec}s with a ${capSec}s limit — that is OUR cap, not the store`);
      }
      // THE FAR END WENT AWAY. Twilio sends this when the store hangs up, and it arrives BEFORE our
      // own socket closes — so for a moment the leg still reads as open while Charlie's session is
      // torn down behind it, and "did we end this?" would answer yes about a check the store ended.
      // Marked first, so every later question gets the truthful answer (round 2, item 5).
      farEndGone = true;
      log("twilio stop"); signalEnd(); if (eleven) eleven.close();
    }
  });
  twilio.on("close", () => {
    // WHICH LANGUAGE HE SPOKE, once, at the end, when there is a whole check to judge (round 1, item
    // 1.3). Said line by line it would be noise; said once it is the row the owner grades. Only when
    // he actually said something — a check where he never spoke has no language to report.
    // Only when Spanish was actually spoken. English is what nearly every check is, and a line
    // saying so on every one of them is noise; more to the point, the judge answers "I cannot tell"
    // on plenty of ordinary English sentences, so a line claiming English would sometimes be a
    // guess. Spanish it can see, and Spanish is the row the owner grades.
    if (spokeEs > 0) {
      const note = spokeEn === 0 ? "Charlie spoke Spanish throughout" : "Charlie spoke Spanish and English on the same check";
      emit(room, "unknown", note, { step: "language", spanishLines: spokeEs, englishLines: spokeEn });
    }
    signoffDoors.delete(room);
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; } if (heldQuestion) { try { relayLine?.(room, "Agent", heldQuestion); } catch { /* best effort */ } heldQuestion = null; } try { convEar?.lineGone(); } catch { /* recording is best-effort */ } preRoll.length = 0; pending.length = 0; /* hard rule 3: no store audio outlives the call */ activeCalls = Math.max(0, activeCalls - 1); log(`twilio close (frames in=${frames})`); signalEnd(); dtmfTimers.forEach(clearTimeout); clipTimers.forEach(clearTimeout); if (prewarmTimer) { clearTimeout(prewarmTimer); prewarmTimer = null; } if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; } if (ringWaitTimer) { clearTimeout(ringWaitTimer); ringWaitTimer = null; } if (handoverTimer) { clearTimeout(handoverTimer); handoverTimer = null; } if (answerWaitTimer) { clearTimeout(answerWaitTimer); answerWaitTimer = null; } if (eleven) eleven.close(); /* the context is NOT deleted here: Twilio can reconnect a blipped stream mid-call, and the fresh socket must still find it. The 30-minute leak guard owns cleanup. */ });
}

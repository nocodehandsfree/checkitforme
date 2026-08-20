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
import { emit, amend, markNow, addMs, linkProviderCall, openSegment, closeSegment, startMeter, recordLine, stampLineEnd, lastLineEndEpoch, normSaid, getReceipt, whereItWouldDraw } from "../calls/events";
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
import { heardWrongDepartment, isPrivateNote, askedToBePutThrough, saysNobodyToTransfer, saidGoingToCheck, looksLikeAMenu, staffName, wrappedUp, usedTheirName } from "./prompts";
import { isSomebodyTalkingToUs } from "./verdict";
import { guessLanguage } from "../calls/mapgraph";
// WHAT LANGUAGE THE PERSON WHO PICKED UP IS SPEAKING, off the words of their first line. A separate
// judge from `guessLanguage` on purpose: that one reads a MENU and its markers are menu words, so it
// answers "unknown" on a human greeting, which is the one line this decision hangs on.
import { staffSpokeSpanish } from "../calls/staff-language";
// Echo's words: the store's own voice turned into sentences, whether Charlie is on the line or not.
// Echo's words arrive from the PICKUP FORK (server.ts, /twilio-media), which starts the moment the
// store answers and carries the whole call. This file never opens a transcriber of its own: two
// sockets on one call would transcribe it twice and bill it twice (owner 08-07).

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
  // STAFF ARE ALREADY ON THE LINE AND HAVE NOT BEEN ASKED YET. Set only by a mapping check, which
  // finds the person itself and then hands the live call over, so the moment Staff answered is
  // already behind us when this bridge starts. It is what tells this side to run everything a
  // check does at that moment (Delta asks, the moment is stamped, the hold meter starts, the
  // give-up cap is armed) instead of just opening Charlie cold.
  //
  // It is NOT the same as Charlie taking over a call mid conversation, which is what the Delta
  // barge does: there Delta has already asked, Staff have already answered it, and treating that
  // as "Staff just answered" would write a note saying Delta never played on a check where it did.
  staffAlreadyOn?: boolean;
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
  /** THE SAME QUESTION IN SPANISH, recorded before the dial beside the English one (owner 08-07).
   *  Which of the two actually plays is decided at the moment we ask, off the WORDS of the store's
   *  own first line. Absent on a check that could not record one, and then the English one asks. */
  openingClipEs?: { audio: Buffer; ms: number; text: string };
  /** THE HOLD REPLY AS A RECORDING (owner box 08-16 late, off check 371). Staff announce a hold and
   *  the acknowledgment plays from OUR system at once, in Charlie's own voice, the way Delta's
   *  question does — no waiting on the outside voice service to think one up. Both languages ride,
   *  picked at play time the same way the opening clip is. */
  holdAckClip?: { audio: Buffer; ms: number; text: string };
  holdAckClipEs?: { audio: Buffer; ms: number; text: string };
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
const signoffDoors = new Map<string, (answer: string, held?: { set?: string | null; productForm?: string | null; restockDay?: string | null; restockTime?: string | null }) => void>();

// ── ECHO'S WORDS, ARRIVING FROM THE PICKUP FORK (owner 08-07) ────────────────────────────────────
// The transcriber lives on the fork (server.ts, /twilio-media), which starts the moment the store
// picks up and carries the whole call, menu and all. It is the ONLY one: wiring a second socket to
// the bridge's own stream would transcribe the same call twice and bill it twice. These two doors
// are how the fork reaches the check that owns the room.

/** Rooms where the transcriber is listening right now. While it is, the agent's own copy of the
 *  store's words is not written down or shown: it would be the same sentence twice. */
const echoRooms = new Set<string>();
export function echoListening(room: string, on: boolean): void {
  if (!room) return;
  if (on) echoRooms.add(room); else echoRooms.delete(room);
}
/** Is Echo writing the words for this check? */
export function echoHasTheWords(room: string): boolean { return echoRooms.has(room); }

/** Each live check's own way of taking a Staff line: record it, show it, remember it if Charlie was
 *  closed for it. Hung when the bridge socket opens, dropped when it closes. */
const staffDoors = new Map<string, (text: string, atEpochMs?: number, fromEcho?: boolean, endedAtEpochMs?: number) => void>();
/**
 * A finished sentence Echo heard on the phone line. Returns whether the check itself took it, which
 * is false before the bridge socket exists (the menu, and the store's very first words). The receipt
 * opens at DIAL, so a line heard that early still goes onto the record here; only the customer's
 * live screen needs the caller to show it.
 */
export function echoHeardStaff(room: string, text: string, atEpochMs?: number, endedAtEpochMs?: number): boolean {
  try {
    const door = staffDoors.get(room);
    if (door) { door(text, atEpochMs, true, endedAtEpochMs); return true; }
    recordLine(room, "Clerk", text, atEpochMs, undefined, undefined, endedAtEpochMs);
    return false;
  } catch (e) { log(`echo line dropped: ${String(e).slice(0, 90)}`); return false; }
}
/** Each live check's way of taking a final PIECE of the turn still being written (owner task 08-15:
 *  the reconnect words). Pieces are never recorded — the joined line that follows is the record —
 *  and a check with no door, or no reconnect underway, drops them silently. */
const pieceDoors = new Map<string, (text: string) => void>();
/** A final, confirmed piece Echo heard, landed before its turn has been joined into one line. */
export function echoHeardPiece(room: string, text: string): void {
  try { pieceDoors.get(room)?.(text); } catch (e) { log(`echo piece dropped: ${String(e).slice(0, 90)}`); }
}
/** The check on this room has its answer. Tell Charlie to wrap up and end. Safe to call late, twice,
 *  or for a room that never had a Charlie: a missing door is a no-op, never an error. */
export function nudgeSignoff(room: string, answer: string, held?: { set?: string | null; productForm?: string | null; restockDay?: string | null; restockTime?: string | null }): void {
  try {
    const door = signoffDoors.get(room);
    if (!door) { log(`signoff: the answer is in hand for ${room.slice(0, 8)} (${answer}) but no check holds that name`); return; }
    door(answer, held);
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
  // A COPY, never the shared defaults object: the carrier's socket connects BARE and the room only
  // arrives in its start message, so this lookup finds nothing on a real check and `adoptTuning`
  // below overlays the check's own numbers IN PLACE the moment the room is known (check 364).
  const tune: CallTuning = { ...(contexts.get(room)?.tuning ?? TUNING_DEFAULTS) };
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
  // A sentence reaches us as words within seconds of being said, even across a hand-over: 6.1s was
  // the worst measured on the robot store (check 346, both lines after a hold). Past this, the start
  // waiting in the queue belongs to something nobody wrote down, so it is dropped.
  const VOICE_START_STALE_MS = 20_000;
  // The gap that ends a stretch of talking. Shorter than the pauses inside a sentence, so one
  // sentence is one start, and long enough that two sentences do not fuse into one.
  const VOICE_GAP_FRAMES = 40; // 40 x 20ms = 0.8s of quiet
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
  let GREETING_END_MS!: number;        // every number derived from `tune` is set in adoptTuning below
  /** …and if they simply never stop, ask anyway rather than listen forever. */
  let GREETING_MAX_WAIT_MS!: number;
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
  /** The transcribed hello, held until a session is READY to be told. The words come back from the
   *  transcriber on their own clock, and a line emitted before the session opens is simply lost —
   *  with it the greeting on the customer's page, Staff's name, and the voicemail net's one look at
   *  the store's first words. Delivered in the metadata handler, ahead of everything else. */
  let helloLineWaiting: { text: string } | null = null;
  /** The clip committed before Echo's writing of the hello landed (check 370): the first written
   *  line to arrive may be the hello, and `staffSaid` finishes the hand-over then. Only a line
   *  SPOKEN before the commit qualifies — the greeting always is, because the commit waits for it
   *  to end; a first line spoken after the commit is conversation, never the hello. */
  let wantHelloFromEcho = false;
  let clipCommittedAtMs = 0;
  /** Running while held audio is being paced out. Live frames queue behind it so nothing overtakes. */
  let handoverTimer: NodeJS.Timeout | null = null;
  /** Our question, kept off the live view until the store's hello can be shown above it. */
  let heldQuestion: string | null = null;
  let questionTimer: NodeJS.Timeout | null = null;
  /** …and how long we will wait for that hello before showing the question anyway. A store that says
   *  nothing at all must never leave a customer staring at an empty conversation. */
  const QUESTION_HOLD_MS = 8000;
  let PREROLL_MAX!: number;
  /** When their hello actually started. Their words only exist once the agent has transcribed the
   *  audio we held, which is after our question played — so stamped on arrival, the greeting lands
   *  UNDER the question it came before. This is the time it belongs at, spent on the first line back. */
  /** THE MOMENT ITSELF, ON THE WALL CLOCK (owner 08-06). This was an offset from `startMs`, which is
   *  when the AUDIO opened, and the record counts from when the CHECK opened, about two seconds
   *  earlier: every greeting went onto the record two seconds early and the sheet drew Staff
   *  speaking above the row saying the line was answered. The record owns its own zero, so it is
   *  handed the moment and does the subtraction itself (`recordLine` in src/calls/events.ts). */
  let greetingStartedAtEpochMs = 0;
  /** WHEN EACH STRETCH OF THEIR TALKING STARTED, on the wall clock, oldest first (owner 08-06: "we
   *  need accurate timing so that every step shows the correct time it is truly triggered on").
   *  A written line is stamped when its WORDS ARRIVE, which is after the sentence was spoken and
   *  transcribed: measured against the robot store on check 346, an ordinary line landed 3.3s late
   *  and the two lines after a hold landed 6.1s late, because their audio waits for Charlie to be
   *  back before anybody transcribes it. Their voice is already measured on every frame for the
   *  meter and the ear, so the moment it starts is free to keep, and the line is filed at the moment
   *  they opened their mouth. In order: sentences arrive in the order they were spoken, so the
   *  oldest unclaimed start belongs to the next line written down. */
  const theirVoiceStarts: number[] = [];
  let theirVoiceOn = false;
  let theirQuietFrames = 0;
  let theirVoiceRunStartedAt = 0;   // the first frame of the stretch being listened to right now
  let theirVoiceRunFrames = 0;      // how long it has lasted, in frames, so a blip is not a sentence
  /** The oldest start that could still belong to a line arriving now. Anything older than this is a
   *  sentence nobody ever wrote down (after a hold, whole sentences are lost) and is dropped rather
   *  than pinned onto the next line, which would file it far too early. */
  const takeVoiceStart = (): number | undefined => {
    const now = Date.now();
    while (theirVoiceStarts.length && now - theirVoiceStarts[0] > VOICE_START_STALE_MS) theirVoiceStarts.shift();
    return theirVoiceStarts.shift();
  };
  /** A start that has already been spent belongs to nobody else. The greeting is caught twice, once
   *  on the way in and once by the frames above, and leaving the second copy in the queue would file
   *  the NEXT thing Staff said at the moment they said hello. */
  const dropVoiceStartsUpTo = (t: number) => { while (theirVoiceStarts.length && theirVoiceStarts[0] <= t) theirVoiceStarts.shift(); };
  let waitTotalMs = 0;
  /** A breath after the clip so the agent can never clip its own tail. */
  let CLIP_SETTLE_MS!: number;
  /** If every signal fails, open him anyway this long after the clip should have ended. A slightly
   *  early agent is recoverable; a live clerk saying hello into silence is not. */
  let CLIP_BACKSTOP_MS!: number;
  /** How early to start connecting him, measured back from the END of the clip.
   *
   *  He bills from the second his session opens, talking or not, so every moment he spends warming
   *  up behind a clip is dead air we chose to buy. A real opening question measured 5.1 seconds, so
   *  starting him with it would buy five of them on every call. Opening a session takes well under a
   *  second; two is generous cover and keeps the rest.
   *
   *  Being late is safe by construction: the gate opens on its own signals whatever he is doing, and
   *  whatever the clerk said meanwhile is already buffered and released the moment he reports ready. */
  let PREWARM_LEAD_MS!: number;
  /** How long Charlie may actually be TALKING before he starts wrapping up. The owner's number, 45
   *  seconds, tuned from Admin against real checks: his own arithmetic says 23 holds 67% profit and
   *  45 does not, so 45 buys a longer conversation at a thinner margin on purpose. */
  let WRAP_UP_MS!: number;
  /** How long a wait may run before we hang up. The owner's number, two minutes, tunable from Admin.
   *  Waiting is nearly free because Charlie is dropped, and a second check costs more than waiting,
   *  so it is deliberately generous. */
  let HOLD_CAP_MS!: number;
  /** How long the phone may ring while we wait for a human. The owner's number, 90 seconds, tunable
   *  from Admin. Never a count of rings (his ruling 08-03). */
  let RING_WAIT_MS!: number;
  // ---- hold and transfer ----
  /** When THIS session came up. A session closed seconds after it opened never got a word in, and
   *  the seconds it did burn bought nothing (owner, check 357). */
  let charlieOpenedAtMs = 0;
  /** HE IS NEVER DROPPED BEFORE HE HAS HAD A CHANCE TO SPEAK (owner 08-07, off check 357). Cutting
   *  the quiet to 3 seconds made a session open at 16 seconds and close at 18, and Charlie said
   *  nothing on that whole check: reopening takes about a second and answering takes a beat more,
   *  so the window was gone before he could use it. The wait still STARTS on the record at the
   *  second they really went quiet; only the closing of his session waits out the remainder, so the
   *  saving on a real walk away is untouched and a pause mid conversation no longer gags him. */
  let MIN_ON_LINE_MS!: number;
  let closeWhenReady: NodeJS.Timeout | null = null;
  /**
   * A CLOCK COULD NEVER FIX THIS, AND CHECK 358 IS THE PROOF (owner 08-07). The minimum above is
   * five seconds and his session on 358 ran SEVEN, and he still said nothing: Staff answered at the
   * end of that stretch, the robot went quiet the moment it finished its line the way it always
   * does, three seconds of quiet read as Staff walking away, and he was dropped one second later,
   * mid thought. Same test, same words, and 355 and 356 passed only because he happened to start
   * talking inside those three seconds. A race is not a rule.
   *
   * So the close waits on a FACT instead: he has been handed their answer and has not yet opened
   * his mouth in THIS session, so the quiet is HIM, not them. `answeredAtMs` is the moment the gate
   * opened; `spokeThisSession` is the moment it stopped mattering. Capped, because a model that
   * never answers must not hold a line open for free.
   */
  let HIS_FIRST_WORD_MS!: number;
  /** THE ADMIN'S NUMBERS ARRIVE WITH THE ROOM, NOT WITH THE SOCKET (owner task 08-14, check 364).
   *  The carrier's socket connects BARE and the room only arrives in its start message — the 08-04
   *  goodbye bug's exact shape — so the tuning resolved at connect found no context on any real
   *  check and every number here ran on the code defaults: the Admin's "Silence before Charlie
   *  drops" 6 seconds never reached the ear, and 364 dropped Charlie 3 seconds into a 5 second
   *  quiet. Every number derived from `tune` is derived HERE, once, and re-derived from the start
   *  handler the moment the room is known (the same two moments `hangSignoffDoor` runs). The
   *  overlay is IN PLACE, so every later `tune.` read — and the ear, built at human detect, which
   *  is always after start — sees the check's own numbers. */
  function adoptTuning() {
    const own = room ? contexts.get(room)?.tuning : undefined;
    if (own) Object.assign(tune, own);
    GREETING_END_MS = tune.greetingEndMs;
    GREETING_MAX_WAIT_MS = tune.greetingMaxWaitMs;
    PREROLL_MAX = Math.max(0, Math.round(tune.greetingKeepMs / 20));
    CLIP_SETTLE_MS = tune.clipSettleMs;
    CLIP_BACKSTOP_MS = tune.clipBackstopMs;
    PREWARM_LEAD_MS = tune.prewarmLeadMs;
    WRAP_UP_MS = Math.max(1, tune.charlieWrapUpSeconds) * 1000;
    HOLD_CAP_MS = Math.max(1, tune.holdCapSeconds) * 1000;
    RING_WAIT_MS = Math.max(1, tune.ringWaitSeconds) * 1000;
    MIN_ON_LINE_MS = Math.max(0, tune.charlieMinOnLineMs);
    HIS_FIRST_WORD_MS = Math.max(0, tune.charlieThinkingMs);
  }
  adoptTuning();
  /**
   * THE CLOCK RESTARTS ON THEIR LATEST WORD, NOT THE FIRST WORD OF THE CHECK (owner 08-08, off test
   * check 360, and this is why the goodbye kept coming and going).
   *
   * This was stamped ONCE, by `letHimAnswer`, the first time Staff said anything that was not their
   * hello. Every turn after that ran with a clock that had already expired, so the protection above
   * only ever covered his FIRST answer of the whole check, and his goodbye, which is always his
   * last, had none of it at all.
   *
   * Check 360, in its own seconds: Staff said "Yeah." at 12s and this was stamped. He asked his
   * follow-up. He was dropped for the gap, reopened at 25s, and Staff gave the real answer at 26s.
   * At 27s the line went quiet, and 12s plus six was long gone, so he was owed nothing and the five
   * second floor from his session opening let him go at 30s, mid thought, without a goodbye. The
   * line then sat open until the store hung up on us at 119s, and that check cost 9.0 cents.
   *
   * Whoever spoke last is what decides whether a quiet is theirs or his, so `staffSaid` stamps this
   * on EVERY fresh line of theirs while he is allowed to speak. `spokeThisSession` still cancels it
   * the moment he opens his mouth, so a line he has already answered can never hold the meter open,
   * and the cap is unchanged: a model that never answers holds nothing for free.
   */
  let answeredAtMs = 0;
  let spokeThisSession = false;
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
  /** The FIRST thing the store said. The one line that can say what language they are speaking, and
   *  what the recorded question is chosen off (owner 08-07). Never overwritten. */
  let theirFirstLine: string | null = null;
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
  /** A reopen hands WORDS, never audio — so after one, a line spoken before the new session opened
   *  can never have reached his ears and may still need handing (owner task 08-15, check 366). The
   *  first join is different: it hands the held audio itself, so this stays false until a real
   *  words-only reopen has happened. */
  let wordsOnlyReopen = false;
  /** The moment his ears came back at that reopen: audio from here is buffered and flushed into the
   *  new session, so a line SPOKEN before this moment is the only kind whose sound never reached
   *  him. Stamped where the reopen commits, which is where the buffering resumes. */
  let hisEarsBackAtMs = 0;
  /** THE PIECES OF THE TURN STILL BEING WRITTEN (owner task 08-15). Echo's writer holds a turn's
   *  final pieces until a second of quiet says the turn ended; these are those same pieces, kept
   *  here so a reconnected Charlie can be handed them the moment the EAR hears the voice stop
   *  instead of waiting out that quiet. Cleared whenever a joined line lands, because the joined
   *  line replaces its pieces everywhere. */
  let openTurnPieces: string[] = [];
  /** ALIVE ONLY BETWEEN A WORDS-ONLY REOPEN AND ITS TURN'S JOINED LINE. `handed` is every piece
   *  already fed to his session, in order, so the joined line can be recognized as already-his and
   *  never re-handed (the mirror image of the stale hello). `voiceStopped` is the EAR's own word
   *  that their voice ended, which is what opens his turn — never the writer's one second quiet. */
  let reconnectFeed: { handed: string[]; voiceStopped: boolean } | null = null;
  /** THE WORDLESS REJOIN (owner 08-18, checks 377/380, test five). On the line, hold music can
   *  play at speech level with gaps in it — the swelling waltz measures exactly like a quiet fast
   *  talker, so no energy rule can refuse the rejoin. Echo can: it writes every word said on the
   *  line, and a "voice" that writes nothing inside REJOIN_WORDLESS_MS was the music, so Charlie
   *  drops again (the owner's sentence: he sits in music with no voice). That hold has then PROVEN
   *  it holds wordless sound, so its next comeback needs written words, or the same music rejoins
   *  him in a loop at about five metered seconds a cycle. A real comeback is untouched: its words
   *  land inside the window (the writer's worst measured first piece runs 3.2s behind the sound),
   *  and a real person behind a proven-wordless hold reopens him the moment their words land,
   *  backdated to the moment the ear heard their voice come back.
   *
   *  THE WINDOW IS THE WRITER'S OWN WORST, measured, plus a margin (check 381: at 5s the metered
   *  stretch of waltz cost the sheet's meter row its pass by 2 seconds). The bench's worst first
   *  written piece ran 3.16s behind the sound; 4s covers it. A long unbroken opening sentence that
   *  beats the window anyway is caught by the release below: the first written word ends the hold
   *  backdated, so the comeback is never lost, only heard through Echo. */
  /** HIS EARS ARE SHUT FROM THE MOMENT WE RECOGNISE A HOLD (owner's order, 08-19, off checks 398
   *  to 405). Until now a recognised hold only stopped him TALKING: every frame of the store's
   *  audio still went to his session, so the advert inside the hold music was handed to him as if
   *  Staff had spoken and he answered it, at 20-odd metered seconds a time. Now not one frame of
   *  the call reaches him while a hold is recognised. ECHO ALONE KEEPS HEARING — it is a separate
   *  listener on the pickup fork and nothing here touches it — so every word said while his ears
   *  are shut is still written down and still on the record. What is NOT handed to him is what the
   *  store's own recording said: a line the wake rule refuses was the music talking, and handing it
   *  over as words would be the very fault this exists to end, wearing a different coat.
   *
   *  0 = his ears are open. Otherwise the moment they were shut. */
  let earsShutAtMs = 0;
  /** The last moment the EAR said the sound was somebody talking to us: the sound half of the wake
   *  rule (`personSound`, listen-nav.ts — word-scale runs, real silence in the gaps, and the line
   *  clear of the music). The words half is a fresh Staff line that is not them stepping away. */
  let personSoundAtMs = 0;
  /** THIS WAIT WAS DECLARED OFF THE MUSIC REPORT, so its ENDING needs the wake rule and not the
   *  ear's ordinary comeback (owner, 08-19 evening). The ordinary comeback ends a wait on the sound
   *  of a voice, and the whole trouble with this one is that the advert IS a voice: it would end
   *  the wait the moment the advert started talking and put Charlie straight back on the meter,
   *  answering a recording, which is the fault we just spent the day ending. */
  let musicRecognisedHold = false;
  /** The moment this wait's own row was stamped, so its ending can be measured against it. */
  let holdStartedAtMs = 0;
  /** When his ears last came back. THE MUSIC'S OWN TAIL IS NOT A NEW WAIT (check 411): a store's
   *  hold music keeps playing for a second or two after somebody picks the handset back up and
   *  starts talking, and on 411 that tail declared a second wait 4.6 seconds after the first one
   *  ended — before his session had even finished reopening — so Staff's answer sat unanswered for
   *  26 seconds and the robot store asked "Hello?". Inside this grace the music report does not
   *  declare a wait. Nothing is lost if it really was the music: the wordless rejoin still drops
   *  him again when no words come, which is the rule that already exists for exactly that. */
  let earsBackAtMs = 0;
  const MUSIC_TAIL_GRACE_MS = 6000;
  /** HIS SESSION IS ALREADY OPENING WHILE WE FIND OUT WHO IT WAS (owner's ruling, 08-19 night, fix
   *  3). Opening it takes the voice provider about four and a half seconds, which sat between
   *  Staff's answer and his reply on every check since he started being dropped. So the FIRST sound
   *  of a voice coming back starts the reconnect, and nothing else does: he still cannot hear the
   *  line (his ears are shut) and cannot speak (his audio is suspended for the wait), so nothing
   *  reaches the store. The words then decide. If they prove a person, the wait ends and he is
   *  handed their turn with his session already up. If they prove the store's own recording, he is
   *  dropped again, and those seconds are counted and graded as awake on hold, which is exactly
   *  where the owner ruled the cost of guessing early should land. */
  let reconnectingEarly = false;
  let earlyReconnectTimer: NodeJS.Timeout | null = null;
  /** How long his early session may stay up before the words have proved a person. Kept under the
   *  owner's own awake-on-hold bands (green to 3, red from 6), because those seconds are graded. */
  const EARLY_RECONNECT_MS = 4000;
  /** Put the early session back down. Called when the words say the store played that at us, and by
   *  the backstop when no words prove anybody at all (check 413: the advert's own voice started the
   *  reconnect, the reader never answered, and he sat up for 22 graded seconds). */
  function dropTheEarlySession(why: string): void {
    if (earlyReconnectTimer) { clearTimeout(earlyReconnectTimer); earlyReconnectTimer = null; }
    binTheEarlyTurn(why);
    if (!reconnectingEarly) return;
    reconnectingEarly = false;
    if (ended || !onHold || !eleven) return;
    closeSegment(room);
    markNow(room, "charlieCloseMs");
    emit(room, "charlie_leave", "Charlie dropped", { reason: "music", strategy: "reopen", notASound: true, why });
    try { eleven?.close(); } catch { /* torn down */ }
    eleven = null; ready = false; connecting = false;
    log(`reconnect: ${why} — his session goes back down`);
  }
  /** THE COMEBACK OVERLAPS ITSELF (owner's order, 08-19 night). Until now the return ran in a line:
   *  Echo wrote the person's whole sentence, the wake check proved a person off it, and only then
   *  did Charlie start working out his reply — three waits end to end, 7.8 seconds on check 415.
   *  Now the three run together. Every piece Echo writes is handed to his session the moment it
   *  exists, so he is thinking from their first written word; the wake check keeps proving in
   *  parallel; and HIS SOUND IS HELD HERE, not sent, until the wake check says a person. It says
   *  recording instead and the whole thing is thrown away with his session: nothing he thought
   *  while the store's own recording talked can ever reach the line.
   *  `fed` is every piece already handed to him, `heldAudio` is the reply he is building, and
   *  `heldText` is his words, which are only written down if the sound they belong to really plays
   *  (a line the store never heard is not a line — checks 282 and 286). */
  let earlyTurn: { fed: string[]; heldAudio: string[]; heldText: string[] } | null = null;
  /** A ceiling on what may be held, so a session that generates for ever cannot grow without end.
   *  400 chunks is far past any reply he makes (about 20 seconds of speech). */
  const MOST_HELD_CHUNKS = 400;
  /** How long the sound half stays good for: a person's words reach us through Echo a moment after
   *  their voice, so the two halves are allowed to land a few seconds apart. */
  const WAKE_TOGETHER_MS = 6000;
  function shutCharliesEars(why: string, atMs?: number): void {
    if (earsShutAtMs > 0) return;
    earsShutAtMs = atMs ?? Date.now();
    personSoundAtMs = 0;
    // A SILENT SWITCH, MARKED AS ONE (owner, 08-19 evening). Nothing was said on the line at this
    // second: it is our own machinery moving, and the sheet reads it apart from the rows that are
    // sounds. Stamped at the moment the wait was recognised, never the moment the code ran.
    emit(room, "unknown", "Charlie's ears were shut for the wait, so none of the call reached him",
      { step: "ears_shut", why, notASound: true }, earsShutAtMs);
    log(`ears: shut (${why}) — Echo keeps listening, Charlie hears nothing`);
  }
  function openCharliesEars(why: string, backAtMs?: number): void {
    if (earsShutAtMs === 0) return;
    const shutMs = Math.max(0, (backAtMs ?? Date.now()) - earsShutAtMs);
    earsShutAtMs = 0;
    personSoundAtMs = 0;
    earsBackAtMs = Date.now();
    emit(room, "unknown", "A real person is talking to us again, so Charlie's ears came back on",
      { step: "ears_back", why, shutMs, notASound: true }, backAtMs);
    log(`ears: back on after ${shutMs}ms (${why})`);
    heldWords = [];   // whatever was on the line while they were shut was the music, never his to hear
    // EVERYTHING SAID WHILE THEY WERE SHUT, HANDED OVER AS THEIR TURN — the same pocket and the
    // same one door a comeback has always used, so nothing said to us is ever lost to the shutting.
    // ONLY WHEN HIS SESSION IS REALLY UP. When his ears were shut for a declared wait he is also
    // CLOSED, and the reopen has its own hand-over a moment later: draining the pocket here would
    // empty it into a session that does not exist yet and the words would reach nobody (the rig's
    // check 360 scene caught exactly that). Ears shut with his session still open is the advert's
    // own case, and that is where this hands over.
    if (eleven && ready && echoRooms.has(room) && missedWhileClosed.length) tellCharlieWhatHeMissed();
  }
  /** THE WAKE RULE, BOTH HALVES TOGETHER (owner's order, 08-19). The sound has to say somebody is
   *  talking into a line the music has left, AND Echo has to have written words that are not Staff
   *  stepping away. Sound alone is what the advert defeats — it IS a voice — and words alone is
   *  what it defeats too, because it says real sentences. Neither one on its own opens his ears. */
  /** THE WAKE RULE READS THE WORDS THEMSELVES (owner's order, 08-19 evening: "the wake rule must
   *  NOT lean on knowing our own advert recording's words, that passes the test and fails a real
   *  store. Wake Charlie only on words aimed at us, and never on bare sound.")
   *
   *  So the question is asked of the same reader that judges a finished check, about the line that
   *  just landed: is somebody talking to US, or is this something the store is playing at us? It
   *  reads meaning, so it holds on a store we have never rung and in any language, and it knows
   *  nothing about our own practice store's advert.
   *
   *  BARE SOUND NEVER WAKES HIM. On check 407 a sound alone brought him back, no words ever came,
   *  and he sat awake for 5 seconds of nothing. Only written words can wake him now.
   *
   *  IF THE READER CANNOT ANSWER (no key, too slow, refused), the sound rule stands in: word-scale
   *  speech with real silence in its gaps, on a line clear of the music. Never nothing, because a
   *  real person left unheard costs the whole check. */
  async function maybeWakeCharlie(line: string, fromAPiece = false): Promise<void> {
    if (earsShutAtMs === 0 || ended) return;
    if (saidGoingToCheck(line)) return;   // they are stepping away again, not coming back
    // A PIECE IS NOT ON THE RECORD YET (owner, 08-19 night). Echo writes the record when the whole
    // sentence is joined, and the wake check reads the record's newest Staff line — so a piece has
    // to be handed in as that newest line, or the reader would be asked about the sentence BEFORE
    // this one and answer about the wrong words entirely.
    const window = (getReceipt(room)?.transcript ?? []).slice(-4)
      .map((l) => ({ who: l.who === "Agent" ? "Agent" : "Clerk", text: l.text }));
    if (fromAPiece) window.push({ who: "Clerk", text: line });
    const read = await isSomebodyTalkingToUs(window).catch(() => null);
    if (earsShutAtMs === 0 || ended) return;   // it ended while the reader was thinking
    if (read) {
      // WHATEVER THE READER CALLED A RECORDING IN THAT WINDOW IS STRUCK, not only the newest line
      // (check 410: the reader could not answer about the advert as it played, so nothing struck
      // it, and when the real person came back the advert rode the pocket to him as Staff's own
      // words). The wake is the one moment we are certain to be asking, so it is where this lands.
      for (const p of read.played) {
        if (!playedAtUs.has(keyOf(p))) {
          playedAtUs.add(keyOf(p));
          missedWhileClosed = missedWhileClosed.filter((m) => keyOf(m) !== keyOf(p));
        }
      }
      if (!read.person) {
        // …AND IT IS NEVER HIS TO ANSWER, EITHER (owner's order, 08-19 evening; caught on check 409,
        // where the advert's own words were handed to him as "Staff's own words, answer them now"
        // when the real person came back, and he answered the jumble). A line the store played at
        // us is struck out of the pocket that feeds him what he missed. It stays on the record.
        playedAtUs.add(keyOf(line));
        missedWhileClosed = missedWhileClosed.filter((m) => keyOf(m) !== keyOf(line));
        emit(room, "unknown", "The store played that at us rather than saying it to us, so Charlie stayed off",
          { step: "not_a_person", text: String(line).slice(0, 160), why: read.why, notASound: true });
        log(`wake: the reader says that line was played at us (${read.why}) — he stays off and never hears it`);
        // …AND IF HIS SESSION WAS ALREADY OPENING ON THE SOUND, IT GOES BACK DOWN (fix 3). The
        // seconds it was up are counted and graded as awake on hold: that is the price of starting
        // early, and the owner ruled it should be visible rather than hidden.
        dropTheEarlySession("the words say the store played that at us");
        return;
      }
      if (read.announcesWait) return;   // a person, telling us they are stepping away again
    } else {
      // The reader could not answer. Fall back to the sound rule, which is measured on his own
      // recordings and refuses the advert there, rather than waking on words nobody judged.
      if (!personSoundAtMs || Date.now() - personSoundAtMs > WAKE_TOGETHER_MS) return;
      log("wake: no read came back, standing on the sound rule instead");
    }
    // A WAIT WE DECLARED OFF THE MUSIC ENDS HERE, on the same proof (owner, 08-19 evening). His
    // session is closed and his meter is off through the music; the wake rule is what brings both
    // back, so a recording talking at us can never do it. Every other kind of wait ends exactly as
    // it always has, on the ear's own comeback.
    if (onHold) {
      if (!musicRecognisedHold) return;
      const pc = pendingComeback; pendingComeback = null;
      log("the music wait ends: the sound and the words both say a person is back");
      endHold(pc?.gapMs ?? Math.max(0, Date.now() - (earsShutAtMs || Date.now())), pc?.newPerson ?? false, pc?.backAtMs);
      return;
    }
    // THE WORDS THAT WOKE HIM ARE THE ONES HE ANSWERS. A line said while his ears were shut and
    // REFUSED by this rule was the store's recording talking, and it is never handed to him: it
    // stays on the record, where Echo wrote it and where the after-call reader names it, and that
    // is the whole point of shutting his ears. Only the line that passes goes in the pocket, and
    // opening his ears hands it straight over as their turn.
    if (!alreadyHisToAnswer(line)) missedWhileClosed.push(line);
    openCharliesEars("the sound and the words both say a person");
  }
  const REJOIN_WORDLESS_MS = 4000;
  let wordlessRejoinTimer: NodeJS.Timeout | null = null;
  let heardWordsSinceEarsBack = false;
  let holdProvedWordless = false;
  let wordlessRedropAtMs = 0;
  let pendingComeback: { gapMs: number; newPerson: boolean; backAtMs?: number } | null = null;
  /** Written words landed on the line. They spend the wordless-rejoin window, and they are the one
   *  key that reopens a hold which proved it holds wordless sound. */
  function heardTheWords(): void {
    heardWordsSinceEarsBack = true;
    if (wordlessRejoinTimer) { clearTimeout(wordlessRejoinTimer); wordlessRejoinTimer = null; }
    if (onHold && holdProvedWordless) {
      holdProvedWordless = false;
      const pc = pendingComeback; pendingComeback = null;
      log("the hold's sound finally carries words: somebody is really back");
      endHold(pc?.gapMs ?? Math.max(0, Date.now() - wordlessRedropAtMs), pc?.newPerson ?? false, pc?.backAtMs);
    }
  }
  /** The ear says somebody is back. On a hold that has PROVEN it holds wordless sound, the sound
   *  alone is no longer enough: the comeback is held, its latest moment kept, and Echo's first
   *  written word releases it through `heardTheWords`. Every other hold ends exactly as it always
   *  has, on the sound of the voice. */
  function endHoldOnEvidence(gapMs: number, maybeNewPerson: boolean, backAtMs?: number): void {
    // THE ADVERT IS A VOICE, so the sound of a voice cannot be what ends this one (owner, 08-19
    // evening). The comeback is kept, its latest moment held, and the wake rule releases it: the
    // sound has to say somebody is talking into a line the music has left AND Echo has to have
    // written a line that is not Staff stepping away.
    if (onHold && musicRecognisedHold) {
      pendingComeback = { gapMs, newPerson: maybeNewPerson, backAtMs };
      log("the ear hears a comeback inside the music wait: waiting for the wake rule to agree");
      return;
    }
    if (onHold && holdProvedWordless) {
      pendingComeback = { gapMs, newPerson: maybeNewPerson, backAtMs };
      log("the ear hears a comeback, but this hold proved wordless: waiting for written words");
      return;
    }
    endHold(gapMs, maybeNewPerson, backAtMs);
  }
  /** Post-stop pieces coalesce for a beat so a burst of late writing hands as ONE turn, not two
   *  (check 371: two pieces 0.12s apart reached him as two turns). */
  let pieceCoalesceTimer: NodeJS.Timeout | null = null;
  /** HOW LONG HIS OWN EARS HAVE TO HAVE BEEN OPEN before his own answer is trusted at a comeback
   *  (owner, 08-17 late). Under this he joined too late to have heard the end of their sentence,
   *  and the written words are the only thing that can tell him what they said. */
  const HEARD_ENOUGH_MS = 1200;
  /** The last thing Staff said, as written down: what he is answering when he answers on his own. */
  let theirLastLine = "";
  /** The moment his voice last really went out on the line, used to hold the goodbye's own sound. */
  let hisVoiceOutAtMs = 0;
  /** His line's end while its words are still on their way (his sound starts before the provider
   *  sends the text), so the end lands on HIS line and never on the one before it. */
  let hisEndWaitingForWords = 0;
  /** Has THIS turn's line been written down yet? His sound and his words arrive separately. */
  let hisTurnLineWritten = false;
  /** …and the turn's own first sound belongs to ONE line, never to a second one after it. */
  let hisTurnStartSpent = false;
  /** When his sound for this turn first went out, which is when Staff actually heard him start. */
  let hisTurnAudioStartMs = 0;
  /** When Staff came back from the last wait. Silence before that moment is the wait itself, never
   *  a person standing there waiting on Charlie. */
  let lastHoldEndAtMs = 0;
  /** When he last answered Staff off his own hearing instead of our written words. */
  let answeredFromHisEarsAtMs = 0;
  /** ONCE THE ANSWER IS IN HAND, a quiet line is the check ending, not a person thinking. He is
   *  told to say his goodbye rather than standing there (owner, 08-17 late, off check 376's 13
   *  silent seconds). Restarted by anything Staff say, so nobody is ever cut off mid sentence. */
  const WARM_WRAP_UP_MS = 5_000;
  let warmWrapTimer: NodeJS.Timeout | null = null;
  let warmWrapSaid = false;
  function armTheWarmWrapUp(): void {
    if (warmWrapTimer) { clearTimeout(warmWrapTimer); warmWrapTimer = null; }
    if (ended || warmWrapSaid) return;
    warmWrapTimer = setTimeout(() => {
      warmWrapTimer = null;
      if (ended || warmWrapSaid || wrapRecorded || !eleven || !ready) return;
      if (Date.now() < agentPlayingUntil) { armTheWarmWrapUp(); return; }   // he is still speaking
      // THE QUIET MUST BE REAL, MEASURED AGAINST THE SOUND (check 403). This timer was armed as the
      // set question's clip STARTED and fired 219 milliseconds after the clip ended, and because the
      // recorded goodbye plays instantly — unlike a generated one, whose thinking seconds used to
      // win Staff the race by accident — it closed the check before Staff could answer, and "Pitch
      // Black, the booster boxes" never made the record. The five seconds count from the LAST sound
      // on the line, ours or theirs: their voice still on, or any sound ending inside the window,
      // re-arms rather than closes. Nobody is ever cut off mid answer by a goodbye again.
      const lastSoundMs = Math.max(agentPlayingUntil, lastTheirVoiceStopAtMs, lastHandAtMs);
      if (theirVoiceOn || Date.now() < lastSoundMs + WARM_WRAP_UP_MS) { armTheWarmWrapUp(); return; }
      warmWrapSaid = true;
      emit(room, "unknown", "Nothing more was said, so Charlie was told to say goodbye rather than wait",
        { step: "warm_wrap_up", afterMs: WARM_WRAP_UP_MS });
      log("warm wrap-up: the answer is in hand and the line has gone quiet — telling him to close");
      try {
        eleven.send(JSON.stringify({ type: "contextual_update", text:
          `[Nobody has said anything more. Say your goodbye now, warmly and briefly, and end the check with end_call. `
          + `Do not ask anything else and do not wait any longer.]` }));
      } catch { /* best effort */ }
    }, WARM_WRAP_UP_MS);
  }
  /** ONE BEAT to be sure the quiet is theirs and not a breath, then the meter goes off. */
  const THEIR_TURN_QUIET_MS = 1_000;
  let meterOffTimer: NodeJS.Timeout | null = null;
  /** Do they owe us the answer right now? Read off the check's own memory, never off a phrase:
   *  somebody is on the line with us and the answer this check exists for is not on the record yet,
   *  so the next thing owed is theirs to say. The moment the reader finds the answer it stops being
   *  their turn, and a quiet line after that is the check ending, not a wait. */
  const itIsTheirTurn = () => humanAtMs > 0 && !signoffNudged;
  /** …and it is HIS turn, not theirs, from the moment their words reach him until he has answered:
   *  the quiet in between is Charlie thinking, which is never a wait and never stops the meter. */
  const heOwesThemAWord = () => !!eleven && charlieMaySpeak && !spokeThisSession && answeredAtMs > 0
    && Date.now() - answeredAtMs < Math.max(HIS_FIRST_WORD_MS, THEIR_TURN_QUIET_MS);
  function armTheMeterOff(why: string): void {
    if (meterOffTimer) { clearTimeout(meterOffTimer); meterOffTimer = null; }
    // A TURN IN FLIGHT IS NOT SILENCE. Their comeback being handed to him is the conversation mid
    // stride: nothing about it is a wait.
    if (ended || onHold || !eleven || reconnectFeed || !itIsTheirTurn()) return;
    meterOffTimer = setTimeout(() => {
      meterOffTimer = null;
      // Everything is re-read at the moment it would cost money: they may have started talking
      // again, the answer may have landed, our own voice may still be going out, or the word owed
      // may be HIS, which is him thinking and never a wait.
      if (ended || onHold || !eleven || theirVoiceOn || reconnectFeed || !itIsTheirTurn()) return;
      // The word owed may still be HIS, which is him thinking, and our own voice may still be
      // going out. Neither is a wait, so the beat simply runs again rather than being given up on.
      if (heOwesThemAWord()) { armTheMeterOff("the word owed was still his"); return; }
      if (Date.now() < agentPlayingUntil) { armTheMeterOff("our own audio was still playing"); return; }
      log(`meter off: ${why} — nobody is saying anything to us and the answer is still theirs to give`);
      // The wait began when the line went quiet, which is their last sound, not this beat's end.
      beginHold("quiet", lastTheirVoiceStopAtMs > 0 ? lastTheirVoiceStopAtMs : Date.now() - THEIR_TURN_QUIET_MS);
    }, THEIR_TURN_QUIET_MS);
  }
  /** THE REOPEN ITSELF, exactly as it has always run: the note he is owed, the reconnect feed, and
   *  his session. Called the moment Staff's voice comes back, never a moment later. */
  function openHimForTheComeback(secs: number, newPerson: boolean, handedOn: boolean, provedByWords = false): void {
    if (ended) return;
    // HIS SESSION MAY ALREADY BE UP (fix 3, 08-19 night): the first sound of a voice coming back
    // starts it while the words are still being read. Everything below still runs — the note about
    // the gap, the reconnect feed, the buffering moment — because that is what turns an open
    // session into a comeback; only the opening itself is skipped, since it is already open.
    const alreadyOpen = !!eleven;
    gapNote = { secs, newPerson, replayed: handedOn };
    wordsOnlyReopen = true;         // from here, words are the only way a hold-window line reaches him
    hisEarsBackAtMs = Date.now();   // …and audio from this exact moment on is buffered for his new session
    if (echoRooms.has(room) && !handedOn) {
      // WHAT HE WAS ALREADY FED WHILE THE WAKE CHECK PROVED THEM STAYS FED (owner, 08-19 night).
      // Starting a blank feed here would forget it, and the joined line would reach him a second
      // time as a fresh turn.
      reconnectFeed = reconnectFeed?.handed.length
        ? { handed: reconnectFeed.handed, voiceStopped: true }
        : { handed: [], voiceStopped: !theirVoiceOn };
      charlieMaySpeak = false;
      // The wordless-rejoin window opens with his ears: written words spend it, and a rejoin that
      // reaches the far side with nothing written was the music (owner 08-18, check 380).
      // …EXCEPT WHEN WORDS ARE WHAT PROVED THE COMEBACK (owner, 08-19 night, off check 416). The
      // wake check reads what Echo wrote and says a person: those words are the very thing this
      // window exists to wait for, so demanding a SECOND set of them inside four seconds dropped a
      // person who had already answered us. He went quiet mid reply at 43 seconds, the store asked
      // "Hello?", and the check ran 84 seconds and cost 11.3 cents.
      heardWordsSinceEarsBack = provedByWords;
      if (wordlessRejoinTimer) clearTimeout(wordlessRejoinTimer);
      if (!provedByWords) wordlessRejoinTimer = setTimeout(() => {
        wordlessRejoinTimer = null;
        if (ended || onHold || heardWordsSinceEarsBack) return;
        holdProvedWordless = true;
        wordlessRedropAtMs = Date.now();
        if (answerWaitTimer) { clearTimeout(answerWaitTimer); answerWaitTimer = null; }
        log(`the rejoin wrote no words in ${Math.round(REJOIN_WORDLESS_MS / 1000)}s: the voice was the music, dropping again`);
        emit(room, "unknown", "The voice that brought Charlie back wrote no words, so it was the music and he is dropped again",
          { step: "wordless_rejoin", afterMs: REJOIN_WORDLESS_MS, notASound: true }, hisEarsBackAtMs || undefined);
        // THE MUSIC NEVER STOPPED. He was let back in at `hisEarsBackAtMs` and nothing was ever
        // said, so the wait he is going back into started there, not at this timer's end (check
        // 407: this call passed a plain Date.now() into a moment every other caller measured on the
        // ear's own clock, and that is what printed 44 for a wait that began near 41).
        beginHold("music", hisEarsBackAtMs || Date.now());
      }, REJOIN_WORDLESS_MS);
      if (!answerWaitTimer) {
        answerWaitTimer = setTimeout(() => {
          answerWaitTimer = null;
          if (ended || charlieMaySpeak) return;
          letHimAnswer("nothing was handed after the reconnect");
        }, ANSWER_WAIT_MS);
      }
    }
    if (!alreadyOpen) {
      void connectEleven(`back after a ${secs}s wait`);
      // The buffer is the existing one: everything said from here is held until his session reports
      // ready, then released whole, exactly as it is on the opening handoff.
      connecting = true;
    } else {
      log(`comeback: his session was already opening on the sound, so the ${secs}s wait ends straight into it`);
    }
  }
  /** THE GAP STAMPS (owner box 08-16 late): measured by the engine on the call itself, written onto
   *  the record, so every metered second belongs to somebody by name. */
  let lastTheirVoiceStopAtMs = 0;   // the sound's real end, backdated past the ear's confirm gap
  let lastHandAtMs = 0;             // when words were last handed to him as their turn
  let worstAnswerGapMs = 0;         // his slowest reply, anchored at their stop or the hand
  let hisTurnOpen = false;
  /** Our recorded hold reply is covering the announce; his own generated version is dropped. */
  let ackPlayingUntil = 0;
  /** HIS OWN NOTE IS NOT SPEECH (owner, 08-19, off checks 398 and 399). When the reply he is about
   *  to say is a note to himself rather than words for Staff, this turn's audio never reaches the
   *  line: silence plays and the turn counts as skipped. Set from his OWN words only, at every
   *  `agent_response`, so an ordinary reply clears it again on the very next turn. Nothing Staff
   *  say is ever judged here, so it can never take a real answer off the line. */
  let noteTurnSilenced = false;
  let convEar: ConversationEar | null = null;   // attached the moment a real person is on the line
  /**
   * THE INVERSION (owner + PM, 08-08). Mid conversation, PLAIN QUIET NEVER DROPS CHARLIE. He is
   * dropped only on real evidence Staff left: their own going-to-check words ("let me check",
   * "hold on", "one sec" — `saidGoingToCheck`, the same family the finalizer has always read a
   * last clerk line by), or hold music, or a transfer, or `quietBackstopMs` of unbroken quiet as
   * the backstop, because at that point the handset really was put down.
   *
   * WHY. Real people take a beat to answer, and the quiet drop kept reading that beat as Staff
   * walking off: checks 357, 358 and 360 all lost their answer or their goodbye to it, and every
   * fix so far has been a clock arguing with another clock. Real people also SAY where they are
   * going before they go, which is why every hold in our own history opens with an announcement,
   * so the savings on real waits are untouched: an announced quiet drops him at exactly the speed
   * it always did, and `holdQuietMs` now times only the announced cases.
   *
   * `waitAnnounced` is their LATEST line, nothing older: "let me check" announces the next quiet,
   * and their coming back and answering un-announces it. Read in `staffSaid`, the one door every
   * Staff line already passes through.
   */
  let waitAnnounced = false;
  let quietBackstopTimer: NodeJS.Timeout | null = null;
  /** The carrier counts its media messages. One that arrives out of order is skipped rather than
   *  allowed to wind anything backwards. */
  let lastSeq = -1;
  /** What Staff said while Charlie was closed. He gets the WORDS when he comes back, never the audio
   *  again: the text is what he needed and it costs nothing to hand over. */
  let missedWhileClosed: string[] = [];
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
    // The moment his conversation became his. Everything that waits on his FIRST word measures from
    // here, never from when his session opened: opening is ours, answering is theirs.
    answeredAtMs = Date.now();
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
    // ECHO ALREADY WROTE THEIR HELLO DOWN (owner box 08-16, fix 1). On a check where Echo has the
    // words, the store's first line landed in writing seconds ago, so paying the voice company to
    // transcribe the same audio a second time bought nothing but a slower, costlier copy of a line
    // we hold. The written words are handed over instead; a check without Echo transcribes exactly
    // as before, because there the audio is the only copy that exists.
    if (echoRooms.has(room) && theirFirstLine) {
      helloLineWaiting = { text: theirFirstLine };
      // …and the hello is HIS from this moment: the pocket is handed at his first join now (the
      // clip path no longer carries early audio to him), and the one line that must never ride
      // that hand-over is the hello the recording already answered (owner 08-05, checks 282-286).
      markAsHis(theirFirstLine);
      deliverHelloLine();
    }
    // THE HELLO'S WRITING CAN LOSE THE RACE TO THIS MOMENT (check 370). The shorter opening wait on
    // a known-direct store commits the question ~1.5s after the greeting ends, and Echo's writing of
    // that greeting lands about a second behind the sound — on 370 it landed just after, so the
    // branch above never ran, the hello went unmarked, and the first-join hand-over gave it to
    // Charlie as a turn he owed: he asked the set question at 12.7s before Staff had said a word.
    // On an Echo check the hello is NEVER transcribed a second time; instead `staffSaid` finishes
    // this hand-over the moment the first line lands, whichever side of this instant that is.
    else if (echoRooms.has(room)) { wantHelloFromEcho = true; clipCommittedAtMs = Date.now(); }
    else void transcribeTheirHello(helloAudio, ctx?.apiKey || config.voice.apiKey);
    // THE QUESTION WE ACTUALLY ASKED IS A LINE OF THE CONVERSATION. It is played from a recording
    // rather than generated, so nothing in the provider's transcript knows it happened — which left
    // our own record missing the single most important line on the call, and left the live view with
    // no way to know we had asked. It then sat on "Staff picked up" forever, and any short word the
    // agent said next got painted as walking a phone menu at a store with no menu at all.
    recordLine(room, "Agent", clip.text, undefined, true /* we played it ourselves, so it is never an echo */,
      undefined, Date.now() + clip.ms /* a recording we play knows exactly when it stops */);
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
  /** A moment the ear reports, turned back into a real one. The ear counts frames and never a clock,
   *  and we feed it every frame the store sends us while none of our own audio is playing, so the
   *  audio it has heard since that moment is the time that has really passed since it (owner 08-06:
   *  the hold rows must draw when Staff really went, not six seconds later when we were sure). */
  const earMoment = (heardAtMs: number): number | undefined =>
    convEar ? Date.now() - Math.max(0, convEar.heardMs - heardAtMs) : undefined;

  /** HE HAS SAID GOODBYE AND NOBODY IS TALKING, so WE put the phone down (owner 08-04, check 282;
   *  second door added 08-07, check 356). The ear only counts quiet once our own audio has finished
   *  playing, so his goodbye is always fully out before this can run. */
  /** NEVER HANG UP MID GOODBYE (owner, 08-17 late, off check 374: the check ended at 88.0 seconds
   *  while the goodbye that started at 87.6 was still playing, so Staff and the recording both got
   *  half of it). His words reach us before his sound has finished going out, so the phone goes
   *  down only once the goodbye has really played, with a short tail so the recording holds all of
   *  it. Capped, so a goodbye whose sound never comes cannot hold the line open forever. */
  const GOODBYE_TAIL_MS = 600;
  const GOODBYE_MAX_WAIT_MS = 12_000;
  /** If no sound of his has gone out at all, there is nothing to wait for: a goodbye whose voice
   *  never came is silence on the line, and holding the call open for it just bills for nothing. */
  const GOODBYE_NO_VOICE_MS = 2_500;
  let goodbyeTimer: NodeJS.Timeout | null = null;
  function hangUpAfterGoodbye(atMs: number) {
    if (ended || goodbyeTimer) return;
    const askedAtMs = Date.now();
    const finish = (heldMs: number, playedOut: boolean) => {
      goodbyeTimer = null;
      if (ended) return;
      if (heldMs > 0) emit(room, "unknown", playedOut
        ? "We waited for Charlie's goodbye to finish playing before hanging up"
        : "Charlie's goodbye never finished playing, so we hung up on the cap",
        { step: "goodbye_played_out", heldMs, playedOut });
      endTheCheck(atMs);
    };
    const waitForHisVoice = () => {
      goodbyeTimer = null;
      if (ended) return;
      const held = Date.now() - askedAtMs;
      const started = hisVoiceOutAtMs >= askedAtMs - 1_500;      // the goodbye's own sound, not an older line's
      const finished = started && Date.now() >= agentPlayingUntil + GOODBYE_TAIL_MS;
      if (finished) { finish(held, true); return; }
      if (!started && held >= GOODBYE_NO_VOICE_MS) { finish(held, false); return; }
      if (held >= GOODBYE_MAX_WAIT_MS) { finish(held, false); return; }
      goodbyeTimer = setTimeout(waitForHisVoice, 120);
    };
    waitForHisVoice();
  }
  function endTheCheck(atMs: number) {
    if (ended) return;
    noteWeEnded(room, "signed_off");
    emit(room, "hangup", "Charlie said goodbye and the line went quiet, so we hung up", { reason: "signed_off", atMs });
    log("signoff: goodbye said and the line went quiet — the check is over, hanging up");
    try { eleven?.close(); } catch { /* torn down */ }
    signalEnd();
    try { twilio.close(); } catch { /* best effort */ }
  }

  /** True only inside the backstop's own call back into beginHold, so the gate lets it through. */
  let backstopFired = false;
  /** @param atMs THE MOMENT THE WAIT REALLY STARTED, on the call's own wall clock, never the moment
   *  the engine worked it out (owner, 08-19 evening, off check 407: the second wait began near 41
   *  seconds and its rows printed 44, with "Staff back after 6s" sitting between rows saying 44 and
   *  47, because two clocks were in play — the ear's own relative moment from one caller and a
   *  plain Date.now() from another. Every caller backdates to the truth BEFORE calling now, and
   *  what is written down is what a person listening to the recording would hear at that second. */
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
    if (signoffNudged && wrapRecorded && (reason === "quiet" || reason === "room")) { hangUpAfterGoodbye(atMs); return; }
    // THE INVERSION'S GATE (owner + PM, 08-08). A quiet nobody announced is a beat in the
    // conversation, not a wait: Charlie stays open, keeps his ears, and answers when they do.
    // Only the backstop turns it into a wait, `quietBackstopMs` of unbroken quiet, because at that
    // point the handset really was put down. Music and a transfer are somebody DOING something and
    // never pass through here; the goodbye door above already took the signed-off case.
    // A hand-over he asked for, or Staff said they were making, is ALSO an announcement: the next
    // quiet is the phone changing hands, which is the one wait the runtime already knew was coming.
    // THE CHECK'S OWN MEMORY IS A SECOND LOCK ON THIS DOOR, NEVER A NEW KEY (owner, 08-18). For one
    // evening the memory replaced the evidence: any quiet at all became a wait as long as the answer
    // was still owed, and that dropped him in the middle of a person thinking — the exact fault the
    // inversion was written to end, and it broke three shapes in the bank. The evidence list is back
    // as it was: an announcement, hold music, a transfer, a hand-over, or the backstop. The memory
    // now only ever holds him ON the line, in `armTheMeterOff`, so a quiet after the answer is
    // already in hand is the check ending rather than a wait.
    if ((reason === "quiet" || reason === "room") && !waitAnnounced && !expectHandover && !backstopFired) {
      if (!quietBackstopTimer) {
        const already = Math.max(0, tune.holdQuietMs);
        const left = Math.max(0, Math.max(0, tune.quietBackstopMs) - already);
        log(`quiet nobody announced: Charlie stays on the line (the inversion). Backstop in ${Math.round(left / 1000)}s if nobody speaks at all`);
        quietBackstopTimer = setTimeout(() => {
          quietBackstopTimer = null;
          if (ended || onHold) return;
          log(`quiet backstop: ${Math.round(Math.max(0, tune.quietBackstopMs) / 1000)}s of unbroken quiet with no announcement — the handset was put down, this IS a wait`);
          backstopFired = true;
          try { beginHold(reason, atMs); } finally { backstopFired = false; }
        }, left);
      }
      return;
    }
    if (quietBackstopTimer) { clearTimeout(quietBackstopTimer); quietBackstopTimer = null; }
    // A new wait starts, so the reconnect feed's turn is over, however it ended (owner task 08-15).
    reconnectFeed = null;
    // …and a reply he was building for a comeback that turned back into a wait is never spoken.
    binTheEarlyTurn("the line went back to being a wait");
    onHold = true; holdReason = reason; heldWords = [];
    // THE SENTENCE AND THE ROW ARE ONE NUMBER (owner, 08-19 night). A backdated stamp is never let
    // above the row before it, so the second this row DRAWS at is what its own wait must be
    // measured from; the raw moment we measured is what check 412's "Staff back after 26s" was
    // built from, and it read between rows 24.3 seconds apart.
    holdStartedAtMs = whereItWouldDraw(room, atMs) ?? 0;
    shutCharliesEars(`the wait was declared (${reason})`, atMs);
    // EVERY WAIT THAT ENDS HAS TO HAVE STARTED. A transfer used to write ONLY its own line, and then
    // the wait it caused ended with a "back off hold" that had no "put on hold" anywhere above it —
    // a receipt you cannot read straight through (owner 07-28). Being handed on and being made to
    // wait are two facts, so a real transfer now says both, in that order. No new event kinds: the
    // set is a closed sixteen and both of these are already in it.
    if (reason === "transfer") emit(room, "transfer", transferNote, { reason, atMs, department: department || null }, atMs);
    const note = reason === "transfer" ? "Waiting for the next department to pick up"
      : reason === "music" ? "Staff stepped away, hold music"
      // A HANDSET ON THE COUNTER. The store is still audible, nobody is talking to us, and the meter
      // stops exactly as it does on silence.
      : reason === "room" ? "The room went quiet, Staff put the phone down"
      : "Staff stepped away, the line went quiet";
    emit(room, "hold_start", note, { reason, atMs }, atMs);
    // …AND THIS WAIT HAS AN ENDING NOW (round 1, item 1.6). Nothing ended a mid check wait before
    // this: a store that put the phone down and forgot about us ran to the carrier's own five minute
    // limit, and the customer waited all of it to be told nothing. Waiting is nearly free because
    // Charlie is dropped, so the cap is generous — but it exists.
    //
    // Every kind of wait, including one that follows a hand-over: from the customer's side the
    // outcome is identical, nobody came back. The status is the one we already have, "left on hold";
    // no new word for a customer to read (owner's ruling 08-01).
    if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; } if (quietBackstopTimer) { clearTimeout(quietBackstopTimer); quietBackstopTimer = null; }
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
      const onLineFor = charlieOpenedAtMs ? Date.now() - charlieOpenedAtMs : MIN_ON_LINE_MS;
      const dropHim = () => {
        closeWhenReady = null;
        if (ended || !onHold || !eleven) return;   // they came back, or the check is over
        log(`hold (${reason}): closing the agent — the meter stops until somebody comes back`);
        closeSegment(room);
        markNow(room, "charlieCloseMs");
        emit(room, "charlie_leave", "Charlie dropped", { reason, strategy: "reopen", notASound: true });
        try { eleven?.close(); } catch { /* torn down */ }
        eleven = null; ready = false; connecting = false;
      };
      // HE WAS HANDED THEIR ANSWER AND HAS NOT SPOKEN YET, so this quiet is him thinking. Wait for
      // his first word, capped. Music and a transfer never come through here on this path anyway:
      // both are somebody DOING something, and neither is Charlie holding his tongue.
      const owedHimAWord = charlieMaySpeak && !spokeThisSession && answeredAtMs > 0 && HIS_FIRST_WORD_MS > 0
        ? Math.max(0, answeredAtMs + HIS_FIRST_WORD_MS - Date.now()) : 0;
      // A rejoin that proved wordless drops AT ONCE: the minimum-on-line window exists so a real
      // person never hears him come and go choppily, and a hold that just proved it holds wordless
      // sound has proven there is nobody to hear anything (owner 08-18, check 381: the politeness
      // second was a metered second of hold music).
      // MUSIC MEANS NOBODY IS THERE TO HEAR HIM, so he goes at once (owner, 08-19 evening, off
      // check 407's five awake seconds: the wait was declared at 11.8s and he was not dropped until
      // 16.9s, because Staff's stepping-away line had left him owed a word. Nobody was owed
      // anything: the store had put music on. Same reasoning the proven-wordless rejoin already
      // uses, which is that the politeness second is a metered second of hold music.
      const wait = (holdProvedWordless || reason === "music") ? 0 : Math.max(MIN_ON_LINE_MS - onLineFor, owedHimAWord);
      if (wait <= 0) dropHim();
      else {
        log(`hold (${reason}): ${owedHimAWord > 0 ? "he has their answer and has not spoken yet" : `his session is only ${Math.round(onLineFor / 1000)}s old`}, giving him ${Math.round(wait / 1000)}s before closing him`);
        if (closeWhenReady) clearTimeout(closeWhenReady);
        closeWhenReady = setTimeout(dropHim, wait);
      }
    } else {
      log(`hold (${reason}): the agent stays open but is fed nothing and cannot be heard`);
    }
  }

  /** Somebody is back on the line. */
  function endHold(gapMs: number, maybeNewPerson: boolean, backAtMs?: number) {
    // A voice on the line cancels the unannounced backstop whether or not a hold was ever accepted:
    // the ear fires this on the SOUND of somebody speaking, which is exactly the proof the quiet was
    // a beat and not a put-down handset.
    if (quietBackstopTimer) { clearTimeout(quietBackstopTimer); quietBackstopTimer = null; }
    if (!onHold) return;
    const was = holdReason;
    onHold = false; holdReason = null; everCameBack = true;
    musicRecognisedHold = false;
    // HIS SESSION IS ALREADY UP BECAUSE IT STARTED ON THE SOUND (fix 3). Everything a comeback does
    // still has to run — the note about the gap, the reconnect feed, the wordless-rejoin guard —
    // and the test for it used to be "is he closed", which he no longer is.
    const cameBackEarly = reconnectingEarly;
    reconnectingEarly = false;
    if (earlyReconnectTimer) { clearTimeout(earlyReconnectTimer); earlyReconnectTimer = null; }
    // HIS EARS COME BACK ON BELOW, AFTER THIS WAIT'S OWN ROW IS WRITTEN (owner, 08-19 night). Opening
    // them hands him what he missed, which writes its own row, and doing that first pushed the
    // wait's own ending BELOW the hand-over on check 413's sheet: rows out of order, and the
    // sentence measured against the wrong one.
    holdProvedWordless = false; pendingComeback = null;
    // THE ANNOUNCEMENT IS SPENT (check 369). "Let me check, I'll put you on hold" announces ONE
    // wait, and this is that wait ending. It used to stay armed until Staff's next WRITTEN line
    // landed, and Echo's writing runs seconds behind — so with the drop switch at 3 seconds,
    // Charlie's own thinking gap right after the comeback was read as a second announced wait: a
    // false hold pair went on the record at 72s and the sheet failed the check on "Meter stopped".
    waitAnnounced = false;
    // He was about to be closed and does not need to be: they are back and he is still on the line.
    if (closeWhenReady) { clearTimeout(closeWhenReady); closeWhenReady = null; }
    // Somebody came back, so the wait had an ending of its own and the cap has nothing to end.
    if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; }
    // THE WAIT'S LENGTH IS THE DISTANCE BETWEEN ITS OWN TWO ROWS (owner, 08-19 evening). The ear
    // measures the gap on its own clock, which starts a beat before ours, so a row could read
    // "Staff back after 26s" between rows a second and a half apart from that. Read off the rows.
    const drawnEnd = whereItWouldDraw(room, backAtMs);
    const secs = holdStartedAtMs > 0 && drawnEnd != null
      ? Math.max(0, Math.round((drawnEnd - holdStartedAtMs) / 1000))
      : Math.round(gapMs / 1000);
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
    // AT THE MOMENT THEY SPOKE, not the moment we had heard enough of it to be sure. The ear already
    // backdates to their first word, which is why the length above is right; the row draws there too.
    lastHoldEndAtMs = Date.now();
    emit(room, "hold_end", `Staff back after ${secs}s${newPerson ? ", and it may not be the same person" : ""}`,
      { gapSec: secs, maybeNewPerson: newPerson, reason: was, ...(asked ? { afterAskingToBePutThrough: true } : {}) },
      backAtMs);
    // HIS EARS COME BACK ONLY NOW, AFTER THE WAIT'S OWN ROW (owner, 08-19 night). Opening them hands
    // him what he missed, which writes its own row, so doing it first pushed the wait's ending BELOW
    // the hand-over on check 413's sheet: rows out of order, and the sentence measured off the wrong
    // one. The row is written, so the sentence and the rows now read the same second.
    // …AND WHATEVER HE HAD READY GOES OUT FIRST (owner, 08-19 night). He was handed their words as
    // Echo wrote them and has been building his reply with his mouth shut; the wake check has just
    // said a person, so it plays now, before the pocket can hand him anything else and have two
    // replies on the line at once.
    releaseTheEarlyTurn();
    openCharliesEars("the wait ended and somebody came back", backAtMs);
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
    if (!eleven || cameBackEarly) {
      log(`hold over after ${secs}s: ${eleven ? "his session is already up, finishing the comeback around it" : "opening the agent for whoever is back (next segment of this call)"}`);
      // HE WAS CLOSED, SO HE CANNOT BE TOLD YET, AND HE STILL HAS TO BE TOLD. The note is held and
      // sent the instant his new session reports ready. Skipping it is how a reopened agent greets a
      // brand new person as though they had been on the line the whole time.
      // THE RECONNECT FEED (owner task 08-15). On a check where Echo has the words, the turn that
      // brought Staff back is usually still being written when his session opens: its final pieces
      // are handed as they arrive, and his TURN opens on the EAR hearing their voice stop — the
      // 08-05 answer gate, never the writer's one second quiet. Held shut here; `handTheirTurn`
      // opens it, and the 9 second backstop below is the same one the opening question uses, so a
      // comeback nobody says a word into cannot gag him forever. Never on a hand-over to a NEW
      // person: there the recording asks again and its own gates run.
      // HE COMES BACK THE MOMENT THEIR VOICE DOES (owner, 08-18). For one evening he waited for
      // Staff to finish their comeback sentence before opening, to save the seconds of his meter
      // that ran while Echo was writing those same words down. It cost us their answer twice, on
      // the replays of checks 373 and 371: their finished line landed while his session was still
      // opening, so nobody was there to hear it. Never missing an answer is worth those 3 seconds,
      // and the standing law from here is that no cost trimming may change WHEN his ear switches
      // on or off. Savings of that kind wait for the rebuild after the twenty tests.
      openHimForTheComeback(secs, newPerson, handedOn, cameBackEarly);
      return;
    }
    // He stayed open through the wait, so he has been fed nothing and believes no time has passed.
    // TELL HIM, or he carries straight on and greets a new clerk as the old one.
    tellCharlieAboutTheGap(secs, newPerson, handedOn);
    // WHAT HE MISSED, IN WORDS (owner 08-07). Echo heard every sentence said while he was deaf, so he
    // is handed the sentences. The old way handed back the AUDIO, paced out frame by frame so a
    // transcriber could hear the pauses in it, and it only ever worked on the wait he stayed open
    // for. Words need no pacing, no catching up, and no buffer of somebody's voice.
    if (echoRooms.has(room) && missedWhileClosed.length) { tellCharlieWhatHeMissed(); }
    else { for (const w of heldWords) { try { eleven?.send(JSON.stringify({ user_audio_chunk: w })); } catch { /* best effort */ } } }
    heldWords = [];
  }

  /**
   * WHAT STAFF SAID WHILE HE WAS OFF THE LINE, HANDED TO HIM AS THEIR TURN (owner + PM, 08-08).
   *
   * THE FAULT THIS FIXES, proven on test check 360. Echo has two pipes. The one that writes Staff's
   * words onto the record works: "Yeah. It's the pitch black booster boxes." is on that check's own
   * record at 23 seconds. The one that hands those words to CHARLIE handed them as a background
   * NOTE, and a note never makes him talk. He only replies to something addressed to him, and their
   * answer landed while he had no ears. So he reconnected, heard silence, waited politely, Staff
   * waited too, and two sides waiting is the dead air. The drop rule then fired again and the loop
   * repeated until the store hung up on us at 119 seconds. The goodbye never came because, to him,
   * the answer never arrived.
   *
   * So it goes in as a USER TURN, which is the thing he must answer, and his reply to it is spoken
   * onto the line like any other. The standing instructions ride WITH it rather than around it: a
   * separate note would be a second event and he would answer the turn before reading it.
   *
   * ONCE, NEVER TWICE (the guard). Every line handed over this way is remembered, and a line already
   * given to him can never be queued again, whichever pipe it arrives on. That is the whole of the
   * double: a sentence that started while he was open and finished after he closed is heard live in
   * part AND caught whole by Echo, and both drawing a reply would have him answer the same words
   * twice on the line.
   */
  function tellCharlieWhatHeMissed(): boolean {
    // THE GREETING IS NEVER MISSED WORDS (check 370). Delta answers the store's hello by design
    // (owner 08-05), so whatever race put it in the pocket, it may not reach him as a turn: handed
    // as one at 10.7s on 370, he answered it with the set question before Staff had said a word.
    const said = missedWhileClosed.splice(0, missedWhileClosed.length)
      .filter((s) => !theirFirstLine || keyOf(s) !== keyOf(theirFirstLine))
      // WHAT THE STORE PLAYED AT US IS NOT WHAT STAFF SAID (check 409). The reader's answer during
      // the wait decides it, and a line it judged a recording never rides this door.
      .filter((s) => !playedAtUs.has(keyOf(s)));
    handTheirTurn(said, "said while he was off");
    return said.length > 0;
  }

  /** THE ONE DOOR THAT FEEDS HIS SESSION STAFF'S WORDS AS THEIR TURN, and the moment "he has heard
   *  it" is recorded — at the handover itself, never worked out from clocks (owner task 08-15).
   *  Called with the pocket at a reopen, and with a single late line whose writing landed after he
   *  reconnected (check 366's shape). */
  function handTheirTurn(lines: string[], why: string, mouthStaysShut = false): void {
    const said = lines.map((s) => s.trim()).filter(Boolean).filter((s) => !alreadyHisToAnswer(s));
    if (!said.length || !eleven || !ready) return;
    for (const s of said) markAsHis(s);
    // HIS TURN, IN THEIR WORDS. The sentences first, so what he answers is what they said; the rule
    // after it, so he cannot mistake our instruction for part of their sentence. The rule carries
    // the ladder's own wording (owner, round two): ask only for the piece still missing, and if
    // nothing is missing, wrap up.
    const text = `${said.join(" ")}\n\n[Those are Staff's own words, said while you were off the line. Answer them now, out loud, exactly as if you had heard them yourself. Never ask them to repeat it and never ask anything they have already answered. If their words answer the question, take the answer and ask only for whatever piece is still missing; if nothing is missing, wrap up.]`;
    try {
      eleven.send(JSON.stringify({ type: "user_message", text }));
      lastHandAtMs = Date.now();
      log(`handed the agent ${said.length} line(s) AS THEIR TURN (${why}), so he answers them`);
      emit(room, "unknown", "Charlie was handed what Staff said while he was off, as their turn",
        { step: "missed_turn", lines: said.length, text: said.join(" ").slice(0, 200), why,
          // Echo's handover gap, measured here: sound stopped -> words in his hands.
          // From the true end of their voice, the same anchor his answer gap counts from, so the
          // handing and his own thinking add up to the whole silence Staff stood in (owner 08-17).
          sinceVoiceStopMs: ((): number | undefined => {
            const theirEnd = lastLineEndEpoch(room, "Clerk");
            const from = theirEnd != null && theirEnd > lastHoldEndAtMs ? theirEnd : lastTheirVoiceStopAtMs;
            return from > 0 ? Math.max(0, Date.now() - from) : undefined;
          })() });
      // AND THE QUIET AFTER IT IS HIM THINKING, NEVER A DROP, until he has answered this turn (the
      // PM's item 3). It is the same rule as his first words on a session, and being handed a turn
      // is exactly that moment: he owes them a word from here.
      // UNLESS THE WAKE CHECK IS STILL PROVING THEM (owner, 08-19 night). He is handed their words
      // early so he can be thinking, and his mouth stays shut until a person is proved.
      if (!mouthStaysShut) charlieMaySpeak = true;
      answeredAtMs = Date.now();
      spokeThisSession = false;
    } catch { /* best effort — never break a check over a turn */ }
  }

  /** A final piece of the in-flight turn landed (owner task 08-15). Kept always, cheap; it only
   *  ever reaches Charlie during a reconnect feed, and only once the ear says their voice stopped. */
  function staffPiece(text: string): void {
    const t = String(text || "").trim();
    if (!t || ended) return;
    // A written piece is real words on the line — see the wordless-rejoin note (owner 08-18).
    heardTheWords();
    openTurnPieces.push(t);
    // THE COMEBACK OVERLAPS ITSELF (owner, 08-19 night): while the store still has us waiting and
    // his session is already opening on the sound, this piece goes to him at once and to the wake
    // check at once, instead of both waiting for Echo to finish the sentence.
    if (earlyTurn && onHold) { feedTheEarlyTurn(t); return; }
    // Pieces landing after the voice stopped wait one beat for a trailing piece, so late writing
    // hands as ONE turn (check 371: two pieces 0.12s apart reached him as two separate turns).
    if (reconnectFeed?.voiceStopped) armTheHand("the pieces landed after their voice had stopped");
  }
  /** Wait one beat, then hand what we have as ONE turn. Every new piece restarts the beat, and the
   *  joined line spends it (below), so Staff's turn reaches Charlie exactly once. */
  function armTheHand(why: string): void {
    if (pieceCoalesceTimer) clearTimeout(pieceCoalesceTimer);
    pieceCoalesceTimer = setTimeout(() => {
      pieceCoalesceTimer = null;
      handPiecesNow(why);
    }, 300);
  }
  /** Hand every not-yet-handed piece of the in-flight turn as their turn. Only during a reconnect
   *  feed, only once the EAR heard their voice stop, and every piece is marked heard at this exact
   *  moment through the same one door — so the joined line that follows can never re-hand them. */
  function handPiecesNow(why: string): void {
    if (!reconnectFeed || !reconnectFeed.voiceStopped || !eleven || !ready) return;
    const un = openTurnPieces.slice(reconnectFeed.handed.length);
    if (!un.length) return;
    reconnectFeed.handed.push(...un);
    handTheirTurn(un, why);
    // …and their words re-decide what the next quiet means, exactly as a written line would: the
    // handed turn IS their latest line, arriving early (check 369: the stale announce from before
    // the hold outlived the comeback because the written line lands seconds behind the sound).
    waitAnnounced = saidGoingToCheck(reconnectFeed.handed.join(" "));
    // The joined line these pieces will become is HIS from this moment, whatever happens to the
    // feed before it lands (check 369: a false hold closed the feed first, the joined line missed
    // its absorb, rode the pocket, and the same no reached him twice). Marked AFTER the hand, or
    // a single-piece turn would be filtered out as already his.
    markAsHis(reconnectFeed.handed.join(" "));
  }

  /** ONE PIECE OF THEIR SENTENCE, HANDED THE MOMENT ECHO WRITES IT (owner's order, 08-19 night).
   *  Only while the store still has us waiting and his session is already opening on the sound of
   *  a voice: he starts working out his reply on their first written word, with his mouth shut, and
   *  the wake check runs beside it on the same words. A later piece supersedes what he was part-way
   *  through saying, so only his newest reply is ever held. */
  function feedTheEarlyTurn(said: string): void {
    if (!earlyTurn || !onHold || ended) return;
    if (eleven && ready && !alreadyHisToAnswer(said)) {
      earlyTurn.fed.push(said);
      earlyTurn.heldAudio = [];   // he was answering less than they have now said: that reply is stale
      earlyTurn.heldText = [];
      handTheirTurn([said], "their words as Echo writes them, while the wake check proves them", true);
      charlieMaySpeak = false;    // …and it stays shut: handTheirTurn's own door is the one being held
      // EVERY PIECE HE HAS BEEN GIVEN IS KEPT WHERE THE JOINED-LINE RULES ALREADY LOOK (the
      // reconnect feed, owner task 08-15). Echo joins the sentence a beat later, and that join has
      // to be recognised as exactly what he already has — or the same words reach him twice and he
      // answers them twice on the line (check 369). A join with MORE in it than he was given hands
      // only the tail, which is the same door and the same rule.
      if (!reconnectFeed) reconnectFeed = { handed: [], voiceStopped: true };
      reconnectFeed.handed.push(said);
      markAsHis(reconnectFeed.handed.join(" "));
      if (earlyTurn.fed.length === 1)
        emit(room, "unknown", "Charlie started working out his reply on their first written word, with his voice held back",
          { step: "early_turn", text: said.slice(0, 160), notASound: true });
      log(`early turn: handed "${said.slice(0, 60)}" with his mouth shut, the wake check is still proving it`);
    }
    // THE WAKE CHECK, ON THE SAME PIECE, AT THE SAME TIME. It used to wait for Echo's joined line,
    // which is the end-of-turn quiet plus the writing: 3.6 seconds of check 415's 7.8.
    void maybeWakeCharlie(said, true);
  }
  /** THE WAKE CHECK SAID PERSON. Everything he thought while it was proving goes out now, in order,
   *  and his words are written down because the store really hears them. */
  function releaseTheEarlyTurn(): void {
    const held = earlyTurn;
    earlyTurn = null;
    if (!held || ended || !held.fed.length) return;
    // HIS MOUTH OPENS HERE, whether or not he has anything ready yet. He was handed their words as a
    // turn while the wake check proved them, so he owes them an answer from this moment — and if he
    // is still thinking, his sound simply goes out live the moment it comes.
    letHimAnswer("the wake check proved a person and he was already answering them");
    if (!held.heldAudio.length || twilio.readyState !== 1) return;
    // HIS TURN STARTS HERE, because this is the first sound of it Staff ever hear, and the answer
    // gap counts from the end of their voice to exactly this moment (the same anchor as always).
    if (!hisTurnOpen) {
      hisTurnOpen = true;
      hisTurnAudioStartMs = Date.now();
      hisTurnLineWritten = false;
      hisTurnStartSpent = false;
      hisEndWaitingForWords = 0;
      const theirEnd = lastLineEndEpoch(room, "Clerk");
      const anchor = theirEnd != null && theirEnd > lastHoldEndAtMs ? theirEnd : lastTheirVoiceStopAtMs;
      const gapMs = anchor > 0 ? Date.now() - anchor : 0;
      if (gapMs > 0 && gapMs < 60_000 && gapMs > worstAnswerGapMs) {
        worstAnswerGapMs = gapMs;
        try { emit(room, "unknown", "Charlie's slowest reply so far", { step: "gaps", answerGapWorstMs: worstAnswerGapMs }); } catch { /* best-effort */ }
      }
    }
    let ms = 0;
    for (const b64 of held.heldAudio) {
      twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
      fanout(room, b64, "agent");
      ms += Math.ceil((b64.length * 3) / 4 / 8);
    }
    agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + ms;
    hisVoiceOutAtMs = Date.now();
    addMs(room, "speakingMs", ms);
    charlieSpoke = true; spokeThisSession = true; charlieSpokenMs += ms;
    charlieMaySpeak = true;
    answeredAtMs = Date.now();
    // HIS WORDS GO ON THE RECORD NOW, and not one moment before: until this send they belonged to a
    // reply that might never have been spoken at all.
    for (const txt of held.heldText) {
      if (recordLine(room, "Agent", txt, hisTurnAudioStartMs || undefined)) {
        hisTurnLineWritten = true;
        try { relayLine?.(room, "Agent", txt); } catch { /* the screen is best-effort */ }
      }
    }
    if (hisTurnLineWritten) stampLineEnd(room, "Agent", agentPlayingUntil);
    else hisEndWaitingForWords = agentPlayingUntil;
    if (!wrapUpNudged && charlieSpokenMs >= WRAP_UP_MS) nudgeToWrapUp();
    emit(room, "unknown", "The wake check proved a person, so the reply Charlie had ready went straight out",
      { step: "early_turn_released", chunks: held.heldAudio.length, playedMs: ms });
    log(`early turn: released ${held.heldAudio.length} chunk(s), ${ms}ms of his reply, with no thinking left to wait for`);
  }
  /** THE WAKE CHECK SAID RECORDING. Nothing he thought ever plays and nothing is written down. */
  function binTheEarlyTurn(why: string): void {
    if (!earlyTurn) return;
    const n = earlyTurn.heldAudio.length;
    earlyTurn = null;
    if (n) {
      emit(room, "unknown", "The reply Charlie had ready was thrown away: the voice was the store's own recording",
        { step: "early_turn_binned", chunks: n, why, notASound: true });
      log(`early turn: binned ${n} chunk(s) — ${why}`);
    }
  }

  /** THE HOLD REPLY AS A RECORDING (owner box 08-16 late, off check 371). Staff announce a hold
   *  and the acknowledgment plays AT ONCE from our own system, in Charlie's voice, the way Delta's
   *  question plays — the spoken version cost 8 metered seconds on 371 while the outside voice
   *  service thought it up. His own generated reply to the same announce is dropped while the
   *  recording covers it, and the quiet after it is THEIRS, so the drop counts from their walk
   *  away exactly as the switch says. */
  function playHoldAck(): void {
    if (ended || twilio.readyState !== 1 || !streamSid || !charlieGateOpen) return;
    const es = !!ctx?.holdAckClipEs && staffSpokeSpanish(theirFirstLine);
    const clip = es ? ctx?.holdAckClipEs : ctx?.holdAckClip;
    if (!clip) return;
    for (const f of toMediaFrames(clip.audio)) {
      twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: f } }));
      fanout(room, f, "agent");
    }
    agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + clip.ms;
    ackPlayingUntil = Date.now() + clip.ms + 4000;
    // OUR RECORDING IS NOT HIS METER (owner, 08-17 late). It is our own audio going down the line
    // from our own file, and once he is off the meter for the wait, none of it is his to bill: the
    // seconds are only counted as his when he is actually connected.
    if (!onHold) { addMs(room, "speakingMs", clip.ms); charlieSpokenMs += clip.ms; }
    spokeThisSession = true;   // he has had his say: the quiet that follows is Staff walking away
    recordLine(room, "Agent", clip.text, undefined, undefined, undefined, Date.now() + clip.ms);
    try { relayLine?.(room, "Agent", clip.text); } catch { /* the screen is best-effort */ }
    emit(room, "unknown", "The hold reply played as a recording", { step: "hold_ack_clip", ms: clip.ms, language: es ? "es" : "en" });
    log(`hold ack: our recording played (${clip.ms}ms), no wait on the outside voice service`);
  }

  /** Every Staff line already given to Charlie, by either pipe, so nothing is ever answered twice. */
  const hisAlready = new Set<string>();
  /** Lines the reader judged the store PLAYED at us rather than said to us. They stay on the record,
   *  where the sheet shows them and the after-call reader names them, and they are never fed to
   *  Charlie: not as audio, not as a turn, and not in the pocket of what he missed. */
  const playedAtUs = new Set<string>();
  const keyOf = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const alreadyHisToAnswer = (s: string) => { const k = keyOf(s); return !!k && hisAlready.has(k); };
  const markAsHis = (s: string) => { const k = keyOf(s); if (k) hisAlready.add(k); };

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
  const hangSignoffDoor = () => { if (room) { signoffDoors.set(room, signoffDoor); staffDoors.set(room, staffSaid); pieceDoors.set(room, staffPiece); } };
  const signoffDoor = (answer: string, held?: { set?: string | null; productForm?: string | null; restockDay?: string | null; restockTime?: string | null }) => {
    if (ended || onHold || !eleven || !ready) {
      log(`signoff: knock for ${room.slice(0, 8)} (${answer}) not deliverable: ${ended ? "the check is over" : onHold ? "Staff are away" : !eleven ? "Charlie is not open" : "his session is not ready"}`);
      return;
    }
    // CHARLIE SAYS HIS OWN GOODBYE AGAIN (owner's ruling, 08-19 night: a recording may stand only
    // where nobody can answer back, and a sign-off is the end of a conversation). So this door is
    // the note it always was, told once.
    if (signoffNudged) {
      log(`signoff: knock for ${room.slice(0, 8)} (${answer}) not deliverable: already told`);
      return;
    }
    signoffNudged = true;
    // Worded for where it really sits on the log: the reader hears the yes BEFORE Charlie's follow-up
    // question is answered, so "told to wrap up" read as wrapping before the product detail
    // (owner 08-05). He is told to finish once he has what the check needs, and that is what it says.
    // "the STOCK answer", because this note lands after the yes and BEFORE the product answer, and
    // naming just "the answer" read as Charlie understanding an answer nobody had given (owner 08-06).
    // WHAT HE UNDERSTOOD AND WHAT HE WAS TOLD TO ASK (owner 08-07). One fixed sentence used to stand
    // in for both, so a row that read "the stock answer" told nobody which answer, and nothing on the
    // sheet said which follow-up he owed. The two halves are section 56 and section 58 of his own
    // instructions, and they are the only two follow-ups there are, so the row names the one he was
    // sent to get.
    // HE NEVER ASKS FOR WHAT THE CHECK ALREADY HAS (owner, 08-17 late, off check 376: Staff said
    // "It's the pitch black boxes" and he asked for the set name again, then stood 13 seconds on a
    // dead line). The reader has already pulled what Staff gave out of the record itself, so the
    // pieces still missing are read from there, never guessed and never asked for twice.
    const missing = answer === "in stock"
      ? [held?.set ? "" : "the set name", held?.productForm ? "" : "whether it is a pack or a box"].filter(Boolean)
      : [held?.restockDay ? "" : "what day more are coming", held?.restockTime ? "" : "what time of day"].filter(Boolean);
    const followUp = missing.length === 0
      ? "and everything the check needs was already said, so he was told to wrap up"
      : `was told to ask only for ${missing.join(" and ")}`;
    emit(room, "unknown", `Charlie understood the product was ${answer} and ${followUp}`,
      { step: "signoff", answer, followUp, missing });
    log(`signoff: the answer is in hand (${answer}); still missing: ${missing.join(", ") || "nothing"}`);
    // HE ASKS THE SET QUESTION HIMSELF (owner's ruling, 08-19 night). It played as a recording for a
    // day; a recording may stand only where nobody can answer back, and this one is asked straight
    // at a person who is about to reply. The owner accepts the seconds it costs.
    try {
      eleven.send(JSON.stringify({ type: "contextual_update", text:
        (missing.length === 0
          ? `[The answer is in hand and Staff have already told you everything this check needs. Ask NOTHING else. `
          : `[The answer is in hand. Staff have already given you everything except ${missing.join(" and ")}: ask ONCE, only for that, and only if it fits naturally. `)
        + `Then wrap up: thank them warmly, by name if they gave one, and end the check with end_call. `
        + `NEVER ask again for anything Staff already said, in any wording. `
        + `If they do not answer your last question within a few seconds, let it go, say your goodbye and end the check. `
        + `Never leave the check without saying goodbye, and never hang up on somebody mid sentence.]` }));
    } catch { /* best effort — never break a check over a note */ }
    // …AND HE NEVER STANDS ON A DEAD LINE (owner, 08-17 late). Once the answer is in hand the check
    // is his to close: if nothing more is said to us for a few seconds, he is told to say his
    // goodbye now. Any Staff line restarts the wait, so somebody still talking is never cut off.
    armTheWarmWrapUp();
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
      helloLineWaiting = { text };
      deliverHelloLine();
    } catch (e) { log(`hello: transcribe threw ${String(e).slice(0, 80)}`); }
  }

  /** Put the transcribed hello through the SOCKET'S OWN message handler, so the record, the relay,
   *  the name, the wrong department test and the voicemail net all run the one copy that already
   *  works, and then hand Charlie the name as context. Idempotent, and only ever on a ready session. */
  function deliverHelloLine() {
    if (!helloLineWaiting || !eleven || !ready) return;
    const { text } = helloLineWaiting; helloLineWaiting = null;
    eleven.emit("message", Buffer.from(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: text } })));
    // HE NEVER HEARD THEM SAY IT, so the one thing he would have taken from it is handed over as
    // context rather than as a turn. INFORMATIONAL ON PURPOSE: whether he USES the name is owned by
    // section 14 and the store's persona (an affection-off persona says never to), so the note
    // states the fact and commands nothing that could fight either.
    const n = staffName(text);
    if (n) {
      try { eleven.send(JSON.stringify({ type: "contextual_update", text: `[The person who answered gave their name before your recorded question played: ${n}. Do not greet them again.]` })); }
      catch { /* best effort — never break a check over a note */ }
    }
  }

  /**
   * ONE DOOR FOR A THING STAFF SAID, whoever heard it (owner 08-07). Echo's transcriber hears the
   * phone line from the moment the stream opens and keeps hearing it while Charlie is closed; his own
   * session hears only what reaches him. Both arrive here, so a line is written down once, shown on
   * the customer's live screen once, and lands in the same order either way.
   *
   * @param spokenAtEpochMs the moment they started saying it, when we know it. The record does the
   *        arithmetic against this call's own zero; without it the line stamps on arrival.
   */
  function staffSaid(txt: string, spokenAtEpochMs?: number, fromEcho?: boolean, endedAtEpochMs?: number): boolean {
    // Echo wrote a whole line: real words on the line, the proof a rejoin was a person and the one
    // key that reopens a hold which proved wordless (owner 08-18, check 380).
    if (fromEcho && txt && String(txt).trim() && !ended) heardTheWords();
    // The session path's moment comes from OUR ear (the held greeting's start, the energy ear's
    // voice start), so it may still file the hello above the question it preceded (owner 07-31).
    // Echo's stamps are the transcriber's clock and get the one-clock clamp (owner box 08-17) —
    // EXCEPT the store's FIRST line: the greeting genuinely predates our question, its writing can
    // lose the race to the clip's commit (check 373 filed the greeting UNDER the question), and
    // only this one line may ever need to step back over an Agent line. Every later Staff line is
    // an answer and files where it arrived, which is what 372's fix exists to hold.
    theirLastLine = txt;   // the last thing Staff said, for the comeback he answers on his own ears
    if (signoffNudged) armTheWarmWrapUp();   // somebody is still talking: the goodbye can wait
    // EVERY SPOKEN LINE FILES WITH A START AND AN END (owner, 08-17 evening). Echo knows exactly how
    // long the sentence took, so the end rides in with it; a line nobody measured the end of keeps
    // none rather than borrowing a number, and our own ear's stop stands in for those.
    const fresh = recordLine(room, "Clerk", txt, spokenAtEpochMs, undefined, !fromEcho || theirFirstLine == null,
      endedAtEpochMs ?? (fromEcho ? undefined : (lastTheirVoiceStopAtMs > 0 ? lastTheirVoiceStopAtMs : undefined)));
    // THE STORE'S FIRST LINE, KEPT (owner 08-07). It is the one thing that can say what language the
    // person who picked up is speaking, and the recorded question is chosen off it a moment later.
    // First only: everything after it is an answer to us, and a store that greets us in Spanish and
    // then says one English word has still answered the phone in Spanish.
    if (fresh && theirFirstLine == null) {
      theirFirstLine = txt;
      // The other side of check 370's race: the question committed before this line landed, so the
      // hello hand-over waited here. Marked his FIRST, so no pocket or hand-over path that runs
      // after this line can ever give the greeting to Charlie as a turn (owner 08-05).
      if (wantHelloFromEcho && fromEcho) {
        wantHelloFromEcho = false;   // one look: only the first line can be the hello
        if (spokenAtEpochMs != null && clipCommittedAtMs > 0 && spokenAtEpochMs < clipCommittedAtMs) {
          markAsHis(txt);
          helloLineWaiting = { text: txt };
          deliverHelloLine();
        }
      }
    }
    // AND THEIR LATEST LINE RESTARTS HIS THINKING TIME (owner 08-08, check 360). The quiet straight
    // after Staff speak is Charlie thinking, on their LAST turn exactly as much as on their first,
    // and his goodbye is always the last thing he says. Only a line he has not answered yet counts,
    // which `spokeThisSession` is: it goes false when his session reopens and true the instant he
    // speaks, so this can only ever protect a turn he genuinely owes a word on.
    if (fresh && charlieMaySpeak && !spokeThisSession) answeredAtMs = Date.now();
    // DID THEIR LATEST LINE ANNOUNCE A WAIT (the inversion, 08-08). Their newest words decide what
    // the next quiet means: "let me check, hold on" makes it a wait; anything else makes it a beat
    // in the conversation. An announced quiet also cancels the unannounced backstop, because the
    // evidence just changed shape.
    if (fresh) {
      const announcedNow = saidGoingToCheck(txt);
      // THE RECORDED HOLD REPLY plays the moment the announce lands (owner box 08-16 late) — and a
      // fresh line that is NOT an announce ends the covering window, so a reply to real new words
      // is never dropped as a duplicate acknowledgment.
      // THE RECORDED HOLD REPLY still plays the moment their announce lands (owner box 08-16 late).
      // WHAT TAKES HIM OFF THE METER IS NO LONGER THE WORDING (owner, 08-17 late, off check 376,
      // where dropping on their words alone had our own recording read back as Staff returning
      // after 0 seconds and the wait started over). The behaviour rule below owns the drop: the
      // check's own memory says they owe us the answer, their voice has stopped, and nothing is
      // being said to us. That covers silence, music, a phone on a counter and any wording in any
      // language, so no list of phrases decides money any more.
      if (announcedNow && !waitAnnounced) playHoldAck();
      else if (!announcedNow) ackPlayingUntil = 0;
      // THE OTHER MOMENT WE RECOGNISE A HOLD is Staff saying they are stepping away, which is the
      // same phrase family the drop has always read (owner's order, 08-19). From here not one frame
      // of the call reaches Charlie until the wake rule says a real person is talking to us again.
      if (announcedNow) shutCharliesEars("Staff said they were stepping away");
      waitAnnounced = announcedNow;
      if (quietBackstopTimer) { clearTimeout(quietBackstopTimer); quietBackstopTimer = null; }
    }
    // THE JOINED LINE REPLACES ITS PIECES (owner task 08-15). Any tail piece not yet handed goes
    // first, then the whole line is recognized as exactly the pieces already fed and marked his —
    // recorded above like every line, never re-handed, or the same words would reach him twice,
    // the mirror image of the stale hello. A joined line always closes the in-flight turn's pieces,
    // reconnect or not, because it IS that turn, finished.
    if (fromEcho && fresh && reconnectFeed) {
      // THE WHOLE LINE, AS ONE TURN. If the beat above has not run yet, the finished line is here
      // before any piece of it went out, so it goes as itself: one hand-over, the words whole, and
      // no second step on the record 93 milliseconds after the first (check 373).
      if (reconnectFeed.voiceStopped && !reconnectFeed.handed.length) {
        if (pieceCoalesceTimer) { clearTimeout(pieceCoalesceTimer); pieceCoalesceTimer = null; }
        // HIS SESSION MAY STILL BE OPENING (owner, 08-17 late): now that he joins at their pause,
        // their finished line often lands in the moment between the join and his session reporting
        // ready. Handing it there reaches nobody, so it waits in the pocket and the reopen hands it
        // whole the instant he is ready. The feed stays open until it has really been handed.
        if (!eleven || !ready) {
          if (!alreadyHisToAnswer(txt)) missedWhileClosed.push(txt);
          openTurnPieces = [];
          log("reconnect feed: their line landed while he was still opening — held for his first breath");
          return fresh;
        }
        reconnectFeed.handed.push(txt);
        handTheirTurn([txt], "their whole line, written and handed as one turn");
        waitAnnounced = saidGoingToCheck(txt);
        markAsHis(txt);
        log("reconnect feed: the joined line was handed whole, in one turn");
        reconnectFeed = null;
        openTurnPieces = [];
      }
      else if (reconnectFeed.voiceStopped) handPiecesNow("tail pieces handed before their joined line replaced them");
      if (reconnectFeed && reconnectFeed.handed.length && keyOf(txt) === keyOf(reconnectFeed.handed.join(" "))) {
        markAsHis(txt);
        log("reconnect feed: the joined line matches the pieces already handed — absorbed, never re-handed");
        reconnectFeed = null;
      }
    }
    if (fromEcho) openTurnPieces = [];
    // WHAT HE COULD NOT HEAR, KEPT AS WORDS. Only Echo's copy counts: a line the agent's own session
    // delivered is one he already heard. `!ready` too: a line landing while his session is still
    // opening reached no ears either, and the pocket is what the ready hand-over reads.
    if (fromEcho && fresh && (!eleven || onHold || !ready) && !alreadyHisToAnswer(txt) && !playedAtUs.has(keyOf(txt))) missedWhileClosed.push(txt);
    // A LINE SPOKEN INTO THE WAIT THAT FINISHED WRITING JUST AFTER HE RECONNECTED IS STILL HIS TO BE
    // HANDED (owner task 08-15, check 366). Staff's "I did not see any" was spoken while his session
    // was closed, and its writing landed a second after the new session opened — so the old rule
    // below filed it as a line he had heard himself, and he stood silent for 9 seconds until the
    // reader's note told him the answer at 75s. His session opened AFTER those words were spoken, so
    // no audio of them ever reached him: hand them as their turn the moment they land. Only after a
    // words-only reopen (a reopen hands words, never audio; the first join hands the held audio
    // itself, so a pre-join line already reached him and must not be doubled).
    // …UNLESS HE ALREADY ANSWERED IT ON HIS OWN EARS (owner, 08-17 late). A sentence that was
    // still being spoken while his session was open is one he HEARD, however early it started, so
    // handing it once its writing lands would be the same words twice and a second answer.
    else if (answeredFromHisEarsAtMs > 0 && hisEarsBackAtMs > 0
      && (endedAtEpochMs ?? spokenAtEpochMs ?? 0) >= hisEarsBackAtMs) {
      markAsHis(txt);
    }
    else if (fromEcho && fresh && eleven && !onHold && !alreadyHisToAnswer(txt)
      && wordsOnlyReopen && spokenAtEpochMs != null && hisEarsBackAtMs > 0 && spokenAtEpochMs < hisEarsBackAtMs) {
      // His session may still be opening: then the pocket carries it into the reopen hand-over
      // that runs the moment the session reports ready, so the line is never dropped between doors.
      if (!ready) missedWhileClosed.push(txt);
      else handTheirTurn([txt], "the line finished writing after he reconnected");
    }
    // HE HEARD IT HIMSELF is recorded AT THE HANDOVER, never worked out from what happened to be
    // open when Echo's copy landed (owner task 08-15): that inference is exactly what lost the no on
    // check 366. A line is his only when his own session's transcript delivered it (marked in the
    // user_transcript handler) or when we handed it to him ourselves (marked in handTheirTurn).
    if (fresh && !fromEcho && eleven && !onHold) markAsHis(txt);
    // Their hello has arrived, so it goes out FIRST and our question follows it, which is the order
    // the call actually happened in.
    if (heldQuestion) {
      const q = heldQuestion; heldQuestion = null;
      if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
      try { relayLine?.(room, "Clerk", txt); relayLine?.(room, "Agent", q); } catch { /* relay best-effort */ }
    } else if (fresh) {
      try { relayLine?.(room, "Clerk", txt); } catch { /* relay best-effort */ }
    }
    // THE WAKE RULE'S WORDS HALF, tried LAST so the line is already in the pocket: if this is the
    // one that opens his ears, opening them hands him these very words as their turn (owner's
    // order, 08-19). The advert's own words never get here, because the sound half refuses them.
    if (fresh && fromEcho) void maybeWakeCharlie(txt);
    return fresh;
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
    if (onHold && !reconnectingEarly) { log(`connectEleven refused (${segmentWhy ?? "clip path"}): Staff are away — only somebody coming back opens Charlie`); return; }
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
    if (onHold && !reconnectingEarly) { log(`connectEleven refused after the handshake (${segmentWhy ?? "clip path"}): Staff stepped away while we were opening`); return; }
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
      // …and a fresh session has not opened its mouth yet, so the wait rules owe it a first word.
      spokeThisSession = false;
      // THE BILLED SECOND ZERO. The provider meters from session open, so this is where the money
      // clock starts — not at first word. Everything after this is seconds we are paying for.
      markNow(room, "charlieOpenMs");
      charlieOpenedAtMs = Date.now();
      // A NUMBERED STRETCH of this one call, never a separate call (hard rule 1). Ordinary calls
      // have exactly one; a call where he was closed for a wait has two or more.
      const n = openSegment(room, segmentBrain, segmentWhy);
      // THE ONE LINE that says the agent joined. Everything the recorded question and the handover
      // know about this join rides in its detail rather than writing lines of its own.
      emit(room, "charlie_join", n === 1 ? "Charlie joined" : `Charlie reconnected, part ${n} of this check`, { reason: connectReason, segment: n, brain: segmentBrain, why: segmentWhy, notASound: true, ...joinFacts });
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
        // Their transcribed hello first, if it is back and undelivered: it is the earliest thing said.
        deliverHelloLine();
        // Held back while Delta is still asking — openCharlieGate releases them the instant the
        // clip is done, in order, so an early answer reaches him complete instead of half-heard.
        flushPending();
        // THE WAIT HE SLEPT THROUGH. This session was opened because somebody came back, so it starts
        // with no idea a gap happened at all. Told here, before a single held word reaches him.
        //
        // …AND WHAT WAS SAID BEFORE IT (owner 08-05, check 289). A reconnected Charlie is a FRESH
        // session: he came back with no memory of part 1, heard "the 151 booster boxes" and asked
        // whether those come in packs, a question that answer had already settled. So a reopened
        // session is handed the check's own written conversation first, the same record the customer
        // reads, and the settle law can hold because he can finally see what Staff already gave.
        // NEVER after a hand-over: a new person is a fresh start by the owner's own section 5, and
        // the old conversation belongs to somebody who is no longer on the phone.
        // THE STALE POCKET DIES AT EVERY JOIN (owner task 08-15, check 366): on 366 the store's
        // hello from second 3 sat in it the whole call and was handed at the reconnect as "what you
        // missed", instead of the no. On a check where Echo has the words it is HANDED first, then
        // dies (owner box 08-16, fix 1): the clip path no longer carries early audio into his late
        // session — the echo window drops store frames while our own question plays — so a real
        // answer said during the clip lives only in the pocket. The hello cannot ride this: it was
        // marked his the moment its written line was handed to his session.
        // …BUT NOT WHILE THE WAIT IS STILL ON (fix 3, 08-19 night). His session now starts opening
        // on the FIRST SOUND of a voice coming back, before the words have said who it was, so it
        // can report ready in the middle of the store's own recording. Handing him the pocket here
        // would give him the advert as Staff's own words, which is the fault this whole build
        // exists to end. The wait's ending hands it over a moment later, once the words have
        // proved a person and struck out whatever the store played at us.
        if (!gapNote && !onHold) {
          if (echoRooms.has(room) && missedWhileClosed.length) tellCharlieWhatHeMissed();
          missedWhileClosed = [];
        }
        if (gapNote) {
          const g = gapNote; gapNote = null;
          // THIS IS WHERE THE CHECK USED TO GO DEAD (owner + PM, 08-08, off test check 360).
          //
          // The words Echo caught while he was closed were CLEARED right here, and all he got was
          // the note below: the conversation so far, as background. Background never makes him
          // talk. So he came back, heard silence, waited politely, Staff waited too, and two sides
          // waiting is the dead air. The drop rule fired again, the loop repeated, and the store
          // hung up on us at 119 seconds with no goodbye and no answer he had ever "heard".
          //
          // The note stays, because what was said BEFORE the wait really is background: it is there
          // so he cannot re-ask something they already answered. What they said WHILE HE WAS OFF is
          // a different thing entirely. It is the turn he owes a reply to, so it is handed to him
          // as their turn, last and freshest, after the background and after the gap.
          //
          // NOT after a hand-over: there the recording asks the new person again and the old words
          // belong to somebody who is no longer on the phone (his own section 5).
          if (!g.replayed) {
            const lines = (getReceipt(room)?.transcript ?? [])
              .slice(-12)
              .map((l) => `${l.who === "Agent" ? "You" : "Staff"}: ${l.text}`)
              .join(" / ");
            if (lines && eleven && ready) {
              try { eleven.send(JSON.stringify({ type: "contextual_update", text: `[What has already been said on this call, oldest first: ${lines.slice(0, 1200)}. Never re-ask anything Staff already answered here.]` })); }
              catch { /* best effort — never break a check over a note */ }
            }
          }
          tellCharlieAboutTheGap(g.secs, g.newPerson, g.replayed);
          // LAST AND FRESHEST: their own words, as their turn, so he answers them out loud.
          if (g.replayed) missedWhileClosed = [];
          const handedThePocket = !g.replayed && echoRooms.has(room) && missedWhileClosed.length > 0
            ? tellCharlieWhatHeMissed() : false;
          // …and the pieces of the turn still being written, when the ear already heard their voice
          // stop while this session was still opening (owner task 08-15). ONE TURN, NEVER TWO
          // (owner, 08-17 late): now that his session opens at their pause, their whole line often
          // lands while he is still opening, and the pieces waiting here are the SAME sentence he
          // has just been handed out of the pocket. Handing both put it to him twice.
          if (handedThePocket) openTurnPieces = [];
          else handPiecesNow("pieces were waiting when his session came up");
        }
      } else if (m.type === "audio") {
        const b64 = m.audio_event?.audio_base_64;
        // He is warming up behind the question, not talking over it. Nothing he produces before the
        // gate opens reaches the line.
        if (b64 && !charlieGateOpen) { log("delta: agent tried to speak during the clip, suppressed"); }
        // HIS NOTE NEVER REACHES THE LINE (owner, 08-19). The words were judged the moment they
        // arrived, one turn ago at most; the frames of that turn are simply not sent, so the store
        // hears silence and his turn counts as skipped. His next turn clears it.
        else if (b64 && noteTurnSilenced) { /* a note to himself: silence plays instead */ }
        // HIS REPLY TO THEIR HELLO NEVER REACHES THE LINE. The recording already answered it, and this
        // is the whole fault: it is a fresh greet-back plus the question again, and on a short clip it
        // used to escape and the store answered it (check 286). Dropped, not queued — a delay would
        // only put the same duplicate on the line a second later. Recorded ONCE, because a check where
        // it was silently dropped looks identical to a check where he never tried (rule 8).
        // HE HEARD THEM HIMSELF, SO HIS ANSWER GOES OUT (owner, 08-17 late, off check 374: Staff
        // finished at 70.8 seconds and his voice did not start until 76.6, six seconds of a person
        // standing on a silent line). At a comeback his session is opened while Staff are still
        // talking, so he hears the end of their sentence with his own ears and answers it. We were
        // throwing that answer away and waiting for Echo's writing to reach us instead: the ear
        // called their voice on for 2.2 seconds past the sound, the writing landed 3.2 seconds
        // past it, and only then did we ask him for a second answer. His own reply is let out when
        // his session has been listening long enough to have heard them finish, and the written
        // words are then his, never a fresh turn.
        // HIS REPLY IS BUILT AND HELD, NEVER DROPPED (owner's order, 08-19 night). He was handed
        // their words the moment Echo wrote them so he could be thinking; his sound waits right here
        // until the wake check says a person, and then goes out whole. If it says the store played
        // that at us, every one of these chunks is thrown away and the store hears nothing.
        else if (b64 && !charlieMaySpeak && earlyTurn && earlyTurn.fed.length) {
          if (earlyTurn.heldAudio.length < MOST_HELD_CHUNKS) earlyTurn.heldAudio.push(b64);
        }
        else if (b64 && !charlieMaySpeak && reconnectFeed && hisEarsBackAtMs > 0
                 && Date.now() - hisEarsBackAtMs >= HEARD_ENOUGH_MS) {
          emit(room, "unknown", "Charlie answered what he heard himself, without waiting for the words to be written down",
            { step: "answered_from_his_ears", listenedMs: Date.now() - hisEarsBackAtMs });
          if (pieceCoalesceTimer) { clearTimeout(pieceCoalesceTimer); pieceCoalesceTimer = null; }
          // Everything of theirs already written is his as of now, so the writing landing behind
          // him is absorbed instead of handed back as a turn he still owes.
          for (const said of openTurnPieces) markAsHis(said);
          if (theirLastLine) markAsHis(theirLastLine);
          reconnectFeed = null;
          openTurnPieces = [];
          missedWhileClosed = [];
          answeredFromHisEarsAtMs = Date.now();
          letHimAnswer("he heard them himself while his session was open");
          twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
          fanout(room, b64, "agent");
          const msOwn = Math.ceil((b64.length * 3) / 4 / 8);
          agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + msOwn;
          hisVoiceOutAtMs = Date.now();
          addMs(room, "speakingMs", msOwn);
          charlieSpoke = true; spokeThisSession = true; charlieSpokenMs += msOwn;
        }
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
        //
        // UNLESS HE OWES THEM A WORD (owner + PM, 08-08, off test check 360). Staff spoke, he was
        // handed their turn, and the quiet straight afterwards is HIM thinking about it, which is
        // why the close rule holds him through it. Somebody IS there to hear him: they are standing
        // at the counter waiting for his reply. Throwing his answer away here would leave the check
        // exactly where it was, with two sides waiting and nobody talking, and it is the last place
        // that dead air can still come from.
        else if (b64 && onHold && !(charlieMaySpeak && !spokeThisSession && answeredAtMs > 0)) { /* suspended: not spoken onto the line */ }
        // Our recorded hold reply already answered the announce; his own generated version would be
        // the same sentiment twice on the line (owner box 08-16 late).
        else if (b64 && Date.now() < ackPlayingUntil) { /* covered by the recording, dropped */ }
        else if (b64 && twilio.readyState === 1) {
          // HIS TURN STARTS with its first frame on the line: the reply gap is measured from their
          // voice stopping, or from the words being handed to him, whichever came last.
          if (!hisTurnOpen) {
            hisTurnOpen = true;
            hisTurnAudioStartMs = Date.now();
            hisTurnLineWritten = false;
            hisTurnStartSpent = false;
            hisEndWaitingForWords = 0;   // a turn whose words never came never stamps the next line
            // THE SILENCE STAFF REALLY STOOD IN (owner, 08-17 late, off check 374, where the row
            // read 3 seconds while Staff heard 5.8). It counts from the END OF THEIR VOICE to his
            // first sound, and nothing else: not from when their words were handed to him, which
            // is our own delay and hid three of those seconds, and not from our ear's stop when
            // Echo's own writing says the sound ended earlier. Echo measures the end off the audio
            // itself, so it is the truer end; the ear stands in when there are no words at all.
            const theirEnd = lastLineEndEpoch(room, "Clerk");
            const anchor = theirEnd != null && theirEnd > lastHoldEndAtMs ? theirEnd : lastTheirVoiceStopAtMs;
            const gapMs = anchor > 0 ? Date.now() - anchor : 0;
            if (gapMs > 0 && gapMs < 60_000 && gapMs > worstAnswerGapMs) {
              worstAnswerGapMs = gapMs;
              // Stamped the moment it is measured, because the close-time stamp below lost a race
              // on check 372: the carrier's status callback closed the receipt first and the row
              // never wrote. The sheet reads the worst across every stamp, so a new worst simply
              // writes again and the last one standing is the check's slowest reply.
              try { emit(room, "unknown", "Charlie's slowest reply so far", { step: "gaps", answerGapWorstMs: worstAnswerGapMs }); } catch { /* the stamp is best-effort */ }
            }
          }
          twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: b64 } }));
          fanout(room, b64, "agent");
          // Extend the echo-gate window by this chunk's real playout time (μ-law 8kHz = 8 bytes/ms);
          // Twilio plays queued audio sequentially, so chunks extend the window back-to-back.
          const ms = Math.ceil((b64.length * 3) / 4 / 8);
          agentPlayingUntil = Math.max(agentPlayingUntil, Date.now()) + ms;
          hisVoiceOutAtMs = Date.now();
          // HIS LINE'S END, as the sound goes out (owner, 08-17 evening: every spoken line files
          // with a start and an end), AND IT LANDS ON HIS OWN LINE (owner, 08-17 late, off check
          // 374). His sound starts before the provider sends us the words, so stamping whatever
          // line was last written put his end on the line BEFORE it: the hold reply of second 23
          // was marked as ending at 81.3, and his question of 76.6 as ending at 90.0 on a call
          // that ended at 88.0. While his words are still on their way the end waits here and is
          // stamped the moment they land.
          if (hisTurnLineWritten) stampLineEnd(room, "Agent", agentPlayingUntil);
          else hisEndWaitingForWords = agentPlayingUntil;
          addMs(room, "speakingMs", ms); // SPEAKING = audio that really played out, not a guess
          charlieSpoke = true;           // from here there is no live model swap, whatever fails
          spokeThisSession = true;       // …and the quiet after this is theirs again, not his
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
          // …UNLESS THE WAKE CHECK IS STILL PROVING THEM (owner, 08-19 night). Their words were
          // handed to his session on purpose while the store may still be playing a recording at
          // us, and the ONE thing that opens his mouth in that window is the wake check saying a
          // person. His session reporting those same words back must never do it.
          if (earlyTurn && earlyTurn.fed.length) { /* his mouth stays shut until the wake check speaks */ }
          else if (helloAlreadyAnswered) { helloAlreadyAnswered = false; log("delta: that was their hello, the recording has it, still holding him"); }
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
        // ECHO OWNS THE TRANSCRIPT NOW (owner 08-07). While the transcriber is listening on the phone
        // line itself, THIS session's copy of the store's words is not written down and not shown:
        // it would be the same sentence twice, and Echo's copy is the one that exists whether Charlie
        // is open or closed. Everything else this handler does with the words is untouched, because
        // they are how Charlie decides what to do next. With no transcriber, this is the record and
        // the check behaves exactly as it always has.
        // HIS SESSION TRANSCRIBED IT, SO HIS SESSION HEARD IT (owner task 08-15). This is the one
        // honest record of "he heard this himself": written at the moment his own session delivered
        // the words, never worked out from what happened to be open when Echo's copy landed. It is
        // what stops a line he answered live from being handed back to him as new.
        if (txt && echoRooms.has(room)) markAsHis(String(txt));
        if (txt && !echoRooms.has(room)) {
          const spokenAt = greetingStartedAtEpochMs || takeVoiceStart();
          if (greetingStartedAtEpochMs) dropVoiceStartsUpTo(greetingStartedAtEpochMs + 500);
          greetingStartedAtEpochMs = 0;
          staffSaid(String(txt), spokenAt);
        }
        // Flipped AFTER the voicemail test below has had its one look at this line, so the store's
        // FIRST words are the only ones that may end a check as a machine (round 2, item 3).
        const wasStoreFirstLine = txt ? !storeHasSpoken : false;
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
        // …UNLESS HIS SOUND IS ONLY BEING HELD (owner, 08-19 night). A reply built while the wake
        // check proves a person really is spoken, a moment later, so its words are kept here and
        // written down at the moment the sound goes out — and thrown away with it if it never does.
        if (txt && !charlieMaySpeak && earlyTurn && earlyTurn.fed.length) {
          earlyTurn.heldText = [String(txt)];
          earlyTurn.heldAudio = [];   // a fresh reply supersedes the one he was part-way through
          return;
        }
        if (txt && (!charlieGateOpen || !charlieMaySpeak)) return;
        // A NOTE TO HIMSELF IS NEVER A THING TO SAY OUT LOUD (owner, 08-19, off checks 398 and 399:
        // the store's advert was handed to him as Staff and he described it onto the line). Judged
        // on HIS words only, so a real answer from Staff can never be taken off the line by it. The
        // decision is made here, before a single frame of that turn is sent, and the record carries
        // what almost played so the sheet tells the truth about it.
        noteTurnSilenced = !!txt && isPrivateNote(String(txt));
        if (noteTurnSilenced) {
          emit(room, "unknown", "Charlie started to say a note to himself, so it was silenced and never played",
            { step: "note_silenced", text: String(txt).slice(0, 200) });
          log(`note silenced: he began "${String(txt).slice(0, 60)}" and the store heard nothing`);
          return;
        }
        // HIS OWN VERSION, COVERED BY A RECORDING OF OURS (owner's order, 08-19). While a recording
        // covers the line (`ackPlayingUntil`), his frames are dropped at the audio door — so the
        // words of a line Staff never heard are not a line either: not recorded, not relayed, and
        // the rest of the turn's sound silenced with them (check 404 wrote his re-worded set
        // question down as if Staff had heard it, and its straddling tail could leak past the
        // window). A genuine reply can never land here, because any fresh real Staff line clears
        // the window before he answers it.
        if (txt && Date.now() < ackPlayingUntil) {
          noteTurnSilenced = true;
          const hisGoodbye = wrappedUp(String(txt));
          emit(room, "unknown", hisGoodbye
            ? "Charlie's own goodbye was covered by the recording and never played"
            : "Charlie's own version was covered by the recording and never played",
            { step: hisGoodbye ? "goodbye_covered" : "covered_by_recording", text: String(txt).slice(0, 200) });
          log(`covered: his own version ("${String(txt).slice(0, 50)}") never played, the recording owns the line`);
          return;
        }
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
          // THE GOODBYE CAN LAND AFTER THE QUIET HAS ALREADY STARTED (owner 08-07, off check 356).
          // The rule that ends a signed-off check lived only at the START of a wait, so a goodbye
          // said as the line was already going quiet found the wait open and nothing looked again:
          // he thanked them at 59 seconds and we sat on the line until the STORE hung up at 145,
          // which billed a third whole minute and put that check's margin at 51 percent. Same
          // ruling, second door.
          // The line being quiet is read off the EAR, not off our hold state: under the inversion
          // an unannounced quiet never becomes a hold, and the goodbye landing inside one must
          // still put the phone down (check 356's rule, third door).
          if (signoffNudged && ((onHold && (holdReason === "quiet" || holdReason === "room"))
            || (!onHold && (convEar?.reason === "quiet" || convEar?.reason === "room")))) hangUpAfterGoodbye(Date.now());
        }
        // WHICH LANGUAGE HE SPOKE, counted line by line off the same judge the map uses — never a
        // second opinion about what language a sentence is in.
        if (txt) { const l = guessLanguage(String(txt)); if (l === "es") spokeEs++; else if (l === "en") spokeEn++; }
        // HIS LINE IS FILED WHERE HIS SOUND STARTED (owner, 08-17 late). The provider sends his
        // words a moment after his voice is already going out, so the record read the goodbye as
        // starting at 87.6 on check 374 when Staff heard it start at 86.7. The turn's own first
        // frame is when they heard him, so that is the moment it files at.
        // ONE LINE, ONE TRUE START (owner, 08-17 late, off check 376: his goodbye was written with
        // the very same start as the question before it, because both landed inside one turn of his
        // audio). A turn's first sound belongs to the FIRST line of that turn; anything he says
        // after it files at its own moment, and gets its own end when its own sound plays.
        const hisStart = (hisTurnOpen && !hisTurnStartSpent && hisTurnAudioStartMs > 0 && Date.now() - hisTurnAudioStartMs < 20_000)
          ? hisTurnAudioStartMs : undefined;
        hisTurnStartSpent = true;
        if (txt && recordLine(room, "Agent", String(txt), hisStart)) {
          hisTurnLineWritten = true;
          hisEndWaitingForWords = 0;
          if (hisEndWaitingForWords > 0) { stampLineEnd(room, "Agent", hisEndWaitingForWords); hisEndWaitingForWords = 0; }
          try { relayLine?.(room, "Agent", String(txt)); } catch { /* relay best-effort */ }
        }
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
        // His own session cut the reply it was building, so what is held is a half sentence.
        if (earlyTurn) { earlyTurn.heldAudio = []; earlyTurn.heldText = []; }
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
      // ONE LINE FOR ONE MOMENT. A mapping check has already found the person and written it down
      // before it hands the live call over, so saying it again here would put the same moment on the
      // record twice. The stamp itself is first-write-wins and cannot double; the line can, so it is
      // only written when nobody has written it yet. Everything below runs either way.
      if (!getReceipt(room)?.meters?.humanMs) emit(room, "human_detected", "Staff greeting");
      markNow(room, "humanMs");
      // From here somebody is on the line, so from here it is worth knowing when they stop being on
      // the line. The meter flips from "never checked" to a real measured zero at the same moment.
      startMeter(room, "holdMs");
      convEar = new ConversationEar({
        // THE EAR SPEAKS IN ITS OWN SECONDS, so its moments are turned into the call's own clock
        // right here at the door, once, instead of some callers backdating and others not.
        holdStart: (reason, atMs) => beginHold(reason, earMoment(atMs) ?? Date.now()),
        holdEnd: (gapMs, newPerson, atMs) => endHoldOnEvidence(gapMs, newPerson, earMoment(atMs) ?? Date.now()),
        // NOBODY IS COMING BACK. Not the same as stepping away to check a shelf: this is a handset
        // left on a counter. Recorded, and the give-up cap owns what to do about it.
        deadAir: (quietMs) => emit(room, "unknown", `Nothing has been said for ${Math.round(quietMs / 1000)}s, the line is dead air`, { deadAirSec: Math.round(quietMs / 1000) }),
        // ECHO RECOGNISED THE MUSIC (owner, 08-18 night). Written down the moment the ear knows,
        // about a second in, and dated to the music's own first note. It is a REPORT and nothing
        // else: the wait it belongs to is still declared on the one drop number, so nothing about
        // when Charlie's meter stops rides on this line being here.
        musicHeard: (afterMs, atMs) => {
          emit(room, "unknown", "Echo recognised hold music", { step: "music_heard", afterMs, atMs }, earMoment(atMs));
          // THE MOMENT WE RECOGNISE THE HOLD, HIS EARS SHUT AND HIS METER STOPS (owner, 08-19
          // evening: check 406 shut his ears and still ran 42 seconds, "this is not passed").
          // Shutting his ears only stops him HEARING the advert; the meter runs until he is dropped
          // off the call, and on the advert scene no wait is ever declared, because an advert is a
          // voice and the listening rules can never refuse one. So this report, which is the one
          // moment the engine knows the line has gone to music, now declares the wait itself.
          if (Date.now() - earsBackAtMs >= MUSIC_TAIL_GRACE_MS) shutCharliesEars("Echo recognised hold music", earMoment(atMs) ?? Date.now());
          else log("music heard again, but somebody has just come back: that is the music's own tail, not a new wait");
          if (!onHold && Date.now() - earsBackAtMs >= MUSIC_TAIL_GRACE_MS) {
            musicRecognisedHold = true;
            beginHold("music", earMoment(atMs) ?? Date.now());
          }
        },
        // …and the sound half of the wake rule. It is a REPORT, exactly like the music one: what
        // opens his ears again is this AND Echo's words together (`maybeWakeCharlie`).
        personSound: (spokeMs, atMs) => {
          personSoundAtMs = Date.now();
          if (earsShutAtMs > 0) log(`ears: the sound says somebody is talking (${spokeMs}ms of speech, from ${atMs}ms)`);
          // THE RECONNECT STARTS ON THE SOUND, THE TURN WAITS FOR THE WORDS (fix 3). Only this
          // report ever starts it: it is the ear's own word that the sound broke at word scale with
          // real silence in its gaps on a line the music has left, which is never other noise.
          if (onHold && musicRecognisedHold && !eleven && !reconnectingEarly && !ended) {
            reconnectingEarly = true;
            // …AND FROM HERE HE IS FED THEIR WORDS AS ECHO WRITES THEM, with his mouth held shut
            // until the wake check proves a person (owner, 08-19 night).
            earlyTurn = { fed: [], heldAudio: [], heldText: [] };
            emit(room, "unknown", "A voice came back, so Charlie's session started opening while we read the words",
              { step: "reconnect_early", spokeMs, notASound: true });
            log("reconnect: starting his session on the sound, his turn waits for the words");
            void connectEleven("a voice came back and the words are being read");
            if (earlyReconnectTimer) clearTimeout(earlyReconnectTimer);
            earlyReconnectTimer = setTimeout(() => {
              earlyReconnectTimer = null;
              dropTheEarlySession("no words proved a person");
            }, EARLY_RECONNECT_MS);
          }
        },
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
      // HIS SESSION NO LONGER OPENS HERE ON A CHECK WHERE ECHO HAS THE WORDS (owner box 08-16,
      // fix 1, off check 368: he was metered through all 4 seconds of his own question). The 08-01
      // reason for opening this early was that his session was our only transcriber, and audio
      // held for a late session came back slurred and welded (check 229). Echo owns the words now:
      // the greeting reaches him as Echo's written line, and whatever Staff say during the clip is
      // buffered and paced into his session when the prewarm opens it, 800ms before the question
      // ends — so he bills from the clip's end, not from the person test. A check without Echo
      // keeps the early open, because there his session still is the only transcriber.
      if (!echoRooms.has(room)) {
        log("delta: person heard, opening his ears now and waiting for them to finish before asking");
        void connectEleven();
      } else {
        log("delta: person heard; Echo has the words, so his session waits for the prewarm and bills from the clip's end");
      }
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
    // THE PHONE COMPANY SENDS MORE THAN THE SOUND (owner 08-07). Every media message carries the
    // frame's own place in the stream: `timestamp`, milliseconds since the stream started, and
    // `sequenceNumber`, which counts the messages. Both were thrown away because this type never
    // declared them, and they are exactly what puts a spoken line at the second it was really said.
    let m: { event?: string; start?: { streamSid?: string; customParameters?: { room?: string } };
      media?: { payload?: string; timestamp?: string; track?: string }; sequenceNumber?: string; mark?: { name?: string } };
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.event === "start") {
      streamSid = m.start?.streamSid || streamSid;
      if (!room && m.start?.customParameters?.room) { room = m.start.customParameters.room; hangSignoffDoor(); } // Twilio puts <Parameter> here; the check has its name NOW, so its door hangs now
      if (!ctx && room) ctx = contexts.get(room);
      adoptTuning(); // the Admin's numbers catch up with the room — the socket connected bare (check 364)
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
        // A CHECK THAT OPENS CHARLIE STRAIGHT AWAY IS STILL A CHECK THAT JUST REACHED STAFF
        // (owner 08-06). A mapping check hands the live call over once it has ALREADY found the
        // person, so it comes in here instead of waiting for one — and this branch used to jump
        // straight to opening Charlie, skipping everything the waiting path does at that moment.
        // Four things went missing with it: Delta never asked, so Charlie opened cold and said the
        // first line himself (the owner heard it on the Fun store check: Staff greeted at 11
        // seconds, his first words landed at 17); the moment Staff answered was never stamped and
        // the hold meter never started, so a dropped Charlie could go unmeasured; the note saying
        // Delta did not play was never written; and the give-up cap was never armed, so a check
        // could sit paying for silence.
        //
        // It now runs the SAME function the waiting path runs when it finds a person. Not a copy:
        // one moment, one piece of code, two ways of arriving at it. `triggerConnect` opens Charlie
        // immediately either way, so the mapping rule that Charlie opens right away is untouched,
        // and taking a transfer is refused elsewhere and untouched too.
        // ONLY a check that found the person itself and handed the live call over. Charlie taking
        // over mid conversation (the Delta barge) is a different moment: Delta asked there already,
        // so running this would arm a hold meter mid answer and write a note saying Delta never
        // played on a check where it did. That one keeps opening Charlie straight, as it always has.
        if (ctx?.staffAlreadyOn) {
          log(`twilio start room=${room.slice(0, 8)} -> Staff are already on the line`);
          triggerConnect("human");
        } else {
          log(`twilio start room=${room.slice(0, 8)} ctx=${!!ctx} -> connectEleven`);
          connectEleven();
        }
      }
    }
    else if (m.event === "media" && m.media?.payload) {
      frames++;
      const b64 = m.media.payload;
      // The carrier numbers its media messages; one that arrives out of order is skipped.
      const seq = Number(m.sequenceNumber ?? 0);
      if (seq && seq <= lastSeq) return;
      if (seq) lastSeq = seq;
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
      // WHEN THEY STARTED TALKING, kept for the line that will carry those words (owner 08-06). Read
      // off the SAME frames, the same threshold and the same ringing test the meter and the ear
      // already use, so nothing new listens to the call. Our own audio is excluded: the agent's
      // voice coming back off the line is not the store starting a sentence.
      // IT HAS TO BE A REAL VOICE, NOT OUR OWN TAIL. Measured on check 347: the first line back was
      // filed at 12.4s, exactly where our own recording's audio was calculated to end, because the
      // carrier plays out a little behind our own count of the bytes we sent it. So a start is only
      // kept once the talking has lasted as long as this file already demands before it will call
      // something a human, and the moment kept is the FIRST frame of that run, not the moment it
      // passed the bar. A burst too short to clear it leaves the line stamped on arrival, as before.
      if (Date.now() >= agentPlayingUntil + ECHO_TAIL_MS && frameEnergy(b64) > VOICE_THRESH && toneShare(b64) < 0.45) {
        if (!theirVoiceOn) { theirVoiceOn = true; theirVoiceRunStartedAt = Date.now(); theirVoiceRunFrames = 0; }
        if (++theirVoiceRunFrames === VOICE_FRAMES) {
          theirVoiceStarts.push(theirVoiceRunStartedAt);
          if (theirVoiceStarts.length > 40) theirVoiceStarts.shift();
        }
        theirQuietFrames = 0;
      } else if (theirVoiceOn && ++theirQuietFrames >= VOICE_GAP_FRAMES) {
        theirVoiceOn = false; theirQuietFrames = 0;
        // The sound's real end, backdated past the confirm gap: the anchor every reply gap measures
        // from (owner box 08-16 late: every metered second belongs to somebody by name).
        lastTheirVoiceStopAtMs = Date.now() - VOICE_GAP_FRAMES * 20;
        hisTurnOpen = false;
        // THE EAR HEARD THEIR VOICE STOP, and during a reconnect feed that is what opens his turn
        // (owner task 08-15): the pieces already landed are handed now, and the writer's one second
        // end-of-turn quiet is never waited for. The same sound test that stamps every line's start.
        // …AND THE METER GOES OFF WHEN IT IS THEIR TURN AND NOBODY IS SAYING ANYTHING TO US (owner,
        // 08-17 late, the behaviour rule: no wording decides money). The check's own memory says
        // they owe us the answer, which is our question asked and no answer read off the record
        // yet; the ear says their voice has stopped; and our own audio has finished playing, so
        // the silence is really theirs. One short beat guards a person drawing breath mid answer,
        // and anything said into it calls the whole thing off. Silence, hold music, a handset on a
        // counter and every language read the same, because none of them are read at all.
        armTheMeterOff("their voice stopped and it is their turn");
        if (reconnectFeed && !reconnectFeed.voiceStopped) {
          reconnectFeed.voiceStopped = true;
          // ONE HAND-OVER, EVER (owner, 08-17 evening, off check 373: the handed words step printed
          // twice at 73 seconds, 93 milliseconds apart, because the ear handed the pieces it had
          // and the joined line handed the tail straight after). The ear still opens his turn; it
          // just waits one beat first, so the last piece or the whole written line rides the SAME
          // turn. The beat is the same 300 milliseconds the pieces already wait for each other.
          armTheHand("the ear heard their voice stop");
        }
      }
      // THEY ARE ANSWERING: his mouth opens on their voice, not on a clock (the second gate). While
      // our own question is still playing only a real barge-in counts, because the line is carrying
      // us; after it, ordinary speaking energy does. A ring burst is not somebody answering. The
      // count leaks rather than resets so the gaps between their words do not undo it.
      // …EXCEPT during a reconnect feed, where the turn opens on their voice STOPPING, not starting
      // (owner task 08-15): at a reopen Staff are already mid sentence, and opening him on the start
      // of it would have him talk before their words have reached him.
      // Somebody is speaking to us again, so the quiet that was about to stop the meter is over.
      if (theirVoiceOn && meterOffTimer) { clearTimeout(meterOffTimer); meterOffTimer = null; }
      if (!charlieMaySpeak && !reconnectFeed) {
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
          // THE SPANISH DELTA, DECIDED HERE (owner 08-07). Both recordings were made before the
          // dial; which one plays is decided at this instant, off the WORDS of the store's own first
          // line, because this is the first moment we have heard them at all. Never off the sound:
          // what language somebody is speaking is meaning, and the ear cannot judge meaning, which
          // is the same law the wrong-department save runs on.
          //
          // Only ever the store's FIRST line, and only when we have one. Echo writes lines from the
          // moment of pickup and their greeting ended a moment ago, so it is normally here; if it is
          // not, the English question asks, which is exactly today's behaviour.
          const inSpanish = !!ctx?.openingClipEs && staffSpokeSpanish(theirFirstLine);
          const c = inSpanish ? ctx!.openingClipEs! : pendingClip;
          pendingClip = null;
          if (inSpanish) { log(`delta: they answered in Spanish, asking in Spanish`); emit(room, "unknown", "Staff answered in Spanish, so the question played in Spanish", { step: "delta_language", language: "es", heard: String(theirFirstLine || "").slice(0, 120) }); }
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
      // A RECOGNISED HOLD TAKES HIS EARS, NOT JUST HIS MOUTH (owner's order, 08-19). `onHold` is a
      // wait the runtime declared; `earsShutAtMs` is the moment we RECOGNISED one — the ear's music
      // report or Staff's stepping-away words — which on the advert scene is the only moment there
      // is, because an advert is a voice and no wait is ever declared. Either way not one frame of
      // the call goes to his session from here. Echo is a separate listener on the pickup fork and
      // is untouched: every word is still written down, and the pocket hands them to him as their
      // turn when his ears come back.
      else if (onHold || earsShutAtMs > 0) {
        if (heldWords.length || frameEnergy(b64) > VOICE_THRESH) { heldWords.push(b64); if (heldWords.length > 250) heldWords.shift(); }
        // THE WASTE, COUNTED WHILE IT HAPPENS (owner's order, 08-19, fix 4). His session is open and
        // billing while the store plays music at us; this is the number that makes that visible on
        // every check's sheet instead of hiding inside a passing meter.
        if (eleven && ready) addMs(room, "awakeOnHoldMs", 20);
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
              greetingStartedAtEpochMs = Date.now();
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
    signoffDoors.delete(room); staffDoors.delete(room); pieceDoors.delete(room);
    if (closeWhenReady) { clearTimeout(closeWhenReady); closeWhenReady = null; }
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; } if (heldQuestion) { try { relayLine?.(room, "Agent", heldQuestion); } catch { /* best effort */ } heldQuestion = null; } try { convEar?.lineGone(); } catch { /* recording is best-effort */ } preRoll.length = 0; pending.length = 0; missedWhileClosed = []; /* hard rule 3: no store audio outlives the call */ activeCalls = Math.max(0, activeCalls - 1);
    // WHERE THE WAITING WENT, stamped once as the line closes, so the sheet can grade the slowest
    // reply by name (owner box 08-16 late). Only when something was measured; an old check reads
    // exactly as it always did.
    if (worstAnswerGapMs > 0) { try { emit(room, "unknown", "Charlie's slowest reply on this check", { step: "gaps", answerGapWorstMs: worstAnswerGapMs }); } catch { /* the stamp is best-effort */ } }
    log(`twilio close (frames in=${frames})`); signalEnd(); dtmfTimers.forEach(clearTimeout); clipTimers.forEach(clearTimeout); if (prewarmTimer) { clearTimeout(prewarmTimer); prewarmTimer = null; } if (giveUpTimer) { clearTimeout(giveUpTimer); giveUpTimer = null; } if (holdCapTimer) { clearTimeout(holdCapTimer); holdCapTimer = null; } if (ringWaitTimer) { clearTimeout(ringWaitTimer); ringWaitTimer = null; } if (quietBackstopTimer) { clearTimeout(quietBackstopTimer); quietBackstopTimer = null; } if (handoverTimer) { clearTimeout(handoverTimer); handoverTimer = null; } if (answerWaitTimer) { clearTimeout(answerWaitTimer); answerWaitTimer = null; } if (wordlessRejoinTimer) { clearTimeout(wordlessRejoinTimer); wordlessRejoinTimer = null; } if (eleven) eleven.close(); /* the context is NOT deleted here: Twilio can reconnect a blipped stream mid-call, and the fresh socket must still find it. The 30-minute leak guard owns cleanup. */ });
}

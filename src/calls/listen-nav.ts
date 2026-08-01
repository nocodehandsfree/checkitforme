// ██ THIS FILE IS THE EAR. THERE IS ONLY ONE. DO NOT BUILD ANOTHER. ██
//
// If you are here because you need to know what is happening on a live call — whether a menu has
// stopped talking, whether a person answered, whether they walked away, whether the line is ringing
// — it is ALREADY BUILT, below, and you should import it rather than write your own.
//
// On 2026-07-28 two engineers working from the same spec each started building their own audio
// detection. Two ears drift: they disagree about what counts as sound, and then nobody can explain
// why one call behaved differently from another. `scripts/test-runtime-gates.ts` now FAILS THE BUILD
// if audio decoding appears in any file other than this one and the (machine-locked) bridge, so this
// is not a request.
//
// WHAT IS ALREADY HERE, and what each thing answers:
//   frameEnergy(frame)      is there any sound on the line at all?
//   toneShare(frame)        is that the phone network's own ring/busy tone, rather than a voice?
//                           (published frequencies, measured — never guessed from loudness)
//   PromptDetector          a recorded menu prompt just ENDED. Also exposes how long it talked for
//                           and how long it has been quiet since.
//   looksLikeAPerson(…)     a HUMAN answered instead of the menu we mapped — so stop pressing keys.
//   PickupEar               what the line is doing right now: quiet · ringing · music · a voice.
//   ConversationEar         mid-conversation: they walked away (quiet), hold music, a transfer, they
//                           came back (and whether it may be a different person), extended dead air,
//                           and the line going away entirely.
//
// Every threshold in here is a FALLBACK ONLY — the live values come from the `call_tuning` setting
// the Admin reads and are passed in, because all of them have to be tuned against real calls.
//
// If this file genuinely cannot answer your question, ADD IT HERE and unit-test it here. Do not
// start a second listener.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// LISTENING NAVIGATION — fire each mapped step when the recording actually STOPS TALKING,
// instead of at a fixed second on a stopwatch.
//
// WHY (owner 07-24/25): the mapped recipe knows WHAT to press/say; it was the WHEN that drifted.
// A stopwatch tuned on one store fires mid-greeting at the next one — CVS said "no" at 26s before
// the healthcare question was asked, Walmart pressed 9 at 4s inside the greeting, Target pressed
// 2@8/2@16 at a store whose greeting runs 8s longer than the mapped one. Measured 07-24: Target
// greetings end anywhere from 9s (Austin) to 20s (Topanga). No single second is right for all.
//
// COST: $0. This adds NO speech recognition and NO model. It reads the audio Twilio ALREADY forks
// to us for live-listen (<Start><Stream> -> /twilio-media, running from the instant of pickup) and
// does arithmetic on frame energy. Twilio's own speech recognition was measured at $0.02 per 15s
// interval (~8.6c/call) — far past the whole 5c ceiling — so it is deliberately not used here.
//
// HOW A STEP FIRES: Twilio REST call-update replaces the call's TwiML mid-call. The <Start><Stream>
// fork SURVIVES TwiML replacement (documented trap), so the audio keeps flowing across every update
// and we never re-add the fork (that would double every listener's audio).
//
// Deliberately dependency-free (no config, no db) so the timing rules stay unit-testable without
// booting the app: scripts/test-listen-nav.ts.

export interface NavStep {
  action: "press" | "say"; value: string; atSec: number;
  /** WHICH recording this step follows, learned during mapping (1-based). The owner's rule made
   *  data: "say general" belongs after the store finishes reading its options, not at second 41.
   *  When present it becomes the trigger — the step waits for that many completed recordings — and
   *  the learned second stays on as the floor and the backstop. Absent = today's behaviour. */
  afterPrompt?: number;
}

/** How early a step may fire relative to its learned time. A step becomes ELIGIBLE at
 *  (learned - LEAD) and then waits for the next real prompt boundary. 12s covers the measured
 *  store-to-store greeting spread (9s..20s on Target) without letting step 2 fire on the greeting. */
const LEAD_SEC = 12;
/** If no boundary is heard by (learned + GRACE), fire on the clock anyway — exactly today's
 *  behaviour. Listening can delay a step, never lose it. */
const GRACE_SEC = 15;
/** Minimum gap between consecutive steps, so one long pause can't fire two steps at once. */
const MIN_STEP_GAP_SEC = 2;

// ---- audio ---------------------------------------------------------------------------------
// Twilio media frames are base64 μ-law 8kHz, 20ms (160 bytes) per frame.
// Decoder copied byte-for-byte from the bridge's ear (src/voice/bridge.ts ulawByteToLinear) so the
// two ears cannot disagree about what counts as sound on the line.
const ULAW_BIAS = 0x84;
function ulawByteToLinear(u: number): number {
  u = ~u & 0xff;
  let t = ((u & 0x0f) << 3) + ULAW_BIAS;
  t <<= (u & 0x70) >> 4;
  return (u & 0x80) ? (ULAW_BIAS - t) : (t - ULAW_BIAS);
}
/** Mean absolute amplitude of a frame — the same "is anyone talking" measure the bridge's ear uses. */
export function frameEnergy(b64: string): number {
  let buf: Buffer; try { buf = Buffer.from(b64, "base64"); } catch { return 0; }
  if (!buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += Math.abs(ulawByteToLinear(buf[i]));
  return sum / buf.length;
}

// ---- Call-progress tone detection (ringback / busy / dial tone) ----
// The phone network builds these from a FIXED pair of pure tones, published in the North American
// plan: ringback 440+480 Hz, busy and reorder 480+620 Hz, dial tone 350+440 Hz. So "is this the desk
// ringing or a person talking?" is not a judgement call, it is a measurement: check how much of the
// frame's energy sits exactly on those frequencies. A tone puts nearly all of it there; speech never
// does. Copied byte-for-byte from the bridge's ear (src/voice/bridge.ts toneShare) so the two ears
// cannot disagree about what counts as the network's own tone — the same rule the energy decoder
// above already follows. This is what lets a mapping check count REAL rings and hang up on the
// second one, instead of trusting a clock.
const TONE_HZ = [350, 440, 480, 620];
/** Share (0..1) of a frame's energy sitting on the call-progress tone frequencies. ~1 = a pure tone
 *  pair, well under 0.2 for speech. Goertzel per frequency, normalized so a clean tone reads 1. */
export function toneShare(b64: string): number {
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

/** Speech/silence thresholds. VOICE_THRESH matches the bridge's ear (350) so the two agree about
 *  what counts as sound on the line. */
const VOICE_THRESH = 350;
const FRAME_MS = 20;
/** A burst must run this long to count as a prompt — filters clicks, beeps and a single loud word
 *  of hold music. Real IVR prompts run seconds. */
const MIN_SPEECH_MS = 900;
/** Silence this long ENDS a prompt. Recorded menus pause well under this between phrases (measured
 *  on the 07-24 Target runs); the gap before they expect input is longer. */
const END_SILENCE_MS = 700;

// ---- the prompt-boundary detector ----------------------------------------------------------
/** Streaming detector: feed frame energies, get a callback each time a prompt ENDS. Pure and
 *  synchronous so it is unit-testable without any audio. */
export class PromptDetector {
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;
  private voicedRun = 0;
  /** Completed prompts so far. */
  count = 0;
  /** How long the most recently completed prompt talked for. A recorded menu prompt runs seconds;
   *  a person saying "Target Topanga, this is Bob" does not. */
  lastPromptMs = 0;
  /** Unbroken silence since that prompt ended, reset the instant anything is said. A menu's own
   *  pauses sit well under a second; a line waiting for YOU to talk keeps going. */
  quietMs = 0;
  /** @param onBoundary called with the prompt index (1-based) when a prompt finishes. */
  constructor(private onBoundary: (n: number) => void) {}
  feedEnergy(e: number): void {
    if (e > VOICE_THRESH) {
      this.voicedRun++;
      this.silenceMs = 0;
      // Two voiced frames in a row start a burst — one stray loud frame does not.
      if (this.voicedRun >= 2) { this.speaking = true; this.speechMs += FRAME_MS; this.quietMs = 0; }
    } else {
      this.voicedRun = 0;
      if (this.speaking) {
        this.silenceMs += FRAME_MS;
        if (this.silenceMs >= END_SILENCE_MS) {
          const wasReal = this.speechMs >= MIN_SPEECH_MS;
          const spoke = this.speechMs;
          this.speaking = false; this.speechMs = 0; this.silenceMs = 0;
          if (wasReal) { this.count++; this.lastPromptMs = spoke; this.quietMs = END_SILENCE_MS; this.onBoundary(this.count); }
        }
      } else if (this.count) this.quietMs += FRAME_MS;
    }
  }
  feed(b64: string): void { this.feedEnergy(frameEnergy(b64)); }
}

/** Fallbacks ONLY. The live values come from the `call_tuning` setting the Admin reads and are
 *  passed in, because every one of these has to be tuned against real calls and none of that can
 *  wait on a release (owner, 07-28). Kept here so this file still needs no config to be tested. */
const PERSON_GREETING_MAX_MS = 3500;
const PERSON_WAIT_MS = 2500;

/** Has a real person answered instead of the menu we mapped? Pure, so the rule that decides whether
 *  we fire keypad tones at a human is provable without a phone call.
 *  Deliberately narrow: only BEFORE the first mapped step, only on the very first thing we heard.
 *  Once a menu has started walking, a pause is just a pause. */
export function looksLikeAPerson(
  o: { stepsFired: number; promptCount: number; lastPromptMs: number; quietMs: number },
  t?: { personGreetingMaxMs?: number; personWaitMs?: number },
): boolean {
  if (o.stepsFired > 0 || o.promptCount !== 1) return false;
  const maxGreeting = t?.personGreetingMaxMs ?? PERSON_GREETING_MAX_MS;
  const wait = t?.personWaitMs ?? PERSON_WAIT_MS;
  return o.lastPromptMs > 0 && o.lastPromptMs <= maxGreeting && o.quietMs >= wait;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE JUDGE — "is this the store's recording, or a person?"
//
// EVERY path asks this and nothing decides it privately (fix pass 5). Six different opinions used to
// live in six files: a live-person word list, a cold-pickup test, a handoff-phrase stamp, a
// sent-elsewhere classifier, the sweep's "sounds like a recording" length test, and a back-dating
// helper. They disagreed, and every disagreement cost the same thing — Staff's own words read as the
// store's menu, or the store's recording read as Staff. That is what rang real people to hang up on
// them, and what locked routes against recordings. Those tests still exist, but ONLY as evidence
// this judge weighs; none of them may answer the question alone.
//
// FIVE LAYERS, IN ORDER, FIRST CONFIDENT ANSWER WINS:
//   1 THE STORE'S OWN REMEMBERED MENU. A recording plays the same sentence on every call; a person
//     never says the same sentence twice. From the second call on we hold this store's lines, so a
//     match is the recording, decided. No match is NOT "person" on its own — it may be a menu we
//     have not heard yet, which gets filed, never guessed into the map.
//   2 WHERE WE ARE on a route we already hold: before the handoff it is the phone system; once the
//     desk has rung it is a person (the owner's law).
//   3 THE WORDS: choices to press, "para español", a menu announcing itself = a recording. A reply
//     to what WE just said, or a short utterance after the ring, = a person.
//   4 THE PAUSE, when the first three cannot say: stay silent about two seconds. A recording keeps
//     reading. A person stops, or asks if we are still there.
//   5 STILL UNSURE = A PERSON. Every default flips this way, because the cost of treating a person
//     as a recording (talking over them, hanging up on them) is the one we refuse to pay.
//
// No audio is decoded here and no model is called: the judge weighs facts the call already has.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** One spoken line, reduced to the words that survive transcription. Shared with the fingerprint in
 *  mapgraph so "is this the same line" has exactly ONE rule in the codebase. */
export const spokenTokens = (line: string): string[] =>
  String(line || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 10);
/** The same recording, heard twice. The transcriber never writes it the same way twice, so this
 *  compares the opening words in order and allows the usual quarter of them to be wrong. */
export function sameSpokenLine(a: string, b: string): boolean {
  const A = spokenTokens(a), B = spokenTokens(b);
  if (A.length < 3 || B.length < 3) return A.join(" ") === B.join(" ");
  const n = Math.min(A.length, B.length);
  let hit = 0;
  for (let i = 0; i < n; i++) if (A[i] === B[i]) hit++;
  return hit / n >= 0.75;
}

/** A menu offering choices, announcing itself, or reading a language option — and the machine's own
 *  handoff line, which is the last thing the phone system says to us. Evidence for layer 3 only:
 *  Staff say handoff-shaped things too ("sure, one moment"), which is why POSITION is layer 2 and
 *  wins first — after the desk rings, the same words are a person. */
const MENU_WORDS = /press \d|press the|option \d|para espa[ñn]ol|oprima|listen carefully|menu has changed|options have changed|for [a-z].{0,30}\bpress\b|say the name|automated|this call (may be|is) recorded|calls are recorded|virtual assistant|please hold while|thank(s| you) for calling|transferring you( now)?|connecting you( now)?/i;
/** Somebody checking whether we are still on the line. Nothing recorded ever asks this. */
const CHECKING_ON_US = /\bhello\?|are you (still )?there|you still there|can you hear me|anybody there|anyone there/i;
/** Somebody talking TO US: offering to help, asking what we need, giving their own name. A menu
 *  offers choices; a person offers themselves. */
const ADDRESSED_TO_US = /how (can|may) i help|can i help you|what can i (do|help)|what do you need|how can i assist you|this is \w+|\w+ speaking|thanks for holding|thank you for holding|what'?s up/i;
/** Them going to look — after our question this is WAITING, never an answer and never a hand-off. */
const GOING_TO_LOOK = /^(sure|okay|ok|yeah|alright|yep|hold on|one)\b[^.?!]{0,40}\b(one (moment|sec|second)|a (moment|sec|second)|moment|hold on|let me (check|look|see|go)|i'?ll (check|look|see|go)|give me)\b/i;
/** Being handed somewhere else. Only counts when the reply carries no news about the product. */
const SENT_AWAY = /transfer|connect(ing)? you|let me get you|i'?ll get you|you'?d (have to|need to) (ask|call|talk to)|that would be the |that'?s the .{0,20}(department|desk|counter)/i;
/** News about the product — a yes, a no, a where. An answer, whatever else rides along with it. */
const ABOUT_THE_PRODUCT = /\b(yes|yeah|yep|no|nope|we do|we don'?t|sold out|out of stock|in stock|we have|we'?ve got|we got|we carry|aisle|section|shelf|by the|near the|next to|over (by|there|here)|behind the|up front)\b/i;

export interface JudgeInput {
  /** What was just heard, as the transcriber gave it to us. */
  text: string;
  /** Seconds into the check that this line landed. */
  atSec: number;
  /** LAYER 1 — this store's menu lines from earlier calls, in its own words as heard. */
  knownMenuLines?: string[];
  /** LAYER 2 — we are walking a route we already hold. */
  mappedRoute?: boolean;
  /** LAYER 2 — the store has announced the handoff on this check. */
  routeHandoffSeen?: boolean;
  /** LAYER 2 — real ring bursts counted by the Ear. One is enough: the desk is ringing. */
  ringsHeard?: number;
  /** LAYER 3 — when WE last spoke. A line arriving right after ours is a reply, and replies are people. */
  weSpokeAtSec?: number | null;
  /** LAYER 3 — when we asked the product question, if we have. */
  weAskedAtSec?: number | null;
  /** LAYER 4 — the pause has been run, and whether the line kept reading through it. */
  pauseTested?: boolean;
  keptTalkingAfterPause?: boolean;
  /** The very first check to a store we have never rung: pure listening, hang up on nothing. */
  firstEverCall?: boolean;
  /** The product we asked about, so its own name counts as news about it. */
  product?: string;
}

export interface VoiceVerdict {
  who: "recording" | "person" | "unsure";
  /** Which layer answered, in plain words — this rides onto the record so a decision can be read back. */
  why: string;
  /** The judge cannot say yet and the caller should stay silent for the pause test. */
  needsPause?: boolean;
  /** Heard nothing we hold on file: either a person, or a menu we have never heard. The caller files
   *  it as a condition rather than guessing it into the map. */
  unknownLine?: boolean;
  /** Them going to look, after our question. Not an answer, not being sent away — keep listening. */
  waiting?: boolean;
  /** Being handed somewhere else, with no news about the product in it. */
  sendingUsAway?: boolean;
  /** FALSE on a store's first ever check: record everything, hang up on nothing. */
  hangUpAllowed?: boolean;
  /** A machine we cannot get past: a mailbox, or the store itself closed. Nothing to navigate and
   *  nobody to reach, so the check ends and Charlie is never opened on it. */
  deadEnd?: boolean;
}

export function judgeVoice(o: JudgeInput): VoiceVerdict {
  const text = String(o.text || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const hangUpAllowed = o.firstEverCall ? false : undefined;
  const afterOurAsk = typeof o.weAskedAtSec === "number" && o.atSec >= o.weAskedAtSec;
  const productNamed = o.product ? new RegExp(String(o.product).split(/\s+/)[0], "i").test(text) : false;
  const tellsUsSomething = ABOUT_THE_PRODUCT.test(text) || productNamed;
  // What KIND of reply this is, decided once and carried whatever the who turns out to be. Going to
  // look ("sure, one second") is waiting: it answers nothing and hands us nowhere.
  const waiting = afterOurAsk && GOING_TO_LOOK.test(text) && !tellsUsSomething ? true : undefined;
  const sendingUsAway = afterOurAsk && !waiting && SENT_AWAY.test(text) && !tellsUsSomething ? true : undefined;
  const ride = { waiting, sendingUsAway, hangUpAllowed };

  if (!text) return { who: "unsure", why: "nothing was said", ...ride };

  // BEFORE LAYER 1: two facts outrank a word-match. A REAL COUNTED RING means the phone system has
  // already handed us to the desk — no remembered line can outvote the desk ringing. And words that
  // are unmistakably a person talking TO us ("this is Maria", "how can I help") beat every position
  // rule: a store CAN read a line that resembles its own menu, but a recording never asks us
  // anything (fix pass 6, item 3).
  if ((o.ringsHeard ?? 0) >= 1) {
    return { who: "person", why: "the desk has rung, so the phone system is finished with us", ...ride };
  }
  if (CHECKING_ON_US.test(text) || ADDRESSED_TO_US.test(text)) {
    return { who: "person", why: "somebody is talking to us, not reading at us", ...ride };
  }

  // LAYER 1 — the store's own remembered menu. Recordings repeat word for word.
  const known = (o.knownMenuLines || []).filter((l) => String(l || "").trim());
  if (known.length) {
    if (known.some((line) => sameSpokenLine(line, text))) {
      return { who: "recording", why: "this store has played this exact line before", ...ride };
    }
    // No match is not a verdict on its own — it may be a menu we have never heard. FLAGGED here so
    // the caller can file it as a condition, and the later layers still get their say about who
    // was talking.
    (ride as VoiceVerdict).unknownLine = true;
  }

  // LAYER 2 — where we are on a route we hold.
  if ((o.ringsHeard ?? 0) >= 1 || (o.routeHandoffSeen && (o.ringsHeard ?? 0) >= 1)) {
    return { who: "person", why: "the desk has rung, so the phone system is finished with us", ...ride };
  }
  if (o.mappedRoute && !o.routeHandoffSeen && !MENU_WORDS.test(text) && !CHECKING_ON_US.test(text)) {
    // Before the handoff on a route we already hold, the phone system is still talking to us.
    return { who: "recording", why: "we are still inside a menu we already hold", ...ride };
  }

  // LAYER 3 — the words.
  if (CHECKING_ON_US.test(text)) return { who: "person", why: "somebody is checking whether we are still here", ...ride };
  if (ADDRESSED_TO_US.test(text)) return { who: "person", why: "somebody is talking to us, not reading at us", ...ride };
  if (MENU_WORDS.test(text)) return { who: "recording", why: "these are a menu's own words", ...ride };
  const repliedToUs = typeof o.weSpokeAtSec === "number" && o.atSec - o.weSpokeAtSec <= 6 && words <= 40;
  if (repliedToUs && (tellsUsSomething || waiting || sendingUsAway)) {
    return { who: "person", why: "a reply to what we just said", ...ride };
  }
  if (afterOurAsk && (tellsUsSomething || waiting || sendingUsAway)) {
    return { who: "person", why: "an answer to the question we asked", ...ride };
  }

  // LAYER 4 — the pause. A recording keeps reading; a person stops.
  if (!o.pauseTested) return { who: "unsure", why: "could be either — waiting through a short silence to tell", needsPause: true, ...ride };
  if (o.keptTalkingAfterPause) return { who: "recording", why: "it kept reading through the silence", ...ride };

  // LAYER 5 — still unsure is a person, always.
  return { who: "person", why: "nothing proved it was a recording, so it is treated as a person", ...ride };
}

/** WHEN THE PERSON STARTED TALKING — the first line of THEIR speech, never the turn we finally
 *  recognised them on. A long hello dodges every short-utterance test, so the person used to be
 *  dated a turn late and their own hello sat before the cut, read as one more menu line: that is the
 *  hang-up-on-Staff cascade at its root. This walks back through the lines the judge still calls a
 *  person and takes the earliest one. A hello JOINED onto a store line (the tail rule) never drags
 *  the stamp onto the recording's moment — the join is split, and the person starts a second later.
 */
export function personStartsAt(
  steps: Array<{ who?: string; text?: string; atSec?: number }>,
  detectedAtSec: number,
  ctx: { knownMenuLines?: string[]; ringsHeard?: number; weSpokeAtSec?: number | null; weAskedAtSec?: number | null; product?: string } = {},
): number {
  let start = detectedAtSec;
  let foundPerson = false;
  const lines = (steps || []).filter((st) => st.who === "ivr" && String(st.text || "").trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const st = lines[i];
    const at = st.atSec ?? detectedAtSec;
    if (at > detectedAtSec) continue;
    // No pause result is fed in: the pause never ran on these finished lines, and claiming one
    // either way is the side door. Unclear lines come back UNSURE and are simply skipped.
    const v = judgeVoice({
      text: String(st.text), atSec: at,
      knownMenuLines: ctx.knownMenuLines, ringsHeard: ctx.ringsHeard,
      weSpokeAtSec: ctx.weSpokeAtSec, weAskedAtSec: ctx.weAskedAtSec, product: ctx.product,
    });
    if (v.who === "person") {
      // A JOINED line is half the store and half the person (the tail rule glues a hello onto the
      // recording it interrupted). The person begins just AFTER the recording, never at it.
      if (startsAsARecording(String(st.text), ctx)) { start = at + 1; break; }
      foundPerson = true; start = Math.min(start, at); continue;
    }
    // An unclear line sitting INSIDE the person's speech is theirs — the default flips toward a
    // person everywhere, and a mumble between two of their lines is not the store's menu. Before
    // any person is found it is only skipped, never claimed.
    if (v.who === "unsure") { if (foundPerson) start = Math.min(start, at); continue; }
    // A line the judge calls a recording ENDS the walk — but if a person's words were joined onto
    // it, the person begins just after that recording, never at it.
    if (start === detectedAtSec && carriesAPersonsWords(String(st.text), ctx)) start = at + 1;
    break;
  }
  return start;
}

/** Did a store line get a person's words glued onto its end? The tail rule joins a short line that
 *  lands within seconds of our own answer onto the line it interrupted, which is right for the
 *  remainder of a cut sentence and wrong for a hello. Split by sentence and ask the judge. */
/** Does this line BEGIN as the store's recording? On a joined line the store's own sentence comes
 *  first and the person's hello is glued to its end, so the person starts after it, not at it. */
function startsAsARecording(line: string, ctx: { knownMenuLines?: string[]; product?: string }): boolean {
  const parts = String(line || "").split(/(?<=[.?!])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return judgeVoice({ text: parts[0], atSec: 0, knownMenuLines: ctx.knownMenuLines, product: ctx.product }).who === "recording";
}

function carriesAPersonsWords(line: string, ctx: { knownMenuLines?: string[]; product?: string }): boolean {
  const parts = String(line || "").split(/(?<=[.?!])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const tail = parts[parts.length - 1];
  return judgeVoice({ text: tail, atSec: 0, knownMenuLines: ctx.knownMenuLines, product: ctx.product }).who === "person";
}

// ---- the recording plan (which recording each step waits for) -------------------------------
// GONE, DELIBERATELY (spec: the live call runtime, section 10). This file used to hold a side
// channel: the caller stashed the anchors in a module-level map keyed by the SHAPE of the step list,
// with a ten-minute expiry, and a call claimed whichever entry happened to look like the route it
// was running. It died on every restart, it carried no version, and two saved versions of one route
// could have their pieces mixed on a live call.
//
// The steps now arrive complete. Whoever places the call reads the route AND its anchors off the
// same active version in one go (service.ts → buildRestockVars → activeMap) and hands them straight
// down. Nothing here has to guess which plan belongs to which call, because nothing is staged.

// ---- THE EAR DURING THE CONVERSATION -------------------------------------------------------
// The detector above walks the MENU. This one stays on the call afterwards, while a person is
// talking to us, and answers one question the runtime cannot otherwise ask: is anybody still there?
//
// It is acoustic and it is free. No speech recognition, no model — the provider's own transcription
// is 8.6¢ a call, more than a whole check costs, and is deliberately not used.
//
// The three things it can honestly tell apart, and nothing more:
//   • QUIET — nobody is making any sound. The clerk put the handset down and walked off.
//   • MUSIC — sound that never stops. Speech breathes; it has gaps between syllables and words, so
//     a window of real talking is never fully voiced. Hold music and a hold tone are continuous.
//   • A RINGING LINE — the published call-progress frequencies, which the bridge already measures
//     for exactly this reason. Ringing AFTER we reached a person means we were transferred.
//
// What it does NOT do is judge what anyone SAID. "Hold on, let me go check" is words, and words are
// Charlie's. This is only the shape of the sound.

/** Fallbacks ONLY — the live values arrive from the `call_tuning` setting via the constructor.
 *  Every one of these has to be tuned against real calls, so none of them may need a release. */
const HOLD_QUIET_MS = 6000;
const HOLD_MUSIC_MS = 6000;
const VOICED_WINDOW_MS = 3000;
const MUSIC_VOICED_FRACTION = 0.96;
const NEW_PERSON_AFTER_MS = 20000;

export type HoldReason = "quiet" | "music" | "transfer";
/** HOW MUCH RINGING BEFORE WE CALL IT A TRANSFER. One frame used to be enough, and one frame is
 *  twenty milliseconds — so a single syllable that happened to sit near the network's tone
 *  frequencies announced a transfer on a store with no menu at all (real receipt, 07-28: ten
 *  "handed on" lines on a direct-dial call where nobody was ever transferred). A real ringback burst
 *  in North America runs two full seconds, so this bar is met by any genuine ring and cannot be met
 *  by a word. */
const TRANSFER_TONE_MS = 600;
/** …and how much real speech before we say somebody is BACK. The mirror of the same bug: one
 *  not-quite-a-tone frame in the middle of a ring cadence read as "a person is talking", which ended
 *  a hold that had lasted nothing, and then the next ring started another one. That flapping is what
 *  put ten of each on one receipt. A spoken word runs about three hundred milliseconds, so this
 *  clears on anybody actually saying something and never on a click, a beep or a gap in hold music. */
const BACK_VOICE_MS = 400;
/** A gap longer than this breaks a run of speech. Syllables inside a word sit well under it; the
 *  pause after "hello" does not. */
const VOICE_GAP_MS = 300;
/** Nobody has made a sound for a very long time. Different from "they walked away to go and look":
 *  at this point the line is probably not a conversation any more — the handset was put down and
 *  forgotten, or the far end went away without hanging up. The runtime decides what to do about it;
 *  the ear only says that it happened. */
const DEAD_AIR_MS = 45000;
export interface EarTuning {
  holdQuietMs?: number; holdMusicMs?: number; musicWindowMs?: number;
  musicVoicedFraction?: number; newPersonAfterMs?: number; deadAirMs?: number;
  transferToneMs?: number; backVoiceMs?: number;
}

/**
 * Streaming, pure and synchronous, so every threshold above is provable without a phone call.
 * Feed it one frame at a time from the moment a real person is on the line.
 */
export class ConversationEar {
  private voiced: boolean[] = [];      // recent frames, for the speech-vs-continuous-sound test
  private quietMs = 0;                 // unbroken silence
  private soundMs = 0;                 // unbroken sound
  private heardVoiceMs = 0;            // total time a person has actually been talking to us
  /** On hold right now, and why. Null = someone is with us. */
  reason: HoldReason | null = null;
  /** When the current hold started, in ms since this ear was attached. */
  private holdStartedAt = 0;
  private elapsed = 0;
  /** Total time spent on hold. THIS is `holdSeconds` on the receipt, which has been null since the
   *  receipt shipped because nothing measured it. */
  holdMs = 0;
  private readonly quietMax: number;
  private readonly musicMax: number;
  private readonly windowMs: number;
  private readonly voicedFrac: number;
  private readonly newPersonMs: number;
  private readonly deadAirMs: number;
  private deadAirCalled = false;
  /** Unbroken run of the network's own ring/busy tone. A transfer needs a real burst of it. */
  private toneRunMs = 0;
  /** HOW MANY TIMES THE DESK HAS RUNG. Counted off the same tone burst that declares a transfer, so
   *  it is the real thing and not a stopwatch: one count per burst, the moment that burst proves
   *  itself. A mapping call hangs up on the second one (owner, 07-30), which is enough to prove the
   *  desk is really ringing and still leaves nobody to answer it. */
  rings = 0;
  private ringCounted = false;
  /** Unbroken run of speech-shaped sound. Somebody being BACK needs a real run of it. */
  private voiceRunMs = 0;
  private readonly transferToneMs: number;
  private readonly backVoiceMs: number;
  constructor(private on: {
    holdStart: (reason: HoldReason, atMs: number) => void;
    /** @param gapMs how long they were gone. @param maybeNewPerson long enough that it may not be
     *  the same person, so Charlie must be told. */
    holdEnd: (gapMs: number, maybeNewPerson: boolean, atMs: number) => void;
    /** NOBODY IS COMING BACK. Fired once, when quiet has run far past a normal wait. */
    deadAir?: (quietMs: number, atMs: number) => void;
    /** THE LINE IS GONE. Fired once, when the audio itself stops arriving — a dropped carrier leg
     *  sends nothing at all, which is silence a silence-detector can never see. */
    disconnected?: (atMs: number) => void;
  }, t?: EarTuning) {
    this.deadAirMs = t?.deadAirMs ?? DEAD_AIR_MS;
    this.quietMax = t?.holdQuietMs ?? HOLD_QUIET_MS;
    this.musicMax = t?.holdMusicMs ?? HOLD_MUSIC_MS;
    this.windowMs = t?.musicWindowMs ?? VOICED_WINDOW_MS;
    this.voicedFrac = t?.musicVoicedFraction ?? MUSIC_VOICED_FRACTION;
    this.newPersonMs = t?.newPersonAfterMs ?? NEW_PERSON_AFTER_MS;
    this.transferToneMs = t?.transferToneMs ?? TRANSFER_TONE_MS;
    this.backVoiceMs = t?.backVoiceMs ?? BACK_VOICE_MS;
  }

  /**
   * NO AUDIO IS ARRIVING AT ALL. Called by whoever owns the socket, not by feed(), because that is
   * the whole point: a line that has genuinely gone away stops sending frames, so the ear is never
   * asked anything again and cannot notice on its own. Silence and absence are different facts.
   */
  lineGone(): void {
    if (this.gone) return;
    this.gone = true;
    this.on.disconnected?.(this.elapsed);
  }
  private gone = false;

  /** @param energy frame energy, same measure the rest of the call path uses.
   *  @param isTone this frame sits on the phone network's own ring/busy frequencies. */
  feed(energy: number, isTone = false): void {
    this.elapsed += FRAME_MS;
    if (this.reason) this.holdMs += FRAME_MS;
    const loud = energy > VOICE_THRESH;
    this.voiced.push(loud && !isTone);
    while (this.voiced.length * FRAME_MS > this.windowMs) this.voiced.shift();

    // A ringing line after we already reached a person is a transfer. The FREQUENCIES are
    // unambiguous, but one frame of them is not: twenty milliseconds of a voice can land on them by
    // accident, and treating that as a transfer is what wrote ten false "handed on" lines onto a
    // direct-dial call. So the tone has to actually RUN. A genuine ringback burst is two seconds.
    if (isTone && loud) {
      this.toneRunMs += FRAME_MS; this.voiceRunMs = 0;
      this.quietMs = 0; this.soundMs += FRAME_MS;
      if (this.toneRunMs >= this.transferToneMs) {
        // One count per burst. The flag clears when the tone stops, so a single long ring can never
        // count as two and the gap between rings is what separates them.
        if (!this.ringCounted) { this.ringCounted = true; this.rings++; }
        this.enter("transfer");
      }
      return;
    }
    this.toneRunMs = 0; this.ringCounted = false;

    if (loud) {
      this.soundMs += FRAME_MS; this.quietMs = 0;
      const full = this.voiced.length * FRAME_MS >= this.windowMs
        && this.voiced.filter(Boolean).length / this.voiced.length >= this.voicedFrac;
      if (full && this.soundMs >= this.musicMax) { this.voiceRunMs = 0; this.enter("music"); }
      // Sound with gaps in it is a person. If we thought they were away, they are back — but only
      // once they have actually said SOMETHING. A single frame ending a hold is the other half of the
      // flapping bug: it ended a hold that had lasted nothing, and the next ring opened another one.
      else if (!full) {
        this.heardVoiceMs += FRAME_MS; this.voiceRunMs += FRAME_MS; this.deadAirCalled = false;
        if (this.voiceRunMs >= this.backVoiceMs) this.leave();
      }
    } else {
      this.soundMs = 0; this.quietMs += FRAME_MS;
      // A pause long enough to break a word breaks the run of speech with it.
      if (this.quietMs >= VOICE_GAP_MS) this.voiceRunMs = 0;
      if (this.quietMs >= this.quietMax) this.enter("quiet");
      // Far past a normal wait. Somebody stepping away to check a shelf comes back; this does not,
      // and it is the shape of a handset put down on a counter and forgotten.
      if (this.quietMs >= this.deadAirMs && !this.deadAirCalled) {
        this.deadAirCalled = true;
        this.on.deadAir?.(this.quietMs, this.elapsed);
      }
    }
  }

  private enter(reason: HoldReason): void {
    if (this.reason) return;                       // already away; do not re-announce
    if (!this.heardVoiceMs) return;                // never had anybody, so nobody left
    this.reason = reason;
    // BACKDATE to the moment they actually went, not the moment we were sure. We only declare a hold
    // after six seconds of evidence, so timing it from the declaration would report a seven second
    // absence as one second — and the whole point of the number is how long nobody was there.
    const already = reason === "quiet" ? this.quietMs : reason === "music" ? this.soundMs : this.toneRunMs;
    this.holdStartedAt = Math.max(0, this.elapsed - already);
    this.holdMs += already;
    this.on.holdStart(reason, this.holdStartedAt);
  }

  private leave(): void {
    if (!this.reason) return;
    // They came back when they STARTED talking, not when we had heard enough of it to be sure. The
    // run of speech that convinced us is theirs, not the hold's, so it comes off both numbers —
    // otherwise every hold reads a few hundred milliseconds longer than it was.
    const back = Math.max(0, this.elapsed - this.voiceRunMs);
    const gap = Math.max(0, back - this.holdStartedAt);
    this.holdMs = Math.max(0, this.holdMs - this.voiceRunMs);
    this.reason = null;
    this.voiceRunMs = 0;
    this.on.holdEnd(gap, gap >= this.newPersonMs, back);
  }
}

/** Should this step fire on the recording that just ended? Pure, so the rule is provable without a
 *  phone call (scripts/test-listen-nav.ts).
 *  @param n    which recording just finished (1-based)
 *  @param at   seconds since the store answered
 *  Two gates, both of which can only ever DELAY a step — the clock fallback still guarantees it runs:
 *   1. not before (learned - LEAD), and never within MIN_STEP_GAP of the previous step;
 *   2. when the map knows which recording this step follows, wait for that recording to finish. */
export function shouldFireOnPrompt(step: NavStep, n: number, at: number, lastFiredAtSec: number): { fire: boolean; reason: string } {
  const eligibleAt = Math.max(step.atSec - LEAD_SEC, lastFiredAtSec + MIN_STEP_GAP_SEC);
  if (at < eligibleAt) return { fire: false, reason: `too early (eligible ${eligibleAt}s)` };
  if (typeof step.afterPrompt === "number" && n < step.afterPrompt) {
    return { fire: false, reason: `waits for recording ${step.afterPrompt}` };
  }
  return { fire: true, reason: "recording ended" };
}

// ---- the per-call session ------------------------------------------------------------------
interface Session {
  room: string;
  callSid: string;
  steps: NavStep[];
  next: number;             // index of the step we are waiting to fire
  startMs: number;
  lastFiredAtSec: number;
  det: PromptDetector;
  timers: NodeJS.Timeout[];
  bridgeUrl: string;        // wss://host/bridge?room=…
  done: boolean;
  log: (s: string) => void;
  onNavEnd?: (navEndSec: number) => void;
  /** Receipt hook. Kept as a callback so this file stays dependency-free and unit-testable. */
  onEvent?: (kind: string, note: string, detail?: Record<string, unknown>) => void;
  fired: Array<{ value: string; atSec: number; via: "prompt" | "clock" }>;
  /** Abandon the remaining steps when a real person answers instead of the mapped menu. On unless
   *  something explicitly turns it off, so the default is never firing tones at a human. */
  abortOnHuman?: boolean;
  tuning?: { personGreetingMaxMs?: number; personWaitMs?: number };
}

const sessions = new Map<string, Session>();
export function listenNavActive(room: string): boolean { return sessions.has(room); }
/** What actually happened on this call — for the debug log and the call ladder. */
export function listenNavFired(room: string): Array<{ value: string; atSec: number; via: string }> {
  return sessions.get(room)?.fired ?? [];
}
/** How many store recordings played on this call — the free drift measure: a menu that grew or lost
 *  a recording since we mapped it shows up here with no speech recognition and no model. */
export function listenNavPromptCount(room: string): number {
  return sessions.get(room)?.det.count ?? 0;
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));

/** Replace the in-progress call's TwiML. The <Start><Stream> fork survives this, so audio keeps
 *  flowing and we never re-add it. */
async function updateTwiml(s: Session, inner: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) { s.log("listen-nav: twilio not configured"); return false; }
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${s.callSid}.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Twiml: twiml }).toString(),
    });
    if (!r.ok) { s.log(`listen-nav: call-update ${r.status} ${(await r.text()).slice(0, 120)}`); return false; }
    return true;
  } catch (e) { s.log(`listen-nav: call-update threw ${String(e).slice(0, 80)}`); return false; }
}

/** The waiting document: whatever we just did, then sit quietly for the next prompt. Long enough
 *  that the clock fallback (learned + GRACE) always fires first — the longest mapped chain today is
 *  CVS at 48s, so its last step is due by 63s. */
const HOLD = `<Pause length="90"/>`;
/** How long the opening document waits before the dead-man <Connect>. */
const DEADMAN_SEC = 75;

function secs(s: Session): number { return Math.round((Date.now() - s.startMs) / 1000); }

/** Fire the next step. `via` records whether a real prompt boundary triggered it or the clock did. */
async function fireNext(room: string, via: "prompt" | "clock"): Promise<void> {
  const s = sessions.get(room);
  if (!s || s.done) return;
  const step = s.steps[s.next];
  if (!step) return;
  const at = secs(s);
  if (at - s.lastFiredAtSec < MIN_STEP_GAP_SEC && s.lastFiredAtSec > 0) return; // one pause, one step
  s.next++;
  s.lastFiredAtSec = at;
  s.fired.push({ value: step.value, atSec: at, via });
  s.log(`listen-nav: ${step.action} "${step.value}" at ${at}s (learned ${step.atSec}s, fired on ${via === "prompt" ? "the prompt ending" : "the clock fallback"})`);
  // On the receipt: what we did, when, and — the part that catches a drifting map — whether the
  // store's own pause triggered it or we fell back to the learned second.
  try {
    s.onEvent?.(step.action === "press" ? "alpha_press" : "bravo_say", step.action === "press"
      ? `Pressed ${step.value} at ${at}s${via === "prompt" ? ", right after the menu stopped talking" : ", on the learned time (the store never paused)"}`
      : `Said "${step.value}" at ${at}s${via === "prompt" ? ", right after the menu stopped talking" : ", on the learned time (the store never paused)"}`,
      { action: step.action, value: step.value, atSec: at, learnedAtSec: step.atSec, via });
  } catch { /* recording is best-effort */ }
  const verb = step.action === "press"
    ? `<Play digits="${step.value.replace(/[^0-9*#]/g, "").slice(0, 6)}"/>`
    : `<Say voice="Polly.Joanna">${esc(step.value)}</Say>`;
  const last = s.next >= s.steps.length;
  if (last) {
    // Menu walked. Hand the call to the agent bridge exactly as the old TwiML did.
    s.done = true;
    s.timers.forEach(clearTimeout); s.timers.length = 0;
    keepSummary(s);   // the menu walk is over — freeze what happened for the drift check
    try { s.onNavEnd?.(at); } catch { /* best-effort */ }
    // Menu-end is not its own kind (the dashboard reads a closed set) — it rides on the last step.
  try { s.onEvent?.(step.action === "press" ? "alpha_press" : "bravo_say", `Menu walked in ${at}s (the map said ${s.steps[s.steps.length - 1]?.atSec ?? at}s)`, { last: true, menuEndedAtSec: at, mappedEndAtSec: s.steps[s.steps.length - 1]?.atSec ?? null }); } catch { /* best-effort */ }
    await updateTwiml(s, `${verb}<Connect><Stream url="${s.bridgeUrl}"><Parameter name="room" value="${s.room}" /></Stream></Connect>`);
    s.log(`listen-nav: menu done at ${at}s -> handing to the bridge`);
    setTimeout(() => sessions.delete(room), 5 * 60 * 1000);
  } else {
    await updateTwiml(s, `${verb}${HOLD}`);
    armClockFallback(s);
  }
}

/** Safety net: if the store never gives us a clean pause, fire on the learned time + grace.
 *  Clears any pending fallback FIRST: the timer armed for the previous step is now stale, and if it
 *  survives it fires this step early on the old step's clock. Caught on the first live Topanga call
 *  (07-25) — step 2 went at 23s off step 1's 23s timer instead of waiting for its own prompt. */
function armClockFallback(s: Session): void {
  s.timers.forEach(clearTimeout); s.timers.length = 0;
  const step = s.steps[s.next];
  if (!step) return;
  const dueAt = Math.max(step.atSec + GRACE_SEC, s.lastFiredAtSec + MIN_STEP_GAP_SEC + 1);
  const inMs = Math.max(500, (dueAt - secs(s)) * 1000);
  s.timers.push(setTimeout(() => { void fireNext(s.room, "clock"); }, inMs));
}

/**
 * Start listening navigation for a call.
 * @param bridgeUrl the wss://…/bridge?room=… the call hands off to once the menu is walked.
 * @param onNavEnd  called with the real seconds-to-menu-end, so the agent's join window can be
 *                  measured from what actually happened instead of the mapped guess.
 */
export function startListenNav(opts: {
  room: string; callSid: string; steps: NavStep[]; bridgeUrl: string;
  log?: (s: string) => void; onNavEnd?: (navEndSec: number) => void;
  onEvent?: (kind: string, note: string, detail?: Record<string, unknown>) => void;
  abortOnHuman?: boolean;
  /** Tunables from the setting the Admin reads, passed in so this file needs no config. */
  tuning?: { personGreetingMaxMs?: number; personWaitMs?: number };
}): void {
  const log = opts.log || (() => { /* silent */ });
  if (!opts.steps.length || !opts.callSid) return;
  const steps = opts.steps;
  const s: Session = {
    room: opts.room, callSid: opts.callSid, steps, next: 0, startMs: Date.now(),
    lastFiredAtSec: 0, timers: [], bridgeUrl: opts.bridgeUrl, done: false, log,
    onNavEnd: opts.onNavEnd, onEvent: opts.onEvent, fired: [], abortOnHuman: opts.abortOnHuman, tuning: opts.tuning,
    det: new PromptDetector(() => { /* replaced below */ }),
  };
  s.det = new PromptDetector((n) => {
    if (s.done) return;
    const step = s.steps[s.next];
    if (!step) return;
    const at = secs(s);
    const verdict = shouldFireOnPrompt(step, n, at, s.lastFiredAtSec);
    if (!verdict.fire) { log(`listen-nav: recording ${n} ended at ${at}s — "${step.value}" ${verdict.reason}, waiting`); return; }
    void fireNext(s.room, "prompt");
  });
  sessions.set(opts.room, s);
  const onRecording = steps.filter((x) => typeof x.afterPrompt === "number").length;
  log(`listen-nav: armed for ${steps.length} step(s)${onRecording ? `, ${onRecording} waiting on a specific recording` : ""} — firing on prompt endings, clock fallback at learned+${GRACE_SEC}s`);
  try { opts.onEvent?.("ivr_detected", `This store has a ${steps.length} step menu, each step waits for the store to stop talking`, { steps }); } catch { /* best-effort */ }
  armClockFallback(s);
}

/** Feed one inbound (store-side) media frame. Called from the /twilio-media fork socket. */
export function listenNavFeed(room: string, b64: string, track?: string): void {
  const s = sessions.get(room);
  if (!s || s.done) return;
  // Only the STORE's side of the line. Our own presses and spoken words come back on the outbound
  // track and would otherwise register as prompts.
  if (track && track !== "inbound") return;
  s.det.feed(b64);
  // NEVER PRESS KEYS AT A PERSON (spec: the live call runtime, section 10). A store we mapped with
  // a menu that now answers directly means our tones go off in a real human's ear. Today we would
  // keep pressing all the way down the list. Now the remaining steps are abandoned and the call
  // goes straight to the conversation.
  if (s.abortOnHuman !== false && looksLikeAPerson({ stepsFired: s.next, promptCount: s.det.count, lastPromptMs: s.det.lastPromptMs, quietMs: s.det.quietMs }, s.tuning)) {
    void handToConversation(s, "someone answered before the menu, the rest of the keys were never pressed");
  }
}

/** Abandon the mapped walk and hand the live call to the agent bridge — the same handoff the last
 *  mapped step performs, minus the step. */
async function handToConversation(s: Session, why: string): Promise<void> {
  if (s.done) return;
  s.done = true;
  s.timers.forEach(clearTimeout); s.timers.length = 0;
  const at = secs(s);
  keepSummary(s);
  s.log(`listen-nav: ${why} (at ${at}s, ${s.steps.length - s.next} step(s) abandoned)`);
  try { s.onEvent?.("human_detected", `A person answered at ${at}s, so we stopped working through the menu`, { atSec: at, stepsAbandoned: s.steps.length - s.next, reason: "person-answered" }); } catch { /* best-effort */ }
  try { s.onNavEnd?.(at); } catch { /* best-effort */ }
  await updateTwiml(s, `<Connect><Stream url="${s.bridgeUrl}"><Parameter name="room" value="${s.room}" /></Stream></Connect>`);
  setTimeout(() => sessions.delete(s.room), 5 * 60 * 1000);
}

// What each finished call did, kept briefly after the room is gone so the drift check can still read
// it when Twilio's terminal callback arrives after the socket closed.
const summaries = new Map<string, { fired: Array<{ value: string; atSec: number; via: string }>; promptCount: number; navEndSec: number | null; at: number }>();
const SUMMARY_TTL_MS = 15 * 60 * 1000;
function keepSummary(s: Session): void {
  const now = Date.now();
  for (const [k, v] of summaries) if (now - v.at > SUMMARY_TTL_MS) summaries.delete(k);
  summaries.set(s.room, { fired: [...s.fired], promptCount: s.det.count, navEndSec: s.fired.length ? s.fired[s.fired.length - 1].atSec : null, at: now });
}
/** How the mapped route actually behaved on this call — the input to drift detection. */
export function listenNavSummary(room: string): { fired: Array<{ value: string; atSec: number; via: string }>; promptCount: number; navEndSec: number | null } | null {
  const live = sessions.get(room);
  if (live) return { fired: [...live.fired], promptCount: live.det.count, navEndSec: live.fired.length ? live.fired[live.fired.length - 1].atSec : null };
  const done = summaries.get(room);
  return done ? { fired: done.fired, promptCount: done.promptCount, navEndSec: done.navEndSec } : null;
}

/** Call ended / room torn down. */
export function endListenNav(room: string): void {
  const s = sessions.get(room);
  if (!s) return;
  keepSummary(s);
  s.done = true;
  s.timers.forEach(clearTimeout);
  sessions.delete(room);
}

/** Build the opening TwiML for a listening-nav call: the audio fork, then wait. No nav verbs — the
 *  steps arrive later, each as its own call-update, when the store actually stops talking.
 *  The trailing <Connect> is a DEAD-MAN SWITCH, not part of the plan: every step normally replaces
 *  this document long before the pause runs out. It exists so that if every call-update failed
 *  (Twilio outage, call already gone), the call still hands to the agent instead of silently
 *  hanging up mid-menu with the customer watching. */
export function listenNavOpeningTwiml(fork: string, bridgeUrl: string, room: string): string {
  return `${fork}<Pause length="${DEADMAN_SEC}"/><Connect><Stream url="${bridgeUrl}"><Parameter name="room" value="${esc(room)}" /></Stream></Connect>`;
}

export const _test = { LEAD_SEC, GRACE_SEC, MIN_SPEECH_MS, END_SILENCE_MS, VOICE_THRESH, FRAME_MS,
  HOLD_QUIET_MS, HOLD_MUSIC_MS, NEW_PERSON_AFTER_MS, PERSON_GREETING_MAX_MS, PERSON_WAIT_MS,
  TRANSFER_TONE_MS, BACK_VOICE_MS, VOICE_GAP_MS };

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

// ---- WHAT THE KEYS FIND OUT (owner 08-08) ----------------------------------------------------
/** THREE ANSWERS, NEVER TWO, AND ALL THREE OFF THE SOUND (owner 08-08).
 *  `read_on`            — the noise carried straight through the keys. A machine, with certainty.
 *  `stopped_then_spoke` — it really stopped, then started talking again while we said nothing.
 *  `stopped_and_waited` — it stopped and stayed stopped through our own silence. Only a person waits.
 *  The old answer was a single true/false read off the TRANSCRIPT: it only called something a
 *  machine when the very next line was word for word the same line again, so a menu that simply
 *  moved on to its next sentence counted as having stopped, which read as a person (owner 08-08). */
export type KnockAnswer = "read_on" | "stopped_then_spoke" | "stopped_and_waited";
/** A REAL STOP, not a menu drawing breath. A recorded menu's pause between phrases sits well under
 *  END_SILENCE_MS (700ms, measured on the 07-24 Target runs) and a menu acting on a key does not go
 *  quiet at all — it reads the next set of options at us. Twice the longest measured phrase gap is
 *  the floor for calling it a stop, so the between-two-sentences case can never reach it. */
const KNOCK_STOP_MS = 1500;
/** Quiet held this long after the keys is somebody waiting for us to talk — the same waiting number
 *  looksLikeAPerson already uses, so the two cannot drift apart. */
const KNOCK_WAIT_MS = PERSON_WAIT_MS;
/** How long we listen for an answer before calling it read straight on. */
const KNOCK_WINDOW_MS = 5000;

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
const MENU_WORDS = /press \d|press the|option \d|para espa[ñn]ol|oprima|listen carefully|menu has changed|options have changed|for [a-z].{0,30}\bpress\b|say the name|automated|this call (may be|is) recorded|calls are recorded|virtual assistant|please hold while|transferring you( now)?|connecting you( now)?/i;
/** THE STORE SAYING ITS OWN NAME, AND NOTHING ELSE. Every recording in the world opens this way —
 *  and so does half the Staff in the country. On its own it proves nothing, so it can never be the
 *  reason we call a line a machine and press keys into a real person's ear (fix pass 7, item 6). It
 *  stays evidence: paired with any of the menu's own words above, the line is plainly the recording. */
const STORE_SAYING_ITS_NAME = /thank(s| you) for calling/i;
/** A MACHINE WE CANNOT GET PAST: a mailbox, or the store itself closed. There is nothing to
 *  navigate and nobody to reach, so the check ends here. This has to be asked BEFORE anything else,
 *  because a mailbox greets us with "Hello?" exactly like a person checking we are still there —
 *  and answering that one wrong puts Charlie on a machine (fix pass 7, item 6). Never on a closed
 *  PHARMACY: the front of the store is open and is exactly where we are going. */
const DEAD_END = /connect(ing)? you to (our|the) voicemail|leave (a |your )?(message|voicemail) (at|after|with)|voicemail box|record (a |your )?message after|providing your name,? (and )?date of birth|(store|we) (is|are) (currently |now )?closed(?![^.]*pharmacy)|closed for the (day|night)|our store hours are/i;
const PHARMACY_ONLY = /pharmacy .{0,30}(closed|hours)/i;
/** Is this line a machine we cannot get past? The ONE place that decides it. */
export function looksLikeADeadEnd(text: string): boolean {
  const t = String(text || "");
  return !!t && DEAD_END.test(t) && !PHARMACY_ONLY.test(t);
}
/** Somebody checking whether we are still on the line. Nothing recorded ever asks this. */
const CHECKING_ON_US = /\bhello\?|are you (still )?there|you still there|can you hear me|anybody there|anyone there/i;
/** Somebody talking TO US: offering to help, asking what we need, giving their own name. A menu
 *  offers choices; a person offers themselves. */
const ADDRESSED_TO_US = /how (can|may) i help|can i help you|what can i (do|help)|what do you need|how can i assist you|this is \w+|\w+ speaking|thanks for holding|thank you for holding|what'?s up/i;
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
  /** LAYER 2 — WHEN the desk first rang. The ring proves the phone system is finished with us FROM
   *  THERE ON; it says nothing about the menu that played before it. Without this moment a single
   *  ring re-labelled every earlier line a person, and the person's start could land on the first
   *  second of the check (fix pass 7, item 5). Absent = we do not know when, so the ring only
   *  counts for the line being judged right now. */
  ringAtSec?: number | null;
  /** LAYER 3 — when WE last spoke. A line arriving right after ours is a reply, and replies are people. */
  weSpokeAtSec?: number | null;
  /** LAYER 3 — when we asked the product question, if we have. */
  weAskedAtSec?: number | null;
  /** LAYER 4 — the pause has been run, and whether the line kept reading through it. */
  pauseTested?: boolean;
  keptTalkingAfterPause?: boolean;
  /** THE SAME SOUND, HEARD AGAIN (owner 08-07). Set when the shape of the line right now matches a
   *  shape heard earlier on this call. It is the one test that catches hold music, and hold music
   *  with an advert talking over it, because it listens to the sound and never to the words. */
  soundHeardBefore?: boolean;
  /** WHAT THE KEYS FOUND OUT (owner 08-08). Three answers, all of them off the SOUND on the line —
   *  the words get no vote, which is what carries Spanish and every other language. Absent means the
   *  keys have not been answered yet, and an unanswered knock says nothing either way. */
  knock?: KnockAnswer;
  /** Every line this number has already said ON THIS CALL. A recording repeats itself word for word
   *  when we stay quiet; a person does not. Needs no memory of the chain, so it is the one test that
   *  works on the first call we have ever made to a number (owner 08-07). */
  saidBefore?: string[];
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
  /** FALSE on a store's first ever check: record everything, hang up on nothing. */
  hangUpAllowed?: boolean;
  /** A machine we cannot get past: a mailbox, or the store itself closed. Nothing to navigate and
   *  nobody to reach, so the check ends and Charlie is never opened on it. */
  deadEnd?: boolean;
}

/** HAS THE DESK RUNG, AND HAD IT RUNG BY THE TIME THIS LINE WAS SPOKEN? The ring is the phone
 *  system handing us over, so everything after it is a person — and everything before it is exactly
 *  what it was. When the ring's own moment is not known, it can only speak for the line in hand. */
function rangBefore(o: JudgeInput): boolean {
  if ((o.ringsHeard ?? 0) < 1) return false;
  return typeof o.ringAtSec === "number" ? o.atSec >= o.ringAtSec : true;
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
  // WHAT KIND OF REPLY IT WAS IS NOT OURS TO SAY. Them going to look, them handing us elsewhere,
  // their answer: all Charlie's, already built and tuned. Mapping may know a person is there — that
  // is the moment it hands over — and nothing more.
  const ride = { hangUpAllowed };

  if (!text) return { who: "unsure", why: "nothing was said", ...ride };

  // BEFORE EVERYTHING: a mailbox, or the store closed. It greets us exactly like a person would
  // ("Hello? You have reached…"), so asking any other question first hands a machine to Charlie.
  if (looksLikeADeadEnd(text)) {
    return { who: "recording", why: "a mailbox or a closed store — there is nobody to reach", deadEnd: true, ...ride };
  }

  // BEFORE LAYER 1: words that are unmistakably a person talking TO us ("this is Maria", "how can I
  // help") beat every position rule — a store CAN read a line that resembles its own menu, but a
  // recording never asks us anything (fix pass 6, item 3).
  //
  // THE RING IS EVIDENCE, NOT AN OVERRIDE (owner, 08-02). It used to answer here, ahead of
  // everything, on the belief that a ring means the phone system is finished with us. It does not:
  // a desk can ring, nobody picks up, and the phone system drops us straight back into its own menu
  // — and with the ring answering first, that returning menu was never tested against the store's
  // own remembered lines, so Charlie was opened onto a recording. The ring now has its say further
  // down, after the menu's evidence has had its say.
  // IT SAID THE SAME THING TWICE (owner 08-07). This is the one signal that cannot be faked and
  // needs no memory of the chain, so it is the FIRST real test on a number we have never rung. A
  // recording repeats itself word for word whenever we say nothing; a person never says the same
  // sentence twice in a row. CVS proved why this has to come first: its opening carries "if this is
  // an emergency", which tripped a phrase meant to catch a person saying "this is Bob", and Echo
  // handed a pharmacy menu to Charlie 16 seconds in. Behaviour decides, words do not.
  if ((o.saidBefore || []).some((l) => sameSpokenLine(l, text))) {
    return { who: "recording", why: "it has said this exact line already on this call", ...ride };
  }

  // THE SAME SOUND, HEARD AGAIN (owner 08-07). A person never repeats a stretch of sound exactly;
  // a recording playing round again always does. This is what catches hold music, and hold music
  // with an advert over it, which every word rule calls a person.
  if (o.soundHeardBefore) {
    return { who: "recording", why: "this exact sound has already played on this call", ...ride };
  }

  // IT CARRIED STRAIGHT ON THROUGH THE KEYS (owner 08-07). On a number we have never rung we press
  // keys during the opening sentence. A person hears the beeps in their ear and stops. A recording
  // reads on regardless, so reading on is a machine and nothing else can explain it. Stopping is NOT
  // a person on its own, because a menu also goes quiet when it acts on a key: that case falls
  // through to the tests below, which is the whole point of never deciding on one signal.
  if (o.knock === "read_on") {
    return { who: "recording", why: "it read straight on through the keys we pressed", ...ride };
  }

  // WORDS ARE A HINT, NEVER THE VERDICT (owner 08-07). These phrases mean somebody is probably
  // talking to us rather than reading at us, and they used to answer outright. They cannot any more:
  // a menu is allowed to contain any sentence at all, and one wrong phrase cost a whole check. They
  // now only STOP the position rule below from calling this the menu, and the behaviour tests decide.
  const soundsAddressedToUs = CHECKING_ON_US.test(text) || ADDRESSED_TO_US.test(text);

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

  // LAYER 2 — where we are on a route we hold. A ring means the phone system moved us along, so
  // "we are still inside the menu we hold" no longer holds — but it does not make the next voice a
  // person either. That is decided below, on the same evidence as everything else.
  if (o.mappedRoute && !o.routeHandoffSeen && !rangBefore(o) && !MENU_WORDS.test(text) && !soundsAddressedToUs) {
    // Before the handoff on a route we already hold, the phone system is still talking to us.
    return { who: "recording", why: "we are still inside a menu we already hold", ...ride };
  }

  // LAYER 3 — the words.
  if (MENU_WORDS.test(text)) return { who: "recording", why: "these are a menu's own words", ...ride };
  // THEY STOPPED FOR THE KEYS AND THEN SPOKE TO US. The owner's own words for what a person does:
  // "a person reacts to a beep in their ear, stops, and says something to us". The stop is measured
  // on the SOUND and has to be a real one (KNOCK_STOP_MS), so a menu that pauses between two
  // different sentences never reaches it and a menu acting on a key never goes quiet at all. This is
  // what lets a store that answers directly be understood without us knowing in advance that it does.
  if (o.knock === "stopped_then_spoke") {
    return { who: "person", why: "it stopped for the keys and then spoke to us", ...ride };
  }
  // STOPPED FOR THE KEYS AND STAYED STOPPED, IN ANY LANGUAGE. This is the one that carries Staff who
  // answer in Spanish, or any language we hold no words for. A menu that acted on a key does not go
  // quiet, it reads the next set of options at us. Something that stayed quiet through our own
  // silence is somebody waiting for us to speak, and only a person waits.
  if (o.knock === "stopped_and_waited") {
    return { who: "person", why: "it stopped for the keys and stayed quiet for us, which only a person does", ...ride };
  }
  // Sounding like a person is only allowed to settle it once the pause has ALSO said person, because
  // the pause is behaviour and the phrase is only a hint. Until then it waits, and waiting is free.
  if (soundsAddressedToUs && o.pauseTested && !o.keptTalkingAfterPause) {
    return { who: "person", why: "it stopped when we went quiet, and it was talking to us", ...ride };
  }
  // A branded hello ALONE is held open for the pause below rather than settled here: a recording
  // reads on through the silence, and Staff stop and wait for us.
  // THE RING HAS ITS SAY HERE, and only here: the store's own remembered lines and the menu's own
  // words have both already had theirs, so a menu that came back after an unanswered desk is
  // already settled as the recording it is. What is left after a ring is somebody new on the line.
  if (rangBefore(o)) {
    return { who: "person", why: "the desk rang and this is not the store's own menu", ...ride };
  }
  const repliedToUs = typeof o.weSpokeAtSec === "number" && o.atSec - o.weSpokeAtSec <= 6 && words <= 40;
  if (repliedToUs && tellsUsSomething) {
    return { who: "person", why: "a reply to what we just said", ...ride };
  }
  if (afterOurAsk && tellsUsSomething) {
    return { who: "person", why: "an answer to the question we asked", ...ride };
  }

  // LAYER 4 — the pause. A recording keeps reading; a person stops.
  if (!o.pauseTested) return { who: "unsure", why: "could be either — waiting through a short silence to tell", needsPause: true, ...ride };
  if (o.keptTalkingAfterPause) return { who: "recording", why: "it kept reading through the silence", ...ride };

  // UNSURE MEANS WAIT (owner 08-07). This used to say that anything Echo could not settle was a
  // person, which is a guess, and a wrong guess costs the whole check: Charlie opens onto a menu and
  // argues with it. Charlie stays closed while Echo waits, so waiting costs nothing at all. The call
  // keeps running and every later turn is judged again, so a machine that repeats itself gives
  // itself away and a person who says something to us is heard the moment they do.
  return { who: "unsure", why: "nothing has proved it either way yet, so we keep listening", needsPause: !o.pauseTested, ...ride };
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
  ctx: { knownMenuLines?: string[]; ringsHeard?: number; ringAtSec?: number | null; weSpokeAtSec?: number | null; weAskedAtSec?: number | null; product?: string } = {},
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
    // THE RING IS A FLOOR. The desk ringing means the phone system was still holding us right up to
    // that moment, so the person cannot have started talking before it — not even on a line the
    // judge cannot call either way. Walking past it is how the person's start landed on the menu.
    if (typeof ctx.ringAtSec === "number" && (ctx.ringsHeard ?? 0) >= 1 && at < ctx.ringAtSec) break;
    const v = judgeVoice({
      text: String(st.text), atSec: at,
      knownMenuLines: ctx.knownMenuLines, ringsHeard: ctx.ringsHeard, ringAtSec: ctx.ringAtSec,
      weSpokeAtSec: ctx.weSpokeAtSec, weAskedAtSec: ctx.weAskedAtSec, product: ctx.product,
    });
    // WALKING BACK IS NOT JUDGING WHO IS THERE. By the time this runs we already KNOW a person is on
    // the line; the only question left is which of their lines was the first. So a line that Echo
    // left unsettled counts as theirs here, exactly as it always did. The live judgement is where
    // unsure means wait, and this is not the live judgement (owner 08-07).
    // A line the judge left unsettled is still the person's, EXCEPT when it is nothing but the store
    // reading its own name: that is the recording the person interrupted. A line that opens with the
    // store's name and then carries on into somebody talking is claimed, and split below.
    const onlyTheStoresName = STORE_SAYING_ITS_NAME.test(String(st.text)) && !startsAsARecording(String(st.text), ctx);
    if (v.who === "person" || (v.who === "unsure" && !onlyTheStoresName)) {
      // A JOINED line is half the store and half the person (the tail rule glues a hello onto the
      // recording it interrupted). The person begins just AFTER the recording, never at it.
      if (startsAsARecording(String(st.text), ctx)) { start = at + 1; break; }
      foundPerson = true; start = Math.min(start, at); continue;
    }
    // An unclear line sitting INSIDE the person's speech is theirs — the default flips toward a
    // person everywhere, and a mumble between two of their lines is not the store's menu. Before
    // any person is found it is only skipped, never claimed.
    // The store's own name, on a finished check, is where its greeting began — the person cannot
    // have started before it. Judging a live line it proves nothing (a person says it too), but
    // walking BACK through a check that is over, it is the boundary.
    if (STORE_SAYING_ITS_NAME.test(String(st.text))) {
      if (start === detectedAtSec && carriesAPersonsWords(String(st.text), ctx)) start = at + 1;
      break;
    }
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
  // A joined line opens with whatever was already playing when the person cut in. The store's own
  // name is not enough to call a WHOLE line a machine, but as the opening sentence of a line that
  // then turns into somebody talking to us, it is exactly the recording being interrupted.
  if (STORE_SAYING_ITS_NAME.test(parts[0])) return true;
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
const HOLD_QUIET_MS = 3000;   // cut from 6 on 08-07, see the note beside it in tuning.ts
const HOLD_MUSIC_MS = 6000;
const VOICED_WINDOW_MS = 3000;
const MUSIC_VOICED_FRACTION = 0.96;
const NEW_PERSON_AFTER_MS = 20000;

/** "room" is A PHONE SET DOWN ON THE COUNTER (round 1, item 1.2): sound is arriving, but it is store
 *  noise across the room rather than somebody speaking into the handset. Treated exactly like
 *  silence — Charlie is dropped and the meter stops — because that is what it is. */
export type HoldReason = "quiet" | "music" | "transfer" | "room";
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
/** …and it is counted OVER THIS MUCH RECENT AUDIO, never as one unbroken run (owner's check 298,
 *  08-06). He told Charlie to hold, went quiet, then asked "hello? are you there?" several different
 *  ways, and Charlie never came back and not one word of it was written down. The reason: the run of
 *  speech was reset to zero by every pause, and somebody checking whether the line is still there
 *  says SHORT things with long pauses between them, so the run never once reached a word's worth.
 *  Counting instead of running fixes that and gives up none of the protection the run was there for:
 *  a click, a beep or a gap in hold music is a single frame, and a single frame can never add up to
 *  four hundred milliseconds of speech however wide the window is. */
const BACK_WINDOW_MS = 3000;
/** A gap longer than this breaks a run of speech. Syllables inside a word sit well under it; the
 *  pause after "hello" does not. */
const VOICE_GAP_MS = 300;
/** HOW LONG ONE UNBROKEN RUN OF SOUND CAN BE AND STILL BE SPEECH (check 377, 08-18, test five).
 *  Hold music dipped and Charlie rejoined six seconds before Staff spoke: the dip had emptied the
 *  music test's window, so the music RESUMING banked as "a person with gaps in their speech" and
 *  400ms of it ended the wait. The one thing that tells the two apart — measured on check 378's
 *  own tape, never guessed — is the gaps: real music held the line 100% loud for fourteen straight
 *  seconds while real speech never passed about two thirds loud inside any one second, because
 *  every word's edges dip under the threshold. (Loudness SWING does not tell them apart: on the
 *  same tape the music swung 600 to 6500 inside single seconds, exactly like a voice.) So on a
 *  hold, a run is banked as comeback evidence only when it BREAKS at word scale, and a run that
 *  outgrows this unbroken is struck: it is the music, however it started. The rejoin still
 *  backdates to their first banked word, so the wait's length never pays for the proof. */
const MAX_SPEECH_RUN_MS = 1200;
/** Nobody has made a sound for a very long time. Different from "they walked away to go and look":
 *  at this point the line is probably not a conversation any more — the handset was put down and
 *  forgotten, or the far end went away without hanging up. The runtime decides what to do about it;
 *  the ear only says that it happened. */
const DEAD_AIR_MS = 45000;
/** THE PHONE ON THE COUNTER (round 1, item 1.2). Somebody speaking into a handset is loud and close.
 *  Store noise carrying across the room — a till, a radio, two people talking by the door — arrives
 *  far quieter, and it is irregular with gaps in it, which is the exact shape of somebody talking to
 *  us. So it is none of the three shapes the ear knew, and Charlie stayed open and billed at 11 cents
 *  a minute while the handset lay on the counter and Staff walked to the back room. Sound this far
 *  below the person we have been listening to is the room, not them. */
const ROOM_FRACTION = 0.35;
/** …judged over this much SOUND, never one frame at a time (see isRoom). A third of a second covers
 *  a syllable and its quiet edges; a handset on a counter stays quiet far longer than that. */
const ROOM_WINDOW_FRAMES = 15;
/** How fast the memory of how loud they were fades, per 20ms frame — about half in forty seconds. It
 *  has to hold across a whole answer without being pinned by one shouted word for the rest of the
 *  check. It fades on EVERY frame, including the quiet ones (owner's check 298, 08-06). Fading it
 *  only while somebody was already talking meant it never faded during the one stretch that matters,
 *  the wait itself: whoever came back was measured against the loudest thing said before they left,
 *  and anybody quieter than a third of that was written off as noise from across the room, forever,
 *  because a voice marked as the room never gets to update the yardstick it is being judged by. */
const CLOSE_DECAY = 0.99965;
/** …and it can never fade below this share of the loudest we have really heard a person be. The
 *  fade is there so somebody who comes back quieter is still heard; it is NOT there to let a handset
 *  lying on a counter creep past the bar after a long enough wait, which is the eleven-cents-a-minute
 *  bug the room test was built for. Half keeps both: the effective bar sits at about a sixth of a
 *  real speaking voice, far under anybody talking and far over a till and a radio down the aisle. */
const CLOSE_FLOOR = 0.5;
export interface EarTuning {
  holdQuietMs?: number; holdMusicMs?: number; musicWindowMs?: number;
  musicVoicedFraction?: number; newPersonAfterMs?: number; deadAirMs?: number;
  transferToneMs?: number; backVoiceMs?: number; roomFraction?: number;
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
  /** How much audio this ear has heard, in milliseconds. It counts FRAMES, never a clock, so the ear
   *  stays testable without one. The caller owns the clock and can turn any moment this ear reports
   *  back into a real one, because it knows when it last fed a frame (owner 08-06: the hold rows
   *  have to draw at the moment Staff really went, not the moment we were sure). */
  get heardMs(): number { return this.elapsed; }
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
  /** HOW LOUD THIS PERSON IS WHEN THEY TALK TO US. A decaying peak, so it follows one voice down a
   *  line that gets quieter without ever being dragged down by the room itself. Everything the room
   *  test knows is measured against this, so it needs no absolute idea of loudness and works on any
   *  line, in any language. Zero = we have not heard anybody talk to us yet, and then the test is
   *  simply off. */
  private closeLevel = 0;
  /** The loudest a person has really been on this call, which is what the fade is measured down from.
   *  Kept separately so the floor is a share of somebody's real voice and never of a faded number. */
  private closePeak = 0;
  /** WHEN each of the last few seconds' speech frames arrived, so "have they said a word's worth
   *  lately" is a count and not an unbroken run. Holding the times, not just a tally, is what lets a
   *  hold be backdated to the moment they STARTED talking rather than the moment we were sure. */
  private backSpeech: number[] = [];
  /** The run of sound currently in progress, held apart from the banked evidence while we are on a
   *  hold: it only banks when it BREAKS at word scale, because until it breaks it cannot be told
   *  from the hold music resuming (check 377 — see MAX_SPEECH_RUN_MS). */
  private runSpeech: number[] = [];
  /** The current run outgrew a word, so it is the music: nothing more of it banks until it breaks. */
  private runIsMusic = false;
  /** How much of the current wait was sound from across the room rather than plain silence. */
  private roomMs = 0;
  /** The last third of a second of sound, so the room test reads a stretch and not one frame. */
  private soundRecent: number[] = [];
  private readonly roomFraction: number;
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
    this.roomFraction = t?.roomFraction ?? ROOM_FRACTION;
  }

  /** Sound is arriving, but far below the person we have been listening to: that is the room, not
   *  them. Off entirely until somebody has actually spoken to us, because there is nothing to
   *  measure against and guessing would drop Charlie on a quiet talker.
   *
   *  Judged over the last third of a second of SOUND, never one frame at a time. Real speech swings
   *  enormously inside a single word — the quiet end of somebody's own syllables sits far below the
   *  loud end — so a per frame test calls half of an ordinary sentence "the room" and then cannot
   *  tell that they came back. A handset on a counter is quiet the whole time; a person is not. */
  private isRoom(energy: number): boolean {
    if (this.closeLevel <= 0) return false;
    this.soundRecent.push(energy);
    while (this.soundRecent.length > ROOM_WINDOW_FRAMES) this.soundRecent.shift();
    if (this.soundRecent.length < ROOM_WINDOW_FRAMES) return false;
    const mean = this.soundRecent.reduce((a, b) => a + b, 0) / this.soundRecent.length;
    return mean < this.closeLevel * this.roomFraction;
  }

  /**
   * WHAT WE HEARD BEFORE THIS EAR EXISTED. Charlie opens on a greeting followed by a real pause, so
   * by the time the ear is attached Staff have already said hello AND already stopped — the ear
   * itself never hears them. Left alone it answers "nobody left, because nobody was ever here", and
   * Staff who say "Fun store" and immediately walk off would be billed for in silence with no hold
   * ever declared. The greeting the person test measured is handed over here instead.
   * Only the talking is carried, never the pause: that pause is Staff waiting for our question, not
   * Staff walking away, so the wait for somebody to leave starts fresh from the moment he joins.
   */
  heardAlready(voiceMs: number, closeLevel = 0): void {
    if (voiceMs > 0) this.heardVoiceMs += voiceMs;
    // …and how loud they were saying it, which is the yardstick the room test measures against. A
    // handset put down straight after the greeting is the case that needs it most, and it is exactly
    // the case where the ear itself never hears anybody speak.
    if (closeLevel > 0) { this.closeLevel = Math.max(this.closeLevel, closeLevel); this.closePeak = Math.max(this.closePeak, closeLevel); }
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
    // THE FOURTH SHAPE: A LOUD ROOM. Sound that is present but far below the person we have been
    // talking to is a handset lying on the counter, not somebody speaking into it. It is neither
    // quiet nor music nor ringing, so before this it was the one shape that kept Charlie open and
    // billing while Staff walked to the back room (owner: "if we're not smart about how Charlie
    // disconnects we're gonna be in a world of pain"). It is treated exactly like silence.
    const room = loud && !isTone && this.isRoom(energy);
    this.voiced.push(loud && !isTone && !room);
    while (this.voiced.length * FRAME_MS > this.windowMs) this.voiced.shift();
    // THE MEMORY OF HOW LOUD THEY WERE FADES ON EVERY FRAME, THE QUIET ONES INCLUDED. It used to fade
    // only while somebody was already talking, so across a wait it did not fade at all, and whoever
    // came back was measured against the loudest thing said before they left. Anybody quieter than a
    // third of that was written off as the room and could never be heard again, because a voice
    // marked as the room is never allowed to update the yardstick judging it. The floor is what keeps
    // a handset on a counter from creeping past the bar on a long wait.
    if (this.closeLevel > 0) this.closeLevel = Math.max(this.closeLevel * CLOSE_DECAY, this.closePeak * CLOSE_FLOOR);
    // …and drop the speech we heard more than a few seconds ago, so "have they said a word's worth
    // lately" only ever asks about now.
    while (this.backSpeech.length && this.backSpeech[0] < this.elapsed - BACK_WINDOW_MS) this.backSpeech.shift();

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

    if (loud && !room) {
      this.soundMs += FRAME_MS; this.quietMs = 0; this.roomMs = 0;
      // Their own voice sets the yardstick the room is measured against. THE MIDDLE of their recent
      // frames, never the loudest one: a single click or pop on a phone line reads enormously loud,
      // and a yardstick pinned to it made every real voice after it measure as the room — so Staff
      // who came back were never heard and the check sat deaf to its end (robot store checks 270 to
      // 272, all three). The owner's own rule decides the bias: too long costs pennies, too short
      // costs checks. Decaying, so it still follows one person down a line that gets quieter.
      const recent = [...this.soundRecent].sort((a, b) => a - b);
      const mid = recent.length ? recent[Math.floor(recent.length / 2)] : energy;
      this.closeLevel = Math.max(mid, this.closeLevel);
      this.closePeak = Math.max(this.closePeak, this.closeLevel);
      const full = this.voiced.length * FRAME_MS >= this.windowMs
        && this.voiced.filter(Boolean).length / this.voiced.length >= this.voicedFrac;
      if (full && this.soundMs >= this.musicMax) { this.voiceRunMs = 0; this.backSpeech = []; this.runSpeech = []; this.runIsMusic = false; this.enter("music"); }
      // Sound with gaps in it is a person. If we thought they were away, they are back — but only
      // once they have actually said SOMETHING. A single frame ending a hold is the other half of the
      // flapping bug: it ended a hold that had lasted nothing, and the next ring opened another one.
      // A WORD'S WORTH INSIDE THE LAST FEW SECONDS, not a word's worth in one unbroken breath: a
      // person checking whether we are still there says "hello?" and then "are you there?", short
      // things with long pauses, and a run that reset on every pause never reached the bar once
      // (owner's check 298). One click is still one frame and can never add up to it.
      else if (!full) {
        this.heardVoiceMs += FRAME_MS; this.voiceRunMs += FRAME_MS; this.deadAirCalled = false;
        // ON A HOLD, A RUN ONLY BANKS WHEN IT BREAKS (check 377, 08-18). The music resuming after a
        // dip used to bank here frame by frame and end the wait at 400ms, six seconds before Staff
        // spoke, because sound the window cannot yet prove is music reads exactly like a person —
        // until it runs on without a gap, which no speech does and all music does (check 378's
        // tape). So the run in progress is held apart, struck the moment it outgrows a word, and
        // banked at its first break (the else branch below), where the wait still ends backdated
        // to its first frame. Off a hold there is no wait to end, so frames bank straight away.
        if (!this.reason) {
          this.backSpeech.push(this.elapsed);
        } else if (!this.runIsMusic) {
          this.runSpeech.push(this.elapsed);
          if (this.soundMs > MAX_SPEECH_RUN_MS) { this.runSpeech = []; this.runIsMusic = true; }
        }
      }
    } else {
      // A run of sound just ended. If it stayed word-scale it banks as comeback evidence now, and a
      // word's worth inside the window ends the wait — judged here at the break for a steady run,
      // because mid run a steady sound could still be the music resuming (check 377).
      if (this.reason && this.soundMs > 0) {
        if (!this.runIsMusic && this.runSpeech.length) {
          this.backSpeech.push(...this.runSpeech);
          if (this.backSpeech.length * FRAME_MS >= this.backVoiceMs) this.leave();
        }
        this.runSpeech = []; this.runIsMusic = false;
      }
      this.soundMs = 0; this.quietMs += FRAME_MS;
      if (room) this.roomMs += FRAME_MS;
      // A pause long enough to break a word breaks the run of speech with it.
      if (this.quietMs >= VOICE_GAP_MS) this.voiceRunMs = 0;
      // Silence and a room nobody is talking to us from are the same fact for the meter, so they add
      // up together. Which of the two it mostly was decides only what the log calls it.
      if (this.quietMs >= this.quietMax) this.enter(this.roomMs * 2 >= this.quietMs ? "room" : "quiet");
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
    // THE SOUND FROM BEFORE THE WAIT IS NOT EVIDENCE ABOUT THE SOUND AFTER IT. The room test reads a
    // recent stretch of sound, and that stretch used to survive the whole wait: the first thing
    // somebody said on coming back was averaged in with how loud they had been before they left, and
    // then judged against that same number, so the answer was decided before they had said anything.
    // A wait is a new scene. Whoever speaks into it is measured on what they actually sound like now.
    // The speech we heard before they left is cleared for the same reason: it is what they said while
    // they were still here, so it can never be part of the proof that somebody has come back.
    this.soundRecent = [];
    this.backSpeech = [];
    this.runSpeech = []; this.runIsMusic = false;
    const already = reason === "quiet" || reason === "room" ? this.quietMs : reason === "music" ? this.soundMs : this.toneRunMs;
    this.holdStartedAt = Math.max(0, this.elapsed - already);
    this.holdMs += already;
    this.on.holdStart(reason, this.holdStartedAt);
  }

  private leave(): void {
    if (!this.reason) return;
    // They came back when they STARTED talking, not when we had heard enough of it to be sure. The
    // speech that convinced us is theirs, not the hold's, so it comes off both numbers — otherwise
    // every hold reads longer than it was. The first word we still remember hearing is that moment,
    // which is why the times are kept and not just a tally.
    const back = this.backSpeech.length ? this.backSpeech[0] : Math.max(0, this.elapsed - this.voiceRunMs);
    const gap = Math.max(0, back - this.holdStartedAt);
    this.holdMs = Math.max(0, this.holdMs - Math.max(0, this.elapsed - back));
    this.reason = null;
    this.voiceRunMs = 0;
    this.backSpeech = [];
    this.runSpeech = []; this.runIsMusic = false;
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

// ---- THE SOUND FINGERPRINT (owner 08-07, item 2) ------------------------------------------------
// A fingerprint of the SOUND of a stretch of the line, never of the words. The same sound heard
// again, twice inside one call or on a later call to the same number, is a recording with certainty.
// It is the one test that catches HOLD MUSIC, and hold music with an advert talking over it, which
// no word test ever can: an advert is words on top of music, so every word rule calls it a person.
//
// How it is taken: loudness is measured once per 100ms and squashed to one of eight steps, and the
// steps are written down in order. A recording plays back identically every time, so its shape
// repeats exactly. A person never says the same thing with the same loudness twice.
const FP_SLOT_MS = 100;
const FP_STEPS = 8;
export class SoundPrint {
  private slotMs = 0;
  private slotPeak = 0;
  private shape: number[] = [];
  /** Feed one 20ms frame, exactly as the ear gets it. */
  feed(b64: string): void {
    this.slotPeak = Math.max(this.slotPeak, frameEnergy(b64));
    this.slotMs += 20;
    if (this.slotMs < FP_SLOT_MS) return;
    // Eight steps is enough to tell one piece of music from another and coarse enough that the same
    // recording down a slightly noisier line still prints the same.
    const step = Math.min(FP_STEPS - 1, Math.floor((this.slotPeak / 4000) * FP_STEPS));
    this.shape.push(step);
    this.slotMs = 0; this.slotPeak = 0;
  }
  /** The print of the last `seconds` of line, or empty while there is not enough to print. */
  print(seconds = 4): string {
    const want = Math.round((seconds * 1000) / FP_SLOT_MS);
    if (this.shape.length < want) return "";
    return this.shape.slice(-want).join("");
  }
  /** Everything heard so far, so a caller can look for the same shape earlier in the same call. */
  all(): number[] { return this.shape; }
}
/** Has this exact shape been heard before in what we have already listened to? A recording looping
 *  gives itself away here with no words at all, which is what hold music is. */
export function heardThisSoundBefore(shape: number[], print: string): boolean {
  if (!print) return false;
  const upTo = shape.slice(0, Math.max(0, shape.length - print.length)).join("");
  return upTo.includes(print);
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
  /** THE KNOCK (owner 08-07). On a number we have never rung, we press keys DURING the opening
   *  sentence, before any options are read: one key, about a second, then two more quickly. A person
   *  hears beeps in their ear, stops, and says something to us. A recording carries straight on, or
   *  acts on the key, and either of those is a machine. Set once, never repeated. */
  print: SoundPrint;
  soundHeardBefore?: boolean;
  knockAtSec?: number;
  knockDoneAtMs?: number;
  /** The answer, once the sound has given us one. */
  knock?: KnockAnswer;
  /** The quiet running right now since the keys landed, and the longest stretch of it we have heard.
   *  Both are measured off the same frame energy the prompt detector reads, never off the words. */
  knockQuietMs?: number;
  knockStoppedForReal?: boolean;
  /** A number whose menu we already hold never gets knocked: we know what it is. */
  neverKnock?: boolean;
}

const sessions = new Map<string, Session>();
export function listenNavActive(room: string): boolean { return sessions.has(room); }
/** What actually happened on this call — for the debug log and the call ladder. */
export function listenNavFired(room: string): Array<{ value: string; atSec: number; via: string }> {
  return sessions.get(room)?.fired ?? [];
}
/** How many store recordings played on this call — the free drift measure: a menu that grew or lost
 *  a recording since we mapped it shows up here with no speech recognition and no model. */
/** What the knock found out, ready for the judge. Empty until it has been sent and answered. */
export function listenNavKnock(room: string): { knock?: KnockAnswer; soundHeardBefore?: boolean } {
  const s = sessions.get(room);
  if (!s) return {};
  const sound = s.soundHeardBefore ? { soundHeardBefore: true } : {};
  if (s.knock === undefined) return sound;
  return { knock: s.knock, ...sound };
}
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
  /** The lines this chain has played us before. Present means we already know this menu, so the
   *  knock is never sent: memory is a speed-up, never the judge (owner 08-07). */
  knownMenuLines?: string[];
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
    print: new SoundPrint(),
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
  // A NUMBER WHOSE MENU WE ALREADY HOLD IS NEVER KNOCKED. We know what it is, so there is nothing
  // to find out and no reason to put beeps down the line (owner 08-07: memory is a speed-up).
  s.neverKnock = (opts.knownMenuLines || []).some((l: string) => String(l || "").trim().length > 0);
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
  // ONE READING OF THE LINE, shared by the prompt detector and the keys. The keys are answered off
  // this same energy and never off the words (owner 08-08).
  const energy = frameEnergy(b64);
  s.det.feedEnergy(energy);
  // THE SAME SOUND, HEARD AGAIN. Taken on every frame and checked once it has four seconds to
  // compare, so a loop of hold music gives itself away with no words at all (owner 08-07).
  s.print.feed(b64);
  if (!s.soundHeardBefore) {
    const now = s.print.print(4);
    if (now && heardThisSoundBefore(s.print.all(), now)) {
      s.soundHeardBefore = true;
      s.log("listen-nav: this exact sound has already played on this call — a recording");
      try { s.onEvent?.("unknown", "The same sound played again, so this is a recording", { step: "sound_repeat" }); } catch { /* best-effort */ }
    }
  }
  // THE KNOCK (owner 08-07). On a number whose menu we do not already hold, we press keys DURING the
  // opening sentence, before any options are read: one key, about a second, then two more quickly.
  // It is sent ONCE, the moment the store is really talking, and never on a number we already know.
  if (!s.neverKnock && s.knockAtSec == null && s.det.count >= 1 && s.det.lastPromptMs > 0) {
    s.knockAtSec = Math.round((Date.now() - s.startMs) / 1000);
    void knock(s);
  }
  // …AND THE ANSWER, OFF THE SOUND AND NOTHING ELSE (owner 08-08). Three answers, never two. It used
  // to take one reading of the line 1.2 seconds after the keys and call anything quieter than 400ms
  // of noise "it stopped" — so a menu drawing breath between two sentences read as having stopped,
  // which read as a person. Now the quiet has to RUN, long enough that a menu's own phrase gap can
  // never reach it, and what happens after that stop is what tells the two people cases apart.
  if (s.knockDoneAtMs && s.knock === undefined) {
    if (energy > VOICE_THRESH) {
      // Talking again. If it had really stopped first, that stop plus this is somebody speaking to us.
      if (s.knockStoppedForReal) s.knock = "stopped_then_spoke";
      s.knockQuietMs = 0;
    } else {
      s.knockQuietMs = (s.knockQuietMs ?? 0) + FRAME_MS;
      if (s.knockQuietMs >= KNOCK_STOP_MS) s.knockStoppedForReal = true;
      // Stayed quiet right through our own silence. Only a person waits.
      if (s.knockQuietMs >= KNOCK_WAIT_MS) s.knock = "stopped_and_waited";
    }
    // Never really stopped inside the whole window: the noise carried straight through the keys.
    if (s.knock === undefined && !s.knockStoppedForReal && Date.now() - s.knockDoneAtMs >= KNOCK_WINDOW_MS) s.knock = "read_on";
    if (s.knock !== undefined) {
      const said = s.knock === "read_on" ? "It read straight on through the keys, so it is a machine"
        : s.knock === "stopped_then_spoke" ? "It stopped for the keys and then spoke to us, so it is a person"
        : "It stopped for the keys and stayed quiet for us, so it is a person";
      s.log(`listen-nav: the keys say — ${said}`);
      try { s.onEvent?.("unknown", said, { step: "knock", knock: s.knock, atSec: s.knockAtSec }); } catch { /* best-effort */ }
    }
  }
  // NEVER PRESS KEYS AT A PERSON (spec: the live call runtime, section 10). A store we mapped with
  // a menu that now answers directly means our tones go off in a real human's ear. Today we would
  // keep pressing all the way down the list. Now the remaining steps are abandoned and the call
  // goes straight to the conversation.
  if (s.abortOnHuman !== false && looksLikeAPerson({ stepsFired: s.next, promptCount: s.det.count, lastPromptMs: s.det.lastPromptMs, quietMs: s.det.quietMs }, s.tuning)) {
    void handToConversation(s, "someone answered before the menu, the rest of the keys were never pressed");
  }
}

/** ONE KEY, A BEAT, THEN TWO MORE. The owner's own shape. A person hears three beeps in their ear
 *  and stops; a recording does not notice. The waiting document follows so the walk carries on
 *  exactly as it would have. Never sent twice, and never on a number whose menu we already hold. */
async function knock(s: Session): Promise<void> {
  const ok = await updateTwiml(s, `<Play digits="123"/>${HOLD}`);
  s.knockDoneAtMs = Date.now();
  s.log(`listen-nav: knocked at ${s.knockAtSec}s to see whether the talking stops${ok ? "" : " (the carrier refused it)"}`);
  try { s.onEvent?.("unknown", "Pressed a few keys to see whether the talking stops", { step: "knock", atSec: s.knockAtSec }); } catch { /* best-effort */ }
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

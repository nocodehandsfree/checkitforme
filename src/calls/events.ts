// THE CALL RECEIPT — every runtime decision on every call, with its real second.
//
// WHY (owner, 07-26): "It's hard for me to answer you because I don't have all the visibility on the
// code." Two days were lost to mistakes that were invisible until someone read logs by hand — the
// agent opening during the menu, the keypad and spoken lanes silently not being used at all. A call
// that leaves no record can go wrong for days. This module makes every call leave one.
//
// DESIGN RULES
//  1. PURE + SINK-REGISTERED. No db, no config, no vendor names in here. The server registers a sink
//     (setEventSink) exactly like tapedeck registers its finalize hook — so the bridge and the
//     navigator can record without importing the database, and every rule below is unit-testable
//     without booting the app (scripts/test-call-events.ts).
//  2. NEVER ON THE CALL PATH. Recording is best-effort and wrapped: a bad sink can never drop a call.
//  3. ROOM IS THE KEY. The room id exists from before the phone rings, long before we have a
//     conversation id or a call_results row — so the receipt opens on the room and the call id is
//     linked in later, whenever it turns up.
//
// The seconds are the point. Charlie bills every second he is CONNECTED, whether he is talking,
// listening or sitting in silence — muting saves nothing, only closing the socket does. So splitting
// connected time into speaking / listening / silent is not how we save money; it is how we PROVE how
// many seconds we paid for that nobody needed. That number is `avoidableSecs`.

/**
 * THE CLOSED SET. These sixteen and no others — the dashboard is built against exactly this list
 * (Addie, 07-26), so a new kind would silently fall off the screen. Anything finer goes in `detail`,
 * never in a new kind: which key we pressed, which phrase we said, which leg was ringing, why we
 * hung up. Never delete an event; the Admin only ever reads them.
 */
export type EventKind =
  | "dialed"          // we asked the carrier to dial. detail: the lane we PLANNED, and the mapped steps
  | "ringing"         // a phone is ringing. detail.leg: "store" (before pickup) | "desk" (after a transfer)
  | "connected"       // the line was answered
  | "ivr_detected"    // this store has a phone menu and we are about to walk it
  | "alpha_press"     // we sent a keypad tone. detail: the key, the learned second, what triggered it
  | "bravo_say"       // we said a mapped menu word. detail: the phrase, the learned second, the trigger
  | "human_detected"  // a real person is on the line
  | "charlie_join"    // the billed reasoning session opened — the money clock starts here
  | "charlie_leave"   // it closed
  | "hold_start"      // the clerk walked away / hold music, with the session still open
  | "hold_end"
  | "transfer"        // the menu handed us to another extension
  | "voicemail"       // a machine, not a person
  | "unknown"         // something we could not classify. detail says what we saw
  | "verdict"         // the answer the customer got
  | "hangup";         // the call ended. detail: why. On a call with no call_results row (Admin's own
                      // calls) `detail` also carries the seconds and the cost, because they roll up
                      // nowhere else. THE SET STAYS SIXTEEN — finer detail goes in `detail`.

/** Which lane walked this call to a human. Runtime names, from the spec. */
export type Lane = "direct" | "alpha" | "bravo" | "delta" | "unknown";

export interface RtEvent {
  /** Milliseconds from the moment we asked the carrier to dial. */
  atMs: number;
  /** Whole seconds from dial — what a human reads on the timeline. */
  atSec: number;
  kind: EventKind;
  /** Plain-English one-liner for the timeline. Never a code identifier. */
  note?: string;
  /** Structured extras (digits pressed, words spoken, why a decision went the way it did). */
  detail?: Record<string, unknown>;
}

/** Raw seconds meters, accumulated live by the bridge as audio flows. Milliseconds internally so
 *  nothing is lost to rounding until the very end. */
export interface Meters {
  // STAMPS — a moment, or null because it never happened. Deliberately NOT zero: a receipt starts
  // its clock at dial, so "millisecond 0" is a real moment, and reading 0 as "never" would quietly
  // erase anything that happened in the first instant of a call.
  /** When the billed reasoning session opened / closed, ms from dial. */
  charlieOpenMs: number | null;
  charlieCloseMs: number | null;
  /** The line was answered (the carrier's own "in-progress"), ms from dial. */
  answeredMs: number | null;
  /** A real person was detected, ms from dial. */
  humanMs: number | null;
  /** The menu finished, ms from dial. */
  navEndMs: number | null;
  /** The call ended, ms from dial. */
  endMs: number | null;
  // DURATIONS — running totals, always a number.
  /** Agent audio actually played out onto the line. */
  speakingMs: number;
  /** Store-side audio loud enough to be someone talking, while the agent was connected. */
  listeningMs: number;
  /** A phone ringing on the far end WHILE the agent was connected and billing — a transfer to a desk
   *  nobody is at. Identified by the network's own ring frequencies, not guessed from loudness. */
  ringingMs: number;
  /** The clerk walked away or put us on hold with the agent still connected. Null until a call
   *  actually runs the ear that measures it, so "we never checked" still reads differently from
   *  "it was zero". */
  holdMs: number | null;
}

/** One stretch of the reasoning agent being connected. Normally there is exactly one. If he is
 *  closed for a hold and reopened when somebody comes back, each session is a NUMBERED SEGMENT of
 *  the same call — never a separate call (hard rule 1). The Twilio call and our room id stay
 *  canonical across all of them. */
export interface CharlieSegment {
  n: number;                       // 1-based
  providerCallId?: string;         // the provider's own conversation id for this segment
  openMs: number;                  // ms from dial
  closeMs: number | null;          // null = still open
  /** Which brain served it: the provider's hosted model, or our own account (section 7). */
  brain: "hosted" | "ours";
  why?: string;                    // why this segment started, when it is not the first
}

const zeroMeters = (): Meters => ({
  charlieOpenMs: null, charlieCloseMs: null, answeredMs: null, humanMs: null,
  navEndMs: null, endMs: null, speakingMs: 0, listeningMs: 0, ringingMs: 0, holdMs: null,
});

export interface Receipt {
  room: string;
  startMs: number;
  /** call_results.id — linked in whenever the row exists (may be after the call starts). */
  callId?: number;
  /** Provider-side conversation id, for cross-checking a bill. */
  providerCallId?: string;
  lane: Lane;
  /** What the map told us to do, so a replay shows plan vs reality side by side. */
  planned: Array<{ action: string; value: string; atSec: number }>;
  /** WHICH saved version of the store's menu ran this call. Null = no saved version, not version 0. */
  mapVersion?: number | null;
  /** The check this one is a retry of, so tries-per-answer is countable. */
  attemptOf?: number | null;
  /** Every stretch the agent was connected for. One entry on an ordinary call. */
  segments: CharlieSegment[];
  /** WHAT WAS SAID, as we heard it live (hard rule 2). Text only — never audio, on any path. The
   *  provider's own post-call version becomes supporting evidence, not the record. */
  transcript: Array<{ atMs: number; who: "Agent" | "Clerk"; text: string }>;
  events: RtEvent[];
  meters: Meters;
  closed: boolean;
}

const receipts = new Map<string, Receipt>();
/** Rooms whose receipt was already flushed — a late event must not resurrect one. */
const flushed = new Set<string>();

/** How long a receipt lives in memory before it is dropped (a call that never reported an end). */
const RECEIPT_TTL_MS = 15 * 60 * 1000;

// ---- the sink -------------------------------------------------------------------------------
// Registered by the server so this module never imports the database. Same idiom as tapedeck's
// finalize hook: the engine stays pure, the app wires the plumbing.
type Sink = (r: Receipt) => void | Promise<void>;
let sink: Sink | null = null;
export function setEventSink(fn: Sink): void { sink = fn; }

// ---- recording ------------------------------------------------------------------------------

/** Open a receipt for a call. Called at dial, before the phone rings. Idempotent per room. */
export function openReceipt(room: string, opts?: { lane?: Lane; planned?: Receipt["planned"]; callId?: number; note?: string; mapVersion?: number | null; attemptOf?: number | null }): Receipt {
  const existing = receipts.get(room);
  if (existing) return existing;
  const r: Receipt = {
    room, startMs: Date.now(), callId: opts?.callId, lane: opts?.lane ?? "unknown",
    planned: opts?.planned ?? [], events: [], meters: zeroMeters(), closed: false,
    mapVersion: opts?.mapVersion ?? null, attemptOf: opts?.attemptOf ?? null, segments: [], transcript: [],
  };
  receipts.set(room, r);
  setTimeout(() => { if (receipts.get(room) === r) receipts.delete(room); }, RECEIPT_TTL_MS);
  // The PLANNED lane rides in the detail, never as the row's answer. The row gets the route that
  // really ran, worked out at the end from what actually fired (Addie: "the real route, not the
  // chain's guess"). Plan and reality sitting side by side is how a bad map shows itself.
  emit(room, "dialed", opts?.note || "Dialing the store", { plannedLane: r.lane, plan: r.planned });
  return r;
}

/** Which lane is walking this call, decided from the plan we are about to run — never guessed after
 *  the fact. Presses only = keypad (Alpha), any spoken word = spoken menu (Bravo), no steps at all =
 *  the phone rings a person (Direct). This is the stamp that makes "the lanes weren't even being
 *  used" visible on day one instead of two days later (owner 07-26). */
export function laneFor(steps: Array<{ action: string }>): Lane {
  if (!steps.length) return "direct";
  return steps.some((s) => s.action === "say") ? "bravo" : "alpha";
}

/** Plain-English name for a lane — this text is what a person reads on the timeline. */
export function laneNote(lane: Lane): string {
  return lane === "direct" ? "Rings a person directly, no menu"
    : lane === "alpha" ? "Keypad menu, presses the mapped numbers"
    : lane === "bravo" ? "Spoken menu, says the mapped words"
    : lane === "delta" ? "Recorded lines and a cheap listener, no live agent"
    : "No map for this store yet";
}

/** Record one runtime event. Best-effort: never throws into the call path. */
export function emit(room: string, kind: EventKind, note?: string, detail?: Record<string, unknown>): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return;
    const atMs = Date.now() - r.startMs;
    r.events.push({ atMs, atSec: Math.round(atMs / 1000), kind, note, detail });
    if (r.events.length > 400) r.events.splice(0, r.events.length - 400); // runaway guard
  } catch { /* recording must never break a call */ }
}

/**
 * ADD FACTS TO AN EVENT ALREADY ON THE TIMELINE. The last one of its kind, which is the one still
 * being lived through.
 *
 * WHY (owner, 07-28: "it opens charlie_join three times"): one agent joining one call used to write
 * three lines that all read as the agent joining — the recorded question starting, his session
 * opening, and the handover when the question finished. The event set is a closed sixteen and the
 * Admin prints the note of every line, so three of them read as three joins on a call with one.
 *
 * The three are ONE story with details, not three events. The details are worth keeping (which
 * signal confirmed the question had played, how many frames of the answer we were holding), so they
 * are attached to the single line rather than each getting one of their own. Best-effort, like every
 * other recorder here — a missing event is simply not amended.
 */
export function amend(room: string, kind: EventKind, patch: Record<string, unknown>): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return;
    for (let i = r.events.length - 1; i >= 0; i--) {
      if (r.events[i].kind !== kind) continue;
      r.events[i].detail = { ...(r.events[i].detail ?? {}), ...patch };
      return;
    }
  } catch { /* recording must never break a call */ }
}

/**
 * ONE LINE OF WHAT WAS SAID, AS WE HEARD IT (spec: the live call runtime, hard rule 2).
 *
 * "Our receipt is the source of truth for the transcript, the timings and the verdict. The voice
 * provider's post-call webhook becomes supporting evidence, not the record." The timings and the
 * verdict were already ours; the words were not — they were read back from the provider afterwards,
 * which means a call whose webhook never lands has no transcript at all, and a provider that
 * rewrites its own history rewrites ours.
 *
 * So each line is recorded HERE, live, in the order it happened, against the same clock as every
 * other event on this call. TEXT ONLY — no audio, ever, on any path.
 */
export function recordLine(room: string, who: "Agent" | "Clerk", text: string): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return;
    const t = String(text || "").trim();
    if (!t) return;
    r.transcript.push({ atMs: Math.max(0, Date.now() - r.startMs), who, text: t.slice(0, 1000) });
    if (r.transcript.length > 300) r.transcript.splice(0, r.transcript.length - 300); // runaway guard
  } catch { /* recording must never break a call */ }
}

/** The conversation as WE heard it, oldest first. */
export function transcriptOf(r: Receipt): string {
  return r.transcript.map((l) => `${l.who}: ${l.text}`).join("\n");
}

/** Attach the call_results row id once it exists. */
export function linkCall(room: string, callId: number): void {
  const r = receipts.get(room);
  if (r && !r.closed) r.callId = callId;
}

/** Attach the provider's conversation id so a receipt can be checked against a bill. The FIRST one
 *  stays the call's id; later segments carry their own (see openSegment). */
export function linkProviderCall(room: string, providerCallId: string): void {
  const r = receipts.get(room);
  if (!r || r.closed) return;
  if (!r.providerCallId) r.providerCallId = providerCallId;
  const open = r.segments.find((s) => s.closeMs === null);
  if (open && !open.providerCallId) open.providerCallId = providerCallId;
}

/**
 * The agent's session opened. One call can have several of these — he may be closed for a hold and
 * reopened when somebody comes back — and they are numbered stretches of ONE call, never separate
 * calls. Returns the segment number so the caller can log it.
 */
export function openSegment(room: string, brain: "hosted" | "ours", why?: string): number {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return 1;
    const n = r.segments.length + 1;
    r.segments.push({ n, openMs: Math.max(0, Date.now() - r.startMs), closeMs: null, brain, why });
    return n;
  } catch { return 1; }
}

/** The agent's session closed. Silent when there is nothing open — a double close must not throw. */
export function closeSegment(room: string): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return;
    const open = [...r.segments].reverse().find((s) => s.closeMs === null);
    if (open) open.closeMs = Math.max(0, Date.now() - r.startMs);
  } catch { /* recording must never break a call */ }
}

/**
 * The route that ACTUALLY ran, read back off what really fired — not the plan we started with.
 * A store mapped as a keypad menu that answered on the first ring really ran direct, and the row
 * must say so, or nobody can tell that a lane has quietly stopped being used.
 */
export function actualLane(r: Receipt): Lane {
  const kinds = new Set(r.events.map((e) => e.kind));
  if (kinds.has("bravo_say")) return "bravo";
  if (kinds.has("alpha_press")) return "alpha";
  // Nothing was pressed or said. If the call got anywhere at all, it rang straight through.
  if (kinds.has("human_detected") || kinds.has("connected")) return "direct";
  return "unknown";
}

/** Stamps: a moment in the call. Every caller measures from ITS OWN start (the bridge socket opens
 *  long after we dialled), so nobody may pass a duration — they say "now" and the receipt, which is
 *  the only thing that knows when we dialled, does the arithmetic. First write wins: a human is
 *  detected once. */
const STAMPS = ["answeredMs", "humanMs", "navEndMs", "charlieOpenMs", "charlieCloseMs", "endMs"] as const;
export type StampKey = typeof STAMPS[number];
export function markNow(room: string, key: StampKey): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed || r.meters[key] !== null) return; // first write wins: a person is detected once
    r.meters[key] = Math.max(0, Date.now() - r.startMs);
  } catch { /* recording must never break a call */ }
}

/** Durations: add milliseconds to a running total. */
export function addMs(room: string, key: "speakingMs" | "listeningMs" | "ringingMs" | "holdMs", ms: number): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed || !Number.isFinite(ms) || ms <= 0) return;
    r.meters[key] = (r.meters[key] ?? 0) + ms;
  } catch { /* recording must never break a call */ }
}

/**
 * "We are now measuring this." Turns a meter that means "never checked" (null) into a real,
 * measured zero — which is a different fact, and the dashboard has to be able to tell them apart.
 * Called when the ear that measures hold time actually attaches to a call; a call that never got
 * that far keeps its null and says so honestly.
 */
export function startMeter(room: string, key: "holdMs"): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed) return;
    if (r.meters[key] === null) r.meters[key] = 0;
  } catch { /* recording must never break a call */ }
}

export function getReceipt(room: string): Receipt | null { return receipts.get(room) ?? null; }

/** Close the receipt and hand it to the sink exactly once. */
export function closeReceipt(room: string, note?: string, reason?: string): Receipt | null {
  const r = receipts.get(room);
  if (!r || r.closed || flushed.has(room)) return null;
  emit(room, "hangup", note || "Call ended", reason ? { reason } : undefined);
  r.closed = true;
  if (r.meters.endMs === null) r.meters.endMs = Math.max(0, Date.now() - r.startMs);
  // A session still open when the line drops was billing right up to the end.
  if (r.meters.charlieOpenMs !== null && r.meters.charlieCloseMs === null) r.meters.charlieCloseMs = r.meters.endMs;
  flushed.add(room);
  setTimeout(() => flushed.delete(room), RECEIPT_TTL_MS);
  try { void sink?.(r); } catch { /* persistence is best-effort */ }
  return r;
}

// ---- the roll-up ----------------------------------------------------------------------------

/**
 * What a finished check records. These field names ARE the dashboard's contract (Addie, 07-26) —
 * renaming one silently blanks a column on her screen. Pure, and unit-tested.
 *
 * A number that we do not truly measure is `null`, never 0. "We never checked" and "it was zero"
 * are different facts and a dashboard must be able to tell them apart.
 */
export interface Rollup {
  /** The route that really ran, from what actually fired. Never the chain's guess. */
  lane: Lane;
  /** Whole seconds the carrier leg was up. */
  callSecs: number;
  /** Dial → a person is on the line. Null = we never reached one. */
  navSeconds: number | null;
  /** Person on the line → hang up. Null = we never reached one. */
  talkSeconds: number | null;
  /** Session open, total. THIS is what we are billed. */
  charlieConnectedSeconds: number;
  /** Of that, seconds somebody was actually speaking. Connected minus this is the waste. */
  charlieTalkingSeconds: number;
  /** The waste, spelled out so nobody has to subtract. */
  charlieSilentSeconds: number;
  /** The two halves of talking time, kept because they answer different questions. */
  speakingSecs: number;
  listeningSecs: number;
  /** A desk ringing while the session was open and billing. */
  ringSeconds: number;
  /** Clerk away / hold music while the session was open. Null until hold detection ships. */
  holdSeconds: number | null;
  /** Whole minutes the carrier charged, rounded up. */
  billedMinutes: number;
  /** Seconds spent walking the menu (dial → menu finished). Null on a store with no menu. */
  menuSeconds: number | null;
  /** How many mapped steps fired, and how many fired on a real pause instead of the clock. */
  stepsFired: number;
  stepsOnPause: number;
  charlieJoined: boolean;
  /** How many times his session was opened on this call. More than one = he was closed for a hold
   *  and brought back. */
  charlieSegments: number;
  /** WHICH brain served this call: the voice provider's hosted model, or our own account. Null when
   *  he never joined. Without this the cost comparison the switch exists to prove is unprovable. */
  brain: "hosted" | "ours" | "mixed" | null;
  /** What the walk to a person actually achieved, for Mapper. It reads the record; nothing calls it. */
  navOutcome: NavOutcome;
}

/**
 * The navigation outcome Mapper reads off the receipt (section 10). Deliberately only the half the
 * Ear can honestly judge — "wrong department" needs somebody to understand *this is the pharmacy*,
 * which is words, which is Charlie, and that half is assembled from the conversation.
 */
export type NavOutcome =
  | "reached_a_person"        // somebody answered and we talked to them
  | "still_ringing"           // the menu finished and the desk just rang out
  | "never_reached_anyone"    // the call ended without a person
  | "route_failed"            // we had mapped steps and they did not run
  | "no_route";               // nothing was mapped for this store

export function navOutcomeOf(r: Receipt): NavOutcome {
  const kinds = new Set(r.events.map((e) => e.kind));
  const planned = r.planned.length;
  const fired = r.events.filter((e) => e.kind === "alpha_press" || e.kind === "bravo_say").length;
  if (r.meters.humanMs !== null || kinds.has("human_detected")) return "reached_a_person";
  if (planned && fired < planned) return "route_failed";
  // The desk was ringing and nobody ever came. Distinct from "we never got anywhere": the route
  // worked, the store just did not pick up, and those two must not be confused in the evidence.
  if (r.events.some((e) => e.kind === "ringing" && e.detail?.leg === "desk")) return "still_ringing";
  return planned ? "never_reached_anyone" : "no_route";
}

/** Split a finished receipt into the seconds that matter. Everything rounds ONCE, at the end. */
export function rollup(r: Receipt): Rollup {
  const m = r.meters;
  const sec = (ms: number) => Math.max(0, Math.round(ms / 1000));
  // BILLED TIME IS THE SUM OF THE STRETCHES HE WAS ACTUALLY OPEN, not first-open to last-close.
  // When he is closed for a hold and reopened, the gap between segments is time nobody paid for, and
  // measuring it as one long session would invent a cost that never existed — which would make the
  // saving from closing him invisible, i.e. exactly backwards.
  const segMs = r.segments.filter((s) => s.closeMs !== null).reduce((t, s) => t + Math.max(0, (s.closeMs as number) - s.openMs), 0);
  const charlieMs = r.segments.length
    ? segMs
    : (m.charlieOpenMs !== null && m.charlieCloseMs !== null ? Math.max(0, m.charlieCloseMs - m.charlieOpenMs) : 0);
  // Speaking and listening are measured independently and can overlap (a clerk talking over the
  // agent). Cap their sum at the connected time so silence can never read negative.
  const talkMs = Math.min(charlieMs, m.speakingMs + m.listeningMs);
  const speakingMs = Math.min(m.speakingMs, talkMs);
  const listeningMs = Math.max(0, talkMs - speakingMs);
  const steps = r.events.filter((e) => e.kind === "alpha_press" || e.kind === "bravo_say");
  // The three parts MUST add back up to the billed seconds. Rounding each one on its own lets them
  // miss by a second, which on a dashboard reads as a bug in the meter. So the two measured parts
  // round, and dead air is whatever is left — it is the derived number, not a measured one.
  const charlieSecs = sec(charlieMs);
  const speakingSecs = Math.min(sec(speakingMs), charlieSecs);
  const listeningSecs = Math.min(sec(listeningMs), charlieSecs - speakingSecs);
  const silentSecs = charlieSecs - speakingSecs - listeningSecs;
  const callSecs = sec(m.endMs ?? 0);
  // Ringing on the far end is NOT someone talking, so it comes out of listening before the split —
  // otherwise a desk ringing into an empty room would read as a conversation we needed to pay for.
  const ringSeconds = Math.min(sec(m.ringingMs), charlieSecs);
  return {
    lane: actualLane(r),
    callSecs,
    navSeconds: m.humanMs !== null ? sec(m.humanMs) : null,
    talkSeconds: m.humanMs !== null ? Math.max(0, callSecs - sec(m.humanMs)) : null,
    charlieConnectedSeconds: charlieSecs,
    charlieTalkingSeconds: speakingSecs + listeningSecs,
    charlieSilentSeconds: silentSecs,
    speakingSecs,
    listeningSecs,
    ringSeconds,
    holdSeconds: m.holdMs !== null ? sec(m.holdMs) : null,
    billedMinutes: callSecs > 0 ? Math.ceil(callSecs / 60) : 0,
    menuSeconds: m.navEndMs !== null ? sec(m.navEndMs) : null,
    stepsFired: steps.length,
    stepsOnPause: steps.filter((e) => e.detail?.via === "prompt").length,
    charlieJoined: m.charlieOpenMs !== null,
    charlieSegments: r.segments.length,
    brain: !r.segments.length ? null
      : r.segments.every((s) => s.brain === "ours") ? "ours"
      : r.segments.every((s) => s.brain === "hosted") ? "hosted" : "mixed",
    navOutcome: navOutcomeOf(r),
  };
}

/**
 * THE STAMPED ROW, READ BACK AS THE SAME ROLL-UP A LIVE CALL PRODUCES.
 *
 * WHY THIS EXISTS (owner, 07-28): "one envelope, two answers." A finished call was rolled up in two
 * different places — by call id it came back complete, and by room it came back with the seconds and
 * the cost NULL, because the by-room reader only knew how to find them on the LAST EVENT'S DETAIL.
 * That is only where they live for a call with no call_results row (an Admin one-off). An ATTACHED
 * call stamps them on the row instead, and nothing was reading them back off it. Same call, same
 * envelope, two different answers depending on which door you came in.
 *
 * So the read-back lives HERE, once, next to the roll-up it has to agree with. Pure — the caller
 * hands in the row and the timeline it already loaded.
 *
 * A number the row never stamped stays NULL. A row written by an older build has some of these
 * columns and not others, and reporting the ones it happens to have would put a nonsense pair on
 * screen: nought seconds connected beside a second of dead air. So if the connected time was never
 * stamped, the whole agent block reads as unmeasured, which is the truth.
 */
export interface StampedCall {
  lane?: string | null;
  callSeconds?: number | null;
  navSeconds?: number | null;
  talkSeconds?: number | null;
  charlieConnectedSeconds?: number | null;
  charlieTalkingSeconds?: number | null;
  charlieSpeakingSeconds?: number | null;
  charlieListeningSeconds?: number | null;
  charlieSilentSeconds?: number | null;
  ringSeconds?: number | null;
  holdSeconds?: number | null;
  billedMinutes?: number | null;
  menuSeconds?: number | null;
  brain?: string | null;
  navOutcome?: string | null;
  charlieSegments?: number | null;
}
export function rollupFromRow(call: StampedCall, timeline: Array<{ kind: string; atSec?: number | null; detail?: unknown }>): Rollup {
  const steps = timeline.filter((t) => t.kind === "alpha_press" || t.kind === "bravo_say");
  // HOW LONG THE WHOLE CHECK TOOK. The row's own column is only ever written by the OLD path, off the
  // number the voice provider hands back — so on every check the new engine placed it is null, and
  // the screen printed a 33 second check as 0s (owner 07-30). The timeline is right here and its last
  // line is the hang-up, which is the same second by construction. Read it rather than print a nought.
  const lastSec = timeline.length ? Number(timeline[timeline.length - 1].atSec ?? 0) : 0;
  const callSecs = call.callSeconds ?? (lastSec > 0 ? lastSec : 0);
  const stamped = call.charlieConnectedSeconds != null;
  // How many stretches the agent was open for. The row carries it on every call written by the new
  // engine; older rows do not, so it is read back off the timeline the same way it always was.
  const joins = timeline.filter((t) => t.kind === "charlie_join" && (t.detail as { segment?: number } | null)?.segment != null).length;
  return {
    lane: (call.lane ?? "unknown") as Lane,
    callSecs,
    navSeconds: call.navSeconds ?? null,
    talkSeconds: call.talkSeconds ?? null,
    charlieConnectedSeconds: stamped ? call.charlieConnectedSeconds! : 0,
    charlieTalkingSeconds: stamped ? (call.charlieTalkingSeconds ?? 0) : 0,
    charlieSilentSeconds: stamped ? (call.charlieSilentSeconds ?? 0) : 0,
    speakingSecs: stamped ? (call.charlieSpeakingSeconds ?? 0) : 0,
    listeningSecs: stamped ? (call.charlieListeningSeconds ?? 0) : 0,
    ringSeconds: stamped ? (call.ringSeconds ?? 0) : 0,
    holdSeconds: call.holdSeconds ?? null,
    billedMinutes: call.billedMinutes ?? (callSecs > 0 ? Math.ceil(callSecs / 60) : 0),
    menuSeconds: call.menuSeconds ?? null,
    stepsFired: steps.length,
    stepsOnPause: steps.filter((t) => (t.detail as { via?: string } | null)?.via === "prompt").length,
    charlieJoined: stamped && (call.charlieConnectedSeconds ?? 0) > 0,
    charlieSegments: call.charlieSegments ?? joins,
    brain: (call.brain ?? null) as Rollup["brain"],
    navOutcome: (call.navOutcome ?? "no_route") as NavOutcome,
  };
}

/** For tests and for the replay API: a receipt built from raw parts without touching the clock. */
export function _receiptFrom(parts: { room?: string; lane?: Lane; events?: RtEvent[]; meters?: Partial<Meters>; planned?: Receipt["planned"]; segments?: CharlieSegment[]; transcript?: Receipt["transcript"] }): Receipt {
  return {
    room: parts.room ?? "test", startMs: 0, lane: parts.lane ?? "unknown", planned: parts.planned ?? [],
    events: parts.events ?? [], meters: { ...zeroMeters(), ...(parts.meters ?? {}) }, closed: true,
    segments: parts.segments ?? [], transcript: parts.transcript ?? [],
  };
}

/** Test-only: forget every in-memory receipt. */
export function _reset(): void { receipts.clear(); flushed.clear(); sink = null; }

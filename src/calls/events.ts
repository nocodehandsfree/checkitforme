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

/** Everything the runtime can record. The spec's minimum list, plus what the lanes actually do. */
export type EventKind =
  // lifecycle
  | "call_started" | "ringing" | "connected" | "completed"
  // routing
  | "lane" | "nav_armed" | "nav_step" | "nav_done"
  // the doorman: who/what is on the line
  | "ear_open" | "desk_ringing" | "ring_unanswered" | "human_detected"
  | "voicemail" | "hold" | "transfer" | "gave_up" | "unknown"
  // the reasoning layer
  | "charlie_joined" | "charlie_left"
  // deterministic conversation lane (Delta)
  | "delta_decision"
  // outcome
  | "inventory_status";

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
}

const zeroMeters = (): Meters => ({
  charlieOpenMs: null, charlieCloseMs: null, answeredMs: null, humanMs: null,
  navEndMs: null, endMs: null, speakingMs: 0, listeningMs: 0,
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
export function openReceipt(room: string, opts?: { lane?: Lane; planned?: Receipt["planned"]; callId?: number; note?: string }): Receipt {
  const existing = receipts.get(room);
  if (existing) return existing;
  const r: Receipt = {
    room, startMs: Date.now(), callId: opts?.callId, lane: opts?.lane ?? "unknown",
    planned: opts?.planned ?? [], events: [], meters: zeroMeters(), closed: false,
  };
  receipts.set(room, r);
  setTimeout(() => { if (receipts.get(room) === r) receipts.delete(room); }, RECEIPT_TTL_MS);
  emit(room, "call_started", opts?.note || "Dialing the store", { lane: r.lane, steps: r.planned.length });
  if (opts?.lane) emit(room, "lane", laneNote(opts.lane), { lane: opts.lane });
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

/** Attach the call_results row id once it exists. */
export function linkCall(room: string, callId: number): void {
  const r = receipts.get(room);
  if (r && !r.closed) r.callId = callId;
}

/** Attach the provider's conversation id so a receipt can be checked against a bill. */
export function linkProviderCall(room: string, providerCallId: string): void {
  const r = receipts.get(room);
  if (r && !r.closed) r.providerCallId = providerCallId;
}

/** Set (or correct) the lane once the runtime knows which one it really used. */
export function setLane(room: string, lane: Lane): void {
  const r = receipts.get(room);
  if (!r || r.closed || r.lane === lane) return;
  r.lane = lane;
  emit(room, "lane", laneNote(lane), { lane });
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

/** Durations: add milliseconds to a running total. Only the two audio meters accumulate. */
export function addMs(room: string, key: "speakingMs" | "listeningMs", ms: number): void {
  try {
    const r = receipts.get(room);
    if (!r || r.closed || !Number.isFinite(ms) || ms <= 0) return;
    r.meters[key] += ms;
  } catch { /* recording must never break a call */ }
}

export function getReceipt(room: string): Receipt | null { return receipts.get(room) ?? null; }

/** Close the receipt and hand it to the sink exactly once. */
export function closeReceipt(room: string, note?: string): Receipt | null {
  const r = receipts.get(room);
  if (!r || r.closed || flushed.has(room)) return null;
  emit(room, "completed", note || "Call ended");
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

/** The numbers a person actually asks for, derived from a finished receipt. Pure — unit-tested. */
export interface Rollup {
  lane: Lane;
  /** Whole seconds the carrier leg was up. */
  callSecs: number;
  /** Seconds from dial until a real person was on the line. Null = never reached one. */
  timeToAnswerSecs: number | null;
  /** Seconds spent walking the menu (dial → menu finished). 0 on a direct-dial store. */
  navSecs: number;
  /** Seconds the billed reasoning session was open. This is what we pay for. */
  charlieSecs: number;
  /** Of those seconds: agent talking / a person talking / nobody talking. They sum to charlieSecs. */
  speakingSecs: number;
  listeningSecs: number;
  silentSecs: number;
  /** Seconds Charlie was on the line with someone actually talking — what we needed to buy. */
  neededSecs: number;
  /** Seconds Charlie was on the line with dead air — what we would like back. */
  avoidableSecs: number;
  /** How many mapped steps fired, and how many of those fired on a real pause vs the clock. */
  stepsFired: number;
  stepsOnPause: number;
  /** Did the reasoning layer ever join? */
  charlieJoined: boolean;
}

/** Split a finished receipt into the seconds that matter. Everything rounds ONCE, at the end. */
export function rollup(r: Receipt): Rollup {
  const m = r.meters;
  const sec = (ms: number) => Math.max(0, Math.round(ms / 1000));
  const charlieMs = m.charlieOpenMs !== null && m.charlieCloseMs !== null ? Math.max(0, m.charlieCloseMs - m.charlieOpenMs) : 0;
  // Speaking and listening are measured independently and can overlap (a clerk talking over the
  // agent). Cap their sum at the connected time so silence can never read negative.
  const talkMs = Math.min(charlieMs, m.speakingMs + m.listeningMs);
  const speakingMs = Math.min(m.speakingMs, talkMs);
  const listeningMs = Math.max(0, talkMs - speakingMs);
  const steps = r.events.filter((e) => e.kind === "nav_step");
  // The three parts MUST add back up to the billed seconds. Rounding each one on its own lets them
  // miss by a second, which on a dashboard reads as a bug in the meter. So the two measured parts
  // round, and dead air is whatever is left — it is the derived number, not a measured one.
  const charlieSecs = sec(charlieMs);
  const speakingSecs = Math.min(sec(speakingMs), charlieSecs);
  const listeningSecs = Math.min(sec(listeningMs), charlieSecs - speakingSecs);
  const silentSecs = charlieSecs - speakingSecs - listeningSecs;
  return {
    lane: r.lane,
    callSecs: sec(m.endMs ?? 0),
    timeToAnswerSecs: m.humanMs !== null ? sec(m.humanMs) : null,
    navSecs: m.navEndMs !== null ? sec(m.navEndMs) : 0,
    charlieSecs,
    speakingSecs,
    listeningSecs,
    silentSecs,
    neededSecs: speakingSecs + listeningSecs,
    avoidableSecs: silentSecs,
    stepsFired: steps.length,
    stepsOnPause: steps.filter((e) => e.detail?.via === "prompt").length,
    charlieJoined: m.charlieOpenMs !== null,
  };
}

/** For tests and for the replay API: a receipt built from raw parts without touching the clock. */
export function _receiptFrom(parts: { room?: string; lane?: Lane; events?: RtEvent[]; meters?: Partial<Meters> }): Receipt {
  return {
    room: parts.room ?? "test", startMs: 0, lane: parts.lane ?? "unknown", planned: [],
    events: parts.events ?? [], meters: { ...zeroMeters(), ...(parts.meters ?? {}) }, closed: true,
  };
}

/** Test-only: forget every in-memory receipt. */
export function _reset(): void { receipts.clear(); flushed.clear(); sink = null; }

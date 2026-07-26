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
  /** @param onBoundary called with the prompt index (1-based) when a prompt finishes. */
  constructor(private onBoundary: (n: number) => void) {}
  feedEnergy(e: number): void {
    if (e > VOICE_THRESH) {
      this.voicedRun++;
      this.silenceMs = 0;
      // Two voiced frames in a row start a burst — one stray loud frame does not.
      if (this.voicedRun >= 2) { this.speaking = true; this.speechMs += FRAME_MS; }
    } else {
      this.voicedRun = 0;
      if (this.speaking) {
        this.silenceMs += FRAME_MS;
        if (this.silenceMs >= END_SILENCE_MS) {
          const wasReal = this.speechMs >= MIN_SPEECH_MS;
          this.speaking = false; this.speechMs = 0; this.silenceMs = 0;
          if (wasReal) { this.count++; this.onBoundary(this.count); }
        }
      }
    }
  }
  feed(b64: string): void { this.feedEnergy(frameEnergy(b64)); }
}

// ---- the recording plan (which recording each step waits for) -------------------------------
// The bridge builds its step list from the flat "value@seconds" strings, which cannot carry
// `afterPrompt`. Rather than change the frozen call-placing code, the caller STAGES the plan just
// before dialling and this file claims it by the exact same step list. Key = the steps themselves,
// so a claim can only ever match a call running the identical route.
const stagedPlans = new Map<string, { afterPrompt: Array<number | undefined>; at: number }>();
const PLAN_TTL_MS = 10 * 60 * 1000;

export function navPlanKey(steps: Array<{ action: string; value: string; atSec: number }>): string {
  return steps.map((s) => `${s.action}:${String(s.value).trim().toLowerCase()}@${Math.round(s.atSec)}`).join(",");
}

/** Stage which recording each step waits for, for the next call that runs this exact route. */
export function stageNavPromptPlan(steps: Array<{ action: string; value: string; atSec: number; afterPrompt?: number }>): void {
  if (!steps.length || !steps.some((s) => typeof s.afterPrompt === "number")) return;
  const now = Date.now();
  for (const [k, v] of stagedPlans) if (now - v.at > PLAN_TTL_MS) stagedPlans.delete(k);
  stagedPlans.set(navPlanKey(steps), { afterPrompt: steps.map((s) => s.afterPrompt), at: now });
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

/** Merge a staged plan onto the steps the bridge parsed. Same route, same order, same count — or we
 *  leave the steps exactly as they came and the call behaves like today. */
function claimPromptPlan(steps: NavStep[]): NavStep[] {
  const hit = stagedPlans.get(navPlanKey(steps));
  if (!hit || hit.afterPrompt.length !== steps.length) return steps;
  return steps.map((s, i) => (typeof hit.afterPrompt[i] === "number" ? { ...s, afterPrompt: hit.afterPrompt[i] } : s));
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
    s.onEvent?.("nav_step", step.action === "press"
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
    try { s.onEvent?.("nav_done", `Menu walked in ${at}s (the map said ${s.steps[s.steps.length - 1]?.atSec ?? at}s)`, { atSec: at, mappedAtSec: s.steps[s.steps.length - 1]?.atSec ?? null }); } catch { /* best-effort */ }
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
}): void {
  const log = opts.log || (() => { /* silent */ });
  if (!opts.steps.length || !opts.callSid) return;
  const steps = claimPromptPlan(opts.steps);
  const s: Session = {
    room: opts.room, callSid: opts.callSid, steps, next: 0, startMs: Date.now(),
    lastFiredAtSec: 0, timers: [], bridgeUrl: opts.bridgeUrl, done: false, log,
    onNavEnd: opts.onNavEnd, onEvent: opts.onEvent, fired: [],
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
  try { opts.onEvent?.("nav_armed", `Ready to walk a ${steps.length} step menu, each step waits for the store to stop talking`, { steps }); } catch { /* best-effort */ }
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

export const _test = { LEAD_SEC, GRACE_SEC, MIN_SPEECH_MS, END_SILENCE_MS, VOICE_THRESH, FRAME_MS };

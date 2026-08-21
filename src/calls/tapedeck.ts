// D-lane (Delta). Twilio places the call; we handle it entirely with pre-synthesized clips in the
// workflow's voice + a cheap classifier (no live agent, ~2.5c/check). Two modes share ONE engine:
//   • bench  — dials the owner's phone to rehearse (tapedeckCall). No verdict written.
//   • store  — a real production check: dials the store, records a call_results verdict (deltaStoreCall).
// Workflow-driven: voice, voice rotation, opener rotation, follow-up rotation and voice tuning all come
// from the assigned workflow (falls back to the default). Set-first follow-up: on an in-stock yes we ask
// the SET, then the product type, skipping whatever the clerk already named. Off-script / stuck at the
// opener → Charlie takes over the SAME call (deltaBarge hook). The engine stays DB/bridge-free; service
// registers the finalize hook and server registers the barge hook (no circular imports).
import { llm } from "../llm";
import { config } from "../config";
import { getSetting } from "../db/settings";
import { rotatePick } from "./rotate";
import { mp3Clip, mp3Seconds } from "./clip-cache";
import { openReceipt, emit, markNow, closeReceipt } from "./events";

const HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
// The live-turn brain. Groq's llama-3.3-70b won the 2026-07-10 bench: correct on every classify line
// (including the 3-pack-blister alias) at ~300-700ms, open-source, ~0.02c per classify. gpt-4o-mini is
// the llm() gateway's automatic fallback; free-tier Gemini is banned from the live path (it 429'd
// mid-call and turned clear answers into "unclear"). Override per-env via DELTA_CLASSIFY_MODEL.
const CLASSIFY_MODEL = process.env.DELTA_CLASSIFY_MODEL || "groq:llama-3.3-70b-versatile";

type Stage = "opener" | "askedSet" | "askedType" | "askedDay" | "done";
interface TdStep { who: "us" | "you"; text: string; atSec: number; label?: string; ms?: number }

/** Context for a real production check (store mode). */
export interface DeltaCheck {
  callId: number; toNumber: string; retailerId: number; categoryId: number;
  chainId: number | null; finderUserId: string | null; retailerName: string; categoryLabel: string;
}

export interface TdSession {
  id: string; phone: string; startMs: number;
  status: "dialing" | "live" | "done" | "failed";
  steps: TdStep[]; turns: number;
  clips: Buffer[]; clipText: string[];
  callSid?: string;
  opened?: boolean; // has the opener clip played yet? (we wait to hear the pickup first)
  stage: Stage;     // where we are in the set-first script
  needType: boolean; // after asking the set, do we still owe the product-type question?
  clarified?: boolean; // used our one "sorry, I was asking..." already
  nudged?: boolean;  // used our one "hello, you still there?" silence nudge already
  silence?: number;  // consecutive silent turns (resets on any real speech) — patience before wrapping
  onHold?: boolean;  // clerk said "hold on, let me check" — wait patiently, don't treat quiet as a no-answer
  forked?: boolean;  // audio fork to the listen room already opened (guard against TwiML refetch → double audio)
  workflow: string; // which workflow drove this call (shown in the log)
  oneTurn?: boolean; // this workflow asks ONE question that gets the set and the format together
  waitSecs?: number;  // mid-call wait for ANY reply before the silence path (workflow Reply timeout)
  endpoint?: string;  // Twilio speechTimeout: "auto" | seconds — how fast we reply after they stop (Beat)
  hints?: string;     // Twilio ASR vocabulary bias — the product words clerks actually say ("tin" not "10")
  // ---- store (production) mode ----
  mode: "bench" | "store";
  check?: DeltaCheck;
  resConfirmed?: boolean | null; // the in/out verdict
  resStatusKey?: string;          // customer-facing verdict key
  resProduct?: string | null;     // set + product type the clerk named
  resDay?: string | null;         // restock day heard
  escalated?: boolean;            // handed off to Charlie → the EL poll finalizes, not us
}
const sessions = new Map<string, TdSession>();
export function tdSession(id: string): TdSession | null { return sessions.get(id) || null; }
export function tdClip(id: string, i: number): Buffer | null { return sessions.get(id)?.clips[i] || null; }

// Finalize + barge hooks, registered by service/server so the engine needs no DB or bridge import.
let deltaFinalize: ((s: TdSession) => Promise<void>) | null = null;
export function setDeltaFinalize(fn: (s: TdSession) => Promise<void>): void { deltaFinalize = fn; }
// Returns handoff TwiML (Charlie takes the call) or null to fall back to the escalate clip.
let deltaBarge: ((s: TdSession, speech: string) => Promise<string | null>) | null = null;
export function setDeltaBarge(fn: (s: TdSession, speech: string) => Promise<string | null>): void { deltaBarge = fn; }
// Live relay (registered by the server): streams each transcript line + the hang-up to the same
// listen-room WebSocket the bridge lane uses, so the consumer live view follows a D-lane call too.
let deltaRelayLine: ((s: TdSession, role: "Agent" | "Clerk", text: string) => void) | null = null;
let deltaRelayEnd: ((s: TdSession) => void) | null = null;
export function setDeltaRelay(line: (s: TdSession, role: "Agent" | "Clerk", text: string) => void, end: (s: TdSession) => void): void { deltaRelayLine = line; deltaRelayEnd = end; }

/** Push one step onto the session log AND stream it to any live listeners (best-effort). */
function pushStep(s: TdSession, step: TdStep): void {
  s.steps.push(step);
  if (step.text && !step.text.startsWith("[")) {
    try { deltaRelayLine?.(s, step.who === "us" ? "Agent" : "Clerk", step.text); } catch { /* relay best-effort */ }
  }
}

/** Plain-text transcript of the call so far (for the stored verdict). */
export function tdTranscript(s: TdSession): string {
  return s.steps.filter((x) => x.text).map((x) => `${x.who === "us" ? "Agent" : "Clerk"}: ${x.text}`).join("\n");
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
// Endpointing = how many seconds of SILENCE after the clerk stops before we treat them as done and
// reply. This is the "give people time to think" lever (owner 07-15: eager=1s cut a clerk off mid
// "pitch black" and hung up before "it's a tin"). NEVER below 2s — a thinking pause must not end
// their turn. Beat maps: eager 2s · normal 3s · patient 5s. The wait-for-any-reply-to-START window
// is the workflow Reply timeout (tuning.turnTimeout), kept generous so hesitation before answering
// doesn't time out either.
const gather = (id: string, timeoutSec?: number) => {
  const s = sessions.get(id);
  return `<Gather input="speech" speechTimeout="${s?.endpoint || "auto"}" enhanced="true" speechModel="phone_call" timeout="${timeoutSec ?? s?.waitSecs ?? 8}"${s?.hints ? ` hints="${esc(s.hints)}"` : ""} ` +
  `action="https://${HOST}/tapedeck/step?session=${id}" method="POST"/>` +
  `<Redirect method="POST">https://${HOST}/tapedeck/step?session=${id}&amp;silent=1</Redirect>`;
};
// The vocabulary Twilio's transcriber should EXPECT on these calls — the owner's 07-15 test heard
// "tin" as "10", which then read as a set name. Biasing ASR beats correcting it after the fact.
export function deltaHints(categoryLabel: string): string {
  return `tin, tins, booster pack, booster packs, booster box, booster boxes, elite trainer box, ETB, ` +
    `blister, three pack blister, sleeved, singles, bundle, in stock, sold out, all gone, on the shelf, ` +
    `shipment, restock, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, ${categoryLabel}`;
}
const play = (id: string, i: number) => `<Play>https://${HOST}/tapedeck/clip?session=${id}&amp;i=${i}</Play>`;

// One variant per call, rotated round-robin across calls (shared counters with the C-lane). Clip slots:
// 0 opener · 1 ask-SET · 2 ask-TYPE · 3 restock-day · 4 wrap (confirmed yes) · 5 clarify ·
// 6 escalate (Charlie) · 7 hello ("you still there?" for DEAD AIR — nobody spoke) · 8 wrapNo (neutral
// goodbye) · 9 wait ("no rush, take your time" — ONLY when the clerk asks to hold / goes to check)

// Defaults used when a workflow hasn't defined its own follow-up scripts. No dashes (owner rule);
// commas carry the pauses. {category} is filled at synth time.
// Set question ALWAYS offers an example set name (owner, 07-10 call feedback): clerks often don't know
// what "set" means. The example is edit-per-workflow on the Workflows page when a brand needs its own.
export const DEFAULT_FOLLOWUPS: Record<string, string[]> = {
  set: ["Oh nice! Is it Chaos Rising? Or do you know the name of the set?", "Awesome, any idea which set it is? Like Chaos Rising, or a different one?", "Oh sweet, do you know the name of the set? Like Chaos Rising?"],
  // Context-neutral phrasing: this clip plays after a set ANSWER and after "I don't know the set",
  // so no variant may assume either (owner 07-15: "No worries" read like it presumed confusion).
  type: ["Gotcha, and is it a pack or a box?", "And is it a pack or a box?"],
  no: ["Ah, no worries. Any idea what day you usually get card shipments in?", "Okay no problem, do you know when your next shipment usually lands?"],
  wrap: ["Awesome, thanks so much! Have a good one!", "Perfect, thank you so much, take care!"],
  clarify: ["Oh sorry, I was just asking if you have any {category} in stock right now?"],
  escalate: ["Oh, one sec,"],
  hello: ["Hello? You still there?", "Hey, you still with me?"],
  // Neutral goodbye for a no / sold-out / unclear ending. NEVER the celebratory wrap — "Awesome!"
  // after "we don't have any" read as tone-deaf (owner 07-10 Delta test, call 97).
  wrapNo: ["Okay, no worries. Thanks so much, have a good one!"],
  // Patience line played when the clerk goes quiet WHILE we're waiting for an answer (thinking, or
  // walked to go look) — reassure and keep listening, never hang up on them (owner 07-15).
  wait: ["No rush, take your time.", "No worries, whenever you're ready."],
};

interface TdWorkflow { name: string; voiceId: string; voices: string[]; openers: string[]; tuning: Record<string, unknown>; followups: Record<string, string[]>; lane: string;
  /** ONE TURN (owner 07-27): this workflow asks a single question that gets the set AND the format
   *  together, instead of asking for one then the other. Every extra turn is 6 to 10 seconds with the
   *  meter running, so dropping one is the cheapest saving on the whole call. Declared by DATA, not a
   *  flag: a workflow that ships an empty `type` list is saying "I already asked that". */
  oneTurn: boolean }

/**
 * DOES THIS WORKFLOW ASK ONE QUESTION INSTEAD OF TWO? The workflow's own DATA says so: a follow-up
 * block that DECLARES an empty `type` list is telling us its set question already asks for the
 * format, so there is nothing left to ask. Absent = the old two question flow, unchanged.
 *
 * Lives here, exported, because BOTH lanes have to read the same answer. The recorded-clip lane uses
 * it to skip the second clip; the live-agent lane (buildRestockVars) uses it to swap the follow-up
 * instruction the agent is given. Two copies of this rule would drift, and the drift would only ever
 * show up as an agent asking a question the owner deliberately removed, on a real call.
 */
export function declaresOneTurn(followups: Record<string, unknown> | null | undefined): boolean {
  if (!followups || typeof followups !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(followups, "type")) return false;
  const t = (followups as Record<string, unknown>).type;
  return !(Array.isArray(t) && t.filter(Boolean).length > 0);
}

/** Resolve a workflow for the D-lane: by name if given, else the global default. Pulls voice, voice
 *  strip, openers, tuning, lane and (optional) follow-up scripts, same source the live lane uses. */
export async function resolveTapedeckWorkflow(name?: string): Promise<TdWorkflow> {
  const fb: TdWorkflow = { name: "default", voiceId: config.voice.defaultVoiceId, voices: [], openers: ["Heyy! I was just checking, do you have any {category} in stock right now?"], tuning: {}, followups: DEFAULT_FOLLOWUPS, lane: "charlie", oneTurn: false };
  try {
    const [wfsRaw, defName] = await Promise.all([getSetting("vt_workflows"), getSetting("vt_default_workflow")]);
    const wfs = JSON.parse(wfsRaw || "[]") as Array<Record<string, unknown>>;
    const want = name || defName || "";
    const wf = wfs.find((w) => w && w.name === want) || wfs.find((w) => w && w.name === (defName || ""));
    if (!wf) return fb;
    const openers = Array.isArray(wf.openers) && wf.openers.length ? (wf.openers as unknown[]).map(String) : fb.openers;
    const voices = Array.isArray(wf.voices) ? (wf.voices as unknown[]).map(String).filter(Boolean) : [];
    const fu = (wf.followups && typeof wf.followups === "object") ? (wf.followups as Record<string, string[]>) : {};
    const slot = (k: string) => (Array.isArray(fu[k]) && fu[k].length ? fu[k].map(String) : DEFAULT_FOLLOWUPS[k]);
    const oneTurn = declaresOneTurn(fu);
    return {
      name: String(wf.name || "default"),
      voiceId: (typeof wf.voiceId === "string" && wf.voiceId) || voices[0] || config.voice.defaultVoiceId,
      voices, openers,
      tuning: (wf.tuning && typeof wf.tuning === "object") ? (wf.tuning as Record<string, unknown>) : {},
      followups: { set: slot("set"), type: oneTurn ? [] : slot("type"), no: slot("no"), wrap: slot("wrap"), clarify: slot("clarify"), escalate: slot("escalate"), hello: slot("hello"), wrapNo: slot("wrapNo"), wait: slot("wait") },
      lane: typeof wf.lane === "string" ? wf.lane : "charlie",
      oneTurn,
    };
  } catch { return fb; }
}

const fillCat = (t: string, cat: string) => t.replace(/\{category\}/g, cat).replace(/\bcards(\s+cards)+\b/gi, "cards");

/** Delta's read of the workflow's turn-taking tuning (same fields Charlie uses, phone-line semantics).
 *  Reply timeout is clamped to 3–15s here: past ~15s of mid-call silence the nudge/wrap path should own
 *  the call — Charlie's 45s ceiling makes no sense when every second is billed Twilio time. */
export function deltaTurnTuning(tuning: Record<string, unknown>): { waitSecs: number; endpoint: string } {
  const tt = Number(tuning.turnTimeout);
  // Initial wait for them to START talking — generous (clerks pause to think before answering).
  const waitSecs = Number.isFinite(tt) && tt > 0 ? Math.min(20, Math.max(4, Math.round(tt))) : 10;
  // Trailing silence before we decide they're done. Floor 2s so a mid-sentence pause never cuts them
  // off; Beat only shifts how much extra room on top. Fixed seconds (not "auto") so it's predictable.
  const endpoint = tuning.turnEagerness === "eager" ? "2" : tuning.turnEagerness === "patient" ? "5" : "3";
  return { waitSecs, endpoint };
}

/** Synthesize one clip in the given voice, honoring the workflow's tuning (mirrors the mapper). */
async function synthClip(voiceId: string, text: string, tuning: Record<string, unknown>): Promise<Buffer | null> {
  try {
    const voice_settings: Record<string, number> = {
      stability: typeof tuning.stability === "number" ? tuning.stability : 0.4,
      similarity_boost: typeof tuning.similarity_boost === "number" ? tuning.similarity_boost : (typeof tuning.similarity === "number" ? tuning.similarity : 0.85),
    };
    if (typeof tuning.style === "number") voice_settings.style = tuning.style;
    // Speed (cadence) from the Designer, same 0.7–1.2 range ElevenLabs accepts. 1.0 = neutral, skip it.
    if (typeof tuning.speed === "number" && tuning.speed >= 0.7 && tuning.speed <= 1.2 && tuning.speed !== 1) voice_settings.speed = tuning.speed;
    const modelId = tuning.modelId === "eleven_flash_v2" ? "eleven_flash_v2" : "eleven_turbo_v2";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId, voice_settings }),
    });
    if (!r.ok) { console.error("[tapedeck] synth", r.status, (await r.text()).slice(0, 100)); return null; }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { console.error("[tapedeck] synth", e); return null; }
}

/** Synthesize the 8 rotated clips for a call from a resolved workflow. Every slot ROTATES round-robin
 *  (shared counters with the C-lane — "opener:<wf>" is the same sequence Charlie advances), so two
 *  variants alternate call to call instead of repeating at random. */
async function synthClips(wf: TdWorkflow, voiceId: string, cat: string): Promise<{ texts: string[]; clips: (Buffer | null)[] }> {
  const fu = (slot: keyof typeof DEFAULT_FOLLOWUPS) => {
    const arr = wf.followups[slot];
    // An empty list on a ONE TURN workflow means the question was folded into another one. Return
    // nothing so the clip is never synthesized and never played, instead of silently falling back to
    // the default and asking a second question the owner deliberately removed.
    if (wf.oneTurn && slot === "type") return "";
    return rotatePick(`fu:${wf.name}:${slot}`, arr && arr.length ? arr : DEFAULT_FOLLOWUPS[slot]) || DEFAULT_FOLLOWUPS[slot][0];
  };
  const openers = wf.openers && wf.openers.length ? wf.openers : ["Heyy! I was just checking, do you have any {category} in stock right now?"];
  const texts = [
    fillCat(rotatePick(`opener:${wf.name}`, openers) || openers[0], cat),
    fillCat(fu("set"), cat),
    fillCat(fu("type"), cat),
    fillCat(fu("no"), cat),
    fillCat(fu("wrap"), cat),
    fillCat(fu("clarify"), cat),
    fillCat(fu("escalate"), cat),
    fillCat(fu("hello"), cat),
    fillCat(fu("wrapNo"), cat),
    fillCat(fu("wait"), cat),
  ];
  // A slot with no text is deliberately absent (the one-turn flow has no separate format question).
  // Never synthesize it: every character is billed, and a clip that can never play is pure waste.
  const clips = await Promise.all(texts.map((t) => (t && t.trim() ? synthClip(voiceId, t, wf.tuning) : Promise.resolve(null))));
  return { texts, clips };
}

/** Place the Twilio call for a prepared session. Shared by bench + store modes. */
async function placeTwilioCall(session: TdSession, to: string): Promise<{ error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const body = new URLSearchParams({
    To: to.startsWith("+") ? to : "+1" + to, From: from,
    Url: `https://${HOST}/tapedeck/twiml?session=${session.id}`,
    TimeLimit: "300", // hard cost cap: a D-lane check (even with a Charlie barge-in) never runs past 5 min
    StatusCallback: `https://${HOST}/tapedeck/ended?session=${session.id}`, StatusCallbackEvent: "completed",
  });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) return { error: `twilio ${r.status}: ${(await r.text()).slice(0, 120)}` };
  const d = (await r.json()) as { sid?: string };
  if (d.sid) session.callSid = d.sid;
  return {};
}

/** BENCH: rehearsal call to the owner's phone on the D-lane. `workflowName` picks the workflow. */
export async function tapedeckCall(phone: string, workflowName?: string): Promise<{ id?: string; error?: string }> {
  if (!config.callsEnabled) return { error: "calls disabled on this deploy" };
  const to = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(to)) return { error: "enter a valid phone number" };
  for (const s of sessions.values()) {
    if (s.phone === to && (s.status === "dialing" || s.status === "live")) return { error: "a rehearsal call to this number is already live — hang up first" };
  }
  const wf = await resolveTapedeckWorkflow(workflowName);
  const voiceId = rotatePick(`voice:${wf.name}`, wf.voices) || wf.voiceId; // same round-robin counter Charlie advances
  const { texts, clips } = await synthClips(wf, voiceId, "Pokémon cards");
  if (clips.some((c, i) => !c && !!(texts[i] || "").trim())) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const turn = deltaTurnTuning(wf.tuning);
  const session: TdSession = { id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts, stage: "opener", needType: false, workflow: wf.name, oneTurn: wf.oneTurn, mode: "bench", waitSecs: turn.waitSecs, endpoint: turn.endpoint, hints: deltaHints("Pokémon cards") };
  sessions.set(id, session);
  // The rehearsal call gets the same receipt a real check does, so it can be opened afterwards
  // instead of vanishing. No `call_results` row: a rehearsal is not a customer's check.
  openReceipt(`delta:${id}`, { lane: "delta", note: "Voice rehearsal call" });
  emit(`delta:${id}`, "dialed", `Rehearsal call to ${to}`, { workflow: wf.name, voiceId });
  const r = await placeTwilioCall(session, to);
  if (r.error) { emit(`delta:${id}`, "hangup", "The carrier refused the call", { why: r.error }); closeReceipt(`delta:${id}`, r.error, "dial-failed"); sessions.delete(id); return { error: r.error }; }
  setTimeout(() => sessions.delete(id), 15 * 60 * 1000);
  return { id };
}

/** STORE (production): run a real check on the D-lane. Dials the store; the verdict is written by the
 *  registered finalize hook when the call ends. `workflowName` = the store's resolved workflow. */
export async function deltaStoreCall(check: DeltaCheck, workflowName?: string): Promise<{ id?: string; error?: string }> {
  if (!config.callsEnabled) return { error: "calls disabled on this deploy" };
  const to = check.toNumber.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(to)) return { error: "store has no dialable number" };
  const wf = await resolveTapedeckWorkflow(workflowName);
  const voiceId = rotatePick(`voice:${wf.name}`, wf.voices) || wf.voiceId; // same round-robin counter Charlie advances
  const { texts, clips } = await synthClips(wf, voiceId, check.categoryLabel);
  if (clips.some((c, i) => !c && !!(texts[i] || "").trim())) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const turn = deltaTurnTuning(wf.tuning);
  const session: TdSession = {
    id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts,
    stage: "opener", needType: false, workflow: wf.name, oneTurn: wf.oneTurn, mode: "store", check,
    waitSecs: turn.waitSecs, endpoint: turn.endpoint, hints: deltaHints(check.categoryLabel),
    resConfirmed: null, resStatusKey: "no_clear_answer", resProduct: null, resDay: null,
  };
  sessions.set(id, session);
  const r = await placeTwilioCall(session, to);
  if (r.error) { sessions.delete(id); return { error: r.error }; }
  setTimeout(() => sessions.delete(id), 15 * 60 * 1000);
  return { id };
}

export function tapedeckTwiml(id: string): string {
  const s = sessions.get(id);
  if (!s) return twiml("<Hangup/>");
  s.status = "live";
  // LIVE AUDIO TAP: fork both sides of the call into the listen room ("delta:<id>") so the browser
  // hears a D-lane call exactly like a Charlie call. <Start><Stream> is a one-way media fork that
  // keeps running across every later TwiML document (each /step response) until the call ends — the
  // /twilio-media WS handler fans the frames out to /listen listeners. Without this the owner heard
  // NOTHING on Delta calls (07-10: "no longer hear the audio") — Delta has no EL bridge to tap.
  // Guarded (s.forked): a Twilio TwiML refetch must not open a second fork = doubled audio.
  const tap = s.forked ? "" : `<Start><Stream name="deltatap" url="wss://${HOST}/twilio-media?room=delta:${id}" track="both_tracks"><Parameter name="room" value="delta:${id}"/></Stream></Start>`;
  s.forked = true;
  // Don't open into dead air. Listen for the pickup ("hello?") before the opener plays — that's how a
  // real inbound greeting works. The opener fires on the first /step hit (handled in tapedeckStep).
  // SHORT first wait (3s, not 8): a silent pickup used to leave ~10s of dead air before the opener
  // (owner 07-10 calls 1/2/7: "took too long to say anything"). If nobody greets us within ~3s of the
  // answer, the redirect fires and the opener plays anyway.
  return twiml(`${tap}<Pause length="1"/>${gather(id, 3)}`);
}

/** Pure decision for one D-lane turn (no I/O, unit-tested). Given the stage + classified reply, returns
 *  which clip to play, the next stage, and any verdict/state changes. The off-script "question" (barge)
 *  case is handled by the caller before this runs. Slots: 1 set · 2 type · 3 restock-day · 4 wrap · 5 clarify. */
export interface DeltaDecision { clip: number; next: Stage; confirmed?: boolean | null; statusKey?: string; setClarified?: boolean; setNeedType?: boolean; note: string }
export function deltaDecide(o: { stage: Stage; label: string; gotSet: boolean; gotType: boolean; clarified: boolean; needType: boolean; oneTurn?: boolean }): DeltaDecision {
  const { stage, label, gotSet, gotType } = o;
  if (stage === "opener") {
    if (label === "no" || label === "day") return { clip: 3, next: "askedDay", confirmed: false, statusKey: "not_in_stock", note: "out → ask the restock day" };
    if (label === "yes" || label === "product") {
      if (gotSet && gotType) return { clip: 4, next: "done", confirmed: true, statusKey: "in_stock", note: "named the set + type already → wrap" };
      // ONE TURN: a single question gets the set and the format together, so whatever comes back we
      // are done asking. Never a second question, even when the clerk answers only half of it —
      // half an answer is worth more than the seconds a follow up costs (owner 07-27).
      if (o.oneTurn) return { clip: 1, next: "askedSet", confirmed: true, statusKey: "in_stock", setNeedType: false, note: "in stock → the one question that gets the set AND the format" };
      if (!gotSet) return { clip: 1, next: "askedSet", confirmed: true, statusKey: "in_stock", setNeedType: !gotType, note: "in stock → ask the SET first" };
      return { clip: 2, next: "askedType", confirmed: true, statusKey: "in_stock", note: "had the set → ask packs/tin" };
    }
    if (!o.clarified) return { clip: 5, next: "opener", setClarified: true, note: "unclear → clarify once" };
    return { clip: 4, next: "done", confirmed: null, statusKey: "no_clear_answer", note: "still unclear → wrap" };
  }
  if (stage === "askedSet") {
    // Ask the product type even when they DIDN'T know the set (owner 07-10 call 1: "when I told him I
    // don't know the name, he should've asked if it's a tin or booster packs").
    if (o.needType) return { clip: 2, next: "askedType", note: label === "unclear" ? "didn't know the set → ask packs/tin instead" : "got the set → ask packs/tin" };
    return { clip: 4, next: "done", note: "have what we need → wrap" };
  }
  return { clip: 4, next: "done", note: `answered our follow-up (${label}) → wrap` };
}

const HOLD_WAIT_SECS = 18; // per-cycle wait while a clerk is off checking stock (they walked away)

/** Pure decision for a turn where nobody answered (unit-tested). Two very different silences (owner
 *  07-15): DEAD AIR (nobody said anything) → "Hello? You still there?" — never "take your time".
 *  A HELD LINE (they said "hold on, let me check", so `onHold`) → wait quietly while they check, one
 *  gentle "still there?" if it drags, then in a real store call hand the wait to Charlie (who can sit
 *  through hold music and re-engage) rather than guess. `silence` is the count AFTER incrementing.
 *  Clips: 7 hello ("you still there?") · 8 neutral wrap. clip -1 = play nothing, just keep listening. */
export interface SilenceDecision { action: "nudge" | "holdwait" | "barge" | "wrap"; clip: number }
export function deltaSilence(o: { stage: Stage; silence: number; onHold?: boolean; canBarge?: boolean }): SilenceDecision {
  if (o.onHold) {
    if (o.silence <= 2) return { action: "holdwait", clip: -1 };      // they're checking — wait quietly, don't nag
    if (o.silence === 3) return { action: "nudge", clip: 7 };          // long hold → one gentle "still there?"
    if (o.canBarge) return { action: "barge", clip: -1 };             // real store call → let Charlie sit the hold out
    return { action: "wrap", clip: 8 };
  }
  if (o.silence <= 2) return { action: "nudge", clip: 7 };            // dead air → "Hello? You still there?"
  return { action: "wrap", clip: 8 };
}

/** Hand the SAME live call to Charlie (store mode only). Returns the handoff TwiML, or null when the
 *  handoff can't be set up (bench mode, no hook, or the bridge failed) so the caller falls back. */
async function tryDeltaBarge(s: TdSession, speech: string, why: string): Promise<string | null> {
  if (s.mode !== "store" || !deltaBarge) return null;
  try {
    const handoff = await deltaBarge(s, speech);
    if (handoff) {
      s.escalated = true; s.stage = "done";
      pushStep(s, { who: "us", text: "[Charlie takes over]", atSec: Math.round((Date.now() - s.startMs) / 1000), label: why });
      return handoff;
    }
  } catch (e) { console.error("[delta] barge failed", e); }
  return null;
}

/** One turn: classify the reply, answer with the matching clip. Set-first flow: yes → ask the SET →
 *  then the product TYPE (skipping whatever they named); no/day → ask the restock day; off-script
 *  question at the opener → Charlie takes over the same call (store mode) or the escalate clip (bench). */
export async function tapedeckStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml("<Hangup/>");
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  // First /step hit = the pickup just happened. NOW play the opener (never before they reach speaker).
  if (!s.opened) {
    s.opened = true;
    pushStep(s, { who: "us", text: s.clipText[0], atSec, label: `opener (${s.workflow}) — played after pickup` });
    return twiml(`${play(id, 0)}${gather(id)}`);
  }
  s.turns++;
  // Hard safety caps only (a runaway call). Silence is handled patiently below, NOT here — the old
  // "turns>=3 → hang up" cut clerks off mid-answer (owner 07-15).
  if (s.turns > 12 || atSec > 165) return endCall(s, s.resConfirmed === true ? 4 : 8);
  if (speech && speech.trim()) { pushStep(s, { who: "you", text: speech.trim().slice(0, 200), atSec }); s.silence = 0; }
  else { // NOBODY SPOKE. Dead air and a held line are different (owner 07-15): dead air → "you still
    // there?"; a line they put us on hold to check → wait quietly, then let Charlie sit out a long hold.
    s.silence = (s.silence || 0) + 1;
    const sd = deltaSilence({ stage: s.stage, silence: s.silence, onHold: !!s.onHold, canBarge: s.mode === "store" && !!deltaBarge });
    if (sd.action === "barge") {
      const h = await tryDeltaBarge(s, "the clerk put us on hold to check stock, please wait for them and finish the check", "long hold → Charlie takes the wait");
      return h ?? endCall(s, s.resConfirmed === true ? 4 : 8);
    }
    if (sd.action === "wrap") return endCall(s, sd.clip); // truly gone quiet → neutral graceful wrap
    if (sd.action === "holdwait") return twiml(gather(id, HOLD_WAIT_SECS)); // checking — listen quietly, no clip
    pushStep(s, { who: "us", text: s.clipText[sd.clip], atSec, label: `silence (${s.onHold ? "on hold" : "dead air"}) → ${sd.action}` });
    return twiml(`${play(id, sd.clip)}${gather(id, s.onHold ? HOLD_WAIT_SECS : undefined)}`);
  }

  const t0 = Date.now();
  let label = "unclear", setName = "", typeName = "", dayName = "";
  try {
    const cat = s.check?.categoryLabel || "Pokémon cards";
    const out = await llm(CLASSIFY_MODEL, `You are on a phone call to a store checking if ${cat} are in stock. The clerk just replied: "${speech.trim().slice(0, 200)}"
Return ONLY JSON: {"label":"yes|no|day|product|question|hold|unclear","set":"<set name they named, else empty>","type":"<packs|booster box|tin|etb|3-pack blister|singles, else empty>","day":"<shipment day/timing they named, else empty>"}
- yes: they have some in stock ("yeah we got a few", "we do")
- no: they don't / sold out
- day: they named a day or shipment timing
- product: they named a product type or set
- question: THEY asked something back ("who's this?", "for pickup?")
- hold: they asked us to WAIT or are going to CHECK, with no answer yet ("hold on", "one sec", "let me check", "let me go look", "hang on", "gimme a minute", "let me see if we have any"). This is NOT a no.
- unclear: genuinely can't tell / garbled
Staff describe products loosely, so map descriptions to the trade name: "three packs in one" / "a pack with three smaller packs inside" = "3-pack blister"; "the big box with packs" = "booster box"; "the little box with a promo" = "etb".
Phone transcription mishears words: "10" or "ten" where a product type belongs almost always means "tin" (the metal box) — never treat a bare number as a set name. "E T B" / "easy B" = "etb".`, { job: "tapedeck", json: true, temperature: 0, maxTokens: 60 });
    const j = JSON.parse(out) as { label?: string; set?: string; type?: string; day?: string };
    label = String(j.label || "unclear");
    const clean = (v?: string) => (v && v.trim() && !/^(no|none|n\/?a|unsure|not sure|idk|unknown)$/i.test(v.trim()) ? v.trim() : "");
    setName = clean(j.set); typeName = clean(j.type); dayName = clean(j.day);
  } catch { /* keep unclear */ }
  const ms = Date.now() - t0;
  const gotSet = !!setName, gotType = !!typeName;
  if (setName) s.resProduct = [s.resProduct, `set: ${setName}`].filter(Boolean).join(", ");
  if (typeName) s.resProduct = [s.resProduct, typeName].filter(Boolean).join(", ");
  if (dayName) s.resDay = dayName;

  // "Hold on, let me check" — the most common real reply (owner 07-15: "this happens a lot"). Reassure
  // with "no rush, take your time", DON'T advance (they haven't answered), and give a long window since
  // they physically walked away. Once on hold, transcribed noise / hold music also keeps us waiting.
  if (label === "hold") {
    s.onHold = true; s.silence = 0;
    pushStep(s, { who: "us", text: s.clipText[9], atSec, label: "clerk is checking → reassure, hold the line", ms });
    return twiml(`${play(id, 9)}${gather(id, HOLD_WAIT_SECS)}`);
  }
  if (s.onHold && label === "unclear") { // ambient noise / hold music while they check — keep waiting patiently
    s.silence = (s.silence || 0) + 1;
    const sd = deltaSilence({ stage: s.stage, silence: s.silence, onHold: true, canBarge: s.mode === "store" && !!deltaBarge });
    if (sd.action === "barge") { const h = await tryDeltaBarge(s, "the clerk put us on hold to check stock, please wait for them and finish the check", "long hold → Charlie takes the wait"); return h ?? endCall(s, s.resConfirmed === true ? 4 : 8); }
    if (sd.action === "wrap") return endCall(s, sd.clip);
    if (sd.action === "nudge") { pushStep(s, { who: "us", text: s.clipText[7], atSec, label: "long hold → still there?", ms }); return twiml(`${play(id, 7)}${gather(id, HOLD_WAIT_SECS)}`); }
    return twiml(gather(id, HOLD_WAIT_SECS)); // holdwait — listen quietly
  }
  s.onHold = false; // any real, classifiable answer means they're back with us

  // Off-script / stuck at the opener → hand the SAME call to Charlie (store mode). Fail-safe: if the
  // handoff can't be set up, fall through to the escalate clip so the call still ends gracefully.
  if (label === "question" && s.stage === "opener") {
    const h = await tryDeltaBarge(s, speech.trim(), `off-script → Charlie barged in (${ms}ms classify)`);
    if (h) return h;
    pushStep(s, { who: "us", text: s.clipText[6], atSec: Math.round((Date.now() - s.startMs) / 1000), label: `off-script → escalate (no live handoff)`, ms });
    return endCall(s, 6);
  }

  // Decide the next clip + stage (pure, unit-tested). Then apply the verdict/state changes.
  const d = deltaDecide({ stage: s.stage, label, gotSet, gotType, clarified: !!s.clarified, needType: s.needType, oneTurn: !!s.oneTurn });
  if (d.setClarified) s.clarified = true;
  if (d.setNeedType !== undefined) s.needType = d.setNeedType;
  if (d.confirmed !== undefined) s.resConfirmed = d.confirmed;
  if (d.statusKey) s.resStatusKey = d.statusKey;
  s.stage = d.next;
  // Resolve the wrap tone HERE (before the step is logged) so the transcript shows the line that
  // actually plays: celebratory wrap only on a confirmed yes, neutral goodbye otherwise.
  const clip = d.clip === 4 && s.resConfirmed !== true ? 8 : d.clip;

  pushStep(s, { who: "us", text: s.clipText[clip], atSec: Math.round((Date.now() - s.startMs) / 1000), label: `classified "${label}"${gotSet ? " +set" : ""}${gotType ? " +type" : ""} in ${ms}ms → ${d.note}`, ms });
  if (clip === 4 || clip === 8) return endCall(s, clip);
  return twiml(`${play(id, clip)}${gather(id)}`);
}

/** Play a terminal clip, hang up, and (store mode) fire the verdict finalizer once. The celebratory
 *  wrap (4) only plays on a CONFIRMED yes; every other ending gets the neutral goodbye (8). */
function endCall(s: TdSession, clip: number): string {
  if (clip === 4 && s.resConfirmed !== true) clip = 8;
  s.status = "done";
  finalizeIfStore(s);
  try { deltaRelayEnd?.(s); } catch { /* relay best-effort */ }
  return twiml(`${play(s.id, clip)}<Hangup/>`);
}

/** Fire the finalize hook exactly once for a store-mode call that wasn't escalated to Charlie. */
function finalizeIfStore(s: TdSession): void {
  if (s.mode !== "store" || s.escalated || (s as TdSession & { _finalized?: boolean })._finalized) return;
  (s as TdSession & { _finalized?: boolean })._finalized = true;
  if (deltaFinalize) deltaFinalize(s).catch((e) => console.error("[delta] finalize failed", e));
}

// ===========================================================================================
// THE ROBOT STORE — the same tape deck, pointed the other way.
// Spec: docs/specs/robot-store/README.md. Words: docs/team/voice-calls/how-staff-actually-talk.md.
//
// Everything above dials a store and plays OUR clips at whoever picks up. The robot store IS picked
// up: an inbound call arrives on +1 424 484 7395, and the same machine plays the STAFF's clips at
// whoever dialed us. Same session map, same synthesized clips, same `/tapedeck/clip` audio route,
// same play-then-listen loop. A second engine would drift from this one and then we would be testing
// the drift, which is the whole failure the robot exists to end.
//
// EXACTLY ONE THING HERE IS FAKE: the person at the store. The dial, the carrier, the transcriber,
// the verdict and the Admin record are all the real system.
//
// WHERE EVERY LINE BELOW COMES FROM, exactly. Most are what a real person really said on a real
// check (`how-staff-actually-talk.md`), with only the store name and the person's name swapped.
// Four are NOT in that corpus and must not be passed off as if they were: scenario 8's payoff
// ("Yeah, we've got a few."), the second person's greeting and answer in scenario 10, and scenario
// 1's follow-up answer ("Uh, I think it's the one fifty one booster boxes." — added 08-04 so the
// goodbye is testable at all) — the rest of those come from the spec the owner approved on 08-01,
// which is why they are here. Nothing on this list
// was made up by an agent. They are short, they stumble, they interrupt themselves. Do NOT tidy them
// into better English: the mess IS the test.
// ===========================================================================================

/**
 * THE RECORDINGS THE OWNER PICKED AND APPROVED BY EAR, committed at `public/robot-clips/`.
 *
 * DO NOT REGENERATE THEM (owner 08-06, and again in the round two order). These exact files are the
 * ones he listened to, and a re-cut file with the same name is a different test wearing the same
 * label. The engine only ever plays them; nothing here makes audio.
 *
 * VOLUME IS THE TEST, so the number is written down here rather than left to whatever the file
 * happens to be. `mean`/`peak` are measured off the committed file (ffmpeg volumedetect, 08-07) and
 * the room recordings have to land under `roomFraction` of the Staff voice or the phone-on-the
 * counter test proves nothing: `roomFraction` is 0.35 of amplitude in `tuning.ts`, which is 9.1 dB,
 * and both room clips sit further under a speaking voice than that. `secs` is the file's real
 * length, read the same way, and the scene clock needs it or every line after a hold files at the
 * wrong second.
 */
export const ROBOT_CLIPS: Record<string, { file: string; secs: number; mean: number; peak: number; what: string }> = {
  busyStore:   { file: "01-busy-store.mp3",          secs: 15.0,  mean: -27.6, peak: -13.9, what: "a shopping mall, the QUIETER of his two rooms" },
  busyCafe:    { file: "02-busy-cafe.mp3",           secs: 15.0,  mean: -29.7, peak: -16.6, what: "a busy restaurant, the LOUDER of his two rooms" },
  musicClassic:{ file: "03-hold-music-classic.mp3",  secs: 15.3,  mean: -15.5, peak:  -0.0, what: "hold music, loud and even all the way through" },
  musicWaltz:  { file: "05-hold-music-waltz.mp3",    secs: 15.0,  mean: -26.8, peak: -11.6, what: "hold music that starts quiet and swells, his own pick" },
  musicWithAd: { file: "08-hold-music-with-ad.mp3",  secs: 22.1,  mean: -26.5, peak:  -6.4, what: "the waltz with a recorded MAN selling something over it" },
  musicWithAdB:{ file: "09-hold-music-with-ad-b.mp3", secs: 15.0, mean: -23.4, peak:  -5.9, what: "the other music with a recorded WOMAN selling something over it" },
};

/** One beat of a scene. `say` is the Staff voice; `sayAs` is the SECOND person (after a transfer),
 *  or the store's own PHONE MENU, which is a third voice again (owner 08-08). */
export type RobotAct =
  | { say: string }
  | { sayAs: "transfer" | "menu"; say: string }
  | { silence: number }   // seconds of nothing at all: the one hold in our history that ever worked
  | { clip: keyof typeof ROBOT_CLIPS } // a committed recording: hold music, or a phone on the counter
  | { ring: number }      // seconds of a real ringback cadence, for the transfer
  | { beep: true }        // the tone at the end of a voicemail greeting, the thing that says "talk now"
  | { listen: true }      // wait for the caller to say their piece, then carry on
  // A PLACE IN THE SCENE THAT CAN BE JUMPED TO, and a jump. Nothing is played by either. They are
  // what lets a scene be a phone MENU instead of a straight line: a key sends the call to a label,
  // and the end of a branch sends it back to the top of the options (owner 08-08).
  | { label: string }
  | { goto: string }
  | { hangup: true };

export interface RobotScene { n: number; name: string; greeting?: string; acts: RobotAct[]; expect: string;
  /** THE KEY TABLE, when this scene is a phone menu: which key sends the call to which label. A scene
   *  without one is a straight line and ignores keys entirely, exactly as every Staff scene always
   *  has. A key that is not in the table is not an error to announce — the menu simply reads its
   *  options again, because the owner's script has no words for one (owner 08-08). */
  keys?: Record<string, string>;
  /** Where a key that is not in the table, and six seconds of nothing pressed, both go. */
  keysElse?: string;
  /** A key pressed while this label is playing is REMEMBERED and acts the moment the label ends.
   *  That trap is real on some menus and is in on purpose, so mapping has to survive it. */
  holdKeysUntil?: string;
  /** A key that lands before the options have finished reading does nothing at all and the menu reads
   *  on from the line it was cut off in the middle of — the one menu that punishes cutting in. */
  swallowEarlyKeys?: true;
  /** WHERE THE STAFF SCENE IS SPLICED IN. The menu walks the caller to the front of the store, and
   *  from that label on the robot's own Staff scene plays, on the same live call. */
  staffAt?: string;
  /** THIS MENU ASKS INSTEAD OF READING A LIST, and gives up after TALK_WINDOW_SEC of silence: it says
   *  it did not understand and asks the same question again (owner 08-20, CVS Branford's shape). */
  talksAndGivesUp?: true;
  gaveUpLine?: string;
  /** Which of the owner's 16 locked test cards this scene runs (behaved.ts TEST_CARDS). The card is
   *  what the Testing screen names the check by; the scene is only how the robot plays it. */
  card: string;
  /** NOBODY PICKS THE PHONE UP AT ALL (owner 08-06, the 90 second ring). No greeting is played and
   *  the robot never speaks a word for the whole call.
   *  THE HONEST LIMIT, stated so nobody reads more into this test than it proves: the phone company
   *  treats a call as answered the instant it runs our instructions, so the robot cannot leave a line
   *  genuinely unanswered. What it does instead is answer and then play nothing but the real ringback
   *  cadence, and never speak. That is exactly what our own give-up listens for — it counts from the
   *  first ring and is only cancelled by a human voice — so the give-up is really tested. What is NOT
   *  tested here is the phone company's own no-answer, which never reaches our engine anyway. */
  neverAnswers?: true;
  /** THIS CHECK IS NOT MEANT TO END WITH A GOODBYE, and the scorecard must not mark it down for
   *  that. Three shapes: nobody ever picked up, a machine picked up so Charlie was never switched
   *  on at all, and the check we ourselves cut at the four minute limit mid sentence. Every OTHER
   *  scene must still end with one, which is the row the owner added after four checks in a row
   *  ended on our own question. */
  noGoodbye?: true }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE STORE'S OWN PHONE MENU (owner approved 08-08 — `docs/specs/mapping-tests/robot-menu.md`).
//
// The robot store could only ever answer as Staff, so no phone menu had ever been walked without
// spending money on a stranger's store — which is every one of the thirteen mapping tests.
//
// IT IS A SCENE, not a second robot store. It is written in the same acts every Staff scene is
// written in and played by the same player; all it needed was three words the acts did not have
// (a place to jump to, a jump, and a third voice) and a key table on the scene. That is why the
// menu can hand the call to a Staff scene mid-call: they are the same thing all the way down.
//
// THE WORDS ARE THE OWNER'S, WORD FOR WORD. Nothing here writes a sentence he did not approve.
// Where his script gives no line for something (a key that is not on his table), the options play
// again rather than inventing a "sorry, I did not get that".

/** Played the moment the call is answered. The emergency sentence is in ON PURPOSE: it is the exact
 *  CVS shape that fooled the earpiece into calling a machine a person on 08-07, so every mapping
 *  test walks straight past the words that broke us. */
export const MENU_GREETING: string[] = [
  "Thank you for calling MVP's Pharmacy.",
  "If this is a medical emergency, please hang up and dial nine one one.",
  "Please listen closely, as our menu options have changed.",
];
/** Read straight after the greeting. One sentence per line, in the owner's order; read end to end
 *  they are his options paragraph exactly. */
const OPT_PHARMACY = "For the pharmacy, press 1.";
const OPT_COSMETICS = "For cosmetics, press 2.";
const OPT_HOME = "For home supplies, press 3.";
const OPT_HOURS = "For store hours and directions, press 4.";
const OPT_FRONT_0 = "For the front of the store and customer service, press 0.";
const OPT_FRONT_5 = "For the front of the store and customer service, press 5.";
const OPT_REPEAT = "To hear these options again, press 9.";
/** The desks that answer with a voice, and the recordings that do not. */
const MENU_PHARMACY_DESK = "MVP's pharmacy, this is Larry.";
const MENU_FRONT_DESK = "MVP's, this is Larry speaking.";
const MENU_HOME_SUPPLIES = "Home supplies.";
const MENU_COSMETICS = "Our cosmetics department is open ten to six.";
const MENU_HOURS = "We are open nine to nine, seven days a week. You can find us at 4200 Woodland Hills Drive.";

// ---- THE TALKING MENU (owner 08-20) ------------------------------------------------------------
// The five menus above all read a list and wait for a KEY. Not one of them talks, and a talking menu
// is exactly what beat us: CVS Branford has no press one, press two at all. It ASKS, and it gives up
// after about three seconds of silence. Its three questions, in its own shape:
const TALK_HEALTHCARE = "Are you a healthcare provider?";
const TALK_DEPARTMENT = "Pharmacy, or front of store services?";
const TALK_OPEN = "I can help with photo services, cosmetics, and general store inquiries. Just say what you'd like.";
/** What it says when nobody answers inside its window. It is not a question and nothing may be
 *  prepared for it, so it doubles as the check that the planner leaves a non-question alone. */
const TALK_GAVE_UP = "Sorry, I'm not understanding.";
/** HOW LONG THIS MENU WAITS. Measured off CVS Branford's own calls on 08-20: it asked, and had
 *  already given up before an answer that took ten to twenty seconds to think about arrived. */
export const TALK_WINDOW_SEC = 3;

/** Six seconds of nothing pressed and the whole list plays again from the top of the options. The
 *  first mapping check listens all the way through before it acts, and that free repeat is the second
 *  sample that proves a recording with certainty. */
export const MENU_NO_PRESS_SEC = 6;
/** US ringback runs two seconds of tone then four of silence, so a ring is one six second cycle and
 *  the last one ends the moment its tone does: one ring 2s, two 8s, three 14s, eight 44s. */
export const menuRingSecs = (rings: number) => Math.max(1, rings * 6 - 4);
/** A caller that never presses anything cannot loop for ever on a real line. Mapping hangs up long
 *  before this; it is here so a forgotten call cannot run up a bill on its own. */
const MENU_MAX_LOOPS = 8;

/** The five menus the owner's tests name. `plain` is his script as written; each of the others
 *  differs from it in exactly one way. */
export type MenuVariant = "plain" | "no_option_fits" | "menu_changed" | "press_ignored" | "ring_out" | "talks";
export const MENU_VARIANTS: Record<MenuVariant, string> = {
  plain: "the menu as approved",
  no_option_fits: "option 0 is left out of the read list, so nothing matches cards",
  menu_changed: "the front desk moves from key 0 to key 5, and 0 reaches the pharmacy",
  press_ignored: "a press before the options finish is swallowed and the menu reads on",
  ring_out: "the front desk rings eight times, nobody answers, and the menu returns from the top",
  talks: "it asks questions instead of reading a list, and gives up after three seconds of silence",
};
export const isMenuVariant = (v: string): v is MenuVariant => Object.prototype.hasOwnProperty.call(MENU_VARIANTS, v);
/** WHICH KEY OPENS THE FRONT OF THE STORE. It is 0 everywhere except the changed menu, where the
 *  owner moved it to 5 — which is the whole point of that variant: a saved route still presses 0. */
export const menuFrontKey = (v: MenuVariant) => (v === "menu_changed" ? "5" : "0");
/** The options this menu reads out, in order. */
export function menuOptions(v: MenuVariant): string[] {
  // THE TALKING MENU HAS NO LIST OF KEYS. It asks three questions in order, and the third is an open
  // one, so what it "reads out" is the questions themselves.
  if (v === "talks") return [TALK_HEALTHCARE, TALK_DEPARTMENT, TALK_OPEN];
  const front = v === "menu_changed" ? OPT_FRONT_5 : OPT_FRONT_0;
  const lines = [OPT_PHARMACY, OPT_COSMETICS, OPT_HOME, OPT_HOURS, front, OPT_REPEAT];
  // NO OPTION FITS: the front of the store is simply never offered, so a caller looking for cards
  // hears the whole list and finds nothing that matches.
  return v === "no_option_fits" ? lines.filter((l) => l !== front) : lines;
}

const menuSay = (say: string): RobotAct => ({ sayAs: "menu", say });

/** ONE MENU, WRITTEN AS A SCENE. The greeting, then the options, then a branch per key on the owner's
 *  table, each branch ending back at the top of the options — which is also where six seconds of
 *  nothing, and a key he never listed, both land. */
export function menuScene(v: MenuVariant): RobotScene {
  // THE TALKING MENU IS ITS OWN SHAPE (owner 08-20). It asks one question at a time and listens after
  // each; answer inside its window and it moves on, stay quiet and it says it did not understand and
  // asks again. After the third answer it puts the caller through to the front of the store, where the
  // Staff scene takes the same live call exactly as it does on every other menu.
  if (v === "talks") {
    const ask = (q: string): RobotAct[] => [menuSay(q), { listen: true }];
    return {
      n: 0, card: "", name: `Phone menu — ${MENU_VARIANTS.talks}`, expect: "in_stock", greeting: "",
      acts: [
        { label: "greeting" }, ...MENU_GREETING.map(menuSay),
        { label: "options" },
        ...ask(TALK_HEALTHCARE), ...ask(TALK_DEPARTMENT), ...ask(TALK_OPEN),
        { label: "front" }, { ring: menuRingSecs(3) }, menuSay(MENU_FRONT_DESK),
      ],
      // It answers to WORDS, not keys, so it has no key table. Nothing pressed inside its window is
      // its own affair: it says it did not understand and asks the same question again.
      keysElse: "options", staffAt: "front", talksAndGivesUp: true, gaveUpLine: TALK_GAVE_UP,
    };
  }
  const front = menuFrontKey(v);
  const acts: RobotAct[] = [
    { label: "greeting" },
    ...MENU_GREETING.map(menuSay),
    { label: "options" },
    ...menuOptions(v).map(menuSay),
    { listen: true },
    { goto: "options" },

    // 1 · THE PHARMACY DESK. The WRONG department for cards: pharmacy staff cannot see the front of
    // the store. His script gives this desk one line and no more, so it says that line and then holds
    // the line, quiet, the way a counter does. Nothing here puts another word in its mouth.
    { label: "pharmacy" },
    { ring: menuRingSecs(1) }, menuSay(MENU_PHARMACY_DESK),
    { listen: true }, { listen: true }, { listen: true }, { listen: true }, { hangup: true },

    // 2 · Cosmetics: a recording, then the options again.
    { label: "cosmetics" }, menuSay(MENU_COSMETICS), { goto: "options" },

    // 3 · Home supplies. Two rings, then a voice that cannot help with cards; on the ring-out menu
    // nobody picks this one up either.
    { label: "home" },
    ...(v === "ring_out"
      ? [{ ring: menuRingSecs(2) } as RobotAct, { goto: "options" } as RobotAct]
      : [{ ring: menuRingSecs(2) } as RobotAct, menuSay(MENU_HOME_SUPPLIES),
         { listen: true } as RobotAct, { listen: true } as RobotAct, { listen: true } as RobotAct, { hangup: true } as RobotAct]),

    // 4 · Hours and directions: a recording, then the options again.
    { label: "hours" }, menuSay(MENU_HOURS), { goto: "options" },

    // 0 (or 5) · THE RIGHT DEPARTMENT. The front of the store, which is also customer service. Three
    // real rings, the desk answers, and the robot's own Staff scene takes the same live call from
    // there. On the ring-out menu it rings eight times, nobody answers, and the menu returns.
    { label: "front" },
    ...(v === "ring_out"
      ? [{ ring: menuRingSecs(8) } as RobotAct, { goto: "options" } as RobotAct]
      : [{ ring: menuRingSecs(3) } as RobotAct, menuSay(MENU_FRONT_DESK)]),
  ];
  // THE CHANGED MENU SENDS THE OLD KEY TO THE WRONG PERSON (owner 08-08). A saved route that presses
  // 0 must still REACH somebody, and the somebody must be wrong. A route that lands on nobody is easy
  // to catch, because the menu just plays again; a route that still reaches a person and only the
  // wrong person is the failure that quietly poisons the data, and that is the one to catch.
  const keys: Record<string, string> = {
    "1": "pharmacy", "2": "cosmetics", "3": "home", "4": "hours", "9": "options", [front]: "front",
  };
  if (v === "menu_changed") keys["0"] = "pharmacy";
  return {
    n: 0, card: "", name: `Phone menu — ${MENU_VARIANTS[v]}`, expect: "in_stock", acts,
    greeting: "", keys, keysElse: "options", holdKeysUntil: "options",
    ...(v === "press_ignored" ? { swallowEarlyKeys: true as const } : {}),
    ...(v === "ring_out" ? {} : { staffAt: "front" }),
  };
}

/** Which menu the next call plays, or null when the menu is off and the robot answers as Staff the
 *  way it always has. */
export async function menuPick(): Promise<MenuVariant | null> {
  const raw = ((await getSetting("robot_menu")) || "").trim().toLowerCase();
  if (!raw || raw === "off") return null;
  return isMenuVariant(raw) ? raw : null;
}

/** The greetings, one per run, rotated. All five are real openings from our own history. */
export const ROBOT_GREETINGS: string[] = [
  "Larry Vasquez, how can I help you?",
  "Thanks for calling MVP's. Can I help you?",
  "Good morning, MVP's Woodland Hills. How can I help today?",
  "Mm-hmm. Hello?",
  "Hi, how can I help you? Hello?",
];

/**
 * WHAT A REAL PERSON DOES ONCE THEY HAVE ANSWERED: they wait for the caller to say goodbye. They do
 * not put the phone down the second the words are out of their mouth.
 *
 * This matters more than it sounds. A store that hangs up instantly HIDES a missing sign-off — the
 * check ends either way, so a caller who never says thanks and goodbye looks exactly like one who
 * does. The owner spotted that on four checks in a row: every conversation ended on OUR question.
 * So the robot now holds the line, quietly, for about forty seconds before giving up on us.
 */
const WAIT_OUT: RobotAct[] = [{ listen: true }, { listen: true }, { listen: true }, { listen: true }, { hangup: true }];

/** `expect` is what a right answer looks like for this scene, in the site's own verdict words. It is
 *  NOT a second expectations list: the owner's Admin Testing rows own pass and fail for the steps of
 *  a check. This is only the VERDICT, which is the one thing scenarios 7 and 8 exist to catch. */
export const ROBOT_SCENES: RobotScene[] = [
  { n: 1, card: "answer_clear_yes", name: "Yes, plainly", expect: "in_stock", acts: [
    { listen: true }, { say: "Yeah." },
    // A REAL ANSWER TO THE SET QUESTION (owner 08-05). The scene used to answer it with "We do.",
    // which a human would never say there, and then name "the one fifty one booster boxes", which
    // transcribes as "151" and kept failing the word row no matter how right the record was. The
    // owner's ruling: get rid of 151, use another product name. Pitch Black, DELIBERATELY not the
    // Chaos Rising in Charlie's own example question, so a check proves he heard their answer and
    // never that he echoed himself. The set and the type both in one line, so his chain closes and
    // the reveal's subhead has real product words. Spec-approved, not corpus.
    { listen: true }, { say: "Uh yeah, it's the Pitch Black booster boxes." },
    ...WAIT_OUT,
  ] },
  // THE ANSWER IS NOT THE LAST THING A PERSON SAYS (owner 08-06). Charlie asks one more question
  // after a no, when more are coming in, and every one of these scenes used to stop dead before it.
  // So he asked into silence, the check died with no goodbye, and six tests could never pass. A
  // human at a real counter always says something back. Three different shapes on purpose: a real
  // day, a vague "soon", and an honest "I don't know" — the card says whatever Staff answer IS the
  // answer, even "soon", so all three have to be proven.
  { n: 2, card: "answer_clear_no", name: "No, plainly", expect: "not_in_stock", acts: [
    { listen: true }, { say: "We did not." },
    { listen: true }, { say: "Uh, probably Tuesday, that's when the truck comes." },
    // NAME A DAY AND HE ASKS THE TIME (owner 08-07). Charlie's own words now follow a shipment day
    // with "what time", and this scene had nothing left to say, so the check ended on OUR question.
    { listen: true }, { say: "Uh, morning usually, before we open." },
    ...WAIT_OUT,
  ] },
  { n: 3, card: "answer_clear_no", name: "No, softened", expect: "not_in_stock", acts: [
    { listen: true }, { say: "No, I'm sorry. I haven't seen any yet." },
    { listen: true }, { say: "Not sure, honestly. Soon, I'd think." },
    // "Soon" is neither a day nor a time, so he asks for both once more. They give what they have.
    { listen: true }, { say: "Maybe end of the week? I really couldn't say what time." },
    ...WAIT_OUT,
  ] },
  { n: 4, card: "answer_clear_no", name: "No, this shipment", expect: "not_in_stock", acts: [
    { listen: true }, { say: "No, we don't have any this, this shipment." },
    { listen: true }, { say: "I really don't know, they don't tell us." },
    ...WAIT_OUT,
  ] },
  // The ONE hold in our whole history that ever worked. 45 seconds, and SILENCE, not music.
  { n: 5, card: "hold_silence", name: "Walks away, comes back", expect: "not_in_stock", acts: [
    { listen: true },
    { say: "Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front and see. Okay, let me just put you on hold." },
    { silence: 45 },
    { say: "Okay, thank you for holding. Yeah, I did not see any, unfortunately." },
    { listen: true }, { say: "Uh, next week maybe? I'm not certain." },
    // A day with no time gets his one follow-up, same as scene 2, so the check can finish warmly
    // instead of running out of script with his question hanging.
    { listen: true }, { say: "No idea on the time, sorry. Whenever they drop them off." },
    ...WAIT_OUT,
  ] },
  // Happened twice for real. One of them ran 121 seconds and never resolved, so that is the length.
  // LEFT ON HOLD, NEVER COULDN'T TELL (owner 08-07). Couldn't tell is the worst case bucket, for a
  // check where we genuinely could not make out what happened. Here we know exactly what happened:
  // they put us on hold and never came back, and we have a status that says that in those words.
  { n: 6, card: "hold_permanently", name: "Walks away, never comes back", expect: "left_on_hold", acts: [
    { listen: true },
    { say: "Um, give me just a second. Let me double-check." },
    { silence: 60 }, { silence: 61 },
    { hangup: true },
  ] },
  // THE HIGHEST VALUE TEST ON THE LIST. We scored this real check as no clear answer. It is a YES.
  { n: 7, card: "answer_yes_vague", name: "The yes hidden inside a no", expect: "in_stock", acts: [
    { listen: true },
    { say: "We did, but it's not out yet, so... uh, or I don't think it's out. Let me see." },
    { listen: true },
    { say: "It's like a box with, like, three packs in it, I think, or something like that." },
    // THE SET STILL HAS NO NAME, so he asks for the missing half once, in different words, and this
    // scene had nothing left to say (the sweep, owner's round two rule: every scene has Staff
    // ANSWERING, or he asks into nothing and we pay for the rest of the check). Spec-approved, not
    // corpus, and vague on purpose: this is the scene about a store that is sure of nothing.
    { listen: true }, { say: "Uh, Pitch Black, I want to say? Something like that." },
    ...WAIT_OUT,
  ] },
  // Second highest. We stamped NOT IN STOCK before they came back with the answer.
  { n: 8, card: "answer_yes_vague", name: "The no that turns into a maybe", expect: "in_stock", acts: [
    { listen: true },
    { say: "We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment." },
    { silence: 30 },
    { say: "Yeah, we've got a few." },
    { listen: true }, { say: "Uh, the Pitch Black boxes I think." },
    ...WAIT_OUT,
  ] },
  // 6 of 14 real checks did exactly this. No scripted test has ever reproduced it.
  { n: 9, card: "hungup_staff", name: "Cannot hear us, gives up", greeting: "Hi, how can I help you? Hello?", expect: "nobody_answered", acts: [
    { silence: 3 },
    { say: "I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye." },
    { hangup: true },
  ] },
  // The greeting names the WRONG department, and the second voice is a different person.
  // The spec's row stops at Dana's greeting; her answer is a verbatim line from the same corpus
  // ("We did not.") so the check can finish. Nothing here is invented.
  //
  // REWRITTEN 08-07: THIS SCENE COULD NEVER TEST THE THING IT IS NAMED FOR. The card is "Transfer:
  // Charlie requested" and the ask is the whole of it, and check 332 has no such line anywhere. It
  // was not Charlie's fault. The robot answered from the pharmacy, listened once (which is Delta
  // playing our question), and then said "Okay. Transferring you now." — so Staff moved us on their
  // own before he ever had a turn, and there was nothing left for him to ask for. That is scene 14,
  // "Moved on without being asked", which is a different card.
  //
  // So the wrong department is now STATED and then the robot WAITS. That empty turn is the test: he
  // has been told he is in the wrong place, nobody has offered to move him, and the only way this
  // check survives is if he asks. Only after he asks do they put him through.
  { n: 10, card: "transfer_requested", name: "Wrong department, then transfers", greeting: "MVP's pharmacy, this is Larry.", expect: "not_in_stock", acts: [
    { listen: true },
    // Corpus, the same line scene 15 opens with. It says where we landed and offers us nothing.
    { say: "Oh, that's not us, that's the front." },
    // HIS TURN, AND THE WHOLE POINT OF THE CARD. Nothing here moves until he asks.
    { listen: true },
    { say: "Sure, one sec, I'll put you through." },
    { ring: 6 },
    { sayAs: "transfer", say: "Sporting goods, this is Dana." },
    { listen: true },
    { sayAs: "transfer", say: "We did not." },
    { listen: true }, { sayAs: "transfer", say: "Thursdays, usually." },
    // A DAY NAMED GETS HIS "WHAT TIME" (owner 08-07), and this scene had nothing left to say, so
    // the check ended on our own question with the meter running (the sweep).
    { listen: true }, { sayAs: "transfer", say: "Early, before we open, usually." },
    ...WAIT_OUT,
  ] },
  // THE OWNER'S OWN CHECK 298, MADE REPEATABLE (08-06). He told Charlie to hold, went quiet, then
  // asked several short ways whether we were still there. Charlie never came back and not one word
  // of it was written down. No robot scene could ever have caught it: scene 5 comes back with one
  // long sentence, and one long sentence was the only thing the ear would accept as somebody being
  // back. This one comes back the way a person really does, in short questions with pauses between
  // them. Every line is corpus: the pause line is scene 6's, "Hello? Hello?" is Barnes & Noble
  // Calabasas, and the answer is the same line scene 3 uses.
  { n: 11, card: "hold_silence", name: "Walks away, comes back asking if we are there", expect: "not_in_stock", acts: [
    { listen: true },
    { say: "Um, give me just a second. Let me double-check." },
    { silence: 20 },
    { say: "Hello?" },
    { silence: 4 },
    { say: "Hello? Hello?" },
    { listen: true },
    { say: "No, I'm sorry. I haven't seen any yet." },
    { listen: true }, { say: "Not sure, honestly. Soon, I'd think." },
    // "Soon" is neither a day nor a time, so he asks for both once more, exactly as in scene 3, and
    // this scene stopped one turn before that. Same corpus line scene 3 answers it with.
    { listen: true }, { say: "Maybe end of the week? I really couldn't say what time." },
    ...WAIT_OUT,
  ] },
  // ---- THE NINE CARDS THAT HAD NO SCENE AT ALL (spec: scenes-needed.md, owner approved 08-06) ----
  // Two of them are missing on purpose and are the owner's own next job: hold with music and a phone
  // set down on the counter both need a sound recording, and he is picking those clips himself.
  // REWRITTEN 08-07, the owner's own correction: this is the ring AFTER A TRANSFER that nobody ever
  // comes back from, and what it proves is that OUR system hangs up. It used to ring from the very
  // first dial, which he says is a different test: a phone that never gets answered at all is the
  // carrier's own no-answer, and the carrier's no-answer never reaches our engine, so all that
  // version could ever prove is that we notice a line we are already connected to staying silent.
  //
  // A transfer is where this really bites and where it costs us. We have already paid to get to a
  // person, Charlie has already been on, and the desk they send us to just rings, and rings. If our
  // own give-up does not fire there, the check runs to the four minute cap every single time.
  //
  // Ninety five seconds of it, so the give-up at ninety has to fire DURING the ringing rather than
  // landing exactly on its edge. The hang-up at the end is only ever reached if ours never fired,
  // which makes the robot outliving us the failure this scene is looking for.
  { n: 12, card: "hungup_ringing", name: "Transferred to a desk that only rings", expect: "nobody_answered", noGoodbye: true,
    greeting: "MVP's pharmacy, this is Larry.", acts: [
    { listen: true },
    { say: "Oh, that's not us, that's the front." },
    { listen: true },
    { say: "Sure, hold on, I'll put you through." },
    { ring: 95 },
    { hangup: true },
  ] },
  // THE MOST EXPENSIVE TEST ON THE LIST, about four times a normal check. Somebody who genuinely is
  // talking, warmly, and never once answers the question. Every rule we have is working correctly
  // and the check still runs away with the margin, which is why the limit exists at all. The robot
  // waits for Charlie between each line, so this stretches past four minutes on its own.
  // MOVED TO ITS OWN CARD (owner 08-07). This was filed under the 4 minute limit, which is our own
  // safety net and a different test entirely. What a rambler actually proves is Charlie's manners:
  // once he has been TALKING for the Admin number he asks once more, takes what he gets and CLOSES.
  // So the robot no longer hangs up on him — it waits, the way every other scene does, or a goodbye
  // is unspeakable by design and the test can never pass.
  { n: 13, card: "wrapup_never_answered", name: "Talks past the answer, forever", expect: "no_straight_answer", acts: [
    { listen: true }, { say: "Oh, Pokemon cards, yeah. We get a ton of calls about those, honestly." },
    { listen: true }, { say: "You know my nephew collects them. He's got a whole binder, must be hundreds." },
    { listen: true }, { say: "There was a guy in here last week, bought like twenty packs at once. Twenty." },
    { listen: true }, { say: "It's been nuts since all the trading card stuff took off again, I'll tell you that." },
    { listen: true }, { say: "We used to only carry the sports ones, back when I started here." },
    { listen: true }, { say: "Anyway, what was it you were after? Sorry, it's been one of those days." },
    { listen: true }, { say: "Right, right. Hang on, my manager's waving at me about something." },
    { listen: true }, { say: "Sorry about that. Where were we? Busy in here today." },
    // The owner's line: repeat the last three until the limit ends the check.
    { listen: true }, { say: "Anyway, what was it you were after? Sorry, it's been one of those days." },
    { listen: true }, { say: "Right, right. Hang on, my manager's waving at me about something." },
    { listen: true }, { say: "Sorry about that. Where were we? Busy in here today." },
    { listen: true }, { say: "Anyway, what was it you were after? Sorry, it's been one of those days." },
    { listen: true }, { say: "Right, right. Hang on, my manager's waving at me about something." },
    { listen: true }, { say: "Sorry about that. Where were we? Busy in here today." },
    ...WAIT_OUT,
  ] },
  // A STORE MOVING US ON ITS OWN, which is the common one and has never been tested. The only
  // transfer scene we had was the one where Charlie ASKS to be put through.
  { n: 14, card: "transfer_new_person", name: "Moved on without being asked", expect: "in_stock", acts: [
    { listen: true }, { say: "Oh, one sec, let me grab someone." },
    { ring: 6 },
    { sayAs: "transfer", say: "This is Maria, what can I do for you?" },
    { listen: true }, { sayAs: "transfer", say: "Yeah, we've got some." },
    { listen: true }, { sayAs: "transfer", say: "The Pitch Black boxes." },
    ...WAIT_OUT,
  ] },
  // Charlie asks to be put through and there is nobody to put him through TO. He thanks them and
  // ends it without nagging. Too busy to check has never once been produced by a test.
  { n: 15, card: "transfer_nobody", name: "Nobody up front to take it", expect: "too_busy",
    greeting: "MVP's pharmacy, this is Larry.", acts: [
    { listen: true }, { say: "Oh, that's not us, that's the front." },
    { listen: true }, { say: "There's nobody up there right now, sorry." },
    ...WAIT_OUT,
  ] },
  // THE SWITCH ITSELF. Asking to be put through is OFF for this run, so Charlie must never once
  // bring up being transferred: he takes what he can get and wraps up. The safety line is the
  // owner's own (spec, test 14): if he says anything more, Staff answer once and that is that.
  { n: 16, card: "transfer_switch_off", name: "Wrong department, asking switched off", expect: "no_straight_answer",
    greeting: "MVP's pharmacy, this is Larry.", acts: [
    { listen: true }, { say: "That's the front, I can't see those from back here." },
    { listen: true }, { say: "Yeah, sorry, I really can't help you with that from back here." },
    ...WAIT_OUT,
  ] },
  // THE ONE WHERE A WRONG CALL COSTS US A WHOLE RECORDED MESSAGE. A machine answers, and we have to
  // be gone before Charlie is ever switched on.
  { n: 17, card: "voicemail_detected", name: "Their answering machine picks up", expect: "voicemail", noGoodbye: true,
    greeting: "You've reached MVP's. We're not able to take your call right now. Please leave a message after the tone.", acts: [
    { beep: true },
    { silence: 30 },
    { hangup: true },
  ] },
  // NO CHECK HAS EVER RUN IN SPANISH END TO END. The answer given in Spanish has to set the status.
  { n: 18, card: "language_spanish", name: "Staff speak Spanish", expect: "in_stock",
    greeting: "MVP's, buenas tardes. ¿En qué le puedo ayudar?", acts: [
    { listen: true }, { say: "Sí, tenemos algunos." },
    { listen: true }, { say: "Son las cajas de Pitch Black." },
    ...WAIT_OUT,
  ] },
  // THE NEW CARD, test 18 on the owner's list (his ruling 08-06, this arrives with hobby stores).
  // On a check for one exact product a general yes is NOT a yes. Only the exact item is.
  { n: 19, card: "exact_product", name: "A general yes is not the exact product", expect: "in_stock", acts: [
    { listen: true }, { say: "Uh, Pokemon, yeah, we've got some stuff." },
    { listen: true }, { say: "Oh, the Pitch Black boxes? Yeah, we've got a couple of those." },
    ...WAIT_OUT,
  ] },

  // ============================== ROUND TWO, 08-07 ==============================================
  // THE RULE BEHIND ALL OF THESE (owner's own words in the round two order): every scene has Staff
  // ANSWERING. The only exceptions are the tests that exist to see how Charlie behaves when Staff
  // walk off or never pick up (6, 9, 12, 17). A scene that leaves him asking into nothing runs the
  // check to its full length and proves nothing, and we pay for the whole of it.
  //
  // ---- HOLD: MUSIC. Three of them, because the danger is different in each. -------------------
  // Every recording is the owner's own pick, approved by ear and committed. Loudness and length are
  // written into ROBOT_CLIPS and never left to whatever the file happens to be.
  //
  // WHAT THEY PROVE, all three: hold music stops Charlie's meter exactly the way silence does, he
  // stays dropped for the whole of it, and he comes back when a PERSON speaks to us again. Music is
  // the harder case than silence because there is sound on the line the whole time, so the one thing
  // that could go wrong here is us paying through a hold we thought had ended.
  { n: 20, card: "hold_music", name: "Hold with music, then an answer", expect: "in_stock", acts: [
    { listen: true }, { say: "Sure, let me check on that for you, one moment." },
    // Loud and even, peaking right at the top of the line the whole way through: the version most
    // likely to be mistaken for somebody talking to us.
    { clip: "musicClassic" },
    { say: "Yeah, we've got some in." },
    { listen: true }, { say: "It's the Pitch Black boxes." },
    ...WAIT_OUT,
  ] },
  // HIS OWN REASON FOR PICKING THIS ONE: it starts quiet and gets louder, so it tests whether a
  // RISING sound is ever read as a person coming back.
  { n: 21, card: "hold_music", name: "Hold with music that swells, then an answer", expect: "in_stock", acts: [
    { listen: true }, { say: "Hang on, let me go and see for you." },
    { clip: "musicWaltz" },
    { say: "Yeah, we do have those in." },
    { listen: true }, { say: "The Pitch Black booster boxes." },
    ...WAIT_OUT,
  ] },
  // THE DANGEROUS ONE (his own case, 08-06): real stores play music and then a RECORDED VOICE
  // selling something, then more music. A recorded voice is the closest thing to Staff coming back
  // that is not Staff. Charlie must stay dropped through the whole advertisement, must never answer
  // it, and not one word of it may reach the record as something Staff said to us. The voice is
  // already mixed under the music in the committed file, so this plays it whole and mixes nothing.
  { n: 22, card: "hold_music_advert", name: "Hold with an advert in the music, then an answer", expect: "in_stock", acts: [
    { listen: true }, { say: "One moment, I'll go and have a look." },
    { clip: "musicWithAd" },
    { say: "Yeah, we've got a few of those." },
    { listen: true }, { say: "Pitch Black, the booster boxes." },
    ...WAIT_OUT,
  ] },
  // ---- HOLD: PHONE DOWN. Run twice, and THE TWO VOLUMES ARE THE TEST (owner 08-06). -----------
  // The phone is set on the counter and the room carries on without us. It is neither quiet nor
  // music, which is the fourth shape of a hold and the one that used to keep Charlie billing. The
  // room has to land under `roomFraction` of the Staff voice or nothing is being tested: both clips
  // do, and by how much is written into ROBOT_CLIPS.
  //
  // WHAT THEY PROVE: background store noise stops the meter the same way silence does, and somebody
  // talking across the room is not somebody talking to us.
  { n: 23, card: "hold_phone_down", name: "Phone on the counter, quieter room", expect: "in_stock", acts: [
    { listen: true }, { say: "Hold on, let me go look." },
    { clip: "busyStore" },
    { say: "Yeah, we've got a couple." },
    { listen: true }, { say: "I think they're the Pitch Black ones." },
    ...WAIT_OUT,
  ] },
  { n: 24, card: "hold_phone_down", name: "Phone on the counter, louder room", expect: "in_stock", acts: [
    { listen: true }, { say: "Let me put this down a sec and go check." },
    { clip: "busyCafe" },
    { say: "Yeah, there's some on the shelf." },
    { listen: true }, { say: "The Pitch Black boxes, I think they are." },
    ...WAIT_OUT,
  ] },
  // ---- DELTA: FAILED. The card existed with no scene (owner's round two order, item 4). --------
  // Delta is the recording that carries our question. When it never plays, Charlie asks it himself,
  // which is the DESIGNED fallback and costs a few cents more. It was proven by accident on 08-06
  // when mapping turned out never to have wired Delta in at all, and it has never once been tested
  // on purpose. Delta is switched off for this ONE check (`deltaOff`, put back straight after, the
  // same way the transfer switch is handled for scene 16), Staff then answer completely normally,
  // and the check still has to come back with a status.
  //
  // The words are ordinary on purpose. Nothing about how STAFF behave is being tested here, only
  // whether the check survives its recording never playing, so anything unusual in their lines would
  // muddy what a failure means.
  { n: 25, card: "delta_failed", name: "Delta never played, Charlie asks it himself", expect: "in_stock", acts: [
    { listen: true }, { say: "Yeah, we've got some of those in." },
    { listen: true }, { say: "Uh, the Pitch Black booster boxes." },
    ...WAIT_OUT,
  ] },
  // ---- HUNGUP: 4 MINUTE LIMIT. THE OWNER'S RUNAROUND, and it is written LAST on purpose because
  // it needs the transfer working first (his order, 08-07). Every other scene is one thing going
  // wrong. This is a store being perfectly pleasant and wasting the entire check.
  //
  // His own shape, in his order: wrong department, a few questions, they transfer us, a long hold,
  // a new person who says they will be right with us, another hold, they pick up and ask how they
  // can help, we ask, they say they will go look, and they never come back.
  //
  // HIS HARD RULE: no single hold may run 120 seconds, or the hold cap ends the check before the
  // four minute cap ever gets a turn, and then this scene silently tests the wrong thing. The three
  // waits below are 84, 55 and 60 seconds, so the longest is 36 short of the cap.
  //
  // AND HIS TIMING, which is what makes the four minutes reachable at all: about 30 seconds in the
  // wrong department, about 90 for the hold after the transfer, about 60 for the new person and the
  // second hold, about 20 to ask. That is about 200 seconds before the last wait even starts, and
  // the last wait is what runs into the limit.
  //
  // THE MOST EXPENSIVE TEST ON THE LIST, roughly four times a normal check, so it is dialed on
  // purpose and never as part of a sweep.
  { n: 26, card: "hungup_limit", name: "The runaround, until the four minute limit", expect: "admin_hangup", noGoodbye: true,
    greeting: "MVP's pharmacy, this is Larry.", acts: [
    // ABOUT 30 SECONDS IN THE WRONG DEPARTMENT. Three turns, with Charlie between each, and nothing
    // in any of them is an answer.
    { listen: true }, { say: "Pokemon cards? Uh, that's not really us back here." },
    { listen: true }, { say: "Yeah, no, I can't see the shop floor from the pharmacy, sorry." },
    { listen: true }, { say: "Sure, hold on, let me see who's up there." },
    // THEY TRANSFER US, AND THEN A LONG HOLD. 6 ringing plus 84 quiet is his 90.
    { ring: 6 },
    { silence: 84 },
    // A NEW PERSON, WHO SAYS THEY WILL BE RIGHT WITH US AND GOES AGAIN. His 60.
    { sayAs: "transfer", say: "Hi, sorry, I'll be right with you, one second." },
    { silence: 55 },
    // THEY PICK UP AND ASK HOW THEY CAN HELP, SO WE ASK. His 20.
    { sayAs: "transfer", say: "Sorry about that. How can I help you?" },
    { listen: true },
    { sayAs: "transfer", say: "Let me go and have a look for you." },
    // AND THEY NEVER COME BACK. Nothing but our own four minute limit can end this check now, which
    // is the one thing it exists to prove. The hang-up below is only ever reached if the limit did
    // not fire, so the robot outliving us is the failure this scene is looking for.
    { silence: 60 },
    { hangup: true },
  ] },
];

export function robotScene(n: number): RobotScene | null { return ROBOT_SCENES.find((s) => s.n === n) || null; }

/** What the robot has actually said on a call, in order — the ground truth the harness compares the
 *  site's written transcript against. Word for word, because the script is known exactly. */
export interface RobotSaid { text: string; atSec: number; voice: "staff" | "transfer" | "menu";
  /** Which beat of the scene this line was. A key press stops the audio dead, so a line handed to the
   *  phone company but cut off before it played has to come back OFF the record — or the record
   *  claims the caller heard something they never did (owner 08-08). */
  act?: number }
export interface RobotRun {
  id: string; callSid: string; scenario: number; sceneName: string; greeting: string;
  startedAt: number; endedAt?: number; said: RobotSaid[]; heard: string[];
  /** WHICH MENU this call played, when it played one, and every key the caller pressed: whether it
   *  landed before the reading had finished, whether it was held from the greeting, and what it
   *  actually did. This is what a mapping test reads back (owner 08-08). */
  menu?: MenuVariant;
  keys?: Array<{ key: string; atSec: number; early: boolean; held: boolean; acted: string }>;
}
const robotRuns: RobotRun[] = [];
export function robotLastRun(): RobotRun | null { return robotRuns[0] || null; }
export function robotRunFor(callSid: string): RobotRun | null { return robotRuns.find((r) => r.callSid === callSid) || null; }

/** The store's own words when a caller asks something this scene never scripted an answer for. */
export const ROBOT_ALL_I_KNOW = "Sorry, that's all I know.";
interface RobotState { run: RobotRun; acts: RobotAct[]; act: number; clips: (Buffer | null)[]; quiet: number;
  /** The one off-script line for an ask the scene cannot answer. Once, ever, like "Hello?". */
  saidAllIKnow?: boolean;
  /** The one "Hello?" the robot may say into a silence (the honest store, 08-08). Once, ever. */
  saidHello: boolean;
  /** THE MENU'S SIDE OF A CALL, on a scene that has a key table. `sentMs` is when the document we are
   *  playing right now went out and `secs` is how long each of its lines runs, so the second a key
   *  comes back says exactly which line was playing — the phone company stops the audio dead on a key
   *  and never says how far in. `held` is a key pressed during the greeting, waiting for the options.
   *  `loops` stops a forgotten call reading the menu for ever on a real line. */
  sentMs?: number; sentParts?: Array<{ act: number; secs: number }>; saidFrom?: number; held?: string | null; loops?: number;
  /** The menu this call is playing, and its key table, read once when the call was answered. */
  menu?: MenuVariant; keys?: Record<string, string>; keysElse?: string; holdLabel?: string; swallowEarly?: boolean;
  /** A TALKING MENU'S OWN WINDOW. It asks, and if nothing is said inside TALK_WINDOW_SEC it says it
   *  did not understand and asks the same question again. `askedAct` is the beat it is waiting on, so
   *  the same question is re-asked rather than the whole menu starting over. */
  talks?: boolean; gaveUpLine?: string; askedAct?: number; givenUp?: number }
const robotCalls = new Map<string, RobotState>();

/** Which scene the next inbound call plays, and (optionally) which greeting. Stored as "7" or "7:2"
 *  so a harness run can be repeated exactly instead of landing wherever the rotation happens to be. */
export function parseRobotPick(raw: string | null): { scenario: number; greeting: number | null } {
  const [a, b] = String(raw || "").split(":");
  const n = Number(a);
  const g = b === undefined || b === "" ? null : Number(b);
  return { scenario: Number.isFinite(n) && robotScene(n) ? n : 1, greeting: g != null && Number.isFinite(g) ? g : null };
}

/** The THREE voices. Staff is NOT Charlie: anyone listening back has to be able to tell who is who,
 *  the person a transfer hands us to is a different person again, and the store's own phone MENU is
 *  not a person at all. The menu voice is fixed and its settings are fixed, so it says the same words
 *  the same way on every call — which is the whole thing these mapping tests are about (owner 08-08). */
async function robotVoices(): Promise<{ staff: string; transfer: string; menu: string }> {
  const [s, t, m] = await Promise.all([getSetting("robot_voice_staff"), getSetting("robot_voice_transfer"), getSetting("robot_voice_menu")]);
  return { staff: (s || "pNInz6obpgDQGcFmaJgB").trim(), transfer: (t || "21m00Tcm4TlvDq8ikWAM").trim(), menu: (m || "EXAVITQu4vr4xnSDxMaL").trim() };
}

/** US ringback, by the published cadence: 440 + 480 Hz, two seconds of tone then four of silence.
 *  A real burst is what the call's own ear measures a transfer by, so a fake one would test nothing. */
export function ringbackWav(seconds: number): Buffer {
  const rate = 8000, total = Math.max(1, Math.round(seconds * rate));
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / rate, inCycle = t % 6;
    const on = inCycle < 2;
    const v = on ? Math.round(9000 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t))) : 0;
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** THE TONE AT THE END OF A VOICEMAIL GREETING. 1000 Hz for a third of a second, which is what a
 *  North American answering machine actually sounds like, and the one sound that tells a caller the
 *  recording has finished and it is now talking to a tape. */
export function beepWav(): Buffer {
  const rate = 8000, total = Math.round(0.33 * rate);
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    // Eased in and out, so the tone starts and stops the way a real one does rather than clicking.
    const edge = Math.min(1, Math.min(t, 0.33 - t) / 0.01);
    pcm.writeInt16LE(Math.round(11000 * edge * Math.sin(2 * Math.PI * 1000 * t)), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

const robotClipUrl = (sid: string, i: number) => `<Play>https://${HOST}/robot/clip?call=${encodeURIComponent(sid)}&amp;i=${i}</Play>`;
// IT HEARS A KEY PRESS NOW, as well as speech (owner 08-08). Listening for speech alone is exactly
// why pressing 2 at the robot store did nothing at all, and why no phone menu had ever been walked
// without spending money on a stranger's store. A Staff scene has no key table and simply ignores a
// key, so this changes nothing for the nineteen scenes that were already here.
const robotGather = (sid: string, secs: number) =>
  `<Gather input="dtmf speech" numDigits="1" speechTimeout="auto" enhanced="true" speechModel="phone_call" timeout="${secs}" ` +
  `action="https://${HOST}/robot/step?call=${encodeURIComponent(sid)}" method="POST"/>` +
  `<Redirect method="POST">https://${HOST}/robot/step?call=${encodeURIComponent(sid)}&amp;silent=1</Redirect>`;

export function robotClip(callSid: string, i: number): Buffer | null { return robotCalls.get(callSid)?.clips[i] || null; }

/**
 * A call lands on the robot's number. Pick the scene, record every line it will need in the two
 * voices (cached, so this costs nothing after the first run), and start playing.
 */
export async function robotAnswer(callSid: string, from?: string, opts?: {
  /** THE LINE THE DESK ANSWERS WITH, when somebody else has already got us to a desk. The phone menu
   *  (`robot-menu.ts`) walks the caller to the front of the store and hands the SAME live call over
   *  here, so the scene opens on the desk's own words instead of picking a greeting of its own.
   *  Nothing else about a scene changes, and with no opts this behaves exactly as it always has. */
  greeting?: string;
  /** What plays before the first word — the ringback of the desk we were just put through to. The
   *  default is the beat a handset takes to come up when we are the ones being answered. */
  lead?: string;
}): Promise<string> {
  if (!callSid) return twiml("<Hangup/>");
  const existing = robotCalls.get(callSid);
  if (existing) return robotPlay(callSid, existing); // Twilio refetched the same document: carry on, never restart
  const pick = parseRobotPick(await getSetting("robot_scenario"));
  const scene = robotScene(pick.scenario) as RobotScene;
  const greeting = opts?.greeting
    || scene.greeting
    || (pick.greeting != null ? ROBOT_GREETINGS[((pick.greeting % ROBOT_GREETINGS.length) + ROBOT_GREETINGS.length) % ROBOT_GREETINGS.length] : rotatePick("robot:greeting", ROBOT_GREETINGS))
    || ROBOT_GREETINGS[0];
  // THE STORE ANSWERS AS A PHONE MENU, when one is switched on (owner 08-08). It is a scene like any
  // other, so it is built the same way and played by the same player; the only difference is that at
  // the front of the store the chosen STAFF scene is spliced straight in, and the same live call
  // carries on into it. With no menu switched on, everything below is exactly what it always was.
  const menu = opts?.greeting ? null : await menuPick();
  const menuSc = menu ? menuScene(menu) : null;
  // NOBODY PICKS UP: no greeting, no voice, nothing but the line ringing (owner 08-06, scene 12).
  const staffActs: RobotAct[] = scene.neverAnswers ? [...scene.acts] : [{ say: greeting }, ...scene.acts];
  const acts: RobotAct[] = menuSc
    ? [...menuSc.acts, ...(menuSc.staffAt ? scene.acts : [])]
    : staffActs;
  const { staff, transfer, menu: menuVoice } = await robotVoices();
  const clips = await Promise.all(acts.map((a) => {
    if (!("say" in a)) return Promise.resolve(null);
    // The menu is a third voice, and it is fixed: same voice, same settings, so it says the same
    // words the same way on every call, which is the whole thing these mapping tests are about.
    if ("sayAs" in a && a.sayAs === "menu") return mp3Clip(menuVoice, a.say, { stability: 0.75, similarity_boost: 0.75 });
    return mp3Clip("sayAs" in a ? transfer : staff, a.say, { stability: 0.45, similarity_boost: 0.8 });
  }));
  // THE ONE LINE OFF SCRIPT (the honest store, 08-08): "Hello?", in the Staff voice, for a caller
  // who has gone silent. It rides one slot past the acts' own clips; cached like every other line.
  clips.push(await mp3Clip(staff, "Hello?", { stability: 0.45, similarity_boost: 0.8 }).catch(() => null));
  // AND ONE HONEST LINE FOR AN ASK NO SCENE SCRIPTED (owner, 08-17 late, off check 376: Charlie
  // asked something the scene had no answer for and the store simply went quiet, so the check paid
  // for a minute of dead air no real person would have given). Real Staff say they do not know.
  // In BOTH voices, because whoever is on the line has to say it themselves: after a transfer the
  // person we are talking to is a different person, and Staff's voice answering there would be a
  // third person nobody handed the phone to.
  clips.push(await mp3Clip(staff, ROBOT_ALL_I_KNOW, { stability: 0.45, similarity_boost: 0.8 }).catch(() => null));
  clips.push(await mp3Clip(transfer, ROBOT_ALL_I_KNOW, { stability: 0.45, similarity_boost: 0.8 }).catch(() => null));
  const missing = acts.findIndex((a, i) => "say" in a && !clips[i]);
  if (missing >= 0) { console.error("[robot] clip synthesis failed — check ElevenLabs credits"); return twiml("<Hangup/>"); }
  const run: RobotRun = {
    id: crypto.randomUUID().slice(0, 8), callSid, scenario: scene.n, sceneName: scene.name, greeting,
    startedAt: Date.now(), said: [], heard: [], ...(menu ? { menu, keys: [] } : {}),
  };
  robotRuns.unshift(run); while (robotRuns.length > 40) robotRuns.pop();
  const st: RobotState = { run, acts, act: 0, clips, quiet: 0, saidHello: false,
    ...(menuSc ? { menu: menu as MenuVariant, keys: menuSc.keys, keysElse: menuSc.keysElse, holdLabel: menuSc.holdKeysUntil, swallowEarly: !!menuSc.swallowEarlyKeys, held: null, loops: 0,
      talks: !!menuSc.talksAndGivesUp, gaveUpLine: menuSc.gaveUpLine } : {}) };
  robotCalls.set(callSid, st);
  setTimeout(() => robotCalls.delete(callSid), 15 * 60 * 1000);
  console.log(menuSc
    ? `[robot] answering ${from || "?"} with the "${menu}" phone menu (${MENU_VARIANTS[menu as MenuVariant]}), then scenario ${scene.n} (${scene.name}) at the front of the store`
    : `[robot] answering ${from || "?"} with scenario ${scene.n} (${scene.name}) · greeting "${greeting}"`);
  // A beat before speaking: a handset comes up, then the person talks. When the phone menu put us
  // through, that beat is the desk's own ringing instead.
  return robotPlay(callSid, st, opts?.lead ?? `<Pause length="1"/>`);
}

/** WHERE A LABEL SITS in this call's acts. Labels are a place in the scene and never a sound. */
function labelAt(st: RobotState, label: string): number {
  const i = st.acts.findIndex((a) => "label" in a && a.label === label);
  return i < 0 ? st.acts.length : i;
}

/** Walk the scene from where we left off until it needs to listen or the call is over. */
function robotPlay(callSid: string, st: RobotState, lead = ""): string {
  const parts: string[] = lead ? [lead] : [];
  // WHAT THIS DOCUMENT IS ABOUT TO PLAY, line by line, so a key that arrives mid-list says which line
  // was playing. The phone company stops the audio dead on a key press and never says how far in
  // (owner 08-08). Only a menu needs this; a Staff scene leaves it empty and pays nothing for it.
  st.sentMs = Date.now(); st.sentParts = []; st.saidFrom = st.run.said.length;
  // Everything in ONE document plays in order, so a line after a 45 second wait is spoken 45 seconds
  // later than the document was built. The waits are added up as we go, or the record would claim
  // the person walked away and came back in the same instant.
  let ahead = 0;
  const atSec = () => Math.round((Date.now() - st.run.startedAt) / 1000) + ahead;
  for (;;) {
    const a = st.acts[st.act];
    if (!a) { parts.push("<Hangup/>"); break; }
    if ("hangup" in a) { st.act++; parts.push("<Hangup/>"); break; }
    // A PLACE IN THE SCENE, and a jump to one. Neither plays a sound; a jump is what sends a menu
    // branch back to the top of the options.
    if ("label" in a) {
      // A KEY PRESSED DURING THE GREETING ACTS THE MOMENT THE OPTIONS START (owner 08-08). The
      // greeting finishes reading, and then the held key takes us straight to its branch — the
      // options are never read at all, which is exactly the trap the knock's own keys walk into.
      if (st.held && st.holdLabel && a.label === st.holdLabel) {
        const k = st.held; st.held = null;
        const label = st.keys?.[k];
        (st.run.keys = st.run.keys || []).push({ key: k, atSec: atSec(), early: true, held: true, acted: label && label !== topLabel(st) ? label : "the options again" });
        st.act = labelAt(st, label || topLabel(st));
        continue;
      }
      st.act++; continue;
    }
    if ("goto" in a) { st.act = labelAt(st, a.goto); continue; }
    // A TALKING MENU waits its own three seconds, the window CVS Branford really gives; a keyed menu
    // waits the owner's six for a key; Staff wait the ten they always have.
    if ("listen" in a) {
      if (st.talks) st.askedAct = st.act;
      st.act++;
      parts.push(robotGather(callSid, st.talks ? TALK_WINDOW_SEC : menuOf(st) ? MENU_NO_PRESS_SEC : 10));
      break;
    }
    if ("silence" in a) { st.sentParts.push({ act: st.act, secs: a.silence }); st.act++; ahead += Math.round(a.silence); parts.push(`<Pause length="${Math.round(a.silence)}"/>`); continue; }
    // A COMMITTED RECORDING, PLAYED WHOLE. Its length is the measured one from ROBOT_CLIPS, because
    // the clock has to move by what the caller really hears: a line spoken after 15 seconds of hold
    // music files 15 seconds later, and reading it off the document build time would put every line
    // after a hold at the wrong second on the owner's sheet.
    if ("clip" in a) {
      const c = ROBOT_CLIPS[a.clip];
      st.sentParts.push({ act: st.act, secs: c.secs });
      st.act++; ahead += Math.round(c.secs);
      parts.push(`<Play>https://${HOST}/robot/hold?f=${encodeURIComponent(a.clip)}</Play>`);
      continue;
    }
    if ("ring" in a) { st.sentParts.push({ act: st.act, secs: a.ring }); st.act++; ahead += Math.round(a.ring); parts.push(`<Play>https://${HOST}/robot/ring?secs=${Math.round(a.ring)}</Play>`); continue; }
    if ("beep" in a) { st.sentParts.push({ act: st.act, secs: 0.33 }); st.act++; parts.push(`<Play>https://${HOST}/robot/beep</Play>`); continue; }
    st.run.said.push({ text: a.say, atSec: atSec(), voice: "sayAs" in a ? a.sayAs : "staff", act: st.act });
    st.sentParts.push({ act: st.act, secs: mp3Seconds(st.clips[st.act]) });
    parts.push(robotClipUrl(callSid, st.act));
    st.act++;
  }
  return twiml(parts.join(""));
}

/** The menu this call is playing, or null on a Staff scene — which is every scene that was here
 *  before the menu and every one that ignores keys. */
function menuOf(st: RobotState): MenuVariant | null { return st.menu ?? null; }
const topLabel = (st: RobotState) => st.keysElse || "options";

/** WHICH LINE WAS PLAYING when the key landed, off the lengths of the parts we handed out and the
 *  second the key came back. Also says whether the reading had finished — "before the options
 *  finish" is the whole of the swallowed-press menu. */
function actAtPress(st: RobotState): { act: number; early: boolean } {
  let left = (Date.now() - (st.sentMs ?? Date.now())) / 1000;
  for (const p of st.sentParts ?? []) {
    if (left < p.secs) return { act: p.act, early: true };
    left -= p.secs;
  }
  return { act: st.act, early: false };
}

/** The whole list again, from the top of the options. */
function menuTop(callSid: string, st: RobotState): string {
  st.held = null;
  st.loops = (st.loops ?? 0) + 1;
  if (st.loops > MENU_MAX_LOOPS) return twiml("<Hangup/>");
  st.act = labelAt(st, topLabel(st));
  return robotPlay(callSid, st);
}

/** A key the caller pressed at a MENU. Everything the owner's key table can say, turned into what
 *  the caller hears next. */
function menuKey(callSid: string, st: RobotState, key: string): string {
  const at = actAtPress(st);
  // WHAT THE CALLER REALLY HEARD. The whole rest of the menu goes to the phone company in one
  // document, and a key press stops it dead partway through — so every line from the cut onwards was
  // handed over and never played. They come off the record here, or the record claims the caller
  // heard options they were talking over (owner 08-08).
  const kept = st.run.said.slice(0, st.saidFrom ?? st.run.said.length)
    .concat(st.run.said.slice(st.saidFrom ?? st.run.said.length).filter((l) => (l.act ?? -1) < at.act));
  st.run.said = kept;
  const note = (acted: string) =>
    (st.run.keys = st.run.keys || []).push({ key, atSec: Math.round((Date.now() - st.run.startedAt) / 1000), early: at.early, held: false, acted });
  // DURING THE GREETING the key is REMEMBERED and acts the moment the options start, and the greeting
  // carries on from the sentence it was cut off in the middle of. Where the key LANDED says whether
  // the greeting was still playing — the phone company never tells us how far in a key arrived.
  if (st.holdLabel && at.act < labelAt(st, st.holdLabel)) {
    st.held = key;
    st.act = at.act;
    return robotPlay(callSid, st);
  }
  // A PRESS BEFORE THE OPTIONS FINISH, on the menu that swallows one: it does nothing at all and the
  // menu reads ON from the line it was cut off in the middle of, never from the top.
  if (st.swallowEarly && at.early) {
    note("swallowed, the menu read on");
    st.act = at.act;
    return robotPlay(callSid, st);
  }
  const label = st.keys?.[key];
  // A KEY THE OWNER'S TABLE DOES NOT LIST. His script has no words for one, so nothing is announced
  // and the options play again from the top.
  if (!label) { note("the options again"); return menuTop(callSid, st); }
  note(label === topLabel(st) ? "the options again" : label);
  st.act = labelAt(st, label);
  return robotPlay(callSid, st);
}

/** The caller pressed a key, said something, or said nothing. Either way the scene moves on the way
 *  it really did. */
export function robotStep(callSid: string, speech: string, digits?: string): string {
  const st = robotCalls.get(callSid);
  if (!st) return twiml("<Hangup/>");
  const isMenu = !!st.keys;
  const key = (digits || "").trim().slice(0, 1);
  // A KEY, at a scene that has a key table. Everything else ignores keys exactly as it always has.
  if (key && isMenu && !st.talks) { st.quiet = 0; return menuKey(callSid, st, key); }
  const said = (speech || "").trim();
  if (said) {
    st.run.heard.push(said.slice(0, 300));
    st.quiet = 0;
    // NOTHING LEFT TO SAY IS NOT SILENCE (owner, 08-17 late). If every line of this scene has been
    // spoken and somebody is still asking us things, the store answers the way a person would,
    // once, and then goes on waiting instead of leaving the caller on a dead line.
    const moreToSay = st.acts.slice(st.act).some((a) => "say" in a);
    if (!moreToSay && !st.saidAllIKnow) {
      st.saidAllIKnow = true;
      const who = [...st.run.said].reverse().find((l) => l.voice === "staff" || l.voice === "transfer")?.voice || "staff";
      st.run.said.push({ text: ROBOT_ALL_I_KNOW, atSec: Math.round((Date.now() - st.run.startedAt) / 1000), voice: who });
      return twiml(robotClipUrl(callSid, st.acts.length + (who === "transfer" ? 2 : 1)) + robotGather(callSid, 10));
    }
    return robotPlay(callSid, st);
  }
  // NOTHING PRESSED AT A MENU is the owner's six seconds: the whole list plays again from the top,
  // unless a key was held from the greeting, which acts the moment the options would have started.
  // A TALKING MENU GIVES UP AND ASKS AGAIN (owner 08-20). It does not start the whole menu over: it
  // says it did not understand and repeats the question the caller just missed, which is exactly what
  // CVS Branford did to us four calls in a row.
  if (st.talks) {
    st.quiet = 0;
    st.givenUp = (st.givenUp ?? 0) + 1;
    if (st.givenUp > MENU_MAX_LOOPS) return twiml("<Hangup/>");
    if (st.gaveUpLine) st.run.said.push({ text: st.gaveUpLine, atSec: Math.round((Date.now() - st.run.startedAt) / 1000), voice: "menu" });
    st.act = Math.max(0, (st.askedAct ?? 1) - 1);   // the question it just asked, then its listen again
    return robotPlay(callSid, st);
  }
  if (isMenu) { st.quiet = 0; return menuTop(callSid, st); }
  // NOBODY SAID ANYTHING, AND THE SCRIPT MUST NOT PAPER OVER IT (owner + PM, 08-08). The robot used
  // to play its next line anyway after two quiet listens, so a Charlie who had gone silent still got
  // "Yeah, we've got some in" and the scene looked like a conversation that never happened: the test
  // passed while the thing it tests was broken. A real person does not answer a question nobody
  // asked. So an ANSWER line only ever plays after Charlie actually spoke; into a silence the robot
  // waits, says "Hello?" once the way a real person checks the line, and then just waits. Advancing
  // through its own listens to the hangup at the end of a scene is still allowed, because waiting
  // out a caller who never says goodbye IS the wait-out, not an answer.
  st.quiet++;
  const next = st.acts[st.act];
  const answerNext = !!next && "say" in next;
  if (!answerNext) {
    // The rest of the scene is waiting and hanging up, which silence may honestly walk through.
    if (st.quiet < 2) return twiml(robotGather(callSid, 10));
    st.quiet = 0;
    return robotPlay(callSid, st);
  }
  if (st.quiet < 2) return twiml(robotGather(callSid, 10));
  if (!st.saidHello) {
    st.saidHello = true;
    st.run.said.push({ text: "Hello?", atSec: Math.round((Date.now() - st.run.startedAt) / 1000), voice: "staff" });
    return twiml(robotClipUrl(callSid, st.acts.length) + robotGather(callSid, 10));
  }
  return twiml(robotGather(callSid, 10));
}

/**
 * Test-only: stand a scene up with no synthesis and no database, so the whole walk can be driven
 * without a phone call and without spending a cent. The clips are deliberately absent — what is being
 * proved here is the ORDER and the WORDS (`run.said`), and the audio route is proved by a real call.
 */
export function _robotRig(scenario: number, greetingIndex = 0): { callSid: string; first: string; run: RobotRun } {
  const scene = robotScene(scenario) as RobotScene;
  const greeting = scene.greeting || ROBOT_GREETINGS[greetingIndex % ROBOT_GREETINGS.length];
  const acts: RobotAct[] = scene.neverAnswers ? [...scene.acts] : [{ say: greeting }, ...scene.acts];
  const callSid = `rig:${scenario}:${greetingIndex}:${robotRuns.length}`;
  const run: RobotRun = { id: callSid, callSid, scenario: scene.n, sceneName: scene.name, greeting, startedAt: Date.now(), said: [], heard: [] };
  const st: RobotState = { run, acts, act: 0, clips: acts.map(() => null), quiet: 0, saidHello: false };
  robotCalls.set(callSid, st);
  return { callSid, first: robotPlay(callSid, st, `<Pause length="1"/>`), run };
}

/** Test-only: stand a PHONE MENU up with no synthesis, no database and no phone, with the chosen
 *  Staff scene spliced in at the front of the store exactly as a real call does it. Every spoken line
 *  is given the same made-up length so a test can say exactly where a key landed; the audio route
 *  itself is proved by a real call, which is not the bench's job. */
export function _menuRig(variant: MenuVariant, opts: { scenario?: number; lineSecs?: number } = {}): { callSid: string; first: string; run: RobotRun } {
  const secs = opts.lineSecs ?? 3;
  const scene = robotScene(opts.scenario ?? 1) as RobotScene;
  const m = menuScene(variant);
  const acts: RobotAct[] = [...m.acts, ...(m.staffAt ? scene.acts : [])];
  const callSid = `rig:menu:${variant}:${robotRuns.length}:${robotCalls.size}`;
  const run: RobotRun = { id: callSid, callSid, scenario: scene.n, sceneName: m.name, greeting: "", startedAt: Date.now(), said: [], heard: [], menu: variant, keys: [] };
  robotRuns.unshift(run); while (robotRuns.length > 40) robotRuns.pop();
  const st: RobotState = { run, acts, act: 0, clips: acts.map(() => null), quiet: 0, saidHello: false,
    menu: variant, keys: m.keys, keysElse: m.keysElse, holdLabel: m.holdKeysUntil, swallowEarly: !!m.swallowEarlyKeys, held: null, loops: 0,
    talks: !!m.talksAndGivesUp, gaveUpLine: m.gaveUpLine };
  robotCalls.set(callSid, st);
  const first = robotPlay(callSid, st, `<Pause length="1"/>`);
  // Every line on the bench runs for the same made-up length, so a test can place a key exactly.
  st.sentParts = (st.sentParts || []).map((x) => ({ ...x, secs: "ring" in (acts[x.act] || {}) ? (acts[x.act] as { ring: number }).ring : secs }));
  return { callSid, first, run };
}
/** Test-only: pretend this many seconds of the document just handed out have already played. */
export function _menuElapsed(callSid: string, secs: number): void {
  const st = robotCalls.get(callSid); if (st) st.sentMs = Date.now() - secs * 1000;
}
/** Test-only: the same rebuild of the per-line lengths the rig does, after a fresh document. */
export function _menuFixLengths(callSid: string, lineSecs = 3): void {
  const st = robotCalls.get(callSid); if (!st) return;
  st.sentParts = (st.sentParts || []).map((x) => ({ ...x, secs: "ring" in (st.acts[x.act] || {}) ? (st.acts[x.act] as { ring: number }).ring : lineSecs }));
}
export function _menuRun(callSid: string): RobotRun | null { return robotCalls.get(callSid)?.run || robotRunFor(callSid); }

export function robotEnded(callSid: string): void {
  const st = robotCalls.get(callSid);
  if (!st) return;
  st.run.endedAt = Date.now();
  robotCalls.delete(callSid);
}

export function tapedeckEnded(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  if (s.status !== "done") s.status = s.steps.length > 1 ? "done" : "failed";
  if (s.mode === "bench") { // the rehearsal's receipt closes here; a store call is closed by the bridge
    markNow(`delta:${id}`, "endMs");
    emit(`delta:${id}`, "hangup", s.status === "done" ? "Rehearsal finished" : "Nobody picked up", { turns: s.turns });
    closeReceipt(`delta:${id}`, undefined, s.status);
  }
  // Twilio hung up before we reached a wrap clip (early hangup / no answer). Still record a verdict.
  finalizeIfStore(s);
  try { deltaRelayEnd?.(s); } catch { /* relay best-effort */ }
}

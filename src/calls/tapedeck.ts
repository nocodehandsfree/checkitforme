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
import { mp3Clip } from "./clip-cache";
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
  type: ["Gotcha, do you know if it's booster packs or a tin?", "And is it booster packs, or more like a box or a tin?"],
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

/** One beat of a scene. `say` is the Staff voice; `sayAs` is the SECOND person (after a transfer). */
export type RobotAct =
  | { say: string }
  | { sayAs: "transfer"; say: string }
  | { silence: number }   // seconds of nothing at all. No hold music: no real store ever played us any
  | { ring: number }      // seconds of a real ringback cadence, for the transfer
  | { beep: true }        // the tone at the end of a voicemail greeting, the thing that says "talk now"
  | { listen: true }      // wait for the caller to say their piece, then carry on
  | { hangup: true };

export interface RobotScene { n: number; name: string; greeting?: string; acts: RobotAct[]; expect: string;
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
    // THE OTHER HALF, because Charlie asks for it (owner 08-07). Section 58 of his instructions says
    // a day with no time gets one more question, so a scene that stops at the day leaves him asking
    // into silence and the check runs to a hang up with no goodbye. They answer the time now.
    { listen: true }, { say: "Uh, mornings usually. Before we open." },
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
  { n: 6, card: "hold_permanently", name: "Walks away, never comes back", expect: "no_clear_answer", acts: [
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
  { n: 10, card: "transfer_requested", name: "Wrong department, then transfers", greeting: "MVP's pharmacy, this is Larry.", expect: "not_in_stock", acts: [
    { listen: true },
    { say: "Okay. Transferring you now." },
    { ring: 6 },
    { sayAs: "transfer", say: "Sporting goods, this is Dana." },
    { listen: true },
    { sayAs: "transfer", say: "We did not." },
    { listen: true }, { sayAs: "transfer", say: "Thursdays, usually." },
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
    ...WAIT_OUT,
  ] },
  // ---- THE NINE CARDS THAT HAD NO SCENE AT ALL (spec: scenes-needed.md, owner approved 08-06) ----
  // Two of them are missing on purpose and are the owner's own next job: hold with music and a phone
  // set down on the counter both need a sound recording, and he is picking those clips himself.
  { n: 12, card: "hungup_ringing", name: "Nobody picks up", expect: "nobody_answered", neverAnswers: true, noGoodbye: true, acts: [
    // Ninety five seconds, so it runs past our own ninety second give-up rather than landing on it.
    { ring: 95 },
    { hangup: true },
  ] },
  // THE MOST EXPENSIVE TEST ON THE LIST, about four times a normal check. Somebody who genuinely is
  // talking, warmly, and never once answers the question. Every rule we have is working correctly
  // and the check still runs away with the margin, which is why the limit exists at all. The robot
  // waits for Charlie between each line, so this stretches past four minutes on its own.
  { n: 13, card: "hungup_limit", name: "Talks past the answer, forever", expect: "admin_hangup", noGoodbye: true, acts: [
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
    { hangup: true },
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
  { n: 16, card: "transfer_switch_off", name: "Wrong department, asking switched off", expect: "no_clear_answer",
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
];

export function robotScene(n: number): RobotScene | null { return ROBOT_SCENES.find((s) => s.n === n) || null; }

/** What the robot has actually said on a call, in order — the ground truth the harness compares the
 *  site's written transcript against. Word for word, because the script is known exactly. */
export interface RobotSaid { text: string; atSec: number; voice: "staff" | "transfer" }
export interface RobotRun {
  id: string; callSid: string; scenario: number; sceneName: string; greeting: string;
  startedAt: number; endedAt?: number; said: RobotSaid[]; heard: string[];
}
const robotRuns: RobotRun[] = [];
export function robotLastRun(): RobotRun | null { return robotRuns[0] || null; }
export function robotRunFor(callSid: string): RobotRun | null { return robotRuns.find((r) => r.callSid === callSid) || null; }

interface RobotState { run: RobotRun; acts: RobotAct[]; act: number; clips: (Buffer | null)[]; quiet: number }
const robotCalls = new Map<string, RobotState>();

/** Which scene the next inbound call plays, and (optionally) which greeting. Stored as "7" or "7:2"
 *  so a harness run can be repeated exactly instead of landing wherever the rotation happens to be. */
export function parseRobotPick(raw: string | null): { scenario: number; greeting: number | null } {
  const [a, b] = String(raw || "").split(":");
  const n = Number(a);
  const g = b === undefined || b === "" ? null : Number(b);
  return { scenario: Number.isFinite(n) && robotScene(n) ? n : 1, greeting: g != null && Number.isFinite(g) ? g : null };
}

/** The two voices. Staff is NOT Charlie: anyone listening back has to be able to tell who is who,
 *  and the person a transfer hands us to is a different person again. */
async function robotVoices(): Promise<{ staff: string; transfer: string }> {
  const [s, t] = await Promise.all([getSetting("robot_voice_staff"), getSetting("robot_voice_transfer")]);
  return { staff: (s || "pNInz6obpgDQGcFmaJgB").trim(), transfer: (t || "21m00Tcm4TlvDq8ikWAM").trim() };
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
const robotGather = (sid: string, secs: number) =>
  `<Gather input="speech" speechTimeout="auto" enhanced="true" speechModel="phone_call" timeout="${secs}" ` +
  `action="https://${HOST}/robot/step?call=${encodeURIComponent(sid)}" method="POST"/>` +
  `<Redirect method="POST">https://${HOST}/robot/step?call=${encodeURIComponent(sid)}&amp;silent=1</Redirect>`;

export function robotClip(callSid: string, i: number): Buffer | null { return robotCalls.get(callSid)?.clips[i] || null; }

/**
 * A call lands on the robot's number. Pick the scene, record every line it will need in the two
 * voices (cached, so this costs nothing after the first run), and start playing.
 */
export async function robotAnswer(callSid: string, from?: string): Promise<string> {
  if (!callSid) return twiml("<Hangup/>");
  const existing = robotCalls.get(callSid);
  if (existing) return robotPlay(callSid, existing); // Twilio refetched the same document: carry on, never restart
  const pick = parseRobotPick(await getSetting("robot_scenario"));
  const scene = robotScene(pick.scenario) as RobotScene;
  const greeting = scene.greeting
    || (pick.greeting != null ? ROBOT_GREETINGS[((pick.greeting % ROBOT_GREETINGS.length) + ROBOT_GREETINGS.length) % ROBOT_GREETINGS.length] : rotatePick("robot:greeting", ROBOT_GREETINGS))
    || ROBOT_GREETINGS[0];
  // NOBODY PICKS UP: no greeting, no voice, nothing but the line ringing (owner 08-06, scene 12).
  const acts: RobotAct[] = scene.neverAnswers ? [...scene.acts] : [{ say: greeting }, ...scene.acts];
  const { staff, transfer } = await robotVoices();
  const clips = await Promise.all(acts.map((a) => {
    if (!("say" in a)) return Promise.resolve(null);
    return mp3Clip("sayAs" in a ? transfer : staff, a.say, { stability: 0.45, similarity_boost: 0.8 });
  }));
  const missing = acts.findIndex((a, i) => "say" in a && !clips[i]);
  if (missing >= 0) { console.error("[robot] clip synthesis failed — check ElevenLabs credits"); return twiml("<Hangup/>"); }
  const run: RobotRun = {
    id: crypto.randomUUID().slice(0, 8), callSid, scenario: scene.n, sceneName: scene.name, greeting,
    startedAt: Date.now(), said: [], heard: [],
  };
  robotRuns.unshift(run); while (robotRuns.length > 40) robotRuns.pop();
  const st: RobotState = { run, acts, act: 0, clips, quiet: 0 };
  robotCalls.set(callSid, st);
  setTimeout(() => robotCalls.delete(callSid), 15 * 60 * 1000);
  console.log(`[robot] answering ${from || "?"} with scenario ${scene.n} (${scene.name}) · greeting "${greeting}"`);
  // A beat before speaking: a handset comes up, then the person talks.
  return robotPlay(callSid, st, `<Pause length="1"/>`);
}

/** Walk the scene from where we left off until it needs to listen or the call is over. */
function robotPlay(callSid: string, st: RobotState, lead = ""): string {
  const parts: string[] = lead ? [lead] : [];
  // Everything in ONE document plays in order, so a line after a 45 second wait is spoken 45 seconds
  // later than the document was built. The waits are added up as we go, or the record would claim
  // the person walked away and came back in the same instant.
  let ahead = 0;
  const atSec = () => Math.round((Date.now() - st.run.startedAt) / 1000) + ahead;
  for (;;) {
    const a = st.acts[st.act];
    if (!a) { parts.push("<Hangup/>"); break; }
    if ("hangup" in a) { st.act++; parts.push("<Hangup/>"); break; }
    if ("listen" in a) { st.act++; parts.push(robotGather(callSid, 10)); break; }
    if ("silence" in a) { st.act++; ahead += Math.round(a.silence); parts.push(`<Pause length="${Math.round(a.silence)}"/>`); continue; }
    if ("ring" in a) { st.act++; ahead += Math.round(a.ring); parts.push(`<Play>https://${HOST}/robot/ring?secs=${Math.round(a.ring)}</Play>`); continue; }
    if ("beep" in a) { st.act++; parts.push(`<Play>https://${HOST}/robot/beep</Play>`); continue; }
    st.run.said.push({ text: a.say, atSec: atSec(), voice: "sayAs" in a ? "transfer" : "staff" });
    parts.push(robotClipUrl(callSid, st.act));
    st.act++;
  }
  return twiml(parts.join(""));
}

/** The caller said something (or said nothing). Either way the scene moves on the way it really did. */
export function robotStep(callSid: string, speech: string): string {
  const st = robotCalls.get(callSid);
  if (!st) return twiml("<Hangup/>");
  const said = (speech || "").trim();
  if (said) { st.run.heard.push(said.slice(0, 300)); st.quiet = 0; return robotPlay(callSid, st); }
  // Nobody said anything. A real person waits a bit longer before carrying on, but not forever.
  st.quiet++;
  if (st.quiet < 2) return twiml(robotGather(callSid, 10));
  st.quiet = 0;
  return robotPlay(callSid, st);
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
  const st: RobotState = { run, acts, act: 0, clips: acts.map(() => null), quiet: 0 };
  robotCalls.set(callSid, st);
  return { callSid, first: robotPlay(callSid, st, `<Pause length="1"/>`), run };
}

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

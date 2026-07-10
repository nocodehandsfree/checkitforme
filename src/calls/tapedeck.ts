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
  workflow: string; // which workflow drove this call (shown in the log)
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
const gather = (id: string, timeoutSec = 8) =>
  `<Gather input="speech" speechTimeout="auto" enhanced="true" speechModel="phone_call" timeout="${timeoutSec}" ` +
  `action="https://${HOST}/tapedeck/step?session=${id}" method="POST"/>` +
  `<Redirect method="POST">https://${HOST}/tapedeck/step?session=${id}&amp;silent=1</Redirect>`;
const play = (id: string, i: number) => `<Play>https://${HOST}/tapedeck/clip?session=${id}&amp;i=${i}</Play>`;

// One variant per call, rotated across calls. Clip slots:
// 0 opener · 1 ask-SET · 2 ask-TYPE · 3 restock-day · 4 wrap (confirmed yes) · 5 clarify ·
// 6 escalate (Charlie) · 7 hello (silence nudge) · 8 wrapNo (neutral goodbye for no / unclear)
function pick<T>(arr: T[] | undefined, fb: T): T { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : fb; }

// Defaults used when a workflow hasn't defined its own follow-up scripts. No dashes (owner rule);
// commas carry the pauses. {category} is filled at synth time.
// Set question ALWAYS offers an example set name (owner, 07-10 call feedback): clerks often don't know
// what "set" means. The example is edit-per-workflow on the Workflows page when a brand needs its own.
const DEFAULT_FOLLOWUPS: Record<string, string[]> = {
  set: ["Oh nice! Is it Chaos Rising? Or do you know the name of the set?", "Awesome, any idea which set it is? Like Chaos Rising, or a different one?", "Oh sweet, do you know the name of the set? Like Chaos Rising?"],
  type: ["Gotcha, do you know if it's booster packs or a tin?", "No worries, is it like booster packs, or more like a box or a tin?"],
  no: ["Ah, no worries. Any idea what day you usually get card shipments in?", "Okay no problem, do you know when your next shipment usually lands?"],
  wrap: ["Awesome, thanks so much! Have a good one!", "Perfect, thank you so much, take care!"],
  clarify: ["Oh sorry, I was just asking if you have any {category} in stock right now?"],
  escalate: ["Oh, one sec,"],
  hello: ["Hello? Anyone there?"],
  // Neutral goodbye for a no / sold-out / unclear ending. NEVER the celebratory wrap — "Awesome!"
  // after "we don't have any" read as tone-deaf (owner 07-10 Delta test, call 97).
  wrapNo: ["Okay, no worries. Thanks so much, have a good one!"],
};

interface TdWorkflow { name: string; voiceId: string; voices: string[]; openers: string[]; tuning: Record<string, unknown>; followups: Record<string, string[]>; lane: string }

/** Resolve a workflow for the D-lane: by name if given, else the global default. Pulls voice, voice
 *  strip, openers, tuning, lane and (optional) follow-up scripts, same source the live lane uses. */
export async function resolveTapedeckWorkflow(name?: string): Promise<TdWorkflow> {
  const fb: TdWorkflow = { name: "default", voiceId: config.voice.defaultVoiceId, voices: [], openers: ["Heyy! I was just checking, do you have any {category} in stock right now?"], tuning: {}, followups: DEFAULT_FOLLOWUPS, lane: "charlie" };
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
    return {
      name: String(wf.name || "default"),
      voiceId: (typeof wf.voiceId === "string" && wf.voiceId) || voices[0] || config.voice.defaultVoiceId,
      voices, openers,
      tuning: (wf.tuning && typeof wf.tuning === "object") ? (wf.tuning as Record<string, unknown>) : {},
      followups: { set: slot("set"), type: slot("type"), no: slot("no"), wrap: slot("wrap"), clarify: slot("clarify"), escalate: slot("escalate"), hello: slot("hello"), wrapNo: slot("wrapNo") },
      lane: typeof wf.lane === "string" ? wf.lane : "charlie",
    };
  } catch { return fb; }
}

const fillCat = (t: string, cat: string) => t.replace(/\{category\}/g, cat).replace(/\bcards(\s+cards)+\b/gi, "cards");

/** Synthesize one clip in the given voice, honoring the workflow's tuning (mirrors the mapper). */
async function synthClip(voiceId: string, text: string, tuning: Record<string, unknown>): Promise<Buffer | null> {
  try {
    const voice_settings: Record<string, number> = {
      stability: typeof tuning.stability === "number" ? tuning.stability : 0.4,
      similarity_boost: typeof tuning.similarity_boost === "number" ? tuning.similarity_boost : (typeof tuning.similarity === "number" ? tuning.similarity : 0.85),
    };
    if (typeof tuning.style === "number") voice_settings.style = tuning.style;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2", voice_settings }),
    });
    if (!r.ok) { console.error("[tapedeck] synth", r.status, (await r.text()).slice(0, 100)); return null; }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { console.error("[tapedeck] synth", e); return null; }
}

/** Synthesize the 8 rotated clips for a call from a resolved workflow. */
async function synthClips(wf: TdWorkflow, voiceId: string, cat: string): Promise<{ texts: string[]; clips: (Buffer | null)[] }> {
  const texts = [
    fillCat(pick(wf.openers, "Heyy! I was just checking, do you have any {category} in stock right now?"), cat),
    fillCat(pick(wf.followups.set, DEFAULT_FOLLOWUPS.set[0]), cat),
    fillCat(pick(wf.followups.type, DEFAULT_FOLLOWUPS.type[0]), cat),
    fillCat(pick(wf.followups.no, DEFAULT_FOLLOWUPS.no[0]), cat),
    fillCat(pick(wf.followups.wrap, DEFAULT_FOLLOWUPS.wrap[0]), cat),
    fillCat(pick(wf.followups.clarify, DEFAULT_FOLLOWUPS.clarify[0]), cat),
    fillCat(pick(wf.followups.escalate, DEFAULT_FOLLOWUPS.escalate[0]), cat),
    fillCat(pick(wf.followups.hello, DEFAULT_FOLLOWUPS.hello[0]), cat),
    fillCat(pick(wf.followups.wrapNo, DEFAULT_FOLLOWUPS.wrapNo[0]), cat),
  ];
  const clips = await Promise.all(texts.map((t) => synthClip(voiceId, t, wf.tuning)));
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
  const voiceId = pick(wf.voices, wf.voiceId);
  const { texts, clips } = await synthClips(wf, voiceId, "Pokémon cards");
  if (clips.some((c) => !c)) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const session: TdSession = { id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts, stage: "opener", needType: false, workflow: wf.name, mode: "bench" };
  sessions.set(id, session);
  const r = await placeTwilioCall(session, to);
  if (r.error) { sessions.delete(id); return { error: r.error }; }
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
  const voiceId = pick(wf.voices, wf.voiceId);
  const { texts, clips } = await synthClips(wf, voiceId, check.categoryLabel);
  if (clips.some((c) => !c)) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const session: TdSession = {
    id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts,
    stage: "opener", needType: false, workflow: wf.name, mode: "store", check,
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
  // Don't open into dead air. Listen for the pickup ("hello?") before the opener plays — that's how a
  // real inbound greeting works. The opener fires on the first /step hit (handled in tapedeckStep).
  // SHORT first wait (3s, not 8): a silent pickup used to leave ~10s of dead air before the opener
  // (owner 07-10 calls 1/2/7: "took too long to say anything"). If nobody greets us within ~3s of the
  // answer, the redirect fires and the opener plays anyway.
  return twiml(`<Pause length="1"/>${gather(id, 3)}`);
}

/** Pure decision for one D-lane turn (no I/O, unit-tested). Given the stage + classified reply, returns
 *  which clip to play, the next stage, and any verdict/state changes. The off-script "question" (barge)
 *  case is handled by the caller before this runs. Slots: 1 set · 2 type · 3 restock-day · 4 wrap · 5 clarify. */
export interface DeltaDecision { clip: number; next: Stage; confirmed?: boolean | null; statusKey?: string; setClarified?: boolean; setNeedType?: boolean; note: string }
export function deltaDecide(o: { stage: Stage; label: string; gotSet: boolean; gotType: boolean; clarified: boolean; needType: boolean }): DeltaDecision {
  const { stage, label, gotSet, gotType } = o;
  if (stage === "opener") {
    if (label === "no" || label === "day") return { clip: 3, next: "askedDay", confirmed: false, statusKey: "not_in_stock", note: "out → ask the restock day" };
    if (label === "yes" || label === "product") {
      if (gotSet && gotType) return { clip: 4, next: "done", confirmed: true, statusKey: "in_stock", note: "named the set + type already → wrap" };
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
  if (s.turns > 8 || atSec > 150) return endCall(s, 4);
  if (speech && speech.trim()) pushStep(s, { who: "you", text: speech.trim().slice(0, 200), atSec });
  else { // silence — say "hello, anyone there?" once, then wrap (owner 07-10 call 6: never sit mute)
    if (s.turns >= 3 || s.nudged) return endCall(s, 4);
    s.nudged = true;
    pushStep(s, { who: "us", text: s.clipText[7], atSec, label: "silence → hello nudge" });
    return twiml(`${play(id, 7)}${gather(id)}`);
  }

  const t0 = Date.now();
  let label = "unclear", setName = "", typeName = "", dayName = "";
  try {
    const cat = s.check?.categoryLabel || "Pokémon cards";
    const out = await llm(CLASSIFY_MODEL, `You are on a phone call to a store checking if ${cat} are in stock. The clerk just replied: "${speech.trim().slice(0, 200)}"
Return ONLY JSON: {"label":"yes|no|day|product|question|unclear","set":"<set name they named, else empty>","type":"<packs|booster box|tin|etb|3-pack blister|singles, else empty>","day":"<shipment day/timing they named, else empty>"}
- yes: they have some in stock ("yeah we got a few", "we do")
- no: they don't / sold out
- day: they named a day or shipment timing
- product: they named a product type or set
- question: THEY asked something back ("who's this?", "for pickup?")
- unclear: genuinely can't tell / garbled
Staff describe products loosely, so map descriptions to the trade name: "three packs in one" / "a pack with three smaller packs inside" = "3-pack blister"; "the big box with packs" = "booster box"; "the little box with a promo" = "etb".`, { job: "tapedeck", json: true, temperature: 0, maxTokens: 60 });
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

  // Off-script / stuck at the opener → hand the SAME call to Charlie (store mode). Fail-safe: if the
  // handoff can't be set up, fall through to the escalate clip so the call still ends gracefully.
  if (label === "question" && s.stage === "opener") {
    if (s.mode === "store" && deltaBarge) {
      try {
        const handoff = await deltaBarge(s, speech.trim());
        if (handoff) {
          s.escalated = true; s.stage = "done";
          pushStep(s, { who: "us", text: "[Charlie takes over]", atSec: Math.round((Date.now() - s.startMs) / 1000), label: `off-script → Charlie barged in (${ms}ms classify)`, ms });
          return handoff;
        }
      } catch (e) { console.error("[delta] barge failed, falling back to escalate clip", e); }
    }
    pushStep(s, { who: "us", text: s.clipText[6], atSec: Math.round((Date.now() - s.startMs) / 1000), label: `off-script → escalate (no live handoff)`, ms });
    return endCall(s, 6);
  }

  // Decide the next clip + stage (pure, unit-tested). Then apply the verdict/state changes.
  const d = deltaDecide({ stage: s.stage, label, gotSet, gotType, clarified: !!s.clarified, needType: s.needType });
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

export function tapedeckEnded(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  if (s.status !== "done") s.status = s.steps.length > 1 ? "done" : "failed";
  // Twilio hung up before we reached a wrap clip (early hangup / no answer). Still record a verdict.
  finalizeIfStore(s);
  try { deltaRelayEnd?.(s); } catch { /* relay best-effort */ }
}

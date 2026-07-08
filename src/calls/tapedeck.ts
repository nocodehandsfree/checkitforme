// Tape deck — the D-lane. Twilio places the call; we handle it entirely with pre-synthesized clips
// in the workflow's voice + a cheap classifier (no live agent, ~2.5c/check). Workflow-driven: voice,
// voice rotation, opener rotation, follow-up rotation and voice tuning all come from the assigned
// workflow (falls back to the default). Set-first follow-up: on an in-stock yes we ask the SET, then
// the product type, skipping whatever the clerk already named. Off-script / stuck → the escalate
// slot: the point where Charlie takes over live (the transcript handoff is the next build).
import { llm } from "../llm";
import { config } from "../config";
import { getSetting } from "../db/settings";

const HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
const CLASSIFY_MODEL = "gemini-2.5-flash-lite";

type Stage = "opener" | "askedSet" | "askedType" | "askedDay" | "done";
interface TdStep { who: "us" | "you"; text: string; atSec: number; label?: string; ms?: number }
export interface TdSession {
  id: string; phone: string; startMs: number;
  status: "dialing" | "live" | "done" | "failed";
  steps: TdStep[]; turns: number;
  clips: Buffer[]; clipText: string[];
  callSid?: string;
  opened?: boolean; // has the opener clip played yet? (we wait to hear you pick up first)
  stage: Stage;     // where we are in the set-first script
  needType: boolean; // after asking the set, do we still owe the product-type question?
  clarified?: boolean; // used our one "sorry, I was asking..." already
  workflow: string; // which workflow drove this call (shown in the log)
}
const sessions = new Map<string, TdSession>();
export function tdSession(id: string): TdSession | null { return sessions.get(id) || null; }
export function tdClip(id: string, i: number): Buffer | null { return sessions.get(id)?.clips[i] || null; }

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const gather = (id: string) =>
  `<Gather input="speech" speechTimeout="auto" enhanced="true" speechModel="phone_call" timeout="8" ` +
  `action="https://${HOST}/tapedeck/step?session=${id}" method="POST"/>` +
  `<Redirect method="POST">https://${HOST}/tapedeck/step?session=${id}&amp;silent=1</Redirect>`;
const play = (id: string, i: number) => `<Play>https://${HOST}/tapedeck/clip?session=${id}&amp;i=${i}</Play>`;

// One variant per call, rotated across calls. Clip slots:
// 0 opener · 1 ask-SET · 2 ask-TYPE · 3 restock-day · 4 wrap · 5 clarify · 6 escalate (Charlie)
function pick<T>(arr: T[] | undefined, fb: T): T { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : fb; }

// Defaults used when a workflow hasn't defined its own follow-up scripts. No em-dashes (owner rule);
// commas carry the pauses. {category} is filled at synth time.
const DEFAULT_FOLLOWUPS: Record<string, string[]> = {
  set: ["Oh nice! Do you know which set it is?", "Awesome, any idea what set they are?", "Oh sweet, is it the newest set, or do you know which one?"],
  type: ["Gotcha, are those booster packs or tins?", "Cool, is that packs, or more like a box or a tin?"],
  no: ["Ah, no worries. Any idea what day you usually get card shipments in?", "Okay no problem, do you know when your next shipment usually lands?"],
  wrap: ["Awesome, thanks so much! Have a good one!", "Perfect, thank you so much, take care!"],
  clarify: ["Oh sorry, I was just asking if you have any {category} in stock right now?"],
  escalate: ["Oh, one sec,"],
};

interface TdWorkflow { name: string; voiceId: string; voices: string[]; openers: string[]; tuning: Record<string, unknown>; followups: Record<string, string[]> }

/** Resolve a workflow for the rehearsal: by name if given, else the global default. Pulls voice,
 *  voice strip, openers, tuning and (optional) follow-up scripts, same source the live lane uses. */
async function resolveTapedeckWorkflow(name?: string): Promise<TdWorkflow> {
  const fb: TdWorkflow = { name: "default", voiceId: config.voice.defaultVoiceId, voices: [], openers: ["Heyy! I was just checking, do you have any {category} in stock right now?"], tuning: {}, followups: DEFAULT_FOLLOWUPS };
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
      voices,
      openers,
      tuning: (wf.tuning && typeof wf.tuning === "object") ? (wf.tuning as Record<string, unknown>) : {},
      followups: { set: slot("set"), type: slot("type"), no: slot("no"), wrap: slot("wrap"), clarify: slot("clarify"), escalate: slot("escalate") },
    };
  } catch { return fb; }
}

const fillCat = (t: string) => t.replace(/\{category\}/g, "Pokémon cards").replace(/\bcards(\s+cards)+\b/gi, "cards");

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

/** Start a rehearsal call to the owner's phone on the D-lane. Clips synth first so playback is
 *  instant. `workflowName` picks which workflow drives it (voice/openers/follow-ups); default global. */
export async function tapedeckCall(phone: string, workflowName?: string): Promise<{ id?: string; error?: string }> {
  if (!config.callsEnabled) return { error: "calls disabled on this deploy" };
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const to = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,15}$/.test(to)) return { error: "enter a valid phone number" };
  // Debounce: one live rehearsal per number. A double-tap otherwise dials you twice and the two
  // calls talk over each other (owner-observed).
  for (const s of sessions.values()) {
    if (s.phone === to && (s.status === "dialing" || s.status === "live")) return { error: "a rehearsal call to this number is already live — hang up first" };
  }
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";

  const wf = await resolveTapedeckWorkflow(workflowName);
  const voiceId = pick(wf.voices, wf.voiceId); // rotate the voice strip per call
  // One rotated variant per slot, synthesized up front for instant playback.
  const texts = [
    fillCat(pick(wf.openers, "Heyy! I was just checking, do you have any {category} in stock right now?")),
    fillCat(pick(wf.followups.set, DEFAULT_FOLLOWUPS.set[0])),
    fillCat(pick(wf.followups.type, DEFAULT_FOLLOWUPS.type[0])),
    fillCat(pick(wf.followups.no, DEFAULT_FOLLOWUPS.no[0])),
    fillCat(pick(wf.followups.wrap, DEFAULT_FOLLOWUPS.wrap[0])),
    fillCat(pick(wf.followups.clarify, DEFAULT_FOLLOWUPS.clarify[0])),
    fillCat(pick(wf.followups.escalate, DEFAULT_FOLLOWUPS.escalate[0])),
  ];
  const clips = await Promise.all(texts.map((t) => synthClip(voiceId, t, wf.tuning)));
  if (clips.some((c) => !c)) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const session: TdSession = { id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts, stage: "opener", needType: false, workflow: wf.name };
  sessions.set(id, session);

  const body = new URLSearchParams({
    To: to.startsWith("+") ? to : "+1" + to, From: from,
    Url: `https://${HOST}/tapedeck/twiml?session=${id}`,
    StatusCallback: `https://${HOST}/tapedeck/ended?session=${id}`, StatusCallbackEvent: "completed",
  });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) { sessions.delete(id); return { error: `twilio ${r.status}: ${(await r.text()).slice(0, 120)}` }; }
  const d = (await r.json()) as { sid?: string };
  if (d.sid) session.callSid = d.sid;
  setTimeout(() => sessions.delete(id), 15 * 60 * 1000);
  return { id };
}

export function tapedeckTwiml(id: string): string {
  const s = sessions.get(id);
  if (!s) return twiml("<Hangup/>");
  s.status = "live";
  // Don't open into dead air. Listen for YOU to pick up (your "hello?") before the opener plays —
  // that's how a real inbound greeting works, and it gives you time to hit speaker first. The opener
  // fires on the first /step hit, whether you greeted or the listen timed out (handled in tapedeckStep).
  return twiml(`<Pause length="1"/>${gather(id)}`);
}

/** One turn: classify the reply with the cheap model, answer with the matching clip. Set-first flow:
 *  yes → ask the SET → then the product TYPE, skipping whatever they already named; no/day → ask the
 *  restock day; off-script question → escalate (Charlie barge point). */
export async function tapedeckStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml("<Hangup/>");
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  // First /step hit = you just picked up. NOW play the opener (never before you reach speaker).
  if (!s.opened) {
    s.opened = true;
    s.steps.push({ who: "us", text: s.clipText[0], atSec, label: `opener (${s.workflow}) — played after you picked up` });
    return twiml(`${play(id, 0)}${gather(id)}`);
  }
  s.turns++;
  if (s.turns > 8 || atSec > 150) { s.status = "done"; return twiml(`${play(id, 4)}<Hangup/>`); }
  if (speech && speech.trim()) s.steps.push({ who: "you", text: speech.trim().slice(0, 200), atSec });
  else { // silence — nudge once, then wrap
    if (s.turns >= 3) { s.status = "done"; return twiml(`${play(id, 4)}<Hangup/>`); }
    return twiml(gather(id));
  }

  const t0 = Date.now();
  let label = "unclear", gotSet = false, gotType = false;
  try {
    const out = await llm(CLASSIFY_MODEL, `You are on a phone call to a store checking if Pokémon cards are in stock. The clerk just replied: "${speech.trim().slice(0, 200)}"
Return ONLY JSON: {"label":"yes|no|day|product|question|unclear","set":"<pokemon set name they named, else empty>","type":"<packs|booster box|tin|etb|singles, else empty>"}
- yes: they have some in stock ("yeah we got a few", "we do")
- no: they don't / sold out
- day: they named a day or shipment timing
- product: they named a product type or set
- question: THEY asked something back ("who's this?", "for pickup?")
- unclear: genuinely can't tell / garbled`, { job: "tapedeck", json: true, temperature: 0, maxTokens: 50 });
    const j = JSON.parse(out) as { label?: string; set?: string; type?: string };
    label = String(j.label || "unclear");
    const clean = (v?: string) => !!(v && v.trim() && !/^(no|none|n\/?a|unsure|not sure|idk|unknown)$/i.test(v.trim()));
    gotSet = clean(j.set); gotType = clean(j.type);
  } catch { /* keep unclear */ }
  const ms = Date.now() - t0;

  // Decide the next clip + stage. Slots: 1 ask-SET · 2 ask-TYPE · 3 restock-day · 4 wrap · 5 clarify · 6 escalate.
  let clip = 4, note = "warm wrap", next: Stage = "done";
  if (label === "question") { clip = 6; note = "off-script → Charlie barge point (live handoff = next build)"; next = "done"; }
  else if (s.stage === "opener") {
    if (label === "no" || label === "day") { clip = 3; note = "out → ask the restock day"; next = "askedDay"; }
    else if (label === "yes" || label === "product") {
      if (gotSet && gotType) { clip = 4; note = "named the set + type already → wrap"; next = "done"; }
      else if (!gotSet) { s.needType = !gotType; clip = 1; note = "in stock → ask the SET first"; next = "askedSet"; }
      else { clip = 2; note = "had the set → ask packs/tin"; next = "askedType"; }
    } else if (!s.clarified) { s.clarified = true; clip = 5; note = "unclear → clarify once"; next = "opener"; }
    else { clip = 4; note = "still unclear → wrap"; next = "done"; }
  } else if (s.stage === "askedSet") {
    if (s.needType && label !== "unclear") { clip = 2; note = "got the set → ask packs/tin"; next = "askedType"; }
    else { clip = 4; note = "have what we need → wrap"; next = "done"; }
  } else { // askedType / askedDay → their answer settles it
    clip = 4; note = `answered our follow-up (${label}) → wrap`; next = "done";
  }
  s.stage = next;

  s.steps.push({ who: "us", text: s.clipText[clip], atSec: Math.round((Date.now() - s.startMs) / 1000), label: `classified "${label}"${gotSet ? " +set" : ""}${gotType ? " +type" : ""} in ${ms}ms → ${note}`, ms });
  const terminal = clip === 4 || clip === 6;
  if (terminal) { s.status = "done"; return twiml(`${play(id, clip)}${clip === 6 ? play(id, 4) : ""}<Hangup/>`); }
  return twiml(`${play(id, clip)}${gather(id)}`);
}

export function tapedeckEnded(id: string): void {
  const s = sessions.get(id);
  if (s && s.status !== "done") s.status = s.steps.length > 1 ? "done" : "failed";
}

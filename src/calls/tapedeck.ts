// Tape deck — the D-lane rehearsal. Calls YOUR phone and runs a standard check entirely on
// PRE-SYNTHESIZED clips in the default workflow's voice (Branson): opener plays the instant you
// pick up, your reply is classified by a cheap model, the matching follow-up clip plays, wrap.
// No live agent anywhere — this is the "recording + ears" lane the owner is auditioning for cost
// (~2.5¢/check) and naturalness. Bench-only: dials ONE provided number, never a store.
import { llm } from "../llm";
import { config } from "../config";
import { getSetting } from "../db/settings";

const HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
const CLASSIFY_MODEL = "gemini-2.5-flash-lite";

interface TdStep { who: "us" | "you"; text: string; atSec: number; label?: string; ms?: number }
export interface TdSession {
  id: string; phone: string; startMs: number;
  status: "dialing" | "live" | "done" | "failed";
  steps: TdStep[]; turns: number;
  clips: Buffer[]; clipText: string[];
  callSid?: string;
  opened?: boolean; // has the opener clip played yet? (we wait to hear you pick up first)
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

// Clip slots: 0 opener · 1 yes-follow · 2 no-follow · 3 wrap-thanks · 4 clarify · 5 escalate-bridge
const CLIP_SLOTS = (opener: string) => [
  opener,
  "Oh nice — is that like booster boxes, or just packs?",
  "Ah, no worries — do you know what day you usually get card shipments in?",
  "Awesome, thanks so much! Have a good one!",
  "Oh sorry — I was just asking if you have any Pokémon cards in stock right now?",
  "Oh — one sec —", // where Charlie would barge in; the rehearsal narrates it in the log
];

/** Synthesize one clip in the given ElevenLabs voice (mirrors the mapper's synthAsk). */
async function synthClip(voiceId: string, text: string): Promise<Buffer | null> {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2", voice_settings: { stability: 0.4, similarity_boost: 0.85 } }),
    });
    if (!r.ok) { console.error("[tapedeck] synth", r.status, (await r.text()).slice(0, 100)); return null; }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { console.error("[tapedeck] synth", e); return null; }
}

/** The default workflow's opener + voice (same source the mapper's ask uses). */
async function bransonOpener(): Promise<{ text: string; voiceId: string }> {
  const fallback = { text: "Heyy! I was just checking — do you have any Pokémon cards in stock right now?", voiceId: config.voice.defaultVoiceId };
  try {
    const [wfsRaw, defName] = await Promise.all([getSetting("vt_workflows"), getSetting("vt_default_workflow")]);
    const wfs = JSON.parse(wfsRaw || "[]") as Array<{ name?: string; voiceId?: string; openers?: unknown[] }>;
    const wf = wfs.find((w) => w && w.name === (defName || ""));
    if (!wf) return fallback;
    const opener = Array.isArray(wf.openers) && wf.openers.length ? String(wf.openers[0]) : "";
    return {
      text: (opener || fallback.text).replace(/\{category\}/g, "Pokémon cards").replace(/\bcards(\s+cards)+\b/gi, "cards"),
      voiceId: (wf.voiceId && String(wf.voiceId)) || config.voice.defaultVoiceId,
    };
  } catch { return fallback; }
}

/** Start a rehearsal call to the owner's phone. Clips synth first so playback is instant. */
export async function tapedeckCall(phone: string): Promise<{ id?: string; error?: string }> {
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

  const { text: openerText, voiceId } = await bransonOpener();
  const texts = CLIP_SLOTS(openerText);
  const clips = await Promise.all(texts.map((t) => synthClip(voiceId, t)));
  if (clips.some((c) => !c)) return { error: "clip synthesis failed — check ElevenLabs credits" };

  const id = crypto.randomUUID().slice(0, 8);
  const session: TdSession = { id, phone: to, startMs: Date.now(), status: "dialing", steps: [], turns: 0, clips: clips as Buffer[], clipText: texts };
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
  // Owner-observed: a fixed pre-opener pause still talked before the phone reached speaker.
  return twiml(`<Pause length="1"/>${gather(id)}`);
}

/** One turn: classify the reply with the cheap model, answer with the matching clip. */
export async function tapedeckStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml("<Hangup/>");
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  // First /step hit = you just picked up (said "hello", or the greeting listen timed out). NOW play
  // the opener — this is the "wait for the greeting" beat so it never talks before you reach speaker.
  // Doesn't count as a turn and isn't classified; it just launches the opener.
  if (!s.opened) {
    s.opened = true;
    s.steps.push({ who: "us", text: s.clipText[0], atSec, label: "opener — played after you picked up" });
    return twiml(`${play(id, 0)}${gather(id)}`);
  }
  s.turns++;
  if (s.turns > 8 || atSec > 150) { s.status = "done"; return twiml(`${play(id, 3)}<Hangup/>`); }
  if (speech && speech.trim()) s.steps.push({ who: "you", text: speech.trim().slice(0, 200), atSec });
  else { // silence — nudge once, then wrap
    if (s.turns >= 3) { s.status = "done"; return twiml(`${play(id, 3)}<Hangup/>`); }
    return twiml(gather(id));
  }

  const t0 = Date.now();
  let label = "unclear";
  try {
    const out = await llm(CLASSIFY_MODEL, `You are on a phone call to a store, checking if Pokémon cards are in stock. You just spoke; the clerk replied: "${speech.trim().slice(0, 200)}"
Classify the clerk's reply. Return ONLY JSON: {"label":"yes|no|day|product|question|unclear"}
- yes: they have some / affirmative ("yeah we got a few", "we do")
- no: they don't / negative / sold out
- day: they name a day or shipment timing
- product: they named a product TYPE or set ("booster box", "packs", "ETB", "just singles", "151")
- question: THEY asked something back ("who's this?", "for pickup?")
- unclear: genuinely can't tell / garbled`, { job: "tapedeck", json: true, temperature: 0, maxTokens: 30 });
    label = String((JSON.parse(out) as { label?: string }).label || "unclear");
  } catch { /* keep unclear */ }
  const ms = Date.now() - t0;

  // Multi-turn logic. Turn 1 = their answer to the opener. Turn 2+ = they're replying to OUR
  // follow-up, so a substantive answer means the check is DONE — wrap warmly, never re-ask.
  let clip = 3; let note = "warm wrap";
  if (label === "question") { clip = 5; note = "off-script question → Charlie joins here (real build: hand him the transcript so he continues WITH context, not a restart)"; }
  else if (s.turns === 1) {
    if (label === "yes") { clip = 1; note = "in stock → product follow-up"; }
    else if (label === "no" || label === "day") { clip = 2; note = label + " → shipment-day ask"; }
    else if (label === "product") { clip = 3; note = "named the product on turn 1 → got what we need, wrap"; }
    else { clip = 4; note = "unclear → clarify ONCE"; }
  } else {
    // turn 2+: product/day/yes/no all = a real answer to our follow-up → thank + wrap.
    clip = 3; note = `answered our follow-up (${label}) → wrap`;
  }
  s.steps.push({ who: "us", text: s.clipText[clip], atSec: Math.round((Date.now() - s.startMs) / 1000), label: `classified "${label}" in ${ms}ms → ${note}`, ms });
  if (clip === 3 || clip === 5) { s.status = "done"; return twiml(`${play(id, clip)}${clip === 5 ? play(id, 3) : ""}<Hangup/>`); }
  return twiml(`${play(id, clip)}${gather(id)}`);
}

export function tapedeckEnded(id: string): void {
  const s = sessions.get(id);
  if (s && s.status !== "done") s.status = s.steps.length > 1 ? "done" : "failed";
}

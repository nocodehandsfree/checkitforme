// Tree Trainer v2 — autonomous phone-tree navigator. Drives a real call through a store's phone
// menu using only Twilio's built-in speech-to-text (<Gather input=speech>), text-to-speech (<Say>)
// and keypad (<Play digits>) — the CHEAP lane — with a gateway LLM (src/llm.ts) deciding each step.
// It reaches a human, records the exact path + timing as a "recipe", then politely hangs up
// (training mode). ElevenLabs/Sonnet is never used here: this IS "everything cheap until human".
import { llm } from "../llm";

const RAILWAY_HOST = "voice-caller-production-2d6b.up.railway.app";
// Cheapest brain that drives the IVR. gemini-2.5-flash-lite today; flip to "groq:llama-3.1-8b-instant"
// (cheaper + faster, better for live phone latency) once GROQ_API_KEY is set in Railway.
export const NAV_MODEL = "gemini-2.5-flash-lite";

export type NavAction = "say" | "press" | "wait" | "human" | "fail";
export interface NavStep { who: "ivr" | "us"; text: string; atSec: number; action?: NavAction; value?: string }
export interface NavRecipe { type: string; steps: { action: string; value: string; atSec: number }[]; seconds: number }
export interface NavSession {
  id: string; chainId: number | null; retailerId: number; retailerName: string; phone: string;
  startMs: number; steps: NavStep[]; turns: number;
  status: "dialing" | "navigating" | "human" | "failed" | "done";
  type: "direct" | "keypad" | "voice" | null;
  humanAtSec: number | null; confidence: number; callSid?: string; recipe: NavRecipe | null;
}

const sessions = new Map<string, NavSession>();
export function getNavSession(id: string): NavSession | null { return sessions.get(id) || null; }

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
// Listen for the next thing the store says; if it goes quiet, fall through to /nav/step (silent).
const gather = (id: string) =>
  `<Gather input="speech" speechTimeout="auto" enhanced="true" speechModel="phone_call" timeout="10" ` +
  `action="https://${RAILWAY_HOST}/nav/step?session=${id}" method="POST"/>` +
  `<Redirect method="POST">https://${RAILWAY_HOST}/nav/step?session=${id}&amp;silent=1</Redirect>`;

interface Decision { action: NavAction; value: string; type: "direct" | "keypad" | "voice"; confidence: number; note: string }
async function decide(s: NavSession, latest: string): Promise<Decision> {
  const log = s.steps.map((st) => `[${st.atSec}s] ${st.who === "ivr" ? "STORE" : "US"}: ${st.text}`).join("\n");
  const prompt = `You are calling a retail store and navigating its phone system to reach a real HUMAN employee as fast as possible. You can only: SAY a short word, PRESS a digit, WAIT (listen more), or finish (HUMAN reached, or FAIL dead-end).

Conversation so far (STORE = what their phone system or a person said, US = what we did), seconds since the call started:
${log || "(call just connected, nothing heard yet)"}

Newest from the STORE: "${latest || "(silence)"}"

Decide the SINGLE next action toward a human:
- A real live PERSON is on the line (a human greeting like "thanks for calling, how can I help", NOT a recording/menu) -> "human".
- Voicemail / "no longer in service" / dead end -> "fail".
- Advance a menu by VOICE -> "say" with a short value: representative, associate, front, general, operator, no, yes.
- Advance by KEYPAD -> "press" with a single digit (0 is usually the operator).
- Recording still mid-sentence, keep listening -> "wait".
Pick the FASTEST route to a human and the SHORTEST word that works.
Classify how this store answers so far: "direct" (a person just answers), "keypad" (responds to key presses), or "voice" (only responds to spoken words).

Return ONLY JSON: {"action":"say|press|wait|human|fail","value":"<word or digit, empty if none>","type":"direct|keypad|voice","confidence":<0-100>,"note":"<8 words max>"}`;
  try {
    const txt = await llm(NAV_MODEL, prompt, { job: "nav-decide", json: true, temperature: 0, maxTokens: 120 });
    const j = JSON.parse(txt) as Partial<Decision>;
    const action = (["say", "press", "wait", "human", "fail"] as const).includes(j.action as NavAction) ? (j.action as NavAction) : "wait";
    const type = (["direct", "keypad", "voice"] as const).includes(j.type as Decision["type"]) ? (j.type as Decision["type"]) : "voice";
    return { action, value: String(j.value || "").slice(0, 40), type, confidence: Math.max(0, Math.min(100, Number(j.confidence) || 0)), note: String(j.note || "").slice(0, 60) };
  } catch { return { action: "wait", value: "", type: "voice", confidence: 0, note: "parse-fail" }; }
}

/** Initial TwiML when Twilio fetches the call's instructions. */
export function navInitialTwiml(id: string): string {
  const s = sessions.get(id); if (s) s.status = "navigating";
  return twiml(`<Pause length="1"/>${gather(id)}`); // let the greeting start, then listen
}

/** One navigation turn — Twilio posts what the store said; we decide and return the next TwiML. */
export async function navStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml(`<Hangup/>`);
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  s.turns++;
  if (s.turns > 14 || atSec > 100) { finish(s, "failed"); return twiml(`<Hangup/>`); } // safety stop
  if (speech && speech.trim()) s.steps.push({ who: "ivr", text: speech.trim().slice(0, 300), atSec });
  s.status = "navigating";
  const d = await decide(s, speech || "");
  if (d.type) s.type = d.type;
  s.confidence = d.confidence;
  if (d.action === "human") { s.humanAtSec = atSec; finish(s, "human"); return twiml(`<Say voice="Polly.Joanna">Sorry, I think I have the wrong number. Have a great day!</Say><Hangup/>`); }
  if (d.action === "fail") { finish(s, "failed"); return twiml(`<Hangup/>`); }
  if (d.action === "press" && d.value) {
    const digits = d.value.replace(/[^0-9*#]/g, "").slice(0, 6);
    s.steps.push({ who: "us", text: `pressed ${digits}`, atSec, action: "press", value: digits });
    return twiml(`<Play digits="${digits}"/>${gather(id)}`);
  }
  if (d.action === "say" && d.value) {
    s.steps.push({ who: "us", text: `said "${d.value}"`, atSec, action: "say", value: d.value });
    return twiml(`<Say voice="Polly.Joanna">${esc(d.value)}</Say>${gather(id)}`);
  }
  return twiml(gather(id)); // wait: keep listening
}

function finish(s: NavSession, status: "human" | "failed") {
  s.status = status;
  if (status === "human") {
    const acts = s.steps.filter((st) => st.who === "us").map((st) => ({ action: st.action || "say", value: st.value || "", atSec: st.atSec }));
    const type = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
    s.type = type;
    s.recipe = { type, steps: acts, seconds: s.humanAtSec ?? (s.steps[s.steps.length - 1]?.atSec ?? 0) };
  }
  setTimeout(() => sessions.delete(s.id), 5 * 60 * 1000); // let the admin read it, then drop
}

/** Place the documentation call; returns the session id the admin polls for live progress. */
export async function placeNavCall(chainId: number | null, retailerId: number, retailerName: string, phone: string): Promise<{ id?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const id = crypto.randomUUID().slice(0, 8);
  const session: NavSession = { id, chainId, retailerId, retailerName, phone, startMs: Date.now(), steps: [], turns: 0, status: "dialing", type: null, humanAtSec: null, confidence: 0, recipe: null };
  sessions.set(id, session);
  const body = new URLSearchParams({
    To: e164(phone), From: from,
    Url: `https://${RAILWAY_HOST}/nav/twiml?session=${id}`,
    StatusCallback: `https://${RAILWAY_HOST}/nav/ended?session=${id}`, StatusCallbackEvent: "completed",
  });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) { sessions.delete(id); return { error: `twilio ${r.status}: ${(await r.text()).slice(0, 120)}` }; }
  const d = (await r.json()) as { sid?: string };
  if (d.sid) session.callSid = d.sid;
  return { id };
}
export function navEnded(id: string) { const s = sessions.get(id); if (s && s.status !== "human" && s.status !== "failed") s.status = "done"; }

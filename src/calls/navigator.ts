// Tree Trainer v2 — autonomous phone-tree navigator. Drives a real call through a store's phone
// menu using only Twilio's built-in speech-to-text (<Gather input=speech>), text-to-speech (<Say>)
// and keypad (<Play digits>) — the CHEAP lane — with a gateway LLM (src/llm.ts) deciding each step.
// It reaches a human, records the exact path + timing as a "recipe", then politely hangs up
// (training mode). ElevenLabs/Sonnet is never used here: this IS "everything cheap until human".
import { llm } from "../llm";

const RAILWAY_HOST = "voice-caller-production-2d6b.up.railway.app";
// Cheapest + fastest brain that drives the IVR — Groq Llama 3.1 8B via Helicone (~200ms vs ~650ms
// for Gemini flash-lite, and cheaper per token). Verified routing live. Fall back to
// "gemini-2.5-flash-lite" by editing this line if Groq ever degrades.
export const NAV_MODEL = "gemini-2.5-flash-lite";

export type NavAction = "say" | "press" | "wait" | "human" | "fail";
export interface NavStep { who: "ivr" | "us"; text: string; atSec: number; action?: NavAction; value?: string }
export interface NavRecipe { type: string; steps: { action: string; value: string; atSec: number }[]; seconds: number }
export interface NavSession {
  id: string; chainId: number | null; retailerId: number; retailerName: string; phone: string;
  startMs: number; steps: NavStep[]; turns: number; model?: string; hint?: string;
  barge?: { plan: Array<{ action: string; value: string; at: number }> };
  reactivePress?: { digit: string; max: number; count: number };
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
  const hintBlock = s.hint
    ? `KNOWN FAST PATH for THIS exact store (learned on an earlier call): ${s.hint}\nFollow it: use these EXACT short single words at the matching prompt, answer the INSTANT the prompt makes sense (barge in — don't wait for it to finish), and NEVER improvise longer phrases. Only deviate if what you hear clearly doesn't match.\n\n`
    : "";
  const prompt = `You are calling a retail store and navigating its phone system to reach a real HUMAN employee as fast as possible. You can only: SAY a short word, PRESS a digit, WAIT (listen more), or finish (HUMAN reached, or FAIL dead-end).

WHO YOU ARE: a regular SHOPPER calling to ask if a product is in stock. You are NOT a patient, NOT a healthcare/medical/insurance provider, NOT a vendor. If a menu asks "are you a healthcare provider / calling from a doctor's office?", the answer is always NO (say "no" or press the option for no / "to continue"). At a pharmacy or any store with departments, ALWAYS head to the FRONT STORE / GENERAL store / sales floor — NEVER choose "pharmacy" (it dead-ends in patient/date-of-birth verification). Never give a date of birth, prescription number, or member ID — if a menu demands one, that branch is wrong; back out toward the general store / operator.

${hintBlock}Conversation so far (STORE = what their phone system or a person said, US = what we did), seconds since the call started:
${log || "(call just connected, nothing heard yet)"}

Newest from the STORE: "${latest || "(silence)"}"

Decide the SINGLE next action toward a human:
- HAND OFF to a human ("human"): the INSTANT a live person is talking with you — a casual store greeting said naturally TO you ("[store name], how can I help?", "this is Mike, what can I do for ya?", "GameStop, what do you need?"). A store name + casual tone + a real question = a person. The moment it feels like a person and not a recording, answer "human" — do NOT keep firing menu words at them.
- TRANSFER REACHED ("human"): if the system says it is connecting/transferring you to a person ("please hold while I connect you", "transferring you now", "let me get someone for you", "connecting you to the store") — the path is CONFIRMED. Answer "human" NOW; we hang up before troubling a real employee.
- Voicemail / "no longer in service" / dead end -> "fail".
- Advance a menu by VOICE -> "say" with a short value. For a normal menu, the option word (front, general, operator, representative, associate, no, yes).
- OPEN-ENDED from an AUTOMATED system (a clearly robotic / "virtual assistant" voice, or it keeps repeating "I didn't get that, briefly describe why you're calling")? Do NOT answer "yes"/"no" — that loops forever. "Say" a short ROUTING phrase: "talk to a store associate" (under 5 words). But if that same open question is asked by a real-sounding person, that's "human" above, not routing.
- Advance by KEYPAD -> "press" with a single digit (0 is usually the operator).
- Recording still mid-sentence, keep listening -> "wait". Use this SPARINGLY — only when a recording is literally still talking. Never "wait" just because you're unsure; pick an action that moves toward a human.
BE DECISIVE — you are HANDS-FREE, no human is helping you. Every turn must move toward a person:
- If a conversational "virtual assistant" DEFLECTS you (sends you to a website, "find a store", a self-service loop, "I didn't get that"), STOP talking to it — PRESS 0 (the operator). 0 is the universal "get me a human" shortcut.
- PERSIST: if pressing 0 (or your last action) doesn't visibly advance after the next prompt, PRESS 0 AGAIN. Keep pressing 0 once per prompt until a person or a transfer ("connecting you…") happens. Many systems only route to the operator after several 0s.
- If the SAME tactic fails twice (a spoken word gets ignored or loops), SWITCH: try pressing 0, or press the menu digit for "anything else"/operator. Never repeat a failing move a third time, and never go silent.
- At a pharmacy/store with departments, never pick "pharmacy" — head to the front/general/operator.
Pick the FASTEST route to a human and the SHORTEST word that works (e.g. "front" not "front store services", "general" not "general store inquiries"). Act as EARLY as the menu allows — you do NOT have to wait for a prompt to finish; press/say as soon as you know the option (barge in).
Classify how this store answers so far: "direct" (a person just answers), "keypad" (responds to key presses), or "voice" (only responds to spoken words).

Return ONLY JSON: {"action":"say|press|wait|human|fail","value":"<word or digit, empty if none>","type":"direct|keypad|voice","confidence":<0-100>,"note":"<8 words max>"}`;
  try {
    const txt = await llm(s.model || NAV_MODEL, prompt, { job: "nav-decide", json: true, temperature: 0, maxTokens: 120 });
    const j = JSON.parse(txt) as Partial<Decision>;
    const action = (["say", "press", "wait", "human", "fail"] as const).includes(j.action as NavAction) ? (j.action as NavAction) : "wait";
    const type = (["direct", "keypad", "voice"] as const).includes(j.type as Decision["type"]) ? (j.type as Decision["type"]) : "voice";
    return { action, value: String(j.value || "").slice(0, 40), type, confidence: Math.max(0, Math.min(100, Number(j.confidence) || 0)), note: String(j.note || "").slice(0, 60) };
  } catch { return { action: "wait", value: "", type: "voice", confidence: 0, note: "parse-fail" }; }
}

/** Initial TwiML when Twilio fetches the call's instructions. */
export function navInitialTwiml(id: string): string {
  const s = sessions.get(id); if (s) s.status = "navigating";
  // BARGE mode: we already KNOW the path, so fire the words on a timer — speaking OVER the IVR instead
  // of waiting for each prompt to finish. `at` = seconds from connect to speak each step. Then listen
  // for the transfer. Each round we shave the times earlier until the store stops accepting it.
  if (s && s.barge?.plan?.length) {
    let inner = ""; let prev = 0;
    for (const st of s.barge.plan) {
      const wait = Math.max(0, Math.round((st.at ?? 0) - prev));
      if (wait > 0) inner += `<Pause length="${wait}"/>`;
      if (st.action === "press" && st.value) {
        const digits = st.value.replace(/[^0-9*#]/g, "").slice(0, 6);
        inner += `<Play digits="${digits}"/>`;
        s.steps.push({ who: "us", text: `pressed ${digits} (barge @${st.at}s)`, atSec: Math.round(st.at), action: "press", value: digits });
      } else if (st.value) {
        inner += `<Say voice="Polly.Joanna">${esc(st.value)}</Say>`;
        s.steps.push({ who: "us", text: `said "${st.value}" (barge @${st.at}s)`, atSec: Math.round(st.at), action: "say", value: st.value });
      }
      prev = st.at ?? prev;
    }
    s.type = s.barge.plan.every((p) => p.action === "press") ? "keypad" : "voice";
    return twiml(`${inner}${gather(id)}`);
  }
  return twiml(`<Pause length="1"/>${gather(id)}`); // let the greeting start, then listen
}

/** One navigation turn — Twilio posts what the store said; we decide and return the next TwiML. */
export async function navStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml(`<Hangup/>`);
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  s.turns++;
  if (s.turns > 22 || atSec > 165) { finish(s, "failed"); return twiml(`<Hangup/>`); } // safety stop (slow IVRs like Walgreens take ~95s to a human)
  if (speech && speech.trim()) s.steps.push({ who: "ivr", text: speech.trim().slice(0, 300), atSec });
  s.status = "navigating";
  // REACTIVE PRESS: the human way — wait until we HEAR a prompt, then press the digit; repeat for the
  // first `max` prompts (e.g. 0 after Spanish, 0 after the next, 0 after the next), then listen for the
  // person. Synced to the actual prompts, so ring-time/store differences don't throw the timing off.
  if (s.reactivePress && s.reactivePress.count < s.reactivePress.max) {
    if (speech && speech.trim()) {
      const dg = s.reactivePress.digit; s.reactivePress.count++; s.type = "keypad";
      s.steps.push({ who: "us", text: `pressed ${dg} (after prompt ${s.reactivePress.count})`, atSec, action: "press", value: dg });
      return twiml(`<Play digits="${dg}"/>${gather(id)}`);
    }
    return twiml(gather(id)); // silence so far — keep listening for the prompt
  }
  const d = await decide(s, speech || "");
  if (d.type) s.type = d.type;
  s.confidence = d.confidence;
  if (d.action === "human") { s.humanAtSec = atSec; finish(s, "human"); return twiml(`<Hangup/>`); } // stop at the transfer/human — hang up WITHOUT engaging a real employee
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
export async function placeNavCall(chainId: number | null, retailerId: number, retailerName: string, phone: string, model?: string, hint?: string, barge?: { plan: Array<{ action: string; value: string; at: number }> }, reactivePress?: { digit: string; max: number }): Promise<{ id?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const id = crypto.randomUUID().slice(0, 8);
  const session: NavSession = { id, chainId, retailerId, retailerName, phone, startMs: Date.now(), steps: [], turns: 0, status: "dialing", type: null, humanAtSec: null, confidence: 0, recipe: null, model, hint, barge, reactivePress: reactivePress ? { ...reactivePress, count: 0 } : undefined };
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

// Tree Trainer v2 — autonomous phone-tree navigator. Drives a real call through a store's phone
// menu using only Twilio's built-in speech-to-text (<Gather input=speech>), text-to-speech (<Say>)
// and keypad (<Play digits>) — the CHEAP lane — with a gateway LLM (src/llm.ts) deciding each step.
// It reaches a human, records the exact path + timing as a "recipe", then politely hangs up
// (training mode). ElevenLabs/Sonnet is never used here: this IS "everything cheap until human".
import { llm } from "../llm";
import { config } from "../config";
import { getSetting, setSetting } from "../db/settings";
import { db } from "../db/client";
import { chains } from "../db/schema";
import { eq } from "drizzle-orm";

// Twilio webhooks must come back to THIS service — staging maps from staging, prod from prod.
const RAILWAY_HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
// MAPPING model — drives tree DISCOVERY only (the learner). Cost is irrelevant here (map once); at
// SCALE live calls replay the LOCKED keypad recipe (deterministic DTMF, no model). We WANT a smarter
// model for mapping accuracy, but gemini-2.5-flash was returning 503s (overloaded) and stalling the
// nav, and gemini-2.5-pro/2.0-flash were rate-limited — only flash-lite is reliably up. So default to
// the reliable flash-lite and pass a smarter model per-run when one is healthy. TODO: wire a reliable
// smart mapper (Groq llama-3.3-70b or gpt-4o-mini via the gateway) as the default once verified.
export const NAV_MODEL = "gemini-2.5-flash-lite";

// A live person is on the line (a short greeting/question said TO us). Used as a backstop in auto-0
// mode so we hang up the instant someone answers instead of beeping 0 at them.
const HUMAN_RE = /can i help you|how (can|may) i help|what can i (do|help)|this is \w+|thanks for (holding|waiting)|you'?re (through|connected)|go ahead|^\s*hello[\s.!?]*$/i;
// A live PICKUP: after we've already navigated a step, a short utterance that's clearly a person —
// a greeting ("hello", "hi"), a self-ID ("this is…", "…speaking"), or a bare department answer
// ("Target electronics", "guest service desk") — with NO "press N" menu. This is the signal we were
// MISSING: a Target dept employee answers "Hello / Target electronics", which isn't a menu, so we must
// stop pressing and treat them as the human (confirm mode then asks the stock question).
const LIVE_HUMAN_RE = /\bhello\b|\bhi\b|\bhowdy\b|\byello\b|this is \w+|\bspeak(s|ing)?\b|how (can|may) i help|can i help|i can help|go ahead|what (can|do) (i|we|you)|^\s*(thanks for calling )?(target )?(electronics|guest services?|service desk|customer service|toys?|sporting goods?)[\s.,!?]*$/i;
function looksLikeLivePerson(speech: string): boolean {
  const t = (speech || "").trim();
  if (!t) return false;
  if (/press \d|para español|in english|main menu|enter your|spell the|press the/i.test(t)) return false; // still an IVR menu
  if (t.split(/\s+/).length > 14) return false; // long utterance = recording, not a live greeting
  return LIVE_HUMAN_RE.test(t);
}
// The system just routed us to a person (hold/transfer/"find someone") — after this, a greeting = human.
const ROUTING_RE = /transferr?ing|connect(ing)? you|please hold|hold (on )?(while|and)|find (someone|somebody)|be with you|getting someone|let me get|one moment/i;
// CONFIRM mode — the human we reached is sending us somewhere ELSE (wrong desk). We capture where and
// hang up: "that's the electronics department", "let me transfer you", "you'd have to ask the front",
// "I'll connect you", "that would be guest services". Anything else = they answered us = right place.
const REDIRECT_RE = /transfer|connect(ing)? you|that('?s| is| would be) the |you('?d| would| will)? ?(have to|need to|want to|gotta)? ?(ask|call|talk to|check with|go to)|over to|let me get you|i'?ll get you|hold on|the .{0,18}(department|desk|counter|section)|guest services|customer service desk|electronics|toy|that'?s (handled|done) by/i;

export type NavAction = "say" | "press" | "wait" | "human" | "fail";
export interface NavStep { who: "ivr" | "us"; text: string; atSec: number; action?: NavAction; value?: string }
export interface NavRecipe { type: string; steps: { action: string; value: string; atSec: number }[]; seconds: number }
export interface NavSession {
  id: string; chainId: number | null; retailerId: number; retailerName: string; phone: string;
  startMs: number; steps: NavStep[]; turns: number; model?: string; hint?: string;
  barge?: { plan: Array<{ action: string; value: string; at: number }> };
  reactivePress?: { digit: string; max: number; count: number };
  // CONFIRM mode: instead of hanging up at the human, ASK "do you have any {product} in stock?" to
  // verify we reached the RIGHT desk (where the cards live). Their reply classifies the run:
  //  • answered (yes/no/"we're out") → right place, lock this path.
  //  • redirect ("that's the X dept, let me transfer you") → wrong desk; capture where + hang up.
  confirm?: { product: string; asked?: boolean; askedAtSec?: number };
  confirmResult?: "answered" | "redirect"; redirectTo?: string;
  // LISTEN-FIRST (mapping stage 1): hear the menu out before acting; flips off once a prompt repeats.
  listenFirst?: boolean; heard?: string[];
  // Confirm ask pre-synthesized in the workflow's ElevenLabs voice (Branson) — Polly is the fallback.
  askAudio?: Buffer; askText?: string;
  lastActTurn?: number; escaped?: boolean; routingSeen?: boolean; autoZeros?: number; persisted?: boolean;
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

/** We've reached a live person. Plain training mode → hang up before troubling them. CONFIRM mode →
 *  ask the one stock question ONCE, then listen for their reply (classified next turn). */
function reachHuman(s: NavSession, atSec: number, id: string): string {
  s.humanAtSec = atSec;
  if (s.confirm && !s.confirm.asked) {
    s.confirm.asked = true; s.confirm.askedAtSec = atSec;
    const q = s.askText || `Hi! Real quick — do you have any ${s.confirm.product} in stock right now?`;
    s.steps.push({ who: "us", text: `asked: "${q}"`, atSec, action: "say", value: q });
    // Speak in the workflow's own voice when the synth is ready; otherwise the stock phone voice.
    const speak = s.askAudio ? `<Play>https://${RAILWAY_HOST}/nav/ask-audio?session=${id}</Play>` : `<Say voice="Polly.Joanna">${esc(q)}</Say>`;
    return twiml(`${speak}${gather(id)}`); // wait for their answer
  }
  finish(s, "human"); return twiml(`<Hangup/>`);
}

/** Serve the pre-synthesized confirm-ask mp3 (Twilio <Play> fetches this mid-call). */
export function navAskAudio(id: string): Buffer | null { return sessions.get(id)?.askAudio || null; }

/** Pre-synthesize the confirm ask in an ElevenLabs voice so the HUMAN hears Branson, not a robot.
 *  Best-effort: on any failure the session keeps askAudio unset and reachHuman falls back to Polly. */
async function synthAsk(s: NavSession, voiceId: string, text: string): Promise<void> {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2", voice_settings: { stability: 0.4, similarity_boost: 0.85 } }),
    });
    if (r.ok) s.askAudio = Buffer.from(await r.arrayBuffer());
    else console.error("[navigator] synthAsk", r.status, (await r.text()).slice(0, 120));
  } catch (e) { console.error("[navigator] synthAsk", e); }
}

/** The ask used at every mapping human: the DEFAULT workflow's first opener in ITS voice (Branson
 *  global), {category} → "Pokémon cards". Falls back to the stock question + the default voice. */
export async function defaultWorkflowAsk(): Promise<{ text: string; voiceId: string }> {
  const fallback = { text: "Hi! Real quick — do you have any Pokémon cards in stock right now?", voiceId: config.voice.defaultVoiceId };
  try {
    const [wfsRaw, defName] = await Promise.all([getSetting("vt_workflows"), getSetting("vt_default_workflow")]);
    const wfs = JSON.parse(wfsRaw || "[]") as Array<{ name?: string; voiceId?: string; openers?: unknown[] }>;
    const wf = wfs.find((w) => w && w.name === (defName || "")) || null;
    if (!wf) return fallback;
    const opener = Array.isArray(wf.openers) && wf.openers.length ? String(wf.openers[0]) : "";
    return {
      text: (opener || fallback.text).replace(/\{category\}/g, "Pokémon cards"),
      voiceId: (wf.voiceId && String(wf.voiceId)) || config.voice.defaultVoiceId,
    };
  } catch { return fallback; }
}

/** One navigation turn — Twilio posts what the store said; we decide and return the next TwiML. */
export async function navStep(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml(`<Hangup/>`);
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  s.turns++;
  if (s.turns > 22 || atSec > 165) { finish(s, "failed"); return twiml(`<Hangup/>`); } // safety stop (slow IVRs like Walgreens take ~95s to a human)
  if (speech && speech.trim()) s.steps.push({ who: "ivr", text: speech.trim().slice(0, 300), atSec });
  if (speech && ROUTING_RE.test(speech)) s.routingSeen = true; // routed to a person → next greeting is human
  // CONFIRM mode: we already asked "do you have {product}?" — this turn is their answer. Classify it.
  // A redirect ("that's the X dept / let me transfer you") = wrong desk → capture where + hang up.
  // Anything else (a real reply, yes/no/"we're out") = right desk → lock this path. Silence after a
  // beat = we still reached a human, so count it as a confirmed reach rather than loop forever.
  if (s.confirm?.asked && !s.confirmResult) {
    if (speech && speech.trim()) {
      if (REDIRECT_RE.test(speech)) { s.confirmResult = "redirect"; s.redirectTo = speech.trim().slice(0, 200); }
      else s.confirmResult = "answered";
      finish(s, "human"); return twiml(`<Hangup/>`);
    }
    if (atSec - (s.confirm.askedAtSec ?? atSec) > 9) { s.confirmResult = "answered"; finish(s, "human"); return twiml(`<Hangup/>`); }
    return twiml(gather(id)); // brief silence — give them a moment to answer
  }
  // LIVE PICKUP — fire on the FIRST human utterance, in EVERY mode. A direct store answers "Hello" /
  // "Store, Bob speak" with no IVR, so we must reach the human on turn 1 — waiting for a 2nd line (or
  // an LLM round-trip) leaves dead air while they keep saying "hello" until we hang up. looksLikeLivePerson
  // already excludes "press N" menus + long recordings, so it won't trip on an opening IVR. Map mode →
  // hang up instantly; confirm mode → ask the one stock question.
  if (speech && looksLikeLivePerson(speech)) return reachHuman(s, atSec, id);
  // FAST-FAIL only on TRUE dead-ends: an actual voicemail box, or the STORE itself closed.
  // NEVER on "pharmacy is closed" — the front store is open and is exactly where we're going
  // (pharmacy can't sell Pokémon cards anyway). Live-observed funnel: "connect you to our
  // voicemail… leave a message with your name and date of birth" = mailbox, bail instantly.
  const DEADEND_RE = /connect(ing)? you to (our|the) voicemail|leave (a |your )?(message|voicemail) (at|after|with)|voicemail box|record (a |your )?message after|providing your name,? (and )?date of birth|(store|we) (is|are) (currently |now )?closed(?![^.]*pharmacy)|closed for the (day|night)|our store hours are/i;
  const PHARM_OK = /pharmacy .{0,30}(closed|hours)/i; // pharmacy-only closure — keep navigating to the front store
  if (speech && DEADEND_RE.test(speech) && !PHARM_OK.test(speech)) { finish(s, "failed"); return twiml(`<Hangup/>`); }
  s.status = "navigating";
  // LISTEN-FIRST (mapping call 1): hear the menu out before acting — capture every prompt; the moment
  // a prompt REPEATS (the menu looped, we've heard it all), or after 4 prompts / 50s, flip to acting
  // mode and navigate on this SAME call. A live person still short-circuits above, so a direct-answer
  // store never sits in silence.
  if (s.listenFirst) {
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 80);
    if (speech && speech.trim()) {
      s.heard = s.heard || [];
      const n = norm(speech);
      const repeated = !!n && s.heard.some((h) => h === n || (n.length > 25 && h.startsWith(n.slice(0, 25))));
      s.heard.push(n);
      if (repeated || s.heard.length >= 4 || atSec > 50) s.listenFirst = false; // heard enough → act NOW (fall through to decide)
      else return twiml(gather(id)); // keep listening
    } else if (atSec > 50) s.listenFirst = false;
    else return twiml(gather(id));
  }
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
  // MECHANICAL RECOVERY after a timed plan: if the menu is still prompting and the prompt NAMES one of
  // our known-path words ("…pharmacy or FRONT door services?", "…GENERAL store inquiries…"), say that
  // word immediately — no model in the loop. The LLM goes passive after a barge plan (live-observed:
  // three re-prompts, zero replies), but the proven words always route to the front store.
  if (s.barge?.plan?.length && speech && speech.trim()) {
    const saidAlready = new Set(s.steps.filter((st) => st.who === "us" && st.action === "say" && (st.atSec ?? 0) >= atSec - 1).map((st) => st.value));
    const low = " " + speech.toLowerCase() + " ";
    const next = s.barge.plan.find((p) => p.action !== "press" && p.value && low.includes(" " + p.value.toLowerCase()) && !saidAlready.has(p.value));
    if (next) {
      s.steps.push({ who: "us", text: `said "${next.value}" (recovery — prompt named it)`, atSec, action: "say", value: next.value });
      s.lastActTurn = s.turns;
      return twiml(`<Say voice="Polly.Joanna">${esc(next.value)}</Say>${gather(id)}`);
    }
  }
  const d = await decide(s, speech || "");
  if (d.type) s.type = d.type;
  s.confidence = d.confidence;
  if (d.action === "human") return reachHuman(s, atSec, id); // reached a person → confirm (or hang up)
  if (d.action === "press" && d.value) {
    const digits = d.value.replace(/[^0-9*#]/g, "").slice(0, 6);
    s.steps.push({ who: "us", text: `pressed ${digits}`, atSec, action: "press", value: digits });
    s.lastActTurn = s.turns;
    return twiml(`<Play digits="${digits}"/>${gather(id)}`);
  }
  if (d.action === "say" && d.value) {
    s.steps.push({ who: "us", text: `said "${d.value}"`, atSec, action: "say", value: d.value });
    s.lastActTurn = s.turns;
    return twiml(`<Say voice="Polly.Joanna">${esc(d.value)}</Say>${gather(id)}`);
  }
  // AUTO-ESCAPE (hands-free): the model stalled on a deflecting system — stop trusting it and press 0
  // for the operator until a human answers. GATED HARD: 0 is the universal operator shortcut on most
  // systems, but on CVS it routes into the PHARMACY queue (voicemail at night) — so never hammer 0
  // while a long intro is still playing (≥3 stalled turns AND ≥4 total), and never during a barge
  // replay (the plan IS the strategy; if it misses, fail honestly so the mapper learns).
  const stalled = s.turns - (s.lastActTurn ?? 0);
  if (!s.barge && (s.escaped || (stalled >= 3 && s.turns >= 4))) {
    s.escaped = true;
    if (speech && speech.trim()) {
      // STOP the instant a person answers — a clear live greeting/self-ID means a human picked up, so
      // reach them (never beep 0 at a person). The weaker HUMAN_RE still needs the routed/2-zeros gate.
      if (looksLikeLivePerson(speech) || ((s.routingSeen || (s.autoZeros ?? 0) >= 2) && HUMAN_RE.test(speech))) {
        return reachHuman(s, atSec, id);
      }
      s.autoZeros = (s.autoZeros ?? 0) + 1; s.type = "keypad";
      s.steps.push({ who: "us", text: "pressed 0 (auto-operator)", atSec, action: "press", value: "0" });
      s.lastActTurn = s.turns;
      return twiml(`<Play digits="0"/>${gather(id)}`);
    }
    return twiml(gather(id)); // wait for the next prompt, then press 0
  }
  if (d.action === "fail") { finish(s, "failed"); return twiml(`<Hangup/>`); }
  return twiml(gather(id)); // wait: keep listening
}

function finish(s: NavSession, status: "human" | "failed") {
  s.status = status;
  // In confirm mode, only a path that ENDED at the right desk (answered, not redirected) is lockable —
  // a redirect means we navigated to the wrong human, so we capture it but don't present it as the recipe.
  const lockable = status === "human" && (!s.confirm || s.confirmResult !== "redirect");
  if (lockable) {
    // The confirm question itself is training scaffolding, not part of the navigation recipe — drop it.
    const acts = s.steps
      .filter((st) => st.who === "us" && !String(st.text).startsWith("asked:"))
      .map((st) => ({ action: st.action || "say", value: st.value || "", atSec: st.atSec }));
    const type = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
    s.type = type;
    s.recipe = { type, steps: acts, seconds: s.humanAtSec ?? (s.steps[s.steps.length - 1]?.atSec ?? 0) };
  }
  if (s.confirm?.asked && s.chainId != null) void recordConfirmAsked(s.chainId, s.retailerId); // rotate off this store next time
  void persistRun(s); // log this run so the admin can watch the learner's history per chain
  setTimeout(() => sessions.delete(s.id), 5 * 60 * 1000); // let the admin read it, then drop
}

/** Which "team member" ran this call: Alpha = keypad presses only, Bravo = spoke menu words,
 *  Charlie = a person answered directly (no nav). Every nav hands off to Charlie at the human. */
export function classifyMode(steps: NavStep[]): { mode: "alpha" | "bravo" | "charlie"; label: string } {
  const acts = steps.filter((st) => st.who === "us");
  if (!acts.length) return { mode: "charlie", label: "Charlie (direct)" };
  return acts.every((a) => a.action === "press")
    ? { mode: "alpha", label: "Alpha → Charlie" }
    : { mode: "bravo", label: "Bravo → Charlie" };
}

/** Append this run to the chain's call log (settings: nav_runs:{chainId}, last 20). Best-effort. */
async function persistRun(s: NavSession): Promise<void> {
  if (s.chainId == null || s.persisted) return;
  s.persisted = true;
  try {
    const key = `nav_runs:${s.chainId}`;
    const arr = JSON.parse((await getSetting(key)) || "[]") as unknown[];
    const { mode, label } = classifyMode(s.steps);
    arr.push({
      ts: Date.now(), store: s.retailerName, retailerId: s.retailerId, model: s.model || NAV_MODEL, mode, label,
      outcome: s.status, seconds: s.humanAtSec ?? (s.steps[s.steps.length - 1]?.atSec ?? null),
      // Confirm-mode result: did we reach the RIGHT desk (answered) or get sent elsewhere (redirect → where)?
      confirm: s.confirm ? (s.confirmResult ?? "asked") : null, redirectTo: s.redirectTo ?? null,
      steps: s.steps.map((st) => ({ who: st.who, text: st.text, atSec: st.atSec, action: st.action ?? null, value: st.value ?? null })),
    });
    await setSetting(key, JSON.stringify(arr.slice(-20)));
  } catch (e) { console.error("[navigator] persistRun", e); }
}

/** Stores we've ALREADY asked the confirm question (settings: nav_confirm_asked:{chainId}). The caller
 *  uses this to ROTATE to a fresh store on a callback — never ask the same store twice (looks bad). */
export async function confirmAskedStores(chainId: number): Promise<number[]> {
  try { return JSON.parse((await getSetting(`nav_confirm_asked:${chainId}`)) || "[]") as number[]; } catch { return []; }
}
async function recordConfirmAsked(chainId: number, retailerId: number): Promise<void> {
  try {
    const arr = await confirmAskedStores(chainId);
    if (!arr.includes(retailerId)) await setSetting(`nav_confirm_asked:${chainId}`, JSON.stringify([...arr, retailerId].slice(-200)));
  } catch (e) { console.error("[navigator] recordConfirmAsked", e); }
}

/** Place the documentation call; returns the session id the admin polls for live progress. */
export async function placeNavCall(chainId: number | null, retailerId: number, retailerName: string, phone: string, model?: string, hint?: string, barge?: { plan: Array<{ action: string; value: string; at: number }> }, reactivePress?: { digit: string; max: number }, confirm?: { product: string }, extra?: { listenFirst?: boolean; askVoiceId?: string; askText?: string }): Promise<{ id?: string; error?: string }> {
  if (!config.callsEnabled) return { error: "calls disabled on this preview deploy" };
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const id = crypto.randomUUID().slice(0, 8);
  const session: NavSession = { id, chainId, retailerId, retailerName, phone, startMs: Date.now(), steps: [], turns: 0, status: "dialing", type: null, humanAtSec: null, confidence: 0, recipe: null, model, hint, barge, reactivePress: reactivePress ? { ...reactivePress, count: 0 } : undefined, confirm: confirm ? { product: confirm.product } : undefined, listenFirst: extra?.listenFirst, askText: extra?.askText };
  sessions.set(id, session);
  // Synthesize the ask in the workflow voice NOW (fire-and-forget) — ready long before any human is.
  if (confirm && extra?.askVoiceId) void synthAsk(session, extra.askVoiceId, extra.askText || `Hi! Real quick — do you have any ${confirm.product} in stock right now?`);
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
export function navEnded(id: string) { const s = sessions.get(id); if (!s) return; if (s.status !== "human" && s.status !== "failed") s.status = "done"; if (s.confirm && s.chainId != null) void recordConfirmAsked(s.chainId, s.retailerId); if (s.chainId != null) void markNavOutcome(s.chainId, s.humanAtSec != null); void persistRun(s); }

/** Reflect a run's outcome on the chain so the admin shows where mapping stands (not just stuck on
 *  "learning"): reached a human → "review" (a recipe to lock); never reached one → "attempted"
 *  (tried, incomplete — ring-out or IVR dead-end, worth a retry). Never clobbers a "locked" chain. */
async function markNavOutcome(chainId: number, reachedHuman: boolean): Promise<void> {
  try {
    const ch = (await db.select({ navStatus: chains.navStatus }).from(chains).where(eq(chains.id, chainId)))[0];
    if (ch?.navStatus === "locked") return;
    await db.update(chains)
      .set({ navStatus: reachedHuman ? "review" : "attempted", navUpdatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(chains.id, chainId));
  } catch (e) { console.error("[navigator] markNavOutcome", e); }
}

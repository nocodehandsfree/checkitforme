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
import { openReceipt, emit, markNow, closeReceipt } from "./events";
// THE EAR — the one that already exists. Section 1 of the runtime spec gives it the whole call, dial
// to hangup, and section 10 says there is exactly one of them. A mapping call used to run on Twilio's
// speech text alone, which returns an empty string for silence, for hold music and for a desk that is
// ringing, so it could not tell "nobody is there" from "somebody just said hello". These are the same
// two classes the paid-agent calls listen with. Nothing new is built here.
import { PromptDetector, ConversationEar, frameEnergy as earFrameEnergy, type HoldReason } from "./listen-nav";

// Twilio webhooks must come back to THIS service — staging maps from staging, prod from prod.
const RAILWAY_HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
// MAPPING model — drives tree DISCOVERY only (the learner). Cost is irrelevant here (map once); at
// SCALE live calls replay the LOCKED keypad recipe (deterministic DTMF, no model). We WANT a smarter
// model for mapping accuracy, but gemini-2.5-flash was returning 503s (overloaded) and stalling the
// nav, and gemini-2.5-pro/2.0-flash were rate-limited — only flash-lite is reliably up. So default to
// the reliable flash-lite and pass a smarter model per-run when one is healthy. TODO: wire a reliable
// smart mapper (Groq llama-3.3-70b or gpt-4o-mini via the gateway) as the default once verified.
export const NAV_MODEL = "gemini-2.5-flash-lite";

/** Ceiling on ONE mapping call. Slow trees (Walgreens ~95s) still fit; anything past this is a call
 *  that is not going to reach anyone and is only costing money. */
const MAX_CALL_SEC = 165;
/** How long we wait for a real voice after the store says it is transferring us. Past this the desk
 *  is not answering — hang up and say so, rather than calling the announcement a human. */
const TRANSFER_WAIT_SEC = 40;

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
export interface NavStep {
  who: "ivr" | "us"; text: string; atSec: number; action?: NavAction; value?: string;
  /** How many store recordings the EAR had heard finish when we did this. Stamped at the moment we
   *  act, from the same prompt detector a live call fires on, so the anchor we learn and the anchor
   *  the runtime counts are the same number. Counting the speech-to-text turns instead — which is
   *  what this used to do — miscounts whenever the transcriber splits one recording into two lines
   *  or glues two into one. Absent when the audio fork never connected. */
  earPrompts?: number;
}
// One choice the store offered us, and what it routes to. Best-effort from messy speech-to-text.
// `digit` is set on a keypad menu ("press 2 for guest services"). `say` is set on a SPOKEN menu, where
// the store lists its departments out loud and you answer with a word — CVS, Walgreens and every
// "virtual assistant" tree work this way, and we used to throw those lines away entirely because they
// never contain the word "press".
export interface MenuOption { digit: string; label: string; say?: string }
/** How a menu option is identified, whichever kind it is. */
export const optionKey = (o: MenuOption): string => o.digit || `say:${(o.say || o.label).toLowerCase()}`;
export interface NavRecipe {
  type: string; steps: { action: string; value: string; atSec: number }[]; seconds: number;
  menu?: MenuOption[];         // the pressable department/option tree we heard (chain property)
  menuPrompts?: string[];      // the raw IVR menu lines, for the owner to read when STT parsing is fuzzy
  ringVariable?: boolean;      // time-to-human depends on a department picking up (variance high) — #A
  target?: string;             // the desk this path reaches ("customer service" / a department name)
}
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
  // MENU CAPTURE (#2) + owner TARGET (#1): the pressable tree we heard, the raw menu lines, and the
  // desk the owner wants us to reach (customer service by default; a chosen department for dept-only chains).
  target?: string; menu?: MenuOption[]; menuPrompts?: string[];
  // Confirm ask pre-synthesized in the workflow's ElevenLabs voice (Branson) — Polly is the fallback.
  askAudio?: Buffer; askText?: string;
  lastActTurn?: number; escaped?: boolean; routingSeen?: boolean; routedAtSec?: number; autoZeros?: number; persisted?: boolean;
  // Receipt bookkeeping: how many steps have been mirrored, and the one-shot moments (see navSync).
  emitted?: number; ivrSeen?: boolean; transferEmitted?: boolean; humanEmitted?: boolean; deadEmitted?: boolean;
  why?: string;             // what the ADMIN pressed to cause this call, for the receipt's note
  deadLine?: boolean; // a TRUE dead end (voicemail / disconnected / store closed) — mapper rotates stores
  // The machine's "transferring you now" moment, kept apart from humanAtSec (which is now only ever a
  // real voice). The gap between the two is what the paid agent currently wastes on every transfer.
  transferAtSec?: number | null;
  greeting?: string;        // the first thing the person said — proof of WHICH desk we reached
  maxSec?: number;          // hard stop for this call (ROI guard); default MAX_CALL_SEC
  transferWaitSec?: number; // how long to wait for a person after an announced transfer
  stopReason?: string;      // why this call ended, in plain words (kept as evidence)
  status: "dialing" | "navigating" | "human" | "failed" | "done";
  type: "direct" | "keypad" | "voice" | null;
  humanAtSec: number | null; confidence: number; callSid?: string; recipe: NavRecipe | null;
  /** What the Ear is hearing right now, and how many store recordings have finished. Present only
   *  once the audio fork connects; every use is optional, so a call whose fork never arrives behaves
   *  exactly as it did before, on text alone. */
  ear?: { det: PromptDetector; conv: ConversationEar; hold: HoldReason | null; recordings: number };
}

const sessions = new Map<string, NavSession>();
/**
 * One inbound (store-side) media frame from the /twilio-media fork. The room IS the nav session id,
 * so only this call's own audio ever reaches it.
 *
 * Wired 07-28 on the owner's order: the Ear belongs on every call that dials a store, and it was
 * never on this one. Both objects below are the EXISTING ones from listen-nav — the same prompt
 * detector that decides when a live call's mapped step fires, and the same hold ear that tells the
 * paid agent somebody walked away.
 */
export function navMediaFeed(room: string, b64: string, track?: string): void {
  const s = sessions.get(room);
  if (!s || s.status === "human" || s.status === "failed") return;
  if (track && track !== "inbound") return;         // our own words come back on the outbound track
  if (!s.ear) {
    const ear: NonNullable<NavSession["ear"]> = {
      det: new PromptDetector(() => { /* replaced below */ }),
      conv: new ConversationEar({
        holdStart: (reason) => { ear.hold = reason; },
        holdEnd: () => { ear.hold = null; },
      }),
      hold: null, recordings: 0,
    };
    ear.det = new PromptDetector((n) => { ear.recordings = n; });
    s.ear = ear;
  }
  // isTone is left false deliberately: the ring-frequency test lives in the machine-locked bridge, so
  // the Ear here cannot yet tell a ringing desk from a voice. That is why what it hears is only ever
  // used to VETO (see navStep) and never to declare a person — a veto cannot invent one.
  s.ear.det.feed(b64);
  s.ear.conv.feed(earFrameEnergy(b64));
}

export function getNavSession(id: string): NavSession | null { return sessions.get(id) || null; }
/** The most recent call to this chain that reached a person — how a lock finds its own evidence when
 *  the caller did not name the call (the Admin Map button sends only the recipe). */
export function latestNavSessionForChain(chainId: number): NavSession | null {
  let best: NavSession | null = null;
  for (const s of sessions.values()) {
    if (s.chainId !== chainId || s.humanAtSec == null) continue;
    if (!best || s.startMs > best.startMs) best = s;
  }
  return best;
}

// ---- THE RECEIPT ------------------------------------------------------------------------------
// Every call the ADMIN places (the store call button, the map pin, mapping calls) runs through here.
// Until now none of them wrote anything down: no timeline, no seconds, no cost, nothing to open
// afterwards. A check placed from the website has had a receipt since 07-26. Same phone call, so it
// gets the same receipt — keyed by the nav session id as the room. No `call_results` row is created:
// a mapping call is not a customer's check and must never land in the customer numbers. The receipt
// store already handles an unattached timeline (`findCallId` returns null and writes it anyway).
//
// Steps are mirrored ONE place rather than at each of the dozen `steps.push` sites, so a new step
// can never be added without its event. Recording must never break a call: everything is best-effort.
function navSync(s: NavSession): void {
  try {
    const from = s.emitted ?? 0;
    for (let i = from; i < s.steps.length; i++) {
      const st = s.steps[i];
      if (st.who === "ivr") { if (!s.ivrSeen) { s.ivrSeen = true; emit(s.id, "ivr_detected", "This store has a phone menu", { heard: st.text.slice(0, 200) }); } continue; }
      if (st.action === "press") emit(s.id, "alpha_press", `Pressed ${st.value ?? ""}`.trim(), { key: st.value, atSec: st.atSec, why: st.text });
      else if (st.action === "say") emit(s.id, "bravo_say", `Said "${st.value ?? ""}"`, { phrase: st.value, atSec: st.atSec, why: st.text });
    }
    s.emitted = s.steps.length;
    if (s.transferAtSec != null && !s.transferEmitted) { s.transferEmitted = true; emit(s.id, "transfer", "The menu handed us on", { atSec: s.transferAtSec }); }
    if (s.humanAtSec != null && !s.humanEmitted) { s.humanEmitted = true; markNow(s.id, "humanMs"); markNow(s.id, "navEndMs"); emit(s.id, "human_detected", "A person is on the line", { atSec: s.humanAtSec, greeting: s.greeting }); }
    if (s.deadLine && !s.deadEmitted) { s.deadEmitted = true; emit(s.id, "voicemail", "A machine, not a person", { why: s.stopReason }); }
  } catch { /* recording must never break a call */ }
}

// ---- Menu capture (#2) ---------------------------------------------------------------------------
// Pull the pressable options out of what the IVR says so the WHOLE tree is visible per chain
// (digit → what it routes to). STT is messy, so this is best-effort: good enough for the owner to read
// and choose a target from, NOT something we navigate by (we navigate by the learned recipe).
const NUMWORD: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
const cleanLabel = (s: string) => s.replace(/^(for|to)\s+/i, "").replace(/\b(please|our|the)\b/gi, "").replace(/[ ,.;:-]+$/g, "").replace(/\s+/g, " ").trim();
export function parseMenuOptions(text: string): MenuOption[] {
  const t = " " + String(text || "").replace(/\s+/g, " ").trim() + " ";
  const found = new Map<string, string>();
  const put = (raw: string, label: string) => {
    const d = NUMWORD[raw.toLowerCase()] ?? raw;
    if (!/^[0-9*#]$/.test(d)) return;
    label = cleanLabel(label);
    if (!found.has(d)) found.set(d, label);
    else if (label && !found.get(d)) found.set(d, label); // fill in a missing label
  };
  // "press N for|to LABEL" — label follows the digit (stop at the next press/for/punctuation).
  for (const m of t.matchAll(/\bpress (\d|[*#]|zero|one|two|three|four|five|six|seven|eight|nine)\b\s*(?:(?:for|to)\s+([a-z][a-z0-9 '&/-]{1,44}?))?(?=,|;|\.|\bpress\b|\bfor \b|$)/gi)) {
    put(m[1], m[2] || "");
  }
  // "for LABEL, press N" — label precedes the digit (some menus phrase it this way).
  for (const m of t.matchAll(/\bfor ([a-z][a-z0-9 '&/-]{1,44}?),?\s*press (\d|[*#]|zero|one|two|three|four|five|six|seven|eight|nine)\b/gi)) {
    put(m[2], m[1]);
  }
  return [...found].map(([digit, label]) => ({ digit, label })).sort((a, b) => a.digit.localeCompare(b.digit));
}
/**
 * A SPOKEN menu — the store reads its departments out loud and you answer with a word. There is no
 * "press" anywhere in the line, which is why every one of these used to be discarded: CVS told us
 * "I can assist you with beauty and fragrance, OTC, health, photo services, and General Store
 * inquiries" and we kept nothing but the one word we happened to say back.
 *
 * Best-effort by design. The raw line is always kept alongside (`menuPrompts`) because the
 * speech-to-text puts commas in odd places, and the raw line is the thing to trust when it does.
 */
export function parseSpokenOptions(text: string): MenuOption[] {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || /\bpress \d|\bpress the\b/i.test(t)) return [];   // that is a keypad menu, handled above
  const out: MenuOption[] = [];
  const add = (label: string) => {
    const l = cleanLabel(label).replace(/^(and|or)\s+/i, "").replace(/^[^a-z0-9]+/i, "");
    if (l.length < 3 || l.length > 45) return;
    if (out.some((o) => o.label.toLowerCase() === l.toLowerCase())) return;
    out.push({ digit: "", label: l, say: l });
  };
  // "say <word> for <thing>" — the store names the word to speak.
  for (const m of t.matchAll(/\bsay "?([a-z][a-z '&/-]{1,30}?)"? (?:for|to) ([a-z][a-z0-9 '&/-]{1,44})/gi)) {
    const l = cleanLabel(m[2]);
    if (l.length >= 3 && l.length <= 45 && !out.some((o) => o.label.toLowerCase() === l.toLowerCase())) {
      out.push({ digit: "", label: l, say: cleanLabel(m[1]) });
    }
  }
  // A read-out list: "I can assist you with A, B and C" / "are you calling in for A or B".
  const LEAD = /(?:assist you with|help you with|choose from|options are|calling (?:in )?for|looking for|would you like)\s+(.+)$/i;
  const lead = LEAD.exec(t);
  if (lead) {
    let tail = lead[1].replace(/[.?!]+\s*$/, "");
    tail = tail.replace(/\b(?:today|please|sir|ma'?am)\b/gi, "");
    // Commas first when the line has them; the speech-to-text sprays them, but splitting on "and"
    // instead would cut "beauty and fragrance" in half.
    const parts = tail.includes(",") ? tail.split(",") : tail.split(/\s+\bor\b\s+|\s+\band\b\s+/i);
    for (const p of parts) add(p);
  }
  return out;
}

/** Does this line offer us choices at all — pressed or spoken? Those are the lines worth keeping. */
export function isMenuLine(text: string): boolean {
  const t = String(text || "");
  if (/press \d|press the|option \d|\bfor [a-z].{0,40}\bpress\b/i.test(t)) return true;
  return parseSpokenOptions(t).length >= 2;   // one stray phrase is not a menu; a list of choices is
}

/** Merge freshly-heard options into the running menu (union by option; keep the first real label). */
export function mergeMenu(prev: MenuOption[] | undefined, next: MenuOption[]): MenuOption[] {
  const by = new Map((prev || []).map((o) => [optionKey(o), o] as const));
  for (const o of next) {
    const k = optionKey(o);
    const had = by.get(k);
    if (!had || (o.label && !had.label)) by.set(k, o);
  }
  return [...by.values()].sort((a, b) => optionKey(a).localeCompare(optionKey(b)));
}
// A customer-service / front-desk / operator / general path — what we PREFER to reach (#1) and whose
// ABSENCE flags a department-only chain that needs an owner-chosen target (#B).
const CS_RE = /customer service|guest services?|front (desk|end|store|counter|of)|\boperator\b|receptionist|representative|\bassociate\b|main store|general (store|inquir|question)|help desk|service desk|all other/i;
export function menuHasCustomerService(menu: MenuOption[] | undefined): boolean {
  return !!menu && menu.some((o) => CS_RE.test(o.label));
}

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
  // #1: whoever can check shelf stock — customer service / front / operator — by default; the owner can
  // pin a specific desk per chain (used for department-only trees with no CS path).
  const targetBlock = s.target
    ? `OWNER-SET TARGET for this chain: reach "${s.target}". Prefer routing to that desk/department above all else; only deviate if that option clearly isn't offered.\n\n`
    : "";
  const prompt = `You are calling a retail store and navigating its phone system to reach a real HUMAN employee as fast as possible. You can only: SAY a short word, PRESS a digit, WAIT (listen more), or finish (HUMAN reached, or FAIL dead-end).

WHO YOU ARE: a regular SHOPPER calling to ask if a product is in stock. You are NOT a patient, NOT a healthcare/medical/insurance provider, NOT a vendor. If a menu asks "are you a healthcare provider / calling from a doctor's office?", the answer is always NO (say "no" or press the option for no / "to continue"). At a pharmacy or any store with departments, ALWAYS head to the FRONT STORE / GENERAL store / sales floor — NEVER choose "pharmacy" (it dead-ends in patient/date-of-birth verification). Never give a date of birth, prescription number, or member ID — if a menu demands one, that branch is wrong; back out toward the general store / operator.

${targetBlock}WHO TO REACH (priority order — a shopper asking about shelf stock): (1) CUSTOMER SERVICE / guest services / front desk / operator / "0" / receptionist; (2) "all other inquiries" / general store / representative / associate. Choose a SPECIFIC PRODUCT DEPARTMENT (footwear, apparel, electronics, sporting goods, toys, fishing/hunting, grocery, etc.) ONLY as a LAST RESORT when the menu offers no customer-service / front / operator / general option at all — a product-department clerk is the wrong person to ask about card stock and often rings unanswered. Never pick a department just because it's listed first.

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
  // Twilio only fetches this once the line is actually answered, so it IS the connect moment.
  markNow(id, "answeredMs"); emit(id, "connected", "The line was answered");
  // BARGE mode: we already KNOW the path, so fire the words on a timer — speaking OVER the IVR instead
  // of waiting for each prompt to finish. `at` = seconds from connect to speak each step. Then listen
  // for the transfer. Each round we shave the times earlier until the store stops accepting it.
  const ear = earFork(id);
  if (s && s.barge?.plan?.length) {
    let inner = ear; let prev = 0;
    for (const st of s.barge.plan) {
      const wait = Math.max(0, Math.round((st.at ?? 0) - prev));
      if (wait > 0) inner += `<Pause length="${wait}"/>`;
      if (st.action === "press" && st.value) {
        const digits = st.value.replace(/[^0-9*#]/g, "").slice(0, 6);
        inner += `<Play digits="${digits}"/>`;
        s.steps.push({ who: "us", text: `pressed ${digits} (barge @${st.at}s)`, atSec: Math.round(st.at), action: "press", value: digits , earPrompts: s.ear?.recordings });
      } else if (st.value) {
        inner += `<Say voice="Polly.Joanna">${esc(st.value)}</Say>`;
        s.steps.push({ who: "us", text: `said "${st.value}" (barge @${st.at}s)`, atSec: Math.round(st.at), action: "say", value: st.value , earPrompts: s.ear?.recordings });
      }
      prev = st.at ?? prev;
    }
    s.type = s.barge.plan.every((p) => p.action === "press") ? "keypad" : "voice";
    return twiml(`${inner}${gather(id)}`);
  }
  return twiml(`${ear}<Pause length="1"/>${gather(id)}`); // let the greeting start, then listen
}

/** Fork the store's audio to the Ear for the whole call. `<Start><Stream>` survives every TwiML
 *  replacement the gather loop makes (documented trap), so it is set up once here and never again.
 *  Purely additive: if the fork never connects, the call runs exactly as it did before. */
function earFork(id: string): string {
  return `<Start><Stream url="wss://${RAILWAY_HOST}/twilio-media?room=${id}" track="inbound_track">`
    + `<Parameter name="room" value="${id}" /></Stream></Start>`;
}

/**
 * A store that answers DIRECT, with a short greeting and no menu at all: "Gateway WinCo.", "Bakery,
 * this is Sam". We have to call it on the very first line, because waiting for a second one leaves
 * dead air while they keep saying hello.
 *
 * The bar is that it is the FIRST thing on the line. On 07-28 CVS Tarzana played us sixteen seconds
 * of recording ending "…are you a healthcare provider?", the speech-to-text handed back the fragment
 * "A healthcare provider." — three words, no menu language — and we filed the whole store as
 * answering direct in twenty seconds. A store that has already played us a recording is not a store
 * that answers direct, however short the next fragment happens to be.
 *
 * @param steps the call so far, INCLUDING the line being judged (already pushed by the caller).
 */
export function looksLikeDirectPickup(steps: NavStep[], turns: number, speech: string): boolean {
  const t = (speech || "").trim();
  if (!t || turns > 2) return false;
  if (t.split(/\s+/).length > 4) return false;
  if (/press|menu|para |website|hours|dial|closed|extension|welcome|recorded|automated/i.test(t)) return false;
  return steps.filter((st) => st.who === "ivr" && String(st.text || "").trim()).length <= 1;
}

/** THE MENU IS STILL TALKING and what we just heard is a piece of it, not a person.
 *
 *  True only for the exact shape that fooled us on CVS Tarzana (07-27): we have not acted once, the
 *  store has already read out two or more recordings, nothing announced a handoff, and the words do
 *  not read like a person. A store that really picks up cold has at most one recording behind it, so
 *  this cannot swallow a direct answer, and it stops applying the moment we say or press anything. */
export function menuStillTalking(
  s: { steps: NavStep[]; turns: number; routingSeen?: boolean },
  speech: string,
): boolean {
  if (s.routingSeen) return false;                                  // handed on → the next voice is the desk
  if (ROUTING_RE.test(speech || "")) return false;                  // being handed on right now
  if (looksLikeLivePerson(speech || "")) return false;              // the words themselves are a person
  if (looksLikeDirectPickup(s.steps, s.turns, speech || "")) return false; // a cold pickup, one recording behind it
  if (s.steps.some((st) => st.who === "us")) return false;          // we have already acted; trust the read
  return s.steps.filter((st) => st.who === "ivr" && String(st.text || "").trim()).length >= 2;
}

/** The words that prove WHICH desk answered. Only what was said on the turn we reached them counts:
 *  on the 07-28 Mulholland call the newest line in the log was the machine's own "Okay, transferring
 *  you now" from 27s earlier, and it got filed as the desk that picked up. A routing line is never a
 *  greeting and an older line is never this person's — an empty greeting beats a false one. */
export function greetingFrom(steps: NavStep[], atSec: number): string | undefined {
  const last = [...(steps || [])].reverse().find((st) => st.who === "ivr" && st.text);
  if (!last) return undefined;
  if (Math.abs((last.atSec ?? 0) - atSec) > 2) return undefined;
  if (ROUTING_RE.test(last.text)) return undefined;
  return last.text.slice(0, 200);
}

/** We've reached a live person. Plain training mode → hang up before troubling them. CONFIRM mode →
 *  ask the one stock question ONCE, then listen for their reply (classified next turn). */
function reachHuman(s: NavSession, atSec: number, id: string, viaRouting = false): string {
  // A TRANSFER ANNOUNCEMENT IS NOT A PERSON (owner 07-26, proved on the CVS Anaheim call): the store
  // said "Okay, transferring you now" at 62s and we booked that as the human. The clerk speaks ~17s
  // later, so every learned time-to-human on a transfer chain was that much early — and the paid agent
  // joins on that number. So the announcement is recorded as its own moment and we keep waiting for a
  // real voice, in EVERY mode. The wait is bounded below (transferWaitSec).
  if (viaRouting) {
    s.routingSeen = true;
    s.routedAtSec = s.routedAtSec ?? atSec;
    s.transferAtSec = s.transferAtSec ?? atSec;
    return twiml(gather(id));
  }
  s.humanAtSec = s.humanAtSec ?? atSec; // a real voice — THIS is time-to-human
  // What they said is the proof of WHICH desk we reached — the only check left once a mapping call
  // hangs up instead of asking a question. It has to be what was said ON THIS TURN: on the 07-28
  // Mulholland call the last thing in the log was the machine's own "Okay, transferring you now" from
  // 27s earlier, and that got filed as the desk that answered. A routing line is never a greeting, and
  // an older line is never this person's — better an empty greeting than a false one.
  if (!s.greeting) s.greeting = greetingFrom(s.steps, atSec);
  if (s.confirm && !s.confirm.asked) {
    s.confirm.asked = true; s.confirm.askedAtSec = atSec;
    const q = s.askText || `Hi! Real quick — do you have any ${s.confirm.product} in stock right now?`;
    s.steps.push({ who: "us", text: `asked: "${q}"`, atSec, action: "say", value: q , earPrompts: s.ear?.recordings });
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
      // Collapse "cards cards" when the opener already says cards after {category}.
      text: (opener || fallback.text).replace(/\{category\}/g, "Pokémon cards").replace(/\bcards(\s+cards)+\b/gi, "cards"),
      voiceId: (wf.voiceId && String(wf.voiceId)) || config.voice.defaultVoiceId,
    };
  } catch { return fallback; }
}

/** One navigation turn — Twilio posts what the store said; we decide and return the next TwiML.
 *  Wrapped so the receipt is mirrored on EVERY exit path: this turn returns TwiML from a dozen
 *  branches, and a branch that forgot to record would be a silent hole in the timeline. */
export async function navStep(id: string, speech: string): Promise<string> {
  try { return await navTurn(id, speech); }
  finally { const s = sessions.get(id); if (s) navSync(s); }
}
async function navTurn(id: string, speech: string): Promise<string> {
  const s = sessions.get(id);
  if (!s) return twiml(`<Hangup/>`);
  const atSec = Math.round((Date.now() - s.startMs) / 1000);
  s.turns++;
  // ROI GUARD (owner 07-26): a mapping call that is going nowhere costs the same as one that works, so
  // it gets a hard stop — no call runs past its cap, whatever the menu does. Callers set their own cap
  // (the sweep uses a tighter one than a slow-IVR discovery run); MAX_CALL_SEC is the ceiling.
  const cap = Math.min(s.maxSec ?? MAX_CALL_SEC, MAX_CALL_SEC);
  if (s.turns > 22 || atSec > cap) {
    s.stopReason = s.turns > 22 ? "too many turns" : `no person within ${cap}s`;
    finish(s, "failed"); return twiml(`<Hangup/>`);
  }
  // Transferred, then nobody picked up. The route DID reach the transfer, but no person ever spoke —
  // so we hang up and record exactly that, instead of booking the announcement as a human.
  // Transferred, then nobody picked up. The route DID reach the transfer, but no person ever spoke —
  // so we hang up and record exactly that, instead of booking the announcement as a human. How long to
  // hold on wants the shared Ear (a desk still audibly ringing deserves longer than a dead line):
  // spec section 10, Echo's to wire, not a second listener of ours.
  if (s.routedAtSec != null && s.humanAtSec == null && atSec - s.routedAtSec > (s.transferWaitSec ?? TRANSFER_WAIT_SEC)) {
    s.stopReason = `transferred at ${s.routedAtSec}s, nobody picked up`;
    finish(s, "failed"); return twiml(`<Hangup/>`);
  }
  if (speech && speech.trim()) {
    s.steps.push({ who: "ivr", text: speech.trim().slice(0, 300), atSec });
    // #2: harvest the pressable options from any menu line into the chain's menu tree + keep the raw
    // line (STT is fuzzy, so the owner can read the exact wording when the parse is imperfect).
    // EVERY choice the store offers, pressed OR spoken. This used to test for the word "press" and
    // nothing else, so a store that reads its departments out loud — CVS, and every "virtual
    // assistant" tree — had its whole menu thrown away and we kept only the one word we said back.
    if (isMenuLine(speech)) {
      const opts = [...parseMenuOptions(speech), ...parseSpokenOptions(speech)];
      if (opts.length) s.menu = mergeMenu(s.menu, opts);
      (s.menuPrompts = s.menuPrompts || []).push(speech.trim().slice(0, 240));
      if (s.menuPrompts.length > 12) s.menuPrompts = s.menuPrompts.slice(-12);
    }
  }
  if (speech && ROUTING_RE.test(speech)) {
    s.routingSeen = true;                       // routed to a person → next greeting is human
    // WHEN the machine said it was handing us on. It used to be stamped only if the brain happened to
    // call that same turn "human"; on the 07-28 Alhambra call it did not, so "Okay, transferring you
    // now" at 81s went unrecorded and the 10s the paid agent would have wasted was never measured.
    if (s.transferAtSec == null) {
      s.transferAtSec = atSec; s.routedAtSec = s.routedAtSec ?? atSec;
    }
  }
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
  // Holding the ask for a real person after an announced transfer, but the hold runs long with no
  // pickup → the path is still CONFIRMED (transfer reached); count it human and hang up politely.
  if (s.confirm && !s.confirm.asked && s.routedAtSec != null && atSec - s.routedAtSec > 30 && !(speech && speech.trim())) {
    finish(s, "human"); return twiml(`<Hangup/>`);
  }
  // LIVE PICKUP — fire on the FIRST human utterance, in EVERY mode. A direct store answers "Hello" /
  // "Store, Bob speak" with no IVR, so we must reach the human on turn 1 — waiting for a 2nd line (or
  // an LLM round-trip) leaves dead air while they keep saying "hello" until we hang up. looksLikeLivePerson
  // already excludes "press N" menus + long recordings, so it won't trip on an opening IVR. Map mode →
  // hang up instantly; confirm mode → ask the one stock question.
  if (speech && (looksLikeLivePerson(speech) || looksLikeDirectPickup(s.steps, s.turns, speech))) return reachHuman(s, atSec, id);
  // FAST-FAIL only on TRUE dead-ends: an actual voicemail box, or the STORE itself closed.
  // NEVER on "pharmacy is closed" — the front store is open and is exactly where we're going
  // (pharmacy can't sell Pokémon cards anyway). Live-observed funnel: "connect you to our
  // voicemail… leave a message with your name and date of birth" = mailbox, bail instantly.
  const DEADEND_RE = /connect(ing)? you to (our|the) voicemail|leave (a |your )?(message|voicemail) (at|after|with)|voicemail box|record (a |your )?message after|providing your name,? (and )?date of birth|(store|we) (is|are) (currently |now )?closed(?![^.]*pharmacy)|closed for the (day|night)|our store hours are/i;
  const PHARM_OK = /pharmacy .{0,30}(closed|hours)/i; // pharmacy-only closure — keep navigating to the front store
  if (speech && DEADEND_RE.test(speech) && !PHARM_OK.test(speech)) { s.deadLine = true; finish(s, "failed"); return twiml(`<Hangup/>`); }
  s.status = "navigating";
  // LISTEN-FIRST (mapping call 1): hear the menu out before acting — capture every prompt; the moment
  // a prompt REPEATS (the menu looped, we've heard it all), or after 4 prompts / 50s, flip to acting
  // mode and navigate on this SAME call. A live person still short-circuits above, so a direct-answer
  // store never sits in silence.
  if (s.listenFirst) {
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 80);
    // The menu ASKED for input ("press 1…", "para español…", "say yes/no") — listening longer adds
    // nothing and SHORT menus (Family Dollar) hang up if you don't answer within ~20s. Act now.
    // A menu does not have to say "press 1" to be asking us something. CVS's virtual assistant asks
    // "are you a healthcare provider?" in plain words, and on 07-28 the listen-first pass sat through
    // it: the store re-prompted with "sorry I'm not understanding", the call ran 91s instead of 62s,
    // AND the extra recording shifted every anchor we learned. A direct question is an ask.
    const askedForInput = !!speech && (
      /press (\d|one|two|three)|para espa[ñn]ol|by saying|please say|say (yes|no)\b|enter your/i.test(speech)
      || /\b(are|is|do|did|would|can|may) (you|this|that)\b[^.?]*\?/i.test(speech)
      || /\b(are|do|is) you\b[^.]{0,60}$/i.test(speech.trim())
      || /let me know if|please confirm|which (one|department)|calling (in )?for/i.test(speech)
    );
    if (speech && speech.trim()) {
      s.heard = s.heard || [];
      const n = norm(speech);
      const repeated = !!n && s.heard.some((h) => h === n || (n.length > 25 && h.startsWith(n.slice(0, 25))));
      s.heard.push(n);
      if (askedForInput || repeated || s.heard.length >= 4 || atSec > 50) s.listenFirst = false; // heard enough → act NOW (fall through to decide)
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
      s.steps.push({ who: "us", text: `pressed ${dg} (after prompt ${s.reactivePress.count})`, atSec, action: "press", value: dg , earPrompts: s.ear?.recordings });
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
      s.steps.push({ who: "us", text: `said "${next.value}" (recovery — prompt named it)`, atSec, action: "say", value: next.value , earPrompts: s.ear?.recordings });
      s.lastActTurn = s.turns;
      return twiml(`<Say voice="Polly.Joanna">${esc(next.value)}</Say>${gather(id)}`);
    }
  }
  const d = await decide(s, speech || "");
  if (d.type) s.type = d.type;
  s.confidence = d.confidence;
  // A PERSON HAS TO SAY SOMETHING, AND THE EAR HAS TO AGREE. Silence, hold music and a ringing desk
  // all come back from the speech gather as nothing, and on the 07-28 Mulholland call the model
  // called one of those turns "human" 27 seconds after the transfer — 84s went into the map as
  // time-to-human with no proof at all, which is the exact number the paid agent joins on.
  //   • no words at all  → not a person. Keep listening.
  //   • words, but the Ear says the line is playing hold music or sitting silent → not a person
  //     either; that is the recording bleeding into the transcript.
  // The Ear is only ever a VETO here, never the thing that declares somebody present, because the
  // ring-frequency test still lives in the machine-locked bridge and without it a ringing desk can
  // still look like a voice with gaps in it. A veto cannot invent a person; a green light could.
  if (d.action === "human" && !(speech && speech.trim())) return twiml(gather(id));
  if (d.action === "human" && s.ear && (s.ear.hold === "music" || s.ear.hold === "quiet")) {
    emit(id, "unknown", "That was the line, not a person — still waiting", { heard: s.ear.hold, atSec });
    return twiml(gather(id));
  }
  // AND THE MODEL'S WORD IS NOT PROOF EITHER — the CVS Tarzana call, 07-27. The recording asked "Are
  // you a healthcare provider?" and the transcriber delivered only its tail, "A healthcare provider.",
  // on its own line. The brain read three words with no "press N" in them and called it a person at
  // 20s. That one line became a store recipe claiming CVS answers direct, off a call where nobody
  // spoke and we had not said a single word of the route yet.
  //
  // So the shape that call had is vetoed outright: nothing of ours has fired, the store has already
  // played two or more recordings, no handoff was announced, and the words do not read like a person.
  // That is the menu still talking. Kept deliberately narrow so it cannot silence a REAL person:
  //   • a store that picks up cold has at most one recording behind it (looksLikeDirectPickup),
  //   • a store that announced a handoff is exempt (routingSeen), so the next voice is the desk,
  //   • words that read like a person are exempt (looksLikeLivePerson),
  //   • and once we have acted even once, the model is trusted as before.
  if (d.action === "human" && menuStillTalking(s, speech || "")) {
    emit(id, "unknown", "That read like the recording, not a person", { heard: (speech || "").slice(0, 120), atSec });
    return twiml(gather(id));
  }
  if (d.action === "human") return reachHuman(s, atSec, id, !!(speech && ROUTING_RE.test(speech))); // person OR announced transfer → confirm waits for the person
  if (d.action === "press" && d.value) {
    const digits = d.value.replace(/[^0-9*#]/g, "").slice(0, 6);
    s.steps.push({ who: "us", text: `pressed ${digits}`, atSec, action: "press", value: digits , earPrompts: s.ear?.recordings });
    s.lastActTurn = s.turns;
    return twiml(`<Play digits="${digits}"/>${gather(id)}`);
  }
  if (d.action === "say" && d.value) {
    s.steps.push({ who: "us", text: `said "${d.value}"`, atSec, action: "say", value: d.value , earPrompts: s.ear?.recordings });
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
      s.steps.push({ who: "us", text: "pressed 0 (auto-operator)", atSec, action: "press", value: "0" , earPrompts: s.ear?.recordings });
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
    s.recipe = {
      type, steps: acts, seconds: s.humanAtSec ?? (s.steps[s.steps.length - 1]?.atSec ?? 0),
      // #2/#6: carry the captured menu tree + raw lines with the recipe so they persist per chain.
      menu: s.menu && s.menu.length ? s.menu : undefined,
      menuPrompts: s.menuPrompts && s.menuPrompts.length ? s.menuPrompts : undefined,
      target: s.target,
    };
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
      // navId doubles as the receipt's room, so the run log can open the whole call afterwards.
      ts: Date.now(), navId: s.id, why: s.why ?? null,
      store: s.retailerName, retailerId: s.retailerId, model: s.model || NAV_MODEL, mode, label,
      outcome: s.status, seconds: s.humanAtSec ?? (s.steps[s.steps.length - 1]?.atSec ?? null),
      // Confirm-mode result: did we reach the RIGHT desk (answered) or get sent elsewhere (redirect → where)?
      confirm: s.confirm ? (s.confirmResult ?? "asked") : null, redirectTo: s.redirectTo ?? null,
      transferAtSec: s.transferAtSec ?? null, greeting: s.greeting ?? null, stopReason: s.stopReason ?? null,
      // #2/#6: the menu tree we heard + the desk we aimed for, so each attempt is auditable after expiry.
      menu: s.menu && s.menu.length ? s.menu : null, target: s.target ?? null,
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
export async function placeNavCall(chainId: number | null, retailerId: number, retailerName: string, phone: string, model?: string, hint?: string, barge?: { plan: Array<{ action: string; value: string; at: number }> }, reactivePress?: { digit: string; max: number }, confirm?: { product: string }, extra?: { listenFirst?: boolean; askVoiceId?: string; askText?: string; target?: string; maxSec?: number; transferWaitSec?: number; why?: string }): Promise<{ id?: string; error?: string }> {
  if (!config.callsEnabled) return { error: "calls disabled on this preview deploy" };
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const id = crypto.randomUUID().slice(0, 8);
  const session: NavSession = { id, chainId, retailerId, retailerName, phone, startMs: Date.now(), steps: [], turns: 0, status: "dialing", type: null, humanAtSec: null, confidence: 0, recipe: null, model, hint, barge, reactivePress: reactivePress ? { ...reactivePress, count: 0 } : undefined, confirm: confirm ? { product: confirm.product } : undefined, listenFirst: extra?.listenFirst, askText: extra?.askText, target: extra?.target, maxSec: extra?.maxSec, transferWaitSec: extra?.transferWaitSec };
  sessions.set(id, session);
  session.why = extra?.why;
  // The receipt opens at DIAL, before anything can go wrong, so even a call the carrier refuses
  // leaves a record of having been tried.
  openReceipt(id, {
    lane: barge?.plan?.length ? (barge.plan.every((p) => p.action === "press") ? "alpha" : "bravo") : "unknown",
    note: extra?.why || "Admin call",
    planned: barge?.plan?.length ? barge.plan.map((p) => ({ action: p.action, value: p.value, atSec: p.at })) : undefined,
  });
  emit(id, "dialed", `Dialling ${retailerName}`, { phone, chainId, retailerId, why: extra?.why || "Admin call" });
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
  if (!r.ok) {
    const why = `twilio ${r.status}: ${(await r.text()).slice(0, 120)}`;
    emit(id, "hangup", "The carrier refused the call", { why });
    closeReceipt(id, why, "dial-failed");
    sessions.delete(id);
    return { error: why };
  }
  const d = (await r.json()) as { sid?: string };
  if (d.sid) session.callSid = d.sid;
  return { id };
}
export function navEnded(id: string) {
  const s = sessions.get(id); if (!s) return;
  if (s.status !== "human" && s.status !== "failed") s.status = "done";
  navSync(s); // catch any step the last turn added before the line dropped
  markNow(id, "endMs");
  emit(id, "hangup", s.stopReason || (s.humanAtSec != null ? "Reached a person" : "Never reached a person"), { status: s.status, humanAtSec: s.humanAtSec });
  closeReceipt(id, s.stopReason, s.status);
  if (s.confirm && s.chainId != null) void recordConfirmAsked(s.chainId, s.retailerId);
  if (s.chainId != null) void markNavOutcome(s.chainId, s.humanAtSec != null);
  void persistRun(s);
}

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

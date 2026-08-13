// THE ROBOT STORE'S PHONE MENU (owner approved 08-08 — `docs/specs/mapping-tests/robot-menu.md`).
//
// The robot store could only ever answer as Staff. Every one of the thirteen mapping tests needs it
// to answer as a MENU first, because walking a menu to a person IS what mapping does, and until now
// no menu had ever been walked without spending money on a stranger's store.
//
// FOUR THINGS THIS ADDS, and nothing else:
//   1. It hears a key press. The scenes listen for speech only, so pressing 2 did nothing at all.
//   2. It branches on WHICH key was pressed, off the owner's key table.
//   3. It has a menu voice of its own, separate from Staff's, saying the same words the same way on
//      every call — same voice, same settings, and the clip cache hands back the identical bytes.
//   4. It loops back to the top of the options: after six seconds of nothing, after a key that is
//      not on the table, and after the two doors the owner said return to the menu.
//
// THE WORDS ARE THE OWNER'S, WORD FOR WORD. Nothing here writes a sentence he did not approve. Where
// his script gives no line for something (a key that is not on the table), this plays the options
// again rather than inventing a "sorry, I did not get that".
//
// WHY EVERY SENTENCE IS ITS OWN RECORDING. The phone company stops the audio dead the instant a key
// is pressed, and it never tells us how far in that was. Each sentence is recorded and measured on
// its own, so the second a key lands says exactly which sentence was playing. That is what lets the
// greeting carry on from where it was cut off, and what lets the ignored-press variant read on from
// the line it was on instead of starting the whole list again.
//
// IT NEVER TOUCHES THE SCENES. The menu owns the call from the moment it is answered until a desk
// picks up. Who answers, and every word they say after that, stays the Staff scenes' business: this
// file hands the desk back to its caller and owns not one word of talking to a person.
import { config } from "../config";
import { getSetting } from "../db/settings";
import { mp3Clip, mp3Seconds } from "./clip-cache";

const HOST = config.staging.on ? "voice-caller-staging-production.up.railway.app" : "voice-caller-production-2d6b.up.railway.app";
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

// ---- THE SCRIPT, word for word -----------------------------------------------------------------

/** Played the moment the call is answered. The emergency sentence is in ON PURPOSE: it is the exact
 *  CVS shape that fooled the earpiece into calling a machine a person on 08-07, so every mapping test
 *  walks straight past the words that broke us. */
export const GREETING: string[] = [
  "Thank you for calling MVP's Pharmacy.",
  "If this is a medical emergency, please hang up and dial nine one one.",
  "Please listen closely, as our menu options have changed.",
];

/** Read straight after the greeting. One sentence per line, in the owner's order; read end to end
 *  they are his options paragraph exactly. */
const OPTION_PHARMACY = "For the pharmacy, press 1.";
const OPTION_COSMETICS = "For cosmetics, press 2.";
const OPTION_HOME = "For home supplies, press 3.";
const OPTION_HOURS = "For store hours and directions, press 4.";
const OPTION_FRONT_0 = "For the front of the store and customer service, press 0.";
const OPTION_FRONT_5 = "For the front of the store and customer service, press 5.";
const OPTION_REPEAT = "To hear these options again, press 9.";

/** The two desks that answer with a voice, and the two recordings that do not. */
const PHARMACY_DESK = "MVP's pharmacy, this is Larry.";
const FRONT_DESK = "MVP's, this is Larry speaking.";
const HOME_SUPPLIES = "Home supplies.";
const COSMETICS_CLOSED = "Our cosmetics department is open ten to six.";
const HOURS_AND_ADDRESS = "We are open nine to nine, seven days a week. You can find us at 4200 Woodland Hills Drive.";

/** Six seconds of nothing pressed and the whole list plays again from the top of the options. The
 *  first mapping check listens all the way through before it acts, and that free repeat is the second
 *  sample that proves a recording with certainty. */
const NO_PRESS_SEC = 6;
/** US ringback runs two seconds of tone then four of silence, so a ring is one six second cycle and
 *  the last one ends the moment its tone does. One ring is 2s, two are 8s, three are 14s, eight 44s. */
export const ringSecs = (rings: number) => Math.max(1, rings * 6 - 4);
/** A caller that never presses anything cannot loop for ever on a real line. Mapping hangs up long
 *  before this; it is here so a forgotten call cannot run up a bill on its own. */
const MAX_LOOPS = 8;

// ---- THE VARIANTS ------------------------------------------------------------------------------

/** Which shape of the menu this call plays. `plain` is the owner's script as written; the other four
 *  are the ones his tests name, each differing from `plain` in exactly one way. */
export type MenuVariant = "plain" | "no_option_fits" | "menu_changed" | "press_ignored" | "ring_out";
export const MENU_VARIANTS: Record<MenuVariant, string> = {
  plain: "the menu as approved",
  no_option_fits: "option 0 is left out of the read list, so nothing matches cards",
  menu_changed: "the front desk moves from key 0 to key 5",
  press_ignored: "a press before the options finish is swallowed and the menu reads on",
  ring_out: "the front desk rings eight times, nobody answers, and the menu returns from the top",
};
export const isMenuVariant = (v: string): v is MenuVariant => Object.prototype.hasOwnProperty.call(MENU_VARIANTS, v);

/** WHICH KEY OPENS THE FRONT OF THE STORE. It is 0 everywhere except the changed menu, where the
 *  owner moved it to 5 — which is the whole point of that variant: a saved route still presses 0. */
export const frontKey = (v: MenuVariant) => (v === "menu_changed" ? "5" : "0");

/** The options this variant reads out, in order. */
export function optionsFor(v: MenuVariant): string[] {
  const front = v === "menu_changed" ? OPTION_FRONT_5 : OPTION_FRONT_0;
  const lines = [OPTION_PHARMACY, OPTION_COSMETICS, OPTION_HOME, OPTION_HOURS, front, OPTION_REPEAT];
  // NO OPTION FITS: the front of the store is simply never offered, so a caller looking for cards
  // hears the whole list and finds nothing that matches.
  return v === "no_option_fits" ? lines.filter((l) => l !== front) : lines;
}

// ---- WHAT ONE KEY DOES -------------------------------------------------------------------------

/** Where a key leads. `desk` is somebody picking up after the rings; `read` plays a recording and
 *  returns to the top of the options; `ringout` rings and nobody answers; `again` just returns. */
export type KeyLanding =
  | { kind: "desk"; rings: number; answers: string; staffTakeOver: boolean }
  | { kind: "read"; says: string }
  | { kind: "ringout"; rings: number }
  | { kind: "again" };

/** THE OWNER'S KEY TABLE, and nothing outside it. A key he did not list is not an error to announce,
 *  because his script has no words for one — it falls through to the options playing again. */
export function keyTable(v: MenuVariant, key: string): KeyLanding | null {
  if (key === frontKey(v)) {
    // THE RIGHT DEPARTMENT: the front of the store, which is also customer service. Three rings, the
    // front desk answers, and Staff carry on from there exactly as they do on every other check.
    return v === "ring_out"
      ? { kind: "ringout", rings: 8 }
      : { kind: "desk", rings: 3, answers: FRONT_DESK, staffTakeOver: true };
  }
  switch (key) {
    // The pharmacy desk. The WRONG department for cards: pharmacy staff cannot see the front of the
    // store. The owner's script gives this desk one line and no more, so it says that line and holds
    // the line from there — nothing here puts another word in its mouth.
    case "1": return { kind: "desk", rings: 1, answers: PHARMACY_DESK, staffTakeOver: false };
    case "2": return { kind: "read", says: COSMETICS_CLOSED };
    // Home supplies. Two rings, then a voice that cannot help with cards; on the ring-out variant
    // nobody picks this one up either.
    case "3": return v === "ring_out"
      ? { kind: "ringout", rings: 2 }
      : { kind: "desk", rings: 2, answers: HOME_SUPPLIES, staffTakeOver: false };
    case "4": return { kind: "read", says: HOURS_AND_ADDRESS };
    case "9": return { kind: "again" };
    default: return null;
  }
}

// ---- THE CALL ----------------------------------------------------------------------------------

interface Line { text: string; secs: number }
export interface MenuRun {
  callSid: string; variant: MenuVariant; startedAt: number; endedAt?: number;
  /** Every line the menu really played, with the second it was said. */
  said: Array<{ text: string; atSec: number; voice: "menu" }>;
  /** Every key the caller pressed, whether it landed before the reading had finished, and what it
   *  actually did. `held` is a key pressed during the greeting, which waits for the options. */
  keys: Array<{ key: string; atSec: number; early: boolean; held: boolean; acted: string }>;
  /** The desk this call ended up at, once one answered. */
  desk?: { key: string; answers: string; rings: number; staffTakeOver: boolean };
}
interface MenuCall extends MenuRun {
  greeting: Line[]; options: Line[];
  clips: Map<string, Buffer>;
  /** `holding` is a desk that answered with its one approved line and has nothing more to say: it
   *  keeps the line open and stays quiet, the way a real counter does while you talk. */
  phase: "greeting" | "options" | "desk" | "holding";
  /** How many quiet turns that desk has held for. */
  heldFor?: number;
  /** The next line of the current phase to read. */
  idx: number;
  /** When the document we are playing right now went out, so the second a key lands tells us which
   *  line it landed on. */
  sentMs: number;
  /** A key pressed DURING the greeting is REMEMBERED and acts the moment the options start. That trap
   *  is real on some menus and it is in on purpose, so mapping has to survive it. */
  held: string | null;
  loops: number;
}

const calls = new Map<string, MenuCall>();
const runs: MenuRun[] = [];

export function menuRunFor(callSid: string): MenuRun | null {
  return calls.get(callSid) || runs.find((r) => r.callSid === callSid) || null;
}
export function menuLastRun(): MenuRun | null { return runs[0] || calls.values().next().value || null; }

/** THE MENU'S OWN VOICE, and it is not Staff's. Anyone listening back has to be able to tell the
 *  recording from the person, which is the entire thing these tests are about. Same voice id and the
 *  same settings on every call, so the clip cache hands back identical bytes every time. */
async function menuVoice(): Promise<string> {
  return ((await getSetting("robot_voice_menu")) || "EXAVITQu4vr4xnSDxMaL").trim();
}
const MENU_TUNING = { stability: 0.75, similarity_boost: 0.75 };

/** Record every line this call can play, once, and measure each one off its own bytes. */
async function buildLines(texts: string[], voiceId: string, clips: Map<string, Buffer>): Promise<Line[] | null> {
  const out: Line[] = [];
  for (const text of texts) {
    let audio = clips.get(text) || null;
    if (!audio) {
      audio = await mp3Clip(voiceId, text, MENU_TUNING);
      if (!audio) return null;
      clips.set(text, audio);
    }
    out.push({ text, secs: mp3Seconds(audio) });
  }
  return out;
}

const playXml = (sid: string, text: string) =>
  `<Play>https://${HOST}/robot/menu-clip?call=${encodeURIComponent(sid)}&amp;line=${encodeURIComponent(text)}</Play>`;
export const ringXml = (secs: number) => `<Play>https://${HOST}/robot/ring?secs=${secs}</Play>`;
/** Listen for a key AND for speech, for as long as the owner said. The scenes' own listening window
 *  hears speech only, which is exactly why pressing 2 used to do nothing at all. */
const gatherXml = (sid: string, inner: string, secs: number) =>
  `<Gather input="dtmf speech" numDigits="1" speechTimeout="auto" timeout="${secs}" ` +
  `action="https://${HOST}/robot/menu?call=${encodeURIComponent(sid)}" method="POST">${inner}</Gather>` +
  `<Redirect method="POST">https://${HOST}/robot/menu?call=${encodeURIComponent(sid)}&amp;silent=1</Redirect>`;

export function menuClip(callSid: string, line: string): Buffer | null {
  return calls.get(callSid)?.clips.get(line) || null;
}

const atSec = (c: MenuCall) => Math.round((Date.now() - c.startedAt) / 1000);

/** Read the current phase from `idx` to its end, inside one listening window. */
function readXml(c: MenuCall): string {
  const lines = c.phase === "greeting" ? c.greeting : c.options;
  const rest = lines.slice(c.idx);
  for (const l of rest) c.said.push({ text: l.text, atSec: atSec(c), voice: "menu" });
  c.sentMs = Date.now();
  // The greeting runs straight into the options, so it waits only while it is speaking; the options
  // wait the owner's six seconds after they finish, and then the whole list plays again.
  return gatherXml(c.callSid, rest.map((l) => playXml(c.callSid, l.text)).join(""), c.phase === "options" ? NO_PRESS_SEC : 1);
}

/** WHICH LINE WAS PLAYING when the key landed, off the length of the lines we handed out and the
 *  second the key came back. Also says whether the reading had already finished — "before the options
 *  finish" is the whole of the ignored-press variant. */
function lineAtPress(c: MenuCall): { idx: number; early: boolean } {
  const lines = c.phase === "greeting" ? c.greeting : c.options;
  let elapsed = (Date.now() - c.sentMs) / 1000;
  for (let i = c.idx; i < lines.length; i++) {
    if (elapsed < lines[i].secs) return { idx: i, early: true };
    elapsed -= lines[i].secs;
  }
  return { idx: lines.length, early: false };
}

/** The whole list again, from the top of the options. */
function backToTheTop(c: MenuCall): string {
  c.phase = "options"; c.idx = 0; c.held = null;
  if (++c.loops > MAX_LOOPS) { close(c); return "<Hangup/>"; }
  return readXml(c);
}

function close(c: MenuCall): void {
  c.endedAt = Date.now();
  calls.delete(c.callSid);
  if (!runs.some((r) => r.callSid === c.callSid)) { runs.unshift(c); while (runs.length > 40) runs.pop(); }
}

/** What one turn of the menu comes back as. A desk answering is handed to the caller rather than
 *  played here, because who answers and what they say next is the Staff scenes' business. */
export type MenuTurn =
  | { twiml: string }
  | { desk: { key: string; rings: number; ringTwiml: string; answers: string; staffTakeOver: boolean } };

/** Everything the key table can say, turned into what the caller hears. */
async function landOn(c: MenuCall, key: string, where: KeyLanding): Promise<MenuTurn> {
  const note = (what: string) => { const k = c.keys[c.keys.length - 1]; if (k) k.acted = what; };
  if (where.kind === "again") { note("the options again"); return { twiml: twiml(backToTheTop(c)) }; }
  if (where.kind === "ringout") {
    // Nobody picks up, and the menu takes us back rather than leaving us on a dead line.
    note(`${where.rings} rings, nobody answers`);
    return { twiml: twiml(ringXml(ringSecs(where.rings)) + backToTheTop(c)) };
  }
  if (where.kind === "read") {
    // A recording, in the menu's own voice, and then the options again from the top.
    note(where.says);
    let audio = c.clips.get(where.says) || null;
    if (!audio) { audio = await mp3Clip(await menuVoice(), where.says, MENU_TUNING); if (audio) c.clips.set(where.says, audio); }
    c.said.push({ text: where.says, atSec: atSec(c), voice: "menu" });
    const line = audio ? playXml(c.callSid, where.says) : "";
    return { twiml: twiml(line + backToTheTop(c)) };
  }
  // A DESK. The rings are the real ringback cadence, so the check's own ear counts them exactly the
  // way it counts a transfer, and then somebody picks up.
  note(where.answers);
  c.desk = { key, answers: where.answers, rings: where.rings, staffTakeOver: where.staffTakeOver };
  if (where.staffTakeOver) {
    // THE FRONT OF THE STORE, which is the right department. The menu is finished: the rings and the
    // desk's own line are handed to the caller, and the robot's Staff scenes carry the call from there
    // exactly as they do on every other check.
    c.phase = "desk";
    close(c);
    return { desk: { key, rings: where.rings, ringTwiml: ringXml(ringSecs(where.rings)), answers: where.answers, staffTakeOver: true } };
  }
  // A DESK THAT IS NOT THE ONE WE WANT. The owner's script gives it one line and no more, so it says
  // that line and then holds the line, quiet. Putting a conversation in its mouth would be inventing
  // words he never approved, and this desk exists to be the wrong one.
  c.phase = "holding"; c.heldFor = 0;
  let audio = c.clips.get(where.answers) || null;
  if (!audio) { audio = await mp3Clip(await menuVoice(), where.answers, MENU_TUNING); if (audio) c.clips.set(where.answers, audio); }
  c.said.push({ text: where.answers, atSec: atSec(c), voice: "menu" });
  const line = audio ? playXml(c.callSid, where.answers) : "";
  return { twiml: twiml(ringXml(ringSecs(where.rings)) + line + holdXml(c)) };
}

/** A desk holding the line: listening, saying nothing. */
const holdXml = (c: MenuCall) => gatherXml(c.callSid, "", 10);

/** Which menu this call plays, or null when the menu is switched off and the scenes answer directly
 *  the way they always have. */
export async function menuPick(): Promise<MenuVariant | null> {
  const raw = ((await getSetting("robot_menu")) || "").trim().toLowerCase();
  if (!raw || raw === "off") return null;
  return isMenuVariant(raw) ? raw : null;
}

/**
 * A call lands on the robot's number and the menu is switched on. Records every line it can play,
 * measures each one, then greets.
 */
export async function robotMenuAnswer(callSid: string, variant: MenuVariant): Promise<string> {
  const existing = calls.get(callSid);
  if (existing) return twiml(readXml(existing));   // the phone company refetched the same document
  const voiceId = await menuVoice();
  const clips = new Map<string, Buffer>();
  const greeting = await buildLines(GREETING, voiceId, clips);
  const options = await buildLines(optionsFor(variant), voiceId, clips);
  if (!greeting || !options) { console.error("[robot-menu] clip synthesis failed — check ElevenLabs credits"); return twiml("<Hangup/>"); }
  const c: MenuCall = {
    callSid, variant, startedAt: Date.now(), greeting, options, clips,
    phase: "greeting", idx: 0, sentMs: Date.now(), held: null, loops: 0, said: [], keys: [],
  };
  calls.set(callSid, c);
  setTimeout(() => { const live = calls.get(callSid); if (live) close(live); }, 15 * 60 * 1000);
  console.log(`[robot-menu] answering with the "${variant}" menu (${MENU_VARIANTS[variant]})`);
  return twiml(readXml(c));
}

/**
 * One turn of the menu: a key, a spoken word, or nothing at all. Returns null when this call is not
 * the menu's, so the caller can fall through to the scenes.
 */
export async function robotMenuStep(callSid: string, digits: string, speech: string): Promise<MenuTurn | null> {
  const c = calls.get(callSid);
  if (!c) return null;
  void speech;              // the menu answers to keys; what a caller says to it is not a choice
  const key = (digits || "").trim().slice(0, 1);

  // A DESK THAT ANSWERED AND HAS NOTHING MORE TO SAY holds the line and stays quiet. It never goes
  // back to the menu: somebody picked up, and a person does not turn back into a phone system.
  if (c.phase === "holding") {
    c.heldFor = (c.heldFor ?? 0) + 1;
    if (c.heldFor >= 5) { close(c); return { twiml: twiml("<Hangup/>") }; }
    return { twiml: twiml(holdXml(c)) };
  }

  if (!key) {
    // NOTHING PRESSED. During the greeting that just means the greeting finished, so the options
    // start — and a key held from the greeting acts the moment they do. After the options it is the
    // owner's six seconds, and the whole list plays again from the top.
    if (c.phase === "greeting") {
      const held = c.held;
      c.phase = "options"; c.idx = 0; c.held = null;
      if (held) {
        const where = keyTable(c.variant, held);
        c.keys.push({ key: held, atSec: atSec(c), early: true, held: true, acted: "" });
        if (where) return landOn(c, held, where);
        c.keys[c.keys.length - 1].acted = "the options again";
      }
      return { twiml: twiml(readXml(c)) };
    }
    return { twiml: twiml(backToTheTop(c)) };
  }

  const at = lineAtPress(c);
  // DURING THE GREETING: remembered, not acted on, and the greeting carries on from the line it was
  // cut off in the middle of.
  if (c.phase === "greeting") {
    c.held = key;
    c.idx = Math.min(at.idx, c.greeting.length - 1);
    return { twiml: twiml(readXml(c)) };
  }
  // A PRESS BEFORE THE OPTIONS FINISH, on the variant that swallows one: it does nothing at all and
  // the menu reads on from the line it was cut off in the middle of.
  if (c.variant === "press_ignored" && at.early) {
    c.keys.push({ key, atSec: atSec(c), early: true, held: false, acted: "swallowed, the menu read on" });
    c.idx = Math.min(at.idx, c.options.length - 1);
    return { twiml: twiml(readXml(c)) };
  }
  c.keys.push({ key, atSec: atSec(c), early: at.early, held: false, acted: "" });
  const where = keyTable(c.variant, key);
  // A KEY THE OWNER'S TABLE DOES NOT LIST. His script has no words for one, so nothing is announced
  // and the options play again from the top.
  if (!where) { c.keys[c.keys.length - 1].acted = "the options again"; return { twiml: twiml(backToTheTop(c)) }; }
  return landOn(c, key, where);
}

/** The line dropped. */
export function robotMenuEnded(callSid: string): void {
  const c = calls.get(callSid);
  if (c) close(c);
}

/** Test-only: stand a menu up with no synthesis, no database and no phone. What is proved here is the
 *  WORDS, the ORDER, and which key leads where; the audio route is proved by a real call. Every line
 *  is given the same made-up length so a test can say exactly when a key lands. */
export function _menuRig(variant: MenuVariant, opts: { lineSecs?: number } = {}): { callSid: string; first: string } {
  const secs = opts.lineSecs ?? 3;
  const callSid = `rig:menu:${variant}:${runs.length}:${calls.size}:${Math.round(Math.random() * 1e6)}`;
  const line = (text: string): Line => ({ text, secs });
  const c: MenuCall = {
    callSid, variant, startedAt: Date.now(),
    greeting: GREETING.map(line), options: optionsFor(variant).map(line), clips: new Map(),
    phase: "greeting", idx: 0, sentMs: Date.now(), held: null, loops: 0, said: [], keys: [],
  };
  calls.set(callSid, c);
  return { callSid, first: twiml(readXml(c)) };
}
/** Test-only: pretend this many seconds of the document we just handed out have played. */
export function _menuElapsed(callSid: string, secs: number): void {
  const c = calls.get(callSid); if (c) c.sentMs = Date.now() - secs * 1000;
}
export function _menuState(callSid: string): MenuRun | null { return menuRunFor(callSid); }
export function _menuEnd(callSid: string): void { calls.delete(callSid); }

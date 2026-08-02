// THE ROBOT STORE, DRIVEN WITHOUT A PHONE.
//
// The robot's whole value is that its words are known exactly, so this file holds those words a
// SECOND time, typed out from `docs/team/voice-actually-talk` corpus rows via the spec
// (docs/specs/robot-store/README.md §3) and compared against what the engine really plays. If someone
// "improves" a line into better English, this fails. That is the point: the mess is the test.
//
// It also proves the SHAPE of each scene — the greeting is always the first thing said and always on
// its own, the 45 second walk to the shelf is 45 and silent, the one that never comes back never
// comes back, the one that cannot hear us hangs up without ever listening, and the transfer really
// rings before a different person speaks.
//
// Run: npx tsx scripts/test-robot-store.ts     (no network, no database, no cost)
import { _robotRig, robotStep, robotScene, ROBOT_GREETINGS, ROBOT_SCENES, ringbackWav, parseRobotPick } from "../src/calls/tapedeck";

let bad = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const fail = (m: string) => { console.error("  ✗ " + m); bad++; };
const is = (got: unknown, want: unknown, m: string) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : fail(`${m}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`));

/** Drive one scene to the end, answering every listen with `heard`. Returns every TwiML document. */
function walk(scenario: number, greetingIndex = 0, heard = "Hi, do you have any Pokemon cards in stock?") {
  const { callSid, first, run } = _robotRig(scenario, greetingIndex);
  const docs = [first];
  for (let i = 0; i < 12 && /<Gather/.test(docs[docs.length - 1]); i++) docs.push(robotStep(callSid, heard));
  return { docs, run, all: docs.join(""), callSid };
}
const pauses = (xml: string) => [...xml.matchAll(/<Pause length="(\d+)"\/>/g)].map((m) => Number(m[1]));

// ---- 1. THE WORDS. Typed out again here, from the spec, and compared to what really plays. ----
const WORDS: Record<number, string[]> = {
  1: ["Yeah.", "We do."],
  2: ["We did not."],
  3: ["No, I'm sorry. I haven't seen any yet."],
  4: ["No, we don't have any this, this shipment."],
  5: ["Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front and see. Okay, let me just put you on hold.",
      "Okay, thank you for holding. Yeah, I did not see any, unfortunately."],
  6: ["Um, give me just a second. Let me double-check."],
  7: ["We did, but it's not out yet, so... uh, or I don't think it's out. Let me see.",
      "It's like a box with, like, three packs in it, I think, or something like that."],
  8: ["We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment.", "Yeah, we've got a few."],
  9: ["I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye."],
  10: ["Okay. Transferring you now.", "Sporting goods, this is Dana.", "We did not."],
};
const GREETINGS = [
  "Larry Vasquez, how can I help you?",
  "Thanks for calling MVP's. Can I help you?",
  "Good morning, MVP's Woodland Hills. How can I help today?",
  "Mm-hmm. Hello?",
  "Hi, how can I help you? Hello?",
];

console.log("\n── the greetings are the real ones, word for word ──");
is(ROBOT_GREETINGS, GREETINGS, "all five greetings match the spec exactly");
console.log("\n── every scene says exactly what a real person said ──");
for (const scene of ROBOT_SCENES) {
  const { run } = walk(scene.n, 0);
  const spoken = run.said.map((s) => s.text);
  const wantGreeting = scene.greeting || GREETINGS[0];
  is(spoken[0], wantGreeting, `scene ${scene.n}: the greeting is the FIRST thing said`);
  is(spoken.slice(1), WORDS[scene.n], `scene ${scene.n} (${scene.name}): the answers are verbatim`);
}

console.log("\n── the greeting is its own line, never welded to an answer ──");
for (const scene of ROBOT_SCENES) {
  const { docs, run } = walk(scene.n, 0);
  // Whatever comes after the greeting, a real gap comes first — a listen or a silence. Two clips back
  // to back with nothing between them is the fault that reaches the transcriber as one welded line.
  const after = docs[0].slice(docs[0].indexOf("</Play>") + 7);
  const nextPlay = after.indexOf("<Play"), gap = after.search(/<Gather|<Pause/);
  if (nextPlay < 0 || (gap >= 0 && gap < nextPlay)) ok(`scene ${scene.n}: a real gap follows the greeting, so it can never weld to the next line`);
  else fail(`scene ${scene.n}: a second clip plays straight after the greeting with no gap — that is the welded-line fault`);
  if (run.said[0].atSec <= 1) ok(`scene ${scene.n}: it is said first, at ${run.said[0].atSec}s`);
  else fail(`scene ${scene.n}: the greeting was not the first thing on the call`);
}

console.log("\n── every greeting rotates in, and each one still leads ──");
for (let g = 0; g < ROBOT_GREETINGS.length; g++) {
  const { run } = walk(1, g);
  is(run.said[0].text, GREETINGS[g], `greeting ${g + 1} leads the call`);
}

console.log("\n── the two that break us most ──");
{
  const { all, run } = walk(5, 0);
  const p = pauses(all);
  if (p.includes(45)) ok("scene 5: the walk to the shelf is 45 seconds"); else fail(`scene 5: the hold is ${p.join("/")}s, not 45`);
  if (!/<Play>[^<]*hold/i.test(all) && !/music/i.test(all)) ok("scene 5: the hold is SILENCE, no music"); else fail("scene 5: something is playing during the hold");
  is(run.said.length, 3, "scene 5: greeting, the walk away, then the answer they came back with");
}
{
  const { all, run, docs } = walk(6, 0);
  const p = pauses(all);
  const held = p.filter((n) => n >= 30).reduce((a, b) => a + b, 0);
  if (held >= 120) ok(`scene 6: never comes back — ${held}s of nothing, the real one ran 121`); else fail(`scene 6: only ${held}s of silence`);
  if (/<Hangup\/>/.test(docs[docs.length - 1])) ok("scene 6: the line finally dies"); else fail("scene 6: no ending at all");
  is(run.said.length, 2, "scene 6: they say they will check and are never heard from again");
}
{
  const { all } = walk(8, 0);
  if (pauses(all).includes(30)) ok("scene 8: 30 seconds before they come back with the yes"); else fail("scene 8: the 30 second gap is missing");
}

console.log("\n── cannot hear us, and the wrong department ──");
{
  const { all, docs } = walk(9, 0);
  const s9 = robotScene(9);
  is(s9?.greeting, "Hi, how can I help you? Hello?", "scene 9 always opens on the line that cannot hear us");
  if (!/<Gather/.test(all)) ok("scene 9: never listens at all — they talk into silence and leave"); else fail("scene 9: it waited for us, which is not what really happened");
  if (pauses(all).includes(3)) ok("scene 9: three seconds of nothing before they give up"); else fail("scene 9: the three second wait is missing");
  if (/<Hangup\/>/.test(docs[docs.length - 1])) ok("scene 9: they hang up on us"); else fail("scene 9: nobody hung up");
}
{
  const { all, run } = walk(10, 0);
  is(run.greeting, "MVP's pharmacy, this is Larry.", "scene 10 opens in the wrong department, with his name");
  if (/\/robot\/ring\?secs=6/.test(all)) ok("scene 10: the desk really rings for 6 seconds"); else fail("scene 10: no ringing before the new voice");
  const voices = run.said.map((s) => s.voice);
  is(voices, ["staff", "staff", "transfer", "transfer"], "scene 10: a DIFFERENT person picks up after the transfer");
}

console.log("\n── the ringing is a real ringback, not a beep ──");
{
  const w = ringbackWav(6);
  is(w.subarray(0, 4).toString(), "RIFF", "it is a playable wav");
  is(w.readUInt32LE(24), 8000, "8kHz, the only rate a phone line carries");
  // Published US cadence: two seconds of tone, four of silence. Sample inside each half and compare.
  const at = (sec: number) => Math.abs(w.readInt16LE(44 + Math.round(sec * 8000) * 2));
  let loud = 0, quiet = 0;
  for (let i = 0; i < 200; i++) { loud = Math.max(loud, at(0.5 + i / 400)); quiet = Math.max(quiet, at(3 + i / 400)); }
  if (loud > 2000 && quiet === 0) ok(`two seconds of tone then four of silence (tone ${loud}, gap ${quiet})`);
  else fail(`not the published cadence (tone ${loud}, gap ${quiet})`);
}

console.log("\n── which scene the next call plays ──");
is(parseRobotPick("7"), { scenario: 7, greeting: null }, "a scene on its own rotates its greeting");
is(parseRobotPick("7:2"), { scenario: 7, greeting: 2 }, "a scene can pin its greeting so a run repeats exactly");
is(parseRobotPick("99").scenario, 1, "an unknown scene falls back to the first, never to nothing");
is(parseRobotPick(null).scenario, 1, "an unset scene falls back to the first");

console.log("\n── the verdict each scene should produce ──");
is(ROBOT_SCENES.map((s) => `${s.n}:${s.expect}`), [
  "1:in_stock", "2:not_in_stock", "3:not_in_stock", "4:not_in_stock", "5:not_in_stock",
  "6:no_clear_answer", "7:in_stock", "8:in_stock", "9:nobody_answered", "10:not_in_stock",
], "scenes 7 and 8 expect IN STOCK — the two we really got wrong");

// ---- THE TEST OF THE TEST -----------------------------------------------------------------------
// A comparison that has never failed has never been tested. These are the exact shapes our own
// history produced, fed to the harness's comparison to prove it says NO to every one of them.
console.log("\n── the word comparison really fails on our own past faults ──");
{
  const { compareWords } = await import("./robot-check.mjs");
  const said = [{ text: "Thanks for calling MVP's. Can I help you?" }, { text: "We did not." }];
  const clean = ["Clerk: Thanks for calling MVP's. Can I help you?", "Agent: Do you have any Pokemon cards?", "Clerk: We did not."];
  is(compareWords(said, clean).misses.length, 0, "a clean, correct record passes");

  // The 08-01 fault: held audio handed over in one burst came back as DIFFERENT WORDS.
  const misheard = ["Clerk: Hi, do you recall MVP's? Can I help you?", "Clerk: We did not."];
  const m1 = compareWords(said, misheard);
  if (m1.misses.length) ok(`wrong words are caught (${m1.misses[0].how})`); else fail("a misheard greeting passed — this is the 08-01 fault going straight through");

  // Four turns welded into one line with no space between them (check 114).
  const welded = ["Clerk: Thanks for calling MVP's. Can I help you?We did not."];
  const m2 = compareWords(said, welded);
  if (m2.misses.length) ok(`two turns welded into one line are caught (${m2.misses.map((x) => x.how).join(", ")})`);
  else fail("a welded line passed — the greeting fused to the answer would ship green");

  // "CVS" written down as "CBS", as "CDS there", as "Seabass" — a name mangled beyond recognition.
  const mangled = ["Clerk: Thanks for calling CBS. Can I help you?", "Clerk: We did not."];
  if (compareWords(said, mangled).misses.length) ok("a mangled store name is caught"); else fail("a mangled name passed");

  // Punctuation belongs to whoever wrote it down, not to the person who spoke. A full stop where a
  // comma belongs, and an apostrophe in a name, are the same words — a real check wrote "MVPs" for
  // "MVP's" and the comparison must not call that a mishearing.
  const written = ["Clerk: Thanks for calling MVPs. Can I help you?", "Clerk: We did not."];
  if (compareWords(said, written).misses.length === 0) ok("an apostrophe and a full stop are the writer's, not the speaker's");
  else fail("\"MVPs\" written for \"MVP's\" was called a mishearing — the comparison is too strict to use");

  // Nothing recorded at all.
  if (compareWords(said, []).misses.length === 2) ok("an empty record fails every line, never passes by default"); else fail("an empty record slipped through");
}

console.log(bad ? `\nrobot store: ${bad} FAILED\n` : "\nrobot store: all held\n");
process.exit(bad ? 1 : 0);

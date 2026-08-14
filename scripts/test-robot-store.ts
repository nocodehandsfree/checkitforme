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
import { _robotRig, robotStep, robotScene, ROBOT_GREETINGS, ROBOT_SCENES, ROBOT_CLIPS, ringbackWav, parseRobotPick } from "../src/calls/tapedeck";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const ok = (m: string) => console.log("  ✓ " + m);
const fail = (m: string) => { console.error("  ✗ " + m); bad++; };
const is = (got: unknown, want: unknown, m: string) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : fail(`${m}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`));

/** Drive one scene to the end, answering every listen with `heard`. Returns every TwiML document. */
function walk(scenario: number, greetingIndex = 0, heard = "Hi, do you have any Pokemon cards in stock?") {
  const { callSid, first, run } = _robotRig(scenario, greetingIndex);
  const docs = [first];
  for (let i = 0; i < 24 && /<Gather/.test(docs[docs.length - 1]); i++) docs.push(robotStep(callSid, heard));
  return { docs, run, all: docs.join(""), callSid };
}
const pauses = (xml: string) => [...xml.matchAll(/<Pause length="(\d+)"\/>/g)].map((m) => Number(m[1]));

// ---- 1. THE WORDS. Typed out again here, from the spec, and compared to what really plays. ----
const WORDS: Record<number, string[]> = {
  // The answer line is spec-approved, not corpus (owner 08-05): "We do." answered the set question
  // with nothing a human would say there, and "one fifty one" transcribes as "151" and failed the
  // word row forever. Pitch Black, deliberately not the Chaos Rising in Charlie's own example.
  1: ["Yeah.", "Uh yeah, it's the Pitch Black booster boxes."],
  // Every clear no now carries the line Charlie's follow-up needs, or the check dies with no
  // goodbye. Three shapes on purpose: a real day, a vague soon, an honest I do not know.
  // The third line is the owner's 08-07 fix: naming a day makes Charlie ask what TIME, and these
  // scenes had nothing left to say, so the check ended on OUR question. Scene 3 says "soon", which
  // is neither a day nor a time, so section 58 has him ask for both once more.
  2: ["We did not.", "Uh, probably Tuesday, that's when the truck comes.", "Uh, morning usually, before we open."],
  3: ["No, I'm sorry. I haven't seen any yet.", "Not sure, honestly. Soon, I'd think.", "Maybe end of the week? I really couldn't say what time."],
  4: ["No, we don't have any this, this shipment.", "I really don't know, they don't tell us."],
  5: ["Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front and see. Okay, let me just put you on hold.",
      "Okay, thank you for holding. Yeah, I did not see any, unfortunately.", "Uh, next week maybe? I'm not certain.",
      "No idea on the time, sorry. Whenever they drop them off."],
  6: ["Um, give me just a second. Let me double-check."],
  7: ["We did, but it's not out yet, so... uh, or I don't think it's out. Let me see.",
      "It's like a box with, like, three packs in it, I think, or something like that.",
      // The set still has no name after the type answer, so he asks for the missing half once and
      // this scene had nothing left to say (the 08-07 sweep: every scene has Staff ANSWERING).
      "Uh, Pitch Black, I want to say? Something like that."],
  8: ["We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment.", "Yeah, we've got a few.", "Uh, the Pitch Black boxes I think."],
  9: ["I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye."],
  // REWRITTEN 08-07. This scene could never test its own card: the robot moved us on before Charlie
  // ever had a turn, so the ask that IS the card never happened (check 332 has no such line). The
  // wrong department is stated now, and then the robot WAITS. That empty turn is the test.
  10: ["Oh, that's not us, that's the front.", "Sure, one sec, I'll put you through.",
       "Sporting goods, this is Dana.", "We did not.", "Thursdays, usually.",
       "Early, before we open, usually."],
  // The owner's own check 298, made repeatable. Corpus throughout: the pause line is scene 6's,
  // "Hello? Hello?" is Barnes & Noble Calabasas, the answer is scene 3's.
  11: ["Um, give me just a second. Let me double-check.", "Hello?", "Hello? Hello?", "No, I'm sorry. I haven't seen any yet.",
      "Not sure, honestly. Soon, I'd think.", "Maybe end of the week? I really couldn't say what time."],
  // The nine cards that had no scene at all. The two hold recordings are scenes 20 to 24 now.
  // REWRITTEN 08-07: the 90 second ring is the ring AFTER A TRANSFER that nobody ever comes back
  // from, which is where our own give-up really has to fire. Ringing from the first dial is the
  // carrier's no-answer, and that never reaches our engine at all.
  12: ["Oh, that's not us, that's the front.", "Sure, hold on, I'll put you through."],
  13: ["Oh, Pokemon cards, yeah. We get a ton of calls about those, honestly.",
       "You know my nephew collects them. He's got a whole binder, must be hundreds.",
       "There was a guy in here last week, bought like twenty packs at once. Twenty.",
       "It's been nuts since all the trading card stuff took off again, I'll tell you that.",
       "We used to only carry the sports ones, back when I started here.",
       "Anyway, what was it you were after? Sorry, it's been one of those days.",
       "Right, right. Hang on, my manager's waving at me about something.",
       "Sorry about that. Where were we? Busy in here today.",
       "Anyway, what was it you were after? Sorry, it's been one of those days.",
       "Right, right. Hang on, my manager's waving at me about something.",
       "Sorry about that. Where were we? Busy in here today.",
       "Anyway, what was it you were after? Sorry, it's been one of those days.",
       "Right, right. Hang on, my manager's waving at me about something.",
       "Sorry about that. Where were we? Busy in here today."],
  14: ["Oh, one sec, let me grab someone.", "This is Maria, what can I do for you?", "Yeah, we've got some.", "The Pitch Black boxes."],
  15: ["Oh, that's not us, that's the front.", "There's nobody up there right now, sorry."],
  16: ["That's the front, I can't see those from back here.", "Yeah, sorry, I really can't help you with that from back here."],
  17: [],
  18: ["Sí, tenemos algunos.", "Son las cajas de Pitch Black."],
  19: ["Uh, Pokemon, yeah, we've got some stuff.", "Oh, the Pitch Black boxes? Yeah, we've got a couple of those."],
  // ROUND TWO, 08-07. Three shapes of hold music, two rooms, Delta switched off, and the runaround.
  // Every one of them ends with a person answering, because a scene that leaves Charlie asking into
  // nothing runs the check to full length and proves nothing.
  20: ["Sure, let me check on that for you, one moment.", "Yeah, we've got some in.", "It's the Pitch Black boxes."],
  21: ["Hang on, let me go and see for you.", "Yeah, we do have those in.", "The Pitch Black booster boxes."],
  22: ["One moment, I'll go and have a look.", "Yeah, we've got a few of those.", "Pitch Black, the booster boxes."],
  23: ["Hold on, let me go look.", "Yeah, we've got a couple.", "I think they're the Pitch Black ones."],
  24: ["Let me put this down a sec and go check.", "Yeah, there's some on the shelf.", "The Pitch Black boxes, I think they are."],
  25: ["Yeah, we've got some of those in.", "Uh, the Pitch Black booster boxes."],
  26: ["Pokemon cards? Uh, that's not really us back here.",
       "Yeah, no, I can't see the shop floor from the pharmacy, sorry.",
       "Sure, hold on, let me see who's up there.",
       "Hi, sorry, I'll be right with you, one second.",
       "Sorry about that. How can I help you?",
       "Let me go and have a look for you."],
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
  // The scene where nobody picks up says NOTHING, greeting included. That is the whole test.
  if (scene.neverAnswers) {
    is(spoken, [], `scene ${scene.n} (${scene.name}): nobody picks up, so not one word is ever said`);
    continue;
  }
  const wantGreeting = scene.greeting || GREETINGS[0];
  is(spoken[0], wantGreeting, `scene ${scene.n}: the greeting is the FIRST thing said`);
  is(spoken.slice(1), WORDS[scene.n], `scene ${scene.n} (${scene.name}): the answers are verbatim`);
}

console.log("\n── the greeting is its own line, never welded to an answer ──");
for (const scene of ROBOT_SCENES) {
  if (scene.neverAnswers) continue;   // no greeting to weld anything to
  const { docs, run } = walk(scene.n, 0);
  // Whatever comes after the greeting, a real gap comes first — a listen or a silence. Two clips back
  // to back with nothing between them is the fault that reaches the transcriber as one welded line.
  const after = docs[0].slice(docs[0].indexOf("</Play>") + 7);
  // A SPOKEN line, not any sound: the beep at the end of a voicemail greeting is a tone, and a
  // tone cannot weld two sentences into one because there is only one sentence.
  const nextPlay = after.indexOf("<Play>https://" ) >= 0 ? after.search(/<Play>[^<]*\/robot\/clip/) : -1;
  const gap = after.search(/<Gather|<Pause/);
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
  is(run.said.length, 5, "scene 5: greeting, the walk away, the answer they came back with, when more are coming, and what time");
  // Once they have answered they WAIT for us to say goodbye, the way a real person does. A store that
  // puts the phone down instantly would hide a caller who never signs off (owner, 08-02).
  const listens = (all.match(/<Gather/g) || []).length;
  if (listens >= 5) ok(`scene 5: it waits for us to sign off (${listens} chances to speak before it gives up)`);
  else fail(`scene 5: only ${listens} chances to speak — it hangs up before a goodbye can happen`);
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
  is(voices, ["staff", "staff", "staff", "transfer", "transfer", "transfer", "transfer"], "scene 10: a DIFFERENT person picks up after the transfer, and stays on");
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
  "6:left_on_hold", "7:in_stock", "8:in_stock", "9:nobody_answered", "10:not_in_stock",
  // Scene 13 moved off the 4 minute limit onto its own wrap-up card (owner 08-07), so it no longer
  // ends by us hanging up: Charlie asks once more, takes what he gets and closes on no clear answer.
  // "No clear answer" is the owner's NEW status (08-07) and NOT a rename of Couldn't tell. Both of
  // these scenes talk to us clearly and never answer, which is exactly what it is for; Couldn't tell
  // stays for a check where we could not make out what the person was saying.
  "11:not_in_stock", "12:nobody_answered", "13:no_straight_answer", "14:in_stock", "15:too_busy",
  "16:no_straight_answer", "17:voicemail", "18:in_stock", "19:in_stock",
  // ROUND TWO (owner 08-07). The three hold-with-music shapes and the two rooms all end with a
  // person answering, so all five are IN STOCK: what they test is the METER, never the answer.
  // 25 is Delta switched off, which changes who asks the question and nothing else about the store.
  // 26 is the runaround, and the only thing that can end it is our own four minute limit.
  "20:in_stock", "21:in_stock", "22:in_stock", "23:in_stock", "24:in_stock", "25:in_stock",
  "26:admin_hangup",
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

// ---- THE OWNER'S ROUND TWO RULE, ON EVERY SCENE ------------------------------------------------
// "Every scene has Staff answering. The only exceptions are the tests that exist to see how Charlie
// behaves when Staff walk off or never pick up. A scene that leaves him asking into nothing runs the
// check to full length and proves nothing. Check EVERY scene." (owner, 08-07.)
//
// Read off the acts, so it holds for a scene nobody has written a word table for yet. Every scene
// that ends by waiting for our goodbye must have a Staff line as the LAST thing before that wait: a
// listen there is Charlie asking into an empty room, and we pay for the rest of the check.
console.log("\n── every scene has Staff answering (the owner's rule, 08-07) ──");
{
  // The four that exist to prove exactly the opposite. Named one by one, because "it probably meant
  // to do that" is how a broken scene stays broken.
  const WALK_OFF: Record<number, string> = {
    6: "Staff walk away and never come back",
    9: "Staff cannot hear us and hang up",
    12: "the desk they transfer us to only ever rings",
    17: "a machine answers, so Charlie is never switched on",
    26: "they go to look and never come back, which is what reaches the four minute limit",
  };
  for (const scene of ROBOT_SCENES) {
    if (WALK_OFF[scene.n]) { ok(`scene ${scene.n}: exempt on purpose (${WALK_OFF[scene.n]})`); continue; }
    // Strip the trailing wait for our goodbye (four chances to speak, then it gives up).
    let i = scene.acts.length - 1;
    while (i >= 0 && ("hangup" in scene.acts[i] || "listen" in scene.acts[i])) i--;
    const last = scene.acts[i];
    if (last && "say" in last) ok(`scene ${scene.n} (${scene.name}): Staff answer last, so he is never left asking into nothing`);
    else fail(`scene ${scene.n} (${scene.name}): the last thing before the wait is not a Staff line, so Charlie asks into an empty room and the check runs its full length`);
  }
}

// ---- THE COMMITTED RECORDINGS ------------------------------------------------------------------
// The owner picked these himself and approved them by ear. They are NEVER regenerated, so what this
// proves is that the file a scene names really is on disk and really is the one he approved: a
// misspelled name is a 404 mid check, which sounds to the ear exactly like a hold that went wrong.
console.log("\n── the hold recordings the owner picked are the ones the scenes play ──");
{
  for (const [name, c] of Object.entries(ROBOT_CLIPS)) {
    const path = join(process.cwd(), "public/robot-clips", c.file);
    if (existsSync(path) && statSync(path).size > 10000) ok(`${name}: ${c.file} is committed (${c.what})`);
    else fail(`${name}: ${c.file} is missing from public/robot-clips — that scene would play a 404`);
  }
  const named = new Set<string>();
  for (const scene of ROBOT_SCENES) for (const a of scene.acts) if ("clip" in a) named.add(a.clip as string);
  const unknown = [...named].filter((n) => !ROBOT_CLIPS[n]);
  is(unknown, [], "every recording a scene asks for is on the owner's list");
  // VOLUME IS THE TEST on the two room recordings. The ear calls a sound the room rather than the
  // person when it is under `roomFraction` (0.35 of amplitude, which is 9.1 dB) of the voice we have
  // been talking to. Both rooms have to sit further under a speaking voice than that or the phone on
  // the counter proves nothing. The advertising voice is the loudest voice on the list, so it is the
  // fair yardstick: anything quieter would flatter the room clips.
  const voicePeak = -2.7; // 06-ad-voice-female.mp3, measured 08-07
  for (const room of ["busyStore", "busyCafe"]) {
    const under = voicePeak - ROBOT_CLIPS[room].peak;
    if (under >= 9.1) ok(`${room}: ${under.toFixed(1)} dB under a speaking voice, so the ear reads it as the room`);
    else fail(`${room}: only ${under.toFixed(1)} dB under a speaking voice — the ear needs 9.1 or the phone on the counter proves nothing`);
  }
}

// ---- THE RUNAROUND'S HARD RULE -----------------------------------------------------------------
// The owner's own words: no single hold may run 120 seconds, or the hold cap ends the check before
// the four minute cap ever gets a turn, and then this scene quietly tests the wrong thing.
console.log("\n── the runaround reaches the four minute limit, and no single hold reaches the hold cap ──");
{
  const s26 = robotScene(26);
  const waits = (s26?.acts || []).filter((a) => "silence" in a).map((a) => (a as { silence: number }).silence);
  const longest = Math.max(0, ...waits);
  if (longest < 120) ok(`the longest single wait is ${longest}s, ${120 - longest}s clear of the hold cap`);
  else fail(`a single wait runs ${longest}s, which the hold cap ends first — the four minute limit never gets a turn`);
  // His timing: about 30 in the wrong department, 90 for the hold after the transfer, 60 for the new
  // person and the second hold, 20 to ask. About 200 seconds before the last wait even starts.
  const ring = (s26?.acts || []).filter((a) => "ring" in a).map((a) => (a as { ring: number }).ring).reduce((a, b) => a + b, 0);
  const held = waits.reduce((a, b) => a + b, 0) + ring;
  if (held >= 200) ok(`${held}s of the check is spent waiting and ringing, which is what carries it to four minutes`);
  else fail(`only ${held}s of waiting and ringing — this cannot reach the four minute limit`);
}

// ---- THE HONEST ROBOT STORE (owner + PM, 08-08) ------------------------------------------------
// The robot used to play its next answer after two silent listens, so a Charlie who had gone quiet
// still got "Yeah, we've got some in" and the scene looked like a conversation that never happened:
// the test passed while the thing it tests was broken. An ANSWER line only plays after Charlie
// actually spoke; into a silence the robot waits, says "Hello?" once the way a real person checks
// the line, and then just waits. Its own wait-out at the end of a scene still walks through silence
// to the hangup, because waiting out a caller who never says goodbye IS the wait-out.
console.log("\n── an answer only ever follows Charlie actually speaking ──");
{
  const { callSid, run } = _robotRig(1, 0);
  const before = run.said.length;                            // the greeting
  let doc = robotStep(callSid, "");                          // a silent listen: the robot waits
  if (/<Gather/.test(doc) && run.said.length === before) ok("first silence: the robot waits, no answer plays");
  else fail(`first silence: it moved on (said ${run.said.slice(before).map((x) => x.text).join(" | ") || "nothing new"})`);
  doc = robotStep(callSid, "");                              // still nothing: one "Hello?", like a person
  if (run.said.length === before + 1 && run.said[before].text === "Hello?") ok('second silence: one "Hello?", the way a real person checks the line');
  else fail(`second silence: said ${run.said.slice(before).map((x) => x.text).join(" | ") || "nothing"}`);
  doc = robotStep(callSid, "");
  doc = robotStep(callSid, "");
  if (run.said.length === before + 1 && /<Gather/.test(doc)) ok("more silence: it keeps waiting, never a second Hello and never an answer");
  else fail(`more silence: said ${run.said.slice(before).map((x) => x.text).join(" | ")}`);
  // …and the moment Charlie speaks, the scene carries on exactly as scripted.
  robotStep(callSid, "Hi, do you have any Pokemon cards in stock?");
  if (run.said.some((x) => x.text === "Yeah.")) ok("Charlie speaks, and the scripted answer plays as always");
  else fail("Charlie spoke and the answer did not come");
}
console.log("\n── the wait-out still ends in a hangup, silence or not ──");
{
  // Scene 4 has two answers and then the wait-out. Answer both, then go silent: the remaining
  // listens are the robot waiting for our goodbye, and silence may honestly walk through them.
  const { callSid, docs } = ((): { callSid: string; docs: string[] } => {
    const r = _robotRig(4, 0);
    return { callSid: r.callSid, docs: [r.first] };
  })();
  robotStep(callSid, "Hi, do you have any Pokemon cards in stock?");
  robotStep(callSid, "Okay, any idea when you might get more in?");
  let doc = "";
  for (let i = 0; i < 12 && !/<Hangup\/>/.test(doc); i++) doc = robotStep(callSid, "");
  if (/<Hangup\/>/.test(doc)) ok("the robot waits us out and hangs up, exactly as a real person gives up on a silent caller");
  else fail("the wait-out never reached its hangup");
  void docs;
}

console.log(bad ? `\nrobot store: ${bad} FAILED\n` : "\nrobot store: all held\n");
process.exit(bad ? 1 : 0);

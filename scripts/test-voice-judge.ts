// THE ONE JUDGE — is this the store's recording, or a person? Driven on the exact calls that broke
// the engine twice, written as scripts before the judge existed (fix pass 5).
//
// Every wrong answer this file guards against cost the same thing: Staff's own words read as the
// store's menu, or the store's recording read as Staff. Both end with us ringing real people to hang
// up on them, or with a route locked against a recording.
//
// The judge weighs five layers in order and the first confident answer wins:
//   1 the store's own remembered menu — recordings repeat word for word, people never do
//   2 where we are on a mapped route — before the handoff it is the recording, after the ring a person
//   3 the words themselves — press/options/para español is a recording; a reply to us is a person
//   4 the pause — a recording keeps reading, a person stops or asks if we are there
//   5 still unsure = a person, always (the owner's law: every default flips toward a human)
//
// Run: env DATABASE_URL=file:./.t-judge.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-voice-judge.ts
import { judgeVoice, personStartsAt, SoundPrint, heardThisSoundBefore, type JudgeInput } from "../src/calls/listen-nav";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

// The CVS menu this store has played us on every earlier call, in its own words as heard.
const KNOWN = [
  "Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial 911. I am your virtual assistant and calls are recorded to improve call Quality.",
  "To better assist you, are you calling in for pharmacy or front store services?",
  "I can assist you with beauty and fragrance, OTC, health, photo services, and General Store inquiries.",
];
const judge = (o: Partial<JudgeInput> & { text: string }) => judgeVoice({ atSec: 30, ...o });

console.log("\n▶ LAYER 1 — the store's own remembered menu");
{
  // Word for word, the same recording. A person never says the same sentence twice across calls.
  ok(judge({ text: KNOWN[1], knownMenuLines: KNOWN }).who === "recording",
    "a line this store has played before is the recording");
  // The transcriber never writes it the same way twice — the tolerance is the fingerprint's own.
  ok(judge({ text: "to better assist you are you calling in for pharmacy, or front store services", knownMenuLines: KNOWN }).who === "recording",
    "and a differently transcribed hearing of that same line still reads as the recording");
  // A person's words match nothing on file.
  const v = judge({ text: "Hi there, thanks for holding, this is Dana over in the front store, what can I do for you today?", knownMenuLines: KNOWN });
  ok(v.who === "unsure" && v.unknownLine === true, "a line matching nothing we have on file is not the menu, and Echo waits rather than guessing");
  // …but a store that has never been called has nothing to match — layer 1 must not guess.
  ok(judge({ text: "Thanks for calling, please listen carefully as our options have changed.", knownMenuLines: [] }).who === "recording",
    "with nothing remembered, the words themselves still catch an obvious menu");
}

console.log("\n▶ LAYER 2 — where we are on a route we already hold");
{
  ok(judge({ text: "Sure, one moment.", routeHandoffSeen: false, mappedRoute: true }).who === "recording",
    "before the handoff on a mapped route, what we hear is the phone system");
  ok(judge({ text: "Sure, one moment.", routeHandoffSeen: true, ringsHeard: 2, mappedRoute: true }).who === "person",
    "after the desk has rung, it is a person — the same words, the opposite answer");
}

console.log("\n▶ LAYER 3 — the words themselves");
{
  ok(judge({ text: "For the pharmacy press 1, for guest services press 2" }).who === "recording", "a menu of choices is a recording");
  ok(judge({ text: "Para español, oprima nueve." }).who === "recording", "and so is the Spanish option");
  ok(judge({ text: "Please listen carefully as our menu has changed." }).who === "recording", "and so is a menu announcing itself");
  ok(judge({ text: "Yeah we've got a bunch of those in, they're over by the registers.", weSpokeAtSec: 28 }).who === "person",
    "a reply to what we just said is a person");
  ok(judge({ text: "Hello? Are you there?" }).who === "unsure", "somebody asking if we are there SOUNDS like a person, and a hint alone never decides");
  ok(judge({ text: "Hello? Are you there?", pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "it is a person once the silence proves it stopped for us");
}

console.log("\n▶ LAYER 4 — the pause: a recording keeps reading, a person stops");
{
  const unsure = judge({ text: "Just a moment please." });
  ok(unsure.who === "unsure" && unsure.needsPause === true,
    "a line that could be either asks for the pause instead of guessing");
  ok(judge({ text: "Just a moment please.", pauseTested: true, keptTalkingAfterPause: true }).who === "recording",
    "it kept reading through the silence — a recording");
  ok(judge({ text: "Just a moment please.", pauseTested: true, keptTalkingAfterPause: false }).who === "unsure",
    "it stopped, but nothing yet says a person was ever there, so Echo keeps listening");
  ok(judge({ text: "Just a moment please, are you still there?", pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "it stopped AND it was talking to us — that is a person");
}

console.log("\n▶ UNSURE MEANS WAIT, NEVER A GUESS (owner 08-07)");
{
  const v = judge({ text: "Mm-hm.", pauseTested: true, keptTalkingAfterPause: false });
  ok(v.who === "unsure", "a line nothing has settled leaves Echo waiting, it never guesses a person");
  ok(judge({ text: "" }).who !== "recording", "and silence is never called a recording");
}

console.log("\n▶ THE PERSON IS DATED FROM THEIR FIRST WORD");
{
  // THE CALL THAT BROKE IT TWICE: a long hello dodges the short-utterance tests, so the person was
  // stamped a turn late and their own hello sat before the cut — read as one more menu line.
  const steps = [
    { who: "ivr" as const, text: "To better assist you, are you calling in for pharmacy or front store services?", atSec: 26 },
    { who: "us" as const, text: 'said "front store services"', atSec: 29, action: "say" as const, value: "front store services" },
    { who: "ivr" as const, text: "Okay, transferring you now.", atSec: 45 },
    { who: "ivr" as const, text: "Hi there, thanks for holding, this is Dana over in the front store, what can I do for you today?", atSec: 61 },
    { who: "ivr" as const, text: "Hello? Anybody there?", atSec: 68 },
  ];
  ok(personStartsAt(steps, 68, { knownMenuLines: KNOWN }) === 61,
    "the person is dated from their first line, not the turn we finally recognised them");

  // A hello that arrived right after our own words gets JOINED onto the store line it interrupted.
  // Dating the person at that joined line would drag the stamp onto the store's own recording.
  const joined = [
    { who: "ivr" as const, text: "I can assist you with beauty and fragrance, OTC, health, photo services, and General Store inquiries. Hi, this is Sam.", atSec: 40 },
  ];
  const at = personStartsAt(joined, 44, { knownMenuLines: KNOWN });
  ok(at > 40, "a hello joined onto a store line splits — the person is never dated at the recording's own moment");
}

console.log("\n▶ MAPPING NEVER TALKS TO STAFF — Charlie does (fix pass 6)");
{
  const { readFileSync } = await import("node:fs");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/handed the check to Charlie/.test(nav) && /await handToCharlie\(s, atSec\)/.test(nav),
    "reaching a person on a proving check hands the live call to Charlie");
  ok(!/asked: "\$\{q\}"/.test(nav) && !/synthAsk/.test(nav) && !/askAudio/.test(nav),
    "the question mapping used to speak, and its voice, are deleted");
  ok(!/Staff said nothing after the question/.test(nav),
    "and so is mapping's own silence rule — Charlie handles a quiet clerk");
  const srv = readFileSync("src/server.ts", "utf8");
  ok(/setMappingHandoff\(async \(s\) => \{/.test(srv) && /bridge\?room=\$\{s\.id\}/.test(srv),
    "Charlie joins on THE CHECK'S OWN record — no second record, no second way to reach him");
  ok(!/onReceiptClosed\(async \(r\) => \{\s*\n\s*if \(r\.room !== room\)/.test(srv) && !/"map:" \+ s\.id/.test(srv),
    "and the hand-built watcher and its made-up record are gone");
  ok(/s\.confirmResult = wrong \? "redirect"/.test(nav) && /getReceipt\(s\.id\)/.test(nav),
    "mapping only READS what Charlie put on that record: his answer, or the wrong desk");
}

console.log("\n▶ ALPHA AND BRAVO ACT ONLY ON THE EARPIECE'S WORD (fix pass 6, item 1)");
{
  const { readFileSync } = await import("node:fs");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/if \(judgeHere\(s, speech, atSec\)\.who !== "recording"\) return twiml\(gather\(id\)\);/.test(nav),
    "nobody presses and nobody speaks unless a machine is talking — unsure means silent and listening");
  ok(/} else if \(d\.value && s\.lastVerdict !== "recording"\) \{/.test(nav),
    "and a turn where nothing was said is not permission either — only the earpiece's last word is");
  ok(!/if \(verdict\.who === "person" \|\| looksLikeDirectPickup/.test(nav),
    "the cold-pickup overrule beside the judge is gone");
  ok(/if \(d\.action === "human"\) \{\s*\n\s*const v = judgeHere/.test(nav),
    "the model's own 'that was a human' must pass the earpiece");
  ok(!/looksLikeLivePerson\(speech\) \|\| \(\(s\.routingSeen/.test(nav),
    "and the auto-operator branch no longer keeps its own list of person words");
}

console.log("\n▶ UNSURE CAN NEVER BECOME 'MACHINE' THROUGH A SIDE DOOR (fix pass 6, item 2)");
{
  const { readFileSync } = await import("node:fs");
  // Reading back a finished check: the pause never happened, so it is never claimed to have.
  ok(!/pauseTested: true, keptTalkingAfterPause: true/.test(readFileSync("src/calls/mapper.ts", "utf8"))
    && !/pauseTested: true, keptTalkingAfterPause: true/.test(readFileSync("src/calls/navigator.ts", "utf8")),
    "no path feeds the earpiece a made-up 'it kept talking' to force a recording");
  ok(judge({ text: "Just a moment please." }).who === "unsure",
    "so a line that could be either stays UNSURE, and unsure never acts");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/s\.pauseTested = true; s\.pauseStartedAtSec = atSec; s\.keptTalkingAfterPause = undefined;/.test(nav)
    && /s\.lastActTurn = s\.turns; s\.pauseTested = false; s\.keptTalkingAfterPause = undefined;/.test(nav),
    "and the pause memory is cleared per voice — one answer can never settle every later line");
}

console.log("\n▶ WHAT STAFF SAID IS NOT OURS TO JUDGE — we only know somebody is there");
{
  // Them going to look, them handing us elsewhere, their answer: all Charlie's, already built and
  // tuned. Mapping may know a person is on the line, because that is the moment it hands over.
  const v = judge({ text: "Sure, one second.", weAskedAtSec: 64, atSec: 66, routeHandoffSeen: true, ringsHeard: 2, ringAtSec: 60, mappedRoute: true });
  ok(v.who === "person", "it is a person talking, and that is the whole verdict");
  ok(!("waiting" in v) && !("sendingUsAway" in v),
    "no reading of what they said rides along — those were deleted, not moved");
  ok(judge({ text: "Oh, that would be the toy department, let me put you through.", weAskedAtSec: 64, atSec: 67, ringsHeard: 2, ringAtSec: 60 }).who === "person",
    "being handed somewhere else is a person saying it — Charlie reports the wrong department, not us");
}

console.log("\n▶ EVIDENCE ORDER, AND THE PERSON'S CLOCK (fix pass 6, items 3-4)");
{
  // A person-shaped line beats "we are inside the menu we hold": a store can read a line that
  // resembles its own menu, but a recording never talks TO us.
  ok(judge({ text: "Hi, this is Maria, how can I help you?", mappedRoute: true, routeHandoffSeen: false, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "somebody talking to us stops the route rule calling it the menu, and the silence settles it");
  // THE RING IS EVIDENCE, NOT AN OVERRIDE (owner, 08-02). A desk can ring, nobody picks up, and the
  // phone system drops us back into its own menu. A line this store has played before is that menu,
  // ring or no ring — deciding otherwise opened Charlie onto a recording.
  ok(judge({ text: KNOWN[1], knownMenuLines: KNOWN, ringsHeard: 1, ringAtSec: 20 }).who === "recording",
    "a line this store has played before is still its menu, even after the desk rang");
  ok(judge({ text: "Hi, front store, this is Dana.", knownMenuLines: KNOWN, ringsHeard: 1, ringAtSec: 20 }).who === "person",
    "while a voice that is nothing the store plays is a person, and the ring is why we are sure");
  // The person's clock starts at their first word, walking back through unsure lines too.
  const two = [
    { who: "ivr" as const, text: "Thanks for calling CVS.", atSec: 5 },
    { who: "ivr" as const, text: "Mm-hm.", atSec: 30 },
    { who: "ivr" as const, text: "Hello? This is Sam.", atSec: 33 },
  ];
  ok(personStartsAt(two, 33, { knownMenuLines: KNOWN }) === 30,
    "a mumble between the store's line and the person's is dated to the person, because by then we KNOW they are there");
}

console.log("\n▶ THE FIRST CALL TO A STORE WE HAVE NEVER RUNG IS PURE LISTENING");
{
  const v = judge({ text: "Thanks for calling.", firstEverCall: true });
  ok(v.hangUpAllowed === false,
    "on a store's first call nothing may be hung up on — everything is recorded, so the menu is on file forever after");
  ok(judge({ text: "Thanks for calling.", firstEverCall: false }).hangUpAllowed !== false,
    "and on later calls the ordinary rules apply again");
}

console.log("\n▶ THE LAST FOUR (fix pass 6, items 5-8)");
{
  const { readFileSync } = await import("node:fs");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  // 5: both flags are wired for real, not just asserted.
  ok(/if \(s\.relisten && s\.humanAtSec == null && !s\.firstEverCall\)/.test(nav),
    "a store's first check hangs up on nothing — it listens to everything and its menu goes on file");
  ok(/if \(verdict\.unknownLine && verdict\.who === "recording"/.test(nav) && /kind: "menu-changed"/.test(nav),
    "and a menu line matching nothing we hold is FILED, never guessed into the map");
  const v = judge({ text: "Press 4 for the deli counter.", knownMenuLines: KNOWN });
  ok(v.unknownLine === true && v.who === "recording",
    "the judge flags an unheard menu line as unheard, and still says who spoke");
  // 6: the run's own heard lines feed the judge during a first run.
  ok(/\.\.\.\(await rememberedMenuLines\(chainId, store\.id\)\), \.\.\.\(run\.lastLines \|\| \[\]\)/.test(readFileSync("src/calls/mapper.ts", "utf8")),
    "during a first run the store's own lines heard so far feed the judge — never blind when it matters most");
  // 7: sweep truth.
  const sw = readFileSync("src/calls/sweep.ts", "utf8");
  ok(/a recording plays before Staff\. Queued for mapping\./.test(sw),
    "a short recording before Staff disqualifies 'answers directly' — however short it was");
  ok(/\(please\\s\+\)\?hold/.test(nav) || /hold\(\\s\+\(on\|please\)\)\?/.test(nav),
    "and 'please hold' still arms the handoff clock");
  // 8: freeing the doors reaches a live run.
}

console.log("\n▶ THE KNOCK, and every one of these run twice: remembered, and knowing nothing");
{
  const CVS_OPEN = KNOWN[0];
  // Both ways round, because a chain's FIRST ever check is exactly what mapping is (owner 08-07).
  for (const [how, mem] of [["remembered", KNOWN], ["knowing nothing", []]] as const) {
    ok(judge({ text: CVS_OPEN, knownMenuLines: [...mem], knock: "read_on" }).who === "recording",
      `it read straight on through the keys, so it is a machine (${how})`);
    ok(judge({ text: "Are you a healthcare provider?", knownMenuLines: [...mem], saidBefore: ["Are you a healthcare provider?"] }).who === "recording",
      `it said the same line twice, so it is a machine (${how})`);
    ok(judge({ text: "Front store, this is Bob, how can I help?", knownMenuLines: [...mem], knock: "stopped_then_spoke" }).who === "person",
      `it stopped for the keys and talked to us, so it is a person (${how})`);
    ok(judge({ text: "Front store, this is Bob, how can I help?", knownMenuLines: [...mem], knock: "stopped_and_waited" }).who === "person",
      `and it stayed quiet for us, which only a person does, so it is a person (${how})`);
    // 08-08: THE KEYS GET NO ANSWER AT ALL is its own state, and it must decide nothing. This is
    // where the old true/false quietly voted "it stopped" and let the word tests reach a person.
    ok(judge({ text: CVS_OPEN, knownMenuLines: [...mem] }).who !== "person",
      `keys with no answer to them never make it a person (${how})`);
  }
  // The one the owner watched break: with no memory at all, CVS's opening must never read person.
  ok(judge({ text: CVS_OPEN, knownMenuLines: [] }).who !== "person",
    "CVS's opening line is never a person on a number we have never rung");
  ok(judge({ text: "If this is an emergency, please hang up and dial 911.", knownMenuLines: [] }).who !== "person",
    "and neither is the emergency sentence that started all this");
}

console.log("\n▶ THE SOUND FINGERPRINT — hold music, and an advert talking over it");
{
  const frame = (loud: number) => Buffer.alloc(160, loud).toString("base64");
  // Hold music is a loop. Played round twice, the second round is the same sound again.
  const music = new SoundPrint();
  const loop = Array.from({ length: 80 }, (_, i) => 0x10 + Math.round(100 * Math.abs(Math.sin(i / 3))));
  for (let round = 0; round < 2; round++) for (const l of loop) for (let f = 0; f < 5; f++) music.feed(frame(l));
  ok(heardThisSoundBefore(music.all(), music.print(4)) === true,
    "hold music going round again is caught by its sound alone, with no words at all");
  // Somebody talking never says four seconds the same way twice.
  const talk = new SoundPrint();
  for (let i = 0; i < 1000; i++) talk.feed(frame(0x10 + Math.floor(Math.random() * 110)));
  ok(heardThisSoundBefore(talk.all(), talk.print(4)) === false,
    "and twenty seconds of somebody talking is never mistaken for a loop");
  // AN ADVERT OVER MUSIC is words, so every word rule calls it a person. The sound catches it.
  ok(judge({ text: "Did you know we deliver?", soundHeardBefore: true }).who === "recording",
    "an advert playing over hold music is a recording, because the sound came round again");
  ok(judge({ text: "Did you know we deliver?", knownMenuLines: [] }).who !== "person",
    "and knowing nothing at all, an advert is never called a person");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

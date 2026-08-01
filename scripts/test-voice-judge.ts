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
import { judgeVoice, personStartsAt, type JudgeInput } from "../src/calls/listen-nav";

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
  ok(v.who === "person", "a line matching nothing we have on file is not the menu");
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
  ok(judge({ text: "Hello? Are you there?" }).who === "person", "and somebody asking if we are there is a person");
}

console.log("\n▶ LAYER 4 — the pause: a recording keeps reading, a person stops");
{
  const unsure = judge({ text: "Just a moment please." });
  ok(unsure.who === "unsure" && unsure.needsPause === true,
    "a line that could be either asks for the pause instead of guessing");
  ok(judge({ text: "Just a moment please.", pauseTested: true, keptTalkingAfterPause: true }).who === "recording",
    "it kept reading through the silence — a recording");
  ok(judge({ text: "Just a moment please.", pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "it stopped and waited for us — a person");
}

console.log("\n▶ LAYER 5 — still unsure means a person, always");
{
  const v = judge({ text: "Mm-hm.", pauseTested: true, keptTalkingAfterPause: false });
  ok(v.who === "person", "the default flips toward a human, every time");
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
  ok(/handed the check to Charlie/.test(nav) && /handToCharlie\(s, atSec\)/.test(nav),
    "reaching a person on a proving check hands the live call to Charlie");
  ok(!/asked: "\$\{q\}"/.test(nav) && !/synthAsk/.test(nav) && !/askAudio/.test(nav),
    "the question mapping used to speak, and its voice, are deleted");
  ok(!/Staff said nothing after the question/.test(nav),
    "and so is mapping's own silence rule — Charlie handles a quiet clerk");
  const srv = readFileSync("src/server.ts", "utf8");
  ok(/setMappingHandoff\(\(s, atSec\) => \{/.test(srv) && /<Connect><Stream url="wss:\/\/\$\{host\}\/bridge\?room=\$\{room\}"/.test(srv),
    "the hand-off is the same one the recorded-clip path already uses — no second way to reach him");
  ok(/wrongDepartment === true/.test(srv) && /sess\.confirmResult = wrong \? "redirect"/.test(srv),
    "and mapping only RECORDS what Charlie reported: his answer, or the wrong desk");
}

console.log("\n▶ ALPHA AND BRAVO ACT ONLY ON THE EARPIECE'S WORD (fix pass 6, item 1)");
{
  const { readFileSync } = await import("node:fs");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/if \(\(d\.action === "press" \|\| d\.action === "say"\) && d\.value && speech && speech\.trim\(\)\s*\n\s*&& judgeHere\(s, speech, atSec\)\.who !== "recording"\) \{\s*\n\s*return twiml\(gather\(id\)\);/.test(nav),
    "nobody presses and nobody speaks unless a machine is talking — unsure means silent and listening");
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

console.log("\n▶ \"ONE MOMENT\" AFTER OUR QUESTION IS WAITING — not an answer, not being sent away");
{
  const v = judge({ text: "Sure, one second.", weAskedAtSec: 64, atSec: 66, routeHandoffSeen: true, ringsHeard: 2, mappedRoute: true });
  ok(v.who === "person", "it is a person talking");
  ok(v.waiting === true, "and it is them going to look — the check must keep listening, not conclude");
  ok(judge({ text: "Yeah, we've got some.", weAskedAtSec: 64, atSec: 67, ringsHeard: 2 }).waiting !== true,
    "a real answer is not waiting");
  ok(judge({ text: "Oh, that would be the toy department, let me put you through.", weAskedAtSec: 64, atSec: 67, ringsHeard: 2 }).sendingUsAway === true,
    "and being handed somewhere else is still recognised for what it is");
  ok(judge({ text: "They're over in the toy aisle, by the registers.", weAskedAtSec: 64, atSec: 67, ringsHeard: 2 }).sendingUsAway !== true,
    "while Staff telling us WHERE the cards are is an answer, never being sent away");
}

console.log("\n▶ EVIDENCE ORDER, AND THE PERSON'S CLOCK (fix pass 6, items 3-4)");
{
  // A person-shaped line beats "we are inside the menu we hold": a store can read a line that
  // resembles its own menu, but a recording never talks TO us.
  ok(judge({ text: "Hi, this is Maria, how can I help you?", mappedRoute: true, routeHandoffSeen: false }).who === "person",
    "somebody talking to us beats being mid-menu on a route we hold");
  // A real counted ring beats a word-match to the remembered menu: the desk ringing is the phone
  // system saying it is finished with us.
  ok(judge({ text: KNOWN[1], knownMenuLines: KNOWN, ringsHeard: 1 }).who === "person",
    "and a real counted ring beats even a word-for-word match to the remembered menu");
  // The person's clock starts at their first word, walking back through unsure lines too.
  const two = [
    { who: "ivr" as const, text: "Thanks for calling CVS.", atSec: 5 },
    { who: "ivr" as const, text: "Mm-hm.", atSec: 30 },
    { who: "ivr" as const, text: "Hello? This is Sam.", atSec: 33 },
  ];
  ok(personStartsAt(two, 33, { knownMenuLines: KNOWN }) === 30,
    "an unsure line between the store and the person belongs to the person, not the menu");
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
  ok(/export function forgetDoorsOnLiveRun/.test(readFileSync("src/calls/mapper.ts", "utf8"))
    && (readFileSync("src/calls/mapgraph.ts", "utf8").match(/forgetDoorsOnLiveRun\(chainId\)/g) || []).length === 2,
    "freeing the doors reaches a run in flight too — both clears tell it");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

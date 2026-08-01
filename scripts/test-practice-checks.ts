// THE SEVEN PRACTICE CHECKS (owner, 08-01).
//
// Seven shapes a real check runs into, driven through the engine's own judgement — no phone, no
// money. Each one is a check that has happened or will happen at a real store, written as the lines
// that were played and the seconds they landed on. What each asserts is what the owner said must be
// true, not what the code happens to do:
//
//   1 instant pickup, no ring          Staff answer on the first second, no menu at all
//   2 a branded hello, then "one moment"  a store saying its own name is not automatically a machine
//   3 voicemail says "hello?"          a mailbox is a dead end BEFORE it is a person, so Charlie stays off
//   4 the menu dumps us to the operator  one ring never re-labels the menu that came before it
//   5 two Staff on one check           the person is dated from the FIRST person's first word
//   6 a Spanish-speaking person        Staff answering in Spanish are a person, not a recording
//   7 Charlie cannot join as they answer  we never hang up on the person who just picked up
//
// Run: ./node_modules/.bin/tsx scripts/test-practice-checks.ts
import { readFileSync } from "node:fs";
import { judgeVoice, personStartsAt, type JudgeInput } from "../src/calls/listen-nav";
import { menuLinesOf } from "../src/calls/mapper";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const judge = (o: Partial<JudgeInput> & { text: string }) => judgeVoice({ atSec: 10, ...o });
type Line = { who: "ivr" | "us"; text: string; atSec: number; action?: "press" | "say"; value?: string };

console.log("\n▶ PRACTICE CHECK 1 — instant pickup, no ring (the Fun store, and every direct store)");
{
  // Staff lift the handset before anything else happens. There is no menu, so there is nothing to
  // press and nobody to press at: the whole check is Charlie's from the first second.
  const steps: Line[] = [
    { who: "ivr", text: "Hello, Card Mart.", atSec: 1 },
    { who: "ivr", text: "Hello? Anybody there?", atSec: 5 },
  ];
  ok(judge({ text: "Hello, Card Mart.", atSec: 1, knownMenuLines: [] }).who !== "recording",
    "a store that just picks up is never called a recording");
  ok(personStartsAt(steps, 5, { knownMenuLines: [] }) === 1,
    "and the person is dated at their first word, one second in, not the turn we recognised them on");
  ok(menuLinesOf(steps as never, null, 1, []).length === 0,
    "there is no menu here at all — not one line of this belongs to the store's recordings");
  // A turn where nothing at all was said is not a verdict, so it can never be a reason to press.
  ok(judge({ text: "" }).who !== "recording",
    "and silence is never a verdict — nothing may be pressed into a quiet line");
}

console.log("\n▶ PRACTICE CHECK 2 — a branded hello, then \"one moment\" (the Barnes & Noble shape)");
{
  // Staff answer with the store's own name and nothing else. Every recording in the world opens the
  // same way, so the words alone cannot settle it — but calling it a machine outright is how a real
  // person gets keys pressed into their ear.
  const hello = "Thanks for calling Barnes and Noble Union Square.";
  const v = judge({ text: hello, atSec: 9, knownMenuLines: [] });
  ok(v.who !== "recording",
    "a store saying its own name is not automatically a machine — that is how Staff get pressed at");
  ok(v.needsPause === true,
    "it is held open for the pause instead: a recording reads on, a person stops");
  ok(judge({ text: hello, atSec: 9, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "they stopped and waited for us, so they are a person");
  ok(judge({ text: hello + " Please listen carefully as our options have changed.", atSec: 9 }).who === "recording",
    "but the same name followed by a menu's own words is the recording, plainly");
}

console.log("\n▶ PRACTICE CHECK 3 — voicemail says \"hello?\" (Charlie must never join a machine)");
{
  const box = "Hello? You have reached the voicemail box for the Fresno store. Please leave a message after the tone.";
  const v = judge({ text: box, atSec: 22, knownMenuLines: [] });
  ok(v.deadEnd === true, "a mailbox is a dead end, and it is called one");
  ok(v.who === "recording", "so it is never handed to Charlie as a person");
  // The same words with no mailbox in them stay a person — this must not become a rule that eats
  // real Staff checking whether we are still on the line.
  ok(judge({ text: "Hello? Are you still there?", atSec: 22 }).who === "person" && !judge({ text: "Hello? Are you still there?", atSec: 22 }).deadEnd,
    "and Staff asking if we are still there is still a person, with no dead end about it");
  ok(judge({ text: "Our store is closed for the night. Our store hours are nine to nine.", atSec: 8 }).deadEnd === true,
    "a closed store is a dead end too");
  ok(judge({ text: "The pharmacy is closed. For front store services, press 2.", atSec: 8 }).deadEnd !== true,
    "but a closed pharmacy is not — the front of the store is open and is where we are going");
}

console.log("\n▶ PRACTICE CHECK 4 — the menu dumps us to the operator (one ring, and everything before it)");
{
  // The menu gives up on us and rings the operator. The desk ringing proves the phone system is
  // finished with us FROM THERE ON. It says nothing about the menu that played before it.
  const steps: Line[] = [
    { who: "ivr", text: "Thank you for calling Card Mart. Please listen carefully as our options have changed.", atSec: 2 },
    { who: "ivr", text: "For the pharmacy press 1, for guest services press 2.", atSec: 11 },
    { who: "ivr", text: "I'm sorry, I did not get that. Let me connect you to an operator.", atSec: 24 },
    { who: "ivr", text: "Guest services, this is Dana.", atSec: 38 },
  ];
  // The desk rang 30 seconds in — after the whole menu, before Dana.
  ok(judge({ text: steps[1].text, atSec: 11, ringsHeard: 1, ringAtSec: 30 }).who === "recording",
    "a line the menu played before the desk rang is still the menu");
  ok(personStartsAt(steps, 38, { knownMenuLines: [], ringsHeard: 1, ringAtSec: 30 }) === 38,
    "and the person starts when they speak, never at the first second of the check");
  ok(menuLinesOf(steps as never, 24, 38, []).length === 3,
    "so all three of the store's own lines stay the menu, and only Dana is the person");
  ok(judge({ text: "Sure, one moment.", atSec: 41, ringsHeard: 1, ringAtSec: 30, mappedRoute: true }).who === "person",
    "after the ring, the same words are a person — that is what the ring is for");
}

console.log("\n▶ PRACTICE CHECK 5 — two Staff on one check");
{
  // The first desk answers and hands us on; a second person answers further down. The check has one
  // person's start, and it is the first one's first word.
  const steps: Line[] = [
    { who: "ivr", text: "For the pharmacy press 1, for guest services press 2.", atSec: 10 },
    { who: "us", text: "pressed 2", atSec: 14, action: "press", value: "2" },
    { who: "ivr", text: "Pharmacy, this is Alan.", atSec: 31 },
    { who: "ivr", text: "Oh, you want the front. Hold on, I will put you through.", atSec: 36 },
    { who: "ivr", text: "Front store, Maria speaking.", atSec: 58 },
  ];
  ok(personStartsAt(steps, 58, { knownMenuLines: [] }) === 31,
    "the person is dated from the first person's first word, not the second one's");
  ok(menuLinesOf(steps as never, null, 31, []).length === 1,
    "and only the store's own recording is the menu — neither person's words go back into it");
  ok(judge({ text: steps[4].text, atSec: 58, mappedRoute: true, routeHandoffSeen: false }).who === "person",
    "a second person answering is a person, even mid-route");
}

console.log("\n▶ PRACTICE CHECK 6 — a Spanish-speaking person");
{
  // Staff answer in Spanish, at length. Our own words for a person are English, so a long Spanish
  // hello used to read as one more recording — and a recording is something we press keys at.
  const hola = "Buenas tardes, gracias por llamar a Card Mart, habla María, ¿en qué le puedo servir el día de hoy?";
  ok(judge({ text: hola, atSec: 33, knownMenuLines: [] }).who === "person",
    "somebody greeting us in Spanish is a person");
  ok(judge({ text: "¿Bueno? ¿Sigue ahí?", atSec: 40 }).who === "person",
    "and somebody asking in Spanish whether we are still there is a person");
  ok(judge({ text: "Para español, oprima nueve.", atSec: 3 }).who === "recording",
    "while the menu's own Spanish option is still the recording");
  ok(judge({ text: hola, atSec: 33, pauseTested: true, keptTalkingAfterPause: true }).who === "person",
    "and the length of what they said never turns them back into a machine");
}

console.log("\n▶ PRACTICE CHECK 7 — Charlie cannot join as the person answers");
{
  // Staff pick up and Charlie cannot be opened. We never hang up on the person who just answered,
  // and nothing about that way in is spent, because the store was asked nothing.
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/s\.charlieTries = \(s\.charlieTries \?\? 0\) \+ 1;\s*\n\s*if \(s\.charlieTries < 2\) return twiml\(gather\(id\)\);/.test(nav),
    "a failed hand-off waits quietly and tries once more, instead of hanging up on them");
  ok(/if \(s\.confirm\?\.asked && s\.charlieJoined && s\.chainId != null\) void recordConfirmAsked/.test(nav),
    "and that way in is spent only when Charlie really joined and really asked");
  ok(!/s\.stopReason = "reached Staff but Charlie could not join";\s*\n\s*finish\(s, "failed"\); return twiml\(`<Hangup\/>`\);\s*\n\s*\}\s*\n\s*finish/.test(nav)
    || /if \(s\.charlieTries < 2\)/.test(nav),
    "the old straight-to-hang-up on a failed join is gone");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

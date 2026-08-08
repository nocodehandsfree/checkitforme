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
//   8 the knock's own keys              a test of who picked up is never a choice at a menu
//
// Run: ./node_modules/.bin/tsx scripts/test-practice-checks.ts
import { judgeVoice, personStartsAt, type JudgeInput } from "../src/calls/listen-nav";
import { menuLinesOf } from "../src/calls/mapper";
import { _test as engine, setMappingHandoff, navEnded, pickedDoorFrom, classifyMode } from "../src/calls/navigator";
import { recipeFromCall } from "../src/calls/map-capture";
import { emit, recordLine } from "../src/calls/events";
import { heardWrongDepartment } from "../src/voice/prompts";

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
  // DRIVEN: a check walking a saved route, and the store goes quiet before anything is heard.
  {
    engine.open({ id: "quiet-1", barge: { plan: [{ action: "press", value: "2", at: 8 }] }, relisten: true });
    engine.at("quiet-1", 8);
    const said = await engine.step("quiet-1", "");
    ok(!/<Play digits=/.test(said), "and on a quiet turn nothing is pressed — the key is held back");
    engine.end("quiet-1");
  }
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
  // 08-07: stopping ALONE is not a person, because a menu goes quiet too. The owner's own rule is
  // that a person stops AND then speaks to us, so the proof is their second line.
  ok(judge({ text: hello, atSec: 9, pauseTested: true, keptTalkingAfterPause: false }).who === "unsure",
    "they stopped, which on its own proves nothing, so Echo keeps listening instead of guessing");
  ok(judge({ text: "Hi, can I help you?", atSec: 12, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "and when they speak to us after stopping, that is a person");
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
  const stillThere = judge({ text: "Hello? Are you still there?", atSec: 22, pauseTested: true, keptTalkingAfterPause: false });
  ok(stillThere.who === "person" && !stillThere.deadEnd,
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

console.log("\n▶ PRACTICE CHECK 4b — the desk rings, nobody answers, and the menu comes back");
{
  // A ring proves the phone system moved us along. It proves nothing about who speaks next: the desk
  // can ring out and drop us straight back into the menu we were just in. Driven through the engine:
  // the check must NOT hand over to Charlie when that happens.
  const KNOWN = [
    "Thank you for calling Card Mart. Please listen carefully as our options have changed.",
    "For the pharmacy press 1, for guest services press 2.",
  ];
  ok(judge({ text: KNOWN[1], atSec: 44, knownMenuLines: KNOWN, ringsHeard: 1, ringAtSec: 30 }).who === "recording",
    "the returning menu is the store's own menu, ring or no ring");
  setMappingHandoff(async () => `<Response><Connect/></Response>`);
  engine.open({ id: "ringout-1", confirm: { product: "Pokémon cards" }, knownMenuLines: KNOWN,
    ringsHeard: 1, ringAtSec: 30 });
  engine.at("ringout-1", 44);
  await engine.step("ringout-1", KNOWN[1]);
  const r = engine.get("ringout-1")!;
  ok(r.humanAtSec == null, "nobody is on the line, so no person is stamped");
  ok(!r.confirm?.asked, "and the check is never handed to Charlie — he would have talked to a recording");
  engine.end("ringout-1");
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
  ok(judge({ text: steps[4].text, atSec: 58, mappedRoute: true, routeHandoffSeen: false, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "a second person answering is a person, even mid-route");
}

console.log("\n▶ PRACTICE CHECK 6 — a Spanish-speaking person");
{
  // Staff answer in Spanish, at length. Our own words for a person are English, so a long Spanish
  // hello used to read as one more recording — and a recording is something we press keys at.
  // WE NEVER RECOGNISE A PERSON'S WORDS. We only know a menu when we hear one, and anything we
  // cannot prove is a menu is a person. Charlie handles whatever language they answer in.
  const hola = "Buenas tardes, gracias por llamar a Card Mart, habla María, ¿en qué le puedo servir el día de hoy?";
  // No English word list can carry Spanish, so nothing about the WORDS is allowed to decide. What
  // decides is behaviour: they went quiet for the keys and stayed quiet for us (owner 08-07).
  ok(judge({ text: hola, atSec: 33, knownMenuLines: [], pauseTested: true, keptTalkingAfterPause: false }).who === "unsure",
    "the Spanish greeting alone proves nothing either way, and Echo never guesses");
  ok(judge({ text: hola, atSec: 33, knownMenuLines: [], knockTested: true, keptTalkingAfterKnock: false, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "somebody greeting us in Spanish is a person, proved by behaviour and not by any word we know");
  ok(judge({ text: "¿Bueno? ¿Sigue ahí?", atSec: 40, knockTested: true, keptTalkingAfterKnock: false, pauseTested: true, keptTalkingAfterPause: false }).who === "person",
    "and so is somebody asking in Spanish whether we are still there, proved the same way");
  ok(judge({ text: "Para español, oprima nueve.", atSec: 3 }).who === "recording",
    "while the menu's own Spanish option is still the recording");
  // DRIVEN through the engine: the same long Spanish hello, on the check that reaches Staff.
  {
    setMappingHandoff(async () => null);
    engine.open({ id: "es-1", confirm: { product: "Pokémon cards" } });
    engine.at("es-1", 30);
    const t1 = await engine.step("es-1", hola);
    // 08-07: we press once at WHOEVER answered, because we do not know yet what we called. That is
    // the point. A person hears the beeps, stops, and speaks again; a recording reads straight on.
    ok(/<Play digits="123"\/>/.test(t1),
      "the keys go out once, because nothing yet says whether this is a menu or a person");
    engine.at("es-1", 33);
    await engine.step("es-1", "¿Bueno? ¿Sigue ahí?");
    ok(engine.get("es-1")?.keptTalkingAfterKnock === false,
      "they did not read straight on, so nothing calls them a machine");
    engine.at("es-1", 36);
    await engine.step("es-1", "¿Bueno?");
    ok(engine.get("es-1")?.humanAtSec != null,
      "and they are a person, proved by what they did and not by any Spanish word we know");
    engine.end("es-1");
  }
}

console.log("\n▶ PRACTICE CHECK 7 — Charlie cannot join as the person answers");
{
  // Staff pick up and Charlie cannot be opened. DRIVEN through the engine: we never hang up on the
  // person who just answered, and nothing about that way in is spent, because they were asked nothing.
  setMappingHandoff(async () => null);           // Charlie refuses to open, every time
  engine.open({ id: "nojoin-1", confirm: { product: "Pokémon cards" } });
  // The check plays out the way a real one does now: they answer, the keys go out at whoever picked
  // up, and what they do next is what proves they are a person.
  engine.at("nojoin-1", 28);
  const knocked = await engine.step("nojoin-1", "Card Mart, Dana speaking.");
  ok(/<Play digits="123"\/>/.test(knocked), "the keys go out at whoever answered — nothing yet says which it is");
  engine.at("nojoin-1", 31);
  const first = await engine.step("nojoin-1", "Hello? Are you still there?");
  ok(!/<Hangup\/>/.test(first), "we do not hang up on the person who just answered");
  ok(engine.get("nojoin-1")?.status !== "failed", "and the check is still running, quietly listening");
  engine.at("nojoin-1", 36);
  const second = await engine.step("nojoin-1", "Hello? Anybody there?");
  ok(/<Hangup\/>/.test(second), "after one more try it ends, and the store still hears nothing from us");
  ok(!engine.get("nojoin-1")?.charlieJoined,
    "Charlie never got on, so that way in was never asked and is not spent");
  engine.end("nojoin-1");
  setMappingHandoff(async () => null);
}

console.log("\n▶ CHARLIE'S WORD ON THE DEPARTMENT — Staff engaged, so the department is proved");
{
  // "We might have some, come look" is not a yes and not a no about stock. It IS Staff saying they
  // hold the information, which is the whole department test (contract Update 12). Driven end to
  // end: hand the check to Charlie, let Staff speak to him, end the check, read the grade.
  setMappingHandoff(async () => `<Response><Connect/></Response>`);   // Charlie opens, as he does live
  engine.open({ id: "dept-1", chainId: null, confirm: { product: "Pokémon cards" }, stage: "map" });
  engine.at("dept-1", 37);
  await engine.step("dept-1", "Card Mart, Dana speaking.");   // the keys go out at them
  engine.at("dept-1", 40);
  await engine.step("dept-1", "Hello? Are you still there?"); // they stopped for the keys, then spoke to us
  const s = engine.get("dept-1")!;
  ok(s.confirm?.asked === true, "the check is handed to Charlie the moment Staff answer");
  // What Charlie's half of the check put down: he opened, and Staff spoke to him.
  emit("dept-1", "charlie_join", "Charlie joined");
  recordLine("dept-1", "Agent", "Hi, do you have any Pokémon cards in stock right now?");
  recordLine("dept-1", "Clerk", "We might have some, come look.");
  navEnded("dept-1");
  ok(s.confirmResult === "answered",
    "Staff engaged with the question, so this is the right department — whether they have the cards is not the test");
  ok(s.grade === "pass", `and the check passes${s.failReason ? ` (it said "${s.failReason}")` : ""}`);
  ok(s.charlieJoined === true, "Charlie really got on, so that way in counts as asked");
  engine.end("dept-1");

  // Sent to a desk that cannot answer is the one thing that is NOT the right department.
  engine.open({ id: "dept-2", confirm: { product: "Pokémon cards" }, stage: "map" });
  engine.at("dept-2", 37);
  await engine.step("dept-2", "Card Mart, Dana speaking.");
  engine.at("dept-2", 40);
  await engine.step("dept-2", "Hello? Are you still there?");
  const w = engine.get("dept-2")!;
  emit("dept-2", "charlie_join", "Charlie joined");
  emit("dept-2", "unknown", "We reached the wrong department", { wrongDepartment: true, why: "that is the pharmacy" });
  recordLine("dept-2", "Clerk", "Oh, that's the pharmacy, hold on.");
  navEnded("dept-2");
  ok(w.confirmResult === "redirect", "Charlie says wrong department, so that is what the check reads");
  ok(w.grade === "fail" && w.failReason === "wrong department", `and it fails for that reason (${w.failReason})`);
  engine.end("dept-2");
}

console.log("\n▶ A MAPPING CHECK NEVER TAKES A TRANSFER");
{
  // "You've reached the pharmacy, let me transfer you" is the wrong desk AND an offer to move us.
  // Riding that would get a good answer from a desk we cannot name and cannot get back to, and the
  // map would lock it as the way in. So the check ends, the choice we took is marked wrong, nothing
  // locks, and mapping calls the SAME store again on the next choice.
  const said = "You've reached the pharmacy, let me transfer you to the front.";
  const wd = heardWrongDepartment(said);
  ok(!!wd, "Staff's own words read as the wrong department");
  ok(wd?.handingOver === true, "and as an offer to hand us on — the two facts the engine acts on");
  ok(heardWrongDepartment("Sure, I'm gonna put you on hold.")?.handingOver !== true,
    "while being put on hold is not an offer to hand us on — that read is untouched");

  setMappingHandoff(async () => `<Response><Connect/></Response>`);
  engine.open({ id: "xfer-1", confirm: { product: "Pokémon cards" }, stage: "map",
    steps: [
      { who: "ivr", text: "For the pharmacy press 1, for guest services press 2.", atSec: 10 },
      { who: "us", text: "pressed 1", atSec: 14, action: "press", value: "1" },
    ] as never });
  engine.at("xfer-1", 37);
  await engine.step("xfer-1", "Pharmacy, this is Alan.");
  engine.at("xfer-1", 40);
  await engine.step("xfer-1", "Hello? Are you still there?");
  const m = engine.get("xfer-1")!;
  emit("xfer-1", "charlie_join", "Charlie joined");
  emit("xfer-1", "unknown", "We reached the wrong department", { wrongDepartment: true, why: "this is the pharmacy", said });
  recordLine("xfer-1", "Clerk", said);
  navEnded("xfer-1");
  ok(m.confirmResult === "redirect", "the check reads it as the wrong desk, not as Staff who engaged");
  ok(m.grade === "fail" && m.failReason === "wrong department",
    `so it fails for that reason (${m.failReason}) and nothing about this store is locked`);
  ok(m.recipe == null, "and no route is written off a check that reached the wrong desk");
  ok(pickedDoorFrom(m.steps) === "1",
    "the choice we took is the one marked wrong — the next check takes the next choice at the same store");
  engine.end("xfer-1");
}

console.log("\n▶ PRACTICE CHECK 8 — the knock is a test of who picked up, never a choice at a menu");
{
  // Every check to a number we do not already hold presses a few keys at whoever answered. Those
  // keys are on the record because we really pressed them, and NOTHING that reads the route may
  // count them: as a plain press step they read as the door we chose, they were written into the
  // store's saved route as "press 123", and a store that answers direct stopped reading as direct.
  setMappingHandoff(async () => null);
  engine.open({ id: "knock-1", confirm: { product: "Pokémon cards" } });
  engine.at("knock-1", 6);
  const out = await engine.step("knock-1", "Hola, buenas tardes.");
  ok(/<Play digits="123"\/>/.test(out), "the keys go out at whoever answered");
  const k = engine.get("knock-1")!;
  // THE STORE'S OPENING LINE MUST SURVIVE THE KNOCK. Pressing before writing it down threw it away:
  // it never reached the timeline, and it never reached the memory of what this number has said —
  // which is the one test that catches a recording on a number we have never rung.
  ok(k.steps[0]?.who === "ivr" && k.steps[0]?.text === "Hola, buenas tardes.",
    "and the store's opening line is written down first, before the keys, so nothing is lost");
  ok(pickedDoorFrom(k.steps) === undefined,
    "no door was picked — the keys were a question about who is on the line, not an answer to a menu");
  ok(recipeFromCall(k.steps, 6).steps.length === 0,
    "and nothing about the keys is written into the store's saved route");
  ok(classifyMode(k.steps).mode === "charlie",
    "a store that just picks up still reads as a direct pickup, keys or no keys");
  // THE LINE IN HAND IS NEVER EVIDENCE ABOUT ITSELF. The store's line is recorded before anything
  // judges it, so passing the whole record through as "everything it has already said" matched the
  // line against its own copy — and answered "it has said this already" the FIRST time it said it,
  // which called every line on every check a recording and reached no person, ever.
  engine.at("knock-1", 9);
  await engine.step("knock-1", "¿Bueno? ¿Sigue ahí?");
  ok(engine.get("knock-1")?.pauseTested === true,
    "so a line said once is held open for the silence, never called a repeat of itself");
  // Said a SECOND time, with us silent in between, it gives itself away as the recording it is.
  engine.at("knock-1", 13);
  await engine.step("knock-1", "¿Bueno? ¿Sigue ahí?");
  const r = engine.get("knock-1")!;
  ok(r.humanAtSec == null, "and the same line played again is the recording repeating, so no person is stamped");
  engine.end("knock-1");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

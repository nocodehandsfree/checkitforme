// THE ROBOT STORE'S PHONE MENU, proved on the bench (owner approved the script 08-08).
//
// No phone, no money, no synthesis. What is proved here is the WORDS, the ORDER, which key leads
// where, and the four abilities the thirteen mapping tests need: hearing a key, branching on which
// key, a menu voice of its own, and looping back to the top. The audio route itself is proved by a
// real call, which is not this file's job.
//
// Run: ./node_modules/.bin/tsx scripts/test-robot-menu.ts
import { readFileSync } from "node:fs";
import {
  GREETING, MENU_VARIANTS, optionsFor, keyTable, frontKey, ringSecs, isMenuVariant,
  robotMenuStep, _menuRig, _menuElapsed, _menuState, _menuEnd, type MenuVariant,
} from "../src/calls/robot-menu";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const said = (sid: string) => (_menuState(sid)?.said || []).map((l) => l.text);
const keys = (sid: string) => _menuState(sid)?.keys || [];
/** One line's made-up length on the bench, so a test can say exactly where a key landed. */
const LINE = 3;

// The owner's approved script, read off the file he approved rather than retyped here.
const SPEC = readFileSync("docs/specs/mapping-tests/robot-menu.md", "utf8");

console.log("\n▶ THE WORDS ARE HIS, WORD FOR WORD");
{
  const greeting = GREETING.join(" ");
  ok(SPEC.includes(greeting.replace(/dial nine one one/, "dial\nnine one one")) || SPEC.includes(greeting),
    "the greeting is the approved greeting, to the letter");
  ok(greeting.includes("If this is a medical emergency, please hang up and dial nine one one."),
    "including the emergency sentence, which is the CVS shape that broke us on 08-07");
  const options = optionsFor("plain").join(" ");
  ok(SPEC.replace(/\n/g, " ").includes(options),
    "and the six options are his options paragraph, in his order, to the letter");
  ok(optionsFor("plain").length === 6, "six options are read on the approved menu");
}

console.log("\n▶ 1 — IT HEARS A KEY PRESS (the whole reason nothing could be dialed)");
{
  const { first } = _menuRig("plain", { lineSecs: LINE });
  ok(/input="dtmf speech"/.test(first), "the listening window takes keys AND speech, where the scenes took speech only");
  ok(/numDigits="1"/.test(first), "one key at a time, so a key is acted on the moment it lands");
}

console.log("\n▶ 2 — IT BRANCHES ON WHICH KEY, off his key table");
{
  const t = (k: string) => keyTable("plain", k);
  ok(t("1")?.kind === "desk" && (t("1") as { answers: string }).answers === "MVP's pharmacy, this is Larry.",
    "1 is the pharmacy desk, one ring, and it answers in his words");
  ok((t("1") as { rings: number }).rings === 1, "one ring at the pharmacy");
  ok(t("2")?.kind === "read" && (t("2") as { says: string }).says === "Our cosmetics department is open ten to six.",
    "2 is the cosmetics recording, in his words");
  ok(t("3")?.kind === "desk" && (t("3") as { rings: number; answers: string }).rings === 2
    && (t("3") as { answers: string }).answers === "Home supplies.",
    "3 is home supplies, two rings, and it answers in his words");
  ok(t("4")?.kind === "read" && (t("4") as { says: string }).says.startsWith("We are open nine to nine, seven days a week."),
    "4 is the hours and directions recording, in his words");
  const front = t("0");
  ok(front?.kind === "desk" && (front as { rings: number }).rings === 3
    && (front as { answers: string }).answers === "MVP's, this is Larry speaking."
    && (front as { staffTakeOver: boolean }).staffTakeOver,
    "0 is THE RIGHT DEPARTMENT: three rings, the front desk answers, and Staff carry on from there");
  ok(t("9")?.kind === "again", "9 plays the options again");
  ok(t("7") === null && t("*") === null, "a key he did not list leads nowhere, and nothing is announced about it");
  ok(ringSecs(1) === 2 && ringSecs(2) === 8 && ringSecs(3) === 14 && ringSecs(8) === 44,
    "the rings are the real cadence: two seconds of tone, four of silence, per ring");
}

console.log("\n▶ 3 — IT HAS A MENU VOICE OF ITS OWN");
{
  const src = readFileSync("src/calls/robot-menu.ts", "utf8");
  const deck = readFileSync("src/calls/tapedeck.ts", "utf8");
  ok(/robot_voice_menu/.test(src), "the menu reads its own voice setting, not Staff's");
  ok(!/robot_voice_menu/.test(deck), "and Staff's voice setting is a different one entirely");
  ok(/const MENU_TUNING/.test(src) && /mp3Clip\(voiceId, text, MENU_TUNING\)/.test(src),
    "one voice and one set of settings for every line, so it says the same words the same way every call");
}

console.log("\n▶ 4 — IT LOOPS BACK TO THE TOP");
{
  // Nothing pressed: the greeting ends, the options read, six seconds of quiet, and the whole list
  // plays again from the top of the options.
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");                       // the greeting finished
  ok(said(sid).slice(0, 3).join(" ") === GREETING.join(" "), "the greeting reads first, all of it");
  ok(said(sid).slice(3).join(" ") === optionsFor("plain").join(" "), "then the six options, in order");
  const again = await robotMenuStep(sid, "", "");          // six seconds, nothing pressed
  ok(again !== null && "twiml" in again && /timeout="6"/.test(again.twiml),
    "the options wait his six seconds for a key");
  ok(said(sid).slice(9).join(" ") === optionsFor("plain").join(" "),
    "and with nothing pressed the whole list plays again from the top");
  _menuEnd(sid);

  // A key he did not list: the same loop, and not one word invented about it.
  const { callSid: s2 } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(s2, "", "");
  const before = said(s2).length;
  await robotMenuStep(s2, "7", "");
  ok(said(s2).slice(before).join(" ") === optionsFor("plain").join(" "),
    "a key off the table plays the options again, and says nothing that is not his");
  ok(keys(s2)[0].acted === "the options again", "and the record says exactly that is what it did");
  _menuEnd(s2);

  // Pressing 9 is the same loop, asked for.
  const { callSid: s3 } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(s3, "", "");
  const n3 = said(s3).length;
  await robotMenuStep(s3, "9", "");
  ok(said(s3).slice(n3).join(" ") === optionsFor("plain").join(" "), "pressing 9 plays them again too");
  _menuEnd(s3);
}

console.log("\n▶ WALKED TO A PERSON — listen to the whole menu, press 0, three rings, the front desk");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");                       // listened to the whole greeting and options
  _menuElapsed(sid, 6 * LINE + 1);                        // the options finished reading
  const turn = await robotMenuStep(sid, "0", "");
  ok(turn !== null && "desk" in turn, "pressing 0 reaches a desk, not another recording");
  if (turn && "desk" in turn) {
    ok(turn.desk.answers === "MVP's, this is Larry speaking.", "and the front desk answers in his words");
    ok(/secs=14/.test(turn.desk.ringTwiml), "after three real rings");
    ok(turn.desk.staffTakeOver, "and Staff take the same live call from there");
  }
  _menuEnd(sid);
}

console.log("\n▶ WRONG DEPARTMENT — press 1 and the pharmacy answers, with nothing put in its mouth");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");
  _menuElapsed(sid, 6 * LINE + 1);
  const turn = await robotMenuStep(sid, "1", "");
  ok(turn !== null && "twiml" in turn, "the pharmacy is not the front desk, so Staff never take over there");
  ok(said(sid).includes("MVP's pharmacy, this is Larry."), "it answers with his one approved line");
  ok(said(sid).filter((l) => /pharmacy, this is Larry/.test(l)).length === 1,
    "and says nothing more — no words he never approved");
  if (turn && "twiml" in turn) ok(/<Gather/.test(turn.twiml), "it holds the line open and stays quiet, the way a counter does");
  _menuEnd(sid);
}

console.log("\n▶ IT ACTS ON OUR KEYS — the knock during the greeting");
{
  // The keys go out at whoever answered, DURING the greeting. His script: the key is remembered and
  // acts the moment the options start.
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  _menuElapsed(sid, LINE + 1);                            // one and a bit sentences in
  const held = await robotMenuStep(sid, "1", "");
  ok(held !== null && "twiml" in held, "a key during the greeting acts on nothing yet");
  ok(said(sid).length === 5 && said(sid)[3] === GREETING[1],
    "the greeting carries on from the sentence it was cut off in the middle of");
  const turn = await robotMenuStep(sid, "", "");           // the greeting finished
  ok(turn !== null && "twiml" in turn, "and the moment the options start, the held key acts");
  ok(said(sid).includes("MVP's pharmacy, this is Larry."), "1 was remembered, so it lands at the pharmacy desk");
  ok(keys(sid)[0].held === true, "the record says the key was held from the greeting");
  ok(!said(sid).includes(optionsFor("plain")[0]), "and the options never got read, because the key acted first");
  _menuEnd(sid);
}

console.log("\n▶ VARIANT — no option fits");
{
  const opts = optionsFor("no_option_fits");
  ok(opts.length === 5, "five options are read, not six");
  ok(!opts.some((l) => /front of the store/.test(l)), "the front of the store is never offered, so nothing matches cards");
  ok(opts.join(" ") === ["For the pharmacy, press 1.", "For cosmetics, press 2.", "For home supplies, press 3.",
    "For store hours and directions, press 4.", "To hear these options again, press 9."].join(" "),
    "and the five it does read are his, unchanged and in his order");
}

console.log("\n▶ VARIANT — the menu changed, the front desk moved from 0 to 5");
{
  ok(frontKey("menu_changed") === "5", "the front of the store is key 5 now");
  ok(optionsFor("menu_changed").some((l) => l === "For the front of the store and customer service, press 5."),
    "and the menu says so out loud, in his words with his new key");
  const five = keyTable("menu_changed", "5");
  ok(five?.kind === "desk" && (five as { staffTakeOver: boolean }).staffTakeOver, "5 reaches the front desk");
  // A SAVED ROUTE STILL PRESSES 0, and that is the whole test: it has to land somewhere wrong.
  const zero = keyTable("menu_changed", "0");
  ok(zero === null, "while 0, which every saved route presses, now leads nowhere at all");
  const { callSid: sid } = _menuRig("menu_changed", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");
  const n = said(sid).length;
  await robotMenuStep(sid, "0", "");
  ok(said(sid).slice(n).join(" ") === optionsFor("menu_changed").join(" "),
    "so a check pressing 0 hears the menu again instead of the front desk");
  _menuEnd(sid);
}

console.log("\n▶ VARIANT — the earlier press is swallowed and the menu reads on");
{
  const { callSid: sid } = _menuRig("press_ignored", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");
  const n = said(sid).length;
  _menuElapsed(sid, LINE + 1);                             // one option and a bit in
  await robotMenuStep(sid, "0", "");
  ok(keys(sid)[0].early === true && keys(sid)[0].acted === "swallowed, the menu read on",
    "a press before the options finish does nothing at all");
  ok(said(sid)[n] === optionsFor("press_ignored")[1],
    "and the menu reads ON from the option it was cut off in the middle of, never from the top");
  // Once the options HAVE finished, the same press works, so the variant proves speed and not a dead key.
  _menuElapsed(sid, 6 * LINE + 1);
  const turn = await robotMenuStep(sid, "0", "");
  ok(turn !== null && "desk" in turn, "the same key after the options finish still reaches the front desk");
  _menuEnd(sid);
}

console.log("\n▶ VARIANT — the desk rings out");
{
  const zero = keyTable("ring_out", "0");
  ok(zero?.kind === "ringout" && (zero as { rings: number }).rings === 8, "eight rings at the front desk, and nobody answers");
  const { callSid: sid } = _menuRig("ring_out", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");
  const n = said(sid).length;
  _menuElapsed(sid, 6 * LINE + 1);
  const turn = await robotMenuStep(sid, "0", "");
  ok(turn !== null && "twiml" in turn && /secs=44/.test(turn.twiml), "the line really rings, for eight rings");
  ok(said(sid).slice(n).join(" ") === optionsFor("ring_out").join(" "),
    "and then the menu returns from the top, so the returning menu is still the menu");
  _menuEnd(sid);
}

console.log("\n▶ THE SPEED TEST — pressing earlier works on the approved menu");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  await robotMenuStep(sid, "", "");
  _menuElapsed(sid, LINE * 2 + 1);                         // midway through the options
  const turn = await robotMenuStep(sid, "0", "");
  ok(turn !== null && "desk" in turn, "pressing 0 midway through the options still lands on the front desk");
  ok(keys(sid)[0].early === true, "and the record knows it was pressed before the options had finished");
  _menuEnd(sid);
}

console.log("\n▶ THE MENU IS OFF UNLESS IT IS SWITCHED ON");
{
  ok(isMenuVariant("plain") && isMenuVariant("ring_out") && !isMenuVariant("whatever"),
    "only the five menus he named can be picked");
  ok(Object.keys(MENU_VARIANTS).length === 5, "five menus, and no sixth invented one");
  const srv = readFileSync("src/server.ts", "utf8");
  ok(/const menu = sid \? await menuPick\(\) : null;/.test(srv) && /if \(menu\) return c\.body\(await robotMenuAnswer/.test(srv),
    "the menu answers first only when it is switched on, so the scenes' own calls are untouched");
  const deck = readFileSync("src/calls/tapedeck.ts", "utf8");
  ok(/return robotPlay\(callSid, st, opts\?\.lead \?\? `<Pause length="1"\/>`\);/.test(deck),
    "and with no menu the scenes answer exactly as they always have");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

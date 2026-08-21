// THE ROBOT STORE'S PHONE MENU, proved on the bench (owner approved the script 08-08).
//
// No phone, no money, no synthesis. What is proved here is the WORDS, the ORDER, which key leads
// where, and the four gaps the thirteen mapping tests needed closed: hearing a key press, branching
// on which key, a menu voice separate from Staff's, and a way back to the top of the menu. The audio
// route itself is proved by a real call, which is not the bench's job.
//
// IT IS A SCENE, driven by the robot store's own player. Every check below goes through the same
// `robotStep` a real call goes through — there is no second robot store to test.
//
// Run: ./node_modules/.bin/tsx scripts/test-robot-menu.ts
import { readFileSync } from "node:fs";
import {
  MENU_GREETING, MENU_VARIANTS, MENU_NO_PRESS_SEC, menuOptions, menuScene, menuFrontKey, menuRingSecs,
  isMenuVariant, robotStep, robotEnded, _menuRig, _menuElapsed, _menuFixLengths, _menuRun, ROBOT_SCENES,
} from "../src/calls/tapedeck";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const said = (sid: string) => (_menuRun(sid)?.said || []).map((l) => l.text);
const keys = (sid: string) => _menuRun(sid)?.keys || [];
/** One spoken line's made-up length on the bench, so a check can place a key exactly. */
const LINE = 3;
/** Drive one turn the way a real call does, then re-measure the document it handed back. */
const step = (sid: string, digits: string, speech = "") => { const out = robotStep(sid, speech, digits); _menuFixLengths(sid, LINE); return out; };

const SPEC = readFileSync("docs/specs/mapping-tests/robot-menu.md", "utf8").replace(/\s+/g, " ");

console.log("\n▶ THE WORDS ARE HIS, WORD FOR WORD");
{
  const greeting = MENU_GREETING.join(" ");
  ok(SPEC.includes(greeting), "the greeting is his approved greeting, to the letter");
  ok(greeting.includes("If this is a medical emergency, please hang up and dial nine one one."),
    "including the emergency sentence, which is the CVS shape that broke us on 08-07");
  ok(SPEC.includes(menuOptions("plain").join(" ")),
    "and the six options are his options paragraph, in his order, to the letter");
  for (const line of ["MVP's pharmacy, this is Larry.", "MVP's, this is Larry speaking.", "Home supplies.",
    "Our cosmetics department is open ten to six.",
    "We are open nine to nine, seven days a week. You can find us at 4200 Woodland Hills Drive."]) {
    ok(SPEC.includes(line), `the desks and recordings say his words: "${line}"`);
  }
}

console.log("\n▶ IT IS A SCENE, not a second robot store");
{
  const src = readFileSync("src/calls/tapedeck.ts", "utf8");
  ok(/export function menuScene\(v: MenuVariant\): RobotScene/.test(src),
    "the menu is written as a RobotScene, in the same acts every Staff scene is written in");
  ok(!/robot-menu/.test(readFileSync("src/server.ts", "utf8")),
    "and there is no second file and no second door — the robot store has one of each");
  const m = menuScene("plain");
  ok(m.acts.some((a) => "label" in a) && m.acts.some((a) => "goto" in a),
    "the only new words the acts needed are a place to jump to and a jump");
  ok(!!m.staffAt && m.staffAt === "front",
    "and the Staff scene is spliced in at the front of the store, on the same live call");
  ok(ROBOT_SCENES.every((s) => !s.keys), "no Staff scene has a key table, so none of them changed behaviour");
}

console.log("\n▶ GAP 1 — IT HEARS A KEY PRESS (the whole reason nothing could be dialed)");
{
  const { first } = _menuRig("plain", { lineSecs: LINE });
  ok(/input="dtmf speech"/.test(first), "the listening window takes keys AND speech, where it took speech only");
  ok(/numDigits="1"/.test(first), "one key at a time, so a key is acted on the moment it lands");
  ok(new RegExp(`timeout="${MENU_NO_PRESS_SEC}"`).test(first), "and the menu waits his six seconds for one");
}

console.log("\n▶ GAP 2 — IT BRANCHES ON WHICH KEY, off his key table");
{
  const k = menuScene("plain").keys || {};
  ok(k["1"] === "pharmacy" && k["2"] === "cosmetics" && k["3"] === "home" && k["4"] === "hours"
    && k["0"] === "front" && k["9"] === "options",
    "1 pharmacy, 2 cosmetics, 3 home supplies, 4 hours, 0 the front of the store, 9 the options again");
  ok(k["7"] === undefined, "and a key he did not list is not in the table at all");
  ok(menuRingSecs(1) === 2 && menuRingSecs(2) === 8 && menuRingSecs(3) === 14 && menuRingSecs(8) === 44,
    "the rings are the real cadence: two seconds of tone, four of silence, per ring");
}

console.log("\n▶ GAP 3 — A MENU VOICE, SEPARATE FROM STAFF'S");
{
  const src = readFileSync("src/calls/tapedeck.ts", "utf8");
  ok(/robot_voice_menu/.test(src) && /robot_voice_staff/.test(src) && /robot_voice_transfer/.test(src),
    "three voices now: Staff, the person a transfer hands us to, and the store's own menu");
  ok(menuScene("plain").acts.filter((a) => "sayAs" in a && a.sayAs === "menu").length > 0,
    "every line the menu speaks is marked as the menu's voice, never Staff's");
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  ok((_menuRun(sid)?.said || []).every((l) => l.voice === "menu"),
    "so the record of the call says which of them said each line");
  ok(/stability: 0.75, similarity_boost: 0.75/.test(src),
    "one fixed set of settings, so it says the same words the same way on every call");
}

console.log("\n▶ GAP 4 — A WAY BACK TO THE TOP");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  ok(said(sid).slice(0, 3).join(" ") === MENU_GREETING.join(" "), "the greeting reads first, all of it");
  ok(said(sid).slice(3).join(" ") === menuOptions("plain").join(" "), "then the six options, in his order");
  step(sid, "");                                        // six seconds, nothing pressed
  ok(said(sid).slice(9).join(" ") === menuOptions("plain").join(" "),
    "with nothing pressed the whole list plays again from the top");
  const n = said(sid).length;
  _menuElapsed(sid, 6 * LINE + 1);                      // the options had finished reading
  step(sid, "7");
  ok(said(sid).slice(n).join(" ") === menuOptions("plain").join(" "),
    "a key off his table plays them again too, and says nothing that is not his");
  ok(keys(sid)[0].acted === "the options again", "and the record says exactly that is what it did");
  const n2 = said(sid).length;
  _menuElapsed(sid, 6 * LINE + 1);
  step(sid, "9");
  ok(said(sid).slice(n2).join(" ") === menuOptions("plain").join(" "), "pressing 9 plays them again, as he wrote");
  robotEnded(sid);
}

console.log("\n▶ WALKED TO A PERSON — listen to the whole menu, press 0, three rings, the front desk");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  _menuElapsed(sid, 9 * LINE + 1);                      // the greeting and the options both finished
  const out = step(sid, "0");
  ok(/secs=14/.test(out), "three real rings at the front desk");
  ok(said(sid).includes("MVP's, this is Larry speaking."), "then the front desk answers in his words");
  ok(/<Gather/.test(out), "and the call carries straight on into the Staff scene, listening");
  ok(keys(sid)[0].acted === "front", "the record says the key took us to the front of the store");
  robotEnded(sid);
}

console.log("\n▶ WRONG DEPARTMENT — press 1 and the pharmacy answers, with nothing put in its mouth");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  _menuElapsed(sid, 9 * LINE + 1);
  const out = step(sid, "1");
  ok(/secs=2/.test(out), "one ring at the pharmacy");
  ok(said(sid).includes("MVP's pharmacy, this is Larry."), "it answers with his one approved line");
  ok(said(sid).filter((l) => /pharmacy, this is Larry/.test(l)).length === 1,
    "and says nothing more, because his script gives it nothing more");
  ok(!said(sid).includes("MVP's, this is Larry speaking."), "the front desk never speaks on this call");
  robotEnded(sid);
}

console.log("\n▶ IT ACTS ON OUR KEYS — the knock, pressed during the greeting");
{
  // The keys go out at whoever answered, during the greeting. His script: the key is remembered and
  // acts the moment the options start.
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  _menuElapsed(sid, LINE + 1);                          // one sentence and a bit into the greeting
  step(sid, "1");
  ok(said(sid).slice(0, 3).join(" ") === MENU_GREETING.join(" "),
    "the greeting carries on from the sentence it was cut off in the middle of, and reads whole");
  ok(said(sid).filter((l) => l === MENU_GREETING[1]).length === 1,
    "and the sentence it was cut off in is on the record once, not twice");
  ok(said(sid)[3] === "MVP's pharmacy, this is Larry." && said(sid).length === 4,
    "then the moment the options would have started, the held key acts: 1 is the pharmacy");
  ok(!said(sid).some((l) => menuOptions("plain").includes(l)),
    "the options are never read at all, which is exactly the trap");
  ok(keys(sid)[0].held === true, "and the record says the key was held from the greeting");
  robotEnded(sid);
}

console.log("\n▶ VARIANT — no option fits");
{
  const opts = menuOptions("no_option_fits");
  ok(opts.length === 5, "five options are read, not six");
  ok(!opts.some((l) => /front of the store/.test(l)), "the front of the store is never offered, so nothing matches cards");
  ok(opts.join(" ") === ["For the pharmacy, press 1.", "For cosmetics, press 2.", "For home supplies, press 3.",
    "For store hours and directions, press 4.", "To hear these options again, press 9."].join(" "),
    "and the five it does read are his, unchanged and in his order");
}

console.log("\n▶ VARIANT — the menu changed, the front desk moved from 0 to 5");
{
  ok(menuFrontKey("menu_changed") === "5", "the front of the store is key 5 now");
  ok(menuOptions("menu_changed").includes("For the front of the store and customer service, press 5."),
    "and the menu says so out loud, in his words with his new key");
  const k = menuScene("menu_changed").keys || {};
  ok(k["5"] === "front", "5 reaches the front desk");
  // A SAVED ROUTE STILL PRESSES 0, and his ruling 08-08 is that it must reach a PERSON, the wrong
  // one. A route that lands on nobody is easy to catch, because the menu just plays again; a route
  // that still reaches somebody and only the wrong somebody is what quietly poisons the data.
  ok(k["0"] === "pharmacy", "while 0, which every saved route presses, goes to the PHARMACY, the wrong desk");
  const { callSid: sid } = _menuRig("menu_changed", { lineSecs: LINE });
  _menuElapsed(sid, 9 * LINE + 1);
  step(sid, "0");
  ok(said(sid).includes("MVP's pharmacy, this is Larry."),
    "so a check pressing 0 hears a person answer, which is exactly the trap");
  ok(!said(sid).includes("MVP's, this is Larry speaking."),
    "and never the front desk, so the saved route is genuinely wrong now");
  robotEnded(sid);
}

console.log("\n▶ VARIANT — the earlier press is swallowed and the menu reads on");
{
  const { callSid: sid } = _menuRig("press_ignored", { lineSecs: LINE });
  const opts = menuOptions("press_ignored");
  _menuElapsed(sid, 4 * LINE + 1);                      // one option in, the options still reading
  step(sid, "0");
  ok(keys(sid)[0].early === true && keys(sid)[0].acted === "swallowed, the menu read on",
    "a press before the options finish does nothing at all");
  ok(said(sid).slice(3).join(" ") === opts.join(" "),
    "and the menu reads ON from the option it was cut off in the middle of, never from the top");
  ok(said(sid).filter((l) => l === opts[0]).length === 1,
    "the option before the press is not read twice, so the list never restarted");
  ok(!said(sid).includes("MVP's, this is Larry speaking."), "and 0 never reached the front desk");
  // Once the options HAVE finished, the same key works — so this proves speed, not a dead key.
  _menuElapsed(sid, 9 * LINE + 1);
  const out = step(sid, "0");
  ok(/secs=14/.test(out) && said(sid).includes("MVP's, this is Larry speaking."),
    "the same key after the options finish still reaches the front desk");
  robotEnded(sid);
}

console.log("\n▶ VARIANT — the desk rings out");
{
  ok(!menuScene("ring_out").staffAt, "no Staff scene is spliced in: nobody picks up at the front desk");
  const { callSid: sid } = _menuRig("ring_out", { lineSecs: LINE });
  _menuElapsed(sid, 9 * LINE + 1);
  const n = said(sid).length;
  const out = step(sid, "0");
  ok(/secs=44/.test(out), "the line really rings, for eight rings");
  ok(!said(sid).includes("MVP's, this is Larry speaking."), "and nobody ever answers it");
  ok(said(sid).slice(n).join(" ") === menuOptions("ring_out").join(" "),
    "then the menu returns from the top, so the returning menu is still the menu");
  robotEnded(sid);
}

console.log("\n▶ THE SPEED TEST — pressing earlier works on the approved menu");
{
  const { callSid: sid } = _menuRig("plain", { lineSecs: LINE });
  _menuElapsed(sid, 5 * LINE + 1);                      // midway through the options
  const out = step(sid, "0");
  ok(/secs=14/.test(out) && said(sid).includes("MVP's, this is Larry speaking."),
    "pressing 0 midway through the options still lands on the front desk");
  ok(keys(sid)[0].early === true, "and the record knows it was pressed before the options had finished");
  robotEnded(sid);
}

console.log("\n▶ THE MENU IS OFF UNLESS IT IS SWITCHED ON");
{
  ok(isMenuVariant("plain") && isMenuVariant("ring_out") && isMenuVariant("talks") && !isMenuVariant("whatever"),
    "only the menus he named can be picked");
  // The sixth, the one that TALKS instead of reading a list, was added 08-20 after CVS Branford:
  // its own bench lives in scripts/test-talking-menu.ts.
  ok(Object.keys(MENU_VARIANTS).length === 6, "six menus, and no seventh invented one");
  const src = readFileSync("src/calls/tapedeck.ts", "utf8");
  ok(/const menu = opts\?\.greeting \? null : await menuPick\(\);/.test(src),
    "a call answers with a menu only when one is switched on");
  ok(/const acts: RobotAct\[\] = menuSc\s*\n?\s*\? \[\.\.\.menuSc\.acts/.test(src.replace(/\r/g, "")),
    "and with no menu the acts are the Staff scene's own, exactly as they always were");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

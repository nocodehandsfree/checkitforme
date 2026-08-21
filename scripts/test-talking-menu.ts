// THE TALKING MENU, AND ANSWERING IT IN TIME (owner 08-20).
//
// CVS Branford has no press one, press two menu at all. It ASKS, and it gives up after about three
// seconds of silence. Four real calls died there on 08-20 because round two asked the model what to
// say at the moment each question was heard, which takes ten to twenty seconds: the assistant had
// already said "sorry, I'm not understanding" before our answer arrived, on every single question.
//
// The fix: round one listens and writes the questions down, the answers are worked out ONCE between
// the rounds with all the time in the world, and round two speaks them the moment it recognises a
// question, with nothing to think about on the line.
//
// This proves all of it on the robot store's sixth menu, which asks in CVS Branford's shape. No real
// store is dialed and no model is called: the answers are handed in exactly as the planner hands them
// to a run, and what is measured is the seconds from each question ending to our answer starting.
//
// Run: ./node_modules/.bin/tsx scripts/test-talking-menu.ts
import { readFileSync } from "node:fs";
import {
  MENU_VARIANTS, TALK_WINDOW_SEC, menuOptions, menuScene, isMenuVariant,
  robotStep, robotEnded, _menuRig, _menuRun,
} from "../src/calls/tapedeck";
import { _test as engine, setMappingHandoff } from "../src/calls/navigator";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const QUESTIONS = menuOptions("talks");
/** What the planner works out between the rounds. Handed in here so the bench needs no model. */
const PLAN = [
  { q: QUESTIONS[0], say: "no" },
  { q: QUESTIONS[1], say: "front of store services" },
  { q: QUESTIONS[2], say: "general store inquiries" },
];

console.log("\n▶ THE SIXTH MENU ASKS INSTEAD OF READING A LIST");
{
  ok(isMenuVariant("talks") && Object.keys(MENU_VARIANTS).length === 6,
    "there are six menus now, and the sixth is the one that talks");
  ok(QUESTIONS.length === 3, "it asks three questions, not a list of keys");
  ok(QUESTIONS[0] === "Are you a healthcare provider?", `its first question is "${QUESTIONS[0]}"`);
  ok(QUESTIONS[1] === "Pharmacy, or front of store services?", `its second is "${QUESTIONS[1]}"`);
  ok(/just say what you'd like/i.test(QUESTIONS[2]), "and its third reads its list and asks us to say what we want");
  const sc = menuScene("talks");
  ok(!sc.keys, "it has no key table at all, because it answers to words and not keys");
  ok(sc.talksAndGivesUp === true && sc.gaveUpLine === "Sorry, I'm not understanding.",
    `and when nobody answers in time it says "${sc.gaveUpLine}"`);
  ok(TALK_WINDOW_SEC === 3, "its window is three seconds, the one CVS Branford really gives");
}

console.log("\n▶ IT REALLY DOES GIVE UP, AND ASKS THE SAME QUESTION AGAIN");
{
  const { callSid: sid, first } = _menuRig("talks", { lineSecs: 3 });
  ok(new RegExp(`timeout="${TALK_WINDOW_SEC}"`).test(first),
    "the line is only held open for three seconds after it asks");
  const said = () => (_menuRun(sid)?.said || []).map((l) => l.text);
  ok(said().slice(-1)[0] === QUESTIONS[0], "it asks its first question and waits");
  robotStep(sid, "", "");            // nobody answers inside the window
  const after = said();
  ok(after.includes("Sorry, I'm not understanding."), "nothing said in time, so it says it did not understand");
  ok(after.slice(-1)[0] === QUESTIONS[0], "and asks the SAME question again, never starting the whole menu over");
  robotEnded(sid);
}

console.log("\n▶ ROUND ONE WRITES THE QUESTIONS DOWN, SAYING NOTHING");
{
  setMappingHandoff(async () => { throw new Error("round one must never hand a check to Charlie"); });
  engine.open({ id: "talk-listen", listenOnly: true, relisten: true, stage: "map" } as never);
  let at = 4;
  for (const q of QUESTIONS) {
    engine.at("talk-listen", at); at += 5;
    const out = await engine.step("talk-listen", q);
    ok(!/<Say/.test(out), `nothing is said at "${q.slice(0, 40)}…"`);
  }
  const heard = (engine.get("talk-listen")?.steps || []).filter((st) => st.who === "ivr").map((st) => String(st.text));
  ok(heard.join(" | ") === QUESTIONS.join(" | "), "all three questions are written down, in the store's own words");
  engine.end("talk-listen");
  setMappingHandoff(async () => null);
}

console.log("\n▶ ROUND TWO ANSWERS EACH ONE INSIDE THE WINDOW");
{
  // The seconds measured are from the question ENDING to our answer STARTING, which is what the store's
  // own window is counted against. No model is called on the line at all.
  setMappingHandoff(async () => null);
  engine.open({ id: "talk-prove", confirm: { product: "Pokémon cards" }, stage: "map", answerPlan: PLAN } as never);
  const gaps: Array<{ q: string; say: string; secs: number }> = [];
  let at = 4;
  for (const q of QUESTIONS) {
    engine.at("talk-prove", at);
    const t0 = Date.now();
    const out = await engine.step("talk-prove", q);
    const secs = (Date.now() - t0) / 1000;
    const m = out.match(/<Say voice="Polly\.Joanna">([^<]*)<\/Say>/);
    const say = m ? m[1] : "";
    gaps.push({ q, say, secs });
    ok(!!say, `it answers "${q.slice(0, 34)}…" out loud`);
    ok(secs < TALK_WINDOW_SEC, `and it answers in ${secs.toFixed(2)}s, inside the store's ${TALK_WINDOW_SEC}s window`);
    at += 5;
  }
  ok(gaps[0].say === "no", `its answer to the healthcare question is "${gaps[0].say}"`);
  ok(gaps[1].say === "front of store services", `to the department question, "${gaps[1].say}"`);
  ok(gaps[2].say === "general store inquiries", `and to the open one, "${gaps[2].say}"`);
  const worst = Math.max(...gaps.map((g) => g.secs));
  ok(worst < 0.5, `the slowest of the three took ${worst.toFixed(3)}s, because nothing was thought about on the line`);
  console.log(`\n  SECONDS FROM EACH QUESTION ENDING TO OUR ANSWER STARTING, round two, the talking menu:`);
  for (const g of gaps) console.log(`    ${g.secs.toFixed(3)}s  "${g.q}"  ->  "${g.say}"`);
  engine.end("talk-prove");
}

console.log("\n▶ A QUESTION NOBODY PREPARED FOR STILL TAKES THE SLOW PATH");
{
  // Never guess fast, never stall silently. A line that is not on the list is not answered from the
  // list at all, and its words are written down so the next round holds it.
  setMappingHandoff(async () => null);
  engine.open({ id: "talk-new", confirm: { product: "Pokémon cards" }, stage: "map", answerPlan: PLAN } as never);
  engine.at("talk-new", 4);
  await engine.step("talk-new", "Would you like to hear about our rewards programme?");
  const s = engine.get("talk-new")!;
  ok((s.steps || []).some((st) => st.who === "ivr" && /rewards programme/.test(String(st.text))),
    "the question we never heard before is written down");
  ok(!(s.steps || []).some((st) => st.who === "us" && st.plannedFor),
    "and no prepared answer is fired at it, because none was prepared for it");
  engine.end("talk-new");
}

console.log("\n▶ THE ANSWERS ARE WORKED OUT BETWEEN THE ROUNDS, NEVER ON THE LINE");
{
  const eng = readFileSync("src/calls/mapper.ts", "utf8");
  const nav = readFileSync("src/calls/navigator.ts", "utf8");
  ok(/export async function planAnswers/.test(eng),
    "the answers are worked out in one place, off the phone");
  ok(/run\.answerPlan = await planAnswers\(\{/.test(eng),
    "and worked out the moment round one lands, between the rounds");
  ok(/answerPlan: listening \? undefined : run\.answerPlan,/.test(eng),
    "they ride onto every later check of the run, and never onto the listening round");
  ok(/const hit = \(s\.answerPlan \|\| \[\]\)\.find\(\(a\) => a\.say && sameMenu\(a\.q, speech\)\);/.test(nav),
    "round two matches a line against the questions it prepared for");
  const fast = nav.indexOf("const hit = (s.answerPlan || []).find");
  const slow = nav.indexOf("const d = await decide(s, speech || \"\");");
  ok(fast > 0 && slow > fast, "and it speaks the prepared answer BEFORE it would ever ask the model");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

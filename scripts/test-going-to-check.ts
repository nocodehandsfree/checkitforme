// EVERY WAY STAFF SAY "I AM STEPPING AWAY" — the listener's own suite (owner's build, 08-19).
//
// Run: ./node_modules/.bin/tsx scripts/test-going-to-check.ts   (and it runs on every build, in
// test-all.sh, so a phrase we have already been taught can never go quietly missing again).
//
// WHY THIS FILE EXISTS. `saidGoingToCheck` is the one thing that tells the engine a quiet line is
// Staff walking off rather than Staff thinking. Get it wrong one way and Charlie bills through a
// wait nobody is in (check 386: "Let me put this down a sec and go check." was missed, and he ran
// 20 metered seconds through a hold the ear had already spotted). Get it wrong the OTHER way and he
// is dropped in the middle of a person taking a beat, which is the 08-08 inversion and it costs the
// answer. So the positives below are the money, and the negatives below are the safety, and both
// halves are the test.
//
// WHERE THE LINES COME FROM. Every group is marked. The ones marked REAL are verbatim from a real
// check or from a committed robot store script; `docs/team/voice-calls/how-staff-actually-talk.md`
// is the owner's own record of how Staff really talk and several come straight out of it. The rest
// are ordinary English for the same act, written to cover the shapes those real lines take.
// The list only ever GROWS: a phrase that turns up on a real check gets added here, never removed.
import { saidGoingToCheck } from "../src/voice/prompts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (!c) console.log(`  ✗ ${m}`); c ? pass++ : fail++; };

/** Staff are telling us they are about to leave the line. Every one of these MUST be heard. */
const ANNOUNCES: Array<[string, string[]]> = [
  ["1. Asking us to hold, plainly", [
    "Please hold.",
    "Hold please.",
    "Can you hold?",
    "Could you hold for a moment?",
    "Would you mind holding?",
    "Do you mind holding?",
    "Can you hold on a second?",
    "Hold on.",                                  // REAL, how-staff-actually-talk.md
    "Hold on just a moment.",                    // REAL, check 135
    "Hold on a sec.",
    "Hold the line for me.",
    "Please hold the line.",
    "If you can hold, I'll be right with you.",
    "Let me put you on hold.",                   // REAL, how-staff-actually-talk.md
    "Okay, let me just put you on hold.",        // REAL, how-staff-actually-talk.md
    "I'm gonna put you on hold real quick.",
    "I'll put you on a brief hold.",
    "You're on hold for one second.",
    "Holding you for just a moment.",
  ]],
  ["2. Going to look, in their own words", [
    "Let me check.",                             // REAL, how-staff-actually-talk.md
    "Let me check on that for you.",             // REAL, robot scene 20
    "Let me go look.",                           // REAL, robot scene 23
    "Let me go and see for you.",                // REAL, robot scene 21
    "Let me have a look.",
    "I'll go have a look.",
    "One moment, I'll go and have a look.",      // REAL, robot scene 22
    "Let me double-check.",                      // REAL, check 120
    "Um, give me just a second. Let me double-check.",  // REAL, check 391 and how-staff-actually-talk.md
    "Let me go check the back.",
    "Let me run to the back and look.",
    "I'll go check the stockroom.",
    "I'm gonna go check real quick.",
    "Let me go look on the shelf.",
    "I'll have to go up to the front and see.",  // REAL, how-staff-actually-talk.md
    "Let me walk over and check.",
    "Let me go see what we have.",
    "I'll go and take a look for you.",
    "Let me look that up.",
    "Let me look in the system.",
    "I'll check the computer.",
    "Let me pull it up.",
    "I'm going to look in the back.",
    "Gonna go check on that.",
    "Let me verify that for you.",
    "I'll go find out.",
    "Let me find out for you.",
  ]],
  ["3. Putting the phone down", [
    "Putting the phone down for a sec.",
    "Let me put the phone down for a second.",
    "Let me put this down a sec and go check.",  // REAL, check 386, the one that was missed
    "I'm gonna set the phone down.",
    "Let me set this down for a minute.",
    "I'll set the phone down here.",
    "Let me put you down for a second.",
    "I'm putting you down for a sec.",
    "Let me lay the phone down.",
    "I'm gonna set you down real quick.",
  ]],
  ["4. Asking us to wait", [
    "One moment.",                               // REAL, robot scene 22
    "One second.",
    "One minute.",
    "Just a moment.",
    "Just a second.",                            // REAL, how-staff-actually-talk.md
    "Just a sec.",
    "Just a minute.",
    "Give me a second.",
    "Give me a minute.",
    "Give me one moment.",
    "Give me just a moment here.",
    "Bear with me.",
    "Bear with me a second.",
    "Hang on.",                                  // REAL, robot scene 21
    "Hang on a sec.",
    "Hang tight.",
    "Hang tight for me.",
    "Stay with me a second.",
    "Stand by.",
    "Sit tight for a sec.",
    "Wait one second please.",
    "If you can wait a moment.",
    "Two seconds.",
    "Two minutes.",
    "A couple seconds.",
    "Just one sec.",
  ]],
  ["5. Going to ask somebody else", [
    "Let me ask.",
    "Let me ask somebody.",
    "Let me ask my manager.",
    "Let me go ask the manager.",
    "I'll ask someone who knows.",
    "Let me grab someone who can help.",         // the 'grab' family the listener already knew
    "Let me get somebody for you.",
    "I'll go get someone.",
    "Let me find someone to help you.",          // REAL, how-staff-actually-talk.md (a CVS menu line)
    "Let me see if anybody knows.",
    "I'll go ask the guy in the back.",
    "Let me check with my coworker.",
  ]],
  ["6. Saying they will be back", [
    "I'll be right back.",
    "Be right back.",
    "I'll be back in a second.",
    "I'll be right with you.",
    "Be with you in a moment.",
    "I'm gonna be right back with you.",
    "Right back with you.",
    "I'll come right back to you.",
    "Give me a second and I'll be back.",
    "I'll be a minute.",
    "This'll just take a second.",
    "It'll be just a moment.",
  ]],
  ["7. Sorry, and softened", [
    "Sorry, can you hang on?",
    "Sorry, one sec.",
    "Sorry, give me a moment.",
    "Sorry about that, let me check.",
    "Apologies, could you hold a second?",
    "If you don't mind holding a moment.",
    "Would you hold for me please?",
    "Excuse me one moment.",
    "Excuse me for a second.",
    "Let me just check something.",
    "Let me just see here.",
    "Let me just look real quick.",
    "Hold up.",
    "Hold up a sec.",
    "Wait a sec.",
    "Wait just a moment.",
    "Checking on that for you.",                 // the 'checking on that' family already known
    "I'm checking for you now.",
  ]],
];

/** …and every one of THESE must never be heard as walking away. This half is the safety: a false
 *  yes here means the next quiet drops Charlie while Staff are still standing there thinking. */
const NEVER: string[] = [
  // Real answers off real checks — the moment a false drop would cost the answer.
  "Yeah. We've got some in.",                    // REAL, check 384
  "Yeah. We do have those in.",                  // REAL, check 393
  "It's the pitch black boxes.",                 // REAL, check 384
  "Pitch black the booster boxes.",              // REAL, check 383
  "Yeah, we've got a few of those.",             // REAL, check 383
  "We haven't, as a matter of fact.",            // REAL, how-staff-actually-talk.md
  "It's not out yet, but we did get some.",      // REAL, check 107
  "No, we're all out.",
  "We don't carry those.",
  "Larry Vásquez. How can I help you?",          // REAL, the robot store's greeting
  "Thank you for holding. This is Staples. How can I help you?",   // REAL, how-staff-actually-talk.md
  // The words the listener listens for, used to mean something else entirely.
  "We hold those behind the counter.",
  "We can hold one for you if you want.",
  "Hold on to your receipt.",
  "We don't hold items, sorry.",
  "They're in the second aisle.",
  "Check it out on our website.",
  "You can check online.",
  "The checkout is over there.",
  "Did you check the website?",
  "We look forward to seeing you.",
  "That looks like the last one.",
  "It's a minute from here.",
  "We close in an hour.",
  "I've been here a minute.",
  "Let me know if you need anything else.",
  "Let me tell you what we have.",
  "Let me be honest with you, they sell fast.",
  "Ask for me when you come in.",
  "I'll see you then.",
  "See you in a bit.",
  "Come back any time.",
  "Second one this week.",
  "Just a heads up, they go quick.",
  "Just so you know, we restock Tuesdays.",
];

console.log("▶ every way Staff say they are stepping away IS heard");
for (const [group, lines] of ANNOUNCES) {
  console.log(`  ${group} (${lines.length})`);
  for (const l of lines) ok(saidGoingToCheck(l), `MISSED: "${l}"`);
}
console.log("▶ …and none of these is ever mistaken for it");
for (const l of NEVER) ok(!saidGoingToCheck(l), `FALSE ALARM: "${l}"`);

const total = ANNOUNCES.reduce((n, [, l]) => n + l.length, 0);
console.log(`\n  ${total} ways of saying it · ${NEVER.length} that must never fire`);
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

// Unit: "No clear answer", the owner's NEW status (08-07), and the line it draws against Couldn't
// tell. Pure function, no DB and no network.
//
// WHY THIS TEST EXISTS. Couldn't tell is the WORST CASE bucket and the owner wants it used as rarely
// as possible: it means we could not make out what the person was saying. A store that talked to us
// clearly and simply never answered is a different thing and gets its own word. The whole difference
// is the two halves below, so the two halves are what this locks: we understood them, and we went
// back at it. Get either one wrong and every ordinary short check starts claiming effort we never
// spent, or the rambler goes on wearing the word for our own deafness.
import { keptAskingNoStraightAnswer as kept, billableOutcome } from "../src/calls/service";

let fail = 0;
const is = (got: unknown, want: unknown, label: string) => {
  if (got === want) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`); fail++; }
};

// THE RAMBLER, which is scene 13 and the case this status was named for. Every word of theirs is on
// the record and none of it is an answer.
const rambler = [
  "Clerk: Oh, Pokemon cards, yeah. We get a ton of calls about those, honestly.",
  "Agent: Ha, I bet! So do you have any in stock right now?",
  "Clerk: You know my nephew collects them. He's got a whole binder, must be hundreds.",
  "Agent: That's great. Sorry, just so I know, do you have any on the shelf today?",
  "Clerk: There was a guy in here last week, bought like twenty packs at once. Twenty.",
].join("\n");
is(kept(rambler), true, "the rambler: we understood every word and asked twice");

// WE COULD NOT MAKE OUT WHAT THEY SAID. This is the one case Couldn't tell was always for, and it
// must stay Couldn't tell: their whole side of the record is a fragment.
const garbled = [
  "Clerk: Pokemon?",
  "Agent: Hi there, do you have any Pokemon cards in stock right now?",
  "Clerk: uh",
  "Agent: Sorry, could you say that again?",
].join("\n");
is(kept(garbled), false, "a fragment on their side stays Couldn't tell, never this");

// WE ONLY ASKED ONCE. A check that ended early is not a check where we kept asking, and saying so
// would be the screen claiming effort we never spent.
const askedOnce = [
  "Clerk: Larry Vasquez, how can I help you?",
  "Agent: Hi there, do you have any Pokemon cards in stock right now?",
  "Clerk: Uh, hang on, let me go and have a look for you.",
].join("\n");
is(kept(askedOnce), false, "one question is not “we kept asking”");

// HIS WARMTH IS NOT A QUESTION. Counting "oh nice!" as an ask would turn every check into this one.
const warmth = [
  "Clerk: Yeah, we've got a bunch of that stuff in.",
  "Agent: Hi there, do you have any Pokemon cards in stock right now?",
  "Clerk: I mean, we get all sorts of things through here really.",
  "Agent: Oh nice!",
].join("\n");
is(kept(warmth), false, "a warm line with no question mark does not count as asking again");

is(kept(""), false, "nothing on the record is not this status");
is(kept(null), false, "no record at all is not this status");

// THE MONEY. A real person talked to us and burned real minutes, so the owner's 07-22 ruling charges
// it, exactly as it already charges an unclear call that was a real two-way conversation.
is(billableOutcome("no_straight_answer", false, rambler), true, "No clear answer is charged: a person really talked to us");
is(billableOutcome("nobody_answered", false, null), false, "nobody answering is still free");

console.log(fail ? `\n${fail} FAILED\n` : "\nno-straight-answer: all held\n");
process.exit(fail ? 1 : 0);

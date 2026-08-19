// Unit test for the canonical agent prompts + voice defaults. Run: ./node_modules/.bin/tsx scripts/test-prompts.ts
// Guards the dynamic-variable contract: the live ElevenLabs agent fills {{...}} placeholders, so if
// one silently disappears from the prompt the call breaks. These assertions fail loudly instead.
import { RESTOCK_PROMPT, specificityClause, kioskNote, departmentNote, SET_EXAMPLE, VOICE_DEFAULTS, heardWrongDepartment, looksLikeAMenu, staffName, wrappedUp, usedTheirName, JOINING_RULE, joiningPrompt, midCallAgentPatch } from "../src/voice/prompts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE OWNER'S APPROVED REWRITE (approved 08-04 and 08-05; spec:
// docs/specs/charlie-behavior/instructions-proposed.md). HIS WORDS ARE THE SPEC, so this file asserts
// them WORD FOR WORD rather than by keyword. A keyword test passes on a paraphrase, and a paraphrase
// of these sections is exactly the failure this rewrite exists to end.
// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log("▶ Charlie's words, section by section, word for word");
const says = (line: string, what: string) => ok(RESTOCK_PROMPT.includes(line), what);

says("You're on the phone with a Staff member at a retail store to find out if they have {{category}} in stock.", "1. who he is");
says("(Personality shapes how you sound. It never overrides a rule.)", "2. personality never overrides a rule");
says("You want ONE thing: can a customer walk in and buy {{category}} right now. Get that answer and get off the phone.", "3. the one thing he wants");
says("If nothing above says otherwise, ANY {{category}} in stock is a YES.", "3. any of them counts on a general check");
says(`A "let me check" is NOT your answer yet, WAIT for it. THIS IS CRITICAL.`, "6. a let me check is not the answer");
says("The system holds the check while they're away and brings you back when a person is talking to you again.", "6. the system holds the check, he does not");
says(`Hanging up on a "let me check" is the worst thing you can do, you'll report the wrong answer.`, "6. …and hanging up on one is the worst thing he can do");
says("That is a NO, never unclear.", "7. sold out is a no, never unclear");
says("Nothing is in stock and no restock is coming.", "8. a store that never sells it");
says("Once the answer is settled, never confirm it again and never re-ask anything Staff already gave.", "9. the settle law");
// CORRECTED 08-05, owner approved. "one short question at a time" was the ONLY line in the whole
// document that could be read as permission to keep asking, and section 10's "never ask a second
// question about it" left room to argue a re-ask was a different question. Both are gone.
says("ask only what this check still needs, and ask it once and only once", "9. …and it is asked ONCE, never 'one at a time'");
ok(!RESTOCK_PROMPT.includes("one short question at a time"), "…the line that read as permission to keep asking is gone");
says("never ask again, no matter how little they gave you", "10. half an answer is still the answer, and he never asks again");
// RESTORED 08-05 (check 290): Staff answered the set question with "We do.", which answers nothing,
// and he repeated the question word for word. The old words had this rule, the clean 08-04 runs
// wrapped on "We do." with it in place, and the rewrite had dropped it.
says(`If their reply does not fit your question, like another "yeah" or a "we do", and they are not going off to check, that still counts as their answer`,
  "10. a reply that fits nothing still counts as the answer");
says("never repeat the question in any wording, thank them warmly and wrap up", "10. …and the answer to it is the goodbye, never the question again");
says("that is about how you phrase things, never permission to ask again", "12. varying his wording is not permission to re-ask");
says("Always keep a real set name in the question so Staff know what you mean.", "10. a real set name stays in the question");

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR EDITS THE OWNER APPROVED 08-06, copied word for word from his own document. Off his check
// 348: Staff went to look, came back with "It's black boxes, I think.", and the check came back Not
// in stock; and Charlie, who had just been told the package, asked for the package again and then
// corrected himself out loud mid sentence.
// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n▶ the four edits of 08-06");
says(`Staff might not always say the word yes, and often answer vaguely by describing what they see. If they describe what they have on the shelf, like "it's black boxes", "we've got the little packs", or "just the tins", that is a YES.`,
  "3. describing what they have on the shelf is a YES");
says("When the {{category}} is in stock, ask ONE question and only one, for whatever Staff have not already told you.",
  "10. one question, and only for what he was not already told");
says("If they have given both the set name and the package type, ask nothing, thank them warmly and wrap up.",
  "10. both given, he asks nothing at all");
says(`If they have described the package, like "it's black boxes", ask only for the set name: "oh nice, do you know the name of the set, like {{set_example}}?".`,
  "10. package given, he asks only the set name");
says(`If they have given only the set name, ask only for the package type: "oh nice, is it a pack or a box?".`,
  "10. set given, he asks only the package");
says(`If they have given neither, ask for both in a single sentence: "oh nice, do you know the name of the set, like {{set_example}}, and is it a pack or a box?".`,
  "10. neither given, both in ONE sentence");
says(`When nothing is in stock, ask only one question, and ask it in one sentence: "got it, do you know what day and time you might get more in?".`,
  "11. the restock question, one sentence");
says("If Staff give you a day and a time, thank them warmly and wrap up.", "11. day and time given, he wraps up");
says(`If they give you only a day, like "check back tomorrow", ask only for the time: "oh nice, any idea what time?".`,
  "11. only a day, he asks only the time");
says(`If they only say more is coming, like "we're getting some soon", ask for the day and the time together, exactly as you asked the first time.`,
  "11. only 'soon', he asks the day and time together once more");
says(`Take whatever they answer, even "soon", and never ask a third time.`, "11. never a third restock question");
says(`Never correct yourself out loud and never think out loud. No "wait", no "actually", no "you already said". Finish your sentence in your head, then say only the finished sentence.`,
  "12. he never corrects himself out loud, the check 348 fault by name");
// BEING ASKED TO REPEAT IS THE ONE EXCEPTION (owner 08-07). He went silent when Staff asked him to
// repeat, which loses the check. The guard sentence is the load-bearing half: without it, "they did
// not understand me" becomes his excuse to re-ask the set question, the 08-06 fault all over again.
says("Stores are noisy and Staff will not always catch you.", "12. the noisy store is named");
says("say the same question again once, plainly and a little slower", "12. asked to repeat, he says it once more");
says("That is the only time you ever say a question twice.", "12. and it is the ONLY exception");
says("If they answer it and you simply do not like the answer, that is still their answer, never a reason to ask again.",
  "12. a disliked answer is never an excuse to ask again");
ok(RESTOCK_PROMPT.indexOf("Stores are noisy") < RESTOCK_PROMPT.indexOf("Never correct yourself out loud"),
  "…and the exception sits with the never-repeat rules, not adrift");
// The old words asked for the set AND the package every time, however much Staff had already given,
// and allowed exactly one restock question however little came back. Both are replaced, not added to.
ok(!RESTOCK_PROMPT.includes("ask one question, in your own words, for the set name and whether it comes in packs, boxes, or tins"),
  "…and the old question that asked for both no matter what is gone");
ok(!RESTOCK_PROMPT.includes("Never ask a second restock question."), "…and the old one-restock-question line is gone");
says("At most ONE exclamation mark in an entire call, and never on the goodbye", "12. one exclamation mark, never on the goodbye");
says("If Staff speak Spanish, continue in Spanish.", "12. he follows Staff into Spanish");
says("If Staff gave you their name, use it once during the check", "14. their name, used once");

// THE THREE ADDITIONS THE OWNER CLEARED ON TOP OF THE SPEC (PM, 08-05). Each is one sentence or one
// clause, and each closes a hole the sections could not close alone.
console.log("\n▶ the three cleared additions");
// REWORDED 08-05 after check 289: the first cut said "when nobody is talking to you, use skip_turn",
// and the pause right after Staff's one word answer IS nobody talking, so he used it on a real
// answer, went quiet, and was dropped. skip_turn is now tied to WAITS by name, and the words say
// outright that a finished answer is his turn.
says("Use skip_turn only while you are WAITING, through ringing, hold music, or Staff stepping away, and never speak into a wait.",
  "12. skip_turn is for waits only, named as waits");
says("The moment Staff finish telling you something, it is your turn, answer right away", "12. a finished answer is his turn");
says(`even a one word answer like "yeah" is a complete answer, never something to wait through`, "12. a one word answer is complete, the 289 fault by name");
ok(!RESTOCK_PROMPT.includes("When nobody is talking to you"), "…and the line that fired on a real answer is gone");
says("thank Staff warmly and end the check with end_call.", "9. the settle commands end_call by name");
says("Say goodbye once, then end the check with end_call.", "14. the goodbye commands end_call by name");
says("The set question below comes only after the yes is settled.", "3→10. the set question waits for the settled yes");
// The bridge has to sit in section 3, ahead of the question it governs, or it is just a restatement.
ok(RESTOCK_PROMPT.indexOf("The set question below comes only after the yes is settled.")
   < RESTOCK_PROMPT.indexOf("When the {{category}} is in stock, ask ONE question and only one"),
  "…and the bridge is read BEFORE the set question it governs");
// The vague yes goes IN section 3, ahead of that same bridge, so the yes is settled by describing
// what they have BEFORE anything sends him on to the set question (owner's edit 08-06).
ok(RESTOCK_PROMPT.indexOf("that is a YES.") < RESTOCK_PROMPT.indexOf("The set question below comes only after the yes is settled."),
  "3. …and describing what they have settles the yes before that bridge");

console.log("\n▶ the dynamic-variable contract: what fills, and what RETIRED");
for (const v of ["{{category}}", "{{personality}}", "{{clarification}}", "{{kiosk_note}}",
                 "{{department_note}}", "{{set_example}}", "{{special_instructions}}"]) {
  ok(RESTOCK_PROMPT.includes(v), `prompt injects ${v}`);
}
// RETIRED SPOTS (builder notes). A retired variable that creeps back is not cosmetic: nothing fills
// it any more, so the provider refuses the call at the moment a real person has picked up.
for (const v of ["{{kiosk_mode}}", "{{ask_for_transfer}}", "{{phone_tree}}", "{{other_categories}}",
                 "{{voicemail_policy}}", "{{retailer_name}}", "{{location}}", "{{ask_shipment_day}}",
                 "{{premium_followup}}"]) {
  ok(!RESTOCK_PROMPT.includes(v), `${v} is retired and gone`);
}
// {{opening_line}} survives inside the joining note ONLY: Delta asks the question now, so the words
// Charlie reads must never contain the question again.
ok(!RESTOCK_PROMPT.includes("{{opening_line}}"), "{{opening_line}} is gone from Charlie's own words");
ok(JOINING_RULE.includes("{{opening_line}}"), "…and survives inside the joining note, which is where it belongs");

// NO DASHES, ANYWHERE (the owner's binding rule over this rewrite: they read strangely through
// ElevenLabs). Every builder is checked, not just the base, because an insert is read aloud too.
console.log("\n▶ no dashes in anything Charlie reads or says");
const DASH = /[—–]|(?<=\s)-(?=\s)/;
for (const [what, text] of [
  ["the base words", RESTOCK_PROMPT],
  ["the joining note", JOINING_RULE],
  ["the kiosk insert", kioskNote("Pokémon", true)],
  ["the wrong-department insert", departmentNote("Pokémon", true)],
  ["the no-transfer line", departmentNote("Pokémon", false)],
  ["the specific-product clause", specificityClause("Pitch Black booster box")],
] as Array<[string, string]>) ok(!DASH.test(text), `no dash in ${what}`);

console.log("\n▶ the tools he is told to command, by name");
ok(/end_call/.test(RESTOCK_PROMPT), "prompt commands end_call by name");
ok(/skip_turn/.test(RESTOCK_PROMPT), "prompt commands skip_turn by name");
ok(/ONE short sentence/i.test(RESTOCK_PROMPT), "prompt enforces one-short-sentence replies");

// INSERT OR NOTHING. The whole point of the rewrite's shape: a section that does not apply is not
// present as prose Charlie has to reason about, it is ABSENT. A flag left in the words is what made
// him ask to be put through twice on 08-01.
console.log("\n▶ insert or nothing");
ok(kioskNote("Pokémon", false) === "", "not a kiosk check → the kiosk section is nothing at all");
ok(kioskNote("Pokémon", true).includes("self-serve vending machine, not a shelf"), "a kiosk check → the words themselves");
ok(kioskNote("Pokémon", true).includes("Pokémon"), "…with the category written in, never left as a variable");
ok(!kioskNote("Pokémon", true).includes("{{"), "…and no variable survives inside an inserted section");
ok(!/flag/i.test(RESTOCK_PROMPT), "no flag prose survives anywhere in his words");
ok(!/only applies when/i.test(RESTOCK_PROMPT), "…and no 'only applies when' switch either");

console.log("\n▶ landing in the wrong department (section 5): two texts, never nothing");
const mayAsk = departmentNote("Pokémon", true), mayNot = departmentNote("Pokémon", false);
ok(mayAsk.includes(`"oh gotcha, could you put me through to whoever handles the Pokémon?"`), "it asks to be put through in the owner's words, with the category written in");
ok(mayAsk.includes("Never ask a second time on a check."), "…only once on a check, which is the fault it exists for");
ok(mayAsk.includes("your recorded question plays again and you carry on from their answer"), "…and Delta re-asks when somebody new picks up, he does not");
ok(mayAsk.includes("wrap up warmly and end_call"), "…and nobody to transfer to ends the check honestly");
ok(mayNot === "If Staff cannot answer about Pokémon, never ask to be put through, take whatever answer they can give and wrap up.", "transfer off → the one line, word for word");
ok(mayNot.length > 0 && mayAsk.length > 0, "section 5 is never empty: it is two texts, not insert-or-nothing");

console.log("\n▶ the set name example comes from the site's catalog (builder note)");
ok(RESTOCK_PROMPT.includes("like {{set_example}}, and is it a pack or a box?"), "the example question carries the catalog's set name");
ok(!RESTOCK_PROMPT.includes("Chaos Rising"), "the hand-written set name is gone from the words");
ok(SET_EXAMPLE === "Chaos Rising", "…and the floor under an unreadable catalog is never a blank example");

console.log("\n▶ specificityClause: a general check inserts nothing");
ok(specificityClause() === "", "no product → empty clause");
ok(specificityClause(undefined) === "", "undefined product → empty clause");
ok(specificityClause("") === "", "empty string → empty clause");
ok(specificityClause("   ") === "", "whitespace-only → empty clause (trimmed)");

console.log("▶ specificityClause: a check for one exact product");
const c = specificityClause("  Surging Sparks booster box  ");
ok(c === `A YES on this check means one exact item is in right now, anything else is a no. If yes or no is unclear, ask once, warmly, "do you have a Surging Sparks booster box in stock?".`,
  "the owner's approved sentence, word for word, with the catalog's item written in");
ok(!c.includes("  Surging Sparks"), "input is trimmed before interpolation");
ok(!c.includes("{{"), "no variable is left for the provider to fill inside an inserted value");

console.log("▶ heardWrongDepartment: it fired");
for (const [line, why] of [
  ["Hi, this is the pharmacy.", "another counter"],
  // HOW A COUNTER ACTUALLY ANSWERS THE PHONE. Three of the owner's six test checks open like this.
  ["Pharmacy, this is Joe.", "another counter"],
  ["Pharmacy", "another counter"],
  ["Photo, how can I help you?", "another counter"],
  ["Deli.", "another counter"],
  ["Thanks for calling, pharmacy speaking.", "another counter"],
  ["You've reached the photo lab, hon.", "another counter"],
  ["Yeah we're the deli, what do you need?", "another counter"],
  ["Oh that's a different department.", "wrong department"],
  ["Sorry, cards aren't my department.", "wrong department"],
  ["You'll want the front store for that.", "the front of the store"],
  ["You need to call the front desk.", "the front of the store"],
  ["Hold on, let me transfer you to somebody who knows.", "put us through"],
  ["I'll put you through to the front.", "put us through"],
  // A REAL hand-over still has to fire after the "put you on hold" fix below. The verb plus a
  // direction, or the verb plus who we are being given to, is what a hand-over always says.
  ["Let me transfer you to a different department.", "wrong department"],
  ["I'll put you on with the manager.", "put us through"],
  ["Let me get you over to somebody in toys.", "put us through"],
] as Array<[string, string]>) {
  const r = heardWrongDepartment(line);
  ok(!!r && r.why.toLowerCase().includes(why), `"${line}" → ${r ? r.why : "NOTHING"}`);
  ok(!!r && r.said === line, `it keeps what Staff actually said, for the evidence`);
}
ok(heardWrongDepartment("Hi, this is the pharmacy.")!.why.includes("Staff"), "the reason says Staff, the word the owner reads");
// STAFF MOVING US IS ITS OWN FACT, and it is the one that predicts the next wait. Being told we are in
// the wrong place does not: nobody is carrying the phone anywhere until somebody asks.
ok(heardWrongDepartment("Let me transfer you to a different department.")!.handingOver === true, "Staff saying they will move us marks a hand-over as coming");
ok(heardWrongDepartment("I'll put you through to the front.")!.handingOver === true, "…however they word it");
ok(heardWrongDepartment("Hi, this is the pharmacy.")!.handingOver === undefined, "being told where we landed is NOT somebody carrying the phone away");
ok(heardWrongDepartment("You'll want the front store for that.")!.handingOver === undefined, "…nor is being told where to call instead");

console.log("▶ heardWrongDepartment: it stayed quiet (a false positive files drift on a healthy route)");
for (const line of [
  "The pharmacy is closed right now but the store is open.",
  // MENTIONING a counter is not ANSWERING as one. The name has to end the clause or run into a
  // greeting; more sentence after it means nobody announced themselves.
  "The deli closes at eight if you need anything.",
  "Pharmacy hours are nine to six.",
  "Let me check with the front for you.",
  "Hold on, I'll go look in the back.",
  "Yeah we've got some Pokemon packs in.",
  "We don't carry those, sorry.",
  "No worries, take your time.",
  "I'm going to transfer you to voicemail.",
  "Thanks for calling, have a good one.",
  // GOING AWAY TO LOOK IS NOT BEING HANDED ON, and these are the sentences stores actually use.
  // The first one is verbatim off the owner's own check on 07-31, which was read as a wrong
  // department, put a cross on his scorecard, and filed drift against a route that was perfectly fine.
  "I have to go check, okay? I'm gonna put you on hold.",
  "Hold on a sec.",
  "Let me go check.",
  "Give me a sec.",
  "I'm busy with a customer, can you hold?",
  "Can I put you on hold for a minute?",
  "Let me put you down for one second.",
  "",
  "   ",
]) {
  ok(heardWrongDepartment(line) === null, `"${line}" → nothing`);
}
ok(heardWrongDepartment("x".repeat(400))?.said === undefined, "no match on noise");
ok((heardWrongDepartment("this is the pharmacy " + "y".repeat(400))?.said || "").length === 200, "what Staff said is capped at 200 characters for the review item");

console.log("▶ VOICE_DEFAULTS: sane tuning ranges");
ok(VOICE_DEFAULTS.speed > 0.5 && VOICE_DEFAULTS.speed <= 1.2, "speed is in a sane range");
ok(VOICE_DEFAULTS.stability >= 0 && VOICE_DEFAULTS.stability <= 1, "stability is a 0..1 fraction");
ok(VOICE_DEFAULTS.similarityBoost >= 0 && VOICE_DEFAULTS.similarityBoost <= 1, "similarityBoost is a 0..1 fraction");
ok(VOICE_DEFAULTS.maxTokens > 0 && VOICE_DEFAULTS.maxTokens <= 200, "maxTokens stays small to keep replies short");
ok(typeof VOICE_DEFAULTS.modelId === "string" && VOICE_DEFAULTS.modelId.length > 0, "a TTS modelId is set");
ok(typeof VOICE_DEFAULTS.llm === "string" && VOICE_DEFAULTS.llm.length > 0, "an agent-brain llm is set");

// THE MENU TEST (round 2, item 4). A hand-over that lands back in the store's recorded menu is read
// off the MENU'S OWN WORDS, because the Ear may never judge this (runtime spec section 10). The risk
// runs both ways: miss it and the owner never sees a thing he says happens often; claim it wrongly
// and a working hand-over reads as a failure. So both directions are asserted.
console.log("\n▶ a store's recorded menu is known by its own words, and a person is never mistaken for one");
{
  const menus = [
    "Thank you for calling. For the pharmacy, say pharmacy.",
    "To repeat these options, press 9.",
    "Please listen carefully to the following options.",
    "Returning you to the main menu.",
    "For prescriptions, press 1. For everything else, press 0.",
    "Please say the name of the department you want.",
  ];
  for (const m of menus) ok(looksLikeAMenu(m), `menu: "${m}"`);
  const people = [
    "Sure, hold on, I'll put you through to the front for you.",
    "This is the pharmacy, let me transfer you.",
    "Thanks for calling MVP's, this is Larry, how can I help you?",
    "We did not receive any today.",
    "I'm sorry, we're sold out of those right now.",
    "Yeah, I did not see any, unfortunately.",
    "Let me press on and check the back for you.",
    "Hold on one second, let me go check.",
  ];
  for (const p of people) ok(!looksLikeAMenu(p), `a person: "${p}"`);
}


console.log("\n▶ their name, when Staff give one (round 1, item 1.3)");
{
  const named: Array<[string, string]> = [
    ["Fun store, this is Bob, how can I help you?", "Bob"],
    ["Thanks for calling MVP's, this is Larry, how can I help you?", "Larry"],
    ["Hello, Maria speaking.", "Maria"],
    ["Hi, my name is Anthony, what can I do for you?", "Anthony"],
  ];
  for (const [line, name] of named) ok(staffName(line) === name, `"${line}" -> ${name}`);
  const notNamed = [
    "Thanks for calling the Fun store, how can I help you?",
    "This is the pharmacy, let me transfer you.",
    "This is customer service.",
    "Yeah, we've got a few of those.",
  ];
  for (const line of notNamed) ok(staffName(line) === null, `no name claimed: "${line}"`);
  ok(usedTheirName("Perfect, thanks so much Bob, have a good one!", "Bob"), "he used their name");
  ok(!usedTheirName("Perfect, thanks so much, have a good one!", "Bob"), "…and we do not claim it when he did not");
  ok(!usedTheirName("Bobbing along here", "Bob"), "a name inside another word is not their name");
  ok(!usedTheirName("Thanks Bob", null), "no name was ever given, so it cannot have been used");
}

console.log("\n▶ Charlie wrapping up (round 1, item 1.3)");
{
  const endings = [
    "Perfect, thank you so much, have a good one!",
    "Ah okay, no worries. Thanks Bob, bye!",
    "Great, that's all I needed. Take care!",
    "Appreciate it, thanks. Bye now.",
    "Perfecto, muchas gracias, que tenga buen dia!",
  ];
  for (const e of endings) ok(wrappedUp(e), `wrap-up: "${e}"`);
  const middles = [
    "Oh nice, thanks. Do you know the name of the set?",
    "Okay, I'll wait.",
    "Thank you.",
    "Do you have any Pokemon booster boxes in stock?",
  ];
  for (const m of middles) ok(!wrappedUp(m), `not a wrap-up: "${m}"`);
}


console.log("\n▶ THE DRIFT ALARM: the joining Charlie gets the same words, plus his one instruction");
{
  // There are two Charlies, and every new style check talks to the JOINING one. Only the original
  // was ever sent the full words: the joining one was a frozen copy from 07-28 and never got the
  // wrong department section added on 08-01 — 17,521 characters against 16,807, the difference being
  // exactly that section, which is why he asked to be put through twice. This asserts, off the same
  // function the push sends, that the two can never drift again.
  const sent = midCallAgentPatch("gpt-test");
  ok(sent.prompt === `${JOINING_RULE}\n\n${RESTOCK_PROMPT}`, "byte for byte: the joining instruction, then the original's words, nothing else");
  ok(sent.prompt.startsWith(JOINING_RULE), "the joining instruction is FIRST, before anything about opening a call");
  ok(sent.prompt.endsWith(RESTOCK_PROMPT), "…and the store rules are carried whole and unchanged");
  ok(sent.prompt.includes("{{department_note}}"), "the wrong department section reaches him — the one he never had");
  // NEVER REPEAT (owner 08-04) is now the settle law, section 9. Same fault it was written for: one
  // instruction, in the ONE source, so both saved copies carry it and neither asks twice again.
  ok(sent.prompt.includes("Once the answer is settled, never confirm it again and never re-ask anything Staff already gave."),
    "the settle law rides to the joining Charlie word for word");
  ok(RESTOCK_PROMPT.includes("Once the answer is settled, never confirm it again and never re-ask anything Staff already gave."),
    "…and it is in the original's words, the one source");
  // THE JOINING NOTE WAS REWRITTEN 08-05 TO MATCH THE TECH (owner's order: the words must not fight
  // what was built). The old note said "say NOTHING until they have finished answering", written for
  // a Charlie who heard the hello and the answer arrive live. He is not handed the hello any more,
  // so the first thing he hears IS the finished answer, and that old line read as "keep waiting",
  // which is check 289's silence. The note now says the answer is complete when it reaches him and
  // to reply right away, and it names the square bracket notes the system really does send him.
  ok(JOINING_RULE.startsWith("YOU ARE JOINING A CALL THAT IS ALREADY IN PROGRESS."), "the joining note still opens the same way");
  ok(JOINING_RULE.includes("Do NOT greet them. Do NOT introduce yourself. Do NOT ask that question again, in ANY wording."), "never greet, never introduce, never re-ask");
  ok(JOINING_RULE.replace(/\n/g, " ").includes("Their answer is already complete when it reaches you, so reply to it right away"), "the answer is complete when it reaches him: reply, never wait for more");
  ok(JOINING_RULE.includes("Never wait for more."), "…and never wait for more, in those words");
  ok(!JOINING_RULE.includes("Say NOTHING until they have finished answering"), "the keep-waiting line from the old shape is gone");
  ok(JOINING_RULE.includes("a note in square brackets"), "the system's square bracket notes are named, so a gap note is never mistaken for Staff");
  ok(JOINING_RULE.includes("never read them out loud"), "…and he is told never to read a note onto the line");
  ok(sent.maxTokens === VOICE_DEFAULTS.maxTokens, "same room to think as the original");
  ok(sent.llm === "gpt-test", "same model as the original was just pushed with");
  ok(sent.turnEagerness === "patient", "patient stays: our own machinery splits sentences and he must not answer each fragment");
  ok(!("firstMessage" in sent), "nothing sets a first message: the recorded question already spoke");
  ok(joiningPrompt("X") === `${JOINING_RULE}\n\nX`, "one function builds it, and it is the one the push calls");
  ok(!/[—–]/.test(JOINING_RULE), "no dashes in what he is told (they read strangely through ElevenLabs)");
}

console.log("▶ a note he meant to keep to himself is never a thing to say out loud");
{
  // Checks 398 and 399: the store's advert was handed to him as if Staff had spoken, and he
  // described it onto the line. His directions were changed to forbid it and he did it anyway, so
  // the words are judged at the door now. The three caught here are the REAL lines off those checks.
  const { isPrivateNote } = await import("../src/voice/prompts");
  for (const note of [
    "[System: Store announcement / advertisement playing, not a staff member speaking]",  // check 399
    "[Automated in-store message playing while on hold]",                                  // check 398
    "[Automated message/hold recording - waiting for staff to return]",                    // check 383
    "System: an automated message is playing",
    "Note: waiting for staff to return",
    "An in-store announcement is playing right now.",
    "That was a recorded message, not a staff member.",
  ]) ok(isPrivateNote(note), `caught: "${note.slice(0, 52)}"`);
  // …and every one of these is Charlie really talking to Staff. A wrong catch here would take a
  // real reply off the line, which is the one thing this must never do.
  for (const said of [
    "oh nice, do you know the name of the set, like Chaos Rising, and is it a pack or a box?",
    "No worries, take your time!",
    "Perfect, thanks so much, have a good one!",
    "Oh gotcha, no worries.",
    "got it, do you know what day and time you might get more in?",
    "Sorry, could you say that again?",
    "Ah nice, is that the black boxes?",
    "Oh okay, no worries, thanks for checking.",
    "Do you know if the shipment message said a time?",
    "Any idea what time they put them out?",
  ]) ok(!isPrivateNote(said), `spoken, never caught: "${said.slice(0, 46)}"`);
}

console.log("▶ the set question the RECORDING asks is the same sentence his directions carry");
{
  // The set question is a recording now (owner, 08-19), so two copies of one sentence exist: the
  // one Charlie is told to ask and the one our own file says out loud. They can never be allowed to
  // drift, because a store would hear the recording ask one thing while his directions expect
  // another. ONE source, asserted both ways.
  const { SET_ASK_LINE, setAskLine } = await import("../src/voice/prompts");
  ok(RESTOCK_PROMPT.includes(SET_ASK_LINE.replace("{set_example}", "{{set_example}}")),
    "his own instructions carry the recorded sentence word for word");
  ok(setAskLine("Pitch Black") === "oh nice, do you know the name of the set, like Pitch Black, and is it a pack or a box?",
    "…and the category's own set name goes into it");
  ok(setAskLine("") === setAskLine(SET_EXAMPLE), "…with the catalog's set name when a check names none");
  ok(!/[\u2014\u2013]/.test(SET_ASK_LINE), "no dash in it (they read strangely through ElevenLabs)");
}

console.log("\u25b6 the goodbye the RECORDING says is the owner's ruled sign-off, no name in it (08-19)");
{
  const { GOODBYE_LINE, GOODBYE_LINE_ES } = await import("../src/calls/charlie-setup");
  ok(GOODBYE_LINE === "Thanks so much, have a good one!",
    "the recorded goodbye is his ruled sentence, word for word");
  ok(!/\{\{?|\bname\b/i.test(GOODBYE_LINE), "no name and no variable in it: one line for every store");
  ok(!!GOODBYE_LINE_ES && !/\{\{?/.test(GOODBYE_LINE_ES), "its Spanish ships beside it, no variable in it");
  ok(!/[\u2014\u2013]/.test(GOODBYE_LINE) && !/[\u2014\u2013]/.test(GOODBYE_LINE_ES),
    "no dash in either (they read strangely through ElevenLabs)");
}

console.log("▶ his 08-19 rulings are in section 12, word for word");
{
  says("Music, a recorded voice, an in-store announcement or an advert are all waiting, never Staff talking to you.",
    "12. a recording is waiting, never Staff talking to him");
  says("If you are not sure a real person just spoke to you, use skip_turn and wait.",
    "12. unsure it was a person, he waits in silence");
  says("Never say a note about the call out loud, never describe what you are hearing, and never speak words inside brackets.",
    "12. and he never says a note out loud (check 398: he announced the advert)");
  says("Confirm in two or three words, like \"oh nice\" or \"got it\", never a sentence repeating what they said.",
    "12. confirmations are two or three words");
  says("Thank them once, not twice.", "12. one thank you");
  says("Warm and short beats warm and long every time.", "12. warm and short beats warm and long");
}

console.log("▶ every way the robot store announces a wait really reads as one (check 386)");
{
  // Check 386, test six: "Let me put this down a sec and go check." announced the phone going down
  // on the counter and the matcher missed it, so the room hold the ear rightly declared sat behind
  // the inversion gate and Charlie billed through 20 seconds of store noise. Every hold scene's own
  // announce is pinned here, so a reworded scene can never quietly stop announcing its wait.
  const { saidGoingToCheck } = await import("../src/voice/prompts");
  for (const line of [
    "Sure, let me check on that for you, one moment.",     // scene 20
    "Hang on, let me go and see for you.",                 // scene 21
    "One moment, I'll go and have a look.",                // scene 22
    "Hold on, let me go look.",                            // scene 23
    "Let me put this down a sec and go check.",            // scene 24 — the one 386 missed
    "Hold on, let me check.",                              // scene 5's family
  ]) ok(saidGoingToCheck(line), `announces a wait: "${line}"`);
  for (const line of [
    "Yeah. There's some on the shelf.",
    "The pitch black boxes, I think they are.",
    "Larry Vásquez. How can I help you?",
  ]) ok(!saidGoingToCheck(line), `never a wait: "${line}"`);
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

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
says("Always keep a real set name in the question so Staff know what you mean.", "10. a real set name stays in the question");
says("Whatever Staff answer is the answer, even \"soon\". Never ask a second restock question.", "11. one restock question, whatever comes back");
says("At most ONE exclamation mark in an entire call, and never on the goodbye", "12. one exclamation mark, never on the goodbye");
says("If Staff speak Spanish, continue in Spanish.", "12. he follows Staff into Spanish");
says("If Staff gave you their name, use it once during the check", "14. their name, used once");

// THE THREE ADDITIONS THE OWNER CLEARED ON TOP OF THE SPEC (PM, 08-05). Each is one sentence or one
// clause, and each closes a hole the sections could not close alone.
console.log("\n▶ the three cleared additions");
says("When nobody is talking to you, use skip_turn instead of speaking; never speak into a wait.",
  "12. skip_turn instead of speaking, never into a wait");
says("thank Staff warmly and end the check with end_call.", "9. the settle commands end_call by name");
says("Say goodbye once, then end the check with end_call.", "14. the goodbye commands end_call by name");
says("The set question below comes only after the yes is settled.", "3→10. the set question waits for the settled yes");
// The bridge has to sit in section 3, ahead of the question it governs, or it is just a restatement.
ok(RESTOCK_PROMPT.indexOf("The set question below comes only after the yes is settled.")
   < RESTOCK_PROMPT.indexOf("When Staff say the {{category}} is in stock"),
  "…and the bridge is read BEFORE the set question it governs");

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
ok(RESTOCK_PROMPT.includes("like {{set_example}}, and is it packs or a box or a tin?"), "the example question carries the catalog's set name");
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
  // THE JOINING NOTE ITSELF DID NOT CHANGE in this rewrite (the spec is explicit: it stays exactly as
  // it reads today). Charlie's words moved underneath it; the note on top did not.
  ok(JOINING_RULE.startsWith("YOU ARE JOINING A CALL THAT IS ALREADY IN PROGRESS."), "the joining note is unchanged, top line");
  ok(JOINING_RULE.includes("Do NOT greet them. Do NOT introduce yourself. Do NOT ask the question again."), "…and unchanged in the middle");
  ok(JOINING_RULE.endsWith("If they say something you did not catch, ask about that, never restart."), "…and unchanged to its last line");
  ok(sent.maxTokens === VOICE_DEFAULTS.maxTokens, "same room to think as the original");
  ok(sent.llm === "gpt-test", "same model as the original was just pushed with");
  ok(sent.turnEagerness === "patient", "patient stays: our own machinery splits sentences and he must not answer each fragment");
  ok(!("firstMessage" in sent), "nothing sets a first message: the recorded question already spoke");
  ok(joiningPrompt("X") === `${JOINING_RULE}\n\nX`, "one function builds it, and it is the one the push calls");
  ok(!/[—–]/.test(JOINING_RULE), "no dashes in what he is told (they read strangely through ElevenLabs)");
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

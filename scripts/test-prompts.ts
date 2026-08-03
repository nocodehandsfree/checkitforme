// Unit test for the canonical agent prompts + voice defaults. Run: ./node_modules/.bin/tsx scripts/test-prompts.ts
// Guards the dynamic-variable contract: the live ElevenLabs agent fills {{...}} placeholders, so if
// one silently disappears from the prompt the call breaks. These assertions fail loudly instead.
import { RESTOCK_PROMPT, specificityClause, VOICE_DEFAULTS, heardWrongDepartment, looksLikeAMenu, staffName, wrappedUp, usedTheirName } from "../src/voice/prompts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ specificityClause: general restock → empty");
ok(specificityClause() === "", "no product → empty clause");
ok(specificityClause(undefined) === "", "undefined product → empty clause");
ok(specificityClause("") === "", "empty string → empty clause");
ok(specificityClause("   ") === "", "whitespace-only → empty clause (trimmed)");

console.log("▶ specificityClause: specific product");
const c = specificityClause("  Surging Sparks booster box  ");
ok(c.includes("Surging Sparks booster box"), "includes the requested product");
ok(!c.includes("  Surging Sparks"), "input is trimmed before interpolation");
ok(/only count it as a yes/i.test(c), "instructs to only count THAT item as a yes");
ok(c.includes("{{category}}"), "keeps the {{category}} dynamic variable for the agent to fill");
ok(specificityClause("X").startsWith("IMPORTANT"), "specific clause leads with the IMPORTANT marker");

console.log("▶ RESTOCK_PROMPT: dynamic-variable contract");
for (const v of ["{{opening_line}}", "{{clarification}}", "{{category}}", "{{ask_shipment_day}}",
                 "{{phone_tree}}", "{{retailer_name}}", "{{location}}", "{{special_instructions}}",
                 "{{other_categories}}", "{{voicemail_policy}}", "{{ask_for_transfer}}"]) {
  ok(RESTOCK_PROMPT.includes(v), `prompt still injects ${v}`);
}
ok(/end_call/.test(RESTOCK_PROMPT), "prompt references the end_call tool");
ok(/skip_turn/.test(RESTOCK_PROMPT), "prompt references the skip_turn tool");
ok(/ONE short sentence/i.test(RESTOCK_PROMPT), "prompt enforces one-short-sentence replies");

// THE WRONG-DEPARTMENT SAVE. The rule the agent follows and the phrase test that files the drift ship
// in one file, so they are asserted together. The detector is the risky half: a false positive files
// drift against a route that is fine, so the negatives below matter more than the positives.
console.log("▶ RESTOCK_PROMPT: the wrong-department rule");
ok(/wrong department/i.test(RESTOCK_PROMPT), "the prompt carries the wrong-department section");
ok(/put me through to whoever handles the \{\{category\}\}/.test(RESTOCK_PROMPT), "it asks to be put through in one line, in the store's own words for the category");
ok(/only applies when the flag below is "true"/.test(RESTOCK_PROMPT.split("# If we reached the wrong department")[1]?.slice(0, 80) || ""), "the section is flag-gated, like kiosk mode");
ok(/ONCE/.test(RESTOCK_PROMPT.split("# If we reached the wrong department")[1]?.split("\n")[1] || ""), "it asks to be put through only once on a call");
ok(/never ask to be put through/i.test(RESTOCK_PROMPT), "flag off means it never asks at all");

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

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

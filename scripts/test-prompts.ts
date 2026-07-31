// Unit test for the canonical agent prompts + voice defaults. Run: ./node_modules/.bin/tsx scripts/test-prompts.ts
// Guards the dynamic-variable contract: the live ElevenLabs agent fills {{...}} placeholders, so if
// one silently disappears from the prompt the call breaks. These assertions fail loudly instead.
import { RESTOCK_PROMPT, specificityClause, VOICE_DEFAULTS, heardWrongDepartment } from "../src/voice/prompts";

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

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

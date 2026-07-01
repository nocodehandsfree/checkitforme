// Unit test for the canonical agent prompts + voice defaults. Run: ./node_modules/.bin/tsx scripts/test-prompts.ts
// Guards the dynamic-variable contract: the live ElevenLabs agent fills {{...}} placeholders, so if
// one silently disappears from the prompt the call breaks. These assertions fail loudly instead.
import { RESTOCK_PROMPT, specificityClause, VOICE_DEFAULTS } from "../src/voice/prompts";

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
                 "{{other_categories}}", "{{voicemail_policy}}"]) {
  ok(RESTOCK_PROMPT.includes(v), `prompt still injects ${v}`);
}
ok(/end_call/.test(RESTOCK_PROMPT), "prompt references the end_call tool");
ok(/skip_turn/.test(RESTOCK_PROMPT), "prompt references the skip_turn tool");
ok(/ONE short sentence/i.test(RESTOCK_PROMPT), "prompt enforces one-short-sentence replies");

console.log("▶ VOICE_DEFAULTS: sane tuning ranges");
ok(VOICE_DEFAULTS.speed > 0.5 && VOICE_DEFAULTS.speed <= 1.2, "speed is in a sane range");
ok(VOICE_DEFAULTS.stability >= 0 && VOICE_DEFAULTS.stability <= 1, "stability is a 0..1 fraction");
ok(VOICE_DEFAULTS.similarityBoost >= 0 && VOICE_DEFAULTS.similarityBoost <= 1, "similarityBoost is a 0..1 fraction");
ok(VOICE_DEFAULTS.maxTokens > 0 && VOICE_DEFAULTS.maxTokens <= 200, "maxTokens stays small to keep replies short");
ok(typeof VOICE_DEFAULTS.modelId === "string" && VOICE_DEFAULTS.modelId.length > 0, "a TTS modelId is set");
ok(typeof VOICE_DEFAULTS.llm === "string" && VOICE_DEFAULTS.llm.length > 0, "an agent-brain llm is set");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

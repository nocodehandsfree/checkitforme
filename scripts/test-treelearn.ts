// Unit test for the phone-tree relearn queue. Run: ./node_modules/.bin/tsx scripts/test-treelearn.ts
import { queueTreeRelearn, consumeTreeRelearn, learnTreeFromTranscript } from "../src/calls/tree-learn";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ consumeTreeRelearn: take-once per chain");
ok(consumeTreeRelearn(101) === false, "a chain that was never queued → false");
queueTreeRelearn(101);
ok(consumeTreeRelearn(101) === true, "a queued chain → true on first consume");
ok(consumeTreeRelearn(101) === false, "the same chain → false on second consume (drained)");

console.log("▶ queue is a set: idempotent + isolated per chain");
queueTreeRelearn(202); queueTreeRelearn(202); // dedupes
ok(consumeTreeRelearn(202) === true, "double-queue still consumes exactly once (true)");
ok(consumeTreeRelearn(202) === false, "…and is then empty (false)");
queueTreeRelearn(301); queueTreeRelearn(302);
ok(consumeTreeRelearn(302) === true && consumeTreeRelearn(301) === true, "distinct chains consume independently, any order");
ok(consumeTreeRelearn(301) === false && consumeTreeRelearn(302) === false, "both drained afterward");

console.log("▶ learnTreeFromTranscript: graceful no-LLM-key path");
if (!process.env.GEMINI_API_KEY) {
  ok((await learnTreeFromTranscript("STORE: thanks for calling")) === null, "no GEMINI_API_KEY → returns null (no network)");
} else {
  console.log("  · skipped (GEMINI_API_KEY is set; would hit the network)");
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

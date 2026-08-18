// THE SIMULATIONS BUILD CONTRACT, pinned (docs/specs/self-improving-charlie/README.md).
//
// Run: ./node_modules/.bin/tsx scripts/test-simulations.ts
//
// The PM's walls, each one an assertion: the grader is the SAME object real checks use, never a
// copy · a simulation carries no money number, so no projected percent can exist · the store is
// its own table and this module never touches the checks record, the twenty tests' scenes, or the
// robot store's settings · a simulated call is named call N of M, never a check id · the last
// line names the robot store.
import { readFileSync } from "node:fs";
import { gradeSimCall, simVerdictLine, SIM_CARDS, simMeterGrader, simCardGrader } from "../src/calls/simulations";
import { TEST_CARDS, cardVerdict } from "../src/calls/behaved";
import { meterVerdict } from "../src/calls/meter";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, saw?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};
const head = (s: string) => console.log(`\n${s}`);

head("Wall 1: the grader is the very same one real checks use — the objects, not lookalikes");
ok("the cards are the same object", SIM_CARDS === TEST_CARDS);
ok("the meter grader is the same function", simMeterGrader === meterVerdict);
ok("the card grader is the same function", simCardGrader === cardVerdict);

head("Wall 2: no money number exists on a simulation, so none can print");
{
  const g = gradeSimCall({ cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 19, speakingSec: 12, listeningSec: 5, lines: [] });
  ok("a thrifty simulated call passes", g.pass === true, g);
  ok("no fail sentence mentions profit or a floor", g.meterFails.every((f) => !/profit|floor|%/.test(f)), g.meterFails);
  const over = gradeSimCall({ cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 31, lines: [] });
  ok("31 seconds on the meter fails, the owner's red line", over.pass === false, over);
  ok("the fail sentence is the meter's, not money's", /seconds on the meter/.test(over.meterFails[0] || ""), over.meterFails);
}

head("The status wall: the card's own status still decides, same as a real check");
{
  const wrong = gradeSimCall({ cardKey: "answer_clear_yes", statusKey: "not_in_stock", meterSec: 15, lines: [] });
  ok("the wrong status fails the call", wrong.pass === false);
  const gen = gradeSimCall({ cardKey: "no_such_card", statusKey: null, meterSec: 5, lines: [] });
  ok("an unknown card can never pass", gen.pass === false, gen.meterFails);
  const named = gradeSimCall({ cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 15, lines: [], failName: "Goodbye: too early" });
  ok("a failure the generator saw in the conversation fails the call", named.pass === false);
}

head("Wall 4: the last line names the robot store, and only when the run earned it");
ok("a clean run earns the robot store line", /robot store/.test(simVerdictLine(500, 0)));
ok("four of five hundred still earns it", /Worth one real call at the robot store/.test(simVerdictLine(496, 4)));
ok("a leaky run does not", simVerdictLine(450, 50) === "Not ready for the robot store yet.");

head("Wall 3: the module touches its own store only — read straight off its source");
{
  const src = readFileSync("src/calls/simulations.ts", "utf8");
  ok("never the checks record", !/call_results|callResults/.test(src));
  ok("never the scenes or the robot store's settings", !/robot_scenario|robot_menu|tapedeck|setSetting/.test(src));
  ok("its own table only", /simRuns/.test(src) && !/callEvents/.test(src));
  ok("profit is hard-null at the one grading door", /profitPct:\s*null/.test(src));
  ok("the word Projected appears nowhere", !/[Pp]rojected/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

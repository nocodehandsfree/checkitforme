// Unit: recipe → live-call artifacts. Covers the press-TIMING logic that broke Big 5 (digits fired at a
// flat 2s instead of the learned atSec). Pure functions, no DB.
import { recipeToDtmf, recipeToVoice, isDirect, recipeAnswerPath } from "../src/calls/recipe";

let fail = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}: got ${g} want ${w}`); fail++; }
};

// isDirect
eq(isDirect({ type: "direct" }), true, "isDirect: type direct");
eq(isDirect({ steps: [] }), true, "isDirect: no steps");
eq(isDirect({ type: "keypad", steps: [{ action: "press", value: "2", atSec: 6 }] }), false, "isDirect: has steps");

// recipeToDtmf — presses at the LEARNED atSec, not a flat 2s (the Big 5 fix)
eq(recipeToDtmf({ type: "keypad", steps: [{ action: "press", value: "2", atSec: 6 }] }), "2@6", "dtmf: press at learned atSec");
eq(recipeToDtmf({ steps: [{ action: "press", value: "0", atSec: 38 }, { action: "press", value: "0", atSec: 47 }] }), "0@38,0@47", "dtmf: multi-press learned times");
eq(recipeToDtmf({ steps: [{ action: "press", value: "1" }] }), "1@2", "dtmf: fallback FIRST_AT when no atSec");
eq(recipeToDtmf({ steps: [{ action: "say", value: "front" }] }), "", "dtmf: empty for a voice recipe");
eq(recipeToDtmf({ steps: [{ action: "press", value: "2", atSec: 6 }, { action: "press", value: "3", atSec: 6 }] }), "2@6,3@9", "dtmf: strictly increasing on a timing collision");

// recipeToVoice
eq(recipeToVoice({ steps: [{ action: "say", value: "front", atSec: 4 }] }), "front@4", "voice: say at learned atSec");
eq(recipeToVoice({ steps: [{ action: "press", value: "0" }] }), "", "voice: empty for a keypad recipe");

// recipeAnswerPath — the compact signature used for verify/compare
eq(recipeAnswerPath({ steps: [{ action: "press", value: "2" }, { action: "say", value: "front" }] }), "press:2>say:front", "answerPath: press>say");

if (fail) { console.error(`recipe: ${fail} test(s) FAILED`); process.exit(1); }
console.log("recipe: all passed");

// Unit: recipe → live-call artifacts. Covers the press-TIMING logic that broke Big 5 (digits fired at a
// flat 2s instead of the learned atSec), and the ABC connect-timer guard that silenced the agent 19s
// on a direct-answer store (2026-07-02). Pure functions, no DB.
import { recipeToDtmf, recipeToVoice, isDirect, recipeAnswerPath, connectAtSecFor } from "../src/calls/recipe";

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

// connectAtSecFor — the ABC timer guard. THE 2026-07-02 bug: a direct-answer chain carried a bogus
// avgTreeSeconds=19 and the timer muted the agent for 19s on a call a human answered instantly.
eq(connectAtSecFor({ navType: "direct", avgTreeSeconds: 19 }), null, "timer: navType direct NEVER arms (the Fun-store bug)");
eq(connectAtSecFor({ ringsDirect: true, avgTreeSeconds: 12 }), null, "timer: ringsDirect never arms");
eq(connectAtSecFor({ answerPath: "direct_human", avgTreeSeconds: 8 }), null, "timer: answerPath direct_human never arms");
eq(connectAtSecFor({ navType: "voice", avgTreeSeconds: 26 }), 26, "timer: voice-tree chain arms at the learned second");
eq(connectAtSecFor({ dtmfShortcut: "0@4", avgTreeSeconds: 14 }), 14, "timer: keypad chain (dtmf) arms at the learned second");
eq(connectAtSecFor({ answerPath: "simple_ivr", avgTreeSeconds: 11 }), 11, "timer: transcript-learned IVR chain arms (no recipe needed)");
eq(connectAtSecFor({ avgTreeSeconds: 19 }), null, "timer: NO tree evidence -> never arms (garbage-data guard)");
eq(connectAtSecFor({ navType: "voice", avgTreeSeconds: 0 }), null, "timer: zero/unset seconds -> no timer");
eq(connectAtSecFor(undefined), null, "timer: no chain -> no timer");

if (fail) { console.error(`recipe: ${fail} test(s) FAILED`); process.exit(1); }
console.log("recipe: all passed");

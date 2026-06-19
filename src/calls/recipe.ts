// Phone-tree recipe → live-call artifacts. ONE place that turns a learned navigator recipe into the
// fields the live bridge consumes, so the trainer lock, the overnight batch, and any future learner
// all produce identical, correct output. The price-point plan hinges on these being right:
//   - keypad → DTMF in the bridge's "digit@seconds" form, pressed EARLY (don't wait out the recording)
//   - voice  → spoken steps in "word@seconds" form for the cheap-TTS barge-in injector
//   - direct → no navigation, connect the agent immediately
//
// Timing philosophy: once we KNOW the route, we stop waiting for the menu to finish — we press/speak
// early and let the carrier's type-ahead buffer carry it. First action at FIRST_AT, then GAP between.
export type RecipeStep = { action?: string; value?: string; atSec?: number };
export type Recipe = { type?: string; steps?: RecipeStep[]; seconds?: number };

const FIRST_AT = 2;  // seconds after connect to fire the first key/word (early — barge the recording)
const GAP = 3;       // seconds between successive actions (let the menu advance)

const pressSteps = (r: Recipe) => (r.steps || []).filter((s) => s.action === "press" && s.value);
const saySteps = (r: Recipe) => (r.steps || []).filter((s) => s.action === "say" && s.value);

export function isDirect(r: Recipe): boolean {
  return r.type === "direct" || !(r.steps && r.steps.length);
}

/** Keypad route in the bridge's form, pressed EARLY: e.g. [{press 0},{press 1}] -> "0@2,1@5".
 *  Empty string when this chain isn't a keypad route (direct or voice). */
export function recipeToDtmf(r: Recipe): string {
  const ps = pressSteps(r);
  if (!ps.length) return "";
  return ps.map((s, i) => `${String(s.value).replace(/[^0-9*#]/g, "")}@${FIRST_AT + i * GAP}`).filter((x) => x[0]).join(",");
}

/** Voice route for the cheap-TTS barge-in injector: e.g. [{say "general"}] -> "general@2".
 *  Empty string when this chain isn't a voice route. */
export function recipeToVoice(r: Recipe): string {
  const ss = saySteps(r);
  if (!ss.length) return "";
  return ss.map((s, i) => `${String(s.value).replace(/[,@]/g, " ").trim()}@${FIRST_AT + i * GAP}`).join(",");
}

/** Human-readable directions stored in phoneTreeDefault / read by the live agent as {{phone_tree}}. */
export function recipeToTreeText(r: Recipe): string {
  if (isDirect(r)) return "A live person usually answers directly — no phone menu to work through.";
  const steps = r.steps || [];
  return "To reach a live person: " + steps.map((s) => (s.action === "press" ? `press ${s.value}` : `say "${s.value}"`)).join(", then ") + ".";
}

/** Compact path signature for verify/compare, e.g. "press:0>press:1". */
export function recipeAnswerPath(r: Recipe): string {
  return (r.steps || []).map((s) => `${s.action}:${s.value}`).join(">") || "";
}

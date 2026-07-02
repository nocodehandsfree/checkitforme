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

/** When to fire a learned step: at the time we ACTUALLY pressed/spoke it during mapping (s.atSec,
 *  seconds from connect) — NOT a flat early 2s. IVRs that don't buffer type-ahead drop a digit
 *  pressed during the greeting (the Big 5 bug: "press 2" learned at 6s fired at 2s, got lost, and
 *  the live agent voiced "two" instead). Fall back to the early-barge cadence only when a step has
 *  no learned timing. Always strictly increasing so multi-step paths don't collide. */
function stepAt(s: RecipeStep, i: number, prev: number): number {
  let at = typeof s.atSec === "number" && s.atSec >= FIRST_AT ? Math.round(s.atSec) : FIRST_AT + i * GAP;
  if (at <= prev) at = prev + GAP;
  return at;
}

/** Keypad route in the bridge's form, pressed at the LEARNED time: e.g. press 2 @6s -> "2@6".
 *  Empty string when this chain isn't a keypad route (direct or voice). */
export function recipeToDtmf(r: Recipe): string {
  const ps = pressSteps(r);
  if (!ps.length) return "";
  let prev = -1;
  return ps.map((s, i) => {
    const digit = String(s.value).replace(/[^0-9*#]/g, "");
    if (!digit) return "";
    const at = stepAt(s, i, prev); prev = at;
    return `${digit}@${at}`;
  }).filter(Boolean).join(",");
}

/** Voice route for the cheap-TTS barge-in injector, spoken at the LEARNED time: e.g. say "general" @4s
 *  -> "general@4". Empty string when this chain isn't a voice route. */
export function recipeToVoice(r: Recipe): string {
  const ss = saySteps(r);
  if (!ss.length) return "";
  let prev = -1;
  return ss.map((s, i) => {
    const word = String(s.value).replace(/[,@]/g, " ").trim();
    const at = stepAt(s, i, prev); prev = at;
    return `${word}@${at}`;
  }).join(",");
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

/** ABC connect-timer guard: when (seconds after connect) to open the billed agent for a chain, or
 *  null for "no timer" (bridge falls back to VAD + hold-timeout). The timer MUTES the agent until it
 *  fires, so a DIRECT-answer chain must NEVER arm it — a human is on the line at pickup (the
 *  2026-07-02 silent-agent bug: bogus avgTreeSeconds=19 on a navType:"direct" chain). Beyond that,
 *  require actual tree evidence (nav type / recipe / keypad shortcut / learned IVR path) so a stray
 *  avgTreeSeconds on an unmapped chain can't silence anyone. */
export function connectAtSecFor(chain?: {
  navType?: string | null; ringsDirect?: boolean | null; answerPath?: string | null;
  navRecipe?: string | null; dtmfShortcut?: string | null; avgTreeSeconds?: number | null;
} | null): number | null {
  if (!chain) return null;
  if (chain.navType === "direct" || chain.ringsDirect === true || chain.answerPath === "direct_human") return null;
  const hasTree = chain.navType === "voice" || chain.navType === "keypad" || !!chain.navRecipe ||
    !!chain.dtmfShortcut || chain.answerPath === "simple_ivr" || chain.answerPath === "deep_ivr";
  const s = chain.avgTreeSeconds ?? 0;
  return hasTree && s > 0 ? s : null;
}

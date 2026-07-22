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

/** ONE rule for "do we EVER place a call to this chain" — read it from every surface (mapping board,
 *  overnight batch, single-chain map) so no screen re-decides callability on its own and they can never
 *  disagree (the Micro-Center-callable-in-Admin bug: the shopper site said "check online" while the
 *  Admin board still listed it as callable). A chain is dialable only when it's not owner-muted, has a
 *  real store line (callTarget — false = national call-center / online-only like Micro Center, Best Buy),
 *  and isn't a site-check chain (stockCheckMethod=site → its shelf-accurate website is the answer, never
 *  a paid call). Curated field, so it rides store-sync staging→prod and stays identical in both. */
export function chainDialable(ch: { muted?: boolean | null; callTarget?: boolean | null; stockCheckMethod?: string | null }): boolean {
  return ch.muted !== true && ch.callTarget !== false && ch.stockCheckMethod !== "site";
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

/** The KNOWN nav story of a call to this chain, as call-log ladder steps relative to ANSWER
 *  (owner 07-22: "the moment we get the menu we need to say that, with seconds"). Nav runs as TwiML
 *  BEFORE the media stream exists, so nothing can LISTEN to the menu yet — but the plan is fact:
 *  we know when the menu starts (pickup) and when every press/word fires (the learned atSec the
 *  TwiML reproduces). Ladder numbers match liveStageLabel: 4 = menu heard, 5 = working through it.
 *  `len` = seconds of TwiML nav played before <Connect> opens the stream (0 when no actions).
 *  Returns null for direct chains / no evidence of a tree — never invent a menu that isn't there. */
export function chainNavPlan(ch?: {
  navType?: string | null; ringsDirect?: boolean | null; answerPath?: string | null;
  navRecipe?: string | null; dtmfShortcut?: string | null; avgTreeSeconds?: number | null;
} | null): { steps: { n: number; at: number }[]; len: number } | null {
  if (!ch) return null;
  if (ch.navType === "direct" || ch.ringsDirect === true || ch.answerPath === "direct_human") return null;
  let acts: RecipeStep[] = [];
  try {
    const r = ch.navRecipe ? (JSON.parse(ch.navRecipe) as Recipe) : null;
    acts = (r?.steps || []).filter((s) => (s.action === "press" || s.action === "say") && s.value);
  } catch { /* unreadable recipe → fall through to the shortcut/timer evidence below */ }
  const hasTree = acts.length > 0 || !!ch.dtmfShortcut || (ch.avgTreeSeconds ?? 0) > 0;
  if (!hasTree) return null;
  const steps: { n: number; at: number }[] = [{ n: 4, at: 1 }]; // the menu starts talking right at pickup
  let prev = -1, len = 0;
  acts.forEach((s, i) => { const at = stepAt(s, i, prev); prev = at; len = at; steps.push({ n: 5, at }); });
  if (!acts.length && ch.dtmfShortcut) { steps.push({ n: 5, at: FIRST_AT }); len = FIRST_AT; }
  return { steps, len: len ? len + 2 : 0 }; // +2s: the last press/word plays out before <Connect>
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

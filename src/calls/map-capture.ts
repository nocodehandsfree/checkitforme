// Turning ONE mapping call into knowledge — the bridge between what the navigator heard and what
// the map stores.
//
// The owner's rule for tomorrow's sweep: a step must fire because the store's recording actually
// FINISHED, not because a stopwatch hit a number. Two calls to CVS prove why — "no" said at 26s when
// the healthcare question ends at 16s loops the whole menu; "general" can be said the moment the last
// option is read out. So every step we learn carries the RECORDING it follows (`afterPrompt`)
// alongside the learned second, and the live call fires on the recording, using the second only as a
// backstop.
//
// The navigator hears the menu one recording at a time (each <Gather> speech result IS one finished
// recording), so the count of recordings before each action is already fact on every mapping call —
// no new audio plumbing, no speech-recognition bill.
import type { MapRecipe, MapStep, EvidenceCall } from "./mapgraph";

/** The navigator's per-turn record, loosened so this file needs no runtime import from navigator. */
export interface CapturedStep { who?: string; text?: string; atSec?: number; action?: string; value?: string }

const isAction = (s: CapturedStep) => (s.action === "press" || s.action === "say") && !!s.value;
/** The confirm question ("asked: do you have…") is training scaffolding, not navigation — the same
 *  exclusion recipeFromSteps already makes, or a direct-answer store would learn to recite the ask. */
const isScaffold = (s: CapturedStep) => String(s.text || "").startsWith("asked:");

/**
 * Build the map recipe from the steps this call actually took.
 * @param steps      the navigator's turn-by-turn record
 * @param humanAtSec measured seconds to the person
 * @param bargeProven step indexes proven safe to fire before the recording finishes (mapper wins)
 */
export function recipeFromCall(steps: CapturedStep[], humanAtSec: number | null, bargeProven?: Set<number>): MapRecipe {
  const acts: MapStep[] = [];
  let prompts = 0;                 // completed store recordings heard so far
  for (const s of steps || []) {
    if (s.who === "ivr") { if (String(s.text || "").trim()) prompts++; continue; }
    if (s.who !== "us" || !isAction(s) || isScaffold(s)) continue;
    acts.push({
      action: s.action === "press" ? "press" : "say",
      value: String(s.value || ""),
      atSec: Math.max(0, Math.round(s.atSec ?? 0)),
      // The recording this action followed. 0 would mean "before the store said anything", which is
      // never a thing we can trigger on — leave it off and let the clock cover that step.
      afterPrompt: prompts > 0 ? prompts : undefined,
      bargeSafe: bargeProven?.has(acts.length) || undefined,
    });
  }
  const type: MapRecipe["type"] = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
  return { type, steps: acts, seconds: humanAtSec ?? (steps?.[steps.length - 1]?.atSec ?? 0) };
}

/** The menu lines this call heard, kept as the transcript evidence behind the version. Capped: the
 *  owner only wants the perfect recipe kept, not every word of every call. */
export function transcriptFromCall(steps: CapturedStep[], max = 12): string[] {
  return (steps || []).filter((s) => s.who === "ivr" && String(s.text || "").trim())
    .map((s) => `${Math.round(s.atSec ?? 0)}s ${String(s.text).slice(0, 200)}`).slice(0, max);
}

/** How many store recordings played before we got to a person — the cheap drift signal a live check
 *  can re-measure for free. */
export function promptCount(steps: CapturedStep[]): number {
  return (steps || []).filter((s) => s.who === "ivr" && String(s.text || "").trim()).length;
}

/** Package one mapping call as evidence: what happened, where, when, and how fast. */
export function evidenceFromCall(opts: {
  navId?: string; storeId?: number; storeName?: string; steps: CapturedStep[];
  seconds: number | null; reachedHuman: boolean; path: string; note?: string; at?: number;
}): EvidenceCall {
  const at = opts.at || Math.floor(Date.now() / 1000);
  return {
    navId: opts.navId, at, day: new Date(at * 1000).toISOString().slice(0, 10),
    storeId: opts.storeId, storeName: opts.storeName,
    seconds: opts.seconds, promptCount: promptCount(opts.steps),
    reachedHuman: opts.reachedHuman, path: opts.path,
    transcript: opts.reachedHuman ? transcriptFromCall(opts.steps) : transcriptFromCall(opts.steps, 6),
    note: opts.note,
  };
}

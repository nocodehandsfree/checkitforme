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
import { guessLanguage, sameMenu, type MapRecipe, type MapStep, type EvidenceCall, type Language, type CheckStage, type CheckFailReason } from "./mapgraph";

/** The navigator's per-turn record, loosened so this file needs no runtime import from navigator. */
export interface CapturedStep { who?: string; text?: string; atSec?: number; action?: string; value?: string; earPrompts?: number; knock?: boolean }

const isAction = (s: CapturedStep) => (s.action === "press" || s.action === "say") && !!s.value && !s.knock;
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
  // On a call where the store repeated itself, the recording count is inflated — so we keep the route
  // and the timing but NOT the anchors, and say where they came from so a clean call can replace them.
  const dirty = callHadAReprompt(steps);
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
      //
      // The EAR's count wins when the audio fork was on the call: it is the same prompt detector a
      // live call fires on, so what we learn and what the runtime counts are the same number. Falling
      // back to counting speech-to-text turns miscounts whenever the transcriber splits one recording
      // into two lines or glues two together — which is exactly what happened on 07-28 at CVS.
      afterPrompt: !dirty && typeof s.earPrompts === "number" && s.earPrompts > 0 ? s.earPrompts
        : (!dirty && prompts > 0 ? prompts : undefined),
      bargeSafe: bargeProven?.has(acts.length) || undefined,
    });
  }
  const type: MapRecipe["type"] = acts.length === 0 ? "direct" : (acts.every((a) => a.action === "press") ? "keypad" : "voice");
  return {
    type, steps: acts, seconds: humanAtSec ?? (steps?.[steps.length - 1]?.atSec ?? 0),
    anchorsFrom: dirty ? "reprompt" : "clean",
  };
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

/** Did the store have to REPEAT itself on this call? "Sorry, I'm not understanding", "please confirm",
 *  a prompt we already heard — any of those means an extra recording played that would not play on a
 *  normal call. The seconds are still true, but the ANCHORS are not: every step after the re-prompt
 *  learned a recording number one too high, and a live call would then wait for a recording that never
 *  comes. Proved on CVS Alhambra, 07-28: the anchors came back 3/4/5 when the clean route is 2/3/4. */
export function callHadAReprompt(steps: CapturedStep[]): boolean {
  const lines = (steps || []).filter((s) => s.who === "ivr" && s.text).map((s) => String(s.text));
  if (lines.some((t) => /sorry,? (i'?m )?not understanding|didn'?t (quite )?(catch|get) that|please confirm|let'?s try (that )?again|i did not understand/i.test(t))) return true;
  // The same recording twice is the other shape of the same problem.
  const seen = new Set<string>();
  for (const t of lines) {
    const k = t.toLowerCase().replace(/[^a-z ]/g, "").slice(0, 40).trim();
    if (k.length > 12 && seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/** The language the STORE spoke on this call, from the menu lines themselves. One clear Spanish line
 *  is enough to say so; a menu with both is "mixed"; silence stays unknown rather than assumed. */
export function languageOfCall(steps: CapturedStep[]): Language {
  const seen = new Set<Language>();
  for (const s of steps || []) {
    if (s.who !== "ivr" || !s.text) continue;
    const g = guessLanguage(s.text);
    if (g !== "unknown") seen.add(g);
  }
  if (seen.has("mixed") || (seen.has("es") && seen.has("en"))) return "mixed";
  if (seen.has("es")) return "es";
  if (seen.has("en")) return "en";
  return "unknown";
}

/** Package one mapping call as evidence: what happened, where, when, and how fast. */
/**
 * THE GRADE, decided by machine the moment a check ends (owner, 07-30). A check must EARN its way
 * into the record: pass = the menu we expected, OUR WORDS SAID (every answer the route owed), the
 * handoff announced and the ring heard, or Staff answered. Everything else fails with exactly one
 * reason from the owner's fixed SEVEN, and a failed check changes nothing — it is kept collapsed.
 *
 * A DIFFERENT MENU IS NOT A FAILURE REASON. An unmatched greeting means this check was never walking
 * the map it was graded against — it is a new CONDITION (night, Spanish, changed), so the check fails
 * with NO reason and `unknownMenu` set, and the caller files it as a condition, quarantined. That is
 * the fingerprint mechanism from the contract, not an eighth reason.
 */
export function gradeCheck(o: {
  stage: CheckStage;
  expectedGreeting?: string | null;   // the locked menu's opening line, when one is held
  heardGreeting?: string | null;      // this check's first store line
  wrongDepartment?: boolean;          // Staff said we reached the wrong desk
  transferHeard: boolean;             // the store announced the handoff
  ringOrStaff: boolean;               // the desk rang, or a person answered
  staffAnswered?: boolean;            // Staff gave a REAL reply to the product question — the
                                      // contract's other pass shape, and the only one a store where
                                      // Staff just pick up (no announced handoff) can ever produce
  askDied?: boolean;                  // the question was asked and NOTHING classified the reply —
                                      // silence, a dropped line. Such a check can never pass: its
                                      // whole job was the answer, and there is none
  repromptHeard?: boolean;            // "sorry, I'm not understanding"
  greetingTwice?: boolean;            // the opening recording played again mid-check
  /** The answers the route owes and the answers actually said, WORD FOR WORD. A count is not a
   *  check: a re-said answer inflates a count, so a never-spoken answer could pass on arithmetic.
   *  Each owed word must have been said at least as many times as the route owes it. */
  plannedValues?: string[];
  saidValues?: string[];
  testedEarly?: boolean;              // this check cut in on the menu's own words
  navSeconds?: number | null;         // this check's menu time
  recipeSeconds?: number | null;      // the reigning recipe's menu time
}): { grade: "pass" | "fail"; reason?: CheckFailReason; unknownMenu?: boolean } {
  if (o.expectedGreeting && o.heardGreeting && !sameMenu(o.expectedGreeting, o.heardGreeting)) {
    return { grade: "fail", unknownMenu: true };
  }
  if (o.wrongDepartment) return { grade: "fail", reason: "wrong department" };
  if (o.greetingTwice) return { grade: "fail", reason: "sent to beginning of menu" };
  // AN ASK WITH NO ANSWER CANNOT PASS. The transfer plus the ring may be spotless, but this check's
  // one job was Staff's reply and it never came — grading it a pass polluted the ring numbers with
  // calls that proved nothing. No reason pill: it collapses, like every state that is not a reason.
  if (o.askDied) return { grade: "fail" };
  // OUR WORDS SAID, word for word: every answer the route owes must actually have been spoken, as
  // many times as it is owed. Counting steps was not a check — a re-said answer inflated the count
  // and a never-spoken one passed on arithmetic.
  const wordsMissing = (() => {
    const planned = (o.plannedValues || []).map((v) => v.toLowerCase()).filter(Boolean);
    if (!planned.length) return false;
    const said = (o.saidValues || []).map((v) => v.toLowerCase());
    const count = (arr: string[], v: string) => arr.filter((x) => x === v).length;
    return planned.some((v) => count(said, v) < count(planned, v));
  })();
  // TWO pass shapes, per the contract: the handoff announced AND the ring heard, OR Staff answered
  // and replied. A store where Staff just pick up never plays a transfer line — without the second
  // shape, whole chains whose desks answer directly could never pass and never lock.
  const reached = (o.transferHeard && o.ringOrStaff) || o.staffAnswered === true;
  if (!reached) {
    if (o.testedEarly) return { grade: "fail", reason: "barge didn't work" };
    if (o.repromptHeard) return { grade: "fail", reason: "menu repeated itself" };
    if (wordsMissing) return { grade: "fail", reason: "menu hung up on us" };
    return { grade: "fail", reason: "said wrong words" };
  }
  // OUR WORDS SAID is a PASS CONDITION, not just a fail label. A check that skipped an answer and
  // still stumbled onto a ring did not prove the route — it proved a shortcut nobody chose.
  if (wordsMissing) return { grade: "fail", reason: "said wrong words" };
  if (o.stage === "speed" && typeof o.navSeconds === "number" && typeof o.recipeSeconds === "number"
    && o.navSeconds >= o.recipeSeconds) {
    return { grade: "fail", reason: "not faster" };
  }
  return { grade: "pass" };
}

export function evidenceFromCall(opts: {
  navId?: string; storeId?: number; storeName?: string; steps: CapturedStep[];
  seconds: number | null; reachedHuman: boolean; path: string; note?: string; at?: number;
  greeting?: string; transferAtSec?: number | null; endedOnRing?: boolean;
  stage?: CheckStage; grade?: "pass" | "fail"; reason?: CheckFailReason; callSid?: string;
  hourLocal?: number | null; dow?: number | null; language?: Language;
}): EvidenceCall {
  const at = opts.at || Math.floor(Date.now() / 1000);
  return {
    navId: opts.navId, at, day: new Date(at * 1000).toISOString().slice(0, 10),
    storeId: opts.storeId, storeName: opts.storeName,
    seconds: opts.seconds, promptCount: promptCount(opts.steps),
    reachedHuman: opts.reachedHuman, path: opts.path,
    greeting: opts.greeting, transferAtSec: opts.transferAtSec ?? null,
    endedOnRing: opts.endedOnRing || undefined,
    stage: opts.stage, grade: opts.grade, reason: opts.reason, callSid: opts.callSid,
    hourLocal: opts.hourLocal ?? null, dow: opts.dow ?? null,
    // What language the menu spoke, read off the lines we heard. Free, and the field has to be
    // populated from the first call or it is worthless when discovery proper arrives.
    language: opts.language ?? languageOfCall(opts.steps),
    // THE MENU IN THE STORE'S OWN WORDS is the reason a re-listen exists, so a check that walked the
    // whole route keeps every line it heard. Only a check that never got through is trimmed.
    transcript: (opts.reachedHuman || opts.endedOnRing) ? transcriptFromCall(opts.steps) : transcriptFromCall(opts.steps, 6),
    note: opts.note,
  };
}

/**
 * EVERY MAPPING CALL FEEDS THE MAP, whoever placed it.
 *
 * The owner's finding, 07-30: he pressed Re-map, we called a real CVS, walked its menu perfectly, and
 * the chain page showed nothing. The call was in the list and nowhere else. Only the sweep and the
 * auto-mapper folded their own calls in; a call placed from Admin went to the log and stopped, so the
 * one button he actually presses taught the map nothing.
 *
 * So the fold moved to where every path already ends. `callerRecords` is how the sweep and the mapper
 * say "mine, I fold it myself", and nothing else has to remember.
 *
 * A RE-LISTEN NEVER PROPOSES. It is not discovering a route, it is listening to one we hold, so it
 * writes what it heard (the graph, the menu, the handoff moment) and leaves the recipe alone.
 */
export async function recordNavCall(s: {
  id: string; chainId: number | null; retailerId: number; retailerName?: string;
  steps: CapturedStep[]; humanAtSec: number | null; transferAtSec?: number | null;
  greeting?: string; recipe?: MapRecipe | null; relisten?: boolean; status: string;
  endedOnRing?: boolean;
  stage?: CheckStage; grade?: "pass" | "fail"; reason?: CheckFailReason;
  callSid?: string;
}): Promise<{ recorded: boolean; why: string }> {
  const chainId = Number(s.chainId || 0);
  if (!chainId) return { recorded: false, why: "no chain on this call" };
  const mod = await import("./mapgraph");
  const steps = s.steps || [];
  const reachedHuman = s.humanAtSec != null;
  const prompts = steps.filter((st) => st.who === "ivr" && st.text)
    .map((st) => ({ text: String(st.text), atSec: Math.round(st.atSec ?? 0) }));
  // The knock's keys are never a path through the menu — they are a test of who picked up, so they
  // must not be walked back into the graph as a choice this store offered us.
  const actions = steps.filter((st) => st.who === "us" && !st.knock)
    .map((st) => ({ action: (st.action === "press" ? "press" : "say") as "press" | "say", value: String(st.value || ""), atSec: Math.round(st.atSec ?? 0), afterPrompt: st.earPrompts }));

  // THE GRAPH FIRST, always. Every prompt heard is knowledge even when the call failed, and it is the
  // only thing that can ever answer "we have never heard this prompt before".
  await mod.recordCallPath({
    chainId, storeId: s.retailerId,
    prompts, actions,
    // A FIXED vocabulary on the graph, never a raw status: person | ring | failed.
    reachedHuman, seconds: s.humanAtSec, outcome: reachedHuman ? "person" : (s.endedOnRing ? "ring" : "failed"),
  });

  // A FAILED CHECK CHANGES NOTHING (owner, 07-30). The graph above keeps what was heard, the run log
  // keeps the check collapsed with its reason, and that is ALL: no evidence, no version, no score, no
  // nav time. The record only ever moves forward on checks that earned it.
  if (s.grade === "fail") return { recorded: true, why: `failed: ${s.reason || "?"} — changed nothing` };

  // A GRADED CHECK BELONGS TO ITS RUN. While a chain is being mapped (map → speed → prove), every
  // passing check lives in the run's own memory and the map moves exactly ONCE — at lock, when three
  // stores agree. A mid-run check must never file a version, fold evidence onto the live route, or
  // touch anything the paid agent reads (owner, 07-31: the half-finished proposals this used to file
  // are what put the "menu changed" card back on his screen).
  if (s.stage) return { recorded: true, why: `${s.stage} check kept by its run — the map moves once, at lock` };

  const when = await mod.storeLocalTime(s.retailerId);
  const evidence = evidenceFromCall({
    navId: s.id, storeId: s.retailerId, storeName: s.retailerName, steps,
    seconds: s.relisten ? null : s.humanAtSec, reachedHuman,
    path: s.recipe ? mod.pathSignature(s.recipe) : actions.map((a) => `${a.action}:${a.value}`).join(">"),
    greeting: s.greeting, transferAtSec: s.transferAtSec ?? null,
    endedOnRing: s.endedOnRing,
    stage: s.stage, grade: s.grade, reason: s.reason, callSid: s.callSid,
    hourLocal: when.hour, dow: when.dow,
    note: s.relisten ? "re-listen" : "admin call",
  });

  if (s.relisten) {
    // What we came for: the handoff moment and the menu, folded onto the route that is already live.
    // No version, no seconds, so a listen can never move the number the paid agent opens on.
    const live = await mod.activeMap(chainId, s.retailerId);
    if (!live) return { recorded: true, why: "graph only: this chain has no live recipe" };
    await mod.addEvidence(live.id, evidence);
    await mod.recordObservation({
      chainId, storeId: s.retailerId, versionId: live.id, navId: s.id, kind: "verify",
      expected: mod.pathSignature(live.recipe), observed: evidence.path, drift: evidence.path !== mod.pathSignature(live.recipe),
      detail: { transferAtSec: s.transferAtSec ?? null, relisten: true },
    });
    return { recorded: true, why: `folded onto ${live.label}` };
  }

  if (!s.recipe || !reachedHuman) {
    await mod.recordFailedAttempt({ chainId, storeId: s.retailerId, navId: s.id, reason: String(s.status || "no route proved"), seconds: s.humanAtSec });
    return { recorded: true, why: "graph only: no route proved on this call" };
  }
  const res = await mod.proposeVersion({ chainId, storeId: s.retailerId, recipe: s.recipe, source: "admin", call: evidence });
  return { recorded: true, why: res.activated ? "went live" : `waiting for approval (${res.version.label})` };
}

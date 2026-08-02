// Unit tests for the phone-menu map: confidence, path identity, key-hammer detection, what a call
// teaches us, and the recording-plan handoff to listening navigation.
// Run: env DATABASE_URL=file:./.t-map.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//        ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-mapgraph.ts
//
// Everything here is pure — no DB, no network, no phone calls — so the rules that decide what we
// trust are provable on their own.
import { scoreConfidence, pathSignature, isHammerPath, promptFingerprint, guessLanguage, _test as mg, type Evidence } from "../src/calls/mapgraph";
import { recipeFromCall, transcriptFromCall, promptCount, callHadAReprompt } from "../src/calls/map-capture";
import { shouldFireOnPrompt } from "../src/calls/listen-nav";
import { navPlanFromVersion } from "../src/calls/service";
import { _test as sw } from "../src/calls/sweep";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const DAY = 86400;
const NOW = 1_800_000_000;
const call = (o: Partial<Evidence["calls"][0]> = {}) => ({
  at: NOW, day: "2026-07-26", reachedHuman: true, path: "say:no>say:front", storeId: 1, ...o,
});

console.log("▶ confidence is earned, never assumed");
{
  ok(scoreConfidence({ calls: [] }, NOW).label === "unknown", "no evidence = unknown, score 0");
  ok(scoreConfidence({ calls: [call()] }, NOW).label === "observed once", "one call = observed once");
  ok(scoreConfidence({ calls: [call()] }, NOW).score === 45, "one call scores 45, not 90");
  const twoStores = { calls: [call({ storeId: 1 }), call({ storeId: 2 })] };
  ok(scoreConfidence(twoStores, NOW).score === 80, "two calls at two stores = 80");
  const full = { calls: [call({ storeId: 1 }), call({ storeId: 2, day: "2026-07-25", at: NOW - DAY }), call({ storeId: 3 })] };
  ok(scoreConfidence(full, NOW).label === "verified", "three calls, two days, three stores = verified");
}

console.log("▶ calls that disagree can never be verified");
{
  const split = { calls: [call({ path: "say:no>say:front" }), call({ path: "press:0", storeId: 2 }), call({ storeId: 3 })] };
  const s = scoreConfidence(split, NOW);
  ok(s.label === "not proven", "two different routes = not proven, whatever the count");
  ok(s.score === 40, "and the score is capped low");
}

console.log("▶ an old map stops claiming certainty");
{
  const old = { calls: [call({ at: NOW - 60 * DAY, storeId: 1 }), call({ at: NOW - 61 * DAY, storeId: 2, day: "2026-05-20" }), call({ at: NOW - 62 * DAY, storeId: 3, day: "2026-05-19" })] };
  const s = scoreConfidence(old, NOW);
  ok(s.label === "not proven", "60 days without a confirmation drops it to not proven");
  ok(s.why.includes("days ago"), "and says why in plain words");
}

console.log("▶ a call that never reached a person proves nothing");
{
  const s = scoreConfidence({ calls: [call({ reachedHuman: false })] }, NOW);
  ok(s.score === 0 && s.label === "unknown", "no human = no confidence");
}

console.log("▶ key-hammering is recognised, not trusted");
{
  ok(isHammerPath({ steps: [{ action: "press", value: "0" }, { action: "press", value: "0" }, { action: "press", value: "0" }] }), "press 0 three times = hammering (Safeway, Albertsons…)");
  ok(isHammerPath({ steps: [{ action: "press", value: "2" }, { action: "press", value: "2" }] }), "press 2 twice is also hammering (Target's two-step is the same key)");
  ok(!isHammerPath({ steps: [{ action: "press", value: "1" }, { action: "press", value: "8" }] }), "two different keys is a real route");
  ok(!isHammerPath({ steps: [{ action: "press", value: "0" }] }), "one press is a route, not a hammer");
}

console.log("▶ a mapping call teaches us WHICH recording each step follows");
{
  // CVS, the owner's example: greeting, then the healthcare question we answer "no" to, then the
  // options list we say "general" at the end of.
  const steps = [
    { who: "ivr", text: "Thanks for calling CVS pharmacy…", atSec: 0 },
    { who: "ivr", text: "Are you calling from a doctor's office?", atSec: 12 },
    { who: "us", action: "say", value: "no", atSec: 16 },
    { who: "ivr", text: "For the pharmacy say pharmacy, for the front store say front, for general inquiries say general", atSec: 20 },
    { who: "us", action: "say", value: "general", atSec: 41 },
  ];
  const r = recipeFromCall(steps, 48);
  ok(r.steps.length === 2, "two spoken steps captured");
  ok(r.steps[0].afterPrompt === 2, `"no" follows recording 2 (got ${r.steps[0].afterPrompt})`);
  ok(r.steps[1].afterPrompt === 3, `"general" follows recording 3 (got ${r.steps[1].afterPrompt})`);
  ok(r.steps[0].atSec === 16 && r.steps[1].atSec === 41, "learned seconds kept as the backstop");
  ok(r.type === "voice" && r.seconds === 48, "voice route, 48s to a person");
  ok(promptCount(steps) === 3, "three recordings heard");
  ok(transcriptFromCall(steps)[0].startsWith("0s Thanks for calling"), "transcript kept as evidence, with timings");
}

console.log("▶ the confirm question is never learned as a menu step");
{
  const steps = [
    { who: "ivr", text: "Target Topanga, how can I help?", atSec: 27 },
    { who: "us", text: "asked: do you have any Pokémon cards in stock?", action: "say", value: "do you have any Pokémon cards", atSec: 29 },
  ];
  const r = recipeFromCall(steps, 27);
  ok(r.steps.length === 0 && r.type === "direct", "a person answered — direct, with no steps invented");
}

console.log("▶ barge wins are recorded on the step they belong to");
{
  const steps = [
    { who: "ivr", text: "Welcome to Target…", atSec: 0 },
    { who: "us", action: "press", value: "2", atSec: 8 },
    { who: "ivr", text: "For guest services press 2", atSec: 12 },
    { who: "us", action: "press", value: "2", atSec: 16 },
  ];
  const r = recipeFromCall(steps, 30, new Set([0]));
  ok(r.steps[0].bargeSafe === true, "step 1 proved safe to press early");
  ok(r.steps[1].bargeSafe === undefined, "step 2 makes no such claim");
  ok(r.type === "keypad", "keypad route");
}

console.log("▶ a step waits for ITS recording, and lateness never loses it");
{
  const step = { action: "say" as const, value: "general", atSec: 41, afterPrompt: 3 };
  ok(!shouldFireOnPrompt(step, 1, 20, 16).fire, "recording 1 ending does not fire it");
  ok(!shouldFireOnPrompt(step, 2, 30, 16).fire, "recording 2 ending does not fire it");
  ok(shouldFireOnPrompt(step, 3, 33, 16).fire, "recording 3 ending fires it — 8s EARLIER than the mapped 41s");
  ok(shouldFireOnPrompt(step, 4, 60, 16).fire, "a store that plays an extra recording still fires it, late");
  const noPlan = { action: "say" as const, value: "general", atSec: 41 };
  ok(shouldFireOnPrompt(noPlan, 1, 33, 16).fire, "no recording plan = today's behaviour, first pause after eligible");
  ok(!shouldFireOnPrompt(noPlan, 1, 20, 16).fire, "still never before (learned - 12s)");
  ok(!shouldFireOnPrompt({ action: "say", value: "front", atSec: 20, afterPrompt: 2 }, 2, 17, 16).fire, "two steps can't fire on one pause");
}

console.log("▶ one version in, one plan out — pieces from two versions can never be mixed");
{
  // What we press, what we say and which recording each waits for all come out of the SAME saved
  // version, in one call. This replaced a side channel that matched a plan to a call by the SHAPE
  // of its step list, so a second version of the same route could lend its anchors to the first.
  const v2 = [{ action: "say", value: "no", atSec: 16, afterPrompt: 2 }, { action: "say", value: "general", atSec: 41, afterPrompt: 3 }];
  const p = navPlanFromVersion(v2);
  ok(p.say === "no@16,general@41", "the spoken plan reads off the version");
  ok(p.steps.map((s) => s.afterPrompt).join(",") === "2,3", "and its anchors come with it, on the same steps");
  // The identical-looking route from a DIFFERENT version carries that version's anchors and only
  // its own. Same shape, different answer — which is exactly what the old key could not tell apart.
  const other = navPlanFromVersion([{ action: "say", value: "no", atSec: 16, afterPrompt: 1 }, { action: "say", value: "general", atSec: 41 }]);
  ok(other.steps.map((s) => s.afterPrompt ?? "-").join(",") === "1,-", "a look-alike route keeps ITS anchors, not the other version's");
  ok(navPlanFromVersion(null).steps.length === 0 && navPlanFromVersion([]).dtmf === "", "no version = nothing to run, not a half plan");

  const keys = navPlanFromVersion([{ action: "press", value: "2", atSec: 8 }, { action: "press", value: "", atSec: 16 }]);
  ok(keys.dtmf === "2@8", "a press with no usable digit is dropped, never sent as a bare time");
  ok(navPlanFromVersion([{ action: "press", value: "3", atSec: 20 }, { action: "press", value: "1", atSec: 4 }]).dtmf === "1@4,3@20", "steps run in the order the store hears them");
}

console.log("▶ paths and plain-English change notes");
{
  ok(pathSignature({ steps: [{ action: "say", value: "No" }] }) === "say:no", "signature is case-insensitive");
  ok(pathSignature({ steps: [] }) === "direct", "no steps = direct");
  const prev = { recipe: { type: "voice" as const, steps: [{ action: "say" as const, value: "front", atSec: 20 }], seconds: 40 }, seconds: 40 } as never;
  ok(mg.describeChange(null, { type: "voice", steps: [{ action: "say", value: "front", atSec: 20 }], seconds: 40 }).startsWith("First map"), "first map says so");
  ok(mg.describeChange(prev, { type: "voice", steps: [{ action: "say", value: "front", atSec: 20 }], seconds: 31 }).includes("9s faster"), "a faster same route reads as faster");
  ok(mg.describeChange(prev, { type: "keypad", steps: [{ action: "press", value: "0", atSec: 5 }], seconds: 40 }).startsWith("Route changed"), "a new route reads as changed");
}

console.log("▶ a call where the store repeated itself teaches timing, not anchors");
{
  // CVS Alhambra, 07-28, verbatim: the assistant asked, we sat through it, it re-prompted, and every
  // anchor after that came back one recording too high (3/4/5 for a route whose clean shape is 2/3/4).
  const messy = [
    { who: "ivr", text: "Thank you for calling CVS, Pharmacy.", atSec: 10 },
    { who: "ivr", text: "I am your virtual assistant. Are you a healthcare provider?", atSec: 30 },
    { who: "ivr", text: "sorry I'm not understanding please confirm if you are a healthcare provider", atSec: 51 },
    { who: "us", action: "say", value: "no", atSec: 51 },
    { who: "ivr", text: "please let me know if you are calling in for pharmacy or front door services", atSec: 63 },
    { who: "us", action: "say", value: "front", atSec: 63 },
  ];
  ok(callHadAReprompt(messy), "the re-prompt is recognised");
  const r = recipeFromCall(messy, 91);
  ok(r.steps.every((s) => s.afterPrompt === undefined), "so NO anchors are learned from it");
  ok(r.anchorsFrom === "reprompt", "and it says where it came from");
  ok(r.seconds === 91, "the timing is still true and still kept");
  const clean = [
    { who: "ivr", text: "Thank you for calling CVS, Pharmacy.", atSec: 10 },
    { who: "ivr", text: "Are you a healthcare provider?", atSec: 28 },
    { who: "us", action: "say", value: "no", atSec: 30 },
  ];
  ok(!callHadAReprompt(clean), "a clean call is not flagged");
  ok(recipeFromCall(clean, 60).steps[0].afterPrompt === 2, "and it anchors on the recording it actually followed");
  ok(recipeFromCall(clean, 60).anchorsFrom === "clean", "marked clean, so it can replace dirty anchors later");
}

console.log("▶ a prompt keeps the same identity across speech-to-text wobble");
{
  const a = promptFingerprint("For the pharmacy press 1, for the front store press 2");
  const b = promptFingerprint("for the pharmacy press one for the front store press 2.");
  ok(a === b && !!a, `"press 1" and "press one" are the same prompt (${a})`);
  ok(promptFingerprint("Thanks for calling CVS. Para español oprima nueve") === promptFingerprint("thanks for calling cvs, para espanol oprima nueve"),
    "spelled with or without the tilde is the same prompt");
  ok(promptFingerprint("Our hours have changed, we close at nine") !== a, "a genuinely different menu is a different prompt");
  ok(promptFingerprint("   ") === "", "silence has no fingerprint, and never becomes a node");
}

console.log("▶ language is read off what the store said, and guessed at nothing");
{
  ok(guessLanguage("Para español oprima nueve") === "es", "Spanish is recognised");
  ok(guessLanguage("For the pharmacy press 1") === "en", "English is recognised");
  ok(guessLanguage("Thanks for calling. Para español oprima nueve") === "mixed", "a menu offering both is mixed");
  ok(guessLanguage("") === "unknown" && guessLanguage("mmm hmm") === "unknown", "no evidence stays unknown, never defaults to English");
}

console.log("▶ the sweep dials east first");
{
  ok(sw.rankOf("America/New_York") < sw.rankOf("America/Chicago"), "east coast before central");
  ok(sw.rankOf("America/Chicago") < sw.rankOf("America/Los_Angeles"), "central before pacific");
  ok(sw.rankOf("Pacific/Honolulu") > sw.rankOf("America/Anchorage"), "hawaii last");
  ok(sw.rankOf(null) === sw.rankOf("America/Chicago"), "an unknown timezone sorts as central, not first");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

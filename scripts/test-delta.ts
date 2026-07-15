// Unit: the D-lane (Delta) turn decision. Locks the set-first follow-up flow (ask the SET before the
// product type, skip whatever the clerk already named), the restock-day ask on a no, the clarify-once
// rule, and the in/out verdict mapping. Pure function, no DB/network (run with dummy EL env so config
// loads). The off-script "question" barge is handled in tapedeckStep, not here.
import { deltaDecide, deltaTurnTuning, deltaSilence } from "../src/calls/tapedeck";

let fail = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ✓ ${label}`); } else { console.error(`  ✗ ${label}\n     got:  ${g}\n     want: ${w}`); fail++; }
};
const D = (stage: string, label: string, gotSet = false, gotType = false, clarified = false, needType = false) =>
  deltaDecide({ stage: stage as never, label, gotSet, gotType, clarified, needType });

// --- opener: in stock → SET FIRST, then type, skipping what they already named ---
eq(D("opener", "yes"), { clip: 1, next: "askedSet", confirmed: true, statusKey: "in_stock", setNeedType: true, note: "in stock → ask the SET first" }, "yes (bare) → ask the set first, still owe the type");
eq(D("opener", "product", true, false).clip, 2, "yes + they named the SET but not the type → ask the type");
eq(D("opener", "yes", true, false).next, "askedType", "named set only → move to askedType");
eq(D("opener", "yes", true, true), { clip: 4, next: "done", confirmed: true, statusKey: "in_stock", note: "named the set + type already → wrap" }, "named BOTH set + type → wrap, no redundant asks");
eq(D("opener", "yes").setNeedType, true, "bare yes still owes the product type after the set");
eq(D("opener", "yes", false, true).setNeedType, false, "yes + type-but-no-set → ask set, and DON'T re-ask type");

// --- opener: out of stock → restock-day ask ---
eq(D("opener", "no"), { clip: 3, next: "askedDay", confirmed: false, statusKey: "not_in_stock", note: "out → ask the restock day" }, "no → not_in_stock + ask the restock day");
eq(D("opener", "day"), { clip: 3, next: "askedDay", confirmed: false, statusKey: "not_in_stock", note: "out → ask the restock day" }, "day (out, gave timing) → not_in_stock + restock-day");

// --- opener: unclear → clarify once, then wrap as no-clear-answer ---
eq(D("opener", "unclear", false, false, false), { clip: 5, next: "opener", setClarified: true, note: "unclear → clarify once" }, "unclear (first time) → clarify once, stay in opener");
eq(D("opener", "unclear", false, false, true), { clip: 4, next: "done", confirmed: null, statusKey: "no_clear_answer", note: "still unclear → wrap" }, "unclear again → no_clear_answer, wrap");

// --- askedSet: they answered the set → ask the type only if we still owe it ---
eq(D("askedSet", "product", true, false, false, true).clip, 2, "answered the set, still owe type → ask packs/tin");
eq(D("askedSet", "product", true, false, false, true).next, "askedType", "answered the set → move to askedType");
eq(D("askedSet", "product", true, false, false, false).clip, 4, "answered the set, type already had → wrap");
// Owner 07-10 call 1: "I don't know the set name" must NOT end the call — ask tin/packs instead.
eq(D("askedSet", "unclear", false, false, false, true), { clip: 2, next: "askedType", note: "didn't know the set → ask packs/tin instead" }, "didn't know the set, still owe type → ask packs/tin");
eq(D("askedSet", "unclear", false, false, false, false).clip, 4, "set unclear and type already known → wrap, don't loop");

// --- askedType / askedDay: their answer settles it ---
eq(D("askedType", "product").clip, 4, "answered the product type → wrap");
eq(D("askedDay", "day").clip, 4, "answered the restock day → wrap");
eq(D("askedType", "unclear").next, "done", "any askedType reply ends the call");

// --- turn-taking tuning: the workflow's Beat + Reply timeout drive the Twilio Gather ---
// Endpointing is seconds of trailing silence before we treat them as done. Floor 2s so a thinking
// pause never cuts a clerk off mid-answer (owner 07-15: eager=1s hung up before "it's a tin").
eq(deltaTurnTuning({}), { waitSecs: 10, endpoint: "3" }, "no tuning → 10s to start, 3s of thinking room");
eq(deltaTurnTuning({ turnEagerness: "eager" }).endpoint, "2", "Beat eager → 2s of give (snappiest, still never cuts mid-word)");
eq(deltaTurnTuning({ turnEagerness: "patient" }).endpoint, "5", "Beat patient → a full 5s pause allowed");
eq(deltaTurnTuning({ turnEagerness: "normal" }).endpoint, "3", "Beat normal → 3s of give");
eq(deltaTurnTuning({ turnTimeout: 45 }).waitSecs, 20, "Charlie's 45s reply timeout clamps to Delta's 20s cap");
eq(deltaTurnTuning({ turnTimeout: 1 }).waitSecs, 4, "reply-to-start floors at 4s");
eq(deltaTurnTuning({ turnTimeout: 10 }).waitSecs, 10, "in-range reply timeout passes through");
eq(deltaTurnTuning({ turnTimeout: "nope" }), { waitSecs: 10, endpoint: "3" }, "garbage tuning falls back to defaults");

// --- silence: DEAD AIR vs a HELD line are different (owner 07-15) ---
// Dead air (nobody spoke) → "Hello? You still there?" (clip 7), NEVER "take your time".
eq(deltaSilence({ stage: "askedSet", silence: 1 }), { action: "nudge", clip: 7 }, "dead air → 'you still there?' (clip 7), not 'take your time'");
eq(deltaSilence({ stage: "askedType", silence: 2 }), { action: "nudge", clip: 7 }, "2nd dead-air turn → still checking they're there");
eq(deltaSilence({ stage: "askedType", silence: 3 }), { action: "wrap", clip: 8 }, "3rd dead-air turn → neutral wrap (nobody's home)");
// Held line (clerk said "hold on, let me check", onHold) → wait quietly, don't nag.
eq(deltaSilence({ stage: "askedSet", silence: 1, onHold: true }), { action: "holdwait", clip: -1 }, "on hold → wait quietly, no clip (they're checking)");
eq(deltaSilence({ stage: "askedSet", silence: 2, onHold: true }), { action: "holdwait", clip: -1 }, "still on hold → keep waiting quietly");
eq(deltaSilence({ stage: "askedSet", silence: 3, onHold: true }), { action: "nudge", clip: 7 }, "long hold → one gentle 'still there?'");
eq(deltaSilence({ stage: "askedSet", silence: 4, onHold: true, canBarge: true }), { action: "barge", clip: -1 }, "dragging hold on a real store call → Charlie sits it out");
eq(deltaSilence({ stage: "askedSet", silence: 4, onHold: true, canBarge: false }), { action: "wrap", clip: 8 }, "dragging hold with no barge (bench) → neutral wrap");

if (fail) { console.error(`delta: ${fail} test(s) FAILED`); process.exit(1); }
console.log("delta: all passed");

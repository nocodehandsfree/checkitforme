// Unit: the D-lane (Delta) turn decision. Locks the set-first follow-up flow (ask the SET before the
// product type, skip whatever the clerk already named), the restock-day ask on a no, the clarify-once
// rule, and the in/out verdict mapping. Pure function, no DB/network (run with dummy EL env so config
// loads). The off-script "question" barge is handled in tapedeckStep, not here.
import { deltaDecide } from "../src/calls/tapedeck";

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
eq(D("askedSet", "unclear", false, false, false, true).clip, 4, "set answer unclear → wrap, don't loop");

// --- askedType / askedDay: their answer settles it ---
eq(D("askedType", "product").clip, 4, "answered the product type → wrap");
eq(D("askedDay", "day").clip, 4, "answered the restock day → wrap");
eq(D("askedType", "unclear").next, "done", "any askedType reply ends the call");

if (fail) { console.error(`delta: ${fail} test(s) FAILED`); process.exit(1); }
console.log("delta: all passed");

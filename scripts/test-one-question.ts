// Unit: ONE QUESTION, THEN WRAP — the fold, on the LIVE AGENT lane.
//
// The recorded-clip lane already honoured it (test-delta.ts). The live agent did not: it had no way
// to read the fold at all, so a store moved onto a folded workflow still heard the old two question
// flow on a real call (owner, Fun store, 07-28). This locks the missing half.
//
// Pure: the rule that reads the workflow's data, and the two instruction builders the agent is given.
// No DB, no network.
import { declaresOneTurn } from "../src/calls/tapedeck";
import { RESTOCK_PROMPT } from "../src/voice/prompts";
import { reconcile, type ClerkVerdict } from "../src/voice/verdict";
import { billableOutcome } from "../src/calls/service";
import { TEST_ONE_QUESTION } from "./make-test-workflow";

let fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) console.log(`  ✓ ${label}`); else { console.error(`  ✗ ${label}`); fail++; }
};

// ---- The DATA declares it, never a flag ----
ok(declaresOneTurn({ set: ["a"], type: [] }) === true, "an empty type list = the set question already asks the format");
ok(declaresOneTurn({ set: ["a"], type: [""] }) === true, "a type list of blanks counts as empty, not as a question");
ok(declaresOneTurn({ set: ["a"], type: ["and is it packs or a box?"] }) === false, "a real type line = the old two question flow");
ok(declaresOneTurn({ set: ["a"] }) === false, "no type key at all = untouched, the old flow");
ok(declaresOneTurn({}) === false, "an empty follow-up block changes nothing");
ok(declaresOneTurn(undefined) === false, "a workflow with no follow-ups changes nothing");
ok(declaresOneTurn(null) === false, "null follow-ups never crash the call");

// ---- ONE QUESTION IS NOW THE ONLY QUESTION (the owner's rewrite, approved 08-04 and 08-05) ----
//
// The four instruction builders this file used to assert are RETIRED. They existed because a check
// could get one question or two depending on the workflow's follow-up data and whether the finder
// paid, and the whole point of the rewrite is that sections 10 and 11 are FIXED WORDS every check
// gets: one question on a yes, one question on a no, never a second one either way. So what is left
// to prove on the live agent lane is that the folding is gone from Charlie's words entirely, and the
// fixed sections say what the fold used to have to say.
console.log("\n▶ the fold is retired: every check asks the one question, off fixed words");
ok(!/\{\{premium_followup\}\}|\{\{ask_shipment_day\}\}/.test(RESTOCK_PROMPT),
  "no follow-up variable is left for a workflow to swap out");
ok(RESTOCK_PROMPT.includes("never ask a second question about it"), "section 10: one question on a yes, never a second");
ok(RESTOCK_PROMPT.includes("Never ask a second restock question."), "section 11: one question on a no, never a second");
ok(RESTOCK_PROMPT.includes("Take whatever they answer, even half of it"),
  "half an answer still wraps, rather than paying for a follow up");
ok(!/premium|subscriber|paying/i.test(RESTOCK_PROMPT), "the paying versus free split is gone from his words");

// ---- THE READER RULE (owner 07-29) ----------------------------------------------------------
// "When the second reader disagrees with Charlie's status, the customer gets couldn't-tell and NO
// charge — never a wrong answer." The merge itself always had the rule; three of the five finalize
// paths never let it see the second read, so the disagreement that matters most was thrown away.
console.log("\n▶ the reader rule: a disagreement is never resolved in favour of a guess");
const READ = (inStock: "yes" | "no" | "unclear", confidence = 0.9): ClerkVerdict =>
  ({ inStock, restockDay: null, restockTime: null, productForm: null, set: null, confidence, reason: "t" });

{
  // THE FALSE GREEN. This is the one that cost a customer a drive to the store.
  const c = reconcile({ confirmed: true, statusKey: "in_stock" }, READ("no"));
  ok(c.confirmed === null, "the live read says in stock, the reader says no: the customer is told we could not tell");
  ok(c.definitive === false, "…and it is not definitive, which is what stops the charge");
  ok(c.statusKey === "no_clear_answer", "…with the honest status, never in_stock");
  ok(c.agreed === false, "…and the call log records that the two reads conflicted");
  ok(billableOutcome(c.statusKey, c.definitive, "Agent: hi\nClerk: maybe") === true,
    "a real two way conversation is still billable by the owner's 07-22 ruling, even unsure");
  ok(billableOutcome(c.statusKey, c.definitive, null) === false, "but with nothing said, a conflict is never charged");
}
{
  // THE FALSE RED. The mirror case: we would have told him a store had none when it had them.
  const c = reconcile({ confirmed: false, statusKey: "not_in_stock" }, READ("yes"));
  ok(c.confirmed === null && c.definitive === false, "the live read says no, the reader says yes: also couldn't tell");
}
{
  // A hard sold-out is not a disagreement to be second-guessed: it is the safest answer already.
  const c = reconcile({ confirmed: false, soldOut: true, statusKey: "sold_out" }, READ("yes"));
  ok(c.confirmed === false && c.definitive === true && c.statusKey === "sold_out",
    "sold out still wins outright, so a reader cannot talk us into a false green");
}
{
  // An abstention is NOT a disagreement. A reader with no opinion must not erase a real answer, or
  // every quiet call would come back unsure and nothing would ever be charged.
  const yes = reconcile({ confirmed: true, statusKey: "in_stock" }, READ("unclear"));
  ok(yes.confirmed === true && yes.definitive === true, "a reader who is merely unsure does not overturn a real answer");
  const none = reconcile({ confirmed: true, statusKey: "in_stock" }, null);
  ok(none.confirmed === true && none.definitive === true, "and no reader at all leaves the live read exactly as it was");
  const agree = reconcile({ confirmed: true, statusKey: "in_stock" }, READ("yes"));
  ok(agree.confirmed === true && agree.agreed === true, "two reads agreeing is a plain yes");
}
{
  // Both unsure: honest, and the reason the customer sees is preserved rather than flattened.
  const c = reconcile({ confirmed: null, statusKey: "voicemail" }, READ("unclear"));
  ok(c.definitive === false && c.statusKey === "voicemail", "a machine still reads as a machine, not as no clear answer");
}

// ---- The Testing workflow the owner's six calls run ------------------------------------------
// "Test — One Question" on Branson HD: the approved question and its one follow-up, nothing else.
// ONE opener, deliberately — Gate Zero needs the same configuration on every run, and a four opener
// rotation makes six calls into six slightly different calls.
console.log("\n▶ the Test — One Question workflow is the approved script and nothing else");
{
  const wf = TEST_ONE_QUESTION;
  ok(wf.openers.length === 1, "exactly one opener, so every test call asks the identical question");
  ok(wf.openers[0] === "Hi there! I was just checking, do you have any {category} cards in stock right now?",
    "and it is his approved question, word for word");
  ok(wf.tuning.opening === wf.openers[0], "the voice's own opening line matches it, so nothing can drift between them");
  ok(wf.voiceId === "1P1JhCcLzeMmkvLi1BkG" && wf.voices.length === 1, "Branson HD, one voice, no rotation");
  ok(wf.lane === "charlie", "the live agent lane, which is what the new engine runs");
  ok(declaresOneTurn(wf.followups) === true, "it declares ONE question: the set and the format are folded into one line");
  ok(wf.followups.set.length === 1 && wf.followups.no.length === 1,
    "one follow-up for in stock and one for not in stock — only ever one of them fires on a call");
  ok(wf.tuning.speed === 0.91, "the same speed every other Branson HD call runs at");
}

console.log(fail ? `\n${fail} FAILED` : "\nall one-question + reader checks pass");
process.exit(fail ? 1 : 0);

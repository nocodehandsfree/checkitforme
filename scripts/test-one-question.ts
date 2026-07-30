// Unit: ONE QUESTION, THEN WRAP — the fold, on the LIVE AGENT lane.
//
// The recorded-clip lane already honoured it (test-delta.ts). The live agent did not: it had no way
// to read the fold at all, so a store moved onto a folded workflow still heard the old two question
// flow on a real call (owner, Fun store, 07-28). This locks the missing half.
//
// Pure: the rule that reads the workflow's data, and the two instruction builders the agent is given.
// No DB, no network.
import { declaresOneTurn } from "../src/calls/tapedeck";
import { oneTurnFollowup, oneTurnShipmentDay, PREMIUM_FOLLOWUP, ASK_SHIPMENT_DAY } from "../src/voice/prompts";
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

// ---- The folded in-stock instruction ----
const FOLD = "Do you know the name of the set, like Chaos Rising, and if it comes in a box or pack?";
const f = oneTurnFollowup(FOLD);
ok(f.includes(FOLD), "the agent is given the workflow's OWN question, word for word");
ok(/EXACTLY ONE question/.test(f), "it is told exactly one question");
ok(/NEVER ask a second question/.test(f), "a second question is forbidden outright");
ok(/only half/.test(f), "half an answer still wraps, rather than paying for a follow up");
ok(/WORD FOR WORD/.test(f), "the wording is not a suggestion the agent may improve on");
ok(/do not reword it/.test(f), "rewording is named and forbidden");
ok(!/AFTER they answer the set, ask the product type/.test(f), "the two question instruction is gone, not merely reworded");
ok(f !== PREMIUM_FOLLOWUP, "a folded workflow does not get the two question script");
ok(oneTurnFollowup("") === PREMIUM_FOLLOWUP, "an empty question falls back to the old flow, never a blank instruction");
ok(oneTurnFollowup("   ") === PREMIUM_FOLLOWUP, "whitespace is not a question either");

// ---- The folded not-in-stock instruction ----
const NOFOLD = "Do you know what day or time you're getting your next shipment?";
const n = oneTurnShipmentDay(NOFOLD);
ok(n.includes(NOFOLD), "the restock ask is the workflow's own line");
ok(/EXACTLY ONE question/.test(n), "the restock ask is one question too");
ok(/NEVER ask a second question/.test(n), "no narrowing-down follow up on a no");
ok(/WORD FOR WORD/.test(n), "the restock line is said as written, not paraphrased");
ok(/DAY OR TIME/.test(n), "and it is told WHY: a paraphrase loses the day and the time");
ok(n !== ASK_SHIPMENT_DAY, "a folded workflow does not get the old restock script");
ok(oneTurnShipmentDay("") === ASK_SHIPMENT_DAY, "an empty restock line falls back to the old one");

// ---- Copy law: no dash inside a sentence, in anything the agent is told to say ----
const dashes = [f, n].filter((t) => /[—–]|\s-\s/.test(t));
ok(dashes.length === 0, "neither instruction carries a dash inside a sentence");

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

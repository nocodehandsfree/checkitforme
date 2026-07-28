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

console.log(fail ? `\n${fail} FAILED` : "\nall one-question checks pass");
process.exit(fail ? 1 : 0);

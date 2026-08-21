// THE THREE REAL RECORDS, REPLAYED AGAINST THE FIX (owner's order, 08-21, off check 430).
//
// Run:  ./node_modules/.bin/tsx scripts/replay-430.ts <dir-with-rep427.json rep428.json rep430.json>
//
// His rule since 08-01: the owner's phone never re-finds an old fault, so every prior recorded run
// is replayed against the fixed engine before he dials again. These are the three checks the advert
// scene has produced since our own brain shipped, fetched whole off staging and run through the new
// grading. Nothing is simulated: the timeline and the spoken lines are each check's own.
//
// WHAT IS BEING ASKED OF EACH ONE: did Charlie talk while the store's own recording was still
// playing, and does the check's meter half now say so? 427 and 428 must be untouched by the new
// rule (he never spoke over the advert on either); 430 must fail on it, where it said TEST PASSED.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spokeOverTheRecording, meterVerdict } from "../src/calls/meter";
import { TEST_CARDS } from "../src/calls/behaved";

// THE THREE RECORDS ARE COMMITTED BESIDE THIS FILE, fetched whole off staging on 08-21, so this
// re-runs forever on the SAME records with no network and no key — the same way the hold-voice
// workbench keeps its recordings (rule 12: his phone never re-finds an old fault).
const dir = process.argv[2] || join(import.meta.dirname ?? ".", "replay-records");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, saw?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};

interface Rec {
  timeline: Array<{ kind: string; atMs?: number | null; detail?: Record<string, unknown> | null }>;
  lines: Array<{ who: string; text: string; atMs: number | null; endMs?: number | null }>;
  seconds?: Record<string, number | null>;
  v2?: { profitPct?: number | null; test?: { meter?: { pass?: boolean } | null } | null };
}
const load = (n: string): Rec => JSON.parse(readFileSync(join(dir, `rep${n}.json`), "utf8")) as Rec;

// The same numbers the sheet grades each check on, off its own record, so the only thing that has
// changed between the old grade and this one is the new rule.
function grade(r: Rec) {
  const over = spokeOverTheRecording(r.timeline, r.lines ?? null);
  const v = meterVerdict(TEST_CARDS.hold_music_advert, {
    meterSec: r.seconds?.charlieConnectedSeconds ?? null,
    speakingSec: r.seconds?.speakingSecs ?? null,
    listeningSec: r.seconds?.listeningSecs ?? null,
    awakeOnHoldSec: r.seconds?.awakeOnHoldSeconds ?? null,
    profitPct: r.v2?.profitPct ?? null,
    // The advert ruling each of these three checks was really graded under, so the only thing
    // that differs between the old grade and this one is the new rule.
    advert: { asWaitSec: 18, gradedProfitPct: 70 },
    spokeOverRecording: over,
  })!;
  return { over, v };
}

console.log("▶ CHECK 427 replayed: he never spoke over the advert, so the new rule leaves it alone");
{
  const { over, v } = grade(load("427"));
  ok("nothing of his lands inside the store's recording", over === null, over);
  ok("…and no such row is drawn on it", !v.rows.some((x) => x.label.includes("Talked over")));
  ok("…so the new rule fails it for nothing", !v.shortFails.some((x) => /talked over/.test(x)), v.shortFails);
}

console.log("\n▶ CHECK 428 replayed: the same, on the check that passed this morning");
{
  const { over, v } = grade(load("428"));
  ok("nothing of his lands inside the store's recording", over === null, over);
  ok("…and no such row is drawn on it", !v.rows.some((x) => x.label.includes("Talked over")));
  ok("…and its meter half still passes", v.pass === true, v.shortFails);
}

console.log("\n▶ CHECK 430 replayed: the check that said TEST PASSED must now FAIL");
{
  const r = load("430");
  const { over, v } = grade(r);
  ok("his line inside the advert is found on the real record", over !== null, over);
  ok("…and it is the question he asked all over again",
    /do you guys happen to have any/i.test(over?.text ?? ""), over?.text);
  ok("…at 19 seconds, where the record puts it", over?.atSec === 19, over?.atSec);
  ok("THE METER HALF NOW FAILS, where the sheet said the test passed", v.pass === false, v.shortFails);
  ok("…and it says so in plain words", v.fails.some((x) => /still playing/.test(x)), v.fails);
  // AND IT IS THE ONLY THING THAT FAILS IT. The rest of 430's numbers really were inside their
  // bands, which is exactly why it read as a pass and why this rule had to exist.
  const without = meterVerdict(TEST_CARDS.hold_music_advert, {
    meterSec: r.seconds?.charlieConnectedSeconds ?? null,
    speakingSec: r.seconds?.speakingSecs ?? null,
    listeningSec: r.seconds?.listeningSecs ?? null,
    awakeOnHoldSec: r.seconds?.awakeOnHoldSeconds ?? null,
    profitPct: r.v2?.profitPct ?? null,
    // …WITH THE ADVERT FORGIVENESS ITS OWN SHEET HAD, which is what made 430 read as a pass.
    advert: { asWaitSec: 18, gradedProfitPct: 70 },
  })!;
  ok("…and without the new rule its own numbers still read as a pass, which is the whole point",
    without.pass === true, without.shortFails);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

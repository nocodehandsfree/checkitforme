// THE GATEKEEPER'S ONE RULE, PROVEN WITHOUT A DATABASE.
// Run: ./node_modules/.bin/tsx scripts/test-check-life.ts
//
// aliveFromRow is the whole aliveness decision once memory is gone: the carrier's line-end is the
// only end, and a row so old its callback must have been lost fails toward "finished" — never toward
// a check that can never finalize. Everything else in check-life.ts is plumbing to and from this.
import { aliveFromRow, LIFE_HARD_CAP_SECS } from "../src/calls/check-life";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const NOW = 1_800_000_000;

console.log("▶ is this check alive? — the database's answer, one case at a time");
ok(aliveFromRow({ dialedAt: NOW - 60, lineEndedAt: null }, NOW) === true,
  "a check dialed a minute ago with no line-end is ALIVE — dropping Charlie for a hold must not end it");
ok(aliveFromRow({ dialedAt: NOW - 60, lineEndedAt: NOW - 5 }, NOW) === false,
  "the carrier said the line ended, so the check is over — the ONLY end there is");
ok(aliveFromRow({ dialedAt: NOW - 200, lineEndedAt: NOW - 200 }, NOW) === false,
  "a line that ended the second it was answered is still ended");
ok(aliveFromRow(null, NOW) === false,
  "a check nobody ever recorded is not a live call — same answer lineStillUp gives an unknown room");
ok(aliveFromRow(undefined, NOW) === false, "…and an undefined row answers the same");
ok(aliveFromRow({ dialedAt: NOW - LIFE_HARD_CAP_SECS - 1, lineEndedAt: null }, NOW) === false,
  "no line-end but dialed past the hard cap: the carrier's callback was LOST (a restart), not a live call");
ok(aliveFromRow({ dialedAt: NOW - LIFE_HARD_CAP_SECS + 5, lineEndedAt: null }, NOW) === true,
  "just inside the cap with no line-end stays alive — the cap is a lost-callback backstop, not a timer on a call");
ok(LIFE_HARD_CAP_SECS >= 6 * 300,
  `the cap (${LIFE_HARD_CAP_SECS}s) sits far past the longest call the carrier allows (300s), so it can never cut a real one`);

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

// THE GATEKEEPER'S ONE RULE, PROVEN WITHOUT A DATABASE.
// Run: ./node_modules/.bin/tsx scripts/test-check-life.ts
//
// aliveFromRow is the whole aliveness decision once memory is gone: the carrier's line-end is the
// only end, and a row so old its callback must have been lost fails toward "finished" — never toward
// a check that can never finalize. Everything else in check-life.ts is plumbing to and from this.
import { aliveFromRow, LIFE_HARD_CAP_SECS } from "../src/calls/check-life";
import { readFileSync } from "node:fs";

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

// ================================================================================================
// THE NAME EVERY GATE ASKS WITH. A gate can only be as good as what it is handed: the check the
// customer places from the website used to write its row at CONNECT, carrying the provider's
// conversation id and no name of our own, and nothing ever filled one in. Both finalize gates then
// asked about nothing, were told "not alive", and stamped a verdict + CHARGED mid-hold — the fault
// of the owner's second test run, still live on the one path he actually uses. Read off the source,
// because this is a wiring rule: no rig can prove a name that is never written.
console.log("\n▶ the website check writes its name before it dials, and every gate asks with one");
{
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/calls/service.ts", import.meta.url), "utf8");
  const place = server.slice(server.indexOf("async function bridgeStoreCall"), server.indexOf("// Queue adapter for the live lane"));

  ok(/const room = crypto\.randomUUID\(\);[\s\S]{0,900}?db\.insert\(callResults\)\.values\(\{[\s\S]{0,400}?room, providerCallId: `bridge:\$\{room\}`/.test(place),
    "the website check mints its name and writes it on the row BEFORE anything is dialled");
  ok(!/db\.insert\(callResults\)[\s\S]{0,200}?providerCallId: convId/.test(place),
    "…and no path inserts a nameless row when the conversation id turns up — it updates the one that exists");
  ok(/placeBridgeCall\([\s\S]{0,600}?\{ from, room,/.test(place),
    "the same name is handed to the dial, so the timeline and the row can never be about different checks");
  ok(/roomFinalizers\.set\(result\.room/.test(place),
    "a check nobody answers still ends — the carrier's terminal status closes the row, on this path too");
  ok(/armLiveRead\(room,/.test(place),
    "the conversation is read as it happens on this path (it never was — that IS the wait on 'Getting the answer')");

  ok(/isCheckAlive\(row\?\.room \?\? row\?\.providerCallId\)/.test(server),
    "the provider's end-of-call gate asks with whatever name the row carries, never with nothing");
  ok(/isCheckAlive\(row\.room \?\? row\.providerCallId\)/.test(service),
    "…and so does the sweeper, so an older nameless row cannot walk through either");
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

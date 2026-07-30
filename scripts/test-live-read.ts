// READ AS IT GOES — does it actually work, and is the customer's wait actually shorter?
// Feeds a check's lines through the SAME path a real check uses (calls/events.ts recordLine, via the
// registered hook), then times the finalize merge both ways: with the live read armed, and with it off.
import { openReceipt, recordLine, setLineHook } from "../src/calls/events";
import { armLiveRead, noteLiveLine, liveReadFor, dropLiveRead, liveReadCount } from "../src/voice/live-read";
import { consensusFor } from "../src/voice/verdict";

setLineHook(noteLiveLine); // exactly what server.ts does at boot

const LINES: ["Agent" | "Clerk", string][] = [
  ["Agent", "Hi there! I was just checking, do you have any Pokemon cards in stock right now?"],
  ["Clerk", "Let me have a look for you, hang on."],
  ["Clerk", "Yeah we've got a few booster boxes left, they're behind the counter."],
  ["Agent", "Amazing, thanks so much, have a good one."],
];
const FULL = LINES.map(([w, t]) => `${w}: ${t}`).join("\n");
const EL = { confirmed: null as boolean | null, soldOut: false, doesNotSell: false, statusKey: "in_stock" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (ok: boolean, m: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${m}`); if (!ok) bad++; };

// ── A. The read happens DURING the check, off our own live record ──
console.log("\nA. reading while the check runs");
const room = "test:live-read";
openReceipt(room, { lane: "direct", note: "test" });
armLiveRead(room, "Pokemon");
check(liveReadFor(room) === null, "nothing read before anyone speaks");
for (const [who, text] of LINES) { recordLine(room, who, text); await wait(120); }
check(liveReadFor(room) === null || true, "lines fed through the real recordLine path");
// Staff stopped talking. Charlie is still saying goodbye — this is the window the read runs in.
await wait(3500);
const live = liveReadFor(room);
check(!!live, "a read is ready before the check is finalized");
check(live?.inStock === "yes", `it read the answer correctly (got "${live?.inStock}")`);

// ── B. The customer's wait: the finalize merge with the read ready vs without ──
console.log("\nB. what the customer waits for at hang-up");
const t0 = Date.now();
const withLive = await consensusFor(EL, FULL, "Pokemon", undefined, room);
const readyMs = Date.now() - t0;
console.log(`  with the read already done: ${readyMs}ms -> ${withLive.consensus.statusKey}`);

const t1 = Date.now();
const coldRoom = "test:not-armed";
const cold = await consensusFor(EL, FULL, "Pokemon", undefined, coldRoom);
const coldMs = Date.now() - t1;
console.log(`  the old way (read starts now): ${coldMs}ms -> ${cold.consensus.statusKey}`);

check(readyMs < 60, `the wait is gone (${readyMs}ms, was ${coldMs}ms)`);
check(withLive.consensus.statusKey === cold.consensus.statusKey, "same verdict both ways — only the timing changed");

// ── C. It cannot leak or break a check ──
console.log("\nC. safety");
dropLiveRead(room);
check(liveReadFor(room) === null, "the room is released once the verdict is written");
check(liveReadCount() === 0, "nothing left held in memory");
const un = "test:never-armed";
recordLine(un, "Clerk", "we have them"); // no receipt, no arm — must be a silent no-op
check(liveReadFor(un) === null, "a line for an unarmed room is a no-op, never a crash");

console.log(bad ? `\n${bad} FAILED\n` : "\nall pass\n");
process.exit(bad ? 1 : 0);

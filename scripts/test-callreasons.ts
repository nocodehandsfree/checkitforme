// Unit tests: failed/no-answer calls carry their REAL reason (voicemail / busy / bad number /
// closed) in statusKey — "Call failed" is the last resort, never the default.
// Run: ./node_modules/.bin/tsx scripts/test-callreasons.ts
import { failureStatusKey } from "../src/voice/elevenlabs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ carrier/provider termination reasons map to registry keys");
ok(failureStatusKey("Voicemail detected") === "voicemail", "voicemail detected → voicemail");
ok(failureStatusKey("Reached an answering machine") === "voicemail", "answering machine → voicemail");
ok(failureStatusKey("Twilio: machine detection — machine_start") === "voicemail", "machine detect → voicemail");
ok(failureStatusKey("Twilio error: line busy") === "busy", "line busy → busy");
ok(failureStatusKey("The number you dialed is invalid") === "bad_number", "invalid → bad_number");
ok(failureStatusKey("unallocated number") === "bad_number", "unallocated → bad_number");
ok(failureStatusKey("number not in service") === "bad_number", "not in service → bad_number");
ok(failureStatusKey("call rejected by carrier") === "bad_number", "carrier reject → bad_number");
ok(failureStatusKey("store is closed recording") === "closed", "closed recording → closed");
ok(failureStatusKey("end_call tool was called.") === null, "normal agent hang-up → no failure key");
ok(failureStatusKey("Client disconnected: 1005") === null, "ws disconnect → no failure key");
ok(failureStatusKey("") === null && failureStatusKey(null) === null, "empty/null → no failure key");

console.log("▶ bridge lane: Twilio terminal status → registry key (mirror of bridgeCheckCall's map)");
const twilioKey = (s: string) => (({ busy: "busy", failed: "bad_number" } as Record<string, string>)[s] ?? "nobody_answered");
ok(twilioKey("busy") === "busy", "twilio busy → busy");
ok(twilioKey("failed") === "bad_number", "twilio failed (couldn't place) → bad_number");
ok(twilioKey("no-answer") === "nobody_answered", "twilio no-answer → nobody_answered");
ok(twilioKey("completed") === "nobody_answered", "ended with no human → nobody_answered");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

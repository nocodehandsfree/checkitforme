// Unit test for the in-memory telephony-bridge state. Run: ./node_modules/.bin/tsx scripts/test-bridge.ts
import { setBridgeContext, takeBridgeDtmf, takeBridgeNav, bridgeConversationId, bridgeDebug, bridgeLog } from "../src/voice/bridge";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const ctx = (over: Record<string, unknown> = {}) => ({ agentId: "a", dynamicVars: {}, ...over });

console.log("▶ takeBridgeDtmf: consume-once keypad shortcut");
setBridgeContext("room-1", ctx({ dtmf: "0@3,1@9" }));
ok(takeBridgeDtmf("room-1") === "0@3,1@9", "first take returns the dtmf string");
ok(takeBridgeDtmf("room-1") === null, "second take returns null (consumed once, no double-press)");
setBridgeContext("room-2", ctx());
ok(takeBridgeDtmf("room-2") === null, "context without dtmf → null");
ok(takeBridgeDtmf("never-set") === null, "unknown room → null");

console.log("▶ setBridgeContext: rooms are isolated + overwritable");
setBridgeContext("a", ctx({ dtmf: "1@1" }));
setBridgeContext("b", ctx({ dtmf: "2@2" }));
ok(takeBridgeDtmf("a") === "1@1", "room a keeps its own dtmf");
ok(takeBridgeDtmf("b") === "2@2", "room b keeps its own dtmf");
setBridgeContext("a", ctx({ dtmf: "9@9" }));
ok(takeBridgeDtmf("a") === "9@9", "re-setting a room overwrites its context");

console.log("▶ takeBridgeNav / bridgeConversationId: unknown keys");
ok(takeBridgeNav("no-such-conv") === null, "nav time for an unknown conversation → null");
ok(bridgeConversationId("no-such-room") === null, "conversation id for an unknown room → null");

console.log("▶ bridgeDebug / bridgeLog: ring buffer of recent diagnostics");
bridgeLog("hello-bridge");
ok(bridgeDebug().some((l) => l.includes("hello-bridge")), "a logged message shows up in the debug tail");
ok(/^\d\d:\d\d:\d\d\.\d{3} /.test(bridgeDebug().slice(-1)[0]), "log lines carry an HH:MM:SS.mmm timestamp prefix");
for (let i = 0; i < 65; i++) bridgeLog(`evt-${i}`);
const tail = bridgeDebug();
ok(tail.length === 60, "debug tail is capped at the last 60 entries");
ok(tail.some((l) => l.includes("evt-64")) && !tail.some((l) => l.includes("evt-0")), "tail keeps the newest, drops the oldest");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

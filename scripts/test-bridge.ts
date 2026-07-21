// Unit test for the in-memory telephony-bridge state. Run: ./node_modules/.bin/tsx scripts/test-bridge.ts
import { setBridgeContext, takeBridgeDtmf, takeBridgeNav, bridgeConversationId, bridgeDebug, bridgeLog, classifyOpeningLine } from "../src/voice/bridge";

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

console.log("▶ classifyOpeningLine: menu vs human (direct-line split listen from talk)");
// Menus — a live clerk never says these → keep the agent silent.
ok(classifyOpeningLine("For hours, press 1. To speak to someone, press 2.") === "menu", "'for hours press 1' → menu");
ok(classifyOpeningLine("Thank you for calling. Please hold for the next available representative.") === "menu", "'please hold' → menu");
ok(classifyOpeningLine("Your call may be recorded for quality assurance.") === "menu", "IVR boilerplate → menu");
ok(classifyOpeningLine("To reach the pharmacy, press 3.") === "menu", "'to reach the pharmacy press 3' → menu");
ok(classifyOpeningLine("Please leave a message after the tone.") === "menu", "voicemail → menu");
ok(classifyOpeningLine("Gracias por su llamada. Para español, oprima nueve.") === "menu", "Spanish menu → menu");
ok(classifyOpeningLine("Por favor espere, en un momento le atendemos.") === "menu", "Spanish 'please hold' → menu");
// Humans — a person answered → greet. The 'thank you for calling' trap MUST read as human.
ok(classifyOpeningLine("Thanks for calling Box Lunch, this is Bob, how can I help you?") === "human", "'thank you for calling … this is Bob' → human (NOT menu)");
ok(classifyOpeningLine("Hello, Box Lunch?") === "human", "short greeting → human");
ok(classifyOpeningLine("Bob speaking") === "human", "'Bob speaking' → human");
ok(classifyOpeningLine("Hi there, what can I get for you?") === "human", "'what can I get for you' → human");
ok(classifyOpeningLine("Sherman Oaks location, hey!") === "human", "short natural pickup → human");
// Ambiguous — the cap decides (agent still greets within a couple seconds).
ok(classifyOpeningLine("") === "ambiguous", "empty line → ambiguous");
ok(classifyOpeningLine("um yeah give me just a moment while i finish up with a customer here") === "ambiguous", "long, no menu/human marker → ambiguous");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

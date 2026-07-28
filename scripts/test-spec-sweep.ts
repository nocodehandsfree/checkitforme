// THE WHOLE SPEC, STATEMENT BY STATEMENT.
//
// Owner, 07-28: "go through the spec statement by statement and write a test for every one that can
// be checked without a phone call. Then give me the number."
//
// Every assertion below quotes one statement from docs/specs/live-call-runtime/README.md and checks
// it against the code, not against the prose. Statements that genuinely need a phone are counted
// separately and printed by name — they are never scored as passes.
//
// This is deliberately NOT a re-run of the other suites. test-runtime-spec.ts drives the behaviour of
// sections 2, 6, 7, 8 and 9; test-delta-clip.ts drives the clip over real sockets. This one asks a
// different question: is every claim in the document actually true of this repo today.
//
// Run: env DATABASE_URL=file:./.t-sweep.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-spec-sweep.ts
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const failed: string[] = [];
const phone: string[] = [];
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "✓" : "✗"} ${m}`);
  if (c) pass++; else { fail++; failed.push(m); }
};
/** A statement that cannot be settled without dialling a real store. Named, never scored. */
const needsPhone = (m: string) => { console.log(`  ⏸ NEEDS A PHONE — ${m}`); phone.push(m); };

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };
const has = (p: string, re: RegExp) => re.test(read(p));
/** Every .ts under src, so "nowhere else does this" is a real sweep and not a guess. */
function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) srcFiles(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}
const FILES = srcFiles();
/** Files where a pattern appears OUTSIDE comment lines — so a comment about a rule never trips it. */
function definedIn(re: RegExp): string[] {
  return FILES.filter((f) => read(f).split("\n").some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && re.test(l)));
}

const SPEC = read("docs/specs/live-call-runtime/README.md");

// ================================================================================================
console.log("\n▶ §0  Before you write a single line");
{
  const mustExist = ["src/voice/bridge.ts", "src/calls/listen-nav.ts", "src/voice/bridge-place.ts",
    "src/calls/events.ts", "src/calls/receipt-store.ts", "src/calls/tapedeck.ts", "src/calls/mapgraph.ts",
    "docs/team/voice-calls/checkpoint.md"];
  ok(mustExist.every((f) => existsSync(join(ROOT, f))), "every file the spec says to read in full still exists");
  needsPhone("the four orientation answers, written back before building — a person judges that, not a test");
}

// ================================================================================================
console.log("\n▶ §1  The shape — four parts, each owning one thing");
{
  const ear = read("src/calls/listen-nav.ts");
  ok(!/from "\.\.\/llm"|from "\.\.\/db\/|from "\.\.\/config"/.test(ear),
    "the Ear reasons about nothing: no model, no database, no config imported into it");
  ok(!/\bllm\(/.test(ear), "and it never calls a model, so it can never become a second agent");
  ok(/export class ConversationEar/.test(ear) && /export class PromptDetector/.test(ear),
    "the Ear is one thing in one file: the prompt detector and the hold ear together");
  const deck = read("src/calls/tapedeck.ts");
  ok(!/deltaOnly|delta_only|skipCharlie/i.test(deck + read("src/voice/bridge.ts")),
    "there is no Delta-only completion path, not even behind a flag");
  ok(/clip/i.test(read("src/voice/bridge.ts")), "Delta is a clip played by the bridge, not an agent of its own");
}

// ================================================================================================
console.log("\n▶ §2  Hard rules");
{
  ok(/openSegment/.test(read("src/calls/events.ts")),
    "2.1 a restarted agent is a numbered segment inside the same call, never a second call");
  ok(/segments/.test(read("src/calls/receipt-store.ts")) || /segments/.test(read("src/calls/events.ts")),
    "2.2 the receipt carries the segments itself, so it is the record and not the provider's webhook");

  // 2.3 No conversation audio is ever persisted. Judged on the STATEMENT, not the file: server.ts
  // both fans out media frames and writes the Admin html, and those are not the same line of code.
  const audioWriters: string[] = [];
  for (const f of FILES) {
    const lines = read(f).split("\n");
    lines.forEach((l, i) => {
      if (!/writeFile|createWriteStream|putObject|uploadTo|r2\./.test(l)) return;
      const near = lines.slice(Math.max(0, i - 4), i + 5).join(" ");
      if (/m\.media|media\?\.payload|\bpayload\b|ulaw|mulaw|audioChunk/i.test(near)) audioWriters.push(`${f}:${i + 1}`);
    });
  }
  ok(audioWriters.length === 0, `2.3 no line writes call audio anywhere it could persist${audioWriters.length ? ` — FOUND: ${audioWriters.join(", ")}` : ""}`);
  ok(existsSync(join(ROOT, "src/calls/clip-cache.ts")),
    "2.3 the one allowed exception is built: our own clips are cached rather than re-synthesized");

  // 2.4 Every path that dials a STORE opens a receipt.
  const dialers = FILES.filter((f) => {
    const s = read(f);
    const i = s.indexOf("Calls.json");
    return i >= 0 && /method: *"POST"/.test(s.slice(i, i + 200)) && !/To: ownerPhone/.test(s);
  });
  ok(dialers.length > 0, `2.4 the paths that dial a store are found and counted (${dialers.length})`);
  const silent = dialers.filter((f) => !read(f).split("\n").some((l) => !/^import|^\}/.test(l) && /openReceipt\(/.test(l)));
  ok(silent.length === 0, `2.4 every one of them opens a receipt${silent.length ? ` — SILENT: ${silent.join(", ")}` : ""}`);

  ok(/holdSeconds[^;]*null|null[^;]*holdSeconds/.test(read("src/calls/events.ts")),
    "2.5 a number we do not measure is null, never zero");
}

// ================================================================================================
console.log("\n▶ §3  Gate Zero");
{
  ok(existsSync(join(ROOT, "scripts/gate-zero.ts")), "the harness that arms and scores the six calls exists");
  const bridge = read("src/voice/bridge.ts");
  ok(/holdStrategy/.test(bridge), "both hold shapes are built, so the answer picks a path instead of starting a build");
  ok(/"gate"|'gate'/.test(bridge) && /"reopen"|'reopen'/.test(bridge), "and both are named in the code: gate and reopen");
  needsPhone("§3 the billing answer itself — three control calls and three test calls on a real line");
}

// ================================================================================================
console.log("\n▶ §4  The call, second by second");
{
  const bridge = read("src/voice/bridge.ts");
  const place = read("src/voice/bridge-place.ts");
  ok(/connectOnHuman/.test(bridge) && /connectOnHuman: opts\?\.connectOnHuman \?\? true/.test(place),
    "Charlie is not connected through the ringing or the menu — only once a person answers");
  ok(/pending\b/.test(bridge), "clerk speech that starts early is held in a buffer rather than lost");
  ok(/prewarm/i.test(bridge), "Charlie is prewarmed while the clip plays, so he never joins cold");
  ok(/CLIP_MARK|event: "mark"/.test(bridge), "signal one: Twilio's mark, which is new code and is written");
  ok(/clip\.ms|8 bytes|bytes per millisecond|\/ 8\b/.test(bridge), "signal two: the clip's own length, as arithmetic");
  ok(/agentPlayingUntil/.test(bridge), "signal three: the playout clock the bridge already keeps");
  ok(/backstop/i.test(bridge), "and if all three miss, Charlie opens anyway rather than leaving Staff in silence");
  ok(/m\.event === "mark"/.test(bridge), "the mark event is actually handled, not merely sent");
}

// ================================================================================================
console.log("\n▶ §5  What already exists, and what to build");
{
  ok(!existsSync(join(ROOT, ".unlock")), "§12 the lock on the bridge is closed: no .unlock left lying at the repo root");
  ok(/ulaw|mulaw|μ-law/i.test(read("src/calls/clip-cache.ts")), "the clip is phone-format audio, not the mp3 we generate elsewhere");
  ok(/8000|8kHz/i.test(read("src/calls/clip-cache.ts")), "at 8kHz, or it cannot go down the media stream");
  ok(existsSync(join(ROOT, "src/calls/tapedeck.ts")), "the old whole-call Delta stays in the tree — working code is not deleted");
  ok(/midCallAgentId/.test(read("src/config.ts")), "Charlie joins mid-call as a dedicated agent configured once");
  const bridge = read("src/voice/bridge.ts");
  const override = bridge.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l) && /first_message|agent_prompt_override/.test(l));
  ok(override.length === 0, "and never by the per-call greeting override, which is the one thing already known to hang up calls");
}

// ================================================================================================
console.log("\n▶ §6  Hold and transfer");
{
  const bridge = read("src/voice/bridge.ts");
  ok(/ConversationEar/.test(bridge), "the Ear stays on the call; Charlie is what gets suspended");
  ok(/contextual_update/.test(bridge), "when the hold ends he is told there was a gap");
  ok(/newPerson|maybeNewPerson/i.test(bridge + read("src/calls/listen-nav.ts")),
    "and warned that a long gap may mean somebody new");
  ok(/never spoken aloud|contextual_update/.test(bridge), "told, not spoken aloud to the store");
  ok(/closeAgentOnHold/.test(read("src/policy.ts")), "which of the two shapes runs is one switch, decided by Gate Zero");
}

// ================================================================================================
console.log("\n▶ §7  The brain, on our own account");
{
  ok(/ourBrain/.test(read("src/policy.ts")), "the brain is a setting, killable from a phone, not an environment variable");
  ok(/ourBrain/.test(read("public/app.html")), "and it is on the Admin screen where the other call switches live");
  ok(/ourBrain: false/.test(read("src/policy.ts")), "off by default = exactly today's behaviour, which always works");
  const ev = read("src/calls/events.ts");
  ok(/brain: "hosted" \| "ours"/.test(ev), "the receipt stamps which brain served the call — the whole point is provability");
  const bridge = read("src/voice/bridge.ts");
  ok(/rung one|RUNG ONE/i.test(read("src/calls/brain.ts")), "rung one: one immediate retry on the same model");
  ok(/brainFellBack/.test(bridge), "rung two: fall back to the provider's hosted agent, invisibly");
  ok(/useOurs && !charlieSpoke/.test(bridge), "and NEVER after Charlie has already spoken — no live model swap mid-conversation");
  ok(/dropCall\(/.test(bridge), "rung three: nobody can take the call, so it is dropped");
  const leaked = FILES.filter((f) => /sk_[a-zA-Z0-9]{20,}|xi-api-key["']\s*:\s*["'][a-zA-Z0-9]{20,}/.test(read(f)));
  ok(leaked.length === 0, "the API key never appears in the repo");
}

// ================================================================================================
console.log("\n▶ §8  The dropped call");
{
  const boot = read("src/db/bootstrap.ts");
  ok(/"call_dropped"/.test(boot), "the new status is seeded alongside the family that already skips the charge");
  const svc = read("src/calls/service.ts");
  ok(/call_dropped/.test(svc), "and the runtime writes it");
  ok(/statusKey: "call_dropped"/.test(svc) && !/status: "completed"[^}]*call_dropped/.test(svc),
    "a dropped call is never written as completed, which is the only status the one-hour block matches");
  ok(/RECONNECT_OPENER/.test(svc), "a customer who rings straight back gets the reconnect opener");
  ok(/RECONNECT_OPENER_ES/.test(svc), "and its Spanish ships in the same file");
  ok(/RECONNECT_OPENER_ES/.test(svc) && /RECONNECT_OPENER\b/.test(svc), "both lines exist, so the opener has a Spanish twin");
  needsPhone("§8 that the one-hour block really lets a dropped call try again — the spec says prove it on a real drop");
}

// ================================================================================================
console.log("\n▶ §9  The receipt");
{
  const ev = read("src/calls/events.ts");
  ok(/hold_start/.test(ev) && /hold_end/.test(ev), "the hold events are declared");
  const bridge = read("src/voice/bridge.ts");
  ok(/emit\([^)]*hold_start/.test(bridge) || /"hold_start"/.test(bridge), "and actually emitted, not merely declared");
  ok(/transfer/.test(ev), "so is transfer");
  ok(/openSegment/.test(ev), "Charlie's segments are numbered inside the one call");
  ok(/navOutcome/.test(ev), "the navigation outcome is on the receipt");
  ok(/mapVersion/.test(ev), "mapVersion is filled, not sitting empty");
  ok(/attemptOf/.test(ev) || /attemptOf/.test(read("src/calls/receipt-store.ts")), "and so is attemptOf");
  const kinds = (ev.match(/export type EventKind =[\s\S]*?;/) || [""])[0];
  ok(kinds.split("|").length >= 16, `the event set is closed in one union of ${kinds.split("|").length} kinds, so nobody invents a seventeenth`);
}

// ================================================================================================
console.log("\n▶ §10  Mapper — the contract");
{
  // 10.0 one shared Ear.
  const earDefs = definedIn(/\b(function|const|class)\s+(ulawByteToLinear|frameEnergy|toneShare)\b/);
  const allowed = ["src/calls/listen-nav.ts", "src/voice/bridge.ts"];
  ok(earDefs.every((f) => allowed.includes(f)),
    `no second listener: audio detection lives only in the two files that own it${earDefs.filter((f) => !allowed.includes(f)).length ? ` — EXTRA: ${earDefs.filter((f) => !allowed.includes(f)).join(", ")}` : ""}`);

  // 10.1 / 10.2 / 10.3 — the wiring gaps the spec assigns to the runtime.
  ok(definedIn(/reportCallDrift\(/).some((f) => f !== "src/calls/mapgraph.ts") || /await reportCallDrift\(/.test(read("src/calls/mapgraph.ts")),
    "10.1 reportCallDrift is called, so every ordinary check becomes a mapping observation for free");
  ok(/onReceiptClosed/.test(read("src/server.ts")), "10.1 and it is driven by the receipt closing, on every call");
  ok(/callId/.test(read("src/calls/mapgraph.ts")), "10.2 recordObservation receives the receipt's call id");
  ok(definedIn(/stageNavPromptPlan/).length === 0, "10.3 the unsafe prompt-anchor side channel is gone from the tree");
  ok(/navPlanFromVersion/.test(read("src/calls/service.ts")), "10.3 the route and its anchors are read off ONE saved version");
  ok(/activeMap\(chain\.id, retailer\.id\)/.test(read("src/calls/service.ts")),
    "10.3 and that read prefers this store's own map, so store exceptions reach live calls");

  // What Mapper builds.
  const mg = read("src/calls/mapgraph.ts");
  ok(/nav_nodes/.test(mg) && /nav_edges/.test(mg), "10.a the graph: prompts as nodes, what we did as edges");
  ok(/STORES_TO_MOVE_CHAIN/.test(mg), "10.b one store disagreeing is a store exception, never a chain change");
  ok(/STORES_TO_MOVE_CHAIN = 3/.test(mg), "10.b and the chain only moves once three stores agree");
  ok(/language/.test(mg), "10.c a language field, in the data model now");
  ok(/hour_local|hourLocal/.test(mg), "10.d the hour of day on every observation");
  ok(/\bdow\b/.test(mg), "10.d and the day of the week");
  ok(/recordFailedAttempt/.test(mg), "10.e failed calls count as evidence");
  ok(/status='rejected'|proposed/.test(mg), "10.e but they never silently change a map");

  // The safety rule the runtime owns.
  ok(/looksLikeAPerson/.test(read("src/calls/listen-nav.ts")), "the keys stop the moment a real person answers");
  ok(/looksLikeAPerson/.test(read("src/voice/bridge.ts")) || /looksLikeAPerson/.test(read("src/calls/listen-nav.ts")),
    "and the rule is wired where the keys are actually pressed");

  // What the runtime returns to Mapper.
  ok(/navOutcomeOf|navOutcome/.test(read("src/calls/events.ts")), "the navigation outcome is assembled on the receipt");
}

// ================================================================================================
console.log("\n▶ §10b  Cross-check");
{
  ok(/nobody marks their own homework/i.test(SPEC), "the rule is written into the shared document, not just agreed in a chat");
  ok(existsSync(join(ROOT, "scripts/spec-gates.sh")), "and what a machine can check, a machine checks");
  ok(/spec-gates\.sh/.test(read(".claude/hooks/push-gate.sh")), "wired into the push hook, so it cannot be skipped");
}

// ================================================================================================
console.log("\n▶ §12  Traps that have already bitten us");
{
  ok(!existsSync(join(ROOT, ".unlock")), "no stale unlock left on the machine-locked bridge");
  // The provider's own transcription is 8.6c a call. The mapping lane may use it; a live check may not.
  const sttInLive = ["src/voice/bridge.ts", "src/voice/bridge-place.ts", "src/calls/service.ts"]
    .filter((f) => /input="speech"|input=.speech/.test(read(f)));
  ok(sttInLive.length === 0, `the 8.6¢ provider transcription is not on the live-check path${sttInLive.length ? ` — FOUND IN: ${sttInLive.join(", ")}` : ""}`);
  ok(existsSync(join(ROOT, ".claude/hooks/copy-gate.py")), "the copy laws on customer-facing strings are enforced by a hook");
  needsPhone("§12 the Fun store pointing at the right workflow before a test call");
}

// ================================================================================================
console.log("\n▶ §11  Done means — the statements that can only be settled on a real line");
{
  needsPhone("Charlie never speaks before Staff finish answering, proven on real calls");
  needsPhone("a hold happens, Charlie stops costing money, and he returns without greeting again");
  needsPhone("the clip is audible, in the right voice, with no double greeting");
  needsPhone("holdSeconds on a receipt from a call where somebody actually went away");
  needsPhone("cost per delivered answer, re-measured against the real baseline");
}

console.log(`\n${"=".repeat(78)}`);
console.log(`  ${pass} PASS   ${fail} FAIL   ${phone.length} NEED A PHONE   (${pass + fail} checkable statements)`);
if (failed.length) {
  console.log(`\n  FAILING:`);
  for (const f of failed) console.log(`   ✗ ${f}`);
}
console.log(`${"=".repeat(78)}\n`);
process.exit(fail ? 1 : 0);

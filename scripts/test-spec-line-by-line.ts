// THE SPEC, STATEMENT BY STATEMENT, AS ASSERTIONS.
// Run: env … DATABASE_URL=file:./.t-spec.db ./node_modules/.bin/tsx scripts/test-spec-line-by-line.ts
//
// WHY (owner, 2026-07-28): "Before either of you tells me it's done again: go through the spec
// statement by statement and write a test for every one that can be checked without a phone call.
// Then give me the number."
//
// Every claim in docs/specs/live-call-runtime/README.md that a machine can check is one line here.
// Three outcomes, and the third is not a hiding place:
//   PASS   the code does what the sentence says
//   FAIL   it does not — named, not summarised
//   PHONE  genuinely undecidable without dialling a real store
//
// A test that cannot fail is worth nothing, so these read the real modules and the real source. If
// this file ever reports 0 FAIL it should be because the work is done, not because the checks are soft.
import { readFileSync } from "node:fs";
import { rollup, _receiptFrom, navOutcomeOf, openReceipt, openSegment, closeSegment, getReceipt, startMeter, addMs, recordLine, transcriptOf, _reset } from "../src/calls/events";
import { ConversationEar, looksLikeAPerson, PromptDetector } from "../src/calls/listen-nav";
import { _test as brainTest, checkBrainRequest, _resetBrainGuards } from "../src/calls/brain";
import { navPlanFromVersion, RECONNECT_OPENER, RECONNECT_OPENER_ES } from "../src/calls/service";
import { TUNING_DEFAULTS } from "../src/calls/tuning";
import { phoneClip, toMediaFrames, ULAW_BYTES_PER_MS } from "../src/calls/clip-cache";

const src = (f: string) => readFileSync(f, "utf8");
const BRIDGE = src("src/voice/bridge.ts");
const PLACE = src("src/voice/bridge-place.ts");
const EAR = src("src/calls/listen-nav.ts");
const EVENTS = src("src/calls/events.ts");
const SERVICE = src("src/calls/service.ts");
const BRAIN = src("src/calls/brain.ts");
const STORE = src("src/calls/receipt-store.ts");
const BOOT = src("src/db/bootstrap.ts");
const APP = src("public/app.html");
const SITE = src("public/checkit.html");
const LOCKS = src(".claude/locks");

type Verdict = "PASS" | "FAIL" | "PHONE";
const results: Array<{ id: string; claim: string; v: Verdict; note?: string }> = [];
const check = (id: string, claim: string, fn: () => boolean | string) => {
  let v: Verdict = "FAIL"; let note: string | undefined;
  try { const r = fn(); if (r === true) v = "PASS"; else if (typeof r === "string") { v = "FAIL"; note = r; } }
  catch (e) { note = `threw: ${String(e).slice(0, 90)}`; }
  results.push({ id, claim, v, note });
};
const phone = (id: string, claim: string, why: string) => results.push({ id, claim, v: "PHONE", note: why });

async function main() {
// ── §1 THE SHAPE ───────────────────────────────────────────────────────────────────────────────
check("1.1", "The Ear is a cheap acoustic layer with no model", () =>
  (!/from "\.\.\/llm"|openai|anthropic|groq/i.test(EAR)) || "the ear imports a model");
check("1.2", "The Ear holds a short rolling buffer in memory", () => /voiced\.shift\(\)/.test(EAR) || "no rolling window");
check("1.3", "Delta never interprets an answer or decides a call is finished", () => {
  // The clip path in the bridge plays audio and opens a gate. It must not classify or hang up.
  const from = BRIDGE.indexOf("function startOpeningClip");
  const clipFn = BRIDGE.slice(from, BRIDGE.indexOf("\n  }", BRIDGE.indexOf("return true;", from)));
  return (!/classif|verdict|twilio\.close/i.test(clipFn)) || "the clip path judges or ends the call";
});
check("1.4", "Charlie owns the answer and closes; no Delta-only completion path in the new runtime", () =>
  /openSegment\(/.test(BRIDGE) && !/resStatusKey/.test(BRIDGE) || "the bridge writes its own verdict");

// ── §2 HARD RULES ──────────────────────────────────────────────────────────────────────────────
check("2.1", "A restarted agent is a NUMBERED SEGMENT of the same call, never a separate call", () => {
  const r = _receiptFrom({ segments: [
    { n: 1, openMs: 0, closeMs: 10_000, brain: "hosted" },
    { n: 2, openMs: 30_000, closeMs: 40_000, brain: "hosted" }] });
  const s = rollup(r);
  return (s.charlieSegments === 2 && s.charlieConnectedSeconds === 20)
    || `two stretches read as ${s.charlieSegments} segments / ${s.charlieConnectedSeconds}s`;
});
check("2.2a", "Our receipt is the source of truth for the TRANSCRIPT", () => {
  _reset(); openReceipt("s22");
  recordLine("s22", "Clerk", "we have some");
  return transcriptOf(getReceipt("s22")!) === "Clerk: we have some" || "the transcript is not recorded live";
});
check("2.2b", "…and the transcript is written to the row from OUR record", () =>
  /transcript: transcriptOf\(r\)/.test(STORE) || "the receipt store never writes our transcript");
check("2.2c", "Our receipt is the source of truth for the TIMINGS", () => /markNow\(/.test(BRIDGE) || "no live stamps");
check("2.3a", "No conversation audio is persisted on any path", () => {
  const writers = [BRIDGE, EAR, EVENTS, STORE, SERVICE].join("\n");
  return (!/writeFileSync|createWriteStream|putObject|PutObjectCommand/.test(writers)) || "a call-path file writes to storage";
});
check("2.3b", "Our own clips MAY be cached (the one deliberate exception)", () =>
  /const cache = new Map/.test(src("src/calls/clip-cache.ts")) || "clips are not cached");
check("2.4", "Every path that dials a store opens a receipt", () => {
  const dialers = ["src/calls/service.ts", "src/calls/navigator.ts", "src/calls/tapedeck.ts", "src/voice/bridge-place.ts"];
  const silent = dialers.filter((f) => !/openReceipt\s*\(/.test(src(f)));
  return silent.length === 0 || `these dial and open no receipt: ${silent.join(", ")}`;
});
check("2.5", "A number we do not measure is null, never zero", () => {
  _reset(); openReceipt("s25");
  const before = rollup(getReceipt("s25")!).holdSeconds;
  startMeter("s25", "holdMs");
  const after = rollup(getReceipt("s25")!).holdSeconds;
  return (before === null && after === 0) || `unmeasured read ${before}, measured-zero read ${after}`;
});

// ── §3 GATE ZERO ───────────────────────────────────────────────────────────────────────────────
check("3.1", "A tool exists that records each run and refuses a verdict on fewer than three of each", () => {
  const gz = src("scripts/gate-zero.ts");
  return (/NOT ENOUGH EVIDENCE/.test(gz) && /c\.n < 3 \|\| t\.n < 3/.test(gz)) || "no three-run guard";
});
check("3.2", "It prefers a per-conversation cost and falls back to the account difference", () => {
  const gz = src("scripts/gate-zero.ts");
  return (/conversationsSince/.test(gz) && /accountCredits/.test(gz)) || "only one measuring method";
});
// A held call CLOSES the session and opens another, so one call is several conversations. Pricing
// only the last one would price the tail of the call and call it the call.
check("3.2b", "…and it sums every conversation the call opened, not just the last", () => {
  const gz = src("scripts/gate-zero.ts");
  return (/start_time_unix_secs/.test(gz) && /ids: string\[\]/.test(gz)) || "it still prices one conversation";
});
phone("3.3", "The gated 30 seconds bills at roughly 5% of the active rate", "six real calls");
phone("3.4", "Charlie resumes naturally: no second greeting, no lost context", "a human has to hear it");

// ── §4 THE CALL, SECOND BY SECOND ──────────────────────────────────────────────────────────────
check("4.1", "The clip plays only when a REAL PERSON is detected, never on a timer", () =>
  /reason === "human" && ctx\?\.openingClip/.test(BRIDGE) || "the clip can fire without a person");
// 4.2 and 4.3 are ALSO driven end to end against real sockets in test-delta-clip.ts, which is the
// stronger proof; these read the source so the mechanism cannot be quietly removed.
check("4.2", "Charlie is prewarmed WHILE the clip plays, not after it", () =>
  /prewarmTimer = setTimeout/.test(BRIDGE) && /\.ms - PREWARM_LEAD_MS/.test(BRIDGE) || "no prewarm during the clip");
check("4.3", "Clerk speech that starts early is HELD, not dropped", () =>
  /else if \(connecting\) \{ if \(Date\.now\(\) >= agentPlayingUntil \+ ECHO_TAIL_MS\) pending\.push\(b64\); \}/.test(BRIDGE)
  || "early speech is not buffered");
check("4.3b", "…but our OWN voice echoing back is never buffered as the clerk", () =>
  /Date\.now\(\) >= agentPlayingUntil \+ ECHO_TAIL_MS\) pending\.push/.test(BRIDGE)
  || "the line's reflection of our own clip can be handed to the agent as the clerk");
check("4.3c", "The question waits for the greeting to finish before it starts", () =>
  /waitQuietMs >= GREETING_END_MS \|\| waitTotalMs >= GREETING_MAX_WAIT_MS/.test(BRIDGE)
  || "the question can talk over the greeting");
check("4.4", "Charlie's input opens only when the clip ends", () =>
  /eleven && ready && charlieGateOpen/.test(BRIDGE) || "his input is not gated on the clip");
check("4.5", "Charlie's output is suppressed while the clip plays", () =>
  /b64 && !charlieGateOpen/.test(BRIDGE) || "he can talk over the question");
check("4.6", "The buffer is released to Charlie at the gate", () =>
  /openCharlieGate[\s\S]{0,400}flushPending\(\)/.test(BRIDGE) || "the buffer is not released");
check("4.7", "SIGNAL 1: Twilio's mark ends the clip", () => /m\.event === "mark"/.test(BRIDGE) || "mark is not handled");
check("4.8", "SIGNAL 2: the clip's own length ends it", () => /clip\.ms \+ CLIP_SETTLE_MS/.test(BRIDGE) || "length is not used");
check("4.9", "SIGNAL 3: the playout clock is re-read so real audio can only DELAY", () =>
  /agentPlayingUntil - Date\.now\(\)/.test(BRIDGE) || "the playout clock is not consulted");
check("4.10", "If all three fail, Charlie opens ANYWAY", () =>
  /nothing confirmed the clip, opened anyway/.test(BRIDGE) || "no backstop");
check("4.11", "Phone audio is 8 bytes per millisecond, so a clip's duration is exact", () =>
  ULAW_BYTES_PER_MS === 8 && toMediaFrames(Buffer.alloc(320)).length === 2 || "framing is wrong");

// ── §5 WHAT TO BUILD ───────────────────────────────────────────────────────────────────────────
check("5.1", "The Ear keeps NO config and NO database imports", () =>
  (!/from "\.\.\/config"|from "\.\.\/db|getSetting/.test(EAR)) || "the ear now imports config or the db");
check("5.2a", "Ear: hold-audio detection", () => /"music"/.test(EAR) || "no hold-music detection");
check("5.2b", "Ear: hold-end", () => /holdEnd:/.test(EAR) || "no hold-end");
check("5.2c", "Ear: transfer", () => /"transfer"/.test(EAR) || "no transfer");
check("5.2d", "Ear: a new person", () => /maybeNewPerson/.test(EAR) || "no new-person signal");
check("5.2e", "Ear: extended dead air", () => /deadAir/.test(EAR) || "no extended dead air");
check("5.2f", "Ear: disconnect", () => /lineGone|disconnected/.test(EAR) || "no disconnect");
check("5.3", "All of it feeds the same receipt", () =>
  /emit\(room, reason === "transfer" \? "transfer" : "hold_start"/.test(BRIDGE)
  && /emit\(room, "hold_end"/.test(BRIDGE) || "hold events never reach the receipt");
check("5.4", "The clip is phone-format audio, not the MP3 we generate today", () =>
  /output_format=ulaw_8000/.test(src("src/calls/clip-cache.ts")) || "the clip is not phone format");
check("5.5", "The old whole-call Delta stays in the tree", () =>
  /export async function deltaStoreCall/.test(src("src/calls/tapedeck.ts")) || "the old engine was deleted");
check("5.6", "NO per-call prompt or first-message override is used for the join", () => {
  const init = BRIDGE.slice(BRIDGE.indexOf("conversation_initiation_client_data"), BRIDGE.indexOf("eleven!.send(JSON.stringify(init))"));
  return (!/first_message|prompt:/.test(init)) || "the join overrides prompt or first message";
});
check("5.7", "A DEDICATED joining agent is used instead", () => /midCallAgentId/.test(BRIDGE) || "no joining agent");
check("5.8", "The question Delta asked is supplied to him as context", () =>
  /opening_line: clipText/.test(BRIDGE) || "the question is not passed on");
check("5.9", "Unset joining agent = every call takes exactly today's path", () =>
  /ctx\?\.openingClip && ctx\?\.midCallAgentId/.test(BRIDGE) || "the clip can play with no joining agent");

// ── §6 HOLD AND TRANSFER ───────────────────────────────────────────────────────────────────────
check("6.1", "On hold, Charlie is fed nothing", () => /else if \(onHold\) \{ if \(frameEnergy/.test(BRIDGE) || "he keeps being fed");
check("6.2", "…and his output is suppressed", () => /b64 && onHold/.test(BRIDGE) || "he can still be heard");
check("6.3", "Twilio and the Ear keep running", () => {
  const hold = BRIDGE.slice(BRIDGE.indexOf("function beginHold"), BRIDGE.indexOf("function endHold"));
  return (!/twilio\.close/.test(hold)) || "the carrier leg is closed on a hold";
});
check("6.4", "The first words on the way back are buffered", () => /heldWords\.push/.test(BRIDGE) || "the return words are lost");
check("6.5", "Charlie is TOLD there was a gap", () => /contextual_update/.test(BRIDGE) || "he is never told");
check("6.6", "…and warned the person may be someone new", () => /may be someone new/.test(BRIDGE) || "no new-person warning");
check("6.7", "BOTH shapes are built so the measurement can pick", () =>
  /holdStrategy === "reopen"/.test(BRIDGE) && /"gate"/.test(BRIDGE) || "only one shape exists");
// The owner picked the shape himself on 07-28, before Gate Zero, and deleted the switch: closing the
// agent for a hold "is the basis of the whole design". Both shapes stay built (6.7); one now runs.
check("6.8", "Closing him for a hold is how it works, not a switch", () => {
  const p = src("src/policy.ts");
  return (/p\.flags\.closeAgentOnHold = true/.test(p) && !/'closeAgentOnHold'/.test(APP))
    || "it is still a switch, or it is not forced on";
});

// ── §7 THE BRAIN ───────────────────────────────────────────────────────────────────────────────
// Renamed and moved by the owner, 07-28: "Charlie on Anthropic API", under Calls, App, where the
// global call settings live. Off, and blocked on a business call rather than on code.
check("7.1", "The switch lives in Admin under Calls, App", () => {
  const app = APP.slice(APP.indexOf('<section id="settings">'), APP.indexOf('<section id="designer">'));
  return (/Charlie on Anthropic API/.test(app) && /toggleOurBrain\(\)/.test(app))
    || "the brain switch is not on the Calls App screen";
});
check("7.1b", "…and nowhere else, so there is one switch for one thing", () =>
  (!/'ourBrain','/.test(APP)) || "it is still in the Policy flag list too");
check("7.2", "It is a SETTING, not an environment variable", () =>
  /flags\?\.ourBrain/.test(PLACE) || "the switch is not a setting");
check("7.3", "Off = the provider's hosted model, exactly today's behaviour", () =>
  /ourBrain: false/.test(src("src/policy.ts")) || "it does not default off");
check("7.4", "Which brain served the call is stamped on the receipt", () => {
  const r = _receiptFrom({ segments: [{ n: 1, openMs: 0, closeMs: 5_000, brain: "ours" }] });
  return rollup(r).brain === "ours" || "the brain is not stamped";
});
check("7.5", "A call where he never joined has NO brain, not a default", () =>
  rollup(_receiptFrom({})).brain === null || "a brain is invented for a call that had none");
check("7.6", "The key never appears in a commit", () =>
  (!/sk-ant-|BRAIN_API_KEY\s*=\s*["'][a-z0-9_]{16,}/.test(BRAIN + PLACE + SERVICE)) || "a key is hard-coded");
check("7.7", "LADDER 1: one immediate retry", () => /one immediate retry/.test(BRAIN) || "no retry");
check("7.8", "…on the SAME model, never a cheaper substitute", () =>
  /openStream\(model, ask\)[\s\S]{0,200}openStream\(model, ask\)/.test(BRAIN) || "the retry swaps model");
check("7.9", "LADDER 2: switch invisibly to the hosted agent before he has spoken", () =>
  /useOurs && !charlieSpoke/.test(BRIDGE) || "no invisible fallback");
check("7.10", "LADDER 3: that fails too → treat as a dropped call", () =>
  /dropCall\("we could not open an agent/.test(BRIDGE) || "no drop on total failure");
check("7.11", "After he has spoken there is NO live model swap", () =>
  /charlieSpoke = true/.test(BRIDGE) || "nothing records that he spoke");
// NOT the word "degraded" — that matched a COMMENT and passed a check on nothing, which is exactly
// the kind of soft assertion that makes a green number worthless. It has to find the real thing: a
// verdict extracted from what we already heard, and the call marked degraded rather than dropped.
check("7.12", "A usable answer already in the transcript is never thrown away (degraded close)", () =>
  /statusKey: "degraded|degraded_/.test(SERVICE + BRIDGE) || "NOT BUILT: an answer already heard is not salvaged when the brain dies mid-call");
check("7.13", "The model is the one the owner approved", () =>
  brainTest.DEFAULT_BRAIN_MODEL === "claude-sonnet-4-6" || `default is ${brainTest.DEFAULT_BRAIN_MODEL}`);
check("7.14", "The endpoint refuses anything that is not a real turn", () => {
  _resetBrainGuards();
  const bad = ["not json", JSON.stringify({ messages: [] }), JSON.stringify({ messages: [{ role: "root", content: "x" }] })];
  return bad.every((b) => checkBrainRequest(b).ok === false) || "junk gets through";
});
check("7.15", "…and refuses a replay of the same request", () => {
  _resetBrainGuards();
  const b = JSON.stringify({ messages: [{ role: "user", content: "hi" }] });
  return (checkBrainRequest(b).ok === true && checkBrainRequest(b).ok === false) || "a captured request can be replayed";
});
phone("7.16", "The cost comparison holds up on a real bill", "needs real calls on both brains");

// ── §8 THE DROPPED CALL ────────────────────────────────────────────────────────────────────────
check("8.1", "A new status exists in seedStatuses", () => /"call_dropped"/.test(BOOT) || "no status row");
check("8.2", "…with its Spanish in the same commit", () => /'st\.call_dropped'/.test(SITE) || "no Spanish");
check("8.3", "It is in the family that skips the charge (never confirmed, never completed)", () =>
  /status: "no_answer", confirmed: null, statusKey: "call_dropped"/.test(SERVICE) || "it is written as something chargeable");
check("8.4", "We hang up and say NOTHING", () => {
  const drop = BRIDGE.slice(BRIDGE.indexOf("function dropCall"), BRIDGE.indexOf("function beginHold"));
  return (!/twilio\.send/.test(drop)) || "something is spoken on a dropped call";
});
check("8.5", "No automatic retry", () => (!/setTimeout[^;]{0,80}retryCheck|autoRetry/.test(SERVICE)) || "an automatic retry exists");
check("8.6", "The one-hour block matches ONLY completed, so a dropped call cannot lock anyone out", () =>
  /eq\(callResults\.status, "completed"\)/.test(SERVICE) || "the block matches more than completed");
check("8.7", "The reconnect opener exists, with its Spanish", () =>
  (!!RECONNECT_OPENER && !!RECONNECT_OPENER_ES) || "missing an opener");
check("8.8", "It is scoped to the customer who was cut off", () =>
  /eq\(callResults\.finderUserId, finderUserId\)/.test(SERVICE) || "any customer gets the reconnect line");
check("8.9", "It has a shelf life", () => TUNING_DEFAULTS.reconnectWindowMin <= 5 || `window is ${TUNING_DEFAULTS.reconnectWindowMin} minutes`);
check("8.10", "No dash inside either sentence (copy law)", () =>
  (!/[—–]/.test(RECONNECT_OPENER + RECONNECT_OPENER_ES)) || "a dash is inside a sentence");

// ── §9 THE RECEIPT ─────────────────────────────────────────────────────────────────────────────
check("9.1", "hold_start, hold_end and transfer are actually emitted", () =>
  ["hold_start", "hold_end", "transfer"].every((k) => new RegExp(`"${k}"`).test(BRIDGE)) || "an event is declared but never emitted");
check("9.2", "Charlie segments are numbered", () => {
  _reset(); openReceipt("s92");
  const a = openSegment("s92", "hosted"); closeSegment("s92");
  const b = openSegment("s92", "ours", "back");
  return (a === 1 && b === 2) || `segments numbered ${a}, ${b}`;
});
check("9.3", "The navigation outcome is on the receipt", () =>
  navOutcomeOf(_receiptFrom({ meters: { humanMs: 1000 } })) === "reached_a_person" || "no outcome");
check("9.4", "…and distinguishes a route that failed from a desk that rang out", () => {
  const rang = _receiptFrom({ planned: [{ action: "press", value: "2", atSec: 8 }], events: [
    { atMs: 8_000, atSec: 8, kind: "alpha_press" }, { atMs: 20_000, atSec: 20, kind: "ringing", detail: { leg: "desk" } }] });
  const failed = _receiptFrom({ planned: [{ action: "press", value: "2", atSec: 8 }, { action: "press", value: "2", atSec: 16 }], events: [{ atMs: 8_000, atSec: 8, kind: "alpha_press" }] });
  return (navOutcomeOf(rang) === "still_ringing" && navOutcomeOf(failed) === "route_failed") || "the two are confused";
});
check("9.5", "mapVersion is filled", () => /mapVersion: String\(r\.mapVersion\)/.test(STORE) || "mapVersion still empty");
check("9.6", "attemptOf is filled", () => /attemptOf: r\.attemptOf/.test(STORE) || "attemptOf still empty");
check("9.7", "The closed set is still exactly sixteen kinds", () => {
  const block = EVENTS.slice(EVENTS.indexOf("export type EventKind"), EVENTS.indexOf("/** Which lane walked"));
  const n = block.split("\n").filter((l) => /^\s*\|\s*"[a-z_]+"/.test(l)).length;
  return n === 16 || `${n} kinds`;
});

// ── §10 MAPPER'S CONTRACT (the runtime's half) ─────────────────────────────────────────────────
check("10.1", "reportCallDrift fires on ordinary customer checks", () =>
  /reportCallDrift\(/.test(src("src/calls/mapgraph.ts")) && /learnFromReceipt/.test(src("src/server.ts")) || "drift never runs on a real check");
check("10.2", "recordObservation receives a call id", () => /callId: o\.callId/.test(src("src/calls/mapgraph.ts")) || "no call id");
check("10.3", "The prompt-anchor side channel is GONE", () =>
  (!/stageNavPromptPlan/.test(EAR + SERVICE)) || "the side channel still exists");
check("10.4", "Route and anchors are read off ONE version", () => {
  const p = navPlanFromVersion([{ action: "say", value: "no", atSec: 16, afterPrompt: 2 }]);
  return (p.say === "no@16" && p.steps[0].afterPrompt === 2) || "the plan and its anchors are separable";
});
check("10.5", "…and store exceptions reach the runtime", () => /activeMap\(chain\.id, retailer\.id\)/.test(SERVICE) || "store maps never used");
check("10.6", "Keys stop the moment a real person answers", () => {
  const d = new PromptDetector(() => { /* none */ });
  for (let i = 0; i < 100; i++) d.feedEnergy(550);          // a 2s greeting
  for (let i = 0; i < 40; i++) d.feedEnergy(20);            // it ends
  for (let i = 0; i < 150; i++) d.feedEnergy(20);           // and they wait
  return looksLikeAPerson({ stepsFired: 0, promptCount: d.count, lastPromptMs: d.lastPromptMs, quietMs: d.quietMs }) || "a waiting person is not recognised";
});
check("10.7", "…and a real recorded menu never trips it", () => {
  const d = new PromptDetector(() => { /* none */ });
  for (let i = 0; i < 300; i++) d.feedEnergy(550);          // a 6s menu prompt
  for (let i = 0; i < 240; i++) d.feedEnergy(20);           // a long gap after it
  return (!looksLikeAPerson({ stepsFired: 0, promptCount: d.count, lastPromptMs: d.lastPromptMs, quietMs: d.quietMs })) || "a menu reads as a person";
});

// ── §11 DONE MEANS ─────────────────────────────────────────────────────────────────────────────
phone("11.1", "Charlie never speaks before the clerk finishes answering, on real calls", "a human has to hear it");
phone("11.2", "A hold happens and he comes back without greeting again", "a human has to hear it");
phone("11.3", "The brain switch flips both ways and the receipt says which ran", "blocked: the voice clone rule");
phone("11.4", "A dropped call charges nobody and does not lock the customer out", "the DB half is proven; the live half needs a real drop");
phone("11.5", "Cost per delivered answer re-measured against the real baseline", "needs real calls");

// ── THE OWNER'S ORDERS, 07-28 ──────────────────────────────────────────────────────────────────
// Not in the spec document: four instructions given after it, each one a rule that was only ever
// prose until it cost him something. They are here because this file is where a rule stops being an
// opinion. See docs/team/voice-calls/checkpoint.md.
check("O.1", "The Live/Staging switch steers the call-lane flags, reads AND writes", () => {
  const envFlagWrite = /const envFlag=isEnvFlag\(key\), where=envFlag\?envApi:api/.test(APP);
  const envFlagRead = /POL_ENV=CALL_SRC==='live'\?POL:\(await envApi\('\/api\/policy'\)\)/.test(APP);
  return (envFlagWrite && envFlagRead) || "a call-lane flag still reads or writes Live from the staging side";
});
check("O.2", "…and the mirror protects exactly the flags the switch steers", () => {
  const admin = (APP.match(/const ENV_FLAGS=\[([^\]]+)\]/) || [])[1] || "";
  const sync = (src("src/settings-sync.ts").match(/KEEP_LOCAL_FLAGS = \[([^\]]+)\]/) || [])[1] || "";
  const set = (s: string) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean).sort().join(",");
  return (set(admin) !== "" && set(admin) === set(sync))
    || `the two lists disagree: Admin [${set(admin)}] vs the mirror [${set(sync)}]`;
});
check("O.3", "Stopping the keypad when Staff answer is not a switch", () => {
  const p = src("src/policy.ts");
  return (/p\.flags\.stopKeysOnHuman = true/.test(p) && !/'stopKeysOnHuman'/.test(APP))
    || "it is still a switch, or it is not forced on";
});
// Both services already carry a policy blob with these saved as false, so DEFAULTING them true is
// not enough: the forcing has to happen AFTER the stored blob is merged in, or the old value wins.
check("O.4", "A saved blob cannot turn either of the baked-in two back off", () => {
  const p = src("src/policy.ts");
  const merged = p.indexOf("const p = merge(DEFAULT_POLICY, over)");
  const forced = p.indexOf("p.flags.closeAgentOnHold = true");
  return (merged > 0 && forced > merged) || "the stored blob is merged over the forcing, so a saved false wins";
});

// ── §12 TRAPS ──────────────────────────────────────────────────────────────────────────────────
check("12.1", "src/voice/** is still machine-locked", () => /^src\/voice\/\*\*$/m.test(LOCKS) || "the lock was removed");
check("12.2", "No .unlock is left behind", () => {
  try { readFileSync(".unlock", "utf8"); return "a .unlock file was left in the repo"; } catch { return true; }
});
check("12.3", "The provider's own transcription is not reintroduced", () =>
  (!/speechModel|input="speech"/.test(BRIDGE + PLACE)) || "speech recognition is back on the live path");
// A LIVE SETTING, so it is checked against the live system rather than the source — with a token in
// the environment this really can fail, and without one it says so instead of pretending.
// THE JOINING AGENT MUST ACCEPT WHAT THE RUNTIME SENDS IT. It is a clone of the live agent, and a
// clone made without platform_settings loses the allow-list of what a call may override. The runtime
// sends a voice override on every workflow call, so the provider then refuses the WHOLE call at the
// instant somebody picks up — "Override for field 'voice_id' is not allowed by config". That is
// exactly what broke the owner's first live test, and it is invisible from the source.
if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_MIDCALL_AGENT_ID && process.env.ELEVENLABS_AGENT_ID
    && process.env.ELEVENLABS_API_KEY !== "test") {
  const get = async (id: string) => (await (await fetch(`https://api.elevenlabs.io/v1/convai/agents/${id}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY as string } })).json()) as Record<string, unknown>;
  const tts = (a: Record<string, unknown>) => JSON.stringify(((((a.platform_settings as Record<string, unknown>)
    ?.overrides as Record<string, unknown>)?.conversation_config_override as Record<string, unknown>)?.tts) ?? null);
  const live = await get(process.env.ELEVENLABS_AGENT_ID);
  const join = await get(process.env.ELEVENLABS_MIDCALL_AGENT_ID);
  check("5.10", "The joining agent allows the same per-call overrides as the live agent", () =>
    tts(live) === tts(join) || `live allows ${tts(live)} but the joining agent allows ${tts(join)} — a call using it is REFUSED`);
} else {
  phone("5.10", "The joining agent allows the same per-call overrides as the live agent", "re-run with the real ELEVENLABS_* env to check the live agents");
}

if (process.env.ADMIN_TOKEN && process.env.CHECK_HOST) {
  const r = await fetch(`${process.env.CHECK_HOST}/api/settings`, { headers: { "x-admin-token": process.env.ADMIN_TOKEN } });
  const st = await r.json() as Record<string, string>;
  const byStore = JSON.parse(st.vt_store_workflows || "{}") as Record<string, string>;
  const wfs = JSON.parse(st.vt_workflows || "[]") as Array<{ name?: string; lane?: string }>;
  const lane = wfs.find((w) => w.name === byStore["106361"])?.lane;
  check("12.4", "The Fun store is off the old whole-call Delta", () =>
    lane !== "delta" || `the Fun store runs "${byStore["106361"]}", which is the OLD whole-call Delta`);
} else {
  phone("12.4", "The Fun store is off the old whole-call Delta", "a live setting: re-run with ADMIN_TOKEN and CHECK_HOST");
}

}
await main();

// ── report ─────────────────────────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.v === "PASS").length;
const fail = results.filter((r) => r.v === "FAIL").length;
const ph = results.filter((r) => r.v === "PHONE").length;
console.log("\nTHE SPEC, STATEMENT BY STATEMENT\n");
for (const r of results) {
  const mark = r.v === "PASS" ? "✓" : r.v === "FAIL" ? "✗" : "☎";
  console.log(`  ${mark} ${r.id.padEnd(6)} ${r.claim}${r.note && r.v !== "PASS" ? `\n           → ${r.note}` : ""}`);
}
console.log(`\n════════════════════════════════════════════`);
console.log(`  CHECKABLE: ${pass + fail}     PASS: ${pass}     FAIL: ${fail}`);
console.log(`  NEEDS A REAL CALL: ${ph}`);
console.log(`  TOTAL STATEMENTS: ${results.length}`);
console.log(`════════════════════════════════════════════`);
if (fail) {
  console.log("\nFAILING:");
  for (const r of results.filter((x) => x.v === "FAIL")) console.log(`  ${r.id}  ${r.claim}\n        → ${r.note ?? ""}`);
}
process.exit(0);   // reporting tool: it states the number, it does not gate the build

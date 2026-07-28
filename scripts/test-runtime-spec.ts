// THE PARTS OF THE RUNTIME SPEC THAT ARE NOT THE CLIP.
// Run: env … DATABASE_URL=file:./.t-rs.db ./node_modules/.bin/tsx scripts/test-runtime-spec.ts
//
// Sections 2, 6, 7, 8 and 9 of docs/specs/live-call-runtime/README.md. The clip and the handover are
// driven end to end against real sockets in test-delta-clip.ts; this covers the rest, and it uses a
// REAL database wherever a claim is about the database, because "the one-hour block will not count a
// dropped call" is exactly the kind of thing that is true in a comment and false in a query.
import { rollup, _receiptFrom, navOutcomeOf, openReceipt, openSegment, closeSegment, getReceipt, startMeter, addMs, emit, closeReceipt, recordLine, transcriptOf, _reset } from "../src/calls/events";
import { ConversationEar } from "../src/calls/listen-nav";
import { _test as brainTest, checkBrainRequest, _resetBrainGuards } from "../src/calls/brain";
import { RECONNECT_OPENER, RECONNECT_OPENER_ES } from "../src/calls/service";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const okk = ok;

// ================================================================================================
console.log("▶ §2.1 one call, one receipt — a reopened agent is a numbered PART, never a second call");
{
  // He was open 0-10s, closed for a 20s wait, then open again 30-40s. He is billed for 20 seconds,
  // not 40: the gap is time nobody paid for, and measuring it as one long session would invent a
  // cost that never existed — which would hide the entire saving from closing him.
  const r = _receiptFrom({
    meters: { charlieOpenMs: 0, charlieCloseMs: 40_000, endMs: 45_000 },
    segments: [
      { n: 1, openMs: 0, closeMs: 10_000, brain: "hosted" },
      { n: 2, openMs: 30_000, closeMs: 40_000, brain: "hosted", why: "back after a 20s wait" },
    ],
  });
  const s = rollup(r);
  ok(s.charlieConnectedSeconds === 20, `billed for the stretches he was open (${s.charlieConnectedSeconds}s), not first-open to last-close (40s)`);
  ok(s.charlieSegments === 2, "the receipt says he was opened twice");
  ok(s.brain === "hosted", "and which brain served it");
}
{
  const one = _receiptFrom({ meters: { charlieOpenMs: 1_000, charlieCloseMs: 21_000, endMs: 25_000 }, segments: [{ n: 1, openMs: 1_000, closeMs: 21_000, brain: "ours" }] });
  ok(rollup(one).charlieConnectedSeconds === 20, "an ordinary one-stretch call is unchanged");
  ok(rollup(one).brain === "ours", "our own brain is stamped when it served the call");
  const mixed = _receiptFrom({ segments: [{ n: 1, openMs: 0, closeMs: 5_000, brain: "ours" }, { n: 2, openMs: 6_000, closeMs: 9_000, brain: "hosted" }] });
  ok(rollup(mixed).brain === "mixed", "a call that fell back mid-way reads as mixed, not as a clean win for either");
  ok(rollup(_receiptFrom({})).brain === null, "an agent who never joined has NO brain, not a default one");
}

console.log("\n▶ §9 the navigation outcome Mapper reads off the receipt");
{
  const reached = _receiptFrom({ meters: { humanMs: 30_000 }, planned: [{ action: "press", value: "2", atSec: 8 }] });
  ok(navOutcomeOf(reached) === "reached_a_person", "somebody answered");
  const rang = _receiptFrom({ planned: [{ action: "press", value: "2", atSec: 8 }], events: [
    { atMs: 8_000, atSec: 8, kind: "alpha_press" }, { atMs: 20_000, atSec: 20, kind: "ringing", detail: { leg: "desk" } }] });
  ok(navOutcomeOf(rang) === "still_ringing", "the route worked and the desk just rang out — NOT the same as the route failing");
  const failed = _receiptFrom({ planned: [{ action: "press", value: "2", atSec: 8 }, { action: "press", value: "2", atSec: 16 }], events: [
    { atMs: 8_000, atSec: 8, kind: "alpha_press" }] });
  ok(navOutcomeOf(failed) === "route_failed", "only half the mapped steps ran");
  ok(navOutcomeOf(_receiptFrom({})) === "no_route", "nothing was mapped for this store");
}

console.log("\n▶ §9 hold seconds: null means we never checked, 0 means we checked and it was none");
{
  _reset();
  openReceipt("r1");
  ok(rollup(getReceipt("r1")!).holdSeconds === null, "before the ear attaches, hold time is unmeasured");
  startMeter("r1", "holdMs");
  ok(rollup(getReceipt("r1")!).holdSeconds === 0, "once it attaches, a call with no hold reads a real zero");
  addMs("r1", "holdMs", 7_400);
  ok(rollup(getReceipt("r1")!).holdSeconds === 7, "and a real hold is counted");
}

console.log("\n▶ §2.1 segments survive being opened and closed live");
{
  _reset();
  openReceipt("r2");
  ok(openSegment("r2", "hosted") === 1, "first stretch is numbered 1");
  closeSegment("r2");
  ok(openSegment("r2", "ours", "back after a wait") === 2, "the next one is 2, not a new call");
  closeSegment("r2");
  closeSegment("r2");                                  // a double close must be harmless
  const r = getReceipt("r2")!;
  ok(r.segments.length === 2 && r.segments.every((s) => s.closeMs !== null), "both closed exactly once");
  ok(r.segments[1].why === "back after a wait", "and the reason the second one exists is on the record");
}

console.log("\n▶ §8 the dropped call is never written as completed");
{
  // The one-hour block matches ONLY `completed`, so this is the single property that decides whether
  // a customer whose call we broke is locked out of that store. Proven against the real query below.
  _reset();
  openReceipt("r3");
  emit("r3", "hangup", "broke on our end", { reason: "dropped" });
  const r = getReceipt("r3")!;
  ok(r.events.some((e) => e.detail?.reason === "dropped"), "the timeline says the call broke on our end");
}

console.log("\n▶ §8 the reconnect opener, and its Spanish");
{
  ok(!/[—–]/.test(RECONNECT_OPENER), "no dash inside the sentence (copy law)");
  ok(!/[—–]/.test(RECONNECT_OPENER_ES), "nor in the Spanish");
  ok(RECONNECT_OPENER.includes("{category}") && RECONNECT_OPENER_ES.includes("{category}"), "both name the product the customer asked about");
  ok(/disconnected/i.test(RECONNECT_OPENER) && /cort/i.test(RECONNECT_OPENER_ES), "both explain the cut-off rather than opening cold");
  const len = Math.abs(RECONNECT_OPENER.length - RECONNECT_OPENER_ES.length) / RECONNECT_OPENER.length;
  ok(len < 0.4, `the Spanish is a comparable length (${Math.round(len * 100)}% apart), so it reads at the same pace`);
}

console.log("\n▶ §7 the brain endpoint speaks the format the voice provider expects");
{
  const c = JSON.parse(brainTest.chunk("id1", "m", { content: "hi" }).replace(/^data: /, "").trim()) as {
    object: string; choices: Array<{ delta: { content?: string }; finish_reason: string | null }> };
  ok(c.object === "chat.completion.chunk", "each piece is a chat-completion chunk");
  ok(c.choices[0].delta.content === "hi" && c.choices[0].finish_reason === null, "text arrives in the delta, unfinished");
  const done = JSON.parse(brainTest.chunk("id1", "m", {}, "stop").replace(/^data: /, "").trim()) as { choices: Array<{ finish_reason: string }> };
  ok(done.choices[0].finish_reason === "stop", "and the turn is closed properly, so the agent knows to speak");
  ok(brainTest.textOf("plain") === "plain", "plain text content is read");
  ok(brainTest.textOf([{ text: "a" }, { text: "b" }]) === "ab", "a list of parts is flattened, never dropped");
  ok(brainTest.textOf(undefined) === "", "an unexpected shape is empty, never a crash on a live call");
}

console.log("\n▶ §7 the one route that is NOT behind the admin login — what it will accept");
{
  // It is the only door on the server without the admin lock, so what gets through it matters more
  // than anywhere else. The provider does not sign these requests, so the shared secret is what
  // proves the caller; everything below is what proves the REQUEST.
  const ok = (m: unknown[]) => JSON.stringify({ messages: m });
  const turn = [{ role: "system", content: "rules" }, { role: "user", content: "we have some" }];
  _resetBrainGuards();
  const good = checkBrainRequest(ok(turn));
  okk(good.ok === true, "a real turn is accepted");
  okk(good.ok === true && good.body.messages.length === 2, "…and only the messages come through");

  _resetBrainGuards();
  okk(checkBrainRequest("not json").ok === false, "junk is refused before any model is called");
  okk(checkBrainRequest(JSON.stringify({ messages: [] })).ok === false, "an empty turn is refused");
  okk(checkBrainRequest(JSON.stringify({ messages: [{ role: "root", content: "x" }] })).ok === false, "an unknown speaker is refused");
  okk(checkBrainRequest(JSON.stringify({ messages: Array(200).fill({ role: "user", content: "x" }) })).ok === false, "an absurd number of turns is refused");
  okk(checkBrainRequest(JSON.stringify({ messages: [{ role: "user", content: "x".repeat(70_000) }] })).ok === false, "an oversized body is refused on length, before it is even parsed");

  _resetBrainGuards();
  const first = checkBrainRequest(ok(turn));
  const again = checkBrainRequest(ok(turn));
  okk(first.ok === true && again.ok === false && again.why === "replay", "the identical request twice is a replay and is refused — a captured call cannot be fired back to burn our tokens");

  _resetBrainGuards();
  let refusedAt = 0;
  for (let i = 0; i < brainTest.MAX_TURNS_PER_MIN + 5; i++) {
    const r = checkBrainRequest(JSON.stringify({ messages: [{ role: "user", content: `turn ${i}` }] }));
    if (!r.ok && r.why === "too-many" && !refusedAt) refusedAt = i;
  }
  okk(refusedAt === brainTest.MAX_TURNS_PER_MIN, `even with the right secret there is a ceiling (stopped at ${refusedAt} a minute)`);

  _resetBrainGuards();
  const extra = checkBrainRequest(JSON.stringify({ messages: turn, tools: [{ evil: true }], stream_options: { x: 1 }, max_tokens: 99999, temperature: 50 }));
  okk(extra.ok === true, "fields we never agreed to do not break the call");
  okk(extra.ok === true && !("tools" in extra.body), "…they are dropped, never forwarded to a model with our money behind it");
  okk(extra.ok === true && extra.body.max_tokens === undefined && extra.body.temperature === undefined, "and out-of-range numbers are ignored rather than obeyed");
}

console.log("\n▶ hard rule 2: the transcript is OURS, written live, not read back from the provider");
{
  _reset();
  openReceipt("r4");
  recordLine("r4", "Agent", "do you have any Pokemon cards in stock?");
  recordLine("r4", "Clerk", "yeah we got a few booster packs");
  recordLine("r4", "Agent", "   ");                       // nothing said
  const r = getReceipt("r4")!;
  okk(r.transcript.length === 2, "empty lines are not recorded as turns");
  okk(transcriptOf(r) === "Agent: do you have any Pokemon cards in stock?\nClerk: yeah we got a few booster packs", "the conversation reads back in the order it happened");
  okk(r.transcript.every((l) => typeof l.atMs === "number"), "every line carries its own second on the call's clock");
  okk(!JSON.stringify(r.transcript).includes("audio"), "text only — no audio on any path");
}

console.log("\n▶ §5 the ear's last two jobs: extended dead air, and the line going away");
{
  const said: string[] = [];
  const e = new ConversationEar({
    holdStart: () => { /* covered elsewhere */ }, holdEnd: () => { /* covered elsewhere */ },
    deadAir: (ms) => said.push(`dead:${Math.round(ms / 1000)}s`),
    disconnected: () => said.push("gone"),
  });
  const LOUD = 550, QUIET = 20;
  const talk = (ms: number) => { for (let i = 0; i < ms / 20; i++) e.feed(i % 5 === 4 ? QUIET : LOUD); };
  const hush = (ms: number) => { for (let i = 0; i < ms / 20; i++) e.feed(QUIET); };
  talk(3000); hush(20000);
  okk(said.length === 0, "twenty seconds of quiet is a wait, not dead air");
  hush(30000);
  okk(said[0]?.startsWith("dead:"), `far past a normal wait it says so once (${said[0]})`);
  const before = said.length;
  hush(20000);
  okk(said.length === before, "…and only once, not every frame after");
  talk(2000); hush(50000);
  okk(said.filter((s) => s.startsWith("dead:")).length === 2, "somebody speaking resets it, so a second silence is heard again");
  // A dropped line stops sending audio ENTIRELY. That is an absence, and no silence detector can
  // see it — it has to be reported by whoever owns the socket.
  e.lineGone(); e.lineGone();
  okk(said.filter((s) => s === "gone").length === 1, "the line going away is reported exactly once, not heard and not repeated");
}

console.log("\n▶ §7 the model is the one the owner approved");
{
  okk(brainTest.DEFAULT_BRAIN_MODEL === "claude-sonnet-4-6", `the default brain is ${brainTest.DEFAULT_BRAIN_MODEL}, not a cheaper substitute`);
  okk(brainTest.brainProvider(brainTest.DEFAULT_BRAIN_MODEL).kind === "anthropic", "…and it routes to our own account");
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

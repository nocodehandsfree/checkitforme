// Unit test for the prompt-boundary detector that drives listening navigation.
// Run: ./node_modules/.bin/tsx scripts/test-listen-nav.ts
//
// The detector's whole job: say "a prompt just ENDED" when a recording stops talking, so a mapped
// step fires on the pause instead of on a stopwatch. These tests feed it synthetic frame energies —
// no audio, no network — so the timing rules are provable.
import { PromptDetector, ConversationEar, frameEnergy, looksLikeAPerson, _test, type HoldReason } from "../src/calls/listen-nav";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const LOUD = _test.VOICE_THRESH + 200;   // someone/something is talking
const QUIET = 20;                        // line noise
const FRAMES_PER_SEC = 1000 / _test.FRAME_MS;
/** Feed `ms` of talking or silence, one 20ms frame at a time. */
const feed = (d: PromptDetector, ms: number, loud: boolean) => {
  for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) d.feedEnergy(loud ? LOUD : QUIET);
};

console.log("▶ a real prompt: long speech then a clear pause = one boundary");
{
  const hits: number[] = [];
  const d = new PromptDetector((n) => hits.push(n));
  feed(d, 4000, true);                       // 4s recording
  feed(d, _test.END_SILENCE_MS + 100, false); // the pause that ends it
  ok(hits.length === 1 && hits[0] === 1, "one boundary, numbered 1");
  ok(d.count === 1, "count tracks completed prompts");
}

console.log("▶ mid-sentence pauses do NOT end a prompt");
{
  const hits: number[] = [];
  const d = new PromptDetector((n) => hits.push(n));
  feed(d, 2000, true);
  feed(d, _test.END_SILENCE_MS - 200, false); // a breath, shorter than the end-gap
  feed(d, 2000, true);
  ok(hits.length === 0, "still inside the same prompt — nothing fired");
  feed(d, _test.END_SILENCE_MS + 100, false);
  ok(hits.length === 1, "boundary only once the real pause lands");
}

console.log("▶ short noises are not prompts (clicks, beeps, one loud word of hold music)");
{
  const hits: number[] = [];
  const d = new PromptDetector((n) => hits.push(n));
  feed(d, _test.MIN_SPEECH_MS - 300, true);   // too short to be a prompt
  feed(d, _test.END_SILENCE_MS + 100, false);
  ok(hits.length === 0, "a burst under the minimum is ignored");
}

console.log("▶ a stray single loud frame does not start a burst");
{
  const hits: number[] = [];
  const d = new PromptDetector((n) => hits.push(n));
  d.feedEnergy(LOUD);                          // one frame only
  feed(d, 3000, false);
  feed(d, 2000, true);
  feed(d, _test.END_SILENCE_MS + 100, false);
  ok(hits.length === 1, "only the real prompt counted");
}

console.log("▶ a Target call: greeting, then the options list = two boundaries");
{
  const hits: Array<{ n: number; sec: number }> = [];
  let frames = 0;
  const d = new PromptDetector((n) => hits.push({ n, sec: Math.round(frames / FRAMES_PER_SEC) }));
  const play = (ms: number, loud: boolean) => {
    for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) { d.feedEnergy(loud ? LOUD : QUIET); frames++; }
  };
  play(1000, false);           // a beat before the greeting
  play(7000, true);            // "Thank you for calling the Mission Hills Target store."
  play(1000, false);           // the pause after the greeting
  play(11000, true);           // "For hours press 1, to reach a department press 2…"
  play(1000, false);           // the pause where it expects your press
  ok(hits.length === 2, "two prompts heard");
  ok(hits[0].sec >= 8 && hits[0].sec <= 10, `greeting ends ~9s (got ${hits[0]?.sec}s)`);
  ok(hits[1].sec >= 19 && hits[1].sec <= 22, `options end ~20s (got ${hits[1]?.sec}s)`);
}

console.log("▶ the same recipe at a SLOWER store still lands on the right prompts");
{
  // Topanga's greeting ran ~8s longer than Austin's on the 07-24 mapping runs. A stopwatch fires
  // mid-greeting here; the detector just reports later boundaries and the step follows the store.
  const hits: number[] = [];
  let frames = 0;
  const d = new PromptDetector(() => hits.push(Math.round(frames / FRAMES_PER_SEC)));
  const play = (ms: number, loud: boolean) => {
    for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) { d.feedEnergy(loud ? LOUD : QUIET); frames++; }
  };
  play(15000, true); play(1000, false);   // a long greeting
  play(12000, true); play(1000, false);   // the options
  ok(hits.length === 2, "still exactly two prompts");
  ok(hits[0] >= 15 && hits[0] <= 17, `first boundary tracks the longer greeting (${hits[0]}s)`);
  ok(hits[1] >= 28 && hits[1] <= 31, `second boundary follows it (${hits[1]}s)`);
}

console.log("▶ frameEnergy: silence reads low, tone reads high");
{
  const silence = Buffer.alloc(160, 0xff).toString("base64"); // μ-law 0xFF ≈ zero amplitude
  ok(frameEnergy(silence) < 50, "a silent frame reads near zero");
  const loud = Buffer.alloc(160, 0x00).toString("base64");    // μ-law 0x00 ≈ full scale
  ok(frameEnergy(loud) > _test.VOICE_THRESH, "a full-scale frame reads above the voice gate");
  ok(frameEnergy("") === 0, "an empty payload is 0, never NaN");
}

console.log("▶ a person picked up instead of the menu: stop pressing keys");
{
  // A store mapped with a phone menu that now answers directly. If we keep going we fire keypad
  // tones into a real person's ear, which is exactly what happens today.
  const d = new PromptDetector(() => { /* boundaries not needed here */ });
  feed(d, 2000, true);                        // "Target Topanga, this is Bob"
  feed(d, _test.END_SILENCE_MS + 100, false); // …and they stop
  const mid = { stepsFired: 0, promptCount: d.count, lastPromptMs: d.lastPromptMs, quietMs: d.quietMs };
  ok(!looksLikeAPerson(mid), "not called yet at the moment they stop talking — a menu pauses there too");
  feed(d, 2600, false);                       // they are WAITING for us
  ok(looksLikeAPerson({ ...mid, quietMs: d.quietMs }), "a short greeting then a long wait = somebody answered");
}

console.log("▶ …and it does NOT misfire on a real recorded menu");
{
  const d = new PromptDetector(() => { /* none */ });
  feed(d, 6000, true);                        // a menu reading its options
  feed(d, _test.END_SILENCE_MS + 100, false);
  feed(d, 4000, false);                       // even a long gap before the next prompt
  ok(!looksLikeAPerson({ stepsFired: 0, promptCount: d.count, lastPromptMs: d.lastPromptMs, quietMs: d.quietMs }), "a long recording is never a person, however long the gap after it");
}
{
  const d = new PromptDetector(() => { /* none */ });
  feed(d, 2000, true); feed(d, _test.END_SILENCE_MS + 100, false);
  feed(d, 400, false); feed(d, 2000, true); feed(d, _test.END_SILENCE_MS + 100, false);
  feed(d, 3000, false);
  ok(!looksLikeAPerson({ stepsFired: 0, promptCount: d.count, lastPromptMs: d.lastPromptMs, quietMs: d.quietMs }), "a menu of short prompts is not a person — only the very FIRST thing we hear can be");
}
{
  ok(!looksLikeAPerson({ stepsFired: 1, promptCount: 1, lastPromptMs: 2000, quietMs: 9000 }), "once the menu walk has started, a pause is just a pause");
  ok(!looksLikeAPerson({ stepsFired: 0, promptCount: 1, lastPromptMs: 0, quietMs: 9000 }), "silence with nothing said at all is not a person");
}

// ---- the ear during the conversation ---------------------------------------------------------
const LOUD_E = _test.VOICE_THRESH + 200, QUIET_E = 20;
/** Build an ear and a log of what it announced. */
function ear() {
  const said: string[] = [];
  const e = new ConversationEar({
    holdStart: (r) => said.push(`away:${r}`),
    holdEnd: (gap, nu) => said.push(`back:${Math.round(gap / 1000)}s${nu ? ":newperson" : ""}`),
  });
  return { e, said };
}
/** Someone talking: sound with the gaps real speech has. */
const talk = (e: ConversationEar, ms: number) => {
  for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(i % 5 === 4 ? QUIET_E : LOUD_E);
};
const silence = (e: ConversationEar, ms: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(QUIET_E); };
/** Hold music: sound that never stops. */
const music = (e: ConversationEar, ms: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(LOUD_E); };
const ringing = (e: ConversationEar, ms: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(LOUD_E, true); };

console.log("▶ the clerk puts the phone down and walks off");
{
  const { e, said } = ear();
  talk(e, 3000);
  silence(e, 3000);
  ok(said.length === 0, "three seconds of thinking is not a hold");
  silence(e, 3500);
  ok(said[0] === "away:quiet", "six seconds of nothing and they have gone");
  talk(e, 1000);
  ok(said[1] === "back:7s", "they come back and we know how long they were away");
  ok(e.holdMs >= 6000 && e.holdMs <= 8000, `and the seconds are counted (${e.holdMs}ms) — holdSeconds has been null since the receipt shipped`);
}

console.log("▶ hold music is not a person talking");
{
  const { e, said } = ear();
  talk(e, 3000);
  music(e, 7000);
  ok(said[0] === "away:music", "sound that never breaks is music, not somebody speaking");
  talk(e, 1000);
  ok(String(said[1]).startsWith("back:"), "real speech, with its gaps, ends the hold");
}

console.log("▶ …and a fast talker is NEVER mistaken for music");
{
  const { e, said } = ear();
  talk(e, 3000);
  for (let i = 0; i < 500; i++) e.feed(i % 12 === 11 ? QUIET_E : LOUD_E); // 10s, barely any gaps
  ok(said.length === 0, "ten seconds of someone talking quickly is still someone talking");
}

console.log("▶ a transfer: the desk starts ringing after we already had a person");
{
  const { e, said } = ear();
  talk(e, 3000);
  ringing(e, 400);
  ok(said[0] === "away:transfer", "a ringing line after a person = we were transferred, known immediately");
}

console.log("▶ a long gap means the person coming back may be somebody new");
{
  const { e, said } = ear();
  talk(e, 3000);
  silence(e, 25000);
  talk(e, 1000);
  ok(String(said[1]).endsWith(":newperson"), "over twenty seconds away and Charlie must be told it may be someone else");
  const short = ear();
  talk(short.e, 3000); silence(short.e, 8000); talk(short.e, 1000);
  ok(!String(short.said[1]).includes("newperson"), "a short hold is the same person, no warning needed");
}

console.log("▶ nobody has spoken yet, so nobody can have left");
{
  const { e, said } = ear();
  silence(e, 30000);
  ok(said.length === 0, "silence before anyone ever spoke is not a hold");
  const t = ear();
  ringing(t.e, 5000);
  ok(t.said.length === 0, "a ringing line before we ever reached a person is not a transfer either");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

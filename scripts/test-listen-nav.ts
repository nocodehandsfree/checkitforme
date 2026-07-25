// Unit test for the prompt-boundary detector that drives listening navigation.
// Run: ./node_modules/.bin/tsx scripts/test-listen-nav.ts
//
// The detector's whole job: say "a prompt just ENDED" when a recording stops talking, so a mapped
// step fires on the pause instead of on a stopwatch. These tests feed it synthetic frame energies —
// no audio, no network — so the timing rules are provable.
import { PromptDetector, frameEnergy, _test } from "../src/calls/listen-nav";

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

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

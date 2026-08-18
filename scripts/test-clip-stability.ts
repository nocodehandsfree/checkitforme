// THE SAME WORDS ARE THE SAME RECORDING, EVEN AFTER A RESTART (owner, 08-17 evening: "clips must
// be stable"). Check 372 played our opening question in 4.2 seconds and check 373 played the
// identical words in 5.6, because the cache lived only in memory: a deploy emptied it, the line was
// recorded again, and the provider renders the same sentence at a different length every time it is
// asked. The bytes are kept on the service's own disk now.
//   Run: ./node_modules/.bin/tsx scripts/test-clip-stability.ts
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "clips-"));
process.env.CLIP_CACHE_DIR = DIR;

const { phoneClip, mp3Clip, _resetClipCache } = await import("../src/calls/clip-cache");

let pass = 0, fail = 0;
const ok = (m: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${m}`); }
  else { fail++; console.log(`  ✗ ${m}`); if (extra !== undefined) console.log("     ", extra); }
};

// The provider, answering the SAME request with a different-length recording every time, which is
// what it really does: 4.2 seconds on one check and 5.6 on the next, same sentence.
let calls = 0;
const lengths = [33_808, 44_952, 60_000];
globalThis.fetch = (async () => {
  const body = Buffer.alloc(lengths[Math.min(calls++, lengths.length - 1)], 0x7f);
  return new Response(body, { status: 200 });
}) as typeof fetch;

const VOICE = "1P1JhCcLzeMmkvLi1BkG";      // Branson HD, both environments
const WORDS = "Hi there! I was just checking, do you have any Pokémon cards in stock right now?";

console.log("== the opening question is the same recording every check ==");
{
  const first = await phoneClip(VOICE, WORDS, { speed: 0.91 });
  ok("the question was recorded once", !!first && first.ms === 4226, first?.ms);
  const again = await phoneClip(VOICE, WORDS, { speed: 0.91 });
  ok("asked again inside the same run, nothing is re-recorded", calls === 1 && again?.ms === first?.ms, { calls, ms: again?.ms });
  // A deploy: the process starts with an empty memory cache and the disk still holds the clip.
  _resetClipCache();
  const afterRestart = await phoneClip(VOICE, WORDS, { speed: 0.91 });
  ok("after a restart the SAME recording plays, not a new one", calls === 1 && afterRestart?.ms === 4226, { calls, ms: afterRestart?.ms });
  ok("…and it is byte for byte the same audio", !!afterRestart && !!first && afterRestart.audio.equals(first.audio));
  ok("373's drift cannot happen: two checks either side of a deploy hear one length",
    afterRestart?.ms === first?.ms && afterRestart?.ms !== 5619, { first: first?.ms, after: afterRestart?.ms });
}

console.log("\n== a changed line is a different recording, never the old one ==");
{
  const other = await phoneClip(VOICE, "No worries, take your time!", { speed: 0.91 });
  ok("different words are recorded on their own", calls === 2 && other?.ms === 5619, { calls, ms: other?.ms });
  const faster = await phoneClip(VOICE, WORDS, { speed: 1.05 });
  ok("the same words in a different voice setting are recorded on their own too", calls === 3, calls);
}

console.log("\n== the hold reply is kept the same way ==");
{
  _resetClipCache();
  const a = await mp3Clip(VOICE, "No worries, take your time!", { speed: 0.91 });
  const before = calls;
  _resetClipCache();
  const b = await mp3Clip(VOICE, "No worries, take your time!", { speed: 0.91 });
  ok("it survives a restart with no second recording", calls === before && !!a && !!b && a.equals(b), { calls, before });
  ok("the phone clip and the mp3 of one line are kept apart", readdirSync(DIR).length >= 4, readdirSync(DIR).length);
}

console.log("\n== with no disk mounted the cache is memory only, exactly as it was ==");
{
  process.env.CLIP_CACHE_DIR = "";
  const { phoneClip: pc, _resetClipCache: reset } = await import("../src/calls/clip-cache?nodisk");
  const one = await pc(VOICE, "A line no run has said before.", {});
  const spent = calls;
  reset();
  const two = await pc(VOICE, "A line no run has said before.", {});
  ok("a box with no disk records again after a restart and never crashes", calls === spent + 1 && !!one && !!two, { calls, spent });
}

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

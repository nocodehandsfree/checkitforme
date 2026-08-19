// THE WAKE RULE, PROVEN ON THE OWNER'S OWN SAVED RECORDINGS (his order, 08-19).
//
// Run: ./node_modules/.bin/tsx scripts/test-hold-wake.ts   (and it runs on EVERY build, test-all.sh)
//
// WHAT IT IS FOR. Once we recognise a hold, Charlie's ears are shut and Echo alone keeps listening
// (src/voice/bridge.ts). His hearing comes back only when the wake rule says a real person is
// talking to us again — and the whole danger is scene 22, the advert inside the hold music: a
// recorded voice IS a voice, so nothing about loudness can refuse it, and on checks 398 to 405 it
// was handed to Charlie as if Staff had spoken.
//
// THE RULE IS THE SOUND RULE WE ALREADY HAD. Sound that runs on past MAX_SPEECH_RUN_MS with no gap
// in it is music: the longest unbroken run inside real speech on the robot store's own tapes was
// 980ms. The advert plays OVER the music, so the mix never breaks — its longest unbroken run is
// ELEVEN SECONDS. A person who really came back is talking into a line the music has left, so their
// runs break at word scale. That is the whole difference, and it is measured here, not argued.
//
// THE RECORDINGS ARE THE OWNER'S OWN, COMMITTED, NEVER REGENERATED (public/robot-clips/*.mp3, the
// files the robot store really plays). `scripts/hold-wake-frames.json` holds their frame energies,
// measured the way the ear measures a live line, so this proof re-runs forever with no ffmpeg, no
// network and no model — the same rule the hold-voice bench follows for its saved lines.
import { readFileSync } from "fs";
import { ConversationEar, _test } from "../src/calls/listen-nav";

interface Saved { file: string; sha256: string; what: string; frames: number[] }
const SAVED = JSON.parse(readFileSync(new URL("./hold-wake-frames.json", import.meta.url), "utf8")) as
  { what: string; clips: Record<string, Saved> };

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, saw?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${m}`); }
  else { fail++; console.log(`  ✗ ${m}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};

const ADVERT = SAVED.clips["08-hold-music-with-ad"];
const PERSON = SAVED.clips["07-ad-voice-male"];
const WALTZ = SAVED.clips["05-hold-music-waltz"];

/** One ear, wired the way the bridge wires it, counting only what we are proving. */
function earUnderTest() {
  const wakes: Array<{ spokeMs: number; atMs: number }> = [];
  const music: number[] = [];
  const holds: string[] = [];
  const ear = new ConversationEar({
    holdStart: (reason) => { holds.push(String(reason)); },
    holdEnd: () => { holds.push("end"); },
    musicHeard: (_afterMs, atMs) => { music.push(atMs); },
    personSound: (spokeMs, atMs) => { wakes.push({ spokeMs, atMs }); },
  });
  return { ear, wakes, music, holds };
}
const feedFrames = (ear: ConversationEar, frames: number[]) => { for (const e of frames) ear.feed(e); };
const feedQuiet = (ear: ConversationEar, ms: number) => { for (let i = 0; i < ms / _test.FRAME_MS; i++) ear.feed(20); };

console.log("▶ THE SAVED RECORDINGS ARE THE OWNER'S OWN, and they are what they say they are");
{
  ok(!!ADVERT && ADVERT.frames.length > 1000, "the advert recording is here, 22 seconds of it", ADVERT?.frames.length);
  ok(ADVERT.file === "public/robot-clips/08-hold-music-with-ad.mp3", "…and it is the committed file the robot store really plays", ADVERT.file);
  ok(!!PERSON && PERSON.frames.length > 300, "a bare recorded voice, no music under it, is here too", PERSON?.frames.length);
  // The sound rule's own measurement, printed so a change to either recording shows up here first.
  const runs = (frames: number[]) => {
    const out: number[] = []; let cur = 0;
    for (const e of frames) { if (e > 350) cur += _test.FRAME_MS; else { if (cur) out.push(cur); cur = 0; } }
    if (cur) out.push(cur);
    return out;
  };
  const advertRuns = runs(ADVERT.frames), personRuns = runs(PERSON.frames);
  const longest = (xs: number[]) => Math.max(...xs);
  console.log(`    the advert's longest unbroken run: ${longest(advertRuns)}ms · the voice's: ${longest(personRuns)}ms · the music bar: ${_test.MAX_SPEECH_RUN_MS}ms`);
  ok(longest(advertRuns) > _test.MAX_SPEECH_RUN_MS, "the advert mix runs on past the music bar, because the music fills its gaps", longest(advertRuns));
  ok(longest(personRuns) <= _test.MAX_SPEECH_RUN_MS, "the bare voice never does: it breaks at word scale, like every real person we have taped", longest(personRuns));
}

console.log("\n▶ ZERO WAKES INSIDE THE ADVERT — the fault of checks 398 to 405, measured");
{
  // The shape of a real scene 22 check: somebody answers and speaks (the ear learns how loud they
  // are), they step away, and the hold music with the advert in it plays at us.
  //
  // WHAT IS COUNTED, AND WHY IT IS COUNTED FROM THERE. Charlie's ears are shut the moment we
  // RECOGNISE the hold — the ear's own music report, or Staff's stepping-away words — and the wake
  // rule only governs from that moment on. Before it his ears are open anyway, so a report there
  // reopens nothing. So the count that matters, and the one the live engine obeys, is: from the
  // music being recognised, does the sound ever say a person is talking to us again?
  const { ear, wakes, music } = earUnderTest();
  feedFrames(ear, PERSON.frames);
  feedQuiet(ear, 300);
  feedFrames(ear, ADVERT.frames);
  ok(music.length > 0, "the ear recognised the music, so the hold was heard, not missed", music.length);
  const shutAt = music[0];
  const after = wakes.filter((w) => w.atMs >= shutAt);
  ok(after.length === 0, `not one wake from the music being recognised to the end of the advert (${after.length})`, after);
  console.log(`    ears shut at ${shutAt}ms · the advert plays to ${(PERSON.frames.length + 15 + ADVERT.frames.length) * 20}ms`);
}

console.log("\n▶ …AND A WAKE THE MOMENT THE PERSON COMES BACK");
{
  const { ear, wakes, music } = earUnderTest();
  feedFrames(ear, PERSON.frames);
  feedQuiet(ear, 300);
  feedFrames(ear, ADVERT.frames);
  const advertEndsAt = (PERSON.frames.length + 15 + ADVERT.frames.length) * 20;
  const lastMusic = music[music.length - 1];
  const before = wakes.length;
  feedQuiet(ear, 400);
  feedFrames(ear, PERSON.frames);
  const onReturn = wakes.length - before;
  ok(music.length > 0 && onReturn > 0, `the person coming back wakes him (${onReturn} report(s))`, onReturn);
  const first = wakes[before];
  ok(!!first && first.spokeMs >= _test.BACK_VOICE_MS, "…on a word's worth of speech, never one frame", first?.spokeMs);
  // WHERE THE SOUND RULE'S OWN LIMIT IS, said plainly rather than tuned away. An advert's last
  // seconds, once the music under it has thinned, are speech with real gaps — sound alone cannot
  // tell those from a person, and this report will fire on them the moment the line goes quiet.
  // What it can promise is that nothing fires until the line has genuinely left the music: the
  // last certainly-music moment plus MUSIC_CLEAR_MS. The other half of the wake rule is the words
  // (src/voice/bridge.ts): his ears come back only when Echo has also written a line that is not
  // Staff stepping away, and the advert's own words are written long before this point.
  ok(!!first && first.atMs >= lastMusic + _test.MUSIC_CLEAR_MS - _test.FRAME_MS,
    "…and nothing fires until the line has really left the music", { first, lastMusic });
}

console.log("\n▶ PLAIN HOLD MUSIC WAKES NOBODY EITHER (the waltz, nobody talking over it)");
{
  const { ear, wakes } = earUnderTest();
  feedFrames(ear, PERSON.frames);
  feedQuiet(ear, 1000);
  const before = wakes.length;
  feedFrames(ear, WALTZ.frames);
  ok(wakes.length - before === 0, `no wake in 15 seconds of the waltz (${wakes.length - before})`);
}

console.log(`\n════════════════════════════════`);
console.log(`  PASS: ${pass}   FAIL: ${fail}`);
console.log(`════════════════════════════════`);
if (fail > 0) process.exit(1);

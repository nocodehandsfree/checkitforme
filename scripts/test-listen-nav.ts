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
  // The wait is 3 seconds since 08-07, cut from 6: Charlie bills 0.18¢ a second and his meter ran
  // the whole 6 past their last word every time they stepped away.
  silence(e, 2000);
  ok(said.length === 0, "two seconds of thinking is not a hold");
  silence(e, 2000);
  ok(said[0] === "away:quiet", "four seconds of nothing and they have gone");
  talk(e, 1000);
  ok(said[1] === "back:4s", "they come back and we know how long they were away");
  ok(e.holdMs >= 3000 && e.holdMs <= 6000, `and the seconds are counted (${e.holdMs}ms) — holdSeconds has been null since the receipt shipped`);
}

console.log("▶ THE OWNER'S CHECK 298: 'hello? are you there?' brings Charlie back");
{
  // 08-06. He told Charlie to hold, went quiet, then asked several different ways whether we were
  // still there, and Charlie never came back and none of it was written down. The reason was that
  // being back needed 400ms of UNBROKEN speech and every pause reset the count, so short questions
  // with pauses between them never once reached the bar. It is counted over recent audio now.
  const { e, said } = ear();
  talk(e, 3000);
  silence(e, 7000);
  ok(said[0] === "away:quiet", "he steps away and the wait is declared");
  // "hello?" … "you there?" … each one shorter than the bar on its own.
  talk(e, 300); silence(e, 900); talk(e, 300); silence(e, 900);
  ok(String(said[1] || "").startsWith("back:"), "two short questions add up to somebody being back");
}

console.log("▶ …and one click still cannot end a wait, however many of them there are");
{
  const { e, said } = ear();
  talk(e, 3000);
  silence(e, 7000);
  for (let i = 0; i < 10; i++) { e.feed(LOUD_E * 4); silence(e, 1000); }  // one 20ms click a second
  ok(said.length === 1 && said[0] === "away:quiet", "ten clicks a second apart are still nobody");
}

console.log("▶ somebody who comes back quieter than they left is still heard");
{
  // The room test measures whoever speaks against how loud this person has been. That yardstick was
  // frozen for the whole wait and the sound from BEFORE the wait was averaged into the judgement, so
  // anybody who came back turned away from the handset was written off as noise from across the room
  // and could never be heard again. It fades on every frame now, down to a floor, and the wait
  // starts the measurement fresh.
  const { e, said } = ear();
  for (let i = 0; i < 60; i++) e.feed(4000);   // a close, loud speaker sets the yardstick high
  talk(e, 2000);
  silence(e, 7000);
  ok(said[0] === "away:quiet", "they step away");
  for (let i = 0; i < 60; i++) e.feed(i % 5 === 4 ? QUIET_E : 1500);  // back, at a third of that
  ok(String(said[1] || "").startsWith("back:"), "a third as loud is a person, not the room");
}

console.log("▶ …and a handset left on the counter is still not somebody coming back");
{
  const { e, said } = ear();
  for (let i = 0; i < 60; i++) e.feed(4000);
  talk(e, 2000);
  silence(e, 7000);
  // A till and a radio down the aisle: sound with gaps in it, far below the person we were speaking
  // to, going on and on. This is the eleven-cents-a-minute case the room test was built for.
  for (let i = 0; i < 40; i++) { for (let j = 0; j < 30; j++) e.feed(420); silence(e, 400); }
  ok(said.length === 1 && said[0] === "away:quiet", "a minute of room noise never ends the wait");
}

console.log("▶ the greeting the ear never heard still counts as somebody being there");
{
  // Charlie now opens on a greeting followed by a real pause (round 1, item 1.1), so the ear is
  // attached AFTER Staff said hello and after they stopped — it hears nothing but silence. An ear
  // that has never heard anybody says nobody left, so Staff who say "Fun store" and walk straight
  // off would be billed for in silence with no hold ever declared.
  const cold = ear();
  silence(cold.e, 8000);
  ok(cold.said.length === 0, "an ear that never heard anybody declares nothing — that is the trap");
  const { e, said } = ear();
  e.heardAlready(800);           // the greeting the person test measured before this ear existed
  silence(e, 7000);
  ok(said[0] === "away:quiet", "handed the greeting we already heard, it knows they walked off");
  talk(e, 1000);
  ok(said[1]?.startsWith("back:"), "…and it still knows when they come back");
}

console.log("▶ the phone on the counter: a room we can hear is not somebody talking to us");
{
  // THE ONE SHAPE NO RULE CAUGHT. Store noise is irregular with gaps in it, which is the exact shape
  // of speech, so it was never quiet, never music and never ringing — and Charlie stayed open and
  // billed at 11 cents a minute while the handset lay on the counter and Staff walked to the back.
  const { e, said } = ear();
  const near = LOUD_E * 4;                       // somebody speaking INTO the handset
  const far = Math.round(LOUD_E * 0.9);          // the same store, heard across the room
  const speak = (ms: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(i % 5 === 4 ? QUIET_E : near); };
  const roomNoise = (ms: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(i % 7 === 6 ? QUIET_E : far); };
  speak(3000);
  roomNoise(3000);
  ok(said.length === 0, "three seconds of it is not a hold, exactly like a pause is not");
  roomNoise(3500);
  ok(said[0] === "away:room", "six seconds and the phone is on the counter, so the meter stops");
  speak(1000);
  ok(said[1]?.startsWith("back:"), "somebody speaks up close again and Charlie comes back");
  ok(e.holdMs >= 6000, `the seconds nobody was with us are counted (${e.holdMs}ms)`);
}

console.log("▶ one click on the line can never deafen the ear to everybody after it");
{
  // Robot store checks 270 to 272 (08-04): the yardstick the room test measures against was the
  // LOUDEST single frame ever heard, and a click or pop on a phone line reads enormously loud. One
  // such frame pinned it so high that every real voice afterwards measured as the room, so Staff
  // who came back were never heard and all three checks sat deaf until somebody gave up.
  const { e, said } = ear();
  const near = LOUD_E * 4;
  const speak = (ms: number, level: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(i % 5 === 4 ? QUIET_E : level); };
  speak(2000, near);
  e.feed(near * 40);              // ONE click, absurdly loud, the way a line pop reads
  speak(1000, near);
  silence(e, 7000);               // they step away — a real wait
  ok(said[0] === "away:quiet", "the wait still opens");
  speak(1500, near);              // …and they come back at their ordinary loudness
  ok(said[1]?.startsWith("back:"), `they are HEARD coming back, click or no click (${said.join(" · ")})`);
}

console.log("▶ …and a quiet talker is still a person, not a room");
{
  const { e, said } = ear();
  const near = LOUD_E * 4;
  const speak = (ms: number, level: number) => { for (let i = 0; i < Math.round(ms / _test.FRAME_MS); i++) e.feed(i % 5 === 4 ? QUIET_E : level); };
  speak(3000, near);
  speak(9000, Math.round(near * 0.6));   // the same person, further from the handset, still talking
  ok(said.length === 0, "somebody speaking more quietly is never mistaken for the room");
}

console.log("▶ hold music is not a person talking");
{
  const { e, said } = ear();
  talk(e, 3000);
  music(e, 7000);
  ok(said[0] === "away:music", "sound that never breaks is music, not somebody speaking");
  // A bit over a second, not the instant of the first gap. Coming back now needs a real run of
  // speech, because ONE frame that was not music used to end the wait — see the flapping bug below.
  // It costs nothing: the first words are buffered and handed over whole either way.
  talk(e, 1500);
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
  // 400ms of tone used to be a transfer "known immediately". A real call proved that wrong: a voice
  // can land on the network's frequencies for a fraction of a second, and that read as being handed
  // on ten times over on a store with no menu (receipt 199). A real ringback burst is two seconds.
  ringing(e, 400);
  ok(said.length === 0, "less than half a second of tone is a voice, not a ringing phone");
  ringing(e, 400);
  ok(said[0] === "away:transfer", "a ringing line that keeps ringing = we were transferred");
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

// THE FLAPPING BUG, from a real receipt (call 199, staging, 07-28): ten "handed on" lines and ten
// "back off hold" lines on a DIRECT-DIAL call that was never transferred and never held. One frame
// of tone opened a transfer and the next frame that was not a tone closed it, over and over. Both
// halves now need a real run of evidence, so a stray frame cannot say anything at all.
console.log("▶ one stray frame cannot invent a transfer, and cannot end a wait");
{
  const { e, said } = ear();
  talk(e, 3000);
  // A single frame that happens to sit on the network's tone frequencies, mid conversation.
  e.feed(LOUD_E, true);
  talk(e, 1000);
  ok(said.length === 0, "one frame of tone in the middle of somebody talking is not a transfer");

  const b = ear();
  talk(b.e, 3000);
  ringing(b.e, 2000);                    // a real ringback burst: two full seconds
  ok(b.said[0] === "away:transfer", "two seconds of ringing IS a transfer");
  b.e.feed(LOUD_E);                      // one loud frame that is not a tone — a click, not a person
  ok(b.said.length === 1, "one frame that is not a tone does not mean somebody came back");
  ringing(b.e, 4000);
  ok(b.said.length === 1, "and the ringing carrying on does not open a second transfer");
  talk(b.e, 1000);
  ok(b.said.length === 2 && b.said[1].startsWith("back:"), "somebody actually speaking ends it, once");
}

console.log("▶ a whole ring cadence is ONE transfer, not one per burst");
{
  const { e, said } = ear();
  talk(e, 3000);
  // US ringback: two seconds on, four off, over and over. The gaps used to end the hold.
  for (let i = 0; i < 5; i++) { ringing(e, 2000); silence(e, 4000); }
  ok(said.filter((s) => s === "away:transfer").length === 1, `five rings are one transfer, not five (${said.length} lines)`);
  ok(said.filter((s) => s.startsWith("back:")).length === 0, "and nobody came back, because nobody spoke");
  talk(e, 1000);
  // Thirty seconds of ringing, timed from the FIRST ring — not from the burst we happened to be on
  // when somebody finally picked up. And long enough that whoever answers may not be who left.
  ok(said.length === 2 && said[1] === "back:30s:newperson", `they pick up and the whole wait is one wait (${said[1]})`);
}

console.log("▶ the wait is measured to when they STARTED talking, not when we were sure");
{
  const { e } = ear();
  talk(e, 3000);
  silence(e, 10000);
  talk(e, 2000);
  // 10s away. The run of speech that convinced us is theirs, so it must not be inside the wait.
  ok(e.holdMs >= 9500 && e.holdMs <= 10500, `the wait is the wait, not the wait plus our proof (${e.holdMs}ms)`);
}


console.log("▶ CHECK 377'S SHAPE: a dip in the hold music is not somebody coming back");
{
  // 08-18, test five (hold with music). The music dipped at 25.6s and Charlie rejoined, six seconds
  // before Staff spoke at 31.9s. The dip had poisoned the music test's window, so the music RESUMING
  // read as a person: sound that was not yet provably music banked as speech at 400ms and ended the
  // wait. Music resuming is ONE unbroken run of sound; a person's speech has gaps all through it.
  const { e, said } = ear();
  talk(e, 3000);
  music(e, 7000);
  ok(said[0] === "away:music", "the hold with music is declared");
  silence(e, 800);                 // the dip
  music(e, 5000);                  // …and the music comes back
  ok(said.length === 1, `the music resuming after a dip is not a person (${said.join(" · ")})`);
  silence(e, 800);
  talk(e, 1500);
  ok(String(said[1] || "").startsWith("back:"), "a real voice, with its gaps, still ends the hold");
}

console.log("▶ …and music that keeps dipping never brings him back either");
{
  const { e, said } = ear();
  talk(e, 3000);
  music(e, 7000);
  ok(said[0] === "away:music", "the hold with music is declared");
  // A loop with a beat of quiet in it, over and over: every resumed stretch is one unbroken run.
  for (let i = 0; i < 3; i++) { silence(e, 600); music(e, 2000); }
  ok(said.length === 1, `three dips and three resumes are still nobody (${said.join(" · ")})`);
  silence(e, 600);
  talk(e, 1500);
  ok(String(said[1] || "").startsWith("back:"), "and the person who finally speaks is heard");
}

console.log("▶ THE SWELL: music rising out of a quiet hold is not somebody coming back");
{
  // Scene 21's danger. Music that starts under the ear's threshold reads as a quiet hold; when it
  // swells, the loud stretch is one unbroken run — the exact shape the dip bug rejoined Charlie on.
  const { e, said } = ear();
  talk(e, 3000);
  silence(e, 4000);
  ok(said[0] === "away:quiet", "quiet music opens a quiet hold");
  music(e, 5000);                  // the swell: unbroken loud sound
  ok(said.length === 1, `a swell is not a person (${said.join(" · ")})`);
  silence(e, 600);
  talk(e, 1500);
  ok(String(said[1] || "").startsWith("back:"), "a real voice after the swell ends the hold");
}

console.log("▶ ECHO RECOGNISES HOLD MUSIC ABOUT A SECOND IN (owner, 08-18 night)");
{
  // His words: Echo learns music by its sound. The sound it learns from is the one this file
  // already trusts everywhere else — sound running on with no gap in it, longer than any voice
  // manages. Measured on the robot store's own recordings: the longest unbroken run inside real
  // speech was 980ms (checks 384, 382, 387 and 391), so a run past 1.2 seconds is the music.
  const said: string[] = [];
  const heard: Array<{ afterMs: number; atMs: number }> = [];
  const e = new ConversationEar({
    holdStart: (r, at) => said.push(`${(at / 1000).toFixed(1)}s away:${r}`),
    holdEnd: (gap) => said.push(`back:${Math.round(gap / 1000)}s`),
    musicHeard: (afterMs, atMs) => heard.push({ afterMs, atMs }),
  });
  talk(e, 3000);
  const musicStartedAt = e.heardMs;
  music(e, 1400);
  ok(heard.length === 1, `the music is recognised while it plays, not at the end of it (${heard.length} report(s))`);
  ok(heard[0] && heard[0].afterMs <= 1300,
    `…about a second in (${heard[0] ? heard[0].afterMs : "never"}ms of it was enough)`);
  ok(heard[0] && Math.abs(heard[0].atMs - musicStartedAt) <= 40,
    "…and it says WHEN the music started, not when we were sure");
  ok(said.length === 0, "recognising it is a report, never the drop: the wait has not been declared yet");
}

console.log("▶ …and the wait it opens is the SAME three seconds as silence, his one number");
{
  const said: string[] = [];
  const e = new ConversationEar({
    holdStart: (r, at) => said.push(`${(at / 1000).toFixed(1)}s away:${r}`),
    holdEnd: (gap) => said.push(`back:${Math.round(gap / 1000)}s`),
  });
  talk(e, 3000);
  music(e, 2900);
  ok(said.length === 0, "under three seconds of music is not a wait yet");
  music(e, 200);
  ok(said[0] === "3.0s away:music", `three seconds of music IS the wait, dated to its first note (${said[0]})`);
  // …and that is what the sheet's drop row measures: Charlie leaves at the declaration, three
  // seconds after the row's own start, which is the owner's green.
}

console.log("▶ …and the longest run a REAL person ever made still never reads as music");
{
  // 980ms, measured on check 382's own recording: the longest stretch of speech on the robot
  // store's tapes with no gap in it at all. The bar sits above it on purpose.
  const heard: string[] = [];
  const e = new ConversationEar({
    holdStart: () => { /* not what this scene is about */ },
    holdEnd: () => { /* … */ },
    musicHeard: (afterMs) => heard.push(`${afterMs}ms`),
  });
  talk(e, 3000);
  for (let i = 0; i < 49; i++) e.feed(LOUD_E);   // 980ms, unbroken, the real worst case
  silence(e, 400);
  talk(e, 1000);
  ok(heard.length === 0, `a person's longest unbroken run is never called music (${heard.join(" · ")})`);
}

console.log("▶ …and one walk-away is reported once, however long the music runs");
{
  const heard: number[] = [];
  const said: string[] = [];
  const e = new ConversationEar({
    holdStart: (r) => said.push(`away:${r}`),
    holdEnd: () => said.push("back"),
    musicHeard: (afterMs) => heard.push(afterMs),
  });
  talk(e, 3000);
  music(e, 20000);
  ok(heard.length === 1, `twenty seconds of music is one report, not twenty (${heard.length})`);
  talk(e, 1500);
  ok(said.includes("back"), "they come back");
  music(e, 2000);
  ok(heard.length === 2, "…and the NEXT time they walk off into music, that is its own report");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

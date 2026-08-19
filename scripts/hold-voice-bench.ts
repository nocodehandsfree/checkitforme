// WAS THAT STAFF, OR A RECORDING? — the bench for the after-call judge (owner's box, 08-18 night).
//
// Run:  GROQ_API_KEY=… ./node_modules/.bin/tsx scripts/hold-voice-bench.ts
//       …and to try a different reader:  MODEL=groq:… ./node_modules/.bin/tsx scripts/hold-voice-bench.ts
//
// THE RECORDINGS ARE REAL AND THEY ARE SAVED HERE ON PURPOSE. Every line below is a line a robot
// store check really wrote down, copied from that check's own record, with the check's number
// beside it. The owner's rule for this build: if the judge gets one wrong, reword the judge and run
// it again ON THESE SAME RECORDINGS — never on a fresh dial, and never let it stop a live call. So
// the recordings have to outlive the chat that made them, which is why they are committed here
// rather than fetched from Admin.
//
// It is a BENCH, not a suite: it costs a model read, so it is never in test-all.sh (same rule as
// scripts/deepgram-bench.ts).
//
// ITS OTHER HALF IS THE WAKE RULE, AND THAT ONE RUNS ON EVERY BUILD (owner's order, 08-19).
// The judge above reads WORDS after the call. What decides live whether the advert ever reaches
// Charlie at all is SOUND, and it is benched the same way, on the owner's own committed recordings
// (`public/robot-clips/08-hold-music-with-ad.mp3` and its neighbours, their frame energies measured
// into `scripts/hold-wake-frames.json`): zero wakes from the music being recognised to the end of
// the advert, a wake the moment the person comes back, zero on plain hold music. That half costs no
// model read, so unlike this one it is pinned into test-all.sh:
//
//   ./node_modules/.bin/tsx scripts/test-hold-wake.ts
//
import { judgeHoldVoice } from "../src/voice/verdict";

interface Saved { check: number; what: string; lines: Array<{ who: string; text: string }>; expect: Array<"person" | "recording">; }

const SAVED: Saved[] = [
  {
    check: 383, what: "scene 22, the advert mixed into the hold music — THE ONE THIS IS FOR",
    lines: [
      { who: "Clerk", text: "Larry Vásquez. How can I help you?" },
      { who: "Agent", text: "Hey, quick question, do you guys have any Pokémon cards in stock today?" },
      { who: "Clerk", text: "One moment. I'll go and have a look." },
      { who: "Agent", text: "No worries, take your time!" },
      { who: "Clerk", text: "Thanks for holding. Did you know we price match any local competitor? Ask an associate about our price match promise today." },
      { who: "Clerk", text: "Yeah. We've got a few of those." },
      { who: "Clerk", text: "Pitch black the booster boxes." },
    ],
    expect: ["person", "person", "recording", "person", "person"],
  },
  {
    check: 384, what: "scene 20, loud classic hold music, nobody recorded speaking",
    lines: [
      { who: "Clerk", text: "Larry Vásquez. How can I help you?" },
      { who: "Agent", text: "Hi there! I was just checking, do you have any Pokémon cards in stock right now?" },
      { who: "Clerk", text: "Sure. Let me check on that for you. One moment." },
      { who: "Clerk", text: "Yeah. We've got some in." },
      { who: "Clerk", text: "It's the pitch black boxes." },
    ],
    expect: ["person", "person", "person", "person"],
  },
  {
    check: 391, what: "scene 6, the hold nobody ever comes back from",
    lines: [
      { who: "Clerk", text: "Larry Vásquez. How can I help you?" },
      { who: "Agent", text: "Hi there! I was just checking, do you have any Pokémon cards in stock right now?" },
      { who: "Clerk", text: "Um, give me just a second. Let me double-check." },
    ],
    expect: ["person", "person"],
  },
  {
    check: 382, what: "scene 21, hold music that starts quiet and swells",
    lines: [
      { who: "Clerk", text: "Larry Vásquez. How can I help you?" },
      { who: "Clerk", text: "Hang on. Let me go and see for you." },
      { who: "Clerk", text: "Yeah. We do have those in." },
      { who: "Clerk", text: "The pitch black booster boxes." },
    ],
    expect: ["person", "person", "person", "person"],
  },
  {
    check: 376, what: "the wait announced in SPANISH — the case a word list can never read",
    lines: [
      { who: "Clerk", text: "Farmacia, ¿en qué le puedo ayudar?" },
      { who: "Clerk", text: "Un momento por favor, déjeme revisar." },
      { who: "Clerk", text: "Su llamada es muy importante para nosotros. Todos nuestros representantes están ocupados. Por favor, manténgase en la línea." },
      { who: "Clerk", text: "Sí, sí tenemos algunos." },
    ],
    expect: ["person", "person", "recording", "person"],
  },
  {
    check: 0, what: "the robot store's OWN recorded lines, word for word from tapedeck.ts — a machine by definition",
    lines: [
      // Scene 17's answering machine and the phone menu's opening, both owner-approved scripts the
      // robot store really plays. Nothing here is invented: if the judge cannot tell these from a
      // person, it cannot tell an advert either.
      { who: "Clerk", text: "You've reached MVP's. We're not able to take your call right now. Please leave a message after the tone." },
      { who: "Clerk", text: "Thank you for calling MVP's Pharmacy." },
      { who: "Clerk", text: "For the pharmacy, press 1." },
      { who: "Agent", text: "Hi there! I was just checking, do you have any Pokémon cards in stock right now?" },
      { who: "Clerk", text: "MVP's, buenas tardes. ¿En qué le puedo ayudar?" },
    ],
    expect: ["recording", "recording", "recording", "person"],
  },
];

// The two things that matter, kept apart on purpose: calling a RECORDING a person is the fault this
// build exists to end (Charlie answers an advert), and calling a PERSON a recording is the fault
// that would cost us a real answer. The second one is the dangerous one.
(async () => {
  const model = process.env.MODEL || undefined;
  let missedRecording = 0, missedPerson = 0, right = 0, judged = 0;
  const waitLines: string[] = [];
  for (const s of SAVED) {
    const read = await judgeHoldVoice(s.lines, model);
    console.log(`\n▶ check ${s.check} — ${s.what}`);
    if (!read) { console.log("  the reader gave nothing back (no key, or the model refused)"); continue; }
    read.forEach((r, i) => {
      const want = s.expect[i];
      const ok = r.voice === want;
      judged++;
      if (ok) right++;
      else if (want === "recording") missedRecording++;
      else missedPerson++;
      if (r.announcesWait) waitLines.push(`${s.check}: "${r.line.slice(0, 46)}"`);
      console.log(`  ${ok ? "✓" : "✗"} ${r.voice.padEnd(9)} (wanted ${want}) wait=${r.announcesWait ? "yes" : "no "} conf=${r.confidence.toFixed(2)}  "${r.line.slice(0, 58)}"`);
      if (!ok) console.log(`      why it said so: ${r.why}`);
    });
  }
  console.log(`\n════════════════════════════════`);
  console.log(`  ${right}/${judged} right · ${missedRecording} recording(s) taken for a person · ${missedPerson} person(s) taken for a recording`);
  console.log(`  lines it read as announcing a wait:`);
  for (const w of waitLines) console.log(`    ${w}`);
  console.log(`════════════════════════════════`);
  process.exit(missedRecording === 0 && missedPerson === 0 ? 0 : 1);
})();

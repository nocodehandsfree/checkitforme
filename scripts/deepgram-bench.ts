#!/usr/bin/env node
// THE DEEPGRAM BENCH. No phone, no store, no money on the phone line.
//
// It proves the one thing we need to know before touching the calling engine: if we hand Deepgram
// the SAME audio a real check hands around, do the right words come back?
//
// The audio is ours. Every line below is a robot store line the owner approved, and it is
// synthesized in Branson HD at the workflow's own tuning, asked for in `ulaw_8000` so it is byte for
// byte the format the phone line carries. Then it is sent one 20ms frame every 20ms, exactly like
// Twilio's media stream, because a transcriber decides where a sentence ends by hearing a real pause
// pass on a real clock. Sent as fast as the socket takes them, three seconds of speech arrive in
// milliseconds and come back slurred and welded together (the owner's checks, 08-01).
//
// Run:  ELEVENLABS_API_KEY=… DEEPGRAM_API_KEY=… ./node_modules/.bin/tsx scripts/deepgram-bench.ts
//
// IT RUNS THE REAL PIECE (08-07). The bench used to hold its own copy of the settings and its own
// idea of when a sentence ended, so it passed five of five while a real check split one sentence in
// two: the copy and the runtime had drifted. It now opens `src/voice/transcriber.ts` itself, so what
// passes here is what a check runs.
//
// AND IT PADS THE CLIP WITH QUIET, both sides. A clip sent on its own and closed the instant it ends
// is not a phone line: the socket closing is what finished the sentence, so the bench could never
// see the split. Real quiet before and after lets the transcriber decide where the turn ended the
// same way it does on a call.
import { openTranscriber, type HeardLine } from "../src/voice/transcriber";

const EL_KEY = process.env.ELEVENLABS_API_KEY || "";
const DG_KEY = process.env.DEEPGRAM_API_KEY || "";
const VOICE = "1P1JhCcLzeMmkvLi1BkG";          // Branson HD, both envs
const TUNING = { stability: 0.25, similarity_boost: 0.85, speed: 0.91 };
const MODEL = "eleven_turbo_v2";                // the owner's ruling 08-02: stay on turbo v2

/** One 20ms Twilio media frame of μ-law 8kHz: 8 bytes a millisecond. */
const FRAME_BYTES = 160;
const FRAME_MS = 20;

/** The lines that matter. Each one is a real robot store line and says what it is here to prove. */
const LINES: Array<{ scene: number; lang: string; text: string; proves: string; oneLineOnly?: boolean }> = [
  { scene: 5, lang: "en",
    text: "Okay, thank you for holding. Yeah, I did not see any, unfortunately.",
    proves: "the sentence lost after every hold, because Charlie is switched off when it is said" },
  { scene: 5, lang: "en",
    text: "Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front and see. Okay, let me just put you on hold.",
    proves: "the long turn check 354 wrote down in four pieces, the first of them the single word Pokemon",
    // This one is here for the SPLIT, not for the words: it is a mouthful of "uh" and a transcriber
    // is right to drop those, so grading it word for word would be grading the wrong thing.
    oneLineOnly: true },
  { scene: 10, lang: "en",
    text: "We did not.",
    proves: "the short answer that came back as the single word Not on check 332" },
  { scene: 10, lang: "en",
    text: "Thursdays, usually.",
    proves: "the other half of that same sentence, which arrived twelve seconds later as Usually." },
  { scene: 14, lang: "en",
    text: "This is Maria, what can I do for you?",
    proves: "the new person's greeting after a transfer, which never reaches the record at all" },
  { scene: 18, lang: "es",
    text: "Sí, tenemos algunos.",
    proves: "Spanish, which we never know is coming until Staff speak" },
];

/** Our own voice, in the phone line's own format. Same request the calling engine makes. */
async function speak(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=ulaw_8000`, {
    method: "POST",
    headers: { "xi-api-key": EL_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: TUNING }),
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** μ-law silence: 0x7f is the quietest sample the format has. */
const QUIET = Buffer.alloc(FRAME_BYTES, 0x7f).toString("base64");
/** How much quiet sits either side of the clip, so the turn ends on a pause and not on a hang-up. */
const PAD_MS = 2000;

/**
 * Stream one clip through THE RUNTIME'S OWN transcriber at the speed a phone line carries it, with
 * real quiet either side, and return every line it wrote. `language: multi` (inside that file) is
 * the whole Spanish answer: we do not know which language a store answers in until they speak, so
 * we must never have to say in advance.
 */
function transcribe(audio: Buffer): Promise<string[]> {
  return new Promise((resolve) => {
    const said: string[] = [];
    const t = openTranscriber((l: HeardLine) => { said.push(l.text); }, () => { /* quiet bench */ });
    const frames: string[] = [];
    for (let i = 0; i < PAD_MS / FRAME_MS; i++) frames.push(QUIET);
    for (let i = 0; i < audio.length; i += FRAME_BYTES) frames.push(audio.subarray(i, i + FRAME_BYTES).toString("base64"));
    for (let i = 0; i < PAD_MS / FRAME_MS; i++) frames.push(QUIET);
    let i = 0;
    const step = () => {
      if (i >= frames.length) {
        // Let the last turn come back, then let the socket go.
        setTimeout(() => { t.close(); setTimeout(() => resolve(said), 2200); }, 1200);
        return;
      }
      t.send(frames[i++]);
      setTimeout(step, FRAME_MS);
    };
    // The socket needs a moment to come up before the first frame, exactly as on a check.
    setTimeout(step, 600);
  });
}

/** Word for word, ignoring case, punctuation and accents, the same way the harness compares. */
const bare = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

if (!EL_KEY || !DG_KEY) {
  console.error("Need ELEVENLABS_API_KEY and DEEPGRAM_API_KEY in the environment.");
  process.exit(2);
}

let pass = 0;
for (const line of LINES) {
  const audio = await speak(line.text);
  const secs = (audio.length / 8000).toFixed(1);
  const heard = await transcribe(audio);
  const got = heard.join(" ");
  const ok = bare(got) === bare(line.text);
  const oneLine = heard.length <= 1;
  if ((ok || line.oneLineOnly) && oneLine) pass++;
  console.log(`\nSCENE ${line.scene} (${line.lang}) — ${line.proves}`);
  console.log(`  said : "${line.text}"  (${secs}s of audio)`);
  console.log(`  heard: "${got}"  (${heard.length} line${heard.length === 1 ? "" : "s"})`);
  console.log(`  ${ok ? "WORD FOR WORD" : line.oneLineOnly ? "the words are graded elsewhere" : "DIFFERENT WORDS"} · ${oneLine ? "one line" : "SPLIT INTO " + heard.length}`);
}
console.log(`\n${pass} of ${LINES.length} came back as ONE line, with the words right.`);
process.exit(pass === LINES.length ? 0 : 1);

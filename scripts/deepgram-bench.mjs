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
// Run:  ELEVENLABS_API_KEY=… DEEPGRAM_API_KEY=… node scripts/deepgram-bench.mjs
import WebSocket from "ws";

const EL_KEY = process.env.ELEVENLABS_API_KEY || "";
const DG_KEY = process.env.DEEPGRAM_API_KEY || "";
const VOICE = "1P1JhCcLzeMmkvLi1BkG";          // Branson HD, both envs
const TUNING = { stability: 0.25, similarity_boost: 0.85, speed: 0.91 };
const MODEL = "eleven_turbo_v2";                // the owner's ruling 08-02: stay on turbo v2

/** One 20ms Twilio media frame of μ-law 8kHz: 8 bytes a millisecond. */
const FRAME_BYTES = 160;
const FRAME_MS = 20;

/** The lines that matter. Each one is a real robot store line and says what it is here to prove. */
const LINES = [
  { scene: 5, lang: "en",
    text: "Okay, thank you for holding. Yeah, I did not see any, unfortunately.",
    proves: "the sentence lost after every hold, because Charlie is switched off when it is said" },
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

/**
 * Stream one clip to Deepgram at the speed a phone line carries it, and return every finished
 * sentence it wrote. `language: multi` is the whole Spanish answer: we do not know which language a
 * store answers in until they speak, so we must never have to say in advance.
 */
function transcribe(audio) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      model: "nova-3", encoding: "mulaw", sample_rate: "8000", channels: "1",
      language: "multi", smart_format: "true", punctuate: "true", interim_results: "false",
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${qs}`, { headers: { Authorization: `Token ${DG_KEY}` } });
    const said = [];
    let timer = null;
    const stop = (err) => { if (timer) clearTimeout(timer); try { ws.close(); } catch { /* already gone */ } err ? reject(err) : resolve(said); };
    ws.on("error", (e) => stop(e));
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const t = m?.channel?.alternatives?.[0]?.transcript;
      if (m?.is_final && t) said.push(t);
      if (m?.type === "Metadata") stop(null);
    });
    ws.on("open", () => {
      let i = 0;
      const step = () => {
        if (i >= audio.length) {
          // Tell it we are done and let it finish the last sentence, then give up rather than hang.
          try { ws.send(JSON.stringify({ type: "CloseStream" })); } catch { /* torn down */ }
          timer = setTimeout(() => stop(null), 4000);
          return;
        }
        try { ws.send(audio.subarray(i, i + FRAME_BYTES)); } catch { return stop(new Error("socket closed mid send")); }
        i += FRAME_BYTES;
        timer = setTimeout(step, FRAME_MS);
      };
      step();
    });
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
  if (ok && oneLine) pass++;
  console.log(`\nSCENE ${line.scene} (${line.lang}) — ${line.proves}`);
  console.log(`  said : "${line.text}"  (${secs}s of audio)`);
  console.log(`  heard: "${got}"  (${heard.length} line${heard.length === 1 ? "" : "s"})`);
  console.log(`  ${ok ? "WORD FOR WORD" : "DIFFERENT WORDS"} · ${oneLine ? "one line" : "SPLIT INTO " + heard.length}`);
}
console.log(`\n${pass} of ${LINES.length} came back word for word AND as one line.`);
process.exit(pass === LINES.length ? 0 : 1);

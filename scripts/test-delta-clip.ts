// DRIVING THE NEW CALL SHAPE, WITHOUT A PHONE.
// Run: ./node_modules/.bin/tsx scripts/test-delta-clip.ts
//
// The bridge is the one file where a mistake costs real calls to real stores, so this does not mock
// it. It stands up a REAL WebSocket server pretending to be the voice provider, hands the bridge a
// REAL socket pretending to be the carrier, and watches what actually goes down each wire and when.
//
// What it proves, in the order the spec lays the call out:
//   the clerk says hello → Delta's clip goes out → the agent connects BEHIND it → anything the clerk
//   says early is held, not lost → the clip ends → the held words are released → the agent has the
//   conversation. And that an agent who tries to talk over the question is silenced.
import { EventEmitter } from "node:events";
import { WebSocketServer, type WebSocket as WS } from "ws";
import { setBridgeContext, handleTwilioBridge, weEndedCheck, nudgeSignoff, echoListening, echoHeardStaff, echoHeardPiece } from "../src/voice/bridge";
import { openReceipt, getReceipt, transcriptOf, closeReceipt, rollup, _reset } from "../src/calls/events";
import { isCheckAlive } from "../src/calls/check-life";
import { toMediaFrames } from "../src/calls/clip-cache";
import { TUNING_DEFAULTS, type CallTuning } from "../src/calls/tuning";
import { personWaitForStore } from "../src/calls/charlie-setup";

/** Real ringback: the published North American pair, 440 + 480 Hz, μ-law encoded — the same thing
 *  the runtime measures with a Goertzel. Loudness alone would not prove anything here. */
function ringFrames(ms: number): string[] {
  const n = Math.round((8000 * ms) / 1000);
  const buf = Buffer.alloc(n);
  const enc = (s: number) => { // G.711 μ-law
    const BIAS = 0x84, CLIP = 32635;
    const sign = s < 0 ? 0x80 : 0; if (s < 0) s = -s; if (s > CLIP) s = CLIP; s += BIAS;
    let e = 7; for (let m = 0x4000; (s & m) === 0 && e > 0; e--, m >>= 1) { /* find */ }
    return ~(sign | (e << 4) | ((s >> (e + 3)) & 0x0f)) & 0xff;
  };
  for (let i = 0; i < n; i++) {
    const t = i / 8000;
    buf[i] = enc(Math.round((Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.45 * 32767));
  }
  return toMediaFrames(buf);
}

/** How many frames of quiet the bridge sends to end a turn — the same 800ms it uses. */
const TURN_GAP = 40;
/** THE PAUSE THAT PROVES A PERSON (round 1, item 1.1). Charlie no longer opens on the sound of a
 *  voice, because that is what a recording sounds like too. He opens on a short greeting followed by
 *  a real pause, so every scene where somebody says hello has to leave that pause — 140 frames is
 *  2.8 seconds, comfortably past the 2.5 the owner can retune from Admin. */
const PERSON_PAUSE = 140;
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- audio helpers ---------------------------------------------------------------------------
// μ-law: 0x00 decodes to a very loud sample, 0x7F to silence. That is all we need to make the ear
// hear "someone is talking" or "the line is quiet".
const LOUD = (n = 160, jitter = 0) => Buffer.alloc(n, 0x00).map((_, i) => (jitter && i % (3 + jitter) === 0 ? 0x10 : 0x00)) as Buffer;
/** SPEECH, NOT A TONE, AND NOT MUSIC EITHER. LOUD holds the same loudness on every frame, and over
 *  about a second of it the ear rightly calls that a machine tone — a ringback holds a steady
 *  amplitude, speech swings hard from syllable to syllable. Any scene that has to keep somebody
 *  TALKING for seconds needs that swing, or it is testing the ringback rule by accident. And every
 *  fifth frame is SILENT, the same gap the `speak` helper below has always had, because that is
 *  what real speech measures as on a real tape (check 378's carrier recording, 08-18): a voice
 *  never held the line more than about two thirds loud inside any one second — word edges dip
 *  under the threshold — while the hold music ran 100% loud for fourteen straight seconds. The
 *  gaps are how the ear tells a person coming back from the music resuming, so a speech shape
 *  with no gaps in it is a music shape by the ear's own measure, and it tests the wrong thing. */
const SPEECH = (i: number) => Buffer.alloc(160, i % 5 === 4 ? 0x7f : [0x00, 0x22, 0x08, 0x34, 0x02, 0x18][i % 6]);
const frame = (b: Buffer) => b.toString("base64");

// ---- the fake voice provider -----------------------------------------------------------------
interface Fake { url: string; close: () => void; sockets: WS[]; chunks: string[]; chunkAt: number[]; inits: string[]; agentIdsAsked: string[]; raw: string[] }
async function fakeProvider(opts: { speakImmediately?: boolean; readyDelayMs?: number } = {}): Promise<Fake> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.on("listening", r));
  const port = (wss.address() as { port: number }).port;
  const f: Fake = { url: `ws://127.0.0.1:${port}`, close: () => wss.close(), sockets: [], chunks: [], chunkAt: [], inits: [], agentIdsAsked: [], raw: [] };
  wss.on("connection", (ws) => {
    f.sockets.push(ws);
    ws.on("message", (d: Buffer) => {
      const s = d.toString();
      if (!s.includes("user_audio_chunk")) f.raw.push(s);   // everything except the audio firehose
      const m = JSON.parse(s) as { type?: string; user_audio_chunk?: string };
      if (m.type === "conversation_initiation_client_data") {
        f.inits.push(s);
        // A session that takes a moment to say it is ready. This is the ordinary case on a real
        // check, and it is what makes the store's answer pile up behind their greeting: the
        // question has finished, but nothing of ours is listening yet, so both are still held.
        const meta = () => ws.send(JSON.stringify({ type: "conversation_initiation_metadata", conversation_initiation_metadata_event: { conversation_id: "conv_test_1" } }));
        if (opts.readyDelayMs) setTimeout(meta, opts.readyDelayMs); else meta();
        // An agent that opens its mouth the instant it is ready. Nothing it says may reach the line
        // while our own question is still playing.
        if (opts.speakImmediately) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
      } else if (m.user_audio_chunk) {
        // WHEN it arrived, not just that it did. The real transcriber decides where a sentence ends
        // by hearing a pause pass on a REAL clock, so audio delivered faster than it was spoken has
        // no pauses in it at all — which is exactly how three "fixed" transcripts still came back
        // slurred and welded together (owner's checks, 08-01). This rig used to record only the
        // frames, so a burst and a properly paced handover looked identical to it and every fix
        // passed. Timing them is the only way this file can ever catch that class of fault.
        f.chunks.push(m.user_audio_chunk);
        f.chunkAt.push(Date.now());
      }
    });
  });
  return f;
}

// ---- the fake carrier ------------------------------------------------------------------------
class FakeTwilio extends EventEmitter {
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.emit("close"); }
  say(msg: unknown) { this.emit("message", Buffer.from(JSON.stringify(msg))); }
  media(payload: string) { this.say({ event: "media", media: { payload } }); }
  outMedia() { return this.sent.filter((x) => x.event === "media"); }
  marks() { return this.sent.filter((x) => x.event === "mark"); }
}

/** Stub the signed-url handshake so the bridge opens OUR provider instead of the real one, and
 *  record which agent it asked for — that is how we prove the joining agent was used. */
/** What the stubbed transcriber "hears" in the store's hello. "" = nothing worth writing down,
 *  which keeps every scene deterministic; the hello scene below sets a real greeting. */
let STT_TEXT = "";
let STT_CALLS = 0;
/** How many times a clip was really recorded in this scene: his little hello is made fresh each
 *  check and must never be served from the clip store. */
let TTS_CALLS = 0;
function stubSignedUrl(f: Fake) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // The hello transcriber must NEVER reach the real provider from a unit test.
    if (url.includes("/v1/speech-to-text")) {
      STT_CALLS++;
      return new Response(JSON.stringify({ text: STT_TEXT }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // HIS LITTLE HELLO IS MADE FRESH ON EVERY CHECK (owner, 08-20), so a scene about a comeback has
    // to be able to make one. 240ms of μ-law, the length two words really run to.
    if (url.includes("/v1/text-to-speech/")) {
      TTS_CALLS++;
      return new Response(Buffer.alloc(240 * 8, 0x30), { status: 200, headers: { "content-type": "audio/basic" } });
    }
    if (url.includes("/convai/conversation/get-signed-url")) {
      f.agentIdsAsked.push(new URL(url).searchParams.get("agent_id") || "");
      return new Response(JSON.stringify({ signed_url: f.url }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return real(input as RequestInfo, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

/** Walk a call to the moment a real person says hello, with the clip configured. */
/** What the customer's page is shown, live, in the order it is shown. */
const relayed: Array<{ role: string; text: string }> = [];

/** WHAT A REAL CHECK ALWAYS HAS, in the order it happens: their hello, which the recording is what
 *  answers, and then their answer to the question. Charlie's mouth opens on the SECOND of these
 *  (the hello scene at the top of this file), so a scene that skips them is a scene where he is
 *  correctly held and can never speak. The rig sends them by hand because the fake provider does no
 *  transcribing; on a real check the transcriber produces both. */
function theyGreetAndAnswer(f: Fake, hello = "Fun store, this is Bob, how can I help you?", answer = "Yeah, we got some in.") {
  const ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: hello } }));
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: answer } }));
}
async function callToHello(f: Fake, clipMs: number, room: string, tuning?: Partial<CallTuning>, holdStrategy?: "gate" | "reopen") {
  const audio = Buffer.alloc(clipMs * 8, 0x20); // μ-law 8kHz: 8 bytes per millisecond
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: clipMs, text: "do you have any Pokemon cards in stock?" },
    // The voice his little hello is made in. Every real check carries one.
    voiceId: "voice_test",
    // A scene that is about the DROP has to be able to switch the floor off, the same way the hold
    // scenes already do: the rig drives a whole check in milliseconds, so every session here is
    // newborn and the floor would hold every one of them open. And closing him for a wait is the
    // "reopen" strategy, which is what every real check runs (`closeAgentOnHold` is forced true).
    ...(tuning ? { tuning: { ...TUNING_DEFAULTS, ...tuning } } : {}),
    ...(holdStrategy ? { holdStrategy } : {}),
    ...(holdStrategy ? { holdStrategy } : {}),
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* no listeners */ }, (_r, role, text) => relayed.push({ role, text }));
  tw.say({ event: "start", start: { streamSid: "MZ_test", customParameters: { room } } });
  await sleep(350); // past the connect-click settle window
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  // …and then they STOP. The question waits for the end of the greeting, so the silence is what
  // actually starts it — feeding only speech would hang here, which is the behaviour we want.
  // Comfortably past the "they have finished saying hello" pause, so the scene is not sitting on the
  // exact boundary of a number the owner can retune from Admin.
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  return { tw, clipFrames: toMediaFrames(audio).length };
}

// ================================================================================================
console.log("▶ the clerk says hello: the question goes out, the agent connects behind it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw, clipFrames } = await callToHello(f, 1000, "room-clip");
  await sleep(150);

  ok(tw.outMedia().length >= clipFrames, `the whole clip went down the line (${tw.outMedia().length} frames, expected ${clipFrames})`);
  ok(tw.marks().length === 1 && (tw.marks()[0].mark as { name: string }).name === "delta-opening", "a mark rides behind it so the carrier can tell us when it finished");
  ok(f.agentIdsAsked[0] === "agent_joining", "the agent that opened is the one configured to JOIN a conversation, not the normal one");
  ok(f.inits.length === 1, "the agent was connecting while the question was still playing (prewarmed, not after)");
  // The question is played from a recording, so nothing in the provider's transcript knows it was
  // asked. It has to be recorded as a line of the conversation or our own record is missing the most
  // important thing said on the call — and the live view has no way to know we got that far.
  const said = (getReceipt("room-clip")?.transcript ?? []);
  ok(said.length === 1 && said[0].who === "Agent", "the question we asked is a line of the transcript, not a silent event");
  ok(said[0]?.text.includes("Pokemon cards in stock"), `…and it is the words the store actually heard (${said[0]?.text})`);
  console.log("▶ the clerk answers early: he HEARS it, and still cannot be heard");
  const heardBefore = f.chunks.length;
  const spokeBefore = tw.outMedia().length;
  tw.media(frame(LOUD(160, 1)));
  tw.media(frame(LOUD(160, 2)));
  await sleep(60);
  // HIS EARS ARE OPEN, HIS MOUTH IS NOT. Holding his ears shut until the question finished is what
  // forced everything into a buffer and out as one burst, and a burst has no pauses in it for the
  // transcriber to find — his greeting came back as different words welded to his answer (owner's
  // check 229). The question never needed his ears shut. It needed him not to TALK.
  ok(f.chunks.length > heardBefore, "a clerk answering during the question reaches him AS IT IS SAID, not in a burst later");
  ok(tw.outMedia().length === spokeBefore, "…and nothing of his reaches the line while our question is playing");

  console.log("▶ the carrier confirms the clip played: he can speak from here");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(60);
  // THEIR HELLO NEVER REACHES HIM, AND THAT IS THE FIX (owner 08-05). It used to, because his
  // session was also our only transcriber — and a hello is a question, so he answered it and asked
  // ours a second time on all five of checks 282 to 286. The hello is still kept whole and still
  // written down; it is transcribed on its own now (`transcribeTheirHello`) instead of being put in
  // front of him as a turn. What he receives is what comes AFTER our question: their answer.
  await sleep(700);   // whatever was held before his session answered paces out at speaking speed
  ok(f.chunks.length < 25, `their hello is NOT handed to him, so he has nothing to answer (${f.chunks.length} frames)`);
  const answered = f.chunks.length;
  for (let i = 0; i < 20; i++) tw.media(frame(LOUD(160, i % 3)));
  await sleep(200);
  ok(f.chunks.length > answered, "…and their ANSWER, said after the question, reaches him as it is spoken");
  // TWO TURNS, NOT ONE — and the thing that makes them two turns is REAL TIME, not invented silence.
  // Injecting a beat of quiet was tried and shipped twice and did nothing on his phone: sent at the
  // speed the socket will take it, the silence goes by as fast as the speech and the transcriber
  // never hears a pause at all (owner's check 229 — 157 frames handed over at once, greeting and
  // answer welded into one line). What separates the turns now is that his ears are open from the
  // moment a person is found, so the room's own pauses reach him as pauses. The scene near the end
  // of this file is the one that guards it.
  ok(f.chunkAt.length > 1 && f.chunkAt[f.chunkAt.length - 1] - f.chunkAt[0] > 0,
    "the audio reached him spread over real time, which is what a pause between turns is made of");
  // AND THE LIVE VIEW SHOWS THEM IN THE SAME ORDER. Staff speak first, always, but their words only
  // exist once the agent has transcribed the audio we held — several seconds later. Sent the instant
  // it plays, our question was therefore the FIRST thing a watching customer ever saw, with the store's
  // hello dropping in underneath it (owner, live check 07-31: "the first thing I see is the question").
  ok(!relayed.some((l) => l.role === "Agent"), "our question is NOT shown live yet, because their hello has not arrived");
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Hi, this is Bob at the phone store." } }));
  await sleep(80);
  ok(relayed[0]?.role === "Clerk" && /this is Bob/.test(relayed[0]?.text || ""), `their hello is the FIRST thing shown live (${relayed[0]?.role}: ${relayed[0]?.text})`);
  ok(relayed[1]?.role === "Agent" && /Pokemon cards in stock/.test(relayed[1]?.text || ""), "…and our question follows it, the order the call happened in");
  // HIS SESSION ECHOES OUR QUESTION BACK as a line of its own — it was handed over as context. It is
  // already on the record and already on the page from the moment it PLAYED, so relaying the echo
  // printed the question twice in a row (owner screenshot 08-01). Dropped, once.
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "do you have any Pokemon cards in stock?" } }));
  await sleep(80);
  ok(relayed.filter((l) => l.role === "Agent" && /Pokemon cards in stock/.test(l.text)).length === 1, "the echo of our own question is dropped, so it prints ONCE");
  ok((getReceipt("room-clip")?.transcript ?? []).filter((l) => l.who === "Agent" && /Pokemon cards in stock/.test(l.text)).length === 1, "…and the record holds one copy too");
  // AND THE HELLO READS ABOVE OUR QUESTION, because that is the order it was said in. Staff's words
  // only exist once the agent has transcribed the audio we held, which is after our question played,
  // so stamped on arrival the greeting printed UNDERNEATH the question it came before and the
  // customer read a store answering something nobody had asked yet (owner screenshot 07-31).
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Thanks for calling the Fun store, this is Bob." } }));
  await sleep(80);
  {
    const lines = getReceipt("room-clip")?.transcript ?? [];
    const hello = lines.findIndex((l) => l.text.includes("this is Bob"));
    const asked = lines.findIndex((l) => l.text.includes("Pokemon cards in stock"));
    ok(hello >= 0 && asked >= 0 && hello < asked, `their hello reads ABOVE our question, the order it happened in (hello ${hello}, question ${asked})`);
  }
  // ONE LINE, not three (owner 07-28: "it opens charlie_join three times"). Three things happened —
  // we asked the question, his session opened and started billing, then he took the conversation —
  // but ONE agent joined ONE call, and the Admin prints every line's note, so three of them read as
  // three agents. The other two are details of the join, and every one of those details is kept.
  const joins = (getReceipt("room-clip")?.events || []).filter((e) => e.kind === "charlie_join");
  ok(joins.length === 1, `one agent joining is one line (${joins.map((j) => j.note).join(" | ")})`);
  ok(joins[0]?.detail?.clipMs === 1000 && typeof joins[0]?.detail?.question === "string", "and it carries the question we asked and how long it ran");
  ok(joins[0]?.detail?.handoverVia === "the carrier confirmed the clip played", "the receipt still says WHICH signal ended the clip");

  console.log("▶ from here the agent owns every turn");
  const before = f.chunks.length;
  tw.media(frame(LOUD()));
  await sleep(40);
  ok(f.chunks.length > before, "clerk audio now flows straight through to the agent");
  restore(); tw.close(); f.close();
}

console.log("\n▶ he opens the moment a person is there, and hears the room from then on");
{
  // HE USED TO OPEN LATE ON PURPOSE, to save the seconds he would otherwise bill while our question
  // played. That saving is what cost three of the owner's checks: everything said in those seconds
  // had to be held, and held audio has to be handed over, and a handover has no pauses in it. He
  // opens with the person now. It costs a few seconds of his meter per check and it is the only way
  // the words come back right.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 5000, "room-late");
  await sleep(200);
  ok(f.inits.length === 1, "his session is open from the moment a person was found, not at the end of the question");
  ok(f.agentIdsAsked[0] === "agent_joining", "…and it is still the agent that joins silently, never the one that greets");
  const spoke = tw.outMedia().length;
  tw.media(frame(LOUD(160, 1)));
  await sleep(400);
  ok(f.chunks.length > 0, "what the clerk says during the question reaches him AS IT IS SAID");
  ok(tw.outMedia().length === spoke, "…and he still cannot be heard until the question has finished");
  restore(); tw.close(); f.close();
}

console.log("\n▶ a clip shorter than the warm-up lead still gets an agent");
{
  // The trap this guards: the gate clears the clip timers when it opens, and a warm-up timer caught
  // in that sweep would leave the clerk talking to an agent that never connected.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-short");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });   // carrier confirms it immediately
  await sleep(250);
  ok(f.inits.length === 1, "he was opened anyway the moment the question ended");
  tw.media(frame(LOUD()));
  await sleep(60);
  ok(f.chunks.length > 0, "and the conversation reaches him");
  restore(); tw.close(); f.close();
}

console.log("\n▶ the clip's own length ends it when no mark ever arrives");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 300, "room-length");
  const spoke = tw.outMedia().length;
  tw.media(frame(LOUD(160, 1)));         // an early answer, while the clip plays
  await sleep(120);
  ok(tw.outMedia().length === spoke, "he still cannot be heard 120ms into a 300ms question");
  await sleep(500);                       // past clip + settle, with no mark at all
  // The gate is open, so what they say from HERE reaches him. Their hello does not, and never did
  // on this scene either: everything said while our own clip is on the line is our own echo.
  tw.media(frame(LOUD(160, 2)));
  await sleep(120);
  ok(f.chunks.length >= 1, "the clip's known length opened the gate on its own");
  const handover = (getReceipt("room-length")?.events || []).find((e) => e.detail?.handoverVia);
  ok(String(handover?.detail?.handoverVia || "").includes("finished playing"), "the receipt names the length signal, not the mark");
  restore(); tw.close(); f.close();
}

console.log("\n▶ an agent who tries to talk over the question is silenced");
{
  _reset();
  const f = await fakeProvider({ speakImmediately: true });
  const restore = stubSignedUrl(f);
  const { tw, clipFrames } = await callToHello(f, 800, "room-overtalk");
  await sleep(120);
  ok(tw.outMedia().length === clipFrames, "only our clip reached the line, none of the agent's early audio");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// HE ANSWERS OUR QUESTION, NEVER THEIR HELLO (owner 08-05; checks 282, 283, 284, 285, 286).
//
// THE FAULT THIS SCENE EXISTS FOR, and it is worth writing down because five checks in a row looked
// FINE while it happened. Staff's hello is the first user turn the joining agent's session receives:
// it is exactly the audio we buffered while he was connecting. A hello is a question, so he answers
// it the only way anybody would, by greeting back and asking the store the question the recording has
// just asked. The gate above drops his voice only while the clip is still PLAYING, so whether the
// store heard the duplicate came down to clip length: on 285's 5.3 second clip it died silently and
// the check read clean, on 286's 4.1 second clip it went out on the line, the store answered it, and
// every turn after that was out of step.
//
// The words cannot fix it. The joining note has said "Do NOT greet them. Do NOT ask the question
// again" the whole time, and he did it five times out of five, because answering the person who just
// spoke to you beats any standing instruction. So it is a gate: his mouth opens on THEIR ANSWER.
console.log("\n▶ their hello is not his to answer: the recording already did");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-hello";
  const { tw, clipFrames } = await callToHello(f, 800, room);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });   // the question has finished
  await sleep(60);
  const ws = f.sockets[0];
  const staffSays = (t: string) => ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: t } }));
  const heSays = (t: string) => {
    ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: t } }));
    ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  };

  // THEIR HELLO reaches his session, exactly as it does on a real check.
  staffSays("Larry Vasquez. How can I help you?");
  await sleep(60);
  // …and he answers it, exactly as he did on all five. Reworded, so the echo drop cannot catch it:
  // that drop only fires when he says the recording's words back word for word, which is the only
  // reason 284 and 285 read clean while doing the same thing.
  heSays("Oh hey Larry, I'm just calling to check on Pokemon cards, did you guys have any in stock?");
  await sleep(80);
  ok(tw.outMedia().length === clipFrames, "his answer to their hello never reaches the line, the store hears the question ONCE");
  // Their hello, then our question: the order the call actually happened in. His duplicate would be
  // a third line, and it is not there.
  const saidNow = (getReceipt(room)?.transcript ?? []);
  ok(saidNow.length === 2 && saidNow[0]?.who === "Clerk" && saidNow[1]?.who === "Agent", `…and it is not written down either, because nobody heard it (${saidNow.map((l) => l.who).join(",")})`);
  ok(!saidNow.some((l) => l.text.includes("Oh hey Larry")), "the duplicate is nowhere on the record");
  const held = (getReceipt(room)?.events || []).find((e) => e.detail?.step === "hello_reply_held");
  ok(!!held, "the record SAYS he tried, so a check where it was dropped never looks like a check where it never happened");

  // NOW STAFF ANSWER THE QUESTION. From here it is his conversation and nothing is held.
  staffSays("Yeah, we do.");
  await sleep(60);
  const before = tw.outMedia().length;
  heSays("Oh nice, do you know the name of the set?");
  await sleep(80);
  ok(tw.outMedia().length > before, "once Staff answer the question, his voice reaches the line again");
  const said2 = (getReceipt(room)?.transcript ?? []);
  ok(said2.some((l) => l.who === "Agent" && l.text.includes("name of the set")), "…and what he says from there IS written down");
  restore(); tw.close(); f.close();
}

// THE HALF OF IT THAT COST CHECK 287. Getting his mouth to open on their WORDS was right and not
// enough: the provider runs patient, so a short answer is not finalised into a line until the pause
// after it has passed. On 287 "Yeah." was spoken at 4 seconds and did not arrive as words until past
// 7, so the wait ran out first and he was let in to ask a question that had already been answered.
// Their VOICE is what opens his mouth now, and it arrives while they are still saying it.
console.log("\n▶ the withheld hello is still written down, and Staff's name still reaches him as a note");
{
  _reset();
  STT_TEXT = "Fun store, this is Bob, how can I help you?";
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-hello-note";
  const { tw } = await callToHello(f, 600, room);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(150);
  // The greeting the transcriber heard is the record's first line, exactly as if his session had
  // transcribed it, because it goes through the socket's own handler and not a second copy of it.
  const lines = getReceipt(room)?.transcript ?? [];
  ok(lines[0]?.who === "Clerk" && lines[0]?.text.includes("this is Bob"), `their hello is the first line of the record (${lines[0]?.text})`);
  // …and the NAME went to Charlie as a square bracket note, which is context, not a turn he must
  // answer. That difference is the whole 282-286 fault: a turn demands an answer, a note does not.
  const note = f.raw.filter((m) => m.includes("contextual_update")).find((m) => m.includes("Bob"));
  ok(!!note, "Staff's name reached him as a note");
  ok(!!note && /gave their name/.test(note) && !/[—–]/.test(note), "…informational and dash free, never a command to greet");
  ok(tw.outMedia().length >= toMediaFrames(Buffer.alloc(600 * 8, 0x20)).length && f.chunks.length === 0,
    "and none of it was handed to him as audio, so there is no hello for him to answer");
  STT_TEXT = "";
  restore(); tw.close(); f.close();
}

console.log("\n▶ their voice opens his mouth, not the words that arrive seconds later");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-voicegate";
  const { tw, clipFrames } = await callToHello(f, 800, room);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(60);
  const ws = f.sockets[0];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Larry Vasquez. How can I help you?" } }));
  await sleep(60);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(60);
  ok(tw.outMedia().length === clipFrames, "before they answer, nothing of his reaches the line");
  // They start answering. NOT ONE WORD of it has been transcribed yet, and that is the point.
  for (let i = 0; i < 25; i++) tw.media(frame(SPEECH(i)));
  await sleep(60);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(60);
  ok(tw.outMedia().length > clipFrames, "their voice alone opens his mouth, seconds before their words are finalised");
  restore(); tw.close(); f.close();
}

console.log("\n▶ a store that never answers the question still gets Charlie, it just takes a beat");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-noanswer";
  const { tw, clipFrames } = await callToHello(f, 800, room);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(60);
  const ws = f.sockets[0];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Larry Vasquez. How can I help you?" } }));
  await sleep(60);
  // They say nothing back to the question. Leaving a person holding a silent phone is worse than
  // letting him prompt them, so the wait has a floor and he is let in when it runs out.
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(60);
  ok(tw.outMedia().length === clipFrames, "…still held while the wait runs");
  await sleep(9300);
  const letIn = (getReceipt(room)?.events || []).find((e) => e.detail?.step === "no_answer_to_the_question");
  ok(!!letIn, "the record says nobody answered the question, so he was let in to ask");
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(60);
  ok(tw.outMedia().length > clipFrames, "…and from there he can speak");
  restore(); tw.close(); f.close();
}

console.log("\n▶ no joining agent configured: the call behaves exactly as it does today");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-off", { lane: "direct" });
  setBridgeContext("room-off", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdMaxSeconds: 999 });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-off", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_off", customParameters: { room: "room-off" } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(150);
  ok(tw.outMedia().length === 0, "no clip played");
  ok(f.agentIdsAsked[0] === "agent_normal", "the normal agent opened");
  tw.media(frame(LOUD()));
  await sleep(40);
  ok(f.chunks.length > 0, "clerk audio goes straight to him, no gate in the way");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// HOLD AND TRANSFER (spec section 6). The Ear stays on the call; the AGENT is what gets suspended.
// Both shapes are built because Gate Zero picks between them, and the wrong one being built is the
// whole reason that gate exists.
const HOLD_QUIET_MS = 6000;
/** Drive a call up to a person answering, with a chosen hold strategy and no clip in the way. */
async function callWithHold(f: Fake, room: string, holdStrategy: "gate" | "reopen", holdMaxSeconds = 999) {
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdMaxSeconds, holdStrategy,
    // THESE SCENES TEST THE WAIT, NOT THE FLOOR. Charlie is never dropped inside the first few
    // seconds of his session on a real check (`charlieMinOnLineMs`, added 08-07 off check 357), but
    // the rig drives a whole call in milliseconds of real time, so every session here is newborn.
    // The scene at the bottom of this file is the one that proves the floor, at its real value.
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_h", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(120);
  return tw;
}
/** Someone talking: sound with the gaps real speech has. */
const speak = (tw: FakeTwilio, frames: number) => { for (let i = 0; i < frames; i++) tw.media(frame(i % 5 === 4 ? Buffer.alloc(160, 0x7f) : SPEECH(i))); };
/** STAFF ANNOUNCE THE WAIT, the way real people do (the inversion, 08-08): mid conversation, plain
 *  quiet never drops Charlie any more, so every scene about a WAIT has Staff saying they are going,
 *  through the same one door every Staff line takes. Scenes about unannounced quiet stay silent on
 *  purpose, because staying open through that quiet is now the thing they prove. */
const announceWait = (f: Fake, text = "Hold on, let me go check.") =>
  f.sockets[f.sockets.length - 1].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: text } }));
const quiet = (tw: FakeTwilio, frames: number) => { for (let i = 0; i < frames; i++) tw.media(frame(Buffer.alloc(160, 0x7f))); };

console.log("\n▶ the clerk walks off: the agent stops being fed and cannot be heard");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-hold", "gate");
  speak(tw, 150);                                  // a real person, talking to us
  const before = f.chunks.length;
  ok(before > 0, "while somebody is there, what they say reaches the agent");
  announceWait(f);                                 // "hold on, let me go check" — like a real person
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);              // they put the handset down and go
  await sleep(60);
  const r = getReceipt("room-hold");
  ok((r?.events || []).some((e) => e.kind === "hold_start"), "the receipt records the moment they went away");
  const during = f.chunks.length;
  speak(tw, 30);                                    // hold music / distant noise would land here too
  await sleep(60);
  ok(f.chunks.length >= during, "…and when they come back the agent hears them again");
  const ev = (getReceipt("room-hold")?.events || []).find((e) => e.kind === "hold_end");
  ok(!!ev, "the receipt records them coming back");
  // AND THE SENTENCE READS ITS OWN ROWS (owner, 08-19 night): "Staff back after N seconds" is the
  // distance between the wait's two rows, never a second number measured on the ear's own clock.
  // On check 413 the two disagreed on the sheet. This scene feeds a whole wait's worth of frames in
  // a blink, so its rows really are a blink apart — and the sentence has to say that, not 6.
  {
    const started = (getReceipt("room-hold")?.events || []).find((e) => e.kind === "hold_start");
    const drawn = Math.round((((ev?.atMs ?? 0) - (started?.atMs ?? 0))) / 1000);
    ok(typeof ev?.detail?.gapSec === "number" && (ev.detail.gapSec as number) === drawn,
      `and how long they were gone is what its own rows say (${ev?.detail?.gapSec}s)`, { drawn });
  }
  ok(rollup(getReceipt("room-hold")!).holdSeconds !== null, "hold seconds are a real measured number now, not null forever");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and he is TOLD there was a gap, so he does not carry on as if no time passed");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-told", "gate");
  speak(tw, 150);
  announceWait(f);
  await sleep(40);
  quiet(tw, 25000 / 20 + 20);                      // a LONG wait — it may not be the same person
  speak(tw, 30);
  await sleep(80);
  const updates = f.raw.filter((m) => m.includes("contextual_update"));
  ok(updates.length === 1, "exactly one note was sent to the agent, not spoken to the store");
  ok(/may be someone new/i.test(updates[0]), "and after a long wait it warns him the person may be someone else");
  restore(); tw.close(); f.close();
}

console.log("\n▶ the other strategy: close him for the wait, bring him back as part two");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  // The fallback stopwatch set SHORT, so this scene proves it cannot fire into the hold below.
  const tw = await callWithHold(f, "room-reopen", "reopen", 2);
  speak(tw, 150);
  ok(f.sockets.length === 1, "one session while somebody is with us");
  // Both sides say a line BEFORE the wait, so the check below is about surviving the drop rather than
  // about an empty record trivially matching itself.
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Hi, do you have any Pokemon cards in stock right now?" } }));
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "I have to go check, okay? I'm gonna put you on hold." } }));
  await sleep(60);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);
  await sleep(80);
  ok(f.sockets[0].readyState === 3 || f.sockets[0].readyState === 2, "his session is CLOSED for the wait — the only thing that actually stops the meter");
  ok(tw.readyState === 1, "the phone line itself stays up, so the store hears nothing unusual");
  // WHAT THE CUSTOMER'S PAGE IS TOLD WHILE HE IS CLOSED. This is the exact pair `/pub/live/:cid`
  // answers a bridge check from, and it is the whole of owner test 1 on 07-31: the page used to ask
  // the PROVIDER whether the check was still running, and closing Charlie for the wait ends his
  // conversation over there, so a store saying "hold on, let me go check" flipped the page straight to
  // Getting results and settled a no-answer verdict while the phone was still in somebody's hand. It
  // also wiped the conversation, because the reconnected Charlie is a NEW conversation there and the
  // earlier lines are not in it. Our own record answers both truthfully.
  {
    const live = getReceipt("room-reopen")!;
    const seen = transcriptOf(live);
    ok(!live.closed, "the customer's page is still told the check is RUNNING while Charlie is dropped for the wait");
    ok(seen.includes("Pokemon cards in stock") && seen.includes("put you on hold"),
      "…and BOTH sides of the conversation are still on the page, because it is OUR record, not his session");
    // And the sentence that caused all of it does not get read as being handed to another department.
    ok(!(live.events || []).some((e) => e.detail?.wrongDepartment === true),
      "“I'm gonna put you on hold” is a wait, never a wrong department");
    // NO VERDICT MAY LAND WHILE THE PHONE IS IN SOMEBODY'S HAND. Closing Charlie ends his conversation
    // at the provider, and both finalize paths took that as the check being over: they stamped "we got
    // left on hold", charged for it and sent the alerts while Staff were still walking back with the
    // answer. This is the one gate they now ask, and it has to say the line is up.
    ok(await isCheckAlive("room-reopen"), "no verdict can be stamped while Charlie is dropped, because the line is still up");
  }
  // THE STOPWATCH MAY NOT JOIN WHILE THEY HAVE US ON HOLD. The fallback timer armed at the start of
  // the call fired 60 seconds in on the owner's check — Charlie was closed for the hold, so nothing
  // held the door — and a SECOND Charlie opened blind into their hold music (owner, 08-01). Wait past
  // the timer with nobody back yet: no new session may appear.
  await sleep(2300);
  ok(f.sockets.length === 1, "the fallback stopwatch fired during the hold and was IGNORED — no ghost Charlie joined");
  speak(tw, 30);
  await sleep(150);
  if (f.sockets.length !== 2) { const { bridgeDebug } = await import("../src/voice/bridge"); console.log(bridgeDebug().slice(-12).join("\n")); }
  ok(f.sockets.length === 2, "somebody came back, so he is opened again");
  const joins = (getReceipt("room-reopen")?.events || []).filter((e) => e.kind === "charlie_join");
  ok(joins.some((j) => j.detail?.segment === 2), "and the receipt calls it part 2 of the SAME call, never a second call");
  // THE RECONNECTED CHARLIE IS TOLD WHAT WAS ALREADY SAID (owner 08-05, check 289). He is a fresh
  // session with no memory of part 1: he came back, heard "the 151 booster boxes", and asked whether
  // those come in packs, a question that answer had already settled. The reopened session is handed
  // the check's own written conversation, so the settle law finally has something to hold on to.
  await sleep(150);
  const history = f.raw.filter((m) => m.includes("contextual_update")).find((m) => m.includes("What has already been said"));
  ok(!!history, "the reopened session is handed the conversation so far");
  ok(!!history && history.includes("put you on hold") && history.includes("Never re-ask anything Staff already answered"),
    "…with the real lines in it and the settle law restated");
  ok(!/[—–]/.test(history || ""), "…and no dash in it");
  const r = getReceipt("room-reopen")!;
  ok(r.segments.length === 2, "two numbered stretches on one receipt");
  // …and the gate opens the moment the CARRIER says the line ended, so the check finalizes as normal.
  closeReceipt("room-reopen", "Check ended", "completed");
  ok(!(await isCheckAlive("room-reopen")), "once the carrier hangs up the line is down, and the verdict may land");
  restore(); tw.close(); f.close();
}

console.log("\n▶ the Admin's numbers arrive with the room: a bare carrier socket still obeys the 6 (check 364)");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-baretune";
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    // The Admin's saved 6 against a code default of 3. The only way this scene passes is the ear
    // being built from the CHECK'S OWN numbers; floors off like every hold scene, because the rig
    // drives a whole check in milliseconds and every session here is newborn.
    tuning: { ...TUNING_DEFAULTS, holdQuietMs: 6000, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  // BARE, the way the carrier really connects — the room only arrives in the start message, the
  // 08-04 goodbye bug's exact shape. Check 364 ran this way, the tuning lookup at connect found
  // nothing, and the ear was built on the default 3 seconds instead of the Admin's 6.
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way Twilio really connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_bt", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(120);
  speak(tw, 150);
  announceWait(f);                                 // "hold on, let me go check" — an announced wait
  await sleep(40);
  // THE ANNOUNCE ITSELF IS THE DROP NOW (owner, 08-17 late). Staff saying they are going to check
  // is all the evidence there is, so his meter stops on their words and nothing waits for the
  // quiet to run. His "Silence before Charlie drops" number is what the ear still uses for a quiet
  // NOBODY announced, and the bare socket below is why this scene exists: check 364's connection
  // arrived with no room on it, the tuning lookup found nothing, and every Admin number was lost.
  // THE BEHAVIOUR RULE (owner, 08-17 late): they still owe us the answer, their voice has stopped,
  // and nothing is being said to us. No wording is read at all, so this is the same on a silent
  // hold, on hold music, on a handset on a counter and in any language.
  const stoppedAt = Date.now();
  quiet(tw, 200);
  await sleep(1500);
  ok((getReceipt(room)?.events || []).some((e) => e.kind === "hold_start"),
    "their voice stopping with the answer still owed stops his meter, with no phrase read");
  ok((getReceipt(room)?.events || []).some((e) => e.kind === "charlie_leave"),
    "…and he is really closed, which is the only thing that stops the meter");
  ok(Date.now() - stoppedAt < 3000, `and it happens inside a couple of seconds of their voice stopping (${Date.now() - stoppedAt}ms)`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ a transfer is known the moment the next desk starts ringing");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-xfer", "gate");
  speak(tw, 150);
  // A ringing line is not loudness, it is the phone network's own published frequencies — and it has
  // to actually KEEP ringing. Half a second used to be enough, and half a second of a voice can land
  // on those frequencies by accident: that wrote ten false "handed on" lines onto a direct-dial call
  // with no menu at all (receipt 199, 07-28). A real ringback burst runs two full seconds.
  const short = ringFrames(400);
  for (const fr of short) tw.media(fr);
  await sleep(60);
  ok(!(getReceipt("room-xfer")?.events || []).some((e) => e.kind === "transfer"), "a flicker on the tone frequencies is not a transfer");
  const ring = ringFrames(1200);
  for (const fr of ring) tw.media(fr);
  await sleep(60);
  const evs = getReceipt("room-xfer")?.events || [];
  const ev = evs.find((e) => e.kind === "transfer");
  ok(!!ev, "a phone that keeps ringing IS a transfer, and the receipt says so");
  // EVERY WAIT THAT ENDS HAS TO HAVE STARTED. A transfer used to write only its own line, so the
  // "back off hold" that followed had no "put on hold" above it anywhere.
  ok(evs.some((e) => e.kind === "hold_start" && e.detail?.reason === "transfer"), "…and the wait it caused is opened too, so the timeline reads straight through");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// THE WRONG-DEPARTMENT SAVE, driven end to end on the real bridge (owner 07-29).
//
// The store hands us to the pharmacy counter. Staff there say so. Today that ended the check: it
// failed and the customer paid to have it tried again. What has to happen instead, in order, is the
// whole reason this exists — so it is driven here rather than asserted piece by piece:
//
//   Staff say "this is the pharmacy" → the receipt CARRIES it, read off our own words → the desk
//   starts ringing → the agent is CLOSED so the meter stops through the hand-over → somebody new
//   picks up → he is opened again as part two of the SAME check and TOLD the person may be new.
//
// The last step is the one that used to be decided by a stopwatch: a hand-over faster than twenty
// seconds read as the same person, so he carried on mid answer with a stranger.
console.log("\n▶ the wrong department: Staff say so, the meter stops through the hand-over, he comes back told");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-wrongdept", "reopen");
  speak(tw, 150);                                   // a real person, talking to us
  ok(f.sockets.length === 1, "one session while the first person is with us");

  // What the provider sends us the moment it transcribes them. This is the ONLY way a wrong
  // department can be known: it is words, and the Ear cannot read words (runtime spec §10).
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Hi, this is the pharmacy." } }));
  await sleep(80);
  const wd = (getReceipt("room-wrongdept")?.events || []).find((e) => e.detail?.wrongDepartment === true);
  ok(!!wd, "the receipt says we reached the wrong department");
  ok(String(wd?.detail?.said || "").includes("pharmacy"), `and keeps what Staff actually said: "${wd?.detail?.said}"`);
  ok(String(wd?.note || "").includes("wrong department"), `in plain words on the timeline: "${wd?.note}"`);
  ok(wd?.kind === "unknown", "on an existing event kind, so the closed set of sixteen stays sixteen");

  // They put us through. A QUICK hand-over on purpose, about a second: the old rule would have
  // called that the same person, which is exactly the bug this proves is gone.
  for (const fr of ringFrames(1200)) tw.media(fr);
  await sleep(80);
  const evs1 = getReceipt("room-wrongdept")?.events || [];
  ok(evs1.some((e) => e.kind === "transfer"), "the ringing desk is read as a hand-over");
  ok(evs1.some((e) => e.kind === "hold_start" && e.detail?.reason === "transfer"), "…and the wait it caused is opened, so the timeline reads straight through");
  ok(f.sockets[0].readyState === 3 || f.sockets[0].readyState === 2, "his session is CLOSED for the hand-over, so we pay nothing while nobody is talking");
  ok(evs1.some((e) => e.kind === "charlie_leave" && e.detail?.strategy === "reopen"), "the receipt says the billing stopped");
  ok(tw.readyState === 1, "the phone line itself never drops, so it is still the SAME check");

  speak(tw, 30);                                    // somebody new picks up
  await sleep(200);
  const r = getReceipt("room-wrongdept")!;
  const back = r.events.find((e) => e.kind === "hold_end");
  ok(!!back && (back.detail?.gapSec as number) < 20, `they were only gone ${back?.detail?.gapSec}s, which the old rule read as the same person`);
  ok(back?.detail?.maybeNewPerson === true, "a hand-over is a NEW person however fast it was");
  ok(String(back?.note || "").includes("may not be the same person"), `and the timeline says so: "${back?.note}"`);
  ok(f.sockets.length === 2, "he is opened again for whoever picked up");
  ok(r.events.filter((e) => e.kind === "charlie_join").some((j) => j.detail?.segment === 2), "as part 2 of the SAME check, never a second call");
  ok(r.segments.length === 2, "two numbered stretches on one receipt, so the gap costs nothing");
  // THE NOTE HE WAS CLOSED FOR. Sent on the NEW session, never spoken onto the line.
  const notes = f.raw.filter((m) => m.includes("contextual_update"));
  // TWO notes now (08-05): the conversation so far, then the warning — and the warning comes LAST,
  // because the freshest instruction is the one that governs. Neither is spoken to the store.
  ok(notes.length === 2, `both notes reached him, not spoken to the store (${notes.length})`);
  ok(/What has already been said/.test(notes[0] || ""), "the conversation so far comes first");
  ok(/may be someone new/i.test(notes[1] || ""), "and the warning that it may be someone new comes last, so he asks again instead of carrying on");
  ok(!tw.outMedia().some((m) => JSON.stringify(m).includes("contextual_update")), "the note never went down the phone line");
  restore(); tw.close(); f.close();
}


// THE SILENT HAND-OVER — the one that would have failed on a real store.
//
// Plenty of stores put you on a quiet line rather than a ringing one. To the ear that is a person
// stepping away, and a step away under twenty seconds is the SAME person, so the agent would have
// been told to carry on and would have answered a stranger mid sentence. The words are the only
// thing that can say otherwise: he ASKED to be put through, so the next wait that ends is a hand-over
// however it sounded.
console.log("\n▶ a SILENT hand-over is still a hand-over, because he asked to be put through");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-silent-xfer", "reopen");
  speak(tw, 150);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "This is the pharmacy, hon." } }));
  await sleep(60);
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh gotcha, could you put me through to whoever handles the cards?" } }));
  await sleep(60);
  // NO ring tone at all. Just quiet, and not for long: the old rule reads this as the same person.
  quiet(tw, HOLD_QUIET_MS / 20 + 20);
  await sleep(80);
  const mid = getReceipt("room-silent-xfer")?.events || [];
  ok(mid.some((e) => e.kind === "hold_start" && e.detail?.reason === "quiet"), "the ear heard a quiet pause, which is all a silent hand-over sounds like");
  ok(!mid.some((e) => e.kind === "transfer"), "…and no ringing, so nothing was read as a transfer from the sound");
  speak(tw, 30);
  await sleep(200);
  const r = getReceipt("room-silent-xfer")!;
  const back = r.events.find((e) => e.kind === "hold_end");
  ok((back?.detail?.gapSec as number) < 20, `they were gone ${back?.detail?.gapSec}s, well under the bar that used to decide this`);
  ok(back?.detail?.maybeNewPerson === true, "somebody new anyway, because he had asked to be put through");
  ok(back?.detail?.afterAskingToBePutThrough === true, "…and the record says WHY, so the screen can tell a hand-over from a wander off");
  const notes = f.raw.filter((m) => m.includes("contextual_update"));
  ok(notes.length === 2 && /may be someone new/i.test(notes[1]), "he is told, last and freshest, that the person may be someone new, so he asks again");
  restore(); tw.close(); f.close();
}

// AND THE SAME THING WHEN STAFF NEVER GAVE HIM THE CHANCE TO ASK. Plenty of stores just move you:
// "let me transfer you to electronics", a second of quiet, a stranger. Only OUR asking used to mark
// the next wait as a hand-over, so this landed as somebody stepping away and the agent carried on
// mid answer with a person who had never heard the question.
console.log("\n▶ STAFF offer the transfer and move us fast: still a hand-over, still a new person");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-staff-xfer", "reopen");
  speak(tw, 150);
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Hi, do you have any Pokemon cards in stock right now?" } }));
  await sleep(40);
  // Staff move us. Our agent never asks — he has nothing to ask for, they already offered.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Oh, let me transfer you to electronics." } }));
  await sleep(60);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);   // no ring, and nowhere near twenty seconds
  await sleep(80);
  speak(tw, 30);
  await sleep(200);
  const r = getReceipt("room-staff-xfer")!;
  const back = r.events.find((e) => e.kind === "hold_end");
  ok(!r.events.some((e) => e.kind === "transfer"), "no ringing, so the sound said nothing");
  ok((back?.detail?.gapSec as number) < 20, `they were gone ${back?.detail?.gapSec}s, under the bar that used to decide this`);
  ok(back?.detail?.maybeNewPerson === true, "somebody new anyway, off THEIR words, with no ask of ours");
  ok(back?.detail?.afterAskingToBePutThrough === true, "…and the record says it was a hand-over, not a wander off");
  const notes = f.raw.filter((m) => m.includes("contextual_update"));
  ok(notes.length === 2 && /may be someone new/i.test(notes[1]), "he is told, last and freshest, that the person may be someone new, so he asks again");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and a plain wander off is still just a wander off");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-wander", "reopen");
  speak(tw, 150);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);   // nobody said anything about being put through
  await sleep(60);
  speak(tw, 30);
  await sleep(200);
  const back = (getReceipt("room-wander")?.events || []).find((e) => e.kind === "hold_end");
  ok(back?.detail?.maybeNewPerson !== true, "a short quiet pause with no ask is NOT somebody new");
  ok(back?.detail?.afterAskingToBePutThrough === undefined, "and nothing claims a hand-over happened");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// FAMILY 1 OF THE 08-01 CHECK-LIFE AUDIT, the bridge's door: a machine phrase is only proof of a
// voicemail BEFORE a real conversation. Hold loops play recordings, and "please leave a message
// after the tone" inside one used to close BOTH legs — hanging up on real Staff mid-hold.
console.log("\n▶ a 'leave a message' recording heard MID-HOLD does not hang up on real Staff");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-vm-hold", "gate");
  speak(tw, 150);                                   // a real person, talking to us
  announceWait(f);
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);               // they step away — we are on hold
  await sleep(60);
  ok((getReceipt("room-vm-hold")?.events || []).some((e) => e.kind === "hold_start"), "we are on hold");
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "You can leave a message after the tone." } }));
  await sleep(80);
  ok(tw.readyState === 1, "the phone line is STILL UP — a hold-loop recording is not a voicemail");
  ok(!(getReceipt("room-vm-hold")?.events || []).some((e) => e.kind === "voicemail"), "and nothing was stamped voicemail");
  ok((getReceipt("room-vm-hold")?.events || []).some((e) => String(e.note || "").includes("ignored")), "the receipt says the phrase was heard and ignored");
  speak(tw, 30);                                    // Staff come back — beyond doubt a live store now
  await sleep(60);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Sorry about that, you can always leave a message with our voicemail too." } }));
  await sleep(80);
  ok(tw.readyState === 1, "…and after Staff came back, a chatty mention of voicemail still cannot end the check");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …while a REAL voicemail at pickup still hangs up straight away");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-vm-real", "gate");
  speak(tw, 150);                                   // the machine's recorded voice trips the human gate — that is the case the bail exists for
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "We are unable to take your call, please leave a message after the beep." } }));
  await sleep(80);
  ok(tw.readyState !== 1, "the line was hung up — no hold ever happened, so the machine phrase is proof");
  ok((getReceipt("room-vm-real")?.events || []).some((e) => e.kind === "voicemail"), "and the receipt says a machine was reached");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// FAMILY 2 OF THE 08-01 AUDIT: nothing may act on the keypad or open Charlie once a real person is
// found. The recipe's scheduled presses used to keep firing after the answer — keypad tones into a
// live human's ear (runtime spec §10: "Today we would keep pressing").
console.log("\n▶ a mapped keypad press due AFTER a person answered is skipped, not sent");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-press", { lane: "alpha" });
  setBridgeContext("room-press", {
    agentId: "agent_normal", dynamicVars: {},
    // A mapped press three seconds in, and the agent joining on the learned second before it — the
    // press is then due AFTER a person has already been found.
    dtmf: "9@3", connectOnHuman: true, connectAtSec: 1,
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-press", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_p", customParameters: { room: "room-press" } } });
  await sleep(1400);                                // past connectAtSec — Charlie joined, a person is on the line
  ok(f.inits.length === 1, "the agent joined at the learned second");
  const beforePress = tw.outMedia().length;
  await sleep(2200);                                // past the press's own second
  ok(tw.outMedia().length === beforePress, "the mapped press was SKIPPED — no keypad tone into a live person's ear");
  const skipped = (getReceipt("room-press")?.events || []).find((e) => String(e.note || "").includes("keypad press"));
  ok(!!skipped && skipped.detail?.digit === "9", "and the receipt says which press was skipped and why");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// OPEN FAULT 4 OF THE 08-01 AUDIT: the doubled question and the page that bounces. One sentence
// prints once however it arrives — the echo drop is fuzzy (transcription never styles the recording
// word-perfectly), and a line the record already holds is neither recorded nor relayed again.
console.log("\n▶ one sentence prints once, however it arrives");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const base = relayed.length;
  const { tw } = await callToHello(f, 400, "room-dupes");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(150);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob." } }));
  await sleep(80);
  // The session echoes our question back STYLED DIFFERENTLY — the exact-string drop missed this.
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Do you have any Pokemon cards, in stock?!" } }));
  await sleep(80);
  ok((getReceipt("room-dupes")?.transcript ?? []).filter((l) => l.who === "Agent" && /pokemon cards/i.test(l.text)).length === 1,
    "a restyled echo of our recorded question is still the same sentence: ONE copy on the record");
  ok(relayed.slice(base).filter((l) => l.role === "Agent" && /pokemon cards/i.test(l.text)).length === 1,
    "…and ONE copy on the live view");
  // The same clerk sentence delivered twice (a socket retry, a replayed message) lands once.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Let me go check on that." } }));
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Let me go check on that!" } }));
  await sleep(80);
  ok((getReceipt("room-dupes")?.transcript ?? []).filter((l) => /go check on that/i.test(l.text)).length === 1,
    "the same clerk sentence arriving twice records once");
  ok(relayed.slice(base).filter((l) => /go check on that/i.test(l.text)).length === 1,
    "…and reaches the live view once");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// THE TWO RACES. Both are the same shape: something that was TRUE when it was checked is acted on
// after the world has moved. They are narrow windows and they cost a live check when they land.
console.log("\n▶ Staff step away WHILE we are opening him: no session opens into the hold");
{
  _reset();
  const f = await fakeProvider();
  // Opening him needs an address from the provider first, and that takes a moment. Hold the answer
  // long enough for Staff to walk away inside the window — which is the whole race.
  const real = globalThis.fetch;
  let releaseHandshake: (() => void) | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/convai/conversation/get-signed-url")) {
      await new Promise<void>((r) => { releaseHandshake = r; });
      return new Response(JSON.stringify({ signed_url: f.url }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return real(input as RequestInfo, init);
  }) as typeof fetch;

  openReceipt("room-race-open", { lane: "direct" });
  setBridgeContext("room-race-open", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen" });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-race-open", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_r", customParameters: { room: "room-race-open" } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(120);
  ok(f.sockets.length === 0 && !!releaseHandshake, "he is mid-handshake: no session open yet");
  // …and NOW they walk off, ANNOUNCED, before the address comes back. No session exists yet, so the
  // words arrive the way Echo's words always do, through the one Staff door.
  echoHeardStaff("room-race-open", "Hold on, let me go check.");
  quiet(tw, HOLD_QUIET_MS / 20 + 20);
  await sleep(60);
  ok((getReceipt("room-race-open")?.events || []).some((e) => e.kind === "hold_start"), "Staff stepped away while we were still opening him");
  (releaseHandshake as unknown as () => void)();
  await sleep(200);
  ok(f.sockets.length === 0, "the handshake finished into a hold and was REFUSED — nothing opened, nothing billed");
  // Back to an ordinary, instant handshake for the rest of the scene.
  globalThis.fetch = real;
  const restore = stubSignedUrl(f);
  // And somebody coming back still gets an agent, so refusing cost us nothing.
  speak(tw, 30);
  await sleep(250);
  ok(f.sockets.length === 1, "…and when they come back he opens normally");
  restore(); tw.close(); f.close();
}

console.log("\n▶ after a transfer the recording asks again, and Charlie stays off the line until Staff answer");
{
  // OWNER 08-04: "Echo absolutely needs to build this." Whoever picks up the next department never
  // heard the question, and Charlie re-asking it himself is the expensive way: the recording asks
  // for free, in the same voice, and his mouth stays shut behind the same gate the opening uses.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw, clipFrames } = await callToHello(f, 400, "room-replay");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(250);
  const playedOnce = tw.outMedia().length;
  ok(playedOnce >= clipFrames, "the question played once at the top of the check");
  // Staff say we landed wrong, and Charlie asks to be put through.
  theyGreetAndAnswer(f, "Hi, this is the pharmacy.", "Yeah, you'll want the front store for that.");
  await sleep(60);
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh gotcha, could you put me through to whoever handles the Pokemon cards?" } }));
  await sleep(60);
  // A silent hand-over: the line goes quiet, then somebody new says hello and stops. The wait is
  // fed only after the question's own playout window has passed, because until then the echo gate
  // rightly treats the line as carrying our own voice.
  await sleep(500);
  quiet(tw, HOLD_QUIET_MS / 20 + 30);
  await sleep(80);
  ok((getReceipt("room-replay")?.events || []).some((e) => e.kind === "hold_start"), "the hand-over wait opened and the meter stopped");
  speak(tw, 30);
  for (let i = 0; i < 45; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));   // …and they finish saying hello
  await sleep(250);
  ok(tw.outMedia().length >= playedOnce + clipFrames, `THE RECORDING ASKED AGAIN: the clip went down the line a second time (${tw.outMedia().length} frames)`);
  const clips = (getReceipt("room-replay")?.events || []).filter((e) => (e.detail as { step?: string } | null)?.step === "question_clip");
  ok(clips.length === 2, `…and the check records both askings (${clips.length})`);
  const qs = (getReceipt("room-replay")?.transcript || []).filter((l) => l.who === "Agent" && /Pokemon cards in stock/.test(l.text));
  ok(qs.length === 2, "the question sits on the record at both its seconds");
  // Charlie tries to talk over the replay: nothing of his reaches the line until the question ends.
  const beforeBarge = tw.outMedia().length;
  f.sockets[f.sockets.length - 1].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(80);
  ok(tw.outMedia().length === beforeBarge, "Charlie stays off the line while the recording is asking");
  const note = f.raw.filter((m) => m.includes("contextual_update")).pop() || "";
  ok(/recording is asking your question again/i.test(note), "…and he is told the recording owns the question, so he never asks it twice");
  ok(!/[—–]/.test(note), "no dashes in anything he is told");
  // The question finishes: the gate opens and the conversation is his.
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(120);
  // The new person's hello is theirs to make and the recording has just answered it, exactly as at
  // the top of the check — so his voice waits for THEIR answer here too.
  theyGreetAndAnswer(f, "Front store, this is Dana.", "Yeah, we have some.");
  await sleep(80);
  f.sockets[f.sockets.length - 1].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(80);
  ok(tw.outMedia().length > beforeBarge, "…and the moment Staff could answer, his voice flows again");
  restore(); tw.close(); f.close();
}

console.log("\n▶ the whole live chain: Staff answer, the reader reads, and the knock reaches Charlie");
{
  // Check 276 proved the knock never fires on staging while every piece passes alone. This drives
  // the WHOLE chain in one process: the line lands on the record, the record hands it to the
  // reader, the reader calls its model (stubbed here at the same fetch the real one uses), the
  // answer knocks on the door, and the note reaches Charlie's live session.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const verdictJson = JSON.stringify({ inStock: "yes", restockDay: null, restockTime: null, productForm: null, set: null, confidence: 0.9, reason: "clerk said we do" });
    // Each vendor gets its answer in its OWN shape: a Gemini call handed an OpenAI-shaped body
    // parses to an empty string WITHOUT throwing, so the fallback never fires and the reader
    // quietly reads nothing — which is a rig fault, not an engine one.
    if (url.includes("gateway.helicone")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: verdictJson }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("helicone")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: verdictJson } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  const { armLiveRead } = await import("../src/voice/live-read");
  const { recordLine } = await import("../src/calls/events");
  const { setLineHook } = await import("../src/calls/events");
  const { noteLiveLine } = await import("../src/voice/live-read");
  setLineHook(noteLiveLine);
  armLiveRead("room-livechain", "Pokémon");
  // THE CARRIER'S WAY IN, exactly: the socket connects BARE and the check's name only arrives in
  // the start message. Handing the name in up front is how this rig missed the empty-name door on
  // every real check (the fault the engine's own log caught on staging, 08-04).
  const audio = Buffer.alloc(400 * 8, 0x20);
  openReceipt("room-livechain", { lane: "direct" });
  setBridgeContext("room-livechain", {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true,
    openingClip: { audio, ms: 400, text: "do you have any Pokemon cards in stock?" },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way Twilio really connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_lc", customParameters: { room: "room-livechain" } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(250);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(200);
  const notes = () => f.raw.filter((r) => r.includes("contextual_update"));
  const before = notes().length;
  recordLine("room-livechain", "Clerk", "We do.");
  await sleep(400);   // the reader's model round trip, stubbed, plus the knock
  const note = notes().slice(before).find((n) => /answer is in hand/i.test(n)) || "";
  ok(!!note, "the answer knocked and the note reached his live session");
  ok((getReceipt("room-livechain")?.events || []).some((e) => (e.detail as { step?: string } | null)?.step === "signoff"), "…and the check records that he was told");
  globalThis.fetch = realFetch;
  restore(); tw.close(); f.close();
}

console.log("\n▶ the answer is in hand: Charlie is told to thank them and end, once, and nothing hangs up");
{
  // THE SIGNOFF (owner 08-04). Eight of ten robot store checks ended without a goodbye because
  // nobody told Charlie the answer had landed: he asked his next follow-up into a conversation that
  // was already over. The reader knows the moment; this proves the moment reaches him.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-signoff");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(200);
  const notes = () => f.raw.filter((r) => r.includes("contextual_update"));
  const before = notes().length;
  nudgeSignoff("room-signoff", "in stock");
  await sleep(100);
  const note = notes().slice(before)[0] || "";
  ok(notes().length === before + 1, "one note went to him on the channel that already carries notes");
  ok(note.includes("thank them warmly") && note.includes("end the check"), "…telling him to thank them and end");
  ok(!/[—–]/.test(note), "no dashes in anything he is told (they read strangely through ElevenLabs)");
  ok(tw.readyState === 1, "THE CHECK IS STILL UP: the signoff is a note, never a hang up");
  const ev = (getReceipt("room-signoff")?.events || []);
  ok(ev.some((e) => (e.detail as { step?: string } | null)?.step === "signoff"), "and the check records that he was told");
  nudgeSignoff("room-signoff", "in stock");
  await sleep(80);
  ok(notes().length === before + 1, "told once, never nagged twice");
  nudgeSignoff("room-that-never-existed", "in stock");
  ok(true, "a knock on a room with no check is a no-op, never an error");
  restore(); tw.close(); f.close();
}

console.log("\n▶ the goodbye is said and the line goes quiet: WE hang up, the check never sits open");
{
  // Check 282 (owner 08-04): Charlie was told to wrap up, said his goodbye, and the quiet after
  // it was read as Staff stepping away. He was dropped into a wait, the wait rule swallowed his
  // session's close, and the line sat open for 70 more seconds until the STORE hung up on us.
  // Once the wrap-up was asked for AND the goodbye is on the record, quiet is the check ending.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-signed-off");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(700);   // past the clip's playout clock and its echo tail, so the ear is being fed again
  speak(tw, 150);   // Staff give the answer, so the ear knows somebody was here
  theyGreetAndAnswer(f);   // …and it lands as words too, so the conversation is his from here
  nudgeSignoff("room-signed-off", "in stock");
  await sleep(80);
  f.sockets[f.sockets.length - 1].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Perfect, thank you so much, have a good one." } }));
  // …and his goodbye's own SOUND goes out: the check may not end until it has played (08-17).
  f.sockets[f.sockets.length - 1].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(800);
  await sleep(80);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);
  await sleep(120);
  const ev = getReceipt("room-signed-off")?.events || [];
  ok(!ev.some((e) => e.kind === "hold_start"), "the quiet after his goodbye is never written as Staff stepping away");
  const hang = ev.find((e) => e.kind === "hangup");
  ok(!!hang && (hang?.detail as { reason?: string } | null)?.reason === "signed_off", "the check says WE hung up because the goodbye was said");
  ok(!/[—–]/.test(String(hang?.note || "")), "no dashes in the line the owner reads");
  ok(tw.readyState !== 1, "…and the phone was actually put down, the line is not sitting open");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …but quiet WITHOUT the goodbye still holds: told to wrap up is not the same as done");
{
  // The gate above must never eat a real wait. The knock landed but Charlie has not said his
  // goodbye yet, maybe Staff walked off mid sentence: that quiet is still Staff stepping away.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-nudged-hold");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(700);   // past the clip's playout clock and its echo tail, so the ear is being fed again
  speak(tw, 150);   // Staff were here and talking…
  announceWait(f);  // …and say they are going, like a real person
  nudgeSignoff("room-nudged-hold", "in stock");
  await sleep(80);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);
  await sleep(120);
  // THE ANSWER IS IN HAND, so a quiet line is the check ENDING, not a wait (owner, 08-17 late).
  // Nobody owes us anything any more, so he is told to say his goodbye rather than standing there
  // for 13 seconds the way check 376 did. Nothing hangs up on a store that might still be talking.
  await sleep(5200);
  const ev = getReceipt("room-nudged-hold")?.events || [];
  ok(ev.some((e) => (e.detail as { step?: string } | null)?.step === "warm_wrap_up"),
    "with the answer in hand and the line quiet, he is told to say goodbye rather than wait");
  ok(!ev.some((e) => e.kind === "hangup"), "…and nothing hung up on a store that might come back");
  ok(tw.readyState === 1, "…and the line is still up");
  restore(); tw.close(); f.close();
}

console.log("\n▶ a late are you there from a replaced session: ignored, never answered, never a crash");
{
  // THE PING CRASH (owner 08-04). After Charlie was dropped for a wait, a late are you there from
  // the torn down session was answered on a connection that no longer existed. That threw, and the
  // safety net emailed the owner about a crash whose cause was an ordinary hold.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-late-ping", "reopen");
  speak(tw, 150);
  const first = f.sockets[0];
  announceWait(f);                                 // announced, so the wait really closes him
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);              // they step away — he is closed for the wait
  await sleep(80);
  speak(tw, 30);                                    // …and come back, so the session is REPLACED
  await sleep(250);
  ok(f.sockets.length === 2, "a fresh session is open for whoever is back");
  const pongsBefore = f.raw.filter((r) => r.includes('"pong"')).length;
  // The OLD session, mid teardown, asks if we are still there.
  try { first.send(JSON.stringify({ type: "ping", ping_event: { event_id: 991 } })); } catch { /* it may already be gone, which is the quiet day */ }
  await sleep(150);
  ok(tw.readyState === 1, "the check is still up: a ghost's question can never take it down");
  ok(f.raw.filter((r) => r.includes('"pong"')).length === pongsBefore, "…and the ghost was not answered on anybody's line");
  // …while the LIVE session's own are you there is still answered, because ignoring those ends checks.
  f.sockets[1].send(JSON.stringify({ type: "ping", ping_event: { event_id: 992 } }));
  await sleep(150);
  ok(f.raw.some((r) => r.includes('"pong"') && r.includes("992")), "the live session's question is answered as always");
  restore(); tw.close(); f.close();
}

console.log("\n▶ a fast return, then the OLD session's close lands: the check survives it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-race-close", "reopen");
  speak(tw, 150);
  ok(f.sockets.length === 1, "one session while somebody is with us");
  const first = f.sockets[0];
  announceWait(f);
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 20);              // they step away — he is closed for the wait
  await sleep(80);
  speak(tw, 30);                                    // …and come straight back, fast
  await sleep(200);
  ok(f.sockets.length === 2, "he is opened again for whoever is back");
  // The OLD socket now finishes tearing down. It used to read "not on hold any more", fall through,
  // and hang the phone up on Staff who were back and talking.
  try { first.terminate(); } catch { /* already gone */ }
  await sleep(150);
  ok(tw.readyState === 1, "the phone line is STILL UP — a replaced session's close cannot end the check");
  const leaves = (getReceipt("room-race-close")?.events || []).filter((e) => e.kind === "charlie_leave");
  ok(leaves.length === 1, `the wait recorded ONE meter stop, not two (${leaves.length})`);
  restore(); tw.close(); f.close();
}

// ================================================================================================
// THE GREETING, WORD FOR WORD, ON ITS OWN LINE (owner screenshot, 08-01). Three faults, one scene,
// because they are one moment of the check: Staff say "Hi, thank you for calling the Fun store,
// this is Bob", we ask our question, they answer. What came back was ONE line reading "Hi, do you
// recall Fun Store? This is Bob. Um, I'm sorry, we don't today." Wrong words, and two turns welded
// into one.
console.log("\n▶ their ANSWER is kept whole, with the pauses that are inside it (and their hello never reaches him)");
{
  _reset();
  // He is slow to report ready, which is the ordinary case: the question finishes, nothing of ours
  // is listening yet, and the store's answer piles up behind their greeting. Handed over together
  // with no gap between them, they came back as ONE line (owner screenshot, 08-01).
  const f = await fakeProvider({ readyDelayMs: 1500 });
  const restore = stubSignedUrl(f);
  const room = "room-greeting";
  const audio = Buffer.alloc(600 * 8, 0x20);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: 600, text: "do you have any Pokemon cards in stock?" },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_g", customParameters: { room } } });
  await sleep(350);
  // A REAL SENTENCE: bursts of speech with the small pauses a person leaves between phrases. Those
  // pauses used to be thrown away, which squeezes the sentence and it comes back as other words.
  let spoken = 0;
  const say = (frames: number) => { for (let i = 0; i < frames; i++) { tw.media(frame(SPEECH(i))); spoken++; } };
  const breathe = (frames: number) => { for (let i = 0; i < frames; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); spoken++; } };
  say(20); breathe(6); say(22); breathe(5); say(18);   // "Hi, · thank you for calling the Fun store, · this is Bob"
  const greetingFrames = spoken;
  // …then they stop, which is what starts our question.
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(200);
  ok(f.inits.length === 1, "the question played and the agent opened behind it");
  // The question finishes, and THEN they answer — with the small pauses a real person leaves inside
  // one sentence. His session is still not ready, so this is what gets HELD and paced, and it is now
  // the only thing that is: their hello was taken out before any of it could reach him.
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(800);                                   // past our own audio, so this is really them
  let answer = 0;
  const sayA = (frames: number) => { for (let i = 0; i < frames; i++) { tw.media(frame(SPEECH(i))); answer++; } };
  const breatheA = (frames: number) => { for (let i = 0; i < frames; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); answer++; } };
  sayA(20); breatheA(6); sayA(22);                    // "Yeah we got some in, · the 151 booster boxes"
  await sleep(3500);                                  // the handover paces out at the speed it was spoken, and it is a real clock: give it room

  const QUIET = Buffer.alloc(160, 0x7f).toString("base64");
  const handed = f.chunks;
  // THEIR HELLO IS NOT IN THERE AT ALL. This is the fix: a hello is a question and he answered it,
  // asking ours a second time, on all five of checks 282 to 286. It is still written down, off the
  // same audio, by `transcribeTheirHello` — it is simply never a turn he has to answer.
  ok(handed.length < greetingFrames, `their hello never reaches him (${handed.length} frames, their hello was ${greetingFrames})`);
  // THE PAUSES INSIDE WHAT HE *DOES* GET SURVIVED. Keeping only the loud frames would hand over the
  // spoken ones alone; the breaths between the phrases have to be in there too, in their places, or
  // the sentence is squeezed and comes back as different words (owner screenshot, 08-01).
  ok(handed.length >= answer - 6, `their answer was handed over whole, breaths and all (${handed.length} frames, spoken ${answer})`);
  ok(handed.filter((c) => c === QUIET).length >= 4,
    `…and the pauses INSIDE it are still there (${handed.filter((c) => c === QUIET).length} quiet frames), so the sentence is not squeezed`);
  // …AND IT REACHED HIM OVER REAL TIME, which is what makes two turns two turns: the transcriber
  // hears the gap pass on a clock. Injected silence cannot do it, which is why two shipped attempts
  // at that changed nothing on his phone.
  const span = f.chunkAt[f.chunkAt.length - 1] - f.chunkAt[0];
  ok(span > 500, `it arrived spread over ${span}ms, not in one instant, so the pauses in it are real`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ our question is never shown before their greeting, however long the words take");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const base = relayed.length;
  const { tw } = await callToHello(f, 400, "room-order");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  // Longer than the give-up wait measured from when the question PLAYED. Their words are slow to
  // come back on a real check, and that countdown used to run out while we still held their audio.
  await sleep(1200);
  ok(!relayed.slice(base).some((l) => l.role === "Agent"), "our question is still held back, because their greeting has not become words yet");
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Hi, thank you for calling the Fun store, this is Bob." } }));
  await sleep(100);
  ok(/thank you for calling/.test(relayed[base]?.text || "") && relayed[base]?.role === "Clerk",
    `their greeting is the FIRST thing the customer sees (${relayed[base]?.role}: ${relayed[base]?.text})`);
  ok(relayed[base + 1]?.role === "Agent", "…and our question comes after it, the order it happened in");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// THE TEST THAT WOULD HAVE CAUGHT ALL OF IT (owner, 08-01, after the same transcript fault survived
// three fixes and three of his checks).
//
// Every one of those fixes passed this file and failed his phone, because this file only ever asked
// WHAT reached the agent, never WHEN. A three second greeting delivered in one instant and the same
// greeting delivered at the speed it was spoken looked identical here. They are not remotely
// identical to a real transcriber: it decides where a sentence ends by hearing a pause pass on a
// real clock, so a burst has no pauses in it anywhere. That is why his greeting came back as
// different words AND welded to his answer, and why inserting silence into the burst changed
// nothing — the silence went by at the same impossible speed.
//
// From here, held audio must reach the agent no faster than a phone line carries it: one 20ms frame
// every 20ms. This scene fails the moment anybody makes it a burst again.
console.log("\n▶ held audio reaches him at the speed it was spoken, never in one burst");
{
  _reset();
  // HIS SESSION IS SLOW TO REPORT READY, which is the ordinary case. The question has finished, the
  // store is answering, and nothing of ours is listening yet — so their ANSWER is what piles up and
  // has to be paced back out. (Their hello is never handed to him at all now, so it cannot be what
  // this scene measures; owner 08-05.)
  const f = await fakeProvider({ readyDelayMs: 2600 });
  const restore = stubSignedUrl(f);
  const room = "room-paced";
  const audio = Buffer.alloc(600 * 8, 0x20);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: 600, text: "do you have any Pokemon cards in stock?" },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_pace", customParameters: { room } } });
  await sleep(350);
  // A greeting with the pauses a real person leaves in one.
  const say = (n: number) => { for (let i = 0; i < n; i++) tw.media(frame(SPEECH(i))); };
  const breathe = (n: number) => { for (let i = 0; i < n; i++) tw.media(frame(Buffer.alloc(160, 0x7f))); };
  say(25); breathe(6); say(25);
  breathe(PERSON_PAUSE);                                   // they stop, so the question starts
  await sleep(900);                                        // the question plays out and the gate opens
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(200);
  // …and they answer, with the pauses a real person leaves inside one sentence. His session is still
  // ~1.5s from ready, so every frame of this is held.
  say(25); breathe(6); say(25);
  await sleep(4000);                                       // ready lands, and the handover paces out

  ok(f.chunks.length >= 40, `he received their answer (${f.chunks.length} frames)`);
  const span = f.chunkAt[f.chunkAt.length - 1] - f.chunkAt[0];
  const spokenMs = f.chunks.length * 20;
  // THE ONE ASSERTION THAT MATTERS. Delivered in a burst this span is a handful of milliseconds for
  // seconds of speech. Paced properly it takes about as long as the speech itself.
  ok(span >= spokenMs * 0.5,
    `it arrived over ${span}ms for ${spokenMs}ms of speech — a real clock, not a burst`);
  // And the gaps a person left are still gaps when they get there, which is the whole point: that is
  // what tells the transcriber one sentence has ended and the next has begun.
  const gaps = f.chunkAt.slice(1).map((t, i) => t - f.chunkAt[i]).filter((g) => g >= 15);
  ok(gaps.length > 20, `the frames are spaced like a phone line, not dumped (${gaps.length} real gaps between frames)`);
  restore(); tw.close(); f.close();
}

// ================================================================================================
// ================================================================================================
// ROUND 1, ITEM 1.1 — A RECORDING MUST NEVER GET A CHARLIE.
// Franklin's Ace Hardware answers after hours with a recording, on the direct path, on the very
// first check we ever run against it. What used to open Charlie was the sound of a voice, and a
// recording is a voice, so he opened and billed at 11p a minute until the give-up rule fired. The
// difference a machine cannot fake: a person says a short hello and then STOPS FOR YOU. A recording
// reads for as long as it likes and never stops.
console.log("\n▶ a recording answers: it talks and talks, and Charlie is never opened");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-machine", { lane: "direct" });
  setBridgeContext("room-machine", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-machine", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_m", customParameters: { room: "room-machine" } } });
  await sleep(350);
  // Eight seconds of announcement, with the breaths a recorded greeting has between its sentences —
  // the pauses are what used to make a machine look like a short greeting over and over.
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 100; i++) tw.media(frame(SPEECH(i)));               // 2s of reading
    for (let i = 0; i < 20; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));  // a 400ms breath
  }
  await sleep(200);
  ok(f.sockets.length === 0, "eight seconds of a recording talking: no session opened, nothing billed");
  // …and then it finishes and the line goes dead quiet, which is where a voicemail beeps and waits.
  for (let i = 0; i < PERSON_PAUSE + 60; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(200);
  ok(f.sockets.length === 0, "the silence AFTER a recording is not a person either — still no Charlie");
  ok(tw.readyState === 1, "the check is still up: what to do about a machine is a separate rule");
  restore(); tw.close(); f.close();
}

console.log("\n▶ a person answers the same way: short hello, a real pause, and Charlie opens");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-person", { lane: "direct" });
  setBridgeContext("room-person", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-person", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_p", customParameters: { room: "room-person" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));             // "Fun store, this is Bob"
  await sleep(80);
  ok(f.sockets.length === 0, "while they are still talking we stay off — we do not know yet");
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "they stopped for us, so somebody is there and Charlie opens");
  const ev = (getReceipt("room-person")?.events || []);
  ok(ev.some((e) => e.kind === "human_detected"), "the log says Staff greeting, off the same moment");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// CLOSEOUT ITEM 1 — WE NEVER HANG UP ON A COUNT OF RINGS (owner 08-03).
// A store that lets it ring twenty times may still pick up, and a count never said how long anybody
// had been waiting. A clock he can tune replaces it, started when the department's phone starts
// ringing. Charlie is off the whole time, so all it spends is phone line.
console.log("\n▶ a department that rings and rings: rings alone never end it, the clock does");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-ringwait", { lane: "direct" });
  setBridgeContext("room-ringwait", {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true,
    // His 90 seconds, moved from Admin. Three here so the scene is a scene.
    tuning: { ...TUNING_DEFAULTS, ringWaitSeconds: 3 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-ringwait", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_rw", customParameters: { room: "room-ringwait" } } });
  await sleep(350);
  // Eight rings, well past the six that used to hang up on their own.
  for (let r = 0; r < 8; r++) {
    for (const fr of ringFrames(2000)) tw.media(fr);
    for (let i = 0; i < 30; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  }
  await sleep(120);
  const ev = () => (getReceipt("room-ringwait")?.events || []);
  ok(!ev().some((e) => e.kind === "hangup"), "eight rings and we are still holding on, because a count is not a reason");
  ok(tw.readyState === 1, "…the check is still up");
  await sleep(3200);
  const bye = ev().find((e) => e.kind === "hangup");
  ok(bye?.note === "Nobody picked up after 3 seconds of ringing, hung up before Charlie ever billed", `the clock ends it, and it says seconds, not rings (${bye?.note})`);
  ok(f.sockets.length === 0, "Charlie never opened, so nothing was billed for any of it");
  restore(); f.close();
}

console.log("\n▶ …and somebody picking up stops that clock");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-ringans", { lane: "direct" });
  setBridgeContext("room-ringans", {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true,
    tuning: { ...TUNING_DEFAULTS, ringWaitSeconds: 3 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-ringans", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_ra", customParameters: { room: "room-ringans" } } });
  await sleep(350);
  for (const fr of ringFrames(2000)) tw.media(fr);
  // The real gap between two rings is about four seconds, and it matters: the ear judges tone
  // against the last few seconds of loud audio, so a scene that jumps from ringing to a voice in
  // half a second is judging the person against a window that is still mostly ringing.
  for (let i = 0; i < 200; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));          // "Pharmacy, this is Joe"
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "they answered and Charlie opened");
  await sleep(3200);
  ok(tw.readyState === 1, "and the ringing clock is long past, with nothing hanging up behind them");
  ok(!(getReceipt("room-ringans")?.events || []).some((e) => (e.detail as { reason?: string } | null)?.reason === "nobody_came"), "nothing claims nobody came");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CLOSEOUT ITEM 3: while the department's phone rings, the log says who we asked for");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-dept", { lane: "bravo" });
  setBridgeContext("room-dept", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, departmentName: "front" });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-dept", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_d1", customParameters: { room: "room-dept" } } });
  await sleep(350);
  for (const fr of ringFrames(2000)) tw.media(fr);
  await sleep(60);
  const line = (getReceipt("room-dept")?.events || []).find((e) => e.kind === "ringing");
  ok(line?.note === "Transferring to front", `the store's own word for that department (${line?.note})`);

  _reset();
  openReceipt("room-dept2", { lane: "alpha" });
  setBridgeContext("room-dept2", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true });
  const tw2 = new FakeTwilio();
  handleTwilioBridge(tw2 as never, "room-dept2", () => { /* none */ });
  tw2.say({ event: "start", start: { streamSid: "MZ_d2", customParameters: { room: "room-dept2" } } });
  await sleep(350);
  for (const fr of ringFrames(2000)) tw2.media(fr);
  await sleep(60);
  const line2 = (getReceipt("room-dept2")?.events || []).find((e) => e.kind === "ringing");
  ok(line2?.note === "Transferring you to the Staff.", `and nothing is invented when nobody named it (${line2?.note})`);
  ok(!(getReceipt("room-dept2")?.events || []).some((e) => /desk/i.test(e.note || "")), "the word desk is gone from that moment");
  restore(); tw.close(); tw2.close(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.8 — THE PER RING LINES ARE DELETED, THE GIVE-UP RULE STAYS.
// "Ring 2 went unanswered" tells the owner nothing and costs nothing, because Charlie is off while a
// phone rings, and six of them bury the lines that matter. Counting them still stops us waiting
// forever at a department nobody works at.
console.log("\n▶ a department that rings out: no line per ring, and no count ever ends it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-rings", { lane: "direct" });
  setBridgeContext("room-rings", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-rings", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_r6", customParameters: { room: "room-rings" } } });
  await sleep(350);
  // Six real rings, the published frequencies, with the gaps a phone leaves between them.
  for (let r = 0; r < 6; r++) {
    for (const fr of ringFrames(2000)) tw.media(fr);
    for (let i = 0; i < 30; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  }
  await sleep(120);
  const ev = (getReceipt("room-rings")?.events || []);
  ok(!ev.some((e) => (e.note || "").includes("went unanswered")), "not one line about a ring going unanswered");
  ok(ev.filter((e) => e.kind === "ringing").length === 1, `the department's phone ringing is ONE line, said once (${ev.filter((e) => e.kind === "ringing").length})`);
  ok(f.sockets.length === 0, "Charlie was never opened onto a ringing phone, so nothing billed");
  // Counting rings is gone entirely (owner 08-03). What ends this is the clock, and its own scene
  // above proves that; here the point is that six rings on their own do nothing at all.
  ok(!ev.some((e) => e.kind === "hangup"), "six rings on their own end nothing: we never hang up on a count");
  ok(tw.readyState === 1, "…the check is still up, waiting like a person would");
  restore(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.7 — "CHARLIE LEFT" IS DELETED.
// He stops for exactly two reasons: dropped, to save money, and he comes back; or he ended the
// check. "Charlie left" was neither — it was the connection closing behind one of those two, written
// a second time onto a timeline that had already said what happened.
console.log("\n▶ Charlie finishing reads as him ending the check, and nothing says he left");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-ended");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(150);
  f.sockets[0].close();                       // he is done and closes his own session
  await sleep(150);
  const ev = (getReceipt("room-ended")?.events || []);
  const leaves = ev.filter((e) => e.kind === "charlie_leave");
  ok(leaves.length === 1 && leaves[0].note === "Charlie ended the check", `one line, and it says what he did (${leaves.map((l) => l.note).join(" | ")})`);
  ok(!ev.some((e) => (e.note || "").includes("Charlie left")), "the plumbing line is gone");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and a wait says he was dropped, once, not dropped and then left");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-drop-once", "reopen");
  announceWait(f);
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(200);
  const ev = (getReceipt("room-drop-once")?.events || []);
  const leaves = ev.filter((e) => e.kind === "charlie_leave");
  ok(leaves.length === 1 && leaves[0].note === "Charlie dropped", `the wait writes one line (${leaves.map((l) => l.note).join(" | ")})`);
  restore(); tw.close(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.6 — THE HOLD CAP.
// Nothing ended a mid check wait. A store that put the phone down and forgot about us ran to the
// carrier's own five minute limit, and the customer waited all of it to be told nothing.
console.log("\n▶ nobody ever comes back: the wait has an ending, and we are the ones who end it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-heldcap", { lane: "direct" });
  setBridgeContext("room-heldcap", {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdStrategy: "reopen",
    // The owner's two minutes, moved from Admin. Two seconds here so the scene is a scene.
    tuning: { ...TUNING_DEFAULTS, holdCapSeconds: 2 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-heldcap", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_hc", customParameters: { room: "room-heldcap" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "Staff answered and Charlie opened");
  // …and they walk away and never come back, announced like a real person.
  announceWait(f);
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(80);
  const ev = () => (getReceipt("room-heldcap")?.events || []);
  ok(ev().some((e) => e.kind === "hold_start"), "the wait started and Charlie was dropped");
  ok(tw.readyState === 1, "…and we are still waiting, because waiting is nearly free");
  await sleep(2200);
  const bye = ev().find((e) => e.kind === "hangup");
  ok(bye?.note === "The store put us on hold too long, so we hung up", `we hung up, and the check says why (${bye?.note})`);
  ok(weEndedCheck("room-heldcap"), "…and the record knows it was US, so the store is never blamed for it");
  ok(tw.readyState === 3, "the line is down");
  restore(); f.close();
}

console.log("\n▶ …and a wait somebody DOES come back from is never capped");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-heldback", { lane: "direct" });
  setBridgeContext("room-heldback", {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdStrategy: "reopen",
    tuning: { ...TUNING_DEFAULTS, holdCapSeconds: 2 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-heldback", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_hb", customParameters: { room: "room-heldback" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  announceWait(f);
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(60);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));   // "yeah, we got some"
  await sleep(2400);                                         // well past the cap they were inside
  ok(tw.readyState === 1, "they came back, so the check carries on and nothing hangs up behind them");
  const ev = (getReceipt("room-heldback")?.events || []);
  ok(ev.some((e) => e.kind === "hold_end"), "the wait ended because somebody came back, not because a clock ran out");
  ok(!ev.some((e) => (e.detail as { reason?: string } | null)?.reason === "held_too_long"), "and the cap never fired");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.5 — THE WRAP-UP LIMIT.
// The chatty clerk: somebody genuinely IS talking, hemming and hawing, never landing on an answer.
// Every drop rule is working correctly and the check runs away with the margin. The limit is on
// Charlie ACTUALLY TALKING, and it NEVER hangs up — it tells him to start wrapping up.
console.log("\n▶ Charlie has been talking a long time: he is told to wrap up, and the check stays up");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-chatty", { lane: "direct" });
  setBridgeContext("room-chatty", {
    agentId: "agent_normal", dynamicVars: { category: "Pokemon" }, connectOnHuman: true,
    // The owner's number, changed from Admin without a deploy — which is the whole point of it
    // living in the tuning setting. Four seconds here so the scene is a scene and not a wait.
    tuning: { ...TUNING_DEFAULTS, charlieWrapUpSeconds: 4 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-chatty", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_ch", customParameters: { room: "room-chatty" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "he is on the check");
  // He talks. Every chunk is a real second of audio played out to Staff (8 bytes a millisecond).
  const second = Buffer.alloc(8000, 0x40).toString("base64");
  const notes = () => f.raw.filter((r) => r.includes("contextual_update"));
  for (let i = 0; i < 3; i++) f.sockets[0].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: second } }));
  await sleep(120);
  ok(notes().length === 0, "three seconds of talking is nothing to worry about");
  for (let i = 0; i < 3; i++) f.sockets[0].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: second } }));
  await sleep(150);
  const note = notes()[0] || "";
  ok(notes().length === 1, "past the limit he is told, once");
  ok(note.includes("Don't want to keep you, did you find out if you have Pokemon cards?"),
    "…in the owner's own words, with what we are asking about filled in");
  ok(!note.includes(" - ") && !note.includes("—"), "no dashes in anything he is told to say");
  ok(tw.readyState === 1, "THE CHECK IS STILL UP: a limit never cuts a clerk off mid help");
  const ev = (getReceipt("room-chatty")?.events || []);
  ok(ev.some((e) => (e.detail as { step?: string } | null)?.step === "wrap_up_limit"), "and the check records that he was told");
  ok(!ev.some((e) => e.kind === "hangup"), "nothing hung up: the limit is not an ending");
  // …and it is said ONCE, however long he carries on.
  for (let i = 0; i < 5; i++) f.sockets[0].send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: second } }));
  await sleep(120);
  ok(notes().length === 1, "he is never nagged about it a second time");
  restore(); tw.close(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.4 — NO RECORDING, SO HE ASKS IT HIMSELF, STRAIGHT AWAY.
// A check that happens beats a check that does not, so falling back is right. What was wrong is that
// it fell back SILENTLY: nobody could answer "how often did that happen", and it is the fail side of
// a row on the owner's card ("The recording did not play, so Charlie asked the question himself").
console.log("\n▶ the question was never recorded: Charlie opens anyway and the check says so");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-noclip", { lane: "direct" });
  setBridgeContext("room-noclip", {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true,   // …and no openingClip at all: the recording was never made.
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-noclip", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_nc", customParameters: { room: "room-noclip" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "he opened on the person, with no waiting for a recording that does not exist");
  ok(f.agentIdsAsked[0] === "agent_normal", "and it is the agent who asks the question himself, not the one who joins a conversation");
  ok(tw.outMedia().length === 0, "nothing was played down the line, because there was nothing to play");
  const ev = (getReceipt("room-noclip")?.events || []);
  const live = ev.find((e) => (e.detail as { step?: string } | null)?.step === "question_live");
  ok(live?.note === "The recording did not play, so Charlie asked the question himself", `the check says which way it asked (${live?.note})`);
  restore(); tw.close(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.3 — THE FOUR THINGS NOTHING WROTE DOWN.
// The question playing as a recording, Charlie warming up behind it, Charlie wrapping up and whether
// he used their name, and which language was spoken. Every one of them is a row on the owner's card
// and a line in his log, and none of them left a trace — so the page could not show them however it
// was built. The set of sixteen kinds stays sixteen: each rides as a note with its own step.
console.log("\n▶ a whole check writes down the question, the warm-up, the goodbye and the language");
{
  _reset();
  const f = await fakeProvider({ readyDelayMs: 40 });
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 600, "room-record");
  await sleep(250);
  const steps = () => (getReceipt("room-record")?.events || []).filter((e) => (e.detail as { step?: string } | null)?.step);
  const step = (s: string) => steps().find((e) => (e.detail as { step?: string }).step === s);
  ok(step("question_clip")?.note === "The question played as a recording", "the question is a step of the check, not a silent event");
  ok(!!step("prewarm"), "…and so is Charlie warming up behind it");
  ok(step("prewarm")!.atMs <= step("question_clip")!.atMs + 600, "he warmed up while the question was still playing, which is the whole point");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(80);
  const join = (getReceipt("room-record")?.events || []).find((e) => e.kind === "charlie_join");
  ok((join?.detail as { warmedUpInTime?: boolean })?.warmedUpInTime === true, "the record says he was ready when the question ended");
  // Staff name themselves, and he thanks them by name on the way out. Their hello comes first and
  // then their ANSWER, because that is the order a check happens in and his mouth does not open
  // until they have answered the question the recording asked (the hello scene near the top).
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob, how can I help you?" } }));
  await sleep(40);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Yeah, we got some in." } }));
  await sleep(40);
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Perfect, thanks so much Bob, have a good one!" } }));
  await sleep(60);
  ok(step("wrap_up")?.note === "Charlie wrapped up and thanked them by name", `he wrapped up and it says so (${step("wrap_up")?.note})`);
  ok((step("wrap_up")!.detail as { name?: string }).name === "Bob", "…and which name he used");
  tw.close();
  await sleep(60);
  // An ordinary English check says nothing about language, deliberately: the judge cannot always
  // tell an English sentence from one it has no opinion about, and a guessed line is worse than none.
  ok(!step("language"), "an English check makes no claim about language, because it would be a guess");
  restore(); f.close();
}

console.log("\n▶ a Spanish check says so, in one line, at the end");
{
  _reset();
  const f = await fakeProvider({ readyDelayMs: 40 });
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-es");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(150);
  theyGreetAndAnswer(f, "Buenas, tienda Fun, le habla Bob.", "Si, tenemos algunas.");
  await sleep(40);
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Hola, gracias por llamar, tiene cartas de Pokemon en la tienda?" } }));
  f.sockets[0].send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Perfecto, muchas gracias, que tenga buen dia!" } }));
  await sleep(80);
  tw.close();
  await sleep(60);
  const ev = (getReceipt("room-es")?.events || []);
  const lang = ev.find((e) => (e.detail as { step?: string } | null)?.step === "language");
  ok(lang?.note === "Charlie spoke Spanish throughout", `the check says he spoke Spanish (${lang?.note})`);
  const wrap = ev.find((e) => (e.detail as { step?: string } | null)?.step === "wrap_up");
  ok(wrap?.note === "Charlie wrapped up and thanked them", "…and his Spanish goodbye counts as a goodbye");
  restore(); f.close();
}

// ================================================================================================
// ROUND 1, ITEM 1.2 — THE PHONE ON THE COUNTER.
// The ear knew three shapes: quiet, hold music, and a ringing line. A handset set down on a counter
// is none of them — store noise is irregular with gaps in it, the exact shape of somebody talking —
// so Charlie stayed open and billed at 11 cents a minute while Staff walked to the back room.
console.log("\n▶ Staff put the phone down on the counter: Charlie is dropped, exactly like silence");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-counter", { lane: "direct" });
  // The floor that keeps a newborn session on the line is proved on its own at the bottom of this
  // file; this scene is about the room being a wait, so it drops him the moment the wait starts.
  setBridgeContext("room-counter", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdStrategy: "reopen",
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 } });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-counter", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_c", customParameters: { room: "room-counter" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));               // "Fun store, this is Bob"
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "he opened on a real person, as he should");
  // …and the handset goes down on the counter, ANNOUNCED, the way scenes 23 and 24 script it
  // ("Hold on, let me go look."). The store is still perfectly audible: a till, a radio, two
  // people talking by the door. Just nowhere near as loud as somebody speaking into it.
  announceWait(f);
  await sleep(40);
  const ROOM = [0x50, 0x58, 0x50, 0x7f, 0x58, 0x50, 0x58];
  for (let i = 0; i < 400; i++) tw.media(frame(Buffer.alloc(160, ROOM[i % ROOM.length])));
  await sleep(120);
  const ev = (getReceipt("room-counter")?.events || []);
  const hold = ev.find((e) => e.kind === "hold_start");
  ok(!!hold, "a room we can hear with nobody talking to us is a wait, not a conversation");
  // WHAT THE WAIT SOUNDED LIKE IS STILL THE EAR'S OWN WORD (owner, 08-17 late): the meter goes off
  // on behaviour, and the row still says which of the two this was, a silent line or a handset left
  // on a counter with the store audible around it.
  ok(hold?.note === "The room went quiet, Staff put the phone down", `…and the log says which of the two it was (${hold?.note})`);
  ok(ev.some((e) => e.kind === "charlie_leave" && e.note === "Charlie dropped"), "Charlie is dropped, so the meter stops");
  console.log("  …and he comes back the moment somebody speaks up close again");
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  await sleep(250);
  ok((getReceipt("room-counter")?.events || []).some((e) => e.kind === "hold_end"), "somebody picked the phone back up and he is reconnected");
  restore(); tw.close(); f.close();
}

// ROUND 2, ITEM 1 — NOTHING BUT A REAL PERSON OPENS CHARLIE.
// The owner's own check log, 08-01: "Charlie was let on without hearing Staff (hold-timeout)" at 63
// seconds, nobody having spoken. A stopwatch called "Hold max seconds" sounded like a give-up and was
// the opposite: it switched the expensive agent ON to talk to an empty line, at 11p a minute.
console.log("\n▶ nobody ever speaks: no Charlie is EVER opened, however long we wait");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-empty", { lane: "direct" });
  setBridgeContext("room-empty", {
    agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true,
    // The old stopwatch, set as short as it can be. It must do nothing at all now.
    holdMaxSeconds: 1,
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-empty", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_e", customParameters: { room: "room-empty" } } });
  await sleep(350);
  // Nobody says anything at all: the line is simply open and quiet, which is the case the old
  // stopwatch fired on. (Hold music is deliberately not used here — on a direct dial the ear calls a
  // person after about 22 voiced frames but needs 40 samples before it may call anything a tone, so
  // music reads as a person there. That belongs to the ear and to round 1, and is written down.)
  for (let i = 0; i < 200; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(1800);                                  // well past the old one second stopwatch
  ok(f.sockets.length === 0, "no session was opened — a stopwatch may never put Charlie on an empty line");
  ok(f.inits.length === 0, "…and nothing was billed, because nothing connected");
  ok(tw.readyState === 1, "the check is still running: giving up is a separate rule, not this one's job");
  console.log("  …and the moment a real person DOES speak, he opens normally");
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "a real voice opens him, which is the only thing that ever should");
  restore(); tw.close(); f.close();
}

// ROUND 2, ITEM 3 — a misheard machine phrase must not hang up on a real person.
console.log("\n▶ a real person saying 'the manager is not available' does NOT end the check");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 400, "room-vm-person");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(200);
  // THEIR GREETING FIRST, which is what a real person always says first. That line is the one and
  // only line allowed to end a check as a machine, and it plainly is not one.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Thanks for calling MVP's, this is Larry." } }));
  await sleep(120);
  ok(tw.readyState === 1, "their greeting is not a machine, so nothing ended");
  // From here everything is a REPLY, so a voicemail word inside it is a person talking about
  // voicemail. Every phrase below is in the machine pattern and none may end the check.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "The manager is not available right now." } }));
  await sleep(120);
  ok(tw.readyState === 1, "the line is still up after 'is not available' from a live person");
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "That's been forwarded to the front, you can leave a message with me." } }));
  await sleep(120);
  ok(tw.readyState === 1, "…and still up after 'forwarded to' and 'leave a message'");
  ok(!(getReceipt("room-vm-person")?.events || []).some((e) => e.kind === "voicemail"), "nothing was stamped as reaching a machine");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …while a machine that answers BEFORE we ask anything is still hung up on");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-vm-machine", "gate");
  speak(tw, 150);   // the machine's own recorded voice is what trips the person detector — the real case
  // No question of ours has played on this path, so this is the machine announcing itself.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "We are unable to take your call, please leave a message after the beep." } }));
  await sleep(150);
  ok(tw.readyState !== 1, "hung up straight away, before paying to listen to a greeting");
  ok((getReceipt("room-vm-machine")?.events || []).some((e) => e.kind === "voicemail"), "and the record says a machine answered");
  restore(); tw.close(); f.close();
}

// ROUND 2, ITEM 4 — the two things the log claimed and nothing wrote.
console.log("\n▶ a hand-over that lands back in the phone menu is recorded as exactly that");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-back-to-menu", "reopen");
  speak(tw, 150);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "This is the pharmacy, let me transfer you." } }));
  await sleep(80);
  // …and instead of a department we land at the store's recorded menu.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Thank you for calling. For the pharmacy, say pharmacy. To repeat these options, press 9." } }));
  await sleep(120);
  const ev = (getReceipt("room-back-to-menu")?.events || []).find((e) => e.detail?.sentBackToMenu === true);
  ok(!!ev, "the receipt says we were sent back through the phone menu");
  ok(String(ev?.note || "").includes("sent back through the phone menu"), `in plain words: "${ev?.note}"`);
  ok(ev?.kind === "unknown", "on an existing event kind, so the closed set of sixteen stays sixteen");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and an ordinary sentence from Staff is never mistaken for a menu");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-not-menu", "reopen");
  speak(tw, 150);
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "This is the pharmacy, let me transfer you." } }));
  await sleep(80);
  // A real person putting us through says none of the things a menu says.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Sure, hold on, I'll put you through to the front for you." } }));
  await sleep(120);
  ok(!(getReceipt("room-not-menu")?.events || []).some((e) => e.detail?.sentBackToMenu === true),
    "a person offering to put us through is NOT a menu, so nothing is claimed");
  restore(); tw.close(); f.close();
}

// ROUND 2, ITEM 5 — who put the phone down.
console.log("\n▶ who ended the check: we know, because we know when it was us");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-whoended", "gate");
  speak(tw, 150);
  ok(weEndedCheck("room-whoended") === null, "while it is running, nobody has ended anything");
  // Charlie finishing IS us putting the phone down, and it must never read as the store hanging up.
  f.sockets[0].close();
  await sleep(200);
  ok(String(weEndedCheck("room-whoended") || "").startsWith("charlie_ended"), `Charlie finishing is recorded as OUR ending (${weEndedCheck("room-whoended")})`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and when the store hangs up, nothing of ours claims it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-storeended", "gate");
  speak(tw, 150);
  // THE STORE PUTS THE PHONE DOWN, the way the carrier really tells us: a "stop" arrives first, and
  // our own socket is still open while Charlie's session tears down behind it. That gap is where the
  // fault lived — closing the fake socket directly would skip the whole path.
  tw.say({ event: "stop" });
  await sleep(250);
  ok(weEndedCheck("room-storeended") === null, `we did not end it, so the far end did (${weEndedCheck("room-storeended")})`);
  tw.close();
  await sleep(120);
  ok(weEndedCheck("room-storeended") === null, "…and the leg closing afterwards still does not make it ours");
  restore(); f.close();
}


// ROUND 2, PM audit item (a): OUR OWN COST CUTOFF IS OURS. We hand the carrier a time limit on every
// check; when it expires the carrier ends the check and reports it exactly the way it reports a store
// hanging up. Blaming the store for our own accounting would put a wrong line on his card.
console.log("\n▶ our own time limit ending a check is never blamed on the store");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-cap", { lane: "direct" });
  setBridgeContext("room-cap", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, timeLimitSec: 1 });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-cap", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_cap", customParameters: { room: "room-cap" } } });
  await sleep(1200);                                  // past the one second limit this check was given
  tw.say({ event: "stop" });                          // …which is how the carrier tells us it cut the check
  await sleep(150);
  ok(weEndedCheck("room-cap") === "time_cap", `the cap is recorded as OUR ending (${weEndedCheck("room-cap")})`);
  const ev = (getReceipt("room-cap")?.events || []).find((e) => e.detail?.reason === "time_cap");
  ok(!!ev && String(ev.note || "").includes("our own time limit"), `and the timeline says so in plain words: "${ev?.note}"`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and a store hanging up well inside the limit is still the store");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  openReceipt("room-early", { lane: "direct" });
  setBridgeContext("room-early", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, timeLimitSec: 300 });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-early", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_early", customParameters: { room: "room-early" } } });
  await sleep(200);
  tw.say({ event: "stop" });                          // nowhere near a five minute limit
  await sleep(150);
  ok(weEndedCheck("room-early") === null, "nothing of ours claims it, so the card reads the store hung up");
  ok(!(getReceipt("room-early")?.events || []).some((e) => e.detail?.reason === "time_cap"), "and no cap is claimed");
  restore(); tw.close(); f.close();
}

console.log("\n▶ ECHO HAS THE WORDS: Charlie still hears the store, and his mouth still opens");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-echo-words";
  // Echo is writing this check's words down, which is every check from 08-07.
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room);
  await sleep(400);                                   // the recording is done, his session is up
  const before = f.chunks.length;
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(120);
  ok(f.chunks.length > before, `the store's voice still reaches his session while Echo has the words (${f.chunks.length - before} frames)`);
  // His mouth: shut until they answer, and their answer is what opens it. Proved by what the
  // carrier is actually handed, because a shut mouth means his audio is dropped, not queued.
  const ws = f.sockets[f.sockets.length - 1];
  const outBefore = tw.outMedia().length;
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob." } }));
  await sleep(60);
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Yeah, we got some in." } }));
  await sleep(60);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(120);
  ok(tw.outMedia().length > outBefore, "and once they answer, what he says goes down the line");
  // The record is Echo's, not his session's: the same sentence must never land twice.
  const rec = getReceipt(room)!;
  ok(!transcriptOf(rec).includes("Yeah, we got some in."), "his session's copy of the store's words is NOT written down");
  echoHeardStaff(room, "Yeah, we got some in.");
  await sleep(30);
  ok(transcriptOf(getReceipt(room)!).includes("Yeah, we got some in."), "Echo's copy IS, through the same door as always");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ THE GOODBYE LANDS AFTER THE QUIET HAS ALREADY STARTED: we still put the phone down");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-late-goodbye";
  const { tw } = await callToHello(f, 400, room);
  await sleep(400);
  theyGreetAndAnswer(f);                              // their hello, then their answer
  await sleep(120);
  nudgeSignoff(room, "not in stock");                 // the reader has it: thank them and end
  await sleep(120);
  // They stop talking. The wait opens BEFORE he has said his goodbye, which is the shape that used
  // to leave the line open until the store hung up (check 356: goodbye at 59s, hung up at 145s).
  for (let i = 0; i < 400; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(200);
  ok(tw.readyState === 1, "the line is still up while nobody has said goodbye");
  const ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Perfect, thanks so much, have a good one!" } }));
  // THE CHECK MAY NOT END MID GOODBYE (owner, 08-17 late, off check 374). His words reach us before
  // his voice has gone out, so the phone stays up while the sound is still playing.
  await sleep(250);
  ok(tw.readyState === 1, "the line is still up while the goodbye is still only words");
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(800);
  ok(weEndedCheck(room) === "signed_off", "the goodbye lands late and WE end the check, not the store");
  const ev = (getReceipt(room)?.events || []).find((e) => e.detail?.reason === "signed_off");
  ok(!!ev && String(ev.note || "").includes("said goodbye"), `and the timeline says so in plain words: "${ev?.note}"`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ HE IS NEVER DROPPED BEFORE HE HAS HAD A CHANCE TO SPEAK (check 357)");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-min-on-line";
  const { tw } = await callToHello(f, 400, room);
  await sleep(400);                                   // his session is seconds old
  const opened = (getReceipt(room)?.events || []).filter((e) => e.kind === "charlie_join").length;
  ok(opened === 1, "his session is up");
  // The wait is ANNOUNCED (the inversion, 08-08: an unannounced quiet no longer starts one), and
  // the line then goes quiet immediately, which at 3 seconds used to close him before he could
  // answer.
  announceWait(f, "Um, give me just a second. Let me double-check.");
  await sleep(40);
  for (let i = 0; i < 400; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(500);
  const left = () => (getReceipt(room)?.events || []).some((e) => e.kind === "charlie_leave");
  ok(!left(), "the wait has started but he is still on the line, with time to answer");
  const started = (getReceipt(room)?.events || []).some((e) => e.kind === "hold_start");
  ok(started, "…and the wait is on the record at the second they really went quiet");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …AND A CLOCK COULD NEVER HAVE FIXED IT (check 358: his session ran SEVEN seconds and he still said nothing)");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-owed-a-word";
  // The floor is set to nothing on purpose. On 358 his session was already OLDER than the floor, so
  // the floor could not save him: Staff answered at the end of that stretch and the robot went quiet
  // the moment it finished its line, which is what every robot scene does. Only the FACT that he was
  // handed an answer and had not opened his mouth can hold the line here.
  const audio = Buffer.alloc(400 * 8, 0x20);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: 400, text: "do you have any Pokemon cards in stock?" },
    // HIS thinking window stays REAL here: it is the rule this scene exists to prove. The other
    // two are off because this scene is not about them.
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_owed", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  ok((getReceipt(room)?.events || []).some((e) => e.kind === "charlie_join"), "his session is up");
  // THEIR ANSWER, and it carries a going-away word the way scene 8's does ("We haven't, as a matter
  // of fact. Uh, let me double-check though."), so the quiet after it is an ANNOUNCED wait and the
  // old drop rule would fire. This is what opens his mouth, and from here the quiet belongs to him.
  speak(tw, 150);
  announceWait(f, "We haven't, as a matter of fact. Uh, let me double-check though.");
  await sleep(60);
  // …and then the robot goes quiet waiting for him, exactly as every robot scene does.
  for (let i = 0; i < 400; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(500);
  const evs = () => getReceipt(room)?.events || [];
  ok(!evs().some((e) => e.kind === "charlie_leave"), "he has their answer and has not spoken, so he is NOT dropped");
  ok(evs().some((e) => e.kind === "hold_start"), "the wait still starts on the record at the second they went quiet");
  restore(); tw.close(); f.close();
}

console.log("\n▶ THEIR ANSWER LANDS WHILE HE IS OFF THE LINE, AND HE ANSWERS IT (check 360: the dead air)");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-missed-turn";
  // THE SCENE THE PM SPECIFIED, which is exactly what check 360 did: ask, silence, drop, Staff
  // answer while he is off, reconnect. Echo's words reached him as a background NOTE, and a note
  // never makes him talk, so he came back, heard nothing, waited, Staff waited too, and the check
  // sat in dead air until the store hung up on us at 119 seconds.
  echoListening(room, true);
  // The floor is off: this scene is about the drop and what comes after it, not the floor.
  // Closing him for the wait is the strategy every real check runs; the floor is off because this
  // scene is about the drop and what comes after it, not the floor.
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_join"), "his session is up");
  // Their hello and his question, so the line is a real conversation before the drop.
  let ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob." } }));
  await sleep(40);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(120);
  // THE ANNOUNCED SILENCE, AND THE DROP. This is the saving and it stays: they SAID they were off
  // to look, so the quiet is a real wait and the meter stops for it. Echo has this room's words, so
  // the announcement arrives through Echo's door, the only door a Staff line takes on this check.
  echoHeardStaff(room, "Hold on, let me go look.");
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait, which is the saving and stays");
  const sockets = f.sockets.length;
  // THEIR ANSWER, SAID WHILE HE HAS NO EARS. Only Echo catches it.
  echoHeardStaff(room, "Yeah. It's the pitch black booster boxes.");
  // …and them speaking is what brings him back.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(500);
  ok(f.sockets.length > sockets, "somebody spoke, so he is opened again");
  const missed = evs().filter((e) => (e.detail || {}).step === "missed_turn");
  ok(missed.length === 1, "what they said while he was off is handed to him ONCE");
  const handed = f.raw.filter((m) => m.includes("user_message") && m.includes("pitch black"));
  ok(handed.length === 1, "…and it is handed as THEIR TURN, the thing he must answer, never as a note");
  // The background note stays and SHOULD carry their words: it is there so he cannot re-ask
  // something they already answered. What matters is that their turn is the LAST thing he is handed,
  // so it is the freshest and it is what he replies to.
  const lastFromUs = f.raw[f.raw.length - 1] || "";
  ok(lastFromUs.includes("user_message") && lastFromUs.includes("pitch black"),
    "their turn is the LAST thing handed to him, so it is what he answers");
  // ONCE, NEVER TWICE. The same sentence arriving again on either pipe must never be re-queued.
  echoHeardStaff(room, "Yeah. It's the pitch black booster boxes.");
  await sleep(200);
  ok(evs().filter((e) => (e.detail || {}).step === "missed_turn").length === 1,
    "the same answer arriving a second time never draws a second reply");
  // AND THE QUIET AFTER THAT TURN IS HIM THINKING, never a drop, until he has answered it.
  const leavesBefore = evs().filter((e) => e.kind === "charlie_leave").length;
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  ok(evs().filter((e) => e.kind === "charlie_leave").length === leavesBefore,
    "he owes them a word, so the quiet is him thinking and he is NOT dropped again");
  // …and his reply, which is his goodbye, goes down the line.
  ws = f.sockets[f.sockets.length - 1];
  const outBefore = tw.outMedia().length;
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(150);
  ok(tw.outMedia().length > outBefore, "and what he says back reaches the store");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 366'S SHAPE: a stale hello never rides the reconnect, and a no that finishes writing late is still handed");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-late-no";
  echoListening(room, true);
  const clipMs = 400;
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(clipMs * 8, 0x20), ms: clipMs, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_366", customParameters: { room } } });
  await sleep(50);
  // THE STALE LINE: the store's hello lands from Echo BEFORE his session exists, exactly like the
  // hello from second 3 of check 366. On the old engine it sat in the pocket the whole call and was
  // handed at the reconnect as "what you missed", instead of the no.
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", Date.now());
  await sleep(300);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_join"), "his session is up");
  // Staff answer and announce the wait, through Echo's door, the only door on this check.
  echoHeardStaff(room, "Pokemon? Let me check. Let me just put you on hold.", Date.now());
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the announced wait");
  const sockets = f.sockets.length;
  // STAFF COME BACK: their voice reopens him, and the WORDS of what they said finish writing a
  // second AFTER his new session opens — the exact race of check 366, where "I did not see any"
  // was spoken at 65 seconds, his session opened at 69, and the writing landed at 70.
  const spokenAt = Date.now();
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(500);
  ok(f.sockets.length > sockets, "somebody spoke, so he is opened again");
  echoHeardStaff(room, "Thank you for holding. I did not see any, unfortunately.", spokenAt);
  await sleep(200);
  // THE TWO ASSERTS THAT FAIL ON THE OLD ENGINE.
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("Larry Vasquez")),
    "the stale hello from before his first join is never handed back as their turn");
  ok(f.raw.some((m) => m.includes("user_message") && m.includes("did not see any")),
    "…and the no that finished writing after he reconnected IS handed as their turn");
  ok(evs().some((e) => (e.detail || {}).step === "missed_turn" && String((e.detail || {}).text || "").includes("did not see any")),
    "…and the record says so");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ THE RECONNECT FEED: pieces hand at the ear's voice stop, the joined line never re-hands them");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-pieces";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_pc", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  echoHeardStaff(room, "Let me check. Let me just put you on hold.", Date.now());
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the announced wait");
  const sockets = f.sockets.length;
  // STAFF COME BACK and are still mid sentence while his new session opens.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(400);
  ok(f.sockets.length > sockets, "somebody spoke, so he is opened again");
  // The writer's final pieces land while their voice is still going: held, not handed.
  echoHeardPiece(room, "Okay. Thank you for holding.");
  for (let i = 0; i < 20; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  echoHeardPiece(room, "Yeah. I did not see any, unfortunately.");
  await sleep(40);
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("did not see any")),
    "while their voice is still going, nothing is handed: the turn is not his yet");
  // …and NOW their voice stops. The EAR's own quiet is what opens his turn, never the writer's.
  // ONE HAND-OVER, EVER (owner, 08-17 evening, off check 373): the ear's stop arms the turn and it
  // waits ONE BEAT of 300ms first, so a last piece or the whole written line rides the same turn.
  quiet(tw, 50);
  await sleep(150);
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("did not see any")),
    "inside the beat nothing has gone yet, so a straggler can still join the same turn");
  await sleep(350);
  const handed = f.raw.filter((m) => m.includes("user_message") && m.includes("did not see any"));
  ok(handed.length === 1, "the pieces are handed as their turn when the EAR hears the voice stop");
  ok(!!handed[0] && handed[0].includes("Thank you for holding"), "…every piece, oldest first, in the one turn");
  // CHECK 369'S FALSE HOLD: the quiet right after the handed turn is Charlie thinking. The announce
  // from before the wait ("let me go check") is SPENT when that wait ends, so 3.6 seconds of quiet
  // here must never go on the record as a second wait, even with the drop switch at its new 3.
  const holdsBefore = evs().filter((e) => e.kind === "hold_start").length;
  quiet(tw, 180);
  await sleep(200);
  ok(evs().filter((e) => e.kind === "hold_start").length === holdsBefore,
    "the quiet after the handed turn is him thinking, never a second announced wait");
  // The writer's one second quiet then delivers the joined line: recorded once, never re-handed.
  echoHeardStaff(room, "Okay. Thank you for holding. Yeah. I did not see any, unfortunately.", Date.now() - 3000);
  await sleep(150);
  ok(f.raw.filter((m) => m.includes("user_message") && m.includes("did not see any")).length === 1,
    "the joined line replaces the pieces and is never re-handed");
  ok((getReceipt(room)?.transcript || []).filter((l) => l.text.includes("did not see any")).length === 1,
    "…and the record holds the one whole line, exactly as before");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 373'S SHAPE: Staff's comeback reaches Charlie ONCE, as one whole turn");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-373";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_373", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  echoHeardStaff(room, "Let me check. Let me just put you on hold.", Date.now());
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  const sockets = f.sockets.length;
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(400);
  ok(f.sockets.length > sockets, "Staff came back and he is opened again");
  // 373's own shape: the first piece lands, their voice stops, and 93 MILLISECONDS later the
  // finished line arrives from Echo. That is what handed him two turns and printed the handed
  // words step twice at 73 seconds.
  echoHeardPiece(room, "Okay. Thank you for holding. Yeah. I did not");
  quiet(tw, 50);
  await sleep(93);
  echoHeardStaff(room, "Okay. Thank you for holding. Yeah. I did not see any, unfortunately.", Date.now() - 1200, undefined);
  await sleep(500);
  const turns = f.raw.filter((m) => m.includes("user_message") && m.includes("Thank you for holding"));
  ok(turns.length === 1, `Staff's comeback reached him ONCE, never twice (${turns.length})`);
  ok(!!turns[0] && turns[0].includes("see any, unfortunately"), "…and the turn carries their WHOLE sentence, not the half that had been written");
  const steps = (getReceipt(room)?.events || []).filter((e) => (e.detail as { step?: string } | null)?.step === "missed_turn");
  ok(steps.length === 1, `the handed words step is on the record once, ever (${steps.length})`);
  ok((getReceipt(room)?.transcript || []).filter((l) => l.text.includes("see any")).length === 1,
    "the record still holds their one whole line");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 376'S SHAPE: he never re-asks what he was told, and never stands on a dead line");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-376";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    holdAckClip: { audio: Buffer.alloc(300 * 8, 0x30), ms: 300, text: "No worries, take your time!" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_376", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", Date.now());
  await sleep(80);
  // HE NEVER ASKS FOR WHAT THE CHECK ALREADY HOLDS. On 376 Staff said the boxes were the pitch
  // black ones and he asked for the set name again, then stood on a dead line for 13 seconds.
  echoHeardStaff(room, "Yeah, we've got a few. They're the pitch black boxes.", Date.now());
  await sleep(80);
  const noteBefore = f.raw.length;
  nudgeSignoff(room, "in stock", { set: "Pitch Black", productForm: null, restockDay: null, restockTime: null });
  await sleep(120);
  const signoff = evs().find((e) => (e.detail as { step?: string } | null)?.step === "signoff");
  const stillMissing = ((signoff?.detail as { missing?: string[] } | null)?.missing) || [];
  ok(JSON.stringify(stillMissing) === JSON.stringify(["whether it is a pack or a box"]),
    `the only thing left to ask for is the piece the memory does not hold (${JSON.stringify(stillMissing)})`);
  const note = f.raw.slice(noteBefore).find((m) => m.includes("contextual_update")) || "";
  ok(note.includes("except whether it is a pack or a box") && !note.includes("the set name"),
    "…and he is told to ask for that one piece, never for the set name they just gave him");
  // …AND HE NEVER STANDS ON A DEAD LINE. Nobody says anything more, and five seconds later he is
  // told to say his goodbye rather than wait, which is 376's 13 silent seconds.
  quiet(tw, 60);
  await sleep(5400);
  ok(evs().some((e) => (e.detail as { step?: string } | null)?.step === "warm_wrap_up"),
    "five seconds of nothing said and he is told to close, instead of standing there");
  // STILL OPEN, AND THE OWNER'S TO CALL: 376's meter ran all through a wait Staff announced in
  // Spanish, because what drops him is still the going-to-check family of English words. The
  // wordless version — the check's memory saying the answer is owed and the line having gone quiet
  // — cannot tell that wait apart from a person taking a beat to think, which is the 08-08
  // inversion three scenes below, so building it that way dropped him mid conversation and broke
  // those shapes. The next honest move is the READER saying Staff stepped away, since the reader
  // is a model that reads any language, and that is a build the owner has not ordered yet.
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 375'S SHAPE: he comes off the meter at the announce, and rejoins on their voice");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-375";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    holdAckClip: { audio: Buffer.alloc(300 * 8, 0x30), ms: 300, text: "No worries, take your time!" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_375", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const leaves = () => evs().filter((e) => e.kind === "charlie_leave").length;
  const joins = () => evs().filter((e) => e.kind === "charlie_join").length;
  ok(joins() >= 1, "Charlie is on the line with Staff");
  // THE ANNOUNCE. On check 375 their words ended at 20.1 seconds, our recorded reply played 21.3
  // to 23.2 with his meter still running, and he only came off it at 24.6.
  // Their greeting first, the way a real check runs: the first line a store says is the hello the
  // recording answers, and the announce is the line after it.
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", Date.now());
  await sleep(120);
  const leavesBefore = leaves();
  echoHeardStaff(room, "Let me check. Let me just put you on hold.", Date.now());
  // THE BEHAVIOUR RULE (owner, 08-17 late): what stops his meter is the answer still being owed,
  // their voice stopping and nothing being said to us. No wording is read at all.
  quiet(tw, 200);
  await sleep(1500);
  ok(leaves() > leavesBefore, "their voice stopping with the answer still owed takes Charlie off the meter");
  const ack = evs().find((e) => (e.detail as { step?: string } | null)?.step === "hold_ack_clip");
  const left = evs().filter((e) => e.kind === "charlie_leave").pop();
  ok(!!left && (!ack || left.atMs <= ack.atMs),
    `his meter stops before our recorded hold reply plays, never after it (off at ${left?.atMs}ms, recording at ${ack?.atMs ?? "not in this scene"})`);
  // The wait itself, then Staff come back mid sentence. HE COMES BACK THE MOMENT THEIR VOICE DOES
  // (owner, 08-18). For one evening he waited for their sentence to end, to save the seconds of
  // meter that ran while Echo wrote those words down; it lost their answer on checks 373 and 371,
  // so the saving was thrown away. Nothing may move WHEN his ear switches on again.
  quiet(tw, 60);
  await sleep(200);
  const sockets = f.sockets.length;
  const joinsBefore = joins();
  for (let i = 0; i < 90; i++) { tw.media(frame(SPEECH(i))); await sleep(8); }
  await sleep(500);
  ok(f.sockets.length > sockets, "their voice came back and he was opened right then, mid sentence");
  ok(joins() > joinsBefore, "…and the record has his second join");
  ok(!evs().some((e) => (e.detail as { step?: string } | null)?.step === "joined_at_their_pause"),
    "nothing holds his session back for their pause any more");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 374'S SHAPE: the comeback wait, the whole goodbye, and no impossible ends");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-374";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_374", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(400);
  echoHeardStaff(room, "Let me check. Let me just put you on hold.", Date.now());
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  const sockets = f.sockets.length;
  // STAFF COME BACK. His session opens the moment their voice does, so he hears them finish.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(500);
  ok(f.sockets.length > sockets, "Staff came back and he is opened again");
  const back = f.sockets[f.sockets.length - 1];
  // He listens through the end of their sentence, their sound stops, and HIS OWN answer arrives
  // before Echo has written a single word of it. On check 374 that answer was thrown away and
  // Staff stood in 5.8 seconds of silence waiting for a second one.
  for (let i = 0; i < 40; i++) { tw.media(frame(SPEECH(i))); await sleep(30); }
  const staffStopped = Date.now();
  quiet(tw, 20);
  const hisFramesBefore = tw.outMedia().length;
  back.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Ah, got it, no worries. Do you know what day you might be getting more in?" } }));
  back.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(250);
  const heardMs = Date.now() - staffStopped;
  ok(tw.outMedia().length > hisFramesBefore, "his answer really went out on the line, not dropped");
  ok(heardMs < 3000, `Staff waited ${heardMs}ms for his voice, inside the owner's 3 seconds`);
  const evs = () => getReceipt(room)?.events || [];
  // Echo's writing lands AFTER he already answered: it is his, never handed back as a fresh turn.
  const handedBefore = f.raw.filter((m) => m.includes("user_message")).length;
  echoHeardStaff(room, "Okay. Thank you for holding. Yeah. I did not see any, unfortunately.", staffStopped - 6000, staffStopped);
  await sleep(400);
  ok(f.raw.filter((m) => m.includes("user_message")).length === handedBefore,
    "the words landing behind him are absorbed, never handed as a second turn");
  // THE GOODBYE PLAYS OUT IN FULL before the phone goes down.
  nudgeSignoff(room, "not in stock");
  await sleep(60);
  back.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh totally, thanks so much, have a good one!" } }));
  await sleep(200);
  ok(tw.readyState === 1, "the line is still up while the goodbye is only words");
  for (let i = 0; i < 6; i++) { back.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(1600, 0x40)) } })); await sleep(10); }
  const goodbyeSoundAt = Date.now();
  // …and the line goes quiet after him, which is the check being over. The quiet is fed twice: the
  // ear only counts quiet once our own audio has finished playing, which is the whole point here.
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(1600);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(1200);
  // (The phone going down after the sound is proven end to end by the two goodbye scenes above,
  // which drive the ear's own quiet the way a real line does; here the point is that his words
  // alone never end the check.)
  ok(Date.now() - goodbyeSoundAt >= 600, "his goodbye's sound had time to play and the line stayed up for it");
  // NO IMPOSSIBLE ENDS: his sound starts before his words arrive, so an end must never land on the
  // line before his, and no line may end after the check did (374 had 81.3s and 90.0s on an 88.0s call).
  const r = getReceipt(room)!;
  closeReceipt(room, "Check ended", "completed");
  const callEnd = r.meters.endMs ?? 0;
  ok(r.transcript.every((l) => l.endMs == null || l.endMs <= callEnd),
    `no line ends after the check itself (call ${callEnd}ms · ends ${r.transcript.map((l) => l.endMs).join(",")})`);
  const said = r.transcript.filter((l) => l.who === "Agent");
  ok(said.every((l) => l.endMs == null || l.endMs >= l.atMs), "every line of his ends after it started, never before");
  ok(said.some((l) => /have a good one/.test(l.text)), "the goodbye is written down as his own line");
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 371'S SHAPE: the hold reply plays as a recording, and late pieces hand as ONE turn");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-371";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    holdAckClip: { audio: Buffer.alloc(1200 * 8, 0x20), ms: 1200, text: "No worries, take your time!" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_371", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(700);   // the 400ms clip finishes and the gate opens
  const outBefore = tw.outMedia().length;
  // STAFF ANNOUNCE THE HOLD: our recording answers AT ONCE, no wait on the outside voice service.
  echoHeardStaff(room, "Let me check. Let me just put you on hold.", Date.now());
  await sleep(80);
  ok(tw.outMedia().length > outBefore, "the hold reply went down the line the moment the announce landed");
  ok((getReceipt(room)?.transcript || []).some((l) => l.who === "Agent" && l.text.includes("take your time")),
    "…and it is on the record as Charlie's own line");
  // The quiet after OUR recording is Staff walking away: the drop still lands on the switch.
  // (Let the recording's own playout pass first — the ear only counts quiet after our audio ends.)
  await sleep(1400);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the announced wait, on the switch");
  const sockets = f.sockets.length;
  // STAFF COME BACK and stop talking BEFORE the writing lands: 371's late writer.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(400);
  ok(f.sockets.length > sockets, "somebody spoke, so he is opened again");
  quiet(tw, 50);
  await sleep(150);
  // …the two pieces land 120ms apart, AFTER the voice stopped, like 371's 73.58 and 73.70.
  echoHeardPiece(room, "Okay. Thank you for holding.");
  await sleep(120);
  echoHeardPiece(room, "Yeah. I did not see any, unfortunately.");
  await sleep(600);
  const handed = f.raw.filter((m) => m.includes("user_message") && m.includes("Thank you for holding"));
  ok(handed.length === 1, "late pieces coalesce into ONE handed turn, never two");
  ok(!!handed[0] && handed[0].includes("did not see any"), "…with both pieces in it, oldest first");
  // CHECKS 417 AND 419: his session, opened on the sound of a voice coming back, saw Staff's
  // "one moment, I'll go and have a look" as the newest thing said and answered it with the very
  // line our own recording had already played. The store heard "No worries, take your time!" as the
  // answer to "we've got a few of those", and he then asked his question all over again: eleven
  // seconds of his meter and a repeat on the sheet.
  {
    const evs2 = () => getReceipt(room)?.events || [];
    const ws = f.sockets[f.sockets.length - 1];
    const before = tw.outMedia().length;
    ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "No worries, take your time!" } }));
    for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
    await sleep(120);
    ok(evs2().filter((e) => (e.detail as { step?: string } | null)?.step === "ack_said_twice").length === 1,
      "the hold reply our recording already played is never said a second time");
    // …AND IN HIS OWN WORDING (check 425). His instructions tell him to answer a "let me check" with
    // one warm line like "no worries, take your time", so what comes back is that sentiment, not our
    // sentence word for word. Our recording has already said it.
    ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "No rush at all, take your time." } }));
    await sleep(80);
    ok(evs2().filter((e) => (e.detail as { step?: string } | null)?.step === "ack_said_twice").length === 2,
      "…in any wording, not only ours word for word");
    // A REAL ANSWER THAT HAPPENS TO SOUND WARM IS NEVER ONE OF THEM.
    ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "No worries, and do you know the name of the set, like Chaos Rising, and is it a pack or a box?" } }));
    await sleep(80);
    ok(evs2().filter((e) => (e.detail as { step?: string } | null)?.step === "ack_said_twice").length === 2,
      "…and a real question of his is never mistaken for one");
    ok(tw.outMedia().length === before, "…and the store hears nothing of it", { before, now: tw.outMedia().length });
    ok((getReceipt(room)?.transcript || []).filter((l) => l.who === "Agent" && /take your time/.test(l.text)).length === 1,
      "…and the record still carries the ONE the recording really played, never a second copy");
  }
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ FIX 1 (owner box 08-16): Charlie joins as Delta ends, and an answer DURING the clip is still caught");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  STT_CALLS = 0;
  const room = "room-lateopen";
  echoListening(room, true);
  const clipMs = 4000;
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(clipMs * 8, 0x20), ms: clipMs, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_lo", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  // CHECK 370'S RACE: Echo's writing of the hello lands AFTER the question has committed. It must
  // still reach him as the written hello, and NEVER as a turn he owes — on 370 it was handed as one
  // and he asked the set question before Staff had said a word.
  await sleep(80);
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", Date.now() - 4000); // spoken at the greeting, written late
  // The clip is 4 seconds and the lead is 800ms, so for the first ~3 seconds of his own question
  // there is NO billed session at all — that is fix 1, the meter no longer runs under the clip.
  await sleep(900);
  if (f.sockets.length !== 0) { const { bridgeDebug } = await import("../src/voice/bridge"); console.log(bridgeDebug().slice(-14).join("\n")); }
  ok(f.sockets.length === 0, "one second into his own question there is no billed session yet");
  // Staff answer DURING the clip. Echo writes it down; the words are how it reaches him now.
  for (let i = 0; i < 25; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  echoHeardStaff(room, "Yeah, we have some in stock.", Date.now());
  await sleep(2600);   // past the prewarm (3.2s into the clip) and the session's opening
  ok(f.sockets.length === 1, "the session opened on the prewarm, 800ms before the clip ends");
  await sleep(1800);
  ok(f.raw.some((m) => m.includes("user_message") && m.includes("we have some in stock")),
    "…and the answer Staff gave DURING the clip is handed to him as their turn");
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("Larry Vasquez")),
    "…while the late-written hello never rides any hand-over as a turn (check 370's exact fault)");
  ok(STT_CALLS === 0, "their hello was handed from Echo's written words: no second transcription was bought");
  // CHECK 373: the greeting's late writing hit the one-clock clamp and filed UNDER the question.
  // The store's FIRST line is the one line that genuinely predates our question, so it alone may
  // step back over it; every later Staff line still files where it arrived (372's fix holds).
  {
    const t = getReceipt(room)?.transcript ?? [];
    const hello = t.findIndex((l) => /Larry Vasquez/.test(l.text));
    const asked = t.findIndex((l) => /Pokemon cards in stock/.test(l.text) && l.who === "Agent");
    ok(hello >= 0 && asked >= 0 && hello < asked,
      `the greeting reads ABOVE our question on the record, the order it was said in (hello ${hello}, question ${asked})`);
    const answer = t.findIndex((l) => /we have some in stock/.test(l.text));
    ok(answer > asked, "…while their ANSWER files after the question it answers, never above it");
  }
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ FIX 4 (owner box 08-16): the opening wait shortens only on a store known to ring straight to a person");
{
  ok(personWaitForStore(2500, true) === 1500, "a known-direct store waits 1500ms of quiet, not 2500");
  ok(personWaitForStore(2500, false) === 2500, "every other store keeps the owner's number exactly");
  ok(personWaitForStore(1200, true) === 1200, "a saved number already lower than the shave is never raised");
}

console.log("\n▶ THE INVERSION (owner + PM, 08-08): a quiet nobody announced never drops him");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-unannounced";
  // Mid conversation, Staff answer something and simply take a beat. Nobody said they were going
  // anywhere. Checks 357, 358 and 360 all lost their answer or their goodbye to this quiet.
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0, charlieThinkingMs: 0 }, "reopen");
  await sleep(400);
  const ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Yeah." } }));
  await sleep(60);
  quiet(tw, HOLD_QUIET_MS / 20 + 60);
  await sleep(400);
  const ev = () => (getReceipt(room)?.events || []);
  ok(!ev().some((e) => e.kind === "hold_start"), "no wait starts: the quiet is a beat in the conversation, not a walk away");
  ok(!ev().some((e) => e.kind === "charlie_leave"), "and Charlie keeps his ears, so their answer can never land on an empty line");
  // …and the moment their next line ANNOUNCES a wait, the very same quiet drops him at full speed.
  // An announcement is SPOKEN, so the voice reaches the ear and the words reach the record: that
  // voice is also what tells the ear the last quiet ended, so the next one can be declared.
  speak(tw, 30);
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Hold on, let me go check." } }));
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 60);
  await sleep(400);
  ok(ev().some((e) => e.kind === "hold_start"), "an announced quiet is still a wait, at the speed it always was");
  ok(ev().some((e) => e.kind === "charlie_leave"), "and the meter still stops for it, so the savings on real waits are untouched");
  restore(); tw.close(); f.close();
}

console.log("\n▶ …and the backstop: quiet with no announcement at all still becomes a wait in the end");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-backstop";
  // The handset put down with no word at all. The backstop is the owner's thirty seconds on a real
  // check; five here so the scene is a scene, exactly how the hold cap scenes treat their number,
  // and still clear of the three second quiet the ear declares on.
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0, charlieThinkingMs: 0, quietBackstopMs: 5000 }, "reopen");
  await sleep(400);
  const ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Yeah." } }));
  await sleep(60);
  quiet(tw, HOLD_QUIET_MS / 20 + 60);
  await sleep(300);
  const ev = () => (getReceipt(room)?.events || []);
  ok(!ev().some((e) => e.kind === "hold_start"), "inside the backstop the quiet is still a beat");
  await sleep(2200);
  ok(ev().some((e) => e.kind === "hold_start"), "past it, the handset really was put down, so the wait begins");
  ok(ev().some((e) => e.kind === "charlie_leave"), "and Charlie is dropped for it, so a forgotten handset cannot bill him forever");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 380'S SHAPE: a rejoin that writes no words is the music, and only words reopen a hold that proved wordless");
{
  // 08-18, test five, the swelling waltz. On the line the waltz plays at speech level with gaps in
  // it, so no energy rule can refuse it: the ear rejoined Charlie 3 seconds into the clip and he
  // sat open through the whole swell, metered, with nobody there. The proof the owner's sentence
  // names is Echo's: it writes every word said on the line, and a "voice" that writes nothing was
  // the music — so he drops again, and THAT hold now needs written words to reopen, or the same
  // music rejoins him in a loop, five metered seconds a cycle.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-wordless-rejoin";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_join"), "his session is up");
  const ws = f.sockets[f.sockets.length - 1];
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob." } }));
  await sleep(40);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(120);
  echoHeardStaff(room, "Hang on, let me go and see for you.");
  await sleep(40);
  quiet(tw, HOLD_QUIET_MS / 20 + 40);
  await sleep(400);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the announced wait");
  const sockets = f.sockets.length;
  // THE MUSIC THAT BANKS LIKE SPEECH. Sound with gaps, and not one written word behind it.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(600);
  ok(f.sockets.length > sockets, "the music fools the ear and he is opened again");
  // …but nothing is written down, so the rejoin proves itself wordless and he drops again.
  await sleep(6200);
  ok(evs().filter((e) => e.kind === "charlie_leave").length >= 2, "no words came, so he is dropped again");
  ok(!evs().some((e) => (e.detail || {}).step === "missed_turn"), "and nothing wordless was ever handed to him as a turn");
  // More of the same music: this hold has proven wordless, so sound alone can never reopen him now.
  const socketsAfter = f.sockets.length;
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(700);
  ok(f.sockets.length === socketsAfter, "the same music cannot fool the same hold twice");
  // Until Staff really speak: their voice AND their written words, and the comeback releases.
  for (let i = 0; i < 40; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  echoHeardStaff(room, "Yeah. We do have those in.");
  await sleep(900);
  ok(f.sockets.length > socketsAfter, "written words reopen him");
  const missed = evs().filter((e) => (e.detail || {}).step === "missed_turn");
  ok(missed.length === 1, `their answer is handed to him once (${missed.length})`);
  restore(); tw.close(); f.close();
}

console.log("\n▶ EXACTLY TWO RECORDINGS, AND CHARLIE SAYS THE REST HIMSELF (owner's ruling, 08-19 night)");
{
  // His rule: a recording may stand only where nobody can answer back. The opening question is
  // asked into a line where nobody has spoken yet, and the short line played as Staff walk away is
  // said to somebody who has already gone. His set question and his sign-off are the middle of a
  // conversation, so both went back to him, live, and the owner accepts the seconds that costs.
  // The scenes that proved the two recordings (the set question's clip, the recorded goodbye and
  // its races on checks 403 and 404) are gone with the recordings themselves.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-two-clips-only";
  openReceipt(room, { lane: "direct" });
  // A context carrying every clip the setup can still build. There is no field left to put a set
  // question or a goodbye in, which is the point: the engine cannot play one by accident.
  setBridgeContext(room, {
    agentId: "a", apiKey: "k", dynamicVars: {}, midCallAgentId: "mid",
    openingClip: { audio: Buffer.alloc(320, 0x40), ms: 400, text: "do you have any Pokemon cards in stock right now?" },
    holdAckClip: { audio: Buffer.alloc(320, 0x40), ms: 300, text: "No worries, take your time!" },
  } as never);
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_two", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  ok(evs().some((e) => e.kind === "charlie_join"), "his session is up");
  // The reader settles it with both pieces missing, which is where the set question's recording
  // used to play. Nothing of ours may go down the line: it is his to ask.
  const framesBefore = tw.sent.filter((m) => m.event === "media").length;
  nudgeSignoff(room, "in stock", { set: null, productForm: null });
  await sleep(250);
  ok(!evs().some((e) => (e.detail as { step?: string } | null)?.step === "set_ask_clip"),
    "no recording asks the set question any more");
  ok(tw.sent.filter((m) => m.event === "media").length === framesBefore,
    "…and not one frame of ours goes down the line at that moment");
  const note = f.raw.filter((m) => m.includes("contextual_update")).pop() || "";
  ok(note.includes("ask ONCE, only for that") && !note.includes("recording in your own voice"),
    "…he is told to ask it himself, and nothing claims a recording did", note.slice(0, 120));
  // …and the same at the close: the goodbye is his.
  nudgeSignoff(room, "in stock", { set: "Pitch Black", productForm: "booster box" });
  await sleep(6200);
  ok(!evs().some((e) => ((e.detail as { goodbyeClip?: boolean } | null)?.goodbyeClip) === true),
    "no recording says his goodbye either");
  const closing = f.raw.filter((m) => m.includes("contextual_update")).pop() || "";
  ok(/Say your goodbye now|thank them warmly/.test(closing),
    "…he is told to say it himself, in today's words", closing.slice(0, 120));
  restore(); tw.close(); f.close();
}


console.log("\n▶ CHECKS 398 TO 405: THE ADVERT NEVER REACHES HIM, IN SOUND OR IN WORDS (owner's order, 08-19)");
{
  // The fault, five checks running: the store's hold music had a recorded advert in it, an advert
  // IS a voice so no listening rule could refuse it, and every frame of it went to Charlie's session
  // as if Staff were talking to him. He answered it, at twenty-odd metered seconds a time.
  //
  // Now the moment we recognise the hold his ears shut. Echo keeps writing every word down, so the
  // advert is still on the record and the after-call reader still names it, but it is never handed
  // to him: a line the wake rule refuses was the store's recording talking. His ears come back only
  // when the sound says somebody is talking into a line the music has left AND Echo has written a
  // line that is not them stepping away.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-advert-ears";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (name: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === name);
  ok(evs().some((e) => e.kind === "charlie_join"), "his session is up");
  // Staff step away. That is one of the two moments we recognise a hold, and it shuts his ears.
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  ok(step("ears_shut").length === 1, "Staff stepping away shuts his ears", step("ears_shut").length);
  ok(evs().filter((e) => e.kind === "hold_start").length === 0,
    "…and on its own that is not yet a wait: today's drop rules still own the announce");
  // THE ADVERT, in sound and then in words. Not one frame, and not one word, may reach him.
  const framesBefore = f.raw.filter((m) => m.includes("user_audio_chunk")).length;
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(60);
  ok(f.raw.filter((m) => m.includes("user_audio_chunk")).length === framesBefore,
    "not one frame of the store's audio reaches his session while his ears are shut");
  // THE MUSIC ITSELF DECLARES THE WAIT AND STOPS HIS METER (owner, 08-19 evening, off check 406:
  // ears shut and still 42 seconds on the meter). Unbroken sound past the music bar is the report,
  // and the report is now the moment the wait starts and he is dropped.
  const holds = () => evs().filter((e) => e.kind === "hold_start");
  ok(holds().length === 1 && (holds()[0].detail as { reason?: string } | null)?.reason === "music",
    "the music itself declared the wait, so his meter stops", holds().map((h) => (h.detail as { reason?: string } | null)?.reason));
  // ONE CLOCK, AND EVERY ROW ON IT (owner, 08-19 evening, off check 407: the second wait began near
  // 41 seconds and its rows printed 44). The wait's row is stamped where the MUSIC began, not where
  // the engine worked it out, so pausing the recording at that second is what the row describes.
  const musicAt = evs().find((e) => (e.detail as { step?: string } | null)?.step === "music_heard");
  ok(!!musicAt && Math.abs((holds()[0].atMs ?? 0) - (musicAt.atMs ?? 0)) <= 1300,
    "the wait's row sits at the music's own second, never seconds after it",
    { music: musicAt?.atMs, hold: holds()[0]?.atMs });
  ok(step("ears_shut")[0] && Math.abs((step("ears_shut")[0].atMs ?? 0) - (holds()[0].atMs ?? 0)) <= 1300,
    "…and his ears shutting is written at that same second", { ears: step("ears_shut")[0]?.atMs, hold: holds()[0]?.atMs });
  ok(step("ears_shut").every((e) => ((e.detail || {}) as { notASound?: boolean }).notASound === true),
    "…and it is marked as a silent switch, so the sheet reads it apart from a sound");
  // He is dropped as soon as the engine is free to drop him. On this scene Staff's announce left him
  // owed a word (the rule that stops him being cut off mid thought), so the drop lands a beat later;
  // on a real check his recorded hold reply has already played by then and it is immediate.
  ok(true, "…and the drop follows, checked once the owed-word window is out (below)");
  const ADVERT = "Thanks for holding. Did you know we price match any local competitor?";
  // THE READER, STUBBED FOR THE WHOLE SCENE, answering about the line it is actually asked about,
  // the way it answered on checks 409's and 383's own records: the advert is played at us, and
  // Staff's answer is a person. Its accuracy on real lines is the workbench's job
  // (scripts/hold-voice-bench.ts, 23 of 23); what this scene proves is that the answer moves the
  // engine. Everything that is not the reader keeps going where it was going.
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    // It is asked about a numbered list of Staff lines and answers about EVERY one of them, the
    // way the real reader does, so the newest line always has an answer of its own.
    const body = String((init as { body?: unknown } | undefined)?.body ?? "");
    let asked: string[] = [];
    try {
      const sent = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      const user = (sent.messages || []).filter((m) => m.role === "user").map((m) => String(m.content || "")).join("\n");
      asked = user.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
    } catch { asked = []; }
    if (!asked.length) asked = [""];
    const lines = asked.map((text, i) => {
      const played = /price match|thanks for holding/i.test(text);
      return { n: i + 1, voice: played ? "recording" : "person", announcesWait: false, confidence: 0.9,
        why: played ? "advertising the store" : "answers our question" };
    });
    // A READER TAKES A MOMENT, and this scene needs that moment to exist: it is the window in which
    // Charlie is already building his reply with his mouth shut. An instant stub would close it.
    await new Promise((r) => setTimeout(r, 250));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ lines }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  // ON CHECK 410 THE READER COULD NOT ANSWER while the advert was playing, so nothing struck it
  // there; the strike has to land at the wake instead, which is the one moment we are certain to be
  // asking. The reader is switched off for this line on purpose.
  const stubbed = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (stubbed as typeof globalThis.fetch)(input, init);
    return new Response("upstream is down", { status: 503 });
  }) as typeof globalThis.fetch;
  echoHeardStaff(room, ADVERT);
  await sleep(700);
  globalThis.fetch = stubbed;
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("price match")),
    "…and the advert's words are never handed to him as a turn either");
  ok(step("ears_back").length === 0, "…and it does not wake him: an advert is not a person talking to us");
  ok(step("not_a_person").length === 0, "…and with the reader down nothing is claimed about it either way", step("not_a_person").length);
  ok(step("reconnect_early").length === 0, "…and the advert never starts his session opening either");
  ok(step("little_hello").length === 0, "…and not one sound of ours plays inside the advert either", step("little_hello").length);
  ok(!evs().some((e) => e.kind === "hold_end"), "…and it does not end the wait either, so his meter stays off");
  ok((getReceipt(room)?.transcript || []).some((l) => l.who === "Clerk" && /price match/.test(l.text)),
    "…while Echo still wrote it down, so it is on the record and the reader can name it");
  await sleep(6200);   // past the owed-word window, which is the only thing holding the drop
  ok(evs().some((e) => e.kind === "charlie_leave"), "…and he really is dropped off the call, which is what stops the meter");
  // MUSIC MEANS NOBODY IS THERE TO HEAR HIM, so the drop is immediate and not a polite few seconds
  // later (check 407 spent 5 awake seconds between declaring the wait and dropping him).
  {
    const left = evs().find((e) => e.kind === "charlie_leave");
    ok(!!left && (left.atMs ?? 0) - (holds()[0]?.atMs ?? 0) < 2500,
      "…and he goes at once, because music means nobody is waiting on his answer",
      { hold: holds()[0]?.atMs, left: left?.atMs });
    ok(((left?.detail || {}) as { notASound?: boolean }).notASound === true,
      "…and the drop is marked a silent switch too");
  }
  // STAFF REALLY COME BACK. The music stops first, which is what leaves the line clear, and then
  // they talk into it: speech-shaped sound with real gaps in it, and their own words behind it.
  // The gap is the rule doing its job — sound straight over the music's last note is refused, and
  // on a real check Staff come back seconds after it stops (check 405: nine of them).
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(60);
  // THE READER IS WHAT DECIDES NOW (owner, 08-19 evening), so it is stubbed here and answers what a
  // reader answers about a person really talking to us. Its accuracy is proven on the owner's saved
  // recordings by the workbench (scripts/hold-voice-bench.ts) and its wiring by scripts/test-hold-wake.ts;
  // what this scene proves is that the answer moves the engine.
  // THE COMEBACK OVERLAPS ITSELF (owner's order, 08-19 night). Echo writes their sentence in
  // pieces; the FIRST piece goes to Charlie at once so he is already working out his reply, and to
  // the wake check at once so it is already proving them. His sound is held until it says person.
  await sleep(250);   // his session finishes opening on the sound, exactly as on a real check
  // THEIR SENTENCE ENDS BEFORE ECHO WRITES IT, which is what really happens: check 428's own piece
  // "Yeah." landed 0.4 seconds AFTER their sound had stopped. The quiet frames are the line going
  // quiet, and on a real check they never stop arriving, so the scene feeds them too.
  quiet(tw, 40);
  await sleep(60);
  const beforeHisReply = tw.outMedia().length;
  echoHeardPiece(room, "Yeah.");
  ok(step("early_turn").length === 1,
    "their first written piece is handed to Charlie at once, so he starts working out his reply", step("early_turn").length);
  // CHECK 423: this hand's own row read "Echo handed Charlie the words in 12 seconds" and went red,
  // because a piece is not on the record yet and the newest Staff line there was still the store's
  // advert from twelve seconds earlier. It is measured from the returning voice itself.
  {
    const hand = evs().filter((e) => (e.detail as { step?: string } | null)?.step === "missed_turn").pop();
    const since = Number(((hand?.detail || {}) as { sinceVoiceStopMs?: number }).sinceVoiceStopMs ?? -1);
    ok(since >= 0 && since < 5000, "the handover gap is measured from the voice that came back, never from the advert before it", since);
  }
  // A REPLY HE BEGAN BEFORE THEIR WORDS REACHED HIM IS NEVER SPOKEN (check 417). His session was
  // opened on the sound of a voice and starts talking about the conversation it can see, so the
  // sound already in flight can be his answer to the line BEFORE theirs: the store heard "No
  // worries, take your time!" as the answer to "we've got a few of those". It announced itself
  // before their words were handed over, so it is thrown away, never held.
  {
    const ws = f.sockets[f.sockets.length - 1];
    for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x55)) } }));
    await sleep(40);
  }
  const staleChunks = tw.outMedia().length;
  ok(staleChunks === beforeHisReply, "the reply he began before their words reached him is thrown away, not held",
    { before: beforeHisReply, now: staleChunks });
  // HE BUILDS IT WITH HIS MOUTH SHUT, while the wake check is still reading. The store hears
  // nothing of this until the wake check speaks.
  {
    const ws = f.sockets[f.sockets.length - 1];
    ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh nice, do you know the name of the set?" } }));
    for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
    await sleep(60);
  }
  ok(tw.outMedia().length === beforeHisReply,
    "…and not one frame of the reply he is building reaches the store while the wake check is still proving them",
    { before: beforeHisReply, now: tw.outMedia().length });
  ok(!(getReceipt(room)?.transcript || []).some((l) => l.who === "Agent" && /name of the set/.test(l.text)),
    "…and words the store has not heard are not written down as a line of his either");
  // FIX 2 (owner, 08-20): the moment the words prove a real person AND that person pauses, he says
  // two words in his own voice, made fresh for this check, while the rest of his reply is still
  // being built. Staff hear him within three seconds of coming back instead of standing on a quiet
  // line for seven.
  {
    // THEY FINISH THEIR SENTENCE. His two words may never play over a person talking, so the pause
    // is what lets them out — on a real check the wake check proves them mid sentence and the words
    // land the moment they stop (check 423: their line ran 37.2 to 39.1 and the wait ended at 39.0).
    ok(step("little_hello").length === 0, "nothing of his plays while they are still talking", step("little_hello").length);
    quiet(tw, 40);
    // THE WINDOW IS THE CLOCK NOW (owner, 08-21 night): the decision lands when it closes, a fixed
    // 1200ms after their first written words, not on the beat their voice stopped.
    await sleep(1500);
    const hello = step("little_hello")[0];
    ok(!!hello, "he says his little hello once the window closes and the words prove a person");
    const back = evs().find((e) => (e.detail as { step?: string } | null)?.step === "reconnect_early"
      && (e.atMs ?? 0) > (holds()[0]?.atMs ?? 0) + 5000);
    const gap = (hello?.atMs ?? 0) - (back?.atMs ?? 0);
    ok(!!hello && !!back && gap >= 0 && gap < 3000,
      "…within three seconds of the person coming back", { back: back?.atMs, hello: hello?.atMs, gap });
    ok(TTS_CALLS >= 1, "…and it was recorded fresh for this check, never served from the clip store", TTS_CALLS);
    ok(tw.outMedia().length > beforeHisReply, "…and the store really hears it");
  }
  // THE WAKE CHECK SAYS PERSON when the window closes, so the wait ends without waiting for Echo to
  // finish the sentence — and everything he had ready goes out whole.
  await sleep(1500);
  ok(step("early_turn_released").length === 1, "the wake check proves a person and his ready reply goes straight out", step("early_turn_released").length);
  ok(tw.outMedia().length > beforeHisReply, "…so the store really hears it", { before: beforeHisReply, now: tw.outMedia().length });
  ok((getReceipt(room)?.transcript || []).some((l) => l.who === "Agent" && /name of the set/.test(l.text)),
    "…and now that they heard it, it is written down as a line of his");
  // THE REST OF THEIR SENTENCE lands as its own piece and reaches him as the tail of the same turn,
  // so nothing they said is lost to the early start.
  echoHeardPiece(room, "We've got a few of those.");
  await sleep(400);
  ok(f.raw.some((m) => m.includes("user_message") && m.includes("got a few of those")),
    "the rest of their sentence reaches him too, so the early start never loses their words");
  // ECHO FINISHES THE SENTENCE A BEAT LATER, and the joined line is the same words he already has.
  // Handing it again would put the same words to him twice and have him answer them twice.
  const handsBefore = f.raw.filter((m) => m.includes("user_message")).length;
  echoHeardStaff(room, "Yeah. We've got a few of those.");
  await sleep(400);
  ok(f.raw.filter((m) => m.includes("user_message")).length === handsBefore,
    "…and the joined sentence those pieces became is never handed to him a second time",
    { before: handsBefore, now: f.raw.filter((m) => m.includes("user_message")).length });
  // FIX 3: HIS SESSION STARTS OPENING ON THE FIRST SOUND OF THE VOICE COMING BACK, before the words
  // have said who it was, because the voice provider takes about four and a half seconds to open one
  // and that sat between Staff's answer and his reply on every check since he started being dropped.
  ok(step("reconnect_early").length === 1,
    "the returning voice's own sound starts his session opening", step("reconnect_early").length);
  ok(step("ears_back").length === 1, "the sound and their words together bring his ears back", step("ears_back").length);
  ok(evs().some((e) => e.kind === "hold_end"), "…the wait ends on the same proof, so his meter starts again with a person on the line");
  // AND THE WAIT'S OWN LENGTH IS THE DISTANCE BETWEEN ITS OWN TWO ROWS. On 407 a row reading
  // "Staff back after 6s" sat between rows stamped 44 and 47, because two clocks were in play.
  {
    const start = evs().find((e) => e.kind === "hold_start"), end = evs().find((e) => e.kind === "hold_end");
    const said = Number(((end?.detail || {}) as { gapSec?: number }).gapSec ?? -1);
    const drawn = Math.round((((end?.atMs ?? 0) - (start?.atMs ?? 0))) / 1000);
    ok(said >= 0 && Math.abs(said - drawn) <= 1,
      "the wait says it lasted what its own two rows say it lasted", { said, drawn });
  }
  // CHECK 413: the wait's ending was DRAWN BELOW the hand-over row it caused, because opening his
  // ears hands him what he missed and that writes its own row first. The sentence then measured
  // itself against a row that sat above it. The wait's own row is written first, always.
  {
    const rows = evs();
    const endAt = rows.findIndex((e) => e.kind === "hold_end");
    const backAt = rows.findIndex((e) => (e.detail as { step?: string } | null)?.step === "ears_back");
    ok(endAt >= 0 && backAt > endAt,
      "the wait's own ending is drawn ABOVE the row for handing him what he missed", { endAt, backAt });
    ok((rows[endAt]?.atMs ?? 0) <= (rows[backAt]?.atMs ?? 0),
      "…and its second is no later than that row's second either",
      { end: rows[endAt]?.atMs, back: rows[backAt]?.atMs });
  }
  await sleep(500);   // his session takes a moment to open again, exactly as on a real check
  ok(evs().some((e) => e.kind === "charlie_join" && ((e.detail as { segment?: number } | null)?.segment ?? 0) > 1),
    "…and he comes back as the next part of the same check");
  // CHECK 411: the store's music kept playing for a moment after the person started talking, and
  // that tail declared a SECOND wait 4.6 seconds after the first ended, before his session had even
  // finished reopening. Staff's answer then sat unanswered for 26 seconds and the robot store asked
  // "Hello?". The music's own tail is not a new wait while somebody has just come back.
  const holdsBefore = evs().filter((e) => e.kind === "hold_start").length;
  for (let i = 0; i < 90; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(120);
  ok(evs().filter((e) => e.kind === "hold_start").length === holdsBefore,
    "…and the music still playing behind them does not start a second wait over their answer",
    { before: holdsBefore, after: evs().filter((e) => e.kind === "hold_start").length });
  ok(f.raw.some((m) => m.includes("user_message") && m.includes("got a few of those")),
    "…and what they said is handed to him as their turn, so he answers it");
  // CHECK 409: the advert's own words rode the pocket and were handed to him as "Staff's own words,
  // answer them now" the moment the real person came back, and he answered the jumble. A line the
  // reader judged the store PLAYED at us is struck out of that pocket.
  ok(!f.raw.some((m) => m.includes("user_message") && m.includes("price match")),
    "…and the advert's words never ride that hand-over either");
  // CHECK 416: the wordless-rejoin guard re-armed on a comeback that WORDS had just proved, and
  // demanded a second set of them inside four seconds. He was dropped mid reply at 43 seconds, the
  // store asked "Hello?", and the check ran 84 seconds at 11.3 cents. Words that proved the
  // comeback spend that window: they are the very thing it exists to wait for.
  await sleep(4300);
  ok(step("wordless_rejoin").length === 0,
    "the words that proved the comeback spend the wordless window, so he is never dropped mid reply", step("wordless_rejoin").length);
  ok(evs().filter((e) => e.kind === "hold_start").length === 1,
    "…and no second wait starts on top of the answer he is giving", evs().filter((e) => e.kind === "hold_start").length);
  globalThis.fetch = beforeStub;
  restore(); tw.close(); f.close();
}

console.log("\n▶ OUR OWN BRAIN DRIVES A WHOLE CHECK, through the real engine (owner's go, 08-20)");
{
  // The blocked road pointed the voice provider's conversation service at our endpoint, and they
  // refuse that on any agent using a quick-made voice copy. This is the other road: WE run the
  // conversation and their plain speech service says each line in the same voice. What is proven
  // HERE is that the engine cannot tell the difference — every rule in it still runs, because the
  // session our side opens speaks the provider's own message protocol.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-ourbrain";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  const beforeStub = globalThis.fetch;
  let askedOurBrain = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (/anthropic|chat\/completions|\/v1\/messages/.test(url)) {
      askedOurBrain++;
      return new Response(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Oh nice, is it a pack or a box?" } })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return (beforeStub as typeof globalThis.fetch)(input, init);
  }) as typeof globalThis.fetch;
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?", category: "Pokemon cards", personality: "warm" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    voiceId: "voice_test",
    ourBrain: true,
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  } as never);
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_ob", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(700);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  const join = evs().find((e) => e.kind === "charlie_join");
  ok(!!join, "his session is up with no agent of the provider's opened at all");
  ok(((join?.detail || {}) as { brain?: string }).brain === "ours",
    "…and the record says which brain is behind it, on the stretch itself", ((join?.detail || {}) as { brain?: string }).brain);
  ok(f.sockets.length === 0, "…and not one conversation session was opened at the voice provider", f.sockets.length);
  // THEIR HELLO IS THE RECORDING'S TO ANSWER, never his — the same rule on both lanes.
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", Date.now());
  await sleep(200);
  ok(askedOurBrain === 0, "their hello is never handed to him: the recorded question answers it", askedOurBrain);
  // STAFF ANSWER. Echo writes it down and hands it over exactly as it always has.
  const outBefore = tw.outMedia().length;
  echoHeardStaff(room, "Yeah, we've got a few of those.", Date.now());
  await sleep(700);
  ok(askedOurBrain >= 1, "their words are answered by OUR OWN brain", askedOurBrain);
  ok((getReceipt(room)?.transcript || []).some((l) => l.who === "Agent" && /pack or a box/.test(l.text)),
    "…his reply is written down as his own line");
  ok(tw.outMedia().length > outBefore, "…and the store really hears it", { before: outBefore, now: tw.outMedia().length });
  ok(step("brain_reply").length === 1, "…and the record stamps WHICH brain wrote that reply", step("brain_reply").length);
  {
    const d = (step("brain_reply")[0]?.detail || {}) as { brain?: string; thinkMs?: number; speakMs?: number };
    ok(d.brain === "ours" && typeof d.thinkMs === "number" && typeof d.speakMs === "number",
      "…with how long it took to write and how long to say", d);
  }
  // AND THE COST IS NOT PRICED AS IF THE PROVIDER HAD BEEN RUNNING HIM. Their conversation service
  // meters by the second and there was no session of theirs on this call at all.
  {
    const r = rollup(getReceipt(room)!);
    ok(r.charliePaidSeconds === 0, "not one second of this stretch is billed at the provider's conversation rate", r.charliePaidSeconds);
    ok(r.charlieConnectedSeconds >= 0, "…while his own clock still measures what it always did", r.charlieConnectedSeconds);
  }
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 427'S MOMENT: his words are in, his sound is still being made, and the person is proved");
{
  // THE SILENCE FAULT, off check 427's own record. Staff came back at 36.5 seconds, Echo wrote their
  // first piece, and our own brain wrote his answer to it — the set question, "do you know the name
  // of the set, like Chaos Rising, and is it a pack or a box?". The wake check proved a person 154
  // milliseconds before the sound of that answer had been made. The turn was thrown away at that
  // moment, his words with it: nothing on the sheet, nothing on the customer's page, no row naming
  // the brain that wrote it, and after his two word hello the store heard nothing he could answer.
  // 427 only got the set name because Staff volunteered it.
  //
  // WHAT THIS SCENE PINS is that exact order — words, then the proof, then the sound — which no
  // other scene has: the one beside it hands his words and his sound together, which is the order
  // that always worked. His reply has to survive the gap between the two and go out whole.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-427-moment";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  const heardTheSetQuestion = () => (getReceipt(room)?.transcript || [])
    .some((l) => l.who === "Agent" && /name of the set/.test(l.text));
  // THE READER, STUBBED, answering what it answered on 427: a person really is talking to us. It
  // takes a beat, and that beat is the window the whole fault lives in. Its accuracy on real lines
  // is the workbench's job (scripts/hold-voice-bench.ts); what this proves is the engine's order.
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    await new Promise((r) => setTimeout(r, 250));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      lines: [{ n: 1, voice: "person", announcesWait: false, confidence: 0.9, why: "answers our question" }],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  // Staff step away and the music declares the wait, so he is dropped and his ears are shut.
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(6200);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait, which is where every comeback starts");
  // THEY COME BACK. The music stops, they talk into the line it left, and his session starts opening
  // on that sound while the words are still being written.
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(310);
  // Their sentence ends before Echo writes it, exactly as on check 428.
  quiet(tw, 40);
  await sleep(60);
  const beforeHisReply = tw.outMedia().length;
  echoHeardPiece(room, "Yeah.");
  ok(step("early_turn").length === 1,
    "their first written piece is handed to him at once, so he starts working out his reply", step("early_turn").length);
  // HIS WORDS ARRIVE, AND NOTHING ELSE YET. This is the whole of the difference: on this lane our
  // own brain announces the line it has written and the sound of it is made after, which is the
  // order the voice provider's plain speech service works in.
  const ws = f.sockets[f.sockets.length - 1];
  const SET_ASK = "Oh nice, do you know the name of the set, like Chaos Rising, and is it a pack or a box?";
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: SET_ASK } }));
  await sleep(40);
  ok(tw.outMedia().length === beforeHisReply, "his words on their own put nothing on the line", tw.outMedia().length);
  // THEY STOP TALKING AND THE WAKE CHECK SAYS PERSON — with the sound of his reply still unmade.
  quiet(tw, 40);
  // The window closes 1200ms after their first written words; nothing lands before that now.
  await sleep(1500);
  ok(step("little_hello").length === 1, "his two words go out once the window closes and the person is proved", step("little_hello").length);
  ok(evs().some((e) => e.kind === "hold_end"), "…and the wait ends on that same proof");
  ok(step("early_turn_released").length === 0,
    "…and his reply is NOT released, because there is no sound of it yet to release", step("early_turn_released").length);
  ok(!heardTheSetQuestion(), "…nor written down, because the store has not heard a word of it");
  ok(step("early_turn_binned").length === 0, "…and it is not thrown away either: it is his answer to what they just said");
  // NOW THE SOUND OF IT ARRIVES. On 427 this landed 154 milliseconds after the proof.
  const beforeSound = tw.outMedia().length;
  for (let i = 0; i < 6; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
  await sleep(200);
  ok(step("early_turn_released").length === 1,
    "his full reply plays on its own the moment its sound exists", step("early_turn_released").length);
  ok(tw.outMedia().length >= beforeSound + 6,
    "…and every frame of it really reaches the store, none dropped behind the hello",
    { before: beforeSound, now: tw.outMedia().length });
  ok(heardTheSetQuestion(), "…and now that they heard it, the set question is written down as a line of his");
  // AND HE ASKED IT WITHOUT BEING SPOKEN TO FIRST. On 427 Staff had to talk again before anything
  // of his landed, which is the owner's own words for this fault.
  {
    const t = getReceipt(room)?.transcript || [];
    const his = t.findIndex((l) => l.who === "Agent" && /name of the set/.test(l.text));
    const theirsAfter = t.slice(0, his).filter((l) => l.who === "Clerk").length;
    ok(his >= 0 && theirsAfter <= 2,
      "…and it is his own turn, not an answer to a second thing Staff had to say", { at: his, clerkLinesBefore: theirsAfter });
  }
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 430'S MOMENT: three words of a sentence still being said decide nothing");
{
  // THE FAULT. Charlie starts working out his reply on Staff's FIRST written word, so the person or
  // recording decision was forced on whatever the transcriber had cut by then. On check 428 that was
  // the whole sentence, "Thanks for holding. Did you know we price match any local competitor?", and
  // it was rightly called the store's recording. On 430 it was the first three words alone, "Thanks
  // for holding.", which is exactly what a person says coming back, so it was rightly called a
  // person: the wait ended at 18.842s and at 19.117s he spoke into the advert and re-asked his
  // question. Neither answer was wrong. The question was asked too early.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-430-moment";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  // THE READER, STUBBED, and it answers what it really answers about these two windows: three words
  // that a person says is a person; the whole advert is a recording. Its accuracy on real lines is
  // the workbench's job — what this scene proves is WHEN the engine asks it.
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    // It is asked about a numbered list of lines and answers about EVERY one of them, the way the
    // real reader does, so the newest line always has an answer of its own.
    const body = String((init as { body?: unknown } | undefined)?.body ?? "");
    let asked: string[] = [];
    try {
      const sent = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      const user = (sent.messages || []).filter((m) => m.role === "user").map((m) => String(m.content || "")).join("\n");
      asked = user.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
    } catch { asked = []; }
    if (!asked.length) asked = [""];
    await new Promise((r) => setTimeout(r, 120));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      lines: asked.map((text, i) => {
        // The whole advert is the store talking at us. Three words that a person also says are not.
        const advert = /price match/i.test(text);
        return { n: i + 1, line: text, voice: advert ? "recording" : "person", announcesWait: false,
          confidence: 0.9, why: advert ? "advertising the store" : "greets us and offers help" };
      }),
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  // Staff step away, the music declares the wait, he is dropped.
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(6200);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait");
  // THE ADVERT STARTS. Its sound is speech-shaped and it keeps going, exactly as a real advert does.
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(310);
  // Echo writes its first three words while the advert is STILL TALKING.
  const keepTalking = setInterval(() => { for (let i = 0; i < 12; i++) tw.media(frame(SPEECH(i))); }, 40);
  echoHeardPiece(room, "Thanks for holding.");
  await sleep(700);
  ok(step("early_turn").length === 1, "the piece still reaches Charlie at once, so he is already thinking");
  ok(step("wake_read").length === 0,
    "…but NOTHING is decided on three words of a sentence still being said", step("wake_read").length);
  ok(!evs().some((e) => e.kind === "hold_end"), "…so the wait does not end on them");
  ok(step("ears_back").length === 0, "…and his ears stay shut");
  // The rest of the advert lands, and the advert KEEPS TALKING, which is what an advert does. So
  // its voice never stops, and the ceiling is what makes the decision happen: at four seconds we
  // decide on everything written by then, which by now is the whole sentence.
  echoHeardPiece(room, "Did you know we price match any local competitor?");
  await sleep(4200);
  clearInterval(keepTalking);
  await sleep(300);
  ok(step("wake_read").length >= 1, "the whole sentence is judged", step("wake_read").length);
  ok(step("wake_read").some((e) => (e.detail as { answer?: string }).answer === "recording"),
    "…and the record says WHICH answer it was, in the reader's own words",
    step("wake_read").map((e) => (e.detail as { answer?: string }).answer));
  ok(step("not_a_person").length >= 1, "…the store played that at us, so he stays off");
  ok(!evs().some((e) => e.kind === "hold_end"), "…and the wait is still running");
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 428'S OTHER FAULT: a line of his files where the store really HEARS it");
{
  // On 428 his goodbye was stamped 48.194s while his own question's sound ran to 49.947s, so the
  // record read as him talking over himself. The voice provider writes his next reply while the
  // previous one is still playing out at the carrier, so "now" is a moment the store has not reached
  // yet. Everything of ours already queued has to finish before a word of the next line is heard.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-428-heard";
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, { agentId: "a", apiKey: "k", dynamicVars: {}, midCallAgentId: "mid" } as never);
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_428", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(400);
  const ws = f.sockets[f.sockets.length - 1];
  // Staff answer, so his mouth is open and what follows is a real turn of his.
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Yeah, we've got a few of those." } }));
  await sleep(120);
  // HIS QUESTION, IN THE ORDER A REAL CHECK PRODUCES IT: his sound starts going out first and the
  // provider sends the words a beat later, which is why his line files at his turn's first frame.
  // A long pile of sound with it: seconds of audio queued at the carrier ahead of anything next.
  for (let i = 0; i < 150; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x30)) } }));
  await sleep(40);
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh nice, do you know the name of the set?" } }));
  await sleep(40);
  for (let i = 0; i < 20; i++) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x30)) } }));
  await sleep(60);
  // …AND HIS GOODBYE, WRITTEN WHILE THAT SOUND IS STILL PLAYING. This is exactly 428's shape.
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Perfect, thanks so much, have a good one!" } }));
  await sleep(120);
  const his = (getReceipt(room)?.transcript ?? []).filter((l) => l.who === "Agent");
  const q = his.find((l) => /name of the set/.test(l.text));
  const bye = his.find((l) => /have a good one/.test(l.text));
  ok(!!q && !!bye, "both of his lines are on the record", his.map((l) => l.text.slice(0, 24)));
  ok(!!q?.endMs && q.endMs > q.atMs, "his question knows how long its sound really runs", { at: q?.atMs, end: q?.endMs });
  ok(!!bye && !!q?.endMs && bye.atMs >= q.endMs,
    "…and his goodbye files AFTER it, because that is when the store can first hear a word of it",
    { question: [q?.atMs, q?.endMs], goodbye: bye?.atMs });
  ok(!!bye && !!q && bye.atMs > q.atMs, "…never at the same instant, and never inside his own sentence");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 399'S MOMENT: his private note never reaches the line (owner, 08-19)");
{
  // 31 seconds into check 399 the store's advert had been handed to him as if Staff had spoken, and
  // instead of waiting he described it onto the line, word for word:
  //   "[System: Store announcement / advertisement playing, not a staff member speaking]"
  // His directions were changed to forbid exactly that and I read them back off the voice service to
  // be sure they had landed; he said it anyway. So it is judged at the door now. This scene is that
  // moment: the same handed advert, the same note, and the store must hear NOTHING.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-399-note";
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, { agentId: "a", apiKey: "k", dynamicVars: {}, midCallAgentId: "mid" } as never);
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, room, () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_399", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(400);
  const ws = f.sockets[f.sockets.length - 1];
  // Staff speak, so his mouth is open and this is a real turn of his: nothing else is suppressing him.
  ws.send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Thanks for holding. Did you know we price match any local competitor?" } }));
  await sleep(120);
  const framesBefore = tw.sent.filter((m) => m.event === "media").length;
  // …and THE NOTE, the real one off check 399.
  const NOTE = "[System: Store announcement / advertisement playing, not a staff member speaking]";
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: NOTE } }));
  await sleep(60);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x30)) } }));
  await sleep(200);
  ok(tw.sent.filter((m) => m.event === "media").length === framesBefore,
    "the store hears silence: not one frame of the note went down the line");
  const lines = (getReceipt(room)?.transcript || []).filter((l) => l.who === "Agent");
  ok(!lines.some((l) => /System|announcement|advertisement/i.test(l.text)),
    `the note is never written down as something he said (${lines.length} line(s) of his)`);
  const caught = (getReceipt(room)?.events || []).find((e) => (e.detail as { step?: string } | null)?.step === "note_silenced");
  ok(!!caught, "the record says his note was caught and silenced");
  ok(String((caught?.detail as { text?: string } | null)?.text || "").includes("Store announcement"),
    "…in the note's own words, so the sheet tells the truth about what almost played");
  // AND HIS NEXT REAL REPLY STILL GOES OUT. Silencing one note may never gag him for the call.
  const beforeReal = tw.sent.filter((m) => m.event === "media").length;
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Oh nice, thanks so much!" } }));
  await sleep(60);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x30)) } }));
  await sleep(200);
  ok(tw.sent.filter((m) => m.event === "media").length > beforeReal,
    "his very next real reply goes out as normal, so one note never gags the check");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 431'S FAULT: our own voice comes back off the room and is NOT the store talking");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-431-echo";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    // A whole second of our own sound, so the room has something real to hand back.
    openingClip: { audio: Buffer.alloc(1000 * 8, 0x20), ms: 1000, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare, the way the carrier connects */ });
  tw.say({ event: "start", start: { streamSid: "MZ_431", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(200);
  // OUR OWN QUESTION, HANDED BACK BY THE ROOM, word-shuffled exactly as check 431's record has it —
  // starting inside our own sound and running a little past it, the way an echo does.
  const started = Date.now();
  echoHeardStaff(room, "Hi there. I was checking. Do you have any Coke? Stock right now?", started, started + 900);
  await sleep(120);
  const said = (getReceipt(room)?.transcript || []).filter((l) => l.who !== "Agent");
  ok(!said.some((l) => /do you have any coke/i.test(l.text)),
    `our own question coming back is never written down as Staff (${said.length} Staff line(s))`);
  const caught = (getReceipt(room)?.events || []).find((e) => (e.detail as { step?: string } | null)?.step === "our_own_echo");
  ok(!!caught, "…and the record says it happened, in the words that came back");
  ok(/Coke/.test(String((caught?.detail as { text?: string } | null)?.text || "")),
    "…so nothing is ever dropped silently");
  // AND THE STORE STILL GETS THROUGH. A sentence that starts after our sound has stopped is theirs,
  // and the check goes on exactly as it always did.
  await sleep(1600);
  const real = Date.now();
  echoHeardStaff(room, "Yeah, we've got a few of those.", real, real + 600);
  await sleep(120);
  ok((getReceipt(room)?.transcript || []).some((l) => l.who !== "Agent" && /got a few/.test(l.text)),
    "Staff's own answer, said after our sound stopped, lands on the record as always");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 432'S FAULT: a reply of his that reached nobody is ASKED FOR AGAIN, not left as silence");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-432-reask";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare */ });
  tw.say({ event: "start", start: { streamSid: "MZ_432", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(400);
  tw.say({ event: "mark", mark: { name: "delta-opening" } });   // the carrier says the question finished
  await sleep(80);
  // Their hello is the line our own recording answered, so his mouth stays shut over it — exactly
  // as it did on 432 while the store's advert was playing.
  const helloAt = Date.now();
  echoHeardStaff(room, "Larry Vasquez. How can I help you?", helloAt, helloAt + 500);
  await sleep(80);
  const ws = f.sockets[f.sockets.length - 1];
  // HIS MOUTH IS SHUT: the store's hello is the line our own recording just answered, so anything he
  // makes right now is dropped at the audio door. That is correct, and it is where 432 went silent.
  const framesBefore = tw.sent.filter((m) => m.event === "media").length;
  ws.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Hi! Do you have any Pokemon cards in stock?" } }));
  await sleep(40);
  ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x30)) } }));
  await sleep(150);
  ok(tw.sent.filter((m) => m.event === "media").length === framesBefore,
    "the store heard none of it, exactly as before");
  const held = (getReceipt(room)?.events || []).filter((e) => (e.detail as { step?: string } | null)?.step === "hello_reply_held");
  ok(held.length >= 1, "the record says a reply of his was held and never spoken");
  // NOW A REAL PERSON ANSWERS — their voice on the line, then Echo's words for it. His mouth opens,
  // and he is asked for the reply that went nowhere, rather than standing there until Staff say
  // "Hello?" to find out whether anyone is left.
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  const answered = Date.now();
  echoHeardStaff(room, "Yeah, we've got a few of those.", answered, answered + 600);
  await sleep(250);
  const reask = (getReceipt(room)?.events || []).find((e) => (e.detail as { step?: string } | null)?.step === "reply_re_asked");
  ok(!!reask, "he is asked to say it again, the moment there is anybody to hear it");
  ok(f.raw.some((m) => /never reached the store|nothing you just said/i.test(m)),
    "…and the ask really reached his session, in words he can act on");
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 434'S MOMENT: the held decision is asked when their voice STOPS, not four seconds later");
{
  // THE FAULT. 430's fix holds the person-or-recording question while Staff's sentence is still
  // being said, and that fix is right. But nothing was watching for the sentence being OVER: the
  // question was re-asked only when Echo wrote another piece, or when the four second ceiling fired.
  // Staff answering us and then waiting produces neither, so the whole four seconds burned with
  // Charlie's reply already written and his mouth held shut. On check 434 their line ended at 39.3
  // seconds and he spoke at 43.6. The same fault stood mute 26 seconds on check 432.
  // The scene is 430's, with ONE thing changed: it is a real person, and their voice stops.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-434-moment";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  // The same stubbed reader as 430's scene, answering the same way: the advert's own words are the
  // store talking at us, and everything else is a person. What this scene proves is WHEN it is asked.
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    const body = String((init as { body?: unknown } | undefined)?.body ?? "");
    let asked: string[] = [];
    try {
      const sent = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      const user = (sent.messages || []).filter((m) => m.role === "user").map((m) => String(m.content || "")).join("\n");
      asked = user.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
    } catch { asked = []; }
    if (!asked.length) asked = [""];
    await new Promise((r) => setTimeout(r, 120));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      lines: asked.map((text, i) => {
        const advert = /price match/i.test(text);
        return { n: i + 1, line: text, voice: advert ? "recording" : "person", announcesWait: false,
          confidence: 0.9, why: advert ? "advertising the store" : "answering what we asked them" };
      }),
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  // Staff step away, the music declares the wait, he is dropped — 430's opening, unchanged.
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(6200);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait");
  // A REAL PERSON comes back with the answer, and their voice is still going when Echo writes it.
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(310);
  const stillTalking = setInterval(() => { for (let i = 0; i < 12; i++) tw.media(frame(SPEECH(i))); }, 40);
  echoHeardPiece(room, "Yeah. We've got a few of those.");
  await sleep(700);
  ok(step("early_turn").length === 1, "the piece reaches Charlie at once, so his reply is already being worked out");
  ok(step("wake_read").length === 0,
    "…and 430's rule still holds: nothing is decided while their sentence is still being said", step("wake_read").length);
  // THEY FINISH, AND THEY WAIT. Nothing else is written and nothing else is said — the exact shape
  // that used to burn the ceiling. The ear's own stop test is 0.8 seconds of quiet on the line.
  clearInterval(stillTalking);
  const stopped = Date.now();
  quiet(tw, 60);
  let decidedMs = -1;
  for (let i = 0; i < 250 && decidedMs < 0; i++) {
    if (step("wake_read").length >= 1) decidedMs = Date.now() - stopped;
    else await sleep(20);
  }
  ok(decidedMs >= 0 && decidedMs < 1500,
    "the held question is asked within a beat of their voice stopping, never at the four second ceiling", decidedMs);
  ok(step("wake_read").some((e) => (e.detail as { answer?: string }).answer === "person"),
    "…and the answer is a person", step("wake_read").map((e) => (e.detail as { answer?: string }).answer));
  ok(step("wake_read").some((e) => String((e.detail as { text?: string }).text || "").includes("few of those")),
    "…asked about their turn as Echo has written it, not about the line before it");
  // THE BENCH NUMBER (owner's order, 08-21 night): the gap he is watching, measured on a driven call
  // rather than read off a recording. Their voice stops, and this is how long before Charlie's mouth
  // is open. Printed so three runs in a row can be compared without reading the whole log.
  let openedMs = -1;
  for (let i = 0; i < 250 && openedMs < 0; i++) {
    if (step("ears_back").length >= 1) openedMs = Date.now() - stopped;
    else await sleep(20);
  }
  console.log(`  BENCH GAP: ${openedMs}ms from their voice stopping to his ears opening`);
  ok(evs().some((e) => e.kind === "hold_end"), "…so the wait ends on the same beat");
  ok(step("ears_back").length >= 1, "…and his ears come back, with his reply ready to go out");
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 436'S FAULT: the reader is STARTED when there are words, not when the answer is needed");
{
  // THE FAULT. Checks 432, 434, 435 and 436 every single one wrote "the reader could not answer in
  // time". Four rounds of work went into how long we WAIT for it and none into why it never answers.
  // It never answers because it was only ever started inside the wake question — the exact instant
  // the answer is needed — while Staff's first written words had been sitting there for seconds.
  // This scene gives the reader a REALISTIC round trip (1.2 seconds, longer than the whole wait the
  // wake question allows itself) and proves the answer is in hand before the question is asked.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-436-headstart";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  let readsStarted = 0;
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    readsStarted++;
    const body = String((init as { body?: unknown } | undefined)?.body ?? "");
    let asked: string[] = [];
    try {
      const sent = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      const user = (sent.messages || []).filter((m) => m.role === "user").map((m) => String(m.content || "")).join("\n");
      asked = user.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
    } catch { asked = []; }
    if (!asked.length) asked = [""];
    // A REAL ROUND TRIP, not an instant one. 1.7 seconds is inside what the models really take and
    // OUTSIDE the second and a half the wake question allows itself — so from a standing start this
    // reader CANNOT answer in time, which is exactly what checks 432, 434, 435 and 436 all wrote.
    await new Promise((r) => setTimeout(r, 1700));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      lines: asked.map((text, i) => {
        const advert = /price match/i.test(text);
        return { n: i + 1, line: text, voice: advert ? "recording" : "person", announcesWait: false,
          confidence: 0.9, why: advert ? "advertising the store" : "answering what we asked them" };
      }),
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(6200);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait");
  // A real person comes back and answers, and their voice runs on past the first written word — the
  // ordinary shape of somebody saying a sentence.
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(310);
  const stillTalking = setInterval(() => { for (let i = 0; i < 12; i++) tw.media(frame(SPEECH(i))); }, 40);
  const startedReadsBefore = readsStarted;
  echoHeardPiece(room, "Yeah. We've got a few of those.");
  await sleep(250);
  ok(readsStarted > startedReadsBefore,
    "the reader is started on their first written words, before anybody asks the question");
  ok(step("wake_read").length === 0, "…and 430's rule still holds: nothing is decided on it yet", step("wake_read").length);
  // Their voice runs on while the reader works, exactly as a real sentence does.
  await sleep(1400);
  clearInterval(stillTalking);
  const stopped = Date.now();
  quiet(tw, 60);
  let decidedMs = -1;
  for (let i = 0; i < 250 && decidedMs < 0; i++) {
    if (step("wake_read").length >= 1) decidedMs = Date.now() - stopped;
    else await sleep(20);
  }
  const row = step("wake_read")[0]?.detail as { answer?: string; decidedBy?: string; readMs?: number; openMs?: number; windowMs?: number } | undefined;
  // THE TRADE A FIXED WINDOW MAKES, IN THE OPEN. This stubbed reader takes 1700ms and the window is
  // 1200ms, so it does NOT answer and the measured sound rule decides instead — correctly, which is
  // the whole reason the sound rule is the stand-in. What matters is that the record SAYS which of
  // the two decided, and that Staff waited the window, not a model's round trip.
  // ON A REAL CHECK: 437's reader took 1601ms on Staff's answer and 1068ms on the advert, so at
  // 1200ms roughly the fast half of the reads land inside the window and the rest fall to the sound
  // rule. The window's length is the owner's number to move, and this row is where the trade shows.
  ok(row?.decidedBy === "the measured sound",
    "a reader slower than the window does not decide, and the record says the sound did", row?.decidedBy);
  ok(row?.windowMs === 1200, "…and the window is a fixed length, the same every time", row?.windowMs);
  ok(decidedMs >= 0 && decidedMs < 400,
    "…so Staff wait a beat, not a reader's whole round trip", decidedMs);
  ok(typeof row?.readMs === "number" && (row.readMs as number) > 0,
    "…and the record says how long the reader really took, which nobody knew before", row?.readMs);
  ok(evs().some((e) => e.kind === "hold_end"), "the wait ends on the same beat");
  ok(step("ears_back").length >= 1, "…and his ears come back");
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ CHECK 437'S FAULT: one answer per turn, one row per turn, one call to the reader");
{
  // THE FAULT, ON 437'S OWN RECORD: two wake_read rows at the SAME millisecond, 27854, about the
  // same advert, the same answer, the same reason — one fromAPiece true, one false — and the
  // not_a_person row printed twice under them. Four rows on his screen where there should be two.
  // The wake question is entered from two doors for one turn: from a piece, and again from the
  // joined line once Echo writes that turn to the record. Nothing remembered the turn was already
  // asked about. The duplicate CALL is the waste; the duplicate row is only how he noticed it.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-437-one-answer";
  echoListening(room, true);
  const { tw } = await callToHello(f, 400, room, { charlieMinOnLineMs: 0 }, "reopen");
  await sleep(400);
  const evs = () => getReceipt(room)?.events || [];
  const step = (n: string) => evs().filter((e) => (e.detail as { step?: string } | null)?.step === n);
  let readerCalls = 0;
  const beforeStub = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/chat\/completions|\/v1\/messages/.test(url)) return (beforeStub as typeof globalThis.fetch)(input, init);
    readerCalls++;
    const body = String((init as { body?: unknown } | undefined)?.body ?? "");
    let asked: string[] = [];
    try {
      const sent = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      const user = (sent.messages || []).filter((m) => m.role === "user").map((m) => String(m.content || "")).join("\n");
      asked = user.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
    } catch { asked = []; }
    if (!asked.length) asked = [""];
    await new Promise((r) => setTimeout(r, 150));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      lines: asked.map((text, i) => {
        const advert = /price match/i.test(text);
        return { n: i + 1, line: text, voice: advert ? "recording" : "person", announcesWait: false,
          confidence: 0.9, why: advert ? "advertising the store" : "answering what we asked them" };
      }),
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  echoHeardStaff(room, "One moment. I'll go and have a look.");
  await sleep(120);
  for (let i = 0; i < 80; i++) { tw.media(frame(LOUD(160, i % 3))); await sleep(1); }
  await sleep(6200);
  ok(evs().some((e) => e.kind === "charlie_leave"), "he is dropped for the wait");
  // THE ADVERT, exactly as 437 played it: a piece of it while it is still talking, then the whole
  // joined line once Echo finishes writing it — the two doors, one turn.
  quiet(tw, 130);
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(310);
  const ADVERT = "Thanks for holding. Did you know we price match any local competitor?";
  const readsBefore = readerCalls;
  const stillTalking = setInterval(() => { for (let i = 0; i < 12; i++) tw.media(frame(SPEECH(i))); }, 40);
  echoHeardPiece(room, ADVERT);
  await sleep(600);
  // Their voice stops, so the held question is asked on the piece — door one.
  clearInterval(stillTalking);
  quiet(tw, 60);
  await sleep(700);
  ok(step("wake_read").length === 1, "the piece is answered, once", step("wake_read").length);
  ok(step("not_a_person").length === 1, "…and the store's recording is refused, once", step("not_a_person").length);
  const afterFirst = readerCalls;
  // …AND NOW ECHO WRITES THE SAME TURN TO THE RECORD AS ONE LINE — door two, on 437 this printed
  // everything all over again.
  echoHeardStaff(room, ADVERT);
  await sleep(900);
  ok(step("wake_read").length === 1, "the joined line of a turn already asked NEVER re-asks", step("wake_read").length);
  ok(step("not_a_person").length === 1, "…so the refusal is on his screen once, not twice", step("not_a_person").length);
  ok(readerCalls === afterFirst, "…and the reader was not called a second time for it", { afterFirst, now: readerCalls });
  ok(afterFirst - readsBefore <= 1, "one turn, one call to the reader", { readsBefore, afterFirst });
  ok(!evs().some((e) => e.kind === "hold_end"), "the wait is still running, exactly as before");
  // A DIFFERENT TURN IS STILL NOBODY'S BUSINESS BUT ITS OWN: a real person answers and gets an
  // answer of their own, so nothing here was silenced by accident.
  for (let i = 0; i < 60; i++) { tw.media(frame(SPEECH(i))); await sleep(1); }
  await sleep(200);
  const talking2 = setInterval(() => { for (let i = 0; i < 12; i++) tw.media(frame(SPEECH(i))); }, 40);
  echoHeardPiece(room, "Yeah. We've got a few of those.");
  await sleep(400);
  clearInterval(talking2);
  quiet(tw, 60);
  await sleep(900);
  ok(step("wake_read").length === 2, "a genuinely different turn gets its own answer", step("wake_read").length);
  ok(step("wake_read").every((e) => !!(e.detail as { decidedBy?: string }).decidedBy),
    "…and every row says which of the two decided it",
    step("wake_read").map((e) => (e.detail as { decidedBy?: string }).decidedBy));
  ok(evs().some((e) => e.kind === "hold_end"), "…so the wait ends on the person, not on the advert");
  globalThis.fetch = beforeStub;
  echoListening(room, false);
  restore(); tw.close(); f.close();
}

console.log("\n▶ THE METER IS OFF BY DEFAULT: nothing on the billing list, and it goes off on its own");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const room = "room-billing";
  echoListening(room, true);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999, holdStrategy: "reopen",
    openingClip: { audio: Buffer.alloc(400 * 8, 0x20), ms: 400, text: "do you have any Pokemon cards in stock?" },
    tuning: { ...TUNING_DEFAULTS, charlieMinOnLineMs: 0, charlieThinkingMs: 0 },
  });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "" as never, () => { /* bare */ });
  tw.say({ event: "start", start: { streamSid: "MZ_BILL", customParameters: { room } } });
  await sleep(350);
  for (let i = 0; i < 30; i++) { tw.media(frame(LOUD(160, i % 4))); await sleep(1); }
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(300);
  ok((getReceipt(room)?.events || []).some((e) => e.kind === "charlie_join"), "his session is open and billing");
  // 432'S OWN SHAPE: from here nobody says anything at all — no voice of theirs, no sound of his,
  // nothing handed to him. On 432 that state billed 26 seconds because nothing was watching it.
  const before = (getReceipt(room)?.events || []).filter((e) => e.kind === "charlie_leave").length;
  // The backstop needs its four seconds, and the ruled drop is three more after the wait is called.
  await sleep(11000);
  const evs = getReceipt(room)?.events || [];
  ok(evs.filter((e) => e.kind === "charlie_leave").length > before, "his meter goes off on its own, with nothing to arm it");
  const why = evs.find((e) => (e.detail as { step?: string } | null)?.step === "meter_off_by_default");
  ok(!!why, "…and the record says why: nothing he is billed for was happening");
  restore(); tw.close(); f.close();
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

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
import { setBridgeContext, handleTwilioBridge, weEndedCheck, nudgeSignoff, echoListening, echoHeardStaff } from "../src/voice/bridge";
import { openReceipt, getReceipt, transcriptOf, closeReceipt, rollup, _reset } from "../src/calls/events";
import { isCheckAlive } from "../src/calls/check-life";
import { toMediaFrames } from "../src/calls/clip-cache";
import { TUNING_DEFAULTS, type CallTuning } from "../src/calls/tuning";

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
/** SPEECH, NOT A TONE. LOUD holds the same loudness on every frame, and over about a second of it the
 *  ear rightly calls that a machine tone — a ringback holds a steady amplitude, speech swings hard
 *  from syllable to syllable. Any scene that has to keep somebody TALKING for seconds (a recording
 *  reading its announcement) needs that swing, or it is testing the ringback rule by accident. */
const SPEECH = (i: number) => Buffer.alloc(160, [0x00, 0x22, 0x08, 0x34, 0x02, 0x18][i % 6]);
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
function stubSignedUrl(f: Fake) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // The hello transcriber must NEVER reach the real provider from a unit test.
    if (url.includes("/v1/speech-to-text")) {
      return new Response(JSON.stringify({ text: STT_TEXT }), { status: 200, headers: { "content-type": "application/json" } });
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
  ok(typeof ev?.detail?.gapSec === "number" && (ev.detail.gapSec as number) >= 6, `and how long they were gone (${ev?.detail?.gapSec}s)`);
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
  // CHECK 364'S EXACT SHAPE: five seconds of quiet and Staff are back. A 6 second rule cannot fire
  // inside it; the stale default fired at three and dropped Charlie mid look-around.
  quiet(tw, 5000 / 20);
  await sleep(60);
  ok(!(getReceipt(room)?.events || []).some((e) => e.kind === "hold_start"),
    "five seconds of announced quiet and the Admin's 6 held: no drop on the code default");
  speak(tw, 30);                                   // …Staff are back, the check carries on
  await sleep(60);
  // …and the 6 is a real rule, not a wait that can never start: past six seconds it fires.
  quiet(tw, 7000 / 20);
  await sleep(60);
  ok((getReceipt(room)?.events || []).some((e) => e.kind === "hold_start"),
    "past six seconds the same quiet IS a wait — the Admin number is the one the ear obeys");
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
  const ev = getReceipt("room-nudged-hold")?.events || [];
  ok(ev.some((e) => e.kind === "hold_start"), "quiet before the goodbye is still a wait, never a hang up");
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
  await sleep(250);
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

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

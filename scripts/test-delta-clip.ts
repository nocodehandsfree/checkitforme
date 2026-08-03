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
import { setBridgeContext, handleTwilioBridge, weEndedCheck } from "../src/voice/bridge";
import { openReceipt, getReceipt, transcriptOf, closeReceipt, rollup, _reset } from "../src/calls/events";
import { isCheckAlive } from "../src/calls/check-life";
import { toMediaFrames } from "../src/calls/clip-cache";
import { TUNING_DEFAULTS } from "../src/calls/tuning";

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
function stubSignedUrl(f: Fake) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
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
async function callToHello(f: Fake, clipMs: number, room: string) {
  const audio = Buffer.alloc(clipMs * 8, 0x20); // μ-law 8kHz: 8 bytes per millisecond
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: clipMs, text: "do you have any Pokemon cards in stock?" },
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
  // THE HELLO ITSELF SURVIVES, and it is the bulk of what lands here. The ear needs about 22 frames of
  // voice on a direct dial before it will call anybody a person, and buffering used to start only
  // after that — so the first half second of every greeting, which is where a store says its own name
  // and who is speaking, was thrown away. The customer then read a conversation with no hello in it,
  // opening mid sentence underneath our own question (owner screenshot 07-31). 30 frames of greeting
  // went down this line before we were sure of them, plus 2 said during the clip: nearly all of them
  // have to come out the other side.
  await sleep(700);   // whatever was held before his session answered paces out at speaking speed
  ok(f.chunks.length >= 25, `the greeting said BEFORE we were sure of them is kept and reaches him too (${f.chunks.length} frames)`);
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
  const r = getReceipt("room-reopen")!;
  ok(r.segments.length === 2, "two numbered stretches on one receipt");
  // …and the gate opens the moment the CARRIER says the line ended, so the check finalizes as normal.
  closeReceipt("room-reopen", "Check ended", "completed");
  ok(!(await isCheckAlive("room-reopen")), "once the carrier hangs up the line is down, and the verdict may land");
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
  ok(notes.length === 1, `exactly one note reached him, not spoken to the store (${notes.length})`);
  ok(/may be someone new/i.test(notes[0] || ""), "and it warns him the person may be someone new, so he asks again instead of carrying on");
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
  ok(notes.length === 1 && /may be someone new/i.test(notes[0]), "he is told the person may be someone new, so he asks again");
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
  ok(notes.length === 1 && /may be someone new/i.test(notes[0]), "he is told the person may be someone new, so he asks again");
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
  // …and NOW they walk off, before the address comes back.
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

console.log("\n▶ a fast return, then the OLD session's close lands: the check survives it");
{
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const tw = await callWithHold(f, "room-race-close", "reopen");
  speak(tw, 150);
  ok(f.sockets.length === 1, "one session while somebody is with us");
  const first = f.sockets[0];
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
console.log("\n▶ the greeting is kept whole, with the pauses that are inside it");
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
  // The question finishes, and THEN they answer.
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(800);                                   // past our own audio, so this is really them
  for (let i = 0; i < 25; i++) tw.media(frame(LOUD(160, i % 3)));
  await sleep(3500);                                  // the handover paces out at the speed it was spoken, and it is a real clock: give it room

  const QUIET = Buffer.alloc(160, 0x7f).toString("base64");
  const handed = f.chunks;
  // THE PAUSES INSIDE THE GREETING SURVIVED. Keeping only the loud frames would hand over the ~60
  // spoken ones alone; the breaths between the phrases have to be in there too, in their places,
  // or the sentence is squeezed and comes back as different words.
  ok(handed.length >= greetingFrames, `the greeting was handed over whole, breaths and all (${handed.length} frames, spoken ${greetingFrames})`);
  ok(handed.slice(0, greetingFrames).filter((c) => c === QUIET).length >= 8,
    `…and the pauses INSIDE it are still there (${handed.slice(0, greetingFrames).filter((c) => c === QUIET).length} quiet frames), so the sentence is not squeezed`);
  // …AND IT REACHED HIM OVER REAL TIME. This is what makes their greeting and their answer two
  // turns: the transcriber hears the gap between them pass on a clock. Injected silence cannot do
  // it, which is why two shipped attempts at that changed nothing on his phone.
  const span = f.chunkAt[f.chunkAt.length - 1] - f.chunkAt[0];
  ok(span > 500, `it arrived spread over ${span}ms, not in one instant, so the pauses in it are real`);
  ok(handed.slice(greetingFrames).some((c) => c !== QUIET), "their answer is in there too, after the greeting");
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
  const f = await fakeProvider({ readyDelayMs: 700 });   // his session takes a moment, so audio is held
  const restore = stubSignedUrl(f);
  const room = "room-paced";
  const audio = Buffer.alloc(3000 * 8, 0x20);
  openReceipt(room, { lane: "direct" });
  setBridgeContext(room, {
    agentId: "agent_normal", midCallAgentId: "agent_joining",
    dynamicVars: { opening_line: "do you have any Pokemon cards in stock?" },
    connectOnHuman: true, holdMaxSeconds: 999,
    openingClip: { audio, ms: 3000, text: "do you have any Pokemon cards in stock?" },
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
  await sleep(2200);                             // his session reports ready inside this, and the handover paces out

  ok(f.chunks.length >= 40, `he received the greeting (${f.chunks.length} frames)`);
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
// ROUND 1, ITEM 1.8 — THE PER RING LINES ARE DELETED, THE GIVE-UP RULE STAYS.
// "Ring 2 went unanswered" tells the owner nothing and costs nothing, because Charlie is off while a
// phone rings, and six of them bury the lines that matter. Counting them still stops us waiting
// forever at a department nobody works at.
console.log("\n▶ a department that rings out: no line per ring, and we still give up and say so");
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
  ok(ev.filter((e) => e.kind === "ringing").length === 1, `the desk ringing is ONE line, said once (${ev.filter((e) => e.kind === "ringing").length})`);
  ok(f.sockets.length === 0, "Charlie was never opened onto a ringing desk, so nothing billed");
  const bye = ev.find((e) => e.kind === "hangup");
  ok(!!bye && (bye.note || "").startsWith("Nobody picked up after 6 rings"), `we gave up and said so, once (${bye?.note})`);
  ok(tw.readyState === 3, "…and the check ended there rather than waiting forever");
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
  // …and they walk away and never come back.
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
  // Staff name themselves, and he thanks them by name on the way out.
  f.sockets[0].send(JSON.stringify({ type: "user_transcript", user_transcription_event: { user_transcript: "Fun store, this is Bob, how can I help you?" } }));
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
  setBridgeContext("room-counter", { agentId: "agent_normal", dynamicVars: {}, connectOnHuman: true, holdStrategy: "reopen" });
  const tw = new FakeTwilio();
  handleTwilioBridge(tw as never, "room-counter", () => { /* none */ });
  tw.say({ event: "start", start: { streamSid: "MZ_c", customParameters: { room: "room-counter" } } });
  await sleep(350);
  for (let i = 0; i < 40; i++) tw.media(frame(SPEECH(i)));               // "Fun store, this is Bob"
  for (let i = 0; i < PERSON_PAUSE; i++) tw.media(frame(Buffer.alloc(160, 0x7f)));
  await sleep(250);
  ok(f.sockets.length === 1, "he opened on a real person, as he should");
  // …and the handset goes down on the counter. The store is still perfectly audible: a till, a
  // radio, two people talking by the door. Just nowhere near as loud as somebody speaking into it.
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

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

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
import { setBridgeContext, handleTwilioBridge } from "../src/voice/bridge";
import { openReceipt, getReceipt, transcriptOf, lineStillUp, closeReceipt, rollup, _reset } from "../src/calls/events";
import { toMediaFrames } from "../src/calls/clip-cache";

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

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- audio helpers ---------------------------------------------------------------------------
// μ-law: 0x00 decodes to a very loud sample, 0x7F to silence. That is all we need to make the ear
// hear "someone is talking" or "the line is quiet".
const LOUD = (n = 160, jitter = 0) => Buffer.alloc(n, 0x00).map((_, i) => (jitter && i % (3 + jitter) === 0 ? 0x10 : 0x00)) as Buffer;
const frame = (b: Buffer) => b.toString("base64");

// ---- the fake voice provider -----------------------------------------------------------------
interface Fake { url: string; close: () => void; sockets: WS[]; chunks: string[]; inits: string[]; agentIdsAsked: string[]; raw: string[] }
async function fakeProvider(opts: { speakImmediately?: boolean } = {}): Promise<Fake> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.on("listening", r));
  const port = (wss.address() as { port: number }).port;
  const f: Fake = { url: `ws://127.0.0.1:${port}`, close: () => wss.close(), sockets: [], chunks: [], inits: [], agentIdsAsked: [], raw: [] };
  wss.on("connection", (ws) => {
    f.sockets.push(ws);
    ws.on("message", (d: Buffer) => {
      const s = d.toString();
      if (!s.includes("user_audio_chunk")) f.raw.push(s);   // everything except the audio firehose
      const m = JSON.parse(s) as { type?: string; user_audio_chunk?: string };
      if (m.type === "conversation_initiation_client_data") {
        f.inits.push(s);
        ws.send(JSON.stringify({ type: "conversation_initiation_metadata", conversation_initiation_metadata_event: { conversation_id: "conv_test_1" } }));
        // An agent that opens its mouth the instant it is ready. Nothing it says may reach the line
        // while our own question is still playing.
        if (opts.speakImmediately) ws.send(JSON.stringify({ type: "audio", audio_event: { audio_base_64: frame(Buffer.alloc(160, 0x40)) } }));
      } else if (m.user_audio_chunk) f.chunks.push(m.user_audio_chunk);
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
  for (let i = 0; i < 70; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
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
  console.log("▶ the clerk answers early: held, not lost, not delivered yet");
  tw.media(frame(LOUD(160, 1)));
  tw.media(frame(LOUD(160, 2)));
  await sleep(60);
  ok(f.chunks.length === 0, "nothing reached the agent while he was still warming up");

  console.log("▶ the carrier confirms the clip played: the gate opens and the words are released");
  tw.say({ event: "mark", mark: { name: "delta-opening" } });
  await sleep(60);
  // THE HELLO ITSELF SURVIVES, and it is the bulk of what lands here. The ear needs about 22 frames of
  // voice on a direct dial before it will call anybody a person, and buffering used to start only
  // after that — so the first half second of every greeting, which is where a store says its own name
  // and who is speaking, was thrown away. The customer then read a conversation with no hello in it,
  // opening mid sentence underneath our own question (owner screenshot 07-31). 30 frames of greeting
  // went down this line before we were sure of them, plus 2 said during the clip: nearly all of them
  // have to come out the other side.
  ok(f.chunks.length >= 25, `the greeting said BEFORE we were sure of them is kept and released too (${f.chunks.length} frames)`);
  ok(f.chunks.length >= 2, `the held words were released whole (${f.chunks.length} frames)`);
  // TWO TURNS, NOT ONE. Their hello and their answer to our question are both held for the same
  // reason and were handed over as one unbroken stretch, so they came back as ONE sentence: the store
  // appeared to greet us and answer a question it had never been asked, and our own two lines printed
  // back to back with nothing between them (owner screenshot 07-31). A beat of quiet is the only thing
  // that ends a turn, so one is sent between the two.
  {
    const QUIET = Buffer.alloc(160, 0x7f).toString("base64");
    const gap = f.chunks.filter((x) => x === QUIET).length;
    ok(gap >= 30, `a real pause separates their hello from their answer, so it is two lines not one (${gap} quiet frames)`);
    ok(f.chunks[f.chunks.length - 1] === QUIET, "the pause comes AFTER their hello, so whatever they say next is its own line");
  }
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

console.log("\n▶ he starts warming up LATE, so his meter does not run through the whole question");
{
  // He bills from the second his session opens, so warming him up at the start of a five second
  // question would buy five seconds of dead air on every call. He starts two seconds before the end.
  _reset();
  const f = await fakeProvider();
  const restore = stubSignedUrl(f);
  const { tw } = await callToHello(f, 5000, "room-late");
  await sleep(200);
  ok(f.inits.length === 0, "not connected at all through the first stretch of the question");
  console.log("  …and the clerk answering in that window is still held, not dropped");
  tw.media(frame(LOUD(160, 1)));
  await sleep(2900);                       // now past clip end minus the two second lead
  ok(f.inits.length === 1, "connected by the time the question is finishing");
  ok(f.chunks.length === 0, "still nothing delivered — the question has not ended yet");
  await sleep(2400);                       // past the end of the five second question
  ok(f.chunks.length >= 1, "and the words spoken before he even existed were released to him");
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
  tw.media(frame(LOUD(160, 1)));         // an early answer, while the clip plays
  await sleep(120);
  ok(f.chunks.length === 0, "still held at 120ms into a 300ms clip");
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
  for (let i = 0; i < 70; i++) { tw.media(frame(Buffer.alloc(160, 0x7f))); }
  await sleep(120);
  return tw;
}
/** Someone talking: sound with the gaps real speech has. */
const speak = (tw: FakeTwilio, frames: number) => { for (let i = 0; i < frames; i++) tw.media(frame(i % 5 === 4 ? Buffer.alloc(160, 0x7f) : LOUD())); };
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
    ok(lineStillUp("room-reopen"), "no verdict can be stamped while Charlie is dropped, because the line is still up");
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
  ok(!lineStillUp("room-reopen"), "once the carrier hangs up the line is down, and the verdict may land");
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

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

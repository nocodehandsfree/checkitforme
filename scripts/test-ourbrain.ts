// CHARLIE'S REPLIES MADE BY OUR OWN BRAIN, PROVEN END TO END (owner's go, 2026-08-20).
//
// Run: ./node_modules/.bin/tsx scripts/test-ourbrain.ts   (and on EVERY build, test-all.sh)
//
// WHAT THIS IS FOR. The owner ruled the blocked road closed: the voice provider refuses to let their
// conversation service call our brain on any agent using a quick-made voice copy, and every voice we
// call with is one. So we run the conversation ourselves and their PLAIN SPEECH service says each
// finished line in the same voice — the identical machinery his fresh "Oh, hey!" already uses.
//
// A FULL TURN IS: their words in -> our brain writes the reply -> the speech service makes the sound
// -> the sound comes back out as the same message the provider's own session would have sent. Every
// one of those steps is measured here, with both outside services stubbed at the one place they talk
// to the world, so this costs nothing, never flakes, and re-runs forever.
//
// WHAT IS DELIBERATELY NOT TESTED HERE: whether the sound reaches the store. That is the bridge's
// decision and its rules (nothing over the person, a hold means he is off, the two-word hello first)
// are driven in scripts/test-delta-clip.ts against the real engine, on purpose — this session wears
// the provider's own message protocol so that there is exactly ONE set of those rules.
import { openOurBrainSession, OurBrainSession } from "../src/voice/ourbrain-session";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, saw?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${m}`); }
  else { fail++; console.log(`  ✗ ${m}${saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** μ-law bytes per millisecond, the same identity the whole call path uses. */
const BYTES_PER_MS = 8;

/** Both outside services, stubbed at their own URLs. `thinkMs` and `speakMs` are how long each is
 *  told to take, so the timing this file measures is the timing the code really produced. */
function stubTheWorld(o: { reply?: string; thinkMs?: number; speakMs?: number; soundMs?: number; modelFails?: boolean; voiceFails?: boolean }) {
  const real = globalThis.fetch;
  let asked = 0, spoke = 0, spokenText = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    // THE SPEECH SERVICE: the same endpoint the opening question and the little hello already use.
    if (url.includes("/v1/text-to-speech/")) {
      spoke++;
      try { spokenText = String(JSON.parse(String(init?.body ?? "{}")).text ?? ""); } catch { spokenText = ""; }
      await sleep(o.speakMs ?? 5);
      if (o.voiceFails) return new Response("no", { status: 500 });
      return new Response(Buffer.alloc((o.soundMs ?? 600) * BYTES_PER_MS, 0x30), { status: 200 });
    }
    // OUR OWN BRAIN, on whichever account the model names. It streams, so the stub streams too.
    if (/messages|chat\/completions/.test(url)) {
      asked++;
      await sleep(o.thinkMs ?? 5);
      if (o.modelFails) return new Response("upstream is down", { status: 503 });
      const body = `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: o.reply ?? "Oh nice, is it a pack or a box?" } })}\n\ndata: [DONE]\n\n`;
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return (real as typeof globalThis.fetch)(input, init);
  }) as typeof globalThis.fetch;
  return { restore: () => { globalThis.fetch = real; }, counts: () => ({ asked, spoke, spokenText }) };
}

/** One session, with everything it says back collected in order. */
function sessionUnderTest(onStumble?: (why: string) => void) {
  const said: Array<Record<string, unknown>> = [];
  const stumbles: string[] = [];
  const s: OurBrainSession = openOurBrainSession({
    dynamicVars: { category: "Pokémon cards", personality: "warm", set_example: "Chaos Rising" },
    voiceId: "voice_test",
    room: "room-under-test",
    log: () => { /* quiet */ },
    onStumble: (why) => { stumbles.push(why); onStumble?.(why); },
  });
  s.on("message", (b: Buffer) => { try { said.push(JSON.parse(String(b))); } catch { /* not ours */ } });
  const of = (type: string) => said.filter((m) => m.type === type);
  return { s, said, stumbles, of };
}

console.log("▶ A FULL TURN, END TO END: their words in, his voice out");
{
  const world = stubTheWorld({ reply: "Oh nice, is it a pack or a box?", thinkMs: 40, speakMs: 20, soundMs: 640 });
  const { s, of, stumbles } = sessionUnderTest();
  await sleep(20);
  ok(of("conversation_initiation_metadata").length === 1, "the session comes up on its own: there is nothing to dial");
  // THE ID NAMES OUR OWN RECORD, because there is no conversation at the voice provider to name.
  // Every door that settles a check asks them for the outcome; on this lane that question is
  // answered off the record instead, and this is the string that routes it there.
  {
    const md = of("conversation_initiation_metadata")[0] as { conversation_initiation_metadata_event?: { conversation_id?: string } };
    ok(md?.conversation_initiation_metadata_event?.conversation_id === "ours:room-under-test",
      "…and it names our own record, so every settling door can still read an outcome",
      md?.conversation_initiation_metadata_event?.conversation_id);
  }
  const started = Date.now();
  s.send(JSON.stringify({ type: "user_message", text: "Yeah, we've got a few of those." }));
  await sleep(300);
  const reply = of("agent_response")[0] as { agent_response_event?: { agent_response?: string } } | undefined;
  ok(!!reply, "their words draw exactly one reply");
  ok(reply?.agent_response_event?.agent_response === "Oh nice, is it a pack or a box?",
    "…in the words our own brain wrote", reply?.agent_response_event?.agent_response);
  const audio = of("audio");
  ok(audio.length > 0, "…and the sound of those words comes back as the provider's own audio message", audio.length);
  // 640ms of μ-law in 20ms frames is 32 of them. The bridge counts a frame as 20ms, so this is also
  // exactly how long the store hears him for.
  ok(audio.length === 32, "…in 20 millisecond frames, so his sound is as long as his words really are", audio.length);
  ok(world.counts().spokenText === "Oh nice, is it a pack or a box?",
    "…and the speech service was asked for the SAME words he is recorded as saying", world.counts().spokenText);
  ok(stumbles.length === 0, "…with nothing stumbling");
  ok(Date.now() - started < 1500, "…and the whole turn took well under a second and a half of real time", Date.now() - started);
  s.close();
  world.restore();
}

console.log("\n▶ HE NEVER READS A TOOL'S NAME AT A PERSON");
{
  // CHECK 426: the store heard "…have a good one! end_call". His instructions name the tools the
  // hosted agent is given, and a model writing the word instead of using the tool would read it out.
  const world = stubTheWorld({ reply: "Perfect, thanks so much, have a good one! end_call", soundMs: 200 });
  const { s, of } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "Sorry, that's all I know." }));
  await sleep(250);
  const said = (of("agent_response")[0] as { agent_response_event?: { agent_response?: string } })?.agent_response_event?.agent_response;
  ok(said === "Perfect, thanks so much, have a good one!", "the tool's name is never part of what he says", said);
  ok(world.counts().spokenText === said, "…and the speech service is asked for exactly those words", world.counts().spokenText);
  s.close();
  world.restore();
}

console.log("\n▶ THE ORDER, EXACTLY: the words are sent before the first frame of sound");
{
  const world = stubTheWorld({ reply: "Got it, thanks!", soundMs: 200 });
  const { s, said } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "We have some." }));
  await sleep(250);
  const iWords = said.findIndex((m) => m.type === "agent_response");
  const iSound = said.findIndex((m) => m.type === "audio");
  ok(iWords >= 0 && iSound > iWords, "his words are sent first and his sound after", { iWords, iSound });
  s.close();
  world.restore();
}

console.log("\n▶ THE CALL'S AUDIO IS NOT HIS TO HEAR: Echo does the listening");
{
  const world = stubTheWorld({});
  const { s, said } = sessionUnderTest();
  await sleep(20);
  const before = said.length;
  for (let i = 0; i < 50; i++) s.send(JSON.stringify({ user_audio_chunk: "AAAA" }));
  await sleep(120);
  ok(said.length === before, "not one frame of the call draws anything: the words come from Echo, never from audio", said.length - before);
  ok(world.counts().asked === 0, "…and nothing was ever asked of our brain about them", world.counts().asked);
  s.close();
  world.restore();
}

console.log("\n▶ A NOTE IS A NOTE: it is never answered out loud");
{
  const world = stubTheWorld({});
  const { s, of } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "contextual_update", text: "[They were away 26 seconds and it may be somebody new.]" }));
  await sleep(150);
  ok(of("agent_response").length === 0, "a note draws no reply", of("agent_response").length);
  ok(of("audio").length === 0, "…and no sound", of("audio").length);
  ok(world.counts().asked === 0, "…and costs nothing", world.counts().asked);
  s.close();
  world.restore();
}

console.log("\n▶ WORDS THAT LAND WHILE HE IS STILL WRITING ARE ANSWERED THE MOMENT HE STOPS");
{
  // The owner's rule, unchanged from the hosted lane: he answers one turn at a time, and anything
  // said into the middle of his thinking is the next thing he answers, never lost and never a
  // second reply talking over the first.
  const world = stubTheWorld({ reply: "Okay!", thinkMs: 120, soundMs: 200 });
  const { s, of } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "Yeah we have them." }));
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "Pitch Black, the booster boxes." }));
  await sleep(120);
  ok(of("agent_response").length === 1, "only one reply is being made at a time", of("agent_response").length);
  await sleep(500);
  ok(of("agent_response").length === 2, "…and the words that landed mid thought are answered next, not lost", of("agent_response").length);
  ok(world.counts().asked === 2, "…which is two turns of our brain, never one merged answer", world.counts().asked);
  s.close();
  world.restore();
}

console.log("\n▶ THE FALLBACK IS LAW: our side stumbling hands the call back, and says nothing out loud");
{
  const world = stubTheWorld({ modelFails: true });
  const { s, of, stumbles } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "We've got a few." }));
  await sleep(400);
  ok(stumbles.length === 1, "our brain failing is reported once, so the call can go back to the provider's", stumbles.length);
  ok(of("agent_response").length === 0, "…and NOTHING is said out loud about it", of("agent_response").length);
  ok(of("audio").length === 0, "…and not one frame of sound is made", of("audio").length);
  s.close();
  world.restore();
}
{
  // …and the same when the words are written but his voice cannot be made.
  const world = stubTheWorld({ voiceFails: true });
  const { s, of, stumbles } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "We've got a few." }));
  await sleep(400);
  ok(stumbles.length === 1, "his voice failing to be made hands the call back too", stumbles.length);
  ok(of("audio").length === 0, "…with no sound made", of("audio").length);
  s.close();
  world.restore();
}

console.log("\n▶ A CLOSED SESSION IS SILENT, AND KEEPS NOTHING");
{
  const world = stubTheWorld({ thinkMs: 200 });
  const { s, of } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "We've got a few." }));
  s.close();
  await sleep(400);
  ok(of("agent_response").length === 0, "a reply that lands after the call ended is never spoken", of("agent_response").length);
  ok(s.readyState === 3, "…and the session reads closed, the way a real socket does", s.readyState);
  world.restore();
}

console.log("\n▶ HIS INSTRUCTIONS ARE THE SAME ONES, WORD FOR WORD");
{
  // The hosted agent is configured with RESTOCK_PROMPT filled from these same variables. Moving
  // where the thinking happens may never change what he was told to do, so what our brain is asked
  // is checked against the prompt itself.
  const { RESTOCK_PROMPT } = await import("../src/voice/prompts");
  let systemSent = "";
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (/messages|chat\/completions/.test(url)) {
      try {
        const b = JSON.parse(String(init?.body ?? "{}")) as { system?: string; messages?: Array<{ role: string; content: string }> };
        systemSent = b.system ?? (b.messages || []).find((m) => m.role === "system")?.content ?? "";
      } catch { systemSent = ""; }
      return new Response(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Okay!" } })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (url.includes("/v1/text-to-speech/")) return new Response(Buffer.alloc(160, 0x30), { status: 200 });
    return (real as typeof globalThis.fetch)(input, init);
  }) as typeof globalThis.fetch;
  const { s } = sessionUnderTest();
  await sleep(20);
  s.send(JSON.stringify({ type: "user_message", text: "We've got a few." }));
  await sleep(250);
  ok(systemSent.includes("You're on the phone with a Staff member at a retail store"),
    "our brain is given Charlie's own instructions");
  ok(systemSent.includes("Pokémon cards"), "…with this check's own variables filled in", systemSent.slice(0, 60));
  ok(!systemSent.includes("{{"), "…and not one placeholder left unfilled");
  ok(RESTOCK_PROMPT.includes("{{category}}"), "…off the very prompt the hosted agent is configured with");
  s.close();
  globalThis.fetch = real;
}

console.log(`\n════════════════════════════════`);
console.log(`  PASS: ${pass}   FAIL: ${fail}`);
console.log(`════════════════════════════════`);
if (fail > 0) process.exit(1);

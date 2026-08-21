// THE CUSTOMER'S SCREEN MAY NEVER SAY WE NEVER GOT AN ANSWER WHILE THE CHECK IS STILL HAPPENING.
//
// Run: env DATABASE_URL=file:./.t-screen.db PORT=8796 ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-screen-status.ts
//
// THE 08-07 SCREEN FAULT, CAUGHT LIVE ON CHECK 435 (owner's item 5). His screen read "Left on hold ·
// They kept us on hold and the call dropped" on a check whose own record settled in stock four
// seconds later, and the card never repainted, because the page pins the FIRST keyed answer it is
// ever given (the 08-06 no-flicker rule).
//
// WHERE IT CAME FROM. Charlie's conversation at ElevenLabs ENDS on every hold — that is the only
// thing that stops his meter — so asking them about it mid-check gets a finished conversation back,
// carrying THEIR status key. They decide that key off the wording of the last thing Staff said, and
// "One moment. I'll go and have a look." is left on hold to them every single time. `/pub/result`
// has four ways out; three of them ask the record first. The fourth spread that raw outcome whole,
// key and all, straight onto a customer's screen — and because it never asked the record, the
// door-naming row added the same week never caught it either.
//
// A row still dialing, queued or in progress is a check still happening, whatever the provider
// thinks of a session it closed. The check's own row is what says whether it is over.
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { callResults, callEvents, retailers, categories } from "../src/db/schema";
import { eq } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, saw?: unknown) => {
  console.log(`  ${c ? "✓" : "✗"} ${m}${!c && saw !== undefined ? `  (saw ${JSON.stringify(saw)})` : ""}`);
  c ? pass++ : fail++;
};

/** ElevenLabs' own record of a conversation that ENDED, exactly as it comes back mid-hold: Staff's
 *  last words are them stepping away, which is what their reader turns into "left on hold". */
const CONVERSATION = (id: string) => ({
  conversation_id: id,
  status: "done",
  metadata: { call_duration_secs: 22, termination_reason: "" },
  transcript: [
    { role: "agent", message: "Hi there! I was just checking, do you have any Pokemon cards in stock right now?" },
    { role: "user", message: "One moment. I'll go and have a look." },
  ],
  analysis: { data_collection_results: {} },
});

async function main() {
  await bootstrap();
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    const m = /\/convai\/conversations\/([^/?]+)/.exec(url);
    if (m) return new Response(JSON.stringify(CONVERSATION(m[1])), { status: 200, headers: { "content-type": "application/json" } });
    return (real as typeof globalThis.fetch)(input, init);
  }) as typeof globalThis.fetch;

  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8796"}`;
  await new Promise((r) => setTimeout(r, 500));
  const screen = async (cid: string) => {
    const r = await fetch(`${base}/pub/result/${cid}`);
    return (await r.json()) as Record<string, unknown>;
  };

  // Prove the provider really does hand us that key, so the rest of this is not testing a stub that
  // happens to say nothing. If this row ever goes green for the wrong reason, this line goes red.
  const { provider } = await import("../src/calls/service");
  const raw = await provider.getConversation("conv_proof_of_the_key");
  console.log("▶ THE KEY REALLY IS THERE, on ElevenLabs' own record of a conversation that ended");
  ok(raw?.status === "completed", "they call the conversation completed, because Charlie's session ended", raw?.status);
  ok(raw?.statusKey === "left_on_hold", "…and their key for it is left on hold, off Staff's wording alone", raw?.statusKey);

  console.log("\n▶ A CHECK THIS DOOR CANNOT NAME NEVER HANDS A CUSTOMER A VERDICT (check 435's fault)");
  {
    // No row answers to this name — which is the real shape: at a comeback Charlie reconnects as a
    // NEW conversation, and the page can ask by an id the row is not pointed at yet.
    const s = await screen("conv_no_row_answers_to_this");
    ok(s.statusKey === undefined, "no status key reaches the page", s.statusKey);
    ok(s.confirmed === undefined, "…and no yes or no either", s.confirmed);
    ok(!JSON.stringify(s).includes("left_on_hold"), "…so nothing in the answer can paint Left on hold", s);
  }

  console.log("\n▶ …AND A CHECK WE CAN NAME HAS ITS KEY CHECKED AGAINST ITS OWN RECORD FIRST");
  {
    // Aliveness is not this door's job — the gatekeeper above it is the witness, and it stays the
    // witness. What this proves is the other half: a key that reaches a customer has been through
    // the record, exactly like the three doors above. This check was held and Staff came back, so
    // the record says the wait ENDED, and the wording reader's "left on hold" cannot stand over it.
    await db.insert(retailers).values({ id: 990001, name: "QA Screen Store", location: "Reseda, CA", lat: 34.2, lng: -118.54, active: true, phone: "+13105550991" } as never).onConflictDoNothing();
    const catId = (await db.select({ id: categories.id }).from(categories).limit(1))[0]?.id ?? 1;
    const cid = "conv_row_we_can_name";
    const room = "room-screen-named";
    await db.delete(callResults).where(eq(callResults.providerCallId, cid));
    await db.delete(callEvents).where(eq(callEvents.room, room));
    await db.insert(callResults).values({
      retailerId: 990001, categoryId: catId, status: "no_answer", statusKey: "left_on_hold",
      providerCallId: cid, room, startedAt: Math.floor(Date.now() / 1000),
      transcript: "Agent: any Pokemon cards?\nClerk: one moment, I will go and have a look.",
    } as never);
    await db.insert(callEvents).values([
      { callId: 0, room, atMs: 13144, atSec: 13, kind: "hold_start", note: "Staff stepped away", detail: JSON.stringify({ reason: "music" }) },
      { callId: 0, room, atMs: 42886, atSec: 42, kind: "hold_end", note: "Staff came back", detail: JSON.stringify({ gapSec: 28 }) },
    ] as never);
    const s2 = await screen(cid);
    ok(s2.statusKey !== "left_on_hold",
      "the wait ended on the record, so the screen may not say left on hold", s2.statusKey);
    ok(s2.statusKey === "no_clear_answer", "…it says the honest thing instead", s2.statusKey);
    await db.delete(callEvents).where(eq(callEvents.room, room));
  }

  console.log("\n▶ …WHILE A CHECK THAT REALLY IS OVER STILL GETS ITS ANSWER, so nothing was loosened");
  {
    const cid = "conv_row_really_finished";
    await db.delete(callResults).where(eq(callResults.providerCallId, cid));
    await db.insert(callResults).values({
      retailerId: 990001, categoryId: (await db.select({ id: categories.id }).from(categories).limit(1))[0]?.id ?? 1,
      status: "no_answer", statusKey: "nobody_answered", providerCallId: cid,
      room: "room-screen-finished", startedAt: Math.floor(Date.now() / 1000),
    } as never);
    const s = await screen(cid);
    ok(typeof s.statusKey === "string" && s.statusKey.length > 0, "a finished check still hands a key", s.statusKey);
    ok(s.statusKey !== "left_on_hold", "…and it is the record's key, never the wording reader's", s.statusKey);
  }

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

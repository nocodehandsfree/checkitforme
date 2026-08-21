// THE DROPPED CALL, AGAINST A REAL DATABASE (spec: the live call runtime, section 8).
// Run: env DATABASE_URL=file:./.t-drop.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-dropped-call.ts
//
// The spec says, in as many words: "Verify this on a real dropped call rather than trusting the
// read." The claim being verified is that the one-hour block will not count a call that broke on our
// end, so a customer whose check we ruined can try that same store again immediately.
//
// That claim rests on `findRecentCheck` matching ONLY rows with status `completed`. It is the kind
// of thing that is true in a comment and false in a query, and the cost of it being false is a
// paying customer locked out of the store they wanted, by our own bug. So it is checked here against
// a real row in a real database, through the real function, not read off the source.
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { callEvents, callResults, retailers, categories, statuses } from "../src/db/schema";
import { findRecentCheck, recentlyDropped, weHungUpOnAHold, diedOnAHold, staffHungUpOn, billableOutcome, statusFromTheRecord } from "../src/calls/service";
import { finishedRecordFromDb, findCheckRow, roomOfCheckId } from "../src/calls/receipt-store";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const now = () => Math.floor(Date.now() / 1000);

async function main() {
  await bootstrap();
  const [cat] = await db.select().from(categories).limit(1);
  const [store] = await db.insert(retailers).values({ name: "Fun store", phone: "+13105550123", location: "LA" }).returning();
  const USER = "phone:+13105550000";

  console.log("▶ the status exists, with wording a customer can act on");
  {
    const s = (await db.select().from(statuses).where(eq(statuses.key, "call_dropped")))[0];
    ok(!!s, "call_dropped is seeded");
    ok(s?.tone === "unk", "it is not a yes and not a no — it is a non-result");
    ok(/no charge/i.test(s?.note ?? ""), `the customer is told they were not charged: "${s?.note}"`);
    ok(!/[—–]/.test(s?.note ?? ""), "no dash inside the sentence (copy law)");
    ok(/again/i.test(s?.note ?? ""), "and that they can try again right away");
  }

  console.log("\n▶ the wait we ended ourselves reads as left on hold (round 1, item 1.6)");
  {
    // The read of the conversation cannot know this. Charlie is dropped for a wait, so from his side
    // the check simply stopped, and what the customer would be told then depends on whether Staff
    // happened to say "hold on" out loud before they walked off. The check's own timeline knows, and
    // it is written to the database as it happens, so the answer survives a restart in between.
    const room = "room-held-cap-test";
    // THIS TEST CLEANS UP AFTER ITSELF. It writes practice lines into a REAL database, and left
    // behind they are a landmine: the next run finds the previous run's hang-up already sitting
    // there and "a wait on its own is not us hanging up" fails on a database that is telling the
    // truth. Cleared before, so an old database can never poison a run, and cleared after, so this
    // one never poisons the next.
    await db.delete(callEvents).where(eq(callEvents.room, room));
    await db.insert(callEvents).values({ callId: 0, room, atMs: 4000, atSec: 4, kind: "hold_start", note: "Staff stepped away, the line went quiet", detail: JSON.stringify({ reason: "quiet" }) });
    ok(!(await weHungUpOnAHold(room)), "a wait on its own is not us hanging up");
    await db.insert(callEvents).values({ callId: 0, room, atMs: 124000, atSec: 124, kind: "hangup", note: "The store put us on hold too long, so we hung up", detail: JSON.stringify({ reason: "held_too_long", afterSec: 120 }) });
    ok(await weHungUpOnAHold(room), "…and once we hang up at the cap, the check says so");
    ok(!(await weHungUpOnAHold("no-such-room")), "a check that never waited says nothing of the kind");
    ok(!(await weHungUpOnAHold(null)), "…and a row with no room can never claim it");
    const s = (await db.select().from(statuses).where(eq(statuses.key, "left_on_hold")))[0];
    ok(!!s, "the status the customer reads already exists, so no new word was invented");
    ok(!/[\u2014\u2013]/.test(s?.note ?? ""), "no dash inside the sentence (copy law)");
    await db.delete(callEvents).where(eq(callEvents.room, room));
    ok((await db.select().from(callEvents).where(eq(callEvents.room, room))).length === 0, "and it leaves nothing of its own behind, so running it twice reads the same");
  }

  console.log("\n▶ a check that DIES mid-hold reads as left on hold, whoever hung up (check 389, test seven)");
  {
    // Scene 6's card: "They kept us on hold and the call dropped." On check 389 the robot store's
    // own hang-up beat our 120s hold cap by two seconds, and the settle read the database in the
    // same millisecond the hang-up row was being written — so no ending was found and the reader's
    // "no clear answer" stood over a check that died mid-hold. The hold events were committed two
    // minutes earlier, so the answer anchored on THEM cannot lose that race: a hold that opened and
    // never closed IS the ending, whoever put the phone down.
    const room = "room-died-on-hold-test";
    await db.delete(callEvents).where(eq(callEvents.room, room));
    ok(!(await diedOnAHold(room)), "a check with no hold claims nothing");
    await db.insert(callEvents).values({ callId: 0, room, atMs: 16000, atSec: 16, kind: "hold_start", note: "Staff stepped away, the line went quiet", detail: JSON.stringify({ reason: "quiet" }) });
    ok(await diedOnAHold(room), "a hold that opened and never closed died on hold");
    await db.insert(callEvents).values({ callId: 0, room, atMs: 60000, atSec: 60, kind: "hold_end", note: "Staff back after 44s", detail: JSON.stringify({ gapSec: 44 }) });
    ok(!(await diedOnAHold(room)), "…and Staff coming back closes it, so a normal check claims nothing");
    await db.insert(callEvents).values({ callId: 0, room, atMs: 80000, atSec: 80, kind: "hold_start", note: "Staff stepped away, hold music", detail: JSON.stringify({ reason: "music" }) });
    ok(await diedOnAHold(room), "a second hold that never closed dies on hold too");
    ok(!(await diedOnAHold(null)), "a row with no name can never claim it");
    await db.delete(callEvents).where(eq(callEvents.room, room));
  }

  console.log("\n▶ A CHECK THAT DID NOT END ON A HOLD MAY NEVER SAY IT DID (owner's order, 08-21, item 6)");
  {
    // THE 08-07 SCREEN FAULT, seen again on check 430: the customer's screen read left on hold while
    // the record read in stock. The reader has no timeline — it decides that off the WORDING of the
    // last thing Staff said, and "one moment, I'll go and have a look" is that wording on every
    // hold check there has ever been. The record knows better and now says so.
    const room = "room-430-screen";
    await db.delete(callEvents).where(eq(callEvents.room, room));
    await db.insert(callEvents).values({ callId: 0, room, atMs: 10481, atSec: 10, kind: "hold_start", note: "Staff stepped away", detail: JSON.stringify({ reason: "music" }) });
    await db.insert(callEvents).values({ callId: 0, room, atMs: 18842, atSec: 18, kind: "hold_end", note: "Staff back after 8s", detail: JSON.stringify({ gapSec: 8 }) });
    const key = await statusFromTheRecord(room, null, "left_on_hold", "Agent: do you have any Pokemon cards?\nClerk: one moment, I will go and have a look.");
    ok(key === "no_clear_answer", `the hold ended, so the screen may not say left on hold (${key})`);
    // …and a check that really did end on a wait still says so, exactly as it always has.
    await db.insert(callEvents).values({ callId: 0, room, atMs: 40000, atSec: 40, kind: "hold_start", note: "Staff stepped away again", detail: JSON.stringify({ reason: "quiet" }) });
    const died = await statusFromTheRecord(room, null, "left_on_hold", "Agent: hello?");
    ok(died === "left_on_hold", `a hold that never closed still reads left on hold (${died})`);
    // …and an answer in hand is never touched by any of this.
    const answered = await statusFromTheRecord(room, true, "in_stock", "Agent: thanks!");
    ok(answered === "in_stock", `a check with an answer keeps it, whatever the holds did (${answered})`);
    await db.delete(callEvents).where(eq(callEvents.room, room));
  }

  console.log("\n▶ AND A CHECK THAT CAME BACK WITH AN ANSWER MAY NEVER SAY WE NEVER GOT ONE (08-21, item 5)");
  {
    // THE REST OF THE 08-07 SCREEN FAULT. The three doors above only ever ran on a check with NO
    // answer, so a row carrying a real answer AND a near-miss key walked straight through them: the
    // screen painted "Left on hold" off the key while the record beside it read in stock. That is
    // the owner's sentence, word for word, and it is what these prove.
    const room = "room-answer-outranks-the-key";
    await db.delete(callEvents).where(eq(callEvents.room, room));
    // A check that really was held, really came back, and really answered. It ends on a hold_end,
    // so nothing here is leaning on the timeline — this is the key contradicting the answer.
    await db.insert(callEvents).values({ callId: 0, room, atMs: 13144, atSec: 13, kind: "hold_start", note: "Staff stepped away, hold music", detail: JSON.stringify({ reason: "music" }) });
    await db.insert(callEvents).values({ callId: 0, room, atMs: 43641, atSec: 43, kind: "hold_end", note: "Staff came back", detail: JSON.stringify({ gapSec: 30 }) });
    const yes = await statusFromTheRecord(room, true, "left_on_hold", "Agent: any Pokemon cards?\nClerk: yeah, we've got a few of those.");
    ok(yes === "in_stock", `the record says in stock, so the screen may not say left on hold (${yes})`);
    const no = await statusFromTheRecord(room, false, "left_on_hold", "Agent: any Pokemon cards?\nClerk: no, we're out.");
    ok(no === "not_in_stock", `…and the same the other way, on a no (${no})`);
    for (const k of ["too_busy", "language_barrier", "voicemail", "nobody_answered", "no_clear_answer", "no_straight_answer"]) {
      const got = await statusFromTheRecord(room, true, k, "Agent: any?\nClerk: yeah.");
      ok(got === "in_stock", `"${k}" cannot stand over an answer either (${got})`);
    }
    // THE ANSWERS THEMSELVES ARE NEVER TOUCHED. A no the store really gave us keeps the store's own
    // word for it, and none of these is a reason we failed to get an answer.
    for (const k of ["sold_out", "does_not_sell", "not_in_stock"]) {
      const got = await statusFromTheRecord(room, false, k, "Agent: any?\nClerk: no.");
      ok(got === k, `"${k}" is an answer, so it stands exactly as it was (${got})`);
    }
    ok((await statusFromTheRecord(room, true, "in_stock", "Agent: any?\nClerk: yeah.")) === "in_stock",
      "…and in stock over in stock changes nothing");
    // …and a check with NO answer still reads exactly as it did a moment ago: this changed one
    // branch and left the three doors below it alone.
    ok((await statusFromTheRecord(room, null, "left_on_hold", "Agent: hello?")) === "no_clear_answer",
      "a check with no answer still runs the record's own three questions");
    await db.delete(callEvents).where(eq(callEvents.room, room));
  }

  console.log("\n▶ Staff hanging up before an answer reads as Staff hung up (owner 08-04)");
  {
    const room = "room-staff-hung-up-test";
    await db.delete(callEvents).where(eq(callEvents.room, room));
    ok(!(await staffHungUpOn(room)), "a check with no ending claims nothing");
    await db.insert(callEvents).values({ callId: 0, room, atMs: 33000, atSec: 33, kind: "hangup", note: "The store hung up on us", detail: JSON.stringify({ reason: "store_hung_up" }) });
    ok(await staffHungUpOn(room), "…and once the record says the store ended it, the check says so");
    ok(!(await staffHungUpOn(null)), "a row with no name can never claim it");
    const s2 = (await db.select().from(statuses).where(eq(statuses.key, "staff_hung_up")))[0];
    ok(s2?.label === "Staff hung up", `the status exists, in his words (${s2?.label})`);
    ok(!/[\u2014\u2013]/.test(s2?.note ?? ""), "no dash inside the sentence (copy law)");
    ok(billableOutcome("staff_hung_up", false), "…and it is charged: real minutes were burned on a live person");
    await db.delete(callEvents).where(eq(callEvents.room, room));
  }

  console.log("\n▶ a dropped call does NOT lock the customer out of that store");
  {
    const [dropped] = await db.insert(callResults).values({
      retailerId: store.id, categoryId: cat.id, mode: "restock", finderUserId: USER,
      status: "no_answer", statusKey: "call_dropped", startedAt: now(),
      summary: "The call broke on our end. Nothing was checked, nobody was charged.",
    }).returning();
    ok(dropped.status !== "completed", "it is not written as completed");
    const blocked = await findRecentCheck(USER, store.id, cat.id, 24);
    ok(blocked === null, "the one-hour block does not count it — the customer can check this store again NOW");
  }

  console.log("\n▶ …but a real answer still does block, so nothing was loosened by accident");
  {
    await db.insert(callResults).values({
      retailerId: store.id, categoryId: cat.id, mode: "restock", finderUserId: USER,
      status: "completed", statusKey: "in_stock", confirmed: true, startedAt: now(),
    });
    const blocked = await findRecentCheck(USER, store.id, cat.id, 24);
    ok(blocked !== null, "a completed check still blocks a re-check, exactly as before");
  }

  console.log("\n▶ nobody is charged for a call that broke on our end");
  {
    const rows = await db.select().from(callResults).where(eq(callResults.statusKey, "call_dropped"));
    ok(rows.every((r) => r.chargedAt == null), "no dropped call carries a charge");
    ok(rows.every((r) => r.confirmed == null), "and none of them claims a yes or a no");
  }

  console.log("\n▶ calling straight back opens differently — same customer, same store, same product only");
  {
    ok(await recentlyDropped(store.id, cat.id, USER) === true, "the customer who was cut off gets the reconnect opener");

    // THE ONE THAT MATTERS (owner, 07-28). We dial as the CUSTOMER'S own verified number, so a
    // different customer checking the same store is a different number ringing the clerk's phone.
    // "I just got disconnected" from a number they have never spoken to is a stranger claiming a
    // conversation that never happened — worse than simply saying hello.
    ok(await recentlyDropped(store.id, cat.id, "phone:+13105559999") === false, "a DIFFERENT customer checking the same store gets the normal greeting, because it is their number ringing, not ours");
    ok(await recentlyDropped(store.id, cat.id, null) === false, "and with no known caller we never claim to have been cut off");

    const [other] = await db.insert(retailers).values({ name: "Another store", phone: "+13105550999", location: "LA" }).returning();
    ok(await recentlyDropped(other.id, cat.id, USER) === false, "it never leaks to a different store");
    const [cat2] = await db.insert(categories).values({ label: "One Piece", slug: "onepiece-test" }).returning().catch(() => [null as never]);
    if (cat2) ok(await recentlyDropped(store.id, cat2.id, USER) === false, "nor to a different product at the same store");

    // Age the row past the shelf life. Later on "I just got disconnected" is strange, not natural.
    await db.update(callResults).set({ startedAt: now() - 40 * 60 })
      .where(eq(callResults.statusKey, "call_dropped"));
    ok(await recentlyDropped(store.id, cat.id, USER) === false, "and once the line is stale it falls back to the normal greeting");
  }

  // -------------------------------------------------------------------------------------------
  // A CHECK OUR OWN BRAIN RAN CAN STILL BE SETTLED AFTER A RESTART (owner's order, 08-20).
  // On the hosted lane a settling door asks the voice provider what happened and their answer
  // outlives our restarts. On our own lane there is no conversation of theirs, so the door reads OUR
  // record — and it only ever read the live one, which a deploy empties. Checks 425 and 426 sat on
  // the Testing list unsettled for exactly that, with their whole conversations written down.
  console.log("\n▶ a check our own brain ran is still readable once the process that ran it is gone");
  {
    const room = "room-ourbrain-after-restart";
    const [row] = await db.insert(callResults).values({
      retailerId: store.id, categoryId: cat.id, room, providerCallId: `bridge:${room}`,
      status: "in_progress", startedAt: now() - 300, finderUserId: USER,
      transcript: "Clerk: Yeah, we've got a few of those.\nAgent: Oh nice, is it a pack or a box?\nClerk: Pitch Black, the booster boxes.",
      callSeconds: 60,
    }).returning();
    // NOTHING IS IN MEMORY: this is a fresh process as far as the live record is concerned, exactly
    // as it is after a deploy.
    const before = await finishedRecordFromDb(room);
    ok(before !== null, "the record is found in the database, not in memory");
    ok(before?.over === false, "…and a check with no hang-up row on it is NOT called finished");
    await db.insert(callEvents).values({ callId: row.id, room, atMs: 60000, atSec: 60, kind: "hangup", note: "Check ended", detail: null });
    const after = await finishedRecordFromDb(room);
    ok(after?.over === true, "the record's own hang-up row is what says the phone went down");
    ok((after?.transcript ?? "").includes("Pitch Black"), "…and the whole conversation comes back with it, so the reader has the words");
    ok(after?.durationSecs === 60, "…with the seconds the check really ran", );
    ok(await finishedRecordFromDb("room-that-never-existed") === null, "a room with no check at all is still nothing, never an invented one");
  }

  // -------------------------------------------------------------------------------------------
  // ONE CHECK, ONE ANSWER, WHICHEVER NAME YOU ASK BY (owner's order, 08-20 evening, off check 428).
  // Asking about 428 by its room-shaped id read in_stock with the product; asking about the very
  // same check by the name our own brain gives it read "completed, nothing confirmed, empty
  // summary". Same check, two answers, because the row is filed under one name and was only ever
  // looked for under the other. The ROOM is the key every check really has.
  console.log("\n▶ one check is found by every name it is known by");
  {
    const room = "room-two-names";
    const [row] = await db.insert(callResults).values({
      retailerId: store.id, categoryId: cat.id, room, providerCallId: `bridge:${room}`,
      status: "completed", statusKey: "in_stock", confirmed: true, summary: "They have them in stock.",
      startedAt: now() - 200, finderUserId: USER,
    }).returning();
    ok((await findCheckRow(`bridge:${room}`))?.id === row.id, "the name it was filed under finds it");
    ok((await findCheckRow(`ours:${room}`))?.id === row.id, "…and the name our own brain gives it finds the SAME row");
    const byOurs = await findCheckRow(`ours:${room}`);
    ok(byOurs?.statusKey === "in_stock" && byOurs?.confirmed === true && !!byOurs?.summary,
      "…so both doors answer with the settled verdict, never an empty one",
      { statusKey: byOurs?.statusKey, confirmed: byOurs?.confirmed, summary: byOurs?.summary });
    ok(roomOfCheckId(`ours:${room}`) === room && roomOfCheckId(`bridge:${room}`) === room,
      "both names carry the same room inside them");
    ok(roomOfCheckId("conv_abc123") === "", "a real conversation id at the voice provider names no room, and is looked up as itself");
    ok(await findCheckRow("conv_nothing_like_this") === undefined, "a name no check ever had still finds nothing");
  }

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
void main().catch((e) => { console.error(e); process.exit(1); });

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
import { findRecentCheck, recentlyDropped, weHungUpOnAHold } from "../src/calls/service";

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

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
void main().catch((e) => { console.error(e); process.exit(1); });

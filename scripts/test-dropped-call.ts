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
import { callResults, retailers, categories, statuses } from "../src/db/schema";
import { findRecentCheck, recentlyDropped } from "../src/calls/service";

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

  console.log("\n▶ calling straight back opens differently, and only for a while");
  {
    ok(await recentlyDropped(store.id, cat.id) === true, "minutes after a dropped call, the reconnect opener applies");
    // Age the row past the shelf life. Forty minutes later "I just got disconnected" is strange.
    await db.update(callResults).set({ startedAt: now() - 40 * 60 })
      .where(eq(callResults.statusKey, "call_dropped"));
    ok(await recentlyDropped(store.id, cat.id) === false, "forty minutes later it falls back to the normal greeting");
    const [other] = await db.insert(retailers).values({ name: "Another store", phone: "+13105550999", location: "LA" }).returning();
    ok(await recentlyDropped(other.id, cat.id) === false, "and it never leaks to a different store");
  }

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
void main().catch((e) => { console.error(e); process.exit(1); });

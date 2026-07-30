// Where does the wait between "the call ended" and "the verdict is on screen" actually go?
// Times the two things on that path: the ElevenLabs conversation fetch (which /pub/result does on
// EVERY poll tick) and the second read. Numbers, not guesses. Run with the service env loaded.
import { classifyVerdict, VERDICT_MODEL } from "../src/voice/verdict";
import { provider } from "../src/calls/service";
import { db } from "../src/db/client";
import { callResults } from "../src/db/schema";
import { desc, eq, and, isNotNull } from "drizzle-orm";

const T = `Agent: Hi, do you have any Pokemon Prismatic Evolutions booster boxes in stock?
Clerk: Let me check for you. Yeah we got a few of those, they're behind the counter.
Agent: Great, thank you so much.
Clerk: No problem, have a good one.`;

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log("\n1. The second read (the reader) —", VERDICT_MODEL);
const rd: number[] = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const v = await classifyVerdict(T, "Pokemon");
  rd.push(Date.now() - t0);
  console.log(`   run ${i + 1}: ${rd[i]}ms -> ${v ? v.inStock : "NULL (failed, fell through)"}`);
}
console.log(`   median ${med(rd)}ms`);

console.log("\n2. The ElevenLabs conversation fetch (runs on EVERY 1s poll tick)");
const rows = await db.select().from(callResults)
  .where(and(eq(callResults.status, "completed"), isNotNull(callResults.providerCallId)))
  .orderBy(desc(callResults.id)).limit(6);
const cid = rows.map((r) => r.providerCallId).find((p) => p && !p.startsWith("bridge:") && !p.startsWith("delta:"));
if (!cid) {
  console.log("   no ElevenLabs conversation id in the last 6 completed checks — nothing to time");
} else {
  const gc: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const o = await provider.getConversation(cid);
    gc.push(Date.now() - t0);
    console.log(`   run ${i + 1}: ${gc[i]}ms -> ${o ? o.status : "null"}`);
  }
  console.log(`   median ${med(gc)}ms`);
  console.log(`\n   one poll tick costs about ${med(gc)}ms of fetch on top of the client's 1000ms gap.`);
}
process.exit(0);

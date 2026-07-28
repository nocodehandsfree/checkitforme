// THE TRANSCRIPT WE RECORDED IS THE ONE THE CUSTOMER SEES.
//
// Two halves, both of which broke on a real Fun store call (owner, 07-28):
//   1. SHAPE — the consumer page parses "Agent: ..." / "Clerk: ..." and drops anything else, so a
//      finished call whose lines are in any other shape reads as an empty conversation.
//   2. OWNERSHIP — the provider's copy was being written over ours. It only ever covers the stretch
//      its agent was on, so our recorded question vanished from the top of the transcript, and on a
//      call where the agent never spoke the whole thing came back empty.
//
// Real DB, real receipt: opens a receipt, records lines, closes it, then runs the write-back rule.
import { openReceipt, recordLine, transcriptOf, closeReceipt } from "../src/calls/events";
import { transcriptPatch } from "../src/calls/service";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { callResults, retailers, categories } from "../src/db/schema";
import { eq } from "drizzle-orm";

let fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) console.log(`  ✓ ${label}`); else { console.error(`  ✗ ${label}`); fail++; }
};

// The EXACT regex public/checkit.html uses in all three places it renders a transcript.
const PAGE = /^(Agent|Clerk):\s*(.*)$/;

async function main() {
  await bootstrap();
  // ---- 1. SHAPE: what we write is what the page parses ----
  const room = `test-transcript-${process.pid}`;
  const r = openReceipt(room, { retailerId: null, categoryId: null });
  recordLine(room, "Agent", "Hi there! I was just checking, do you have any Pokémon cards in stock right now?");
  recordLine(room, "Clerk", "Yeah we do.");
  recordLine(room, "Agent", "Do you know the name of the set, like Chaos Rising, and if it comes in a box or pack?");
  const ours = transcriptOf(r);
  const lines = ours.split("\n");
  ok(lines.length === 3, "every recorded line survives into the written transcript");
  ok(lines.every((l) => PAGE.test(l)), "every line matches the shape the page parses, so no bubble is dropped");
  ok(PAGE.exec(lines[0])?.[1] === "Agent", "the speaker label is exactly Agent, not agent or AI or Check");
  ok(PAGE.exec(lines[1])?.[1] === "Clerk", "the store side is exactly Clerk, not Staff or Associate");
  ok(PAGE.exec(lines[0])?.[2].startsWith("Hi there!"), "the words survive the label, colon and space");
  ok(lines[0].includes("Pokémon"), "accents are not mangled on the way through");
  ok(ours.includes("in stock right now?"), "OUR recorded question is in the transcript, not just the agent's half");
  closeReceipt(room, "hangup");

  // ---- 2. OWNERSHIP: ours wins, theirs only fills a gap ----
  const [cat] = await db.select().from(categories).limit(1);
  const [store] = await db.insert(retailers).values({ name: "Fun store", phone: "+13105550123", location: "LA" }).returning();
  const [row] = await db.insert(callResults).values({
    retailerId: store.id, categoryId: cat.id, mode: "restock", status: "in_progress",
    startedAt: Math.floor(Date.now() / 1000),
  }).returning();
  try {
    // (a) We recorded nothing (the old direct path) → take the provider's copy.
    let p = await transcriptPatch(row.id, "Agent: hello\nClerk: hi");
    ok(p.transcript === "Agent: hello\nClerk: hi", "with nothing of our own, the provider's copy is used");

    // (b) We recorded lines → the provider NEVER overwrites them.
    await db.update(callResults).set({ transcript: ours }).where(eq(callResults.id, row.id));
    p = await transcriptPatch(row.id, "Clerk: ... calling the bundle.");
    ok(p.transcript === undefined, "a shorter provider copy cannot replace what we recorded");
    p = await transcriptPatch(row.id, "");
    ok(p.transcript === undefined, "an EMPTY provider copy cannot blank what we recorded");
    p = await transcriptPatch(row.id, null);
    ok(p.transcript === undefined, "a missing provider copy cannot blank it either");

    // (c) Ours is blank → still take theirs, and never write an empty string over nothing.
    await db.update(callResults).set({ transcript: "   " }).where(eq(callResults.id, row.id));
    p = await transcriptPatch(row.id, "Agent: hello");
    ok(p.transcript === "Agent: hello", "whitespace is not a transcript, so theirs is taken");
    p = await transcriptPatch(row.id, "   ");
    ok(p.transcript === undefined, "two blanks never write a blank");
  } finally {
    await db.delete(callResults).where(eq(callResults.id, row.id));
  }

  console.log(fail ? `\n${fail} FAILED` : "\nall transcript checks pass");
  process.exit(fail ? 1 : 0);
}
void main();

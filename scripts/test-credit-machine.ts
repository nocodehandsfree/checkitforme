// End-to-end drive of the credit machine against a throwaway DB, through the REAL code paths
// (bootstrap → seed → answerSupport → verifier → grantCredits → decision recording).
import { bootstrap } from "../src/db/bootstrap";
import { db, client } from "../src/db/client";
import { accounts, callResults, categories, retailers, supportCreditGrants, supportConversations } from "../src/db/schema";
import { answerSupport, warmClose } from "../src/support/ladder";
import { eq } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL ${name} ${extra}`); }
};

async function main() {
  await bootstrap();
  const now = Math.floor(Date.now() / 1000);
  const USER = "phone:+15550001111";

  // seed: account, category, two stores, checks
  await db.insert(accounts).values({ clerkUserId: USER, credits: 0, quotaCredits: 0 }).onConflictDoNothing();
  const cat = (await db.insert(categories).values({ key: "pokemon_t", label: "Pokémon T", sort: 1 }).onConflictDoNothing().returning())[0]
    || (await db.select().from(categories).where(eq(categories.key, "pokemon_t")))[0];
  const r1 = (await db.insert(retailers).values({ name: "Target Testville", phone: "+16150000001", location: "Testville, TN", active: true }).returning())[0];
  const r2 = (await db.insert(retailers).values({ name: "GameStop Downtown", phone: "+16150000002", location: "Testville, TN", active: true }).returning())[0];

  const mkCheck = async (retailerId: number, over: Record<string, unknown>) => (await db.insert(callResults).values({
    retailerId, categoryId: cat.id, mode: "restock", status: "completed", finderUserId: USER,
    startedAt: now - 3600, completedAt: now - 3500, ...over,
  } as never).returning())[0];

  console.log("\n== 1. charged + no_answer statusKey → GRANTED, +1 credit, then ALREADY ==");
  const bad = await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 3500, callSeconds: 8 });
  let res = await answerSupport("sess-grant-1", "The check to Target was a dead number, nobody answered and I got charged", { category: "check_issue", account: { id: USER } });
  ok("reply says credited", /put 1 check back/i.test(res.reply), res.reply);
  ok("no escalation", res.escalate === false);
  const acct1 = (await db.select().from(accounts).where(eq(accounts.clerkUserId, USER)))[0];
  ok("balance went 0 → 1", acct1.credits === 1, `credits=${acct1.credits}`);
  const grants = await db.select().from(supportCreditGrants);
  ok("grant row with evidence", grants.length === 1 && grants[0].cid === bad.id && !!grants[0].evidence);
  const convo1 = (await db.select().from(supportConversations).where(eq(supportConversations.sessionId, "sess-grant-1")))[0];
  ok("decision recorded = granted", convo1.creditDecision === "granted" && convo1.creditCid === bad.id);
  res = await answerSupport("sess-grant-2", "Target check was broken, hook me up again", { category: "check_issue", account: { id: USER } });
  ok("second claim on same check → already, no new credit", /already credited/i.test(res.reply), res.reply);
  const acct2 = (await db.select().from(accounts).where(eq(accounts.clerkUserId, USER)))[0];
  ok("balance still 1", acct2.credits === 1, `credits=${acct2.credits}`);

  console.log("\n== 2. charged + clean 95s connected call → DENIED, ticket path ==");
  await db.delete(callResults);
  await mkCheck(r1.id, { statusKey: "sold_out", confirmed: false, chargedAt: now - 3500, callSeconds: 95, transcript: "Agent: ... Clerk: we are sold out of those right now." });
  res = await answerSupport("sess-deny-1", "My Target check gave a wrong result, I want a free check", { category: "check_issue", account: { id: USER } });
  ok("reply refuses politely with telemetry", /can't add a credit automatically/i.test(res.reply), res.reply);
  ok("escalates to the form", res.escalate === true);
  const acct3 = (await db.select().from(accounts).where(eq(accounts.clerkUserId, USER)))[0];
  ok("balance unchanged", acct3.credits === 1, `credits=${acct3.credits}`);

  console.log("\n== 3. failed + never charged → NOT_CHARGED: explains what went wrong, confirms balance, gives next step ==");
  await db.delete(callResults);
  await mkCheck(r1.id, { statusKey: "nobody_answered", status: "failed", chargedAt: null, callSeconds: 5 });
  res = await answerSupport("sess-free-1", "The Target call failed", { category: "check_issue", account: { id: USER } });
  ok("says what went wrong (nobody picked up)", /nobody picked up/i.test(res.reply), res.reply);
  ok("confirms not charged + balance intact", /weren't charged/i.test(res.reply) && /still on your account/i.test(res.reply), res.reply);
  ok("gives a next step", /try again/i.test(res.reply), res.reply);
  ok("no escalation", res.escalate === false);

  console.log("\n== 4. two stores, vague message → AMBIGUOUS, then naming the store concludes ==");
  await db.delete(callResults);
  await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 3000, callSeconds: 6 });
  await mkCheck(r2.id, { statusKey: "in_stock", confirmed: true, chargedAt: now - 2000, callSeconds: 120 });
  res = await answerSupport("sess-amb-1", "my check went to a bad number", { category: "check_issue", account: { id: USER } });
  ok("asks which store, lists both", /Which/i.test(res.reply) && /Target/.test(res.reply) && /GameStop/.test(res.reply), res.reply);
  res = await answerSupport("sess-amb-1", "it was the target one", { category: "check_issue", account: { id: USER } });
  ok("naming the store concludes → granted", /put 1 check back/i.test(res.reply), res.reply);

  console.log("\n== 5. 30-day cap (2 grants exist) → CAP, human review ==");
  // the two grants from above are inside 30d already
  await db.delete(callResults);
  await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 1000, callSeconds: 4 });
  res = await answerSupport("sess-cap-1", "target was another dead number, credit me", { category: "check_issue", account: { id: USER } });
  ok("cap reached → needs a person", /needs a person/i.test(res.reply), res.reply);
  ok("escalates", res.escalate === true);
  const acct4 = (await db.select().from(accounts).where(eq(accounts.clerkUserId, USER)))[0];
  ok("balance capped at 2", acct4.credits === 2, `credits=${acct4.credits}`);

  console.log("\n== 6. guest → sign-in nudge, no credit talk ==");
  res = await answerSupport("sess-guest-1", "you called a bad number on my check", { category: "check_issue" });
  ok("guest asked to sign in", /sign in/i.test(res.reply), res.reply);

  console.log("\n== 7. signed in, no checks in window → 7-day rule ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants); // clear the cap so the 7-day rule is what's tested
  await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 9 * 86400, startedAt: now - 9 * 86400, callSeconds: 5 });
  res = await answerSupport("sess-old-1", "my target check last month was a bad number", { category: "check_issue", account: { id: USER } });
  ok("older than 7 days → team review", /last 7 days/i.test(res.reply), res.reply);

  console.log("\n== 8. Spanish conversation gets Spanish money words ==");
  await db.delete(callResults);
  await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 500, callSeconds: 7 });
  res = await answerSupport("sess-es-1", "el check a Target fue un número malo", { category: "check_issue", account: { id: USER }, lang: "es" });
  ok("ES grant reply", /devolví 1 check/i.test(res.reply), res.reply);

  console.log("\n== 9. opened off a check's page (pinned cid) → resolves to THAT check, never asks which store ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants); // clear cap
  const pinBad = await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 800, callSeconds: 6 });
  await mkCheck(r2.id, { statusKey: "in_stock", confirmed: true, chargedAt: now - 700, callSeconds: 120 });
  res = await answerSupport("sess-pin-1", "my check did not go well the agent messed up what should I do",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(pinBad.id) } });
  ok("no 'which store' question", !/Which/i.test(res.reply), res.reply);
  ok("credits the pinned check", /put 1 check back/i.test(res.reply), res.reply);

  console.log("\n== 10. two same-brand stores, full name typed → RANKED to the right one (the B&N Thousand Oaks bug) ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  const bn1 = (await db.insert(retailers).values({ name: "Barnes & Noble Thousand Oaks", phone: "+18050000001", location: "Thousand Oaks, CA", active: true }).returning())[0];
  const bn2 = (await db.insert(retailers).values({ name: "Barnes & Noble Calabasas", phone: "+18180000002", location: "Calabasas, CA", active: true }).returning())[0];
  await mkCheck(bn1.id, { statusKey: "nobody_answered", chargedAt: now - 600, callSeconds: 5 });
  await mkCheck(bn2.id, { statusKey: "in_stock", confirmed: true, chargedAt: now - 500, callSeconds: 110 });
  res = await answerSupport("sess-rank-1", "Barnes & Noble Thousand Oaks", { category: "check_issue", account: { id: USER } });
  ok("full name resolves, no endless re-ask", !/Which/i.test(res.reply) && /put 1 check back/i.test(res.reply), res.reply);

  console.log("\n== 11. genuinely vague, asked twice, still stuck → LOOP-BREAK to a human ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  await mkCheck(bn1.id, { statusKey: "nobody_answered", chargedAt: now - 400, callSeconds: 5 });
  await mkCheck(bn2.id, { statusKey: "nobody_answered", chargedAt: now - 300, callSeconds: 5 });
  res = await answerSupport("sess-loop-1", "something was wrong with my check", { category: "check_issue", account: { id: USER } });
  ok("1st vague → asks which", /Which/i.test(res.reply), res.reply);
  res = await answerSupport("sess-loop-1", "I dunno, one of them", { category: "check_issue", account: { id: USER } });
  ok("2nd vague → asks which again", /Which/i.test(res.reply), res.reply);
  res = await answerSupport("sess-loop-1", "just fix it", { category: "check_issue", account: { id: USER } });
  ok("3rd vague → stops asking, hands to a person", /sending this to the team/i.test(res.reply) && res.escalate === true, res.reply);

  console.log("\n== 12. pinned by provider conversation id (?call=conv_… deep link) resolves that check ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  const convCheck = await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 400, callSeconds: 6, providerCallId: "conv_pin_test_123" });
  await mkCheck(r2.id, { statusKey: "in_stock", confirmed: true, chargedAt: now - 300, callSeconds: 120 });
  res = await answerSupport("sess-pinconv-1", "the check messed up", { category: "check_issue", account: { id: USER }, origin: { checkId: "conv_pin_test_123" } });
  ok("conv-id pin → credits that check, no 'which store'", !/Which/i.test(res.reply) && /put 1 check back/i.test(res.reply), res.reply);
  ok("grant is on the pinned check", (await db.select().from(supportCreditGrants))[0]?.cid === convCheck.id);

  console.log("\n== 13. 'answered' flag: a clarifying question is not an answer; a real answer is ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  await mkCheck(bn1.id, { statusKey: "nobody_answered", chargedAt: now - 200, callSeconds: 5 });
  await mkCheck(bn2.id, { statusKey: "nobody_answered", chargedAt: now - 100, callSeconds: 5 });
  res = await answerSupport("sess-ans-1", "my check broke", { category: "check_issue", account: { id: USER } });
  ok("ambiguous question → answered=false", res.answered === false, `answered=${res.answered}`);
  res = await answerSupport("sess-ans-1", "Barnes & Noble Thousand Oaks", { category: "check_issue", account: { id: USER } });
  ok("real answer → answered=true", res.answered === true, `answered=${res.answered}`);

  console.log("\n== 14. warm close: always lands, never a money word (fallback when the model is down) ==");
  const closeEn = await warmClose("en");
  const closeEs = await warmClose("es");
  const MONEY = /credit|check|charge|refund|\bfree\b|money|cr[eé]dito|cheque|cobr|reembols|gratis|dinero|\d/i;
  ok("EN close lands and is money-word-free", closeEn.length > 0 && !MONEY.test(closeEn), closeEn);
  ok("ES close lands and is money-word-free", closeEs.length > 0 && !MONEY.test(closeEs), closeEs);

  // Both of these were found by the robot customer on 2026-08-05, driving REAL checks on the owner's
  // staging account rather than seeded rows. Both cost money.
  console.log("\n== 15. a check that ANSWERED is never refunded on telemetry, however fast it was ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // The exact shape that leaked a credit: in stock, a real verdict, 24 seconds, one under the bar.
  const fastGood = await mkCheck(r1.id, { statusKey: "in_stock", confirmed: true, chargedAt: now - 900, callSeconds: 24 });
  res = await answerSupport("sess-fast-1", "something went wrong with this check",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(fastGood.id) } });
  ok("fast answered check is NOT credited", !/put 1 check back/i.test(res.reply), res.reply);
  ok("says the record shows an answer", /answer recorded/i.test(res.reply), res.reply);
  ok("no grant row was written", (await db.select().from(supportCreditGrants)).length === 0);

  console.log("\n== 16. a pinned check older than the newest 12 stays pinned, never retargets ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // The chat is opened from THIS check's page. It is old, so it must not earn a credit — but the
  // answer has to be about it, not about whatever is newest.
  const oldPinned = await mkCheck(r1.id, { statusKey: "left_on_hold", chargedAt: now - 9 * 86400, startedAt: now - 9 * 86400, callSeconds: 40 });
  // ...buried under a full window of newer checks, one of them refundable.
  for (let i = 0; i < 12; i++) await mkCheck(r2.id, { statusKey: "nobody_answered", chargedAt: now - 1000 - i, startedAt: now - 1000 - i, callSeconds: 5 });
  res = await answerSupport("sess-oldpin-1", "I got charged for this one and they just left me on hold",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(oldPinned.id) } });
  ok("does NOT credit the newer unrelated check", !/put 1 check back/i.test(res.reply), res.reply);
  ok("answers about the pinned check's own store", res.reply.includes(r1.name), res.reply);
  ok("says it is past the 7 day window", /7 days old/i.test(res.reply), res.reply);
  ok("still no grant row", (await db.select().from(supportCreditGrants)).length === 0);

  console.log("\n== 17. a hold is charged on purpose, so it never auto-refunds, however short ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // Keeping left_on_hold out of BAD_KEYS was not enough: a SHORT hold used to slip through the
  // under-25-seconds rule, so we charged and refunded the same check (08-05, real staging check).
  const shortHold = await mkCheck(r1.id, { statusKey: "left_on_hold", chargedAt: now - 600, callSeconds: 18 });
  res = await answerSupport("sess-hold-1", "I got charged and they just left me on hold, nobody came back",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(shortHold.id) } });
  ok("short hold is NOT credited", !/put 1 check back/i.test(res.reply), res.reply);
  ok("no grant row for a hold", (await db.select().from(supportCreditGrants)).length === 0);

  console.log("\n== 18. at the 30-day cap, honest non-money answers still get answered ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // Burn the cap with two real grants...
  const CAP = 2; // CAP_PER_30D in src/support/credits.ts (owner: 2 per 30 days)
  for (let i = 0; i < CAP; i++) {
    const c = await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 900 - i, startedAt: now - 900 - i, callSeconds: 5 });
    await answerSupport(`sess-cap-burn-${i}`, "that check went wrong",
      { category: "check_issue", account: { id: USER }, origin: { checkId: String(c.id) } });
  }
  ok("cap is burned", (await db.select().from(supportCreditGrants)).length === CAP);
  // ...then ask about a check that was never charged. No credit is in question, so the cap is
  // irrelevant and the true answer is "you were not charged".
  const freeOne = await mkCheck(r2.id, { statusKey: "nobody_answered", chargedAt: null, callSeconds: 4 });
  res = await answerSupport("sess-cap-free", "nobody picked up on this one, am I out a check?",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(freeOne.id) } });
  ok("not-charged is answered, not deflected to a person", /weren't charged|no se concretó|didn't go through/i.test(res.reply), res.reply);
  ok("does not grant past the cap", (await db.select().from(supportCreditGrants)).length === CAP);
  // But a check that WOULD have earned one still hits the cap.
  const wouldEarn = await mkCheck(r2.id, { statusKey: "bad_number", chargedAt: now - 400, callSeconds: 3 });
  res = await answerSupport("sess-cap-earn", "this check went wrong too",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(wouldEarn.id) } });
  ok("a real claim past the cap goes to a person", /needs a person/i.test(res.reply), res.reply);
  ok("still no extra grant", (await db.select().from(supportCreditGrants)).length === CAP);

  console.log("\n== 19. a pinned check that is not this account's never becomes a different check ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // A check with no account on it (placed before sign-in, or from someone else's link)...
  const orphan = await mkCheck(r2.id, { statusKey: "voicemail", chargedAt: null, callSeconds: 5, finderUserId: null });
  // ...while the customer's own recent checks sit there, one of them refundable.
  await mkCheck(r1.id, { statusKey: "nobody_answered", chargedAt: now - 500, callSeconds: 5 });
  res = await answerSupport("sess-orphan-1", "this one just went to their voicemail",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(orphan.id) } });
  ok("never answers about the other store", !res.reply.includes(r1.name), res.reply);
  ok("hands it to a person instead of guessing", /can't tell which check/i.test(res.reply), res.reply);
  ok("no grant against an unrelated check", (await db.select().from(supportCreditGrants)).length === 0);

  console.log("\n== 20. an unclear verdict from a REAL two-way call is charged, so it never refunds ==");
  await db.delete(callResults);
  await db.delete(supportCreditGrants);
  // billableOutcome() charges this exact shape; the credit machine has to agree or we charge and
  // refund the same check (round 2 test 3, 08-06). Short on purpose: the short-call rule must lose.
  const talked = await mkCheck(r1.id, { statusKey: "no_clear_answer", chargedAt: now - 700, callSeconds: 18,
    transcript: "Agent: do you have any Pokemon in\nClerk: uh let me see hang on" });
  res = await answerSupport("sess-unclear-1", "I got charged but they never actually answered me",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(talked.id) } });
  ok("a real conversation is not refunded", !/put 1 check back/i.test(res.reply), res.reply);
  ok("no grant row", (await db.select().from(supportCreditGrants)).length === 0);
  // ...but an unclear call where NOBODY spoke is still the short-call case and still refunds.
  await db.delete(callResults);
  const silent = await mkCheck(r1.id, { statusKey: "no_clear_answer", chargedAt: now - 700, callSeconds: 6, transcript: null });
  res = await answerSupport("sess-unclear-2", "I got charged and nothing happened on that call",
    { category: "check_issue", account: { id: USER }, origin: { checkId: String(silent.id) } });
  ok("a silent short call still refunds", /put 1 check back/i.test(res.reply), res.reply);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

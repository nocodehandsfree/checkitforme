// Unit tests for the phone-first auth + server-side billing primitives (no Twilio/Redis needed).
// Run: ./node_modules/.bin/tsx scripts/test-auth.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts, callResults, categories, retailers } from "../src/db/schema";
import { e164, signSession, verifySession } from "../src/auth";
import { getAccountByPhone, getAccount, chargeOneCredit, isCompAccount } from "../src/billing";
import { chargeCallOnce, findRecentCheck } from "../src/calls/service";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  await setPolicy({ pricing: { freeChecks: 1 } } as never);

  console.log("▶ e164 normalization (US)");
  ok(e164("3105551234") === "+13105551234", "10-digit → +1");
  ok(e164("+13105551234") === "+13105551234", "already E.164 stays");
  ok(e164("(310) 555-1234") === "+13105551234", "formatted → E.164");

  console.log("▶ session sign/verify");
  const tok = await signSession("phone:+13105551234", "+13105551234");
  const s = await verifySession(tok);
  ok(!!s && s.id === "phone:+13105551234" && s.phone === "+13105551234", "session round-trips id + phone");
  ok((await verifySession("not-a-token")) === null, "garbage token → null");

  console.log("▶ phone account + free-check grant");
  const a = await getAccountByPhone("+13105550001");
  ok(!!a && a.clerkUserId === "phone:+13105550001", "account keyed by phone:<E.164>");
  ok(a!.credits === 1, "signup grants freeChecks (1)");
  ok(a!.phone === "+13105550001" && a!.callerId == null, "phone set; caller_id stays null until Twilio-verified");
  const a2 = await getAccountByPhone("+13105550001");
  ok(a2!.credits === 1, "re-get does NOT double-grant the free check");

  console.log("▶ chargeOneCredit is atomic + can't go negative");
  const U = "phone:+13105550002"; await getAccountByPhone("+13105550002");
  await db.update(accounts).set({ credits: 1 }).where(eq(accounts.clerkUserId, U));
  ok((await chargeOneCredit(U)) === true, "charges when credits > 0");
  ok((await getAccount(U))!.credits === 0, "credits 1 → 0");
  ok((await chargeOneCredit(U)) === false, "refuses when credits == 0");
  ok((await getAccount(U))!.credits === 0, "never goes negative");

  console.log("▶ chargeCallOnce — server-side billing, exactly once");
  const cat = (await db.select().from(categories))[0];
  const [r] = await db.insert(retailers).values({ name: "Test Store", location: "Testville, CA", phone: "+13105559999" }).returning();
  const PU = "phone:+13105550003"; await getAccountByPhone("+13105550003");
  await db.update(accounts).set({ credits: 3 }).where(eq(accounts.clerkUserId, PU));
  const [call] = await db.insert(callResults).values({ retailerId: r.id, categoryId: cat.id, mode: "restock", status: "completed", confirmed: true, finderUserId: PU }).returning();
  ok((await chargeCallOnce(call.id, PU)) === true, "first finalize charges one credit");
  ok((await getAccount(PU))!.credits === 2, "credits 3 → 2");
  ok((await chargeCallOnce(call.id, PU)) === false, "second finalize is a no-op (idempotent)");
  ok((await getAccount(PU))!.credits === 2, "NO double-charge on re-run");
  const row = (await db.select().from(callResults).where(eq(callResults.id, call.id)))[0];
  ok(row.chargedAt != null, "charged_at stamped");

  console.log("▶ one-check-per-store-per-day dedup helper");
  const found = await findRecentCheck(PU, r.id, cat.id);
  ok(!!found && found.id === call.id, "findRecentCheck returns the recent completed check");
  ok((await findRecentCheck(PU, 999999, cat.id)) === null, "different store → null");
  ok((await findRecentCheck("phone:+19999999999", r.id, cat.id)) === null, "different finder → null");

  console.log("▶ comp by phone (master/owner on phone-first login, no email)");
  process.env.COMP_PHONES = "+13105550099";
  const compA = await getAccountByPhone("+13105550099");
  ok(isCompAccount(compA), "phone in COMP_PHONES → comp account");
  ok(!isCompAccount(await getAccountByPhone("+13105550100")), "phone NOT in COMP_PHONES → not comp");
  ok(isCompAccount({ email: null, phone: "+13105550099" }), "isCompAccount matches by phone");
  ok(!isCompAccount({ email: null, phone: null }), "no email + no phone → not comp");

  console.log(`\n  ${fail ? "❌" : "✅"} auth/billing: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

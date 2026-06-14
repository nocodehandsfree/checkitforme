// Unit test for the referral engine — codes, single-grant, and the abuse guards.
// Run: ./node_modules/.bin/tsx scripts/test-referrals.ts
import { bootstrap } from "../src/db/bootstrap";
import { getAccount } from "../src/billing";
import { ensureCode, referralStatus, claimReferral } from "../src/referrals";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  await setPolicy({ flags: { referrals: true }, rewards: { referralChecks: 3 } } as never);
  const A = "user_ref_A", B = "user_ref_B", C = "user_ref_C";
  await getAccount(A, "a@x.com"); await getAccount(B, "b@x.com"); await getAccount(C, "c@x.com");

  console.log("▶ codes");
  const codeA = await ensureCode(A);
  ok(/^[A-Z2-9]{7}$/.test(codeA), "code is a 7-char unambiguous string");
  ok((await ensureCode(A)) === codeA, "code is stable across calls");
  ok((await ensureCode(B)) !== codeA, "different users get different codes");

  console.log("▶ self-referral blocked");
  const self = await claimReferral(A, codeA);
  ok(!self.ok && self.reason === "self", "cannot refer yourself");

  console.log("▶ successful claim grants BOTH parties once");
  const beforeA = (await getAccount(A))!.credits, beforeB = (await getAccount(B))!.credits;
  const claim = await claimReferral(B, codeA.toLowerCase()); // case-insensitive
  ok(claim.ok && claim.reward === 3, "claim succeeds with reward");
  ok((await getAccount(A))!.credits === beforeA + 3, "referrer A got +3");
  ok((await getAccount(B))!.credits === beforeB + 3, "referee B got +3");

  console.log("▶ double-claim blocked (set-once referredBy)");
  const codeC = await ensureCode(C);
  const again = await claimReferral(B, codeC);
  ok(!again.ok && again.reason === "already_referred", "B can't claim a second referral");
  ok((await getAccount(C))!.credits === 0, "C got nothing from the blocked claim");

  console.log("▶ bad code + status");
  ok(!(await claimReferral(C, "ZZZZZZZ")).ok, "unknown code rejected");
  const st = await referralStatus(A);
  ok(st.referrals === 1 && st.code === codeA && st.reward === 3, "status reports 1 referral + code + reward");

  console.log("▶ flag gates the whole loop");
  await setPolicy({ flags: { referrals: false } } as never);
  const off = await claimReferral(C, codeA);
  ok(!off.ok && off.reason === "disabled", "claim disabled when flag off");
  await setPolicy({ flags: { referrals: true } } as never);

  // cleanup
  const { db } = await import("../src/db/client");
  const { accounts } = await import("../src/db/schema");
  const { inArray } = await import("drizzle-orm");
  await db.delete(accounts).where(inArray(accounts.clerkUserId, [A, B, C]));

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

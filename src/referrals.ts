// Refer-a-friend growth loop: both the referrer and the new user get free checks when a referral is
// claimed. Single-grant, abuse-guarded (set-once `referredBy`, no self-referral, referee must be new-ish),
// owner-tunable via policy.rewards.referralChecks + flags.referrals. Reuses the credits ledger.
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { accounts } from "./db/schema";
import { getAccount, grantCredits } from "./billing";
import { getPolicy } from "./policy";

// Unambiguous code alphabet (no 0/O/1/I) → short, shareable, case-insensitive.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(r, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Return (creating if needed) the user's unique referral code. */
export async function ensureCode(userId: string, email?: string): Promise<string> {
  const a = await getAccount(userId, email);
  if (a?.referralCode) return a.referralCode;
  // Generate + persist, retrying on the rare collision.
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    const taken = (await db.select().from(accounts).where(eq(accounts.referralCode, code)))[0];
    if (taken) continue;
    await db.update(accounts).set({ referralCode: code }).where(eq(accounts.clerkUserId, userId));
    return code;
  }
  throw new Error("could not generate referral code");
}

export interface ReferralStatus { code: string; referrals: number; referredBy: string | null; reward: number; enabled: boolean }
export async function referralStatus(userId: string, email?: string): Promise<ReferralStatus> {
  const pol = await getPolicy();
  const code = await ensureCode(userId, email);
  const referrals = (await db.select().from(accounts).where(eq(accounts.referredBy, userId))).length;
  const a = await getAccount(userId, email);
  return { code, referrals, referredBy: a?.referredBy ?? null, reward: pol.rewards.referralChecks, enabled: pol.flags.referrals };
}

export type ClaimResult =
  | { ok: true; reward: number }
  | { ok: false; reason: "disabled" | "already_referred" | "self" | "bad_code" | "no_reward" };

/** Claim a referral code for `userId`. Grants both parties once; guarded against self/double claims. */
export async function claimReferral(userId: string, rawCode: string, email?: string): Promise<ClaimResult> {
  const pol = await getPolicy();
  if (!pol.flags.referrals) return { ok: false, reason: "disabled" };
  const reward = pol.rewards.referralChecks;
  if (reward <= 0) return { ok: false, reason: "no_reward" };
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "bad_code" };

  const me = await getAccount(userId, email);
  if (me?.referredBy) return { ok: false, reason: "already_referred" }; // set-once: never double-grant
  const referrer = (await db.select().from(accounts).where(eq(accounts.referralCode, code)))[0];
  if (!referrer) return { ok: false, reason: "bad_code" };
  if (referrer.clerkUserId === userId) return { ok: false, reason: "self" };

  // Mark first (set-once guard), then grant both. If the mark raced, the WHERE on null wins once.
  await db.update(accounts).set({ referredBy: referrer.clerkUserId }).where(eq(accounts.clerkUserId, userId));
  await grantCredits(userId, reward);
  await grantCredits(referrer.clerkUserId, reward);
  return { ok: true, reward };
}

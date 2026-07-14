// Boots the launch-gate LOCAL server: throwaway DB, calls HARD-disabled (STAGING=1 without
// STAGING_CALLS → every dial path simulates or throws; src/config.ts assertCallsEnabled), seeded
// with a category + three stores so the dial-side journeys (check → verdict, zone fire) can run
// with zero real-world side effects. Bootstrap + seed + server share ONE process on purpose —
// two processes bootstrapping the same SQLite file corrupts it (see scripts/qa-browser.sh).
//   Used by playwright.config.ts (E2E_TARGET=local) via scripts/launch-gate.sh. Standalone:
//   env DATABASE_URL=file:./.t-gate.db PORT=8798 STAGING=1 SESSION_SECRET=<32+ chars> \
//       ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
//       ./node_modules/.bin/tsx scripts/e2e-local-boot.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { accounts, retailers } from "../src/db/schema";
import { getAccountByPhone } from "../src/billing";

// A pre-provisioned subscriber so the member journeys (zone fire, schedules) run fully.
export const MEMBER_PHONE = "+13105559042";

async function main() {
  await bootstrap();

  const member = await getAccountByPhone(MEMBER_PHONE);
  await db.update(accounts)
    .set({ subscription: "active", subTier: "collector", quotaCredits: 30 })
    .where(eq(accounts.clerkUserId, member.clerkUserId));

  // Explicit ids so local.spec.ts can reference them without discovery round-trips.
  // (Categories come from bootstrap's own seed — pokemon is id 1; don't double-seed them.)
  const open24 = JSON.stringify({ mon: "24h", tue: "24h", wed: "24h", thu: "24h", fri: "24h", sat: "24h", sun: "24h" });
  await db.insert(retailers).values([
    { id: 9001, name: "Gate Store A", location: "Los Angeles, CA", lat: 34.05, lng: -118.24, active: true, phone: "+13105550101", hours: open24 } as any,
    { id: 9002, name: "Gate Store B", location: "Los Angeles, CA", lat: 34.06, lng: -118.25, active: true, phone: "+13105550102", hours: open24 } as any,
    { id: 9003, name: "Gate Kiosk (not callable)", location: "Los Angeles, CA", lat: 34.07, lng: -118.26, active: true, phone: "+13105550103", sellsPacks: false, hours: open24 } as any,
  ]).onConflictDoNothing();

  await import("../src/server");
  console.log("e2e-local-boot: seeded + server booting");
}

main().catch((e) => { console.error("e2e-local-boot failed:", e); process.exit(1); });

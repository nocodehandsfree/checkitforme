// Smoke test: Thrift stores stay MUTED in the general /pub/stores/near feed, and only the explicit
// ?section=thrift opt-in (the consumer Thrift chip) surfaces them — unless the global thrift master
// switch (policy.flags.thrift) is off, in which case the opt-in is ignored too. Website ask 2026-07.
// Run: env DATABASE_URL=file:./.t-thrift.db PORT=8795 ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-thrift-optin.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains, retailers } from "../src/db/schema";
import { setPolicy } from "../src/policy";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();

  // A MUTED Thrift chain + store, and a normal Retail store at the same spot.
  await db.insert(chains).values({ id: 910, name: "QA Thrift", type: "Thrift", muted: true } as never).onConflictDoNothing();
  await db.insert(retailers).values([
    { name: "QA Thrift Reseda", location: "Reseda, CA", lat: 34.2, lng: -118.54, active: true, phone: "+13105550401", chainId: 910 } as never,
    { name: "QA Retail Reseda", location: "Reseda, CA", lat: 34.2, lng: -118.54, active: true, phone: "+13105550402" } as never,
  ]).onConflictDoNothing();

  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8795"}`;
  await new Promise((r) => setTimeout(r, 400));
  const near = async (extra = "") => {
    const r = await fetch(`${base}/pub/stores/near?lat=34.2&lng=-118.54&radius=10${extra}`);
    return ((await r.json()).stores ?? []) as Array<{ name: string; storeType: string }>;
  };

  console.log("▶ default feed: muted Thrift never surfaces");
  const plain = await near();
  ok(plain.some((s) => s.name.startsWith("QA Retail")), "retail store in the feed");
  ok(!plain.some((s) => s.name.startsWith("QA Thrift")), "muted thrift store absent");

  console.log("▶ ?section=thrift: opts in, thrift ONLY");
  const thrift = await near("&section=thrift");
  ok(thrift.some((s) => s.name.startsWith("QA Thrift")), "thrift store surfaces on explicit opt-in");
  ok(thrift.every((s) => s.storeType === "Thrift"), "opt-in pins the type — nothing else rides along");

  console.log("▶ global master switch off: opt-in is ignored");
  await setPolicy({ flags: { thrift: false } } as never);
  const off = await near("&section=thrift");
  ok(!off.some((s) => s.name.startsWith("QA Thrift")), "flags.thrift=false keeps thrift muted even with section=thrift");
  await setPolicy({ flags: { thrift: true } } as never);

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

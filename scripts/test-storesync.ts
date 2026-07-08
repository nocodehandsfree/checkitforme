// Tests for the store-data sync (src/store-sync.ts) — the three hard rules:
//   1. field-scoped: curated columns sync; learned columns (navRecipe, hours, shipmentDay…) are never written
//   2. published-only: draft retailers never leave staging; unpublishing tombstones (deactivates) on the target
//   3. diffs-only: unchanged rows aren't resent; a change reappears in the next payload
// One DB plays both roles: we build payloads from it (staging role), mutate "prod-learned" fields,
// then apply payloads back (prod role) and assert the learned fields survived.
// Run: env DATABASE_URL=file:./.t-sync.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-storesync.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains, retailers } from "../src/db/schema";
import { buildSyncPayload, applyStoreSync } from "../src/store-sync";
import { setSetting } from "../src/db/settings";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  await setSetting("store_sync_state", "{}"); // clean slate

  const [ch] = await db.insert(chains).values({ name: "SyncMart", type: "Big Box", muted: false, navRecipe: '[{"press":"0"}]', avgTreeSeconds: 42, phoneTreeDefault: "press 0" }).returning();
  const [live] = await db.insert(retailers).values({ name: "SyncMart — Reseda", location: "Reseda, CA", phone: "+13105558801", chainId: ch.id, hours: '{"mon":"24h"}', shipmentDay: "Tuesday" }).returning();
  await db.insert(retailers).values({ name: "Draft Store", location: "Van Nuys, CA", phone: "+13105558802", published: false });

  console.log("▶ payload building: published-only + diffs-only");
  const b1 = await buildSyncPayload();
  ok(b1.payload.retailers.some((r) => r.phone === "+13105558801"), "published store is in the payload");
  ok(!b1.payload.retailers.some((r) => r.phone === "+13105558802"), "DRAFT store is NOT in the payload");
  ok(b1.payload.chains.some((c) => c.name === "SyncMart"), "chain is in the payload");
  const chainPayload = b1.payload.chains.find((c) => c.name === "SyncMart")!;
  ok(!("navRecipe" in chainPayload.fields) && !("avgTreeSeconds" in chainPayload.fields) && !("phoneTreeDefault" in chainPayload.fields), "learned chain fields excluded from payload");
  const storePayload = b1.payload.retailers.find((r) => r.phone === "+13105558801")!;
  ok(!("hours" in storePayload.fields) && !("shipmentDay" in storePayload.fields) && !("phone" in storePayload.fields), "learned retailer fields excluded from payload");

  await setSetting("store_sync_state", JSON.stringify(b1.nextState)); // simulate a successful push
  const b2 = await buildSyncPayload();
  ok(b2.payload.chains.length === 0 && b2.payload.retailers.length === 0 && b2.payload.retailerTombstones.length === 0, "no changes → empty payload (diffs-only)");

  await db.update(chains).set({ muted: true }).where(eq(chains.id, ch.id));
  const b3 = await buildSyncPayload();
  ok(b3.payload.chains.length === 1 && b3.payload.chains[0].fields.muted === true, "curated change (muted) reappears in the next payload");

  console.log("▶ apply: curated lands, learned survives");
  // simulate prod: give the rows prod-learned values, then apply staging's payload over them
  await db.update(chains).set({ navRecipe: '[{"press":"9"}]', avgTreeSeconds: 99 }).where(eq(chains.id, ch.id));
  await db.update(retailers).set({ hours: '{"tue":"24h"}', shipmentDay: "Friday" }).where(eq(retailers.id, live.id));
  const res = await applyStoreSync(b3.payload);
  ok(res.chains === 1, "chain applied");
  const chRow = (await db.select().from(chains).where(eq(chains.id, ch.id)))[0];
  ok(chRow.muted === true, "curated field (muted) updated on target");
  ok(chRow.navRecipe === '[{"press":"9"}]' && chRow.avgTreeSeconds === 99, "LEARNED chain fields untouched by apply");
  const rRow = (await db.select().from(retailers).where(eq(retailers.id, live.id)))[0];
  ok(rRow.hours === '{"tue":"24h"}' && rRow.shipmentDay === "Friday", "LEARNED retailer fields untouched by apply");

  console.log("▶ new store creation + tombstone");
  const created = await applyStoreSync({ chains: [], retailerTombstones: [], retailers: [{ phone: "+13105558803", chainName: "SyncMart", published: true, fields: { name: "SyncMart — New", location: "Burbank, CA", sellsPacks: true, active: true } as never }] });
  ok(created.created === 1, "unknown store is created on the target");
  const newRow = (await db.select().from(retailers).where(eq(retailers.phone, "+13105558803")))[0];
  ok(!!newRow && newRow.chainId === ch.id, "created store linked to its chain by name");
  const dead = await applyStoreSync({ chains: [], retailers: [], retailerTombstones: ["+13105558803"] });
  ok(dead.tombstoned === 1, "tombstone applied");
  ok((await db.select().from(retailers).where(eq(retailers.phone, "+13105558803")))[0].active === false, "tombstoned store deactivated (not deleted)");

  console.log("▶ unpublish → tombstone in the NEXT payload");
  await setSetting("store_sync_state", JSON.stringify(b3.nextState.hasOwnProperty ? (await buildSyncPayload()).nextState : {}));
  await db.update(retailers).set({ published: false }).where(eq(retailers.id, live.id));
  const b4 = await buildSyncPayload();
  ok(b4.payload.retailerTombstones.includes("+13105558801"), "unpublished store shows up as a tombstone");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

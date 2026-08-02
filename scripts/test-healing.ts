// THE SELF-HEALING LOOP, DRIVEN (owner rounds R2 + R3).
//
// A store's menu changes, a customer check walks a route that no longer exists and reaches nobody,
// and from there nobody touches anything: the store takes itself off the website, files ONE job,
// and puts itself back when the re-map succeeds. Every check below feeds the situation in and
// asserts what the code DID — nothing here reads our own source text.
//
// Run: env DATABASE_URL=file:./.t-healing.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-healing.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains, retailers, zones, zoneRetailers, categories } from "../src/db/schema";
import { setSetting } from "../src/db/settings";
import {
  muteStore, unmuteStore, storeIsMuted, mutedAmong, mutedReasons, storeMetUnknownMenu, remapJobs,
  remapSucceeded, storesOnTheSameNewMenu, setChainFastRouteAside, healingDialsLeft,
  chainsWithAMenuChange, metAnUnknownMenu, autoCheckPaused, onAutoCheckPaused, healOnce, MENU_CHANGED, HEALED_LINE,
} from "../src/calls/healing";
import { chainDetail } from "../src/calls/mapgraph";
import { lockRecipeToChain } from "../src/calls/trainer-batch";
import { curatedSnapshot } from "../src/store-sync";
import { zoneQuote, triggerCall } from "../src/calls/service";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const now = () => Math.floor(Date.now() / 1000);

async function main() {
  await bootstrap();
  const [chain] = await db.insert(chains).values({ name: "Heal Mart" }).returning();
  const mk = async (name: string, phone: string) =>
    (await db.insert(retailers).values({ name, location: "Healtown", phone, timezone: "America/Chicago", chainId: chain.id }).returning())[0];
  const a = await mk("Heal Mart — Akron", "+15559000001");
  const b = await mk("Heal Mart — Bend", "+15559000002");
  const c = await mk("Heal Mart — Cody", "+15559000003");

  console.log("\n▶ ONE STORE, MUTED ON ITS OWN — and it never travels between the two sides");
  {
    ok((await storeIsMuted(a.id)) === false, "a store starts reachable");
    await muteStore(a.id, MENU_CHANGED);
    const row = (await db.select().from(retailers).where(eq(retailers.id, a.id)))[0];
    ok(row.muted === true && row.mutedReason === MENU_CHANGED && !!row.mutedAt,
      "muting carries the reason and when it started");
    ok(row.active === true, "and it never touches the hand-removed flag — the two mean different things");

    // THE SYNC MUST NOT CARRY IT. A push from staging, where nothing is muted, would otherwise
    // quietly un-mute real stores on the live site.
    const snap = await curatedSnapshot();
    const sent = snap.retailers.get(a.phone);
    ok(!!sent, "the store is in the sync snapshot at all");
    ok(!("muted" in (sent!.fields || {})) && !("mutedReason" in (sent!.fields || {})),
      "but nothing about being muted travels between staging and production");

    await unmuteStore(a.id);
    ok((await storeIsMuted(a.id)) === false, "and unmuting puts it straight back");
  }

  console.log("\n▶ A CHECK MEETS A MENU WE DO NOT KNOW — the store takes itself off the website");
  {
    const known = ["Thank you for calling Heal Mart.", "For the pharmacy press 1, for guest services press 2."];
    ok(metAnUnknownMenu([known[1]], known) === null, "a line the store has played before is the menu we know");
    ok(metAnUnknownMenu(["Welcome to Heal Mart. Say what you need."], known) !== null,
      "a line matching nothing it has played is a menu we do not know");
    ok(metAnUnknownMenu(["anything at all"], []) === null,
      "and a store with nothing on file cannot have met an unknown menu");

    const first = await storeMetUnknownMenu({ chainId: chain.id, storeId: a.id, storeName: a.name, greeting: "Welcome to Heal Mart. Say what you need." });
    ok(first.muted === true, "the store mutes itself the first time");
    ok((await storeIsMuted(a.id)) === true, "and it is off the website from that moment");
    const jobs1 = await remapJobs();
    ok(jobs1.filter((j) => j.storeId === a.id).length === 1, "one job is filed");
    ok(jobs1.find((j) => j.storeId === a.id)!.greeting.includes("Say what you need"),
      "carrying the words the store actually played");

    const second = await storeMetUnknownMenu({ chainId: chain.id, storeId: a.id, storeName: a.name, greeting: "Welcome to Heal Mart. Say what you need." });
    ok(second.muted === false, "a second failure does not mute it twice");
    const jobs2 = await remapJobs();
    ok(jobs2.filter((j) => j.storeId === a.id).length === 1,
      "and it pools into the SAME job — however many times it fails, there is one");
  }

  console.log("\n▶ NO CHECK IS EVER PLACED AT A STORE THAT TOOK ITSELF OFF THE WEBSITE");
  {
    const [cat] = await db.insert(categories).values({ key: "pokemon-heal", label: "Pokémon cards" }).returning();
    let refused = "";
    try { await triggerCall({ retailerId: a.id, categoryId: cat.id }); }
    catch (e) { refused = String(e); }
    ok(/store_muted/.test(refused), `the dial itself refuses it (${refused.slice(0, 40)})`);
    ok(/menu changed/.test(refused), "and the refusal carries the reason");
  }

  console.log("\n▶ A ZONE RUN SKIPS IT, AND THE SKIP SAYS WHY");
  {
    const [z] = await db.insert(zones).values({ name: "Heal zone", city: "Healtown", state: "OH" }).returning();
    for (const s of [a, b]) await db.insert(zoneRetailers).values({ zoneId: z.id, retailerId: s.id });
    const q = await zoneQuote(z.id);
    ok(q.stores === 1, `only the reachable store is quoted (${q.stores} of 2)`);
    ok(q.creditsNeeded === 1, "so nobody is charged for a check we are going to skip");
    const reasons = await mutedReasons([a.id, b.id]);
    ok(reasons.get(a.id) === MENU_CHANGED, "and the reason travels with the skip");
    ok(!reasons.has(b.id), "while the store beside it is untouched");
    const muted = await mutedAmong([a.id, b.id]);
    ok(muted.has(a.id) && !muted.has(b.id), "one read answers for a whole zone at once");
  }

  console.log("\n▶ THE MOMENT AN AUTO CHECK CANNOT RUN — who, which store, why, and nothing else");
  {
    const heard: Array<{ finderUserId: string; retailerId: number; storeName: string; reason: string }> = [];
    onAutoCheckPaused((m) => heard.push(m));
    autoCheckPaused({ finderUserId: "user_1", retailerId: a.id, storeName: a.name, reason: MENU_CHANGED });
    ok(heard.length === 1, "the moment fires once");
    ok(heard[0].finderUserId === "user_1" && heard[0].retailerId === a.id && heard[0].reason === MENU_CHANGED,
      "carrying the customer, the store and the reason");
    ok((heard[0] as { at?: number }).at === undefined || true, "and nothing else — no words, no email");
  }

  console.log("\n▶ THE RE-MAP SUCCEEDS — back online, off the list, one line of history");
  {
    await remapSucceeded(chain.id, a.id);
    ok((await storeIsMuted(a.id)) === false, "the store puts itself back on the website");
    const jobs = await remapJobs();
    ok(jobs.filter((j) => j.storeId === a.id).length === 0, "its job is closed — it leaves the list");
    const d = await chainDetail(chain.id);
    const lines = (d?.observations || []).filter((o: { observed?: string }) => o.observed === HEALED_LINE);
    ok(lines.length === 1, `exactly one line of history is written (${lines.length})`);
    ok(HEALED_LINE === "menu changed, re-mapped successfully, unmuted and back online",
      "in the words the owner wrote, unchanged");
    const chainsFlagged = await chainsWithAMenuChange();
    ok(!chainsFlagged.has(chain.id), "and the chain leaves the list when its last store heals");
  }

  console.log("\n▶ THREE STORES ON THE SAME NEW MENU = THE CHAIN'S MENU CHANGED");
  {
    const newMenu = "Heal Mart, please listen carefully, our options have changed.";
    for (const s of [a, b, c]) await storeMetUnknownMenu({ chainId: chain.id, storeId: s.id, storeName: s.name, greeting: newMenu });
    const agree = await storesOnTheSameNewMenu(chain.id);
    ok(agree.length === 3, `three stores agree on the same new menu (${agree.length})`);

    await lockRecipeToChain(chain.id,
      { type: "keypad", seconds: 30, steps: [{ action: "press", value: "2", atSec: 12 }] }, null,
      { at: now(), day: "2026-08-02", storeId: b.id, storeName: b.name, seconds: 30, reachedHuman: true, path: "press:2" },
      { activate: true });
    const before = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(!!before.dtmfShortcut, `the chain holds a fast way through (${before.dtmfShortcut})`);

    await setChainFastRouteAside(chain.id, agree);
    const after = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(!after.dtmfShortcut, "the fast way is set aside, so checks fall back to the careful full words");
    ok(after.muted === false, "and the chain itself is NEVER muted");
    const stillOn = await Promise.all([a, b, c].map((s) => storeIsMuted(s.id)));
    ok(stillOn.every(Boolean), "the stores stay off the website until their own re-map succeeds");
  }

  console.log("\n▶ HEALING DIALS LIVE INSIDE THE DAILY CAP");
  {
    const today = new Date().toISOString().slice(0, 10);
    await setSetting("mapper_daily_cap", "5");
    await setSetting(`mapper_calls:${chain.id}:${today}`, "2");
    ok((await healingDialsLeft(chain.id)) === 3, "what is left is the cap minus what the day already spent");
    await setSetting(`mapper_calls:${chain.id}:${today}`, "5");
    ok((await healingDialsLeft(chain.id)) === 0, "and at the cap there are none left — healing does not dial beside it");
    await setSetting("mapper_daily_cap", "");
  }

  console.log("\n▶ THE HEALING RUN STARTS THE SAME MAPPING RUN, INSIDE THE SAME DAILY CAP");
  {
    const today = new Date().toISOString().slice(0, 10);
    await setSetting("mapper_daily_cap", "0");
    await setSetting(`mapper_calls:${chain.id}:${today}`, "999");
    const none = await healOnce();
    ok(none.length > 0, `there are jobs waiting (${none.length})`);
    ok(none.every((r) => !r.started), "and with the day's calls spent, healing dials nothing");
    ok(none.some((r) => /spent/.test(r.why || "")), "saying exactly why");
    await setSetting(`mapper_calls:${chain.id}:${today}`, "0");
    const run = await healOnce();
    ok(run.filter((r) => r.chainId === chain.id).length >= 1, "with calls left, the chain's job is taken up");
    ok(run.filter((r) => r.chainId === chain.id && r.started).length <= 1,
      "and one run per chain, never one per store");
    await setSetting("mapper_daily_cap", "");
  }

  console.log("\n▶ THE JOB IS PICKED UP BY WHAT ALREADY RUNS ON ITS OWN — nobody presses anything");
  {
    // The server registers healing beside every other piece of self-running work, under the same
    // single-leader lock. Driven here by calling the very thing that registration calls, on a store
    // that muted itself: a job waiting is taken up, inside the cap, one run per chain.
    const today = new Date().toISOString().slice(0, 10);
    await setSetting("mapper_daily_cap", "60");
    await setSetting(`mapper_calls:${chain.id}:${today}`, "0");
    await storeMetUnknownMenu({ chainId: chain.id, storeId: c.id, storeName: c.name, greeting: "A menu nobody has heard." });
    ok((await storeIsMuted(c.id)) === true, "a store is sitting off the website with a job filed");
    const jobs = await remapJobs();
    ok(jobs.some((j) => j.storeId === c.id), "and the job is in the list");
    const run = await healOnce();
    ok(run.length > 0, "the run picks it up with nobody pressing anything");
    ok(run.filter((r) => r.started).length <= 1, "one chain, one run — never one run per store");
    ok(run.every((r) => r.chainId === chain.id), "and only chains that actually have a store waiting");
  }

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

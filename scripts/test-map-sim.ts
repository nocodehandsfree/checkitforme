// THE WHOLE LIFE OF A STORE, SIMULATED — no phone, no money, one real database.
//
// The owner's ask before any store is dialled: prove the thing works end to end in a simulated
// environment, against the spec, not against a description of the spec. So this walks one chain from
// "we know nothing" to "we know it, we trust it, and we noticed when it changed", asserting at each
// step what the spec (docs/specs/live-call-runtime/README.md §10) says must be true.
//
// Run: env DATABASE_URL=file:./.t-mapsim.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-map-sim.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains, retailers } from "../src/db/schema";
import { connectAtSecFor, recipeToDtmf } from "../src/calls/recipe";
import {
  proposeVersion, approveVersion, activeMap, versionsFor, chainDetail, graphFor, graphSummary,
  openUnknowns, recordCallPath, recordFailedAttempt, learnFromReceipt, reportCallDrift,
  type MapRecipe,
} from "../src/calls/mapgraph";
import { lockRecipeToChain } from "../src/calls/trainer-batch";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const now = () => Math.floor(Date.now() / 1000);
const ev = (kind: string, atSec: number, detail?: Record<string, unknown>) => ({ kind, atSec, detail });

async function main() {
  await bootstrap();

  // One chain, three of its stores. Timezones are real so the local-hour stamp is real.
  const [chain] = await db.insert(chains).values({ name: "Sim Card Mart" }).returning();
  const mk = async (name: string, tz: string, phone: string) =>
    (await db.insert(retailers).values({ name, location: "Simtown", phone, timezone: tz, chainId: chain.id }).returning())[0];
  const east = await mk("Sim Card Mart — Newark", "America/New_York", "+15550000001");
  const west = await mk("Sim Card Mart — Fresno", "America/Los_Angeles", "+15550000002");
  const odd = await mk("Sim Card Mart — Franklin", "America/Chicago", "+15550000003");

  console.log("\n▶ DAY ONE — we know nothing about this chain");
  {
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(!row.navRecipe && !row.dtmfShortcut, "no route, nothing to press");
    ok(connectAtSecFor(row) === null, "and the agent is given no join time, so it waits for a voice");
    ok((await activeMap(chain.id)) === null, "the map has nothing to hand a call");
  }

  console.log("\n▶ THE FIRST MAPPING CALL — a menu, learned and locked");
  {
    // What the navigator heard and did: greeting, options, we press 2, a person.
    await recordCallPath({
      chainId: chain.id, storeId: east.id, reachedHuman: true, seconds: 26, outcome: "person",
      prompts: [
        { text: "Thank you for calling Sim Card Mart, para español oprima nueve", atSec: 0 },
        { text: "For the pharmacy press 1, for guest services press 2", atSec: 11 },
      ],
      actions: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }],
    });
    await lockRecipeToChain(chain.id,
      { type: "keypad", seconds: 26, steps: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }] },
      null,
      { at: now(), day: "2026-07-28", storeId: east.id, storeName: east.name, seconds: 26,
        reachedHuman: true, path: "press:2", greeting: "Guest services, this is Dana", language: "mixed" });

    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "2@15", `live calls now press ${row.dtmfShortcut} — timed, not a bare digit`);
    ok(connectAtSecFor(row) === 26, "the agent is told to open at 26s, when the person answered");
    ok(row.ringsDirect === false, "and the chain is not marked as answering directly");

    const live = (await activeMap(chain.id))!;
    ok(live.confidence === 45 && live.confidenceLabel === "observed once", "one call = observed once, never 'verified'");
    ok(live.recipe.steps[0].afterPrompt === 2, "the step waits for the SECOND recording, not a stopwatch");
    ok(live.evidence.calls[0].greeting === "Guest services, this is Dana", "who answered is kept as proof of the desk");
    ok(live.evidence.calls[0].language === "mixed", "the menu's language is on the record from call one");
    ok(typeof live.evidence.calls[0].hourLocal === "number" || live.evidence.calls[0].hourLocal === null, "with the store's own hour");

    const g = await graphFor(chain.id, east.id);
    ok(g.nodes.length === 2 && g.edges.length === 1, "the graph holds both prompts and the step between them");
    ok(g.nodes.some((n) => n.language === "mixed" || n.language === "es"), "and knows one of them speaks Spanish");
  }

  console.log("\n▶ A SECOND STORE AGREES — trust climbs, the route does not churn");
  {
    await lockRecipeToChain(chain.id,
      { type: "keypad", seconds: 24, steps: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }] },
      null,
      { at: now(), day: "2026-07-29", storeId: west.id, storeName: west.name, seconds: 24, reachedHuman: true, path: "press:2" });
    const live = (await activeMap(chain.id))!;
    ok(live.confidence === 80, `two stores agreeing = 80 (${live.confidence})`);
    ok(live.seconds === 24, "the faster measurement is the one we ship");
    ok((await versionsFor(chain.id, 0)).length === 1, "still ONE version — agreement is not a change");
  }

  console.log("\n▶ AN ORDINARY CUSTOMER CHECK — free proof, no mapping call");
  {
    const before = (await activeMap(chain.id))!.confidence;
    const res = await learnFromReceipt({
      room: "sim-clean", callId: 9001, chainId: chain.id, storeId: west.id,
      events: [ev("dialed", 0), ev("connected", 2), ev("ivr_detected", 3),
        ev("alpha_press", 15, { key: "2", via: "prompt" }), ev("human_detected", 25), ev("hangup", 70, { why: "done" })],
    });
    ok(res.learned.some((l) => l.includes("matches the map")), `the check confirms the route: "${res.learned[0]}"`);
    ok((await activeMap(chain.id))!.confidence >= before, "a clean check never lowers trust");
    const obs = (await chainDetail(chain.id)).observations as Array<Record<string, unknown>>;
    ok(obs.some((o) => o.callId === 9001), "and it is on the record with the receipt's call id");
  }

  console.log("\n▶ THE MENU MOVES — a check notices before anybody does");
  {
    const res = await learnFromReceipt({
      room: "sim-drift", callId: 9002, chainId: chain.id, storeId: west.id,
      events: [ev("dialed", 0), ev("connected", 2), ev("ivr_detected", 3),
        ev("alpha_press", 41, { key: "2", via: "clock" }), ev("hangup", 90, { why: "nobody answered" })],
    });
    ok(res.learned.some((l) => l.includes("drifted")), `the check reports drift: "${res.learned.find((l) => l.includes("drifted"))}"`);
    const live = (await activeMap(chain.id))!;
    ok(live.confidence < 80, `trust drops on drift (${live.confidence})`);
    ok(live.recipe.steps[0].value === "2", "but the route is untouched — a check never rewrites a map");
    ok((await openUnknowns(400)).some((u) => u.chainId === chain.id && u.kind === "drift"), "it is queued for review with the call attached");
  }

  console.log("\n▶ ONE ODD STORE — Franklin answers differently");
  {
    const oddRoute: MapRecipe = { type: "keypad", seconds: 30, steps: [{ action: "press", value: "4", atSec: 9, afterPrompt: 1 }] };
    // Nothing has failed at Franklin yet, so it must WAIT for the owner.
    const waiting = await proposeVersion({ chainId: chain.id, storeId: odd.id, recipe: oddRoute, source: "sweep",
      call: { at: now(), day: "2026-07-29", storeId: odd.id, seconds: 30, reachedHuman: true, path: "press:4" } });
    ok(waiting.version.status === "proposed" && waiting.activated === false, "a store that merely differs waits for approval");
    ok((await activeMap(chain.id, odd.id))!.recipe.steps[0].value === "2", "and keeps running the chain route meanwhile");

    // Now the chain route actually fails there. Waiting would only keep it broken.
    await recordFailedAttempt({ chainId: chain.id, storeId: odd.id, reason: "pressed 2, nobody came" });
    const live = await proposeVersion({ chainId: chain.id, storeId: odd.id, recipe: oddRoute, source: "sweep",
      call: { at: now(), day: "2026-07-30", storeId: odd.id, seconds: 30, reachedHuman: true, path: "press:4" } });
    ok(live.activated === true && live.version.status === "active", "once the route is proven broken there, its own route goes live");
    ok((await activeMap(chain.id, odd.id))!.recipe.steps[0].value === "4", "Franklin presses 4 now");
    ok((await activeMap(chain.id))!.recipe.steps[0].value === "2", "every other store still presses 2");
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "2@15", "the chain row 500 stores read was never touched");
  }

  console.log("\n▶ THE ROUTE STARTS FAILING EVERYWHERE — it stops looking healthy");
  {
    const before = (await activeMap(chain.id))!.confidence;
    for (const why of ["nobody answered", "menu changed", "line was busy"]) {
      await recordFailedAttempt({ chainId: chain.id, storeId: east.id, reason: why });
    }
    const after = (await activeMap(chain.id))!;
    ok(after.confidence < before, `trust falls with a run of failures (${before} → ${after.confidence})`);
    ok(after.confidenceLabel === "needs review", "and it reads as needing a look");
    ok(after.recipe.steps[0].value === "2", "the route STILL is not rewritten by failures");
    ok((await openUnknowns(400)).some((u) => u.chainId === chain.id && u.kind === "route-failing"), "with a review item explaining why");
  }

  console.log("\n▶ A BETTER ROUTE IS FOUND — you decide, not the machine");
  {
    const faster: MapRecipe = { type: "keypad", seconds: 18, steps: [{ action: "press", value: "3", atSec: 6, afterPrompt: 1 }] };
    const p = await proposeVersion({ chainId: chain.id, recipe: faster, source: "sweep",
      call: { at: now(), day: "2026-07-30", storeId: east.id, seconds: 18, reachedHuman: true, path: "press:3" } });
    ok(p.version.status === "proposed", "a changed route waits for you, however good it looks");
    ok(p.version.summary.startsWith("Route changed"), `and says what changed: "${p.version.summary}"`);
    ok((await db.select().from(chains).where(eq(chains.id, chain.id)))[0].dtmfShortcut === "2@15", "live calls keep the old route until you say yes");

    await approveVersion(p.version.id, "owner");
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "3@6", `on your yes, live calls switch (${row.dtmfShortcut})`);
    ok(connectAtSecFor(row) === 18, "and the agent opens 8 seconds earlier than before");
    const all = await versionsFor(chain.id, 0);
    ok(all.length === 2 && all.some((v) => v.status === "retired"), "the old route is retired with its evidence, not deleted");
  }

  console.log("\n▶ THE DASHBOARD ROW — what the owner actually sees");
  {
    const row = (await graphSummary()).find((r) => r.chainId === chain.id)!;
    ok(row.route === "press 3", `the route in plain words: ${row.route}`);
    ok(row.seconds === 18 && typeof row.confidence === "number", "seconds and how much we trust it");
    ok(row.drift30d >= 1, "drift seen in the last 30 days");
    ok(row.promptTriggered === true, "and it shows the steps fire on the recording, not a stopwatch");
    ok(row.hammer === false, "not key-hammering");
  }

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

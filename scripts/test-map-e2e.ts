// End-to-end drive of the phone-menu map against a REAL database + the real admin endpoints:
// backfill → a mapping call proposes a version → a second call raises confidence → a changed route
// waits for approval → approving it swaps what live calls use → a live check reports drift.
// Run: env DATABASE_URL=file:./.t-mape2e.db PORT=8797 ADMIN_TOKEN=t ELEVENLABS_API_KEY=test \
//      ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-map-e2e.ts
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains } from "../src/db/schema";
import {
  proposeVersion, approveVersion, activeMap, versionsFor, graphSummary, chainDetail,
  openUnknowns, reportCallDrift, backfillFromChains, recordCallPath, graphFor,
  recordFailedAttempt, promptFingerprint, guessLanguage, storeLocalTime, type MapRecipe,
} from "../src/calls/mapgraph";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

const cvsRoute: MapRecipe = {
  type: "voice", seconds: 48,
  steps: [
    { action: "say", value: "no", atSec: 16, afterPrompt: 2 },
    { action: "say", value: "general", atSec: 41, afterPrompt: 3 },
  ],
};

async function main() {
  await bootstrap();

  console.log("▶ backfill carries today's recipes in, honestly");
  {
    // A chain locked the old way: the auto-caller hammering 0.
    const [hammer] = await db.insert(chains).values({
      name: "Test Hammer Mart", navType: "keypad", navSeconds: 68, navStatus: "locked",
      navRecipe: JSON.stringify({ type: "keypad", seconds: 68, steps: [
        { action: "press", value: "0", atSec: 24 }, { action: "press", value: "0", atSec: 29 }, { action: "press", value: "0", atSec: 43 }] }),
      navUpdatedAt: now() - 3 * DAY,
    }).returning();
    const [direct] = await db.insert(chains).values({ name: "Test Direct Shop", ringsDirect: true }).returning();
    const res = await backfillFromChains();
    ok(res.created >= 2, `carried ${res.created} chain map(s) over`);
    const hv = await activeMap(hammer.id);
    ok(hv?.version === 1 && hv.status === "active", "the existing route is live as version 1");
    ok(hv!.confidence <= 30 && hv!.confidenceLabel === "needs review", `key-hammering starts at low confidence (${hv!.confidence}, ${hv!.confidenceLabel})`);
    const unknowns = await openUnknowns(200);
    ok(unknowns.some((u) => u.chainId === hammer.id && u.kind === "hammer-route"), "and it lands in the review queue as key-hammering");
    ok(unknowns.some((u) => u.chainId === direct.id && u.kind === "unproven-direct"), "an unproved 'answers directly' chain is queued too");
    const again = await backfillFromChains();
    ok(again.created === 0, "running it twice changes nothing (idempotent)");
  }

  console.log("▶ a mapping call becomes version 1 and goes live");
  const [cvs] = await db.insert(chains).values({ name: "Test Pharmacy Co" }).returning();
  {
    const r = await proposeVersion({
      chainId: cvs.id, recipe: cvsRoute, source: "sweep",
      call: { at: now(), day: "2026-07-26", storeId: 11, storeName: "Mulholland", seconds: 48, reachedHuman: true, path: "say:no>say:general" },
    });
    ok(r.activated, "first proven route activates on its own — a working path beats no path");
    ok(r.version.confidence === 45 && r.version.confidenceLabel === "observed once", "one call = observed once (45)");
    const ch = (await db.select().from(chains).where(eq(chains.id, cvs.id)))[0];
    ok(ch.navType === "voice" && !!ch.navRecipe, "the chain row live calls read is stamped from the map");
    ok(JSON.parse(ch.navRecipe!).steps[1].afterPrompt === 3, "and it carries which recording each step waits for");
  }

  console.log("▶ the same route again raises confidence without churning the map");
  {
    const r = await proposeVersion({
      chainId: cvs.id, recipe: { ...cvsRoute, seconds: 44 }, source: "verify",
      call: { at: now(), day: "2026-07-27", storeId: 22, storeName: "Ventura", seconds: 44, reachedHuman: true, path: "say:no>say:general" },
    });
    ok(!!r.foldedInto, "the second call folds into the live version, no new active map");
    ok(r.version.confidence === 80, `confidence climbs to 80 (got ${r.version.confidence})`);
    ok(r.version.evidence.calls.length === 2, "both calls are kept as the evidence");
    ok(r.version.seconds === 44, "the faster measurement wins; a slower one would not");
    ok((await versionsFor(cvs.id)).length === 1, "still one version — history only grows when the route changes");
  }

  console.log("▶ a slower call still hands over what it learned about the recordings");
  {
    // The 07-26 CVS finding: a verify replay confirms the route but hears no recordings, so the live
    // map can be correct and still have no recording plan. The listen pass that follows is often a
    // second or two slower — its plan must survive that.
    const noPlan: MapRecipe = { type: "voice", seconds: 40, steps: [{ action: "say", value: "front", atSec: 20 }] };
    const [ch] = await db.insert(chains).values({ name: "Test Listen Later" }).returning();
    await proposeVersion({ chainId: ch.id, recipe: noPlan, source: "verify",
      call: { at: now(), day: "2026-07-26", storeId: 1, seconds: 40, reachedHuman: true, path: "say:front" } });
    const withPlan: MapRecipe = { type: "voice", seconds: 43, steps: [{ action: "say", value: "front", atSec: 22, afterPrompt: 2 }] };
    await proposeVersion({ chainId: ch.id, recipe: withPlan, source: "sweep",
      call: { at: now(), day: "2026-07-26", storeId: 2, seconds: 43, reachedHuman: true, path: "say:front" } });
    const live = await activeMap(ch.id);
    ok(live?.recipe.steps[0].afterPrompt === 2, "the recording plan is kept even though the call was slower");
    ok(live?.seconds === 40, "and the faster time is still the one we ship");
  }

  console.log("▶ a DIFFERENT route waits for a person to approve it");
  let proposedId = 0;
  {
    const changed: MapRecipe = { type: "voice", seconds: 30, steps: [{ action: "say", value: "front", atSec: 18, afterPrompt: 2 }] };
    const r = await proposeVersion({
      chainId: cvs.id, recipe: changed, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 33, seconds: 30, reachedHuman: true, path: "say:front" },
    });
    proposedId = r.version.id;
    ok(!r.activated && r.version.status === "proposed", "a new route never swaps itself in");
    ok(r.version.summary.startsWith("Route changed"), `and says what changed: "${r.version.summary}"`);
    const live = await activeMap(cvs.id);
    ok(live?.recipe.steps[0].value === "no", "live calls still run the proven route meanwhile");
    ok((await openUnknowns(200)).some((u) => u.chainId === cvs.id && u.kind === "route-changed"), "the change is queued as a decision");
  }

  console.log("▶ approving swaps it in and retires the old one");
  {
    const res = await approveVersion(proposedId, "owner");
    ok(res.ok, "approve works");
    const live = await activeMap(cvs.id);
    ok(live?.id === proposedId && live.recipe.steps[0].value === "front", "the approved route is now live");
    const all = await versionsFor(cvs.id);
    ok(all.length === 2 && all.some((v) => v.status === "retired"), "the old version is retired, not deleted — history kept");
    const ch = (await db.select().from(chains).where(eq(chains.id, cvs.id)))[0];
    ok(ch.phoneTreeDefault?.includes("front"), "and live calls follow it");
  }

  console.log("▶ a live check re-measures the map for free");
  {
    const clean = await reportCallDrift({
      chainId: cvs.id, storeId: 33, fired: [{ value: "front", atSec: 19, via: "prompt" }], reachedHuman: true, promptCount: 2,
    });
    ok(!clean.drift, "a call that ran the map as expected reports no drift");
    const before = (await activeMap(cvs.id))!.confidence;
    const bad = await reportCallDrift({
      chainId: cvs.id, storeId: 33, fired: [{ value: "front", atSec: 44, via: "clock" }], reachedHuman: false, promptCount: 4,
    });
    ok(bad.drift, "a step that fell back to the clock IS drift");
    ok(bad.reasons.some((r) => /backup timer/.test(r)), `and it says why in plain words: "${bad.reasons[0]}"`);
    const after = (await activeMap(cvs.id))!.confidence;
    ok(after < before, `confidence drops after drift (${before} → ${after})`);
    ok((await openUnknowns(200)).some((u) => u.chainId === cvs.id && u.kind === "drift"), "drift lands in the review queue with its evidence");
  }

  console.log("▶ the record accepts a route learned on the other environment");
  {
    // What /api/admin/map/ingest does once it has resolved the chain by name and the store by phone:
    // apply it exactly as if the call had happened here, so both environments run the same recipe.
    const [ch] = await db.insert(chains).values({ name: "Test Shared Chain" }).returning();
    const shared: MapRecipe = { type: "keypad", seconds: 22, steps: [{ action: "press", value: "3", atSec: 9, afterPrompt: 1 }] };
    const res = await proposeVersion({
      chainId: ch.id, recipe: shared, source: "follower", local: true,
      call: { at: now(), day: "2026-07-26", storeId: 9, seconds: 22, reachedHuman: true, path: "press:3", greeting: "Front store, this is Ana" },
    });
    ok(res.activated && res.version.status === "active", "a route learned elsewhere lands on the record and goes live");
    const live = await activeMap(ch.id);
    ok(live?.recipe.steps[0].afterPrompt === 1, "with its recording plan intact");
    ok(live?.evidence.calls[0].greeting === "Front store, this is Ana", "and the greeting proves which desk answered");
    const chRow = (await db.select().from(chains).where(eq(chains.id, ch.id)))[0];
    ok(chRow.dtmfShortcut === "3@9", `the chain row both environments read is stamped (${chRow.dtmfShortcut})`);
  }

  console.log("▶ the graph: prompts are nodes, what we did are edges");
  {
    const [ch] = await db.insert(chains).values({ name: "Test Graph Mart" }).returning();
    const call1 = {
      chainId: ch.id, storeId: 501, reachedHuman: true, seconds: 40, outcome: "person",
      prompts: [
        { text: "Thanks for calling Graph Mart. Para español oprima nueve.", atSec: 0 },
        { text: "For the pharmacy press 1, for the front store press 2", atSec: 12 },
      ],
      actions: [{ action: "press" as const, value: "2", atSec: 16, afterPrompt: 2 }],
    };
    const r1 = await recordCallPath(call1);
    ok(r1.nodes === 2 && r1.edges === 1, `two prompts, one action (${r1.nodes} nodes, ${r1.edges} edges)`);
    ok(r1.newPrompts === 2, "both prompts are new the first time we hear them");
    // The SAME menu, transcribed slightly differently — must not mint new nodes.
    const r2 = await recordCallPath({ ...call1,
      prompts: [
        { text: "Thanks for calling Graph Mart, para español oprima nueve", atSec: 0 },
        { text: "for the pharmacy press one for the front store press 2.", atSec: 11 },
      ],
    });
    ok(r2.newPrompts === 0, "speech-to-text wobble does NOT create duplicate prompts");
    const g = await graphFor(ch.id, 501);
    ok(g.nodes.length === 2, `the graph holds two prompts (${g.nodes.length})`);
    ok(g.edges.length === 1 && g.edges[0].taken === 2, "the edge counts both times we took it");
    ok(g.edges[0].outcome === "person", "and remembers it landed on a person");
    ok(g.nodes.some((n) => n.language === "mixed" || n.language === "es"), "the Spanish line is marked as such");
    // A prompt we have never heard is answerable now — the whole point of the graph.
    const heard = await recordCallPath({ ...call1, prompts: [{ text: "Our hours have changed, we now close at nine", atSec: 0 }], actions: [] });
    ok(heard.newPrompts === 1, "a prompt we have never heard reads as new");
  }

  console.log("▶ one store disagreeing is a store exception, never a chain change");
  {
    const [ch] = await db.insert(chains).values({ name: "Test Ace Hardware" }).returning();
    const chainRoute: MapRecipe = { type: "keypad", seconds: 30, steps: [{ action: "press", value: "2", atSec: 8 }] };
    await proposeVersion({ chainId: ch.id, recipe: chainRoute, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 601, seconds: 30, reachedHuman: true, path: "press:2" } });
    // Franklin's Ace answers differently.
    const odd: MapRecipe = { type: "keypad", seconds: 25, steps: [{ action: "press", value: "4", atSec: 7 }] };
    const ex = await proposeVersion({ chainId: ch.id, storeId: 777, recipe: odd, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 777, seconds: 25, reachedHuman: true, path: "press:4" } });
    ok(ex.version.storeId === 777, "the exception is recorded against THAT store");
    ok(ex.version.status === "active", "and goes live for that store, which was failing on the chain route");
    const chainLive = await activeMap(ch.id);
    ok(chainLive?.recipe.steps[0].value === "2", "the CHAIN route is untouched — 500 stores keep working");
    ok((await activeMap(ch.id, 777))?.recipe.steps[0].value === "4", "that one store gets its own route");
    ok((await openUnknowns(300)).some((u) => u.chainId === ch.id && u.kind === "store-exception"), "and it is queued so a pattern is visible");
    // Two more stores agree → now it is the chain's route, and even then only as a proposal.
    await proposeVersion({ chainId: ch.id, storeId: 778, recipe: odd, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 778, seconds: 25, reachedHuman: true, path: "press:4" } });
    const third = await proposeVersion({ chainId: ch.id, storeId: 779, recipe: odd, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 779, seconds: 25, reachedHuman: true, path: "press:4" } });
    ok(third.version.storeId === 0, "the third store makes it a chain-level question");
    ok(third.version.status === "proposed", "still proposed, never silently swapped");
    ok((await activeMap(ch.id))?.recipe.steps[0].value === "2", "the chain keeps its route until somebody approves");
  }

  console.log("▶ failed calls count without changing the route");
  {
    const [ch] = await db.insert(chains).values({ name: "Test Failing Chain" }).returning();
    const route: MapRecipe = { type: "keypad", seconds: 30, steps: [{ action: "press", value: "0", atSec: 5 }] };
    await proposeVersion({ chainId: ch.id, recipe: route, source: "sweep",
      call: { at: now(), day: "2026-07-27", storeId: 801, seconds: 30, reachedHuman: true, path: "press:0" } });
    const before = (await activeMap(ch.id))!;
    const f1 = await recordFailedAttempt({ chainId: ch.id, storeId: 801, reason: "nobody picked up" });
    ok(f1.counted && !f1.flagged, "one failure is recorded but changes nothing");
    ok((await activeMap(ch.id))!.recipe.steps[0].value === "0", "the route is untouched by a failure");
    await recordFailedAttempt({ chainId: ch.id, storeId: 801, reason: "nobody picked up" });
    const f3 = await recordFailedAttempt({ chainId: ch.id, storeId: 801, reason: "menu changed, got lost" });
    ok(f3.flagged, `three failures in five calls raises the flag (${f3.recentFails} recent)`);
    const after = (await activeMap(ch.id))!;
    ok(after.confidence < before.confidence, `trust drops (${before.confidence} → ${after.confidence})`);
    ok(after.confidenceLabel === "needs review", "and it stops looking healthy");
    ok(after.recipe.steps[0].value === "0", "the route STILL has not changed — failures never rewrite a map");
    ok((await openUnknowns(300)).some((u) => u.chainId === ch.id && u.kind === "route-failing"), "it lands in the review queue");
  }

  console.log("▶ what the dashboard reads");
  {
    const rows = await graphSummary();
    const row = rows.find((r) => r.chainId === cvs.id)!;
    ok(!!row && row.mapped, "the chain shows as mapped");
    ok(row.route === 'say "front"', `the route reads in plain words: ${row.route}`);
    ok(row.drift30d === 1, "drift in the last 30 days is counted");
    ok(row.promptTriggered, "and it shows the steps fire on the recording, not a stopwatch");
    ok(rows.some((r) => r.hammer), "key-hammering chains are visible as such");
    const detail = await chainDetail(cvs.id);
    ok((detail.versions as unknown[]).length === 2, "the version history is readable");
    ok((detail.observations as unknown[]).length >= 3, "every observation is kept for replay");
  }

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

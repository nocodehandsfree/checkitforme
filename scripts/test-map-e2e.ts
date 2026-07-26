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
  openUnknowns, reportCallDrift, backfillFromChains, type MapRecipe,
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

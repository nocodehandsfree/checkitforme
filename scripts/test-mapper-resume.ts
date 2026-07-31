// A MAPPING RUN SURVIVES A RESTART — no phone, no money, one real database.
//
// Owner 07-30: two runs were killed mid-flight by teammates shipping (each staging push restarts the
// service, and the run's whole memory lived in that process). The fix saves the run after every
// attempt and resumes it on boot. This drives the seams with a file database:
//   - a saved running run is reloaded, logged as interrupted, and re-entered into the loop
//   - a run stopped by the admin stays stopped after a restart
//   - a finished run never resumes
//   - the saved copy carries the experiment list, counters and recipes intact
//
// Run: env DATABASE_URL=file:./.t-mapresume.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-mapper-resume.ts
import { bootstrap } from "../src/db/bootstrap";
import { getSetting, setSetting } from "../src/db/settings";
import { resumeMapperRuns, mapperState, type MapperRun } from "../src/calls/mapper";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const savedRun = (chainId: number, over: Partial<MapperRun> = {}): MapperRun => ({
  chainId, chainName: `T-${chainId}`,
  phase: "speed", running: true,
  attempt: 6, callsToday: 99, // over the cap below, so the resumed loop stops without dialing anyone
  usedStores: [11, 12], store: { id: 12, name: "T-Store", phone: "+15550000000" }, rotate: false,
  target: undefined, needsTarget: false, reachedSecs: [61, 58],
  bestMenuSecs: 41, benchmark: 60,
  provedStores: [12], doorsDead: ["pharmacy"], proveMisses: 0,
  baseline: { steps: [{ action: "say", value: "front store services", atSec: 9 }], seconds: 61 } as MapperRun["baseline"],
  best: { steps: [{ action: "say", value: "front store services", atSec: 9 }], seconds: 58 } as MapperRun["best"],
  experiments: [
    { kind: "shorten", stepIdx: 0, value: "front", label: "shorten step 1", status: "fail" },
    { kind: "barge", stepIdx: 0, at: 5, label: "barge step 1 @5s", status: "pending" },
  ],
  log: [{ n: 6, phase: "speed", store: "T-Store", outcome: "no gain — kept best", seconds: 58 }],
  startedAt: Date.now() - 60_000, updatedAt: Date.now() - 10_000,
  lockedRecipe: null, pinnedStoreId: undefined, mapMisses: 0,
  ...over,
});

await bootstrap();
// Cap at 1 with callsToday 99: the resumed loop's first guard trips, so the test never dials.
await setSetting("mapper_daily_cap", "1");

console.log("A run that was mid-flight resumes");
await setSetting("mapper_run:9001", JSON.stringify(savedRun(9001)));
const n1 = await resumeMapperRuns();
ok(n1 === 1, `resumeMapperRuns picked up exactly the one running run (got ${n1})`);
const r = mapperState().runs.find((x) => x.chainId === 9001);
ok(!!r, "the resumed run is back on the page state");
ok(!!r && r.attempt === 6 && r.bestMenuSecs === 41 && r.experiments.length === 2, "attempt count, best menu time and experiment list survived the restart intact");
ok(!!r && r.experiments.some((e) => e.status === "pending"), "the experiment that was mid-test is still pending, ready to retry");
ok(!!r && r.log.some((l) => l.outcome.includes("resumed from the last saved step")), "the interrupted attempt is written down as not-evidence");
await sleep(500); // let the resumed loop hit its daily-cap guard and wrap up
const r2 = mapperState().runs.find((x) => x.chainId === 9001);
ok(!!r2 && r2.running === false && (r2.stopReason || "").includes("daily cap"), `the resumed run entered the real loop and stopped on the guard (${r2?.stopReason})`);
ok((await getSetting("mapper_run:9001")) === "", "a finished run clears its saved memory");

console.log("A run the admin stopped stays stopped");
await setSetting("mapper_run:9002", JSON.stringify(savedRun(9002, { stop: true, stopReason: "stopped by admin" })));
const n2 = await resumeMapperRuns();
ok(n2 === 0, "a stopped run is not resumed");
ok((await getSetting("mapper_run:9002")) === "", "and its saved memory is cleared");

console.log("A finished run never resumes");
await setSetting("mapper_run:9003", JSON.stringify(savedRun(9003, { running: false, phase: "locked" })));
const n3 = await resumeMapperRuns();
ok(n3 === 0, "a finished run is not resumed");
ok((await getSetting("mapper_run:9003")) === "", "and its saved memory is cleared");

console.log("Garbage in the saved slot is skipped, never a crash");
await setSetting("mapper_run:9004", "{not json");
const n4 = await resumeMapperRuns();
ok(n4 === 0, "unreadable saved memory is skipped");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

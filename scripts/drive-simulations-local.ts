// DRIVE THE SIMULATIONS STORE LOCALLY, end to end, with no server and no phone: create the table
// the way boot does, file one run through the real module, list it, read it back. Proof for the
// build contract (docs/specs/self-improving-charlie/README.md) that can run before any deploy.
//
// Run: ./node_modules/.bin/tsx scripts/drive-simulations-local.ts   (then rm -f local.db)
// REFUSES to run against a real database: local file only, so a drive can never file a fake run
// where the owner reads.
if (process.env.DATABASE_URL) { console.error("refusing: DATABASE_URL is set, this drive is local-file only"); process.exit(1); }
const { client } = await import("../src/db/client");
const { fileSimRun, listSimRuns, readSimRun } = await import("../src/calls/simulations");

await client.execute(`CREATE TABLE IF NOT EXISTS sim_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '',
  info TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, calls INTEGER NOT NULL,
  passed INTEGER NOT NULL, failed INTEGER NOT NULL, avg_meter_sec REAL,
  verdict_line TEXT NOT NULL DEFAULT '', calls_json TEXT NOT NULL DEFAULT '[]')`);

const calls = [
  { cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 18, speakingSec: 11, listeningSec: 5, lines: [] },
  { cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 21, speakingSec: 13, listeningSec: 6, lines: [] },
  { cardKey: "answer_clear_yes", statusKey: "in_stock", meterSec: 34, speakingSec: 20, listeningSec: 8,
    lines: [{ who: "staff", text: "Yeah we got a few boxes left." }, { who: "charlie", text: "Perfect, thanks so much, bye now." }, { who: "staff", text: "Wait, did you want me to hold one?" }],
    failName: "Goodbye: too early", why: "Charlie said goodbye before Staff finished helping, so the check ended on a question." },
];
const filed = await fileSimRun({ name: "Goodbye: shorter", sub: "Charlie ends every check with a shorter goodbye." }, calls);
console.log("filed:", filed.id, "·", filed.calls, "calls ·", filed.passed, "passed ·", filed.failed, "failed · avg", filed.avgMeterSec + "s");
console.log("verdict:", filed.verdictLine);
const list = await listSimRuns();
console.log("list row:", JSON.stringify(list[0]));
const full = await readSimRun(Number(filed.id));
const f = full!.callList.find((c) => !c.pass)!;
console.log("failed call:", `call ${f.n} of ${full!.calls}`, "·", f.failName, "· lines kept:", f.lines.length, "· meter says:", f.meterFails[0] || "nothing");
client.close();

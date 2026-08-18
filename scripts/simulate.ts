// POST ONE SIMULATION RUN to the Admin API (docs/specs/self-improving-charlie/README.md).
//
// The conversations come from the agent session that runs this script — the owner's own
// Anthropic plan pays for the thinking, no partner tech and no phone is used. The server grades
// every call with the SAME cards and meter law a real check gets (src/calls/simulations.ts) and
// files the run in its own table, never the checks record.
//
// Usage: ADMIN_TOKEN=… ./node_modules/.bin/tsx scripts/simulate.ts <run.json> [host]
//   run.json = { "run": { "name": "Goodbye: shorter", "sub": "…", "info": "…" },
//                "calls": [ { "cardKey": "answer_clear_yes", "statusKey": "in_stock",
//                             "meterSec": 19, "speakingSec": 12, "listeningSec": 5,
//                             "lines": [{ "who": "staff", "text": "…" },
//                                       { "who": "charlie", "text": "…" }],
//                             "failName": null, "why": null } ] }
import { readFileSync } from "node:fs";

const file = process.argv[2];
const HOST = process.argv[3] || process.env.REPLAY_HOST || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
if (!file || !TOKEN) { console.error("usage: ADMIN_TOKEN=… tsx scripts/simulate.ts <run.json> [host]"); process.exit(1); }

const body = JSON.parse(readFileSync(file, "utf8"));
const r = await fetch(`${HOST}/api/admin/sim-runs`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-token": TOKEN, "User-Agent": "Mozilla/5.0 (iPhone; simulate poster)" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
});
const out = await r.json().catch(() => null);
if (!r.ok || !out?.ok) { console.error(`filing failed → ${r.status}`, out); process.exit(1); }
console.log(`filed: run ${out.run.id} · ${out.run.name} · ${out.run.calls} simulations · ${out.run.passed} passed · ${out.run.failed} failed`);
console.log(out.run.verdictLine);

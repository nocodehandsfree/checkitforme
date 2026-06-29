// Unit test for the fail-fast boot security gate. Run: ./node_modules/.bin/tsx scripts/test-securitychecks.ts
// assertProdSecurity() calls process.exit(1) when a CRITICAL secret is misconfigured in production, so
// we exercise it in child processes (this same file re-run with SEC_CHILD=1) and assert the exit code.
import { assertProdSecurity } from "../src/security-checks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// --- child mode: just run the gate; exit 0 means "did not refuse to start" ---
if (process.env.SEC_CHILD === "1") {
  assertProdSecurity();
  process.exit(0);
}

// --- parent mode: spawn the gate under controlled env and check the exit status ---
const self = fileURLToPath(import.meta.url);
const STRONG = "k".repeat(40); // ≥32 chars

function run(extra: Record<string, string>): number {
  const base: Record<string, string | undefined> = { ...process.env };
  // Wipe everything we control so an inherited value can't leak into a case.
  for (const k of ["RAILWAY_ENVIRONMENT", "CLERK_ENFORCE", "SESSION_SECRET", "ELEVENLABS_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]) delete base[k];
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v;
  // config.ts requires these at import time regardless of the security gate.
  Object.assign(env, { ELEVENLABS_API_KEY: "test", ELEVENLABS_AGENT_ID: "test", ELEVENLABS_PHONE_NUMBER_ID: "test", SEC_CHILD: "1" }, extra);
  const r = spawnSync("./node_modules/.bin/tsx", [self], { env, encoding: "utf8" });
  return r.status ?? -1;
}

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ production: refuses to start on a CRITICAL misconfig (exit 1)");
ok(run({ RAILWAY_ENVIRONMENT: "production", SESSION_SECRET: STRONG }) === 1, "CLERK_ENFORCE off → exit 1 (admin API would be open)");
ok(run({ RAILWAY_ENVIRONMENT: "production", CLERK_ENFORCE: "true", SESSION_SECRET: "short" }) === 1, "weak SESSION_SECRET (<32) → exit 1");
ok(run({ RAILWAY_ENVIRONMENT: "production", CLERK_ENFORCE: "true" }) === 1, "missing SESSION_SECRET → exit 1");
ok(run({ RAILWAY_ENVIRONMENT: "production", CLERK_ENFORCE: "true", SESSION_SECRET: "dev-insecure-secret-change-me" }) === 1, "the dev placeholder secret → exit 1");

console.log("▶ production: a fully secure config boots (exit 0)");
ok(run({ RAILWAY_ENVIRONMENT: "production", CLERK_ENFORCE: "true", SESSION_SECRET: STRONG }) === 0, "enforce on + strong secret → boots, even with webhook secrets unset (warn-only)");

console.log("▶ non-production: nothing is fatal, dev/CI boots freely (exit 0)");
ok(run({}) === 0, "no RAILWAY_ENVIRONMENT + insecure config → still exit 0");
ok(run({ CLERK_ENFORCE: "false" }) === 0, "explicit CLERK_ENFORCE=false locally → still exit 0");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

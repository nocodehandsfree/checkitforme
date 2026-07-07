#!/usr/bin/env node
// Store-data contract guard (docs/data/provenance.md → "Carries — derived from distributors").
// Fails the build if a store-listing endpoint serves the RAW `retailers.carries` column instead of
// the distributor-derived resolver `storeCarriesList()`. Keeps carries consistent across Admin/staging/
// prod and auto-applied to new stores — a new endpoint can't silently regress coverage.
//
// Wire into CI / the pre-build check (e.g. add to package.json "check" and run on PR).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/server.ts"), "utf8");

const violations = [];
src.split("\n").forEach((ln, i) => {
  // A store-RESPONSE field that emits the raw carries column. Allowed only via storeCarriesList();
  // the ranking FILTER in /pub/best-bet (`!cat || !(r.carries) || r.carries.toLowerCase()...`) is exempt
  // because it never serves carries to a surface — it only excludes non-matching stores.
  const servesRaw = /\bcarries:\s*\(?\s*r\.carries\b/.test(ln);
  if (servesRaw && !/storeCarriesList/.test(ln)) violations.push(`  src/server.ts:${i + 1}  ${ln.trim()}`);
});

if (violations.length) {
  console.error("✗ store-contract: a store response serves the RAW carries column — use storeCarriesList(chainName, r.carries):");
  console.error(violations.join("\n"));
  console.error("  → see docs/data/provenance.md → 'Carries — derived from distributors (same serve-time pattern as logos)'");
  process.exit(1);
}
console.log("✓ store-contract: every store response derives carries via storeCarriesList()");

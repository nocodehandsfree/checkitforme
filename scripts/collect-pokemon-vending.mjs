// Collector: pull EVERY official Pokémon vending machine from the public locator API
// (https://api.vending.prod.pokemon.com/v1/machines) and emit an import file in our StoreIn shape.
//
// The endpoint is a map-viewport query (swLat/swLng/neLat/neLng) that hard-caps at 20 results and
// has no `limit` param, so we cover the US with an ADAPTIVE QUADTREE: any box that returns the full
// 20 is "saturated" and gets split into 4 children; boxes under the cap are complete. Dedupe by the
// Airtable record id. Read-only against an external API — safe to re-run as machines come online.
//
// Pacing: the API throttles bursts (HTTP 403 after ~100 rapid hits), so we crawl SEQUENTIALLY with a
// small delay and exponential backoff on 403/429/5xx, then do a second pass over any cells that still
// failed. Coverage is only trustworthy when failedCells = 0 at the end.
//
// Usage: node scripts/collect-pokemon-vending.mjs
// Outputs: /tmp/pokemon-vending-raw.json  +  data/pokemon-vending-import.json  + a summary to stdout.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://api.vending.prod.pokemon.com/v1/machines";
const HEADERS = {
  Accept: "application/json",
  Origin: "https://vending.pokemon.com",
  Referer: "https://vending.pokemon.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};
const CAP = 20;          // server hard cap per query
const MIN_DEG = 0.02;    // ~1.4 mi floor — stop splitting below this
const REQ_DELAY = 220;   // ms between requests (sequential — gentle on the WAF)
const MAX_REQ = 20000;   // runaway guard

// Seed boxes: CONUS, Alaska, Hawaii, Puerto Rico (the API only serves US machines).
const SEEDS = [
  { swLat: 24.0, swLng: -125.0, neLat: 49.5, neLng: -66.5 }, // contiguous US
  { swLat: 51.0, swLng: -179.9, neLat: 71.5, neLng: -129.0 }, // Alaska
  { swLat: 18.5, swLng: -160.5, neLat: 22.5, neLng: -154.5 }, // Hawaii
  { swLat: 17.8, swLng: -67.6, neLat: 18.6, neLng: -65.2 },   // Puerto Rico
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const found = new Map();
let reqs = 0, saturatedFloor = 0;

async function fetchBox(b) {
  const url = `${API}?swLat=${b.swLat}&swLng=${b.swLng}&neLat=${b.neLat}&neLng=${b.neLng}&unit=mi`;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        await sleep(Math.min(20000, 700 * 2 ** attempt) + Math.random() * 300); // backoff on throttle
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      return { ok: true, machines: j.machines || [] };
    } catch (e) {
      if (attempt === 6) { console.error("fetch FAILED (gave up)", url, String(e)); return { ok: false, machines: [] }; }
      await sleep(Math.min(20000, 700 * 2 ** attempt) + Math.random() * 300);
    }
  }
  return { ok: false, machines: [] };
}

function split(b) {
  const mlat = (b.swLat + b.neLat) / 2, mlng = (b.swLng + b.neLng) / 2;
  return [
    { swLat: b.swLat, swLng: b.swLng, neLat: mlat, neLng: mlng },
    { swLat: b.swLat, swLng: mlng, neLat: mlat, neLng: b.neLng },
    { swLat: mlat, swLng: b.swLng, neLat: b.neLat, neLng: mlng },
    { swLat: mlat, swLng: mlng, neLat: b.neLat, neLng: b.neLng },
  ];
}

// Drain a queue of boxes sequentially; return the list of cells that never succeeded.
async function drain(queue) {
  const failed = [];
  while (queue.length) {
    const b = queue.shift();
    const r = await fetchBox(b);
    reqs++;
    for (const mc of r.machines) found.set(mc.id, mc);
    if (!r.ok) { failed.push(b); }
    else {
      const splittable = (b.neLat - b.swLat) > MIN_DEG && (b.neLng - b.swLng) > MIN_DEG;
      if (r.machines.length >= CAP && splittable) queue.push(...split(b));
      else if (r.machines.length >= CAP) saturatedFloor++;
    }
    if (reqs % 50 === 0) console.error(`  …reqs=${reqs} unique=${found.size} queue=${queue.length} failed=${failed.length}`);
    if (reqs >= MAX_REQ) { console.error("hit MAX_REQ guard — stopping"); break; }
    await sleep(REQ_DELAY);
  }
  return failed;
}

function toImportItem(m) {
  return {
    chain: "Pokémon Vending",                 // dedicated official-kiosk brand (owner may remap to host retailer)
    name: `Pokémon Vending ${m.city || m.stateProvince || ""}`.trim(),
    category: "Hobby",
    address: m.street || null,
    city: m.city || null,
    state: m.stateProvince || null,
    zip: m.zipPostalCode || null,
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    phone: "",                                 // no line → importer mints a synthetic nophone: key
    carries: "Pokémon",
    sellsPacks: false,                         // a vending machine is not callable
    hasKiosk: true,
    tier: 5,                                   // Best Chance — official, genuine @ MSRP
    store_id: m.name,                          // machine Q-code → externalStoreId + UNIQUE nophone key
    specialInstructions:
      `Official Pokémon vending machine at ${m.retailer || "host store"}` +
      `${m.street ? `, ${m.street}` : ""}${m.city ? `, ${m.city}` : ""} ${m.stateProvince || ""}`.trim() +
      ` (machine ${m.name}).`,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const outImport = join(here, "..", "data", "pokemon-vending-import.json");

console.error("Crawling Pokémon vending locator (sequential, adaptive quadtree)…");
let failed = await drain([...SEEDS]);
if (failed.length) {
  console.error(`Retry pass over ${failed.length} failed cells…`);
  await sleep(3000);
  failed = await drain(failed);
}

const machines = [...found.values()];
const byRetailer = {}; const byState = {};
for (const m of machines) {
  byRetailer[m.retailer || "(unknown)"] = (byRetailer[m.retailer || "(unknown)"] || 0) + 1;
  byState[m.stateProvince || "(none)"] = (byState[m.stateProvince || "(none)"] || 0) + 1;
}
const topRetailers = Object.entries(byRetailer).sort((a, b) => b[1] - a[1]);
const states = Object.entries(byState).sort((a, b) => b[1] - a[1]);

const items = machines.map(toImportItem);
writeFileSync("/tmp/pokemon-vending-raw.json", JSON.stringify(machines, null, 2));
writeFileSync(outImport, JSON.stringify(items, null, 2));

console.log("\n===== POKÉMON VENDING COLLECTION COMPLETE =====");
console.log(`requests:           ${reqs}`);
console.log(`unique machines:    ${machines.length}`);
console.log(`FAILED cells:       ${failed.length}  ${failed.length ? "⚠️  COVERAGE INCOMPLETE — re-run" : "✓ full coverage"}`);
console.log(`saturated floor:    ${saturatedFloor} (cells with >20 at min size — manual review if >0)`);
console.log(`distinct retailers: ${topRetailers.length}`);
console.log(`states covered:     ${states.length}`);
console.log(`\nTop host retailers:`);
for (const [r, n] of topRetailers.slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${r}`);
console.log(`\nBy state:`);
console.log("  " + states.map(([s, n]) => `${s}:${n}`).join("  "));
console.log(`\nWrote ${items.length} import rows → ${outImport}`);

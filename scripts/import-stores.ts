// Chunked uploader for the nationwide store master file (50K+ stores). One giant POST would be a
// 50MB+ payload — this slices the file into chunks, uploads each with retries, and tallies results.
//
// Usage:
//   tsx scripts/import-stores.ts output/stores_master.json \
//     --base https://pokemon.fungibles.com --token $ADMIN_TOKEN [--chunk 500] [--carries Pokémon] [--dry]
//
// The importer accepts the collector's native fields (phone_tree_tip, shipment_days,
// department_to_ask, restock_best_hunt_window, distributor, msrp_reliability) — no reshaping needed.
// --carries stamps a default carries label on rows that don't have one (e.g. the Pokémon master file).
import { readFileSync } from "fs";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const file = process.argv[2];
const base = (arg("--base") || "http://127.0.0.1:8787").replace(/\/$/, "");
const token = arg("--token") || process.env.ADMIN_TOKEN || "";
const chunkSize = Number(arg("--chunk", "500"));
const carries = arg("--carries");
const dry = process.argv.includes("--dry");

if (!file) { console.error("usage: tsx scripts/import-stores.ts <file.json> --base <url> --token <admin token>"); process.exit(1); }

const raw = JSON.parse(readFileSync(file, "utf8"));
const stores: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.stores || raw.items || []);
if (!Array.isArray(stores) || !stores.length) { console.error("no stores found in file"); process.exit(1); }
console.log(`${stores.length} stores in ${file} → ${base} (chunks of ${chunkSize}${carries ? `, default carries=${carries}` : ""}${dry ? ", DRY RUN" : ""})`);

if (carries) for (const s of stores) if (!s.carries) s.carries = [carries];

const totals = { inserted: 0, updated: 0, deactivated: 0, skipped: 0, failedChunks: 0 };
async function postChunk(items: unknown[], idx: number, attempt = 1): Promise<void> {
  try {
    const r = await fetch(`${base}/api/stores/import`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-admin-token": token } : {}) },
      body: JSON.stringify({ stores: items }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as Record<string, number>;
    totals.inserted += d.inserted || 0; totals.updated += d.updated || 0;
    totals.deactivated += d.deactivated || 0; totals.skipped += d.skipped || 0;
    console.log(`  chunk ${idx}: +${d.inserted || 0} ins, ${d.updated || 0} upd, ${d.skipped || 0} skip`);
  } catch (e) {
    if (attempt < 4) {
      const wait = 2000 * attempt;
      console.warn(`  chunk ${idx} failed (attempt ${attempt}): ${String(e).slice(0, 120)} — retrying in ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait));
      return postChunk(items, idx, attempt + 1);
    }
    totals.failedChunks++;
    console.error(`  chunk ${idx} FAILED after 3 retries: ${String(e).slice(0, 200)}`);
  }
}

(async () => {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < stores.length; i += chunkSize) chunks.push(stores.slice(i, i + chunkSize));
  console.log(`${chunks.length} chunks`);
  if (dry) { console.log("dry run — sample row:", JSON.stringify(stores[0]).slice(0, 400)); process.exit(0); }
  const t0 = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    await postChunk(chunks[i], i + 1);
    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${chunks.length} chunks (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  console.log(`\nDONE in ${Math.round((Date.now() - t0) / 1000)}s →`, totals);
  process.exit(totals.failedChunks ? 1 : 0);
})();

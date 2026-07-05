// Sync the product catalog from the LIVE Drops DB (dropsdb.fungibles.com, closed beta).
//
// The Drops DB is the SOURCE OF TRUTH for products (types, MSRP, retailers). `data/drops_db.json` is a
// synced snapshot that `src/db/seed.ts` loads into the `products` table, which `/pub/pokemon-sets`
// reads. Run this whenever the Drops DB changes so the feed stays current (seed upserts new rows on
// boot via onConflictDoNothing, so new set/product types flow through on the next deploy):
//
//   DROPSDB_PASSWORD='<closed-beta password>' npx tsx scripts/sync-dropsdb.ts
//
// Store the password in Railway (DROPSDB_PASSWORD) so this can run in CI / on demand — never hardcode it.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PW = process.env.DROPSDB_PASSWORD;
if (!PW) { console.error("Set DROPSDB_PASSWORD (the Drops DB closed-beta password)."); process.exit(1); }
const BASE = "https://dropsdb.fungibles.com";

// 1) Authenticate → the beta session cookie.
const auth = await fetch(`${BASE}/__auth`, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ password: PW }).toString(),
});
const cookie = (auth.headers.get("set-cookie") || "").split(";")[0];
if (!cookie || !cookie.includes("=")) { console.error(`Auth failed (HTTP ${auth.status}). Check the password.`); process.exit(1); }

// 2) Pull the authoritative catalog.
const res = await fetch(`${BASE}/drops_db.json`, { headers: { cookie } });
const data = await res.json() as { v?: number; cats?: string[]; products?: unknown[] };
if (!data || !Array.isArray(data.products) || !data.products.length) { console.error("Bad payload from Drops DB."); process.exit(1); }

// 3) Write the snapshot (2-space, matching the committed format for clean diffs).
const out = join(dirname(fileURLToPath(import.meta.url)), "../data/drops_db.json");
writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
const pk = (data.products as Array<{ category?: string }>).filter((p) => p.category === "Pokémon TCG").length;
console.log(`Synced ${data.products.length} products (${pk} Pokémon) -> data/drops_db.json`);

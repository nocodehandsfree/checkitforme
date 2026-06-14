// Seed categories, chains, and the product catalog from data/drops_db.json.
// Idempotent: re-running won't duplicate (conflicts on unique keys are ignored).
//
//   pnpm db:push   # create tables
//   pnpm db:seed   # load the catalog
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { db, client } from "./client";
import { categories, chains, products } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const dropsPath = join(here, "../../data/drops_db.json");

interface Drop {
  id: string;
  category: string;
  retailer: string;
  series?: string;
  type?: string;
  language?: string;
  title: string;
  itemCode?: string;
  sku?: string;
  pmsrp?: number | null;
  rmsrp?: number | null;
  max?: number | null;
  note?: string;
}
interface DropsDb { cats: string[]; products: Drop[] }

// Catalog category label → our (key, display label).
const CATEGORY_META: Record<string, { key: string; label: string }> = {
  "Pokémon TCG": { key: "pokemon", label: "Pokémon" },
  "NeeDoh": { key: "needoh", label: "NeeDoh" },
  "Topps NBA": { key: "topps_nba", label: "Topps NBA" },
  "One Piece TCG": { key: "one_piece", label: "One Piece TCG" },
};

// Amazon is online-only — not a call target. The rest can be phoned.
const NON_CALL_TARGETS = new Set(["Amazon"]);

async function seed() {
  const data: DropsDb = JSON.parse(readFileSync(dropsPath, "utf8"));

  // Categories
  for (let i = 0; i < data.cats.length; i++) {
    const cat = data.cats[i];
    const meta = CATEGORY_META[cat] ?? { key: slug(cat), label: cat };
    await db.insert(categories)
      .values({ key: meta.key, label: meta.label, sort: i })
      .onConflictDoNothing();
  }

  // Chains (catalog sources; physical call targets like B&N / CVS are added via store onboarding)
  const chainNames = [...new Set(data.products.map((p) => p.retailer))];
  for (const name of chainNames) {
    await db.insert(chains)
      .values({ name, callTarget: !NON_CALL_TARGETS.has(name) })
      .onConflictDoNothing();
  }

  // Lookups
  const catId = new Map((await db.select().from(categories)).map((c) => [c.key, c.id]));
  const chainId = new Map((await db.select().from(chains)).map((c) => [c.name, c.id]));

  // Products
  let inserted = 0;
  for (const p of data.products) {
    const meta = CATEGORY_META[p.category] ?? { key: slug(p.category), label: p.category };
    const cid = catId.get(meta.key);
    if (!cid) continue;
    await db.insert(products)
      .values({
        externalId: p.id,
        categoryId: cid,
        name: p.title,
        carriedByChainId: chainId.get(p.retailer) ?? null,
        series: p.series || null,
        type: p.type || null,
        sku: p.sku || null,
        itemCode: p.itemCode || null,
        language: p.language || null,
        msrp: p.pmsrp ?? p.rmsrp ?? null,
        maxPrice: p.max ?? null,
        note: p.note || null,
      })
      .onConflictDoNothing();
    inserted++;
  }

  console.log(`Seeded from ${data.products.length} catalog rows (${inserted} processed).`);
  console.log({
    categories: (await db.select().from(categories)).length,
    chains: (await db.select().from(chains)).length,
    products: (await db.select().from(products)).length,
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export { seed };

// Run as a CLI: `pnpm db:seed`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
  client.close();
}

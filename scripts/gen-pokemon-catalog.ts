// Generate the per-set product lineup for EVERY Pokémon era, from the owner's authoritative per-era
// product-type lists (a card-shop owner's ground truth). Output: data/pokemon-catalog-supplement.json,
// a sync-safe curated overlay (drops_db.json stays a pure Drops DB snapshot). seedCatalogSupplement()
// loads it into `products` on boot (insert new + deactivate removed).
//
// Prices: ONLY the two CURRENT retail eras (Mega Evolution + Scarlet & Violet) carry a retail price —
// those are on shelves now. Older, out-of-print eras show the product TYPES with no price (never
// fabricate a historical/secondary-market "retail"). Booster box + prerelease/checklane products are
// MAIN-set only (special ".5"/side sets never had a sealed booster box).
//
//   npx tsx scripts/gen-pokemon-catalog.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sets = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")) as
  { eras: Array<{ era: string; sets: Array<{ code: string; name: string; kind?: string }> }> };
const drops = JSON.parse(readFileSync(join(here, "../data/drops_db.json"), "utf8")) as
  { products: Array<{ series?: string; type?: string; category?: string }> };

// Owner's per-era product types (pokemon-sets.json era name → list).
const MODERN = ["Booster Pack", "Booster Bundle", "Booster Box", "Single-Pack Blister", "Checklane Blister",
  "3-Pack Blister", "Elite Trainer Box", "Pokémon Center Elite Trainer Box", "Build & Battle", "Build & Battle Stadium"];
const ERA_TYPES: Record<string, string[]> = {
  "Mega Evolution": MODERN,
  "Scarlet & Violet": MODERN,
  "Sword & Shield": MODERN,
  "Sun & Moon": ["Booster Pack", "Booster Box", "Elite Trainer Box", "Pokémon Center Elite Trainer Box", "Theme Deck",
    "Trainer Kit", "Build & Battle", "1-Pack Blister", "3-Pack Blister", "Standard Tin", "Mini Tin", "Collector Chest"],
  "XY": ["Booster Pack", "Booster Box", "Elite Trainer Box", "Theme Deck", "Trainer Kit", "Prerelease Kit",
    "1-Pack Blister", "3-Pack Blister", "Standard Tin", "Collector Chest", "Collection Box"],
  "Black & White": ["Booster Pack", "Booster Box", "Theme Deck", "Trainer Kit", "Prerelease Kit",
    "1-Pack Blister", "3-Pack Blister", "Standard Tin", "Collection Box"],
  "HeartGold & SoulSilver": ["Booster Pack", "Booster Box", "Theme Deck", "Trainer Kit", "Prerelease Kit",
    "1-Pack Blister", "3-Pack Blister", "Standard Tin", "Collection Box"],
  "Platinum": ["Booster Pack", "Booster Box", "Theme Deck", "Prerelease Kit", "1-Pack Blister", "3-Pack Blister",
    "Standard Tin", "Collection Box"],
  "Diamond & Pearl": ["Booster Pack", "Booster Box", "Theme Deck", "Trainer Kit", "Prerelease Kit",
    "1-Pack Blister", "3-Pack Blister", "Standard Tin"],
  "EX": ["Booster Pack", "Booster Box", "Theme Deck", "Starter Kit", "Prerelease Kit", "1-Pack Blister",
    "3-Pack Blister", "Standard Tin", "Collection Box"],
  "e-Card": ["Booster Pack", "Booster Box", "Starter Deck", "1-Pack Blister", "3-Pack Blister"],
  "Neo": ["Booster Pack", "Booster Box", "1-Pack Blister"],
  "Original Series": ["Booster Pack", "Booster Box", "Theme Deck", "Starter Set", "1-Pack Blister", "2-Pack Blister"],
};
// Retail MSRPs — used ONLY for the two current eras. (Booster box = 36 × pack.)
const PRICED_ERAS = new Set(["Mega Evolution", "Scarlet & Violet"]);
const MSRP: Record<string, number> = {
  "Booster Pack": 4.49, "Booster Bundle": 26.94, "Booster Box": 161.64, "Single-Pack Blister": 6.49,
  "Checklane Blister": 5.99, "3-Pack Blister": 14.99, "Elite Trainer Box": 49.99,
  "Pokémon Center Elite Trainer Box": 69.99, "Build & Battle": 24.99, "Build & Battle Stadium": 49.99,
};
// Sealed booster box + prerelease/checklane products only exist for MAIN sets, never the special ".5" sets.
const MAIN_ONLY = new Set(["Booster Box", "Build & Battle", "Build & Battle Stadium", "Checklane Blister", "Prerelease Kit"]);

const norm = (s: string) => (s || "").toLowerCase().replace(/\s*\(base\)\s*/g, "").replace(/\s*\/\s*/g, " & ").trim();
// What each set already carries in the Drops DB — so we never duplicate a set-specific SKU already curated.
const have = new Map<string, Set<string>>();
for (const p of drops.products) {
  if (p.category !== "Pokémon TCG" || !p.series || !p.type) continue;
  const k = norm(p.series); if (!have.has(k)) have.set(k, new Set());
  have.get(k)!.add(p.type.toLowerCase());
}
// A set already has a type if an exact/alias match exists (ETB↔PC-ETB↔blister↔collection families).
function alreadyHas(existing: Set<string>, type: string): boolean {
  const t = type.toLowerCase();
  const any = (...ks: string[]) => ks.some((k) => [...existing].some((e) => e.includes(k)));
  if (t === "elite trainer box") return [...existing].some((e) => (e.includes("etb") || e.includes("elite trainer")) && !e.includes("center") && !e.includes("pc "));
  if (t.includes("pokémon center") || t === "pc etb") return any("pokémon center", "pokemon center", "pc etb");
  if (t.includes("collection")) return any("collection"); // any collection SKU already curated → skip the generic
  if (t.includes("blister")) return [...existing].some((e) => e.includes("blister") && e.split("-")[0] === t.split("-")[0]);
  return existing.has(t);
}

const out: Array<Record<string, unknown>> = [];
const summary: string[] = [];
for (const e of sets.eras) {
  const types = ERA_TYPES[e.era]; if (!types) continue;
  const priced = PRICED_ERAS.has(e.era);
  for (const s of e.sets) {
    const isMain = (s.kind || "main") !== "special";
    const existing = have.get(norm(s.name)) || new Set<string>();
    const added: string[] = [];
    for (const type of types) {
      if (MAIN_ONLY.has(type) && !isMain) continue;
      if (alreadyHas(existing, type)) continue;
      out.push({
        id: `pk-supp-${String(s.code).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        category: "Pokémon TCG", series: s.name, type, title: `${s.name} ${type}`,
        pmsrp: priced ? (MSRP[type] ?? null) : null, language: "English",
      });
      added.push(type);
    }
    if (added.length) summary.push(`  ${s.code.padEnd(9)} ${s.name.slice(0, 24).padEnd(24)} ${isMain ? "main   " : "special"} ${priced ? "$" : "—"} +${added.length}`);
  }
}
writeFileSync(join(here, "../data/pokemon-catalog-supplement.json"),
  JSON.stringify({ _note: "Curated per-set product overlay for ALL Pokémon eras; generated by scripts/gen-pokemon-catalog.ts. Prices only on current retail eras (Mega/SV). Sync-safe (not overwritten by sync-dropsdb).", cats: ["Pokémon TCG"], products: out }, null, 2) + "\n");
console.log(`Generated ${out.length} supplement products across ${summary.length} sets:\n${summary.join("\n")}`);

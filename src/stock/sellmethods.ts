// Sell-methods taxonomy seed — per-chain "ways to get it" + first-party/MSRP flag.
// Mirrors stock/intel.ts: loads data/sell_methods_intel.json and fills the chains table.
// Three axes stay separate (see SELL_METHODS_PLAN, git history):
//   A. ways to get it  → chains.sellMethods (in_store|pickup|ship)
//   B. how we check    → chains.stockCheckMethod (call|site)
//   C. can we call?    → retailers.sellsPacks (callable)
//   D. price/source    → chains.isMSRP (true=first-party/MSRP, false=third-party may exceed)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client";
import { chains } from "../db/schema";

interface SM { sellMethods?: string[]; isMSRP?: boolean }
function loadIntel(): Record<string, SM> {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), "../../data/sell_methods_intel.json");
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("sell_methods_intel.json missing — skipping sell-methods seed:", e);
    return {};
  }
}

/**
 * Seed sell-methods onto chains. Every chain gets explicit values (so the admin can see/edit them):
 * listed chains use their entry, the rest fall back to `_default` (in_store, MSRP). Fill-blanks by
 * default (never clobbers owner edits); `force` overwrites from the file (admin "reapply").
 */
export async function seedSellMethods(force = false): Promise<number> {
  const intel = loadIntel();
  const def = intel._default ?? { sellMethods: ["in_store"], isMSRP: true };
  let applied = 0;
  for (const ch of await db.select().from(chains)) {
    if (ch.name.startsWith("_")) continue;
    const it = intel[ch.name] ?? def;
    const sellMethods = (it.sellMethods ?? def.sellMethods ?? ["in_store"]).join(",");
    const isMSRP = it.isMSRP ?? def.isMSRP ?? true;
    const r = await db.update(chains).set({ sellMethods, isMSRP })
      .where(force ? eq(chains.id, ch.id) : and(eq(chains.id, ch.id), isNull(chains.sellMethods)));
    applied += r.rowsAffected ?? 0;
  }
  return applied;
}

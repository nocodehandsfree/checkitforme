// Which chains let us check shelf stock WITHOUT a call — the "site rail".
// The authoritative per-chain classification is the collector's deliverable
// `data/stock_check_intel.json` (80 chains): method "site" = the chain's website shows real
// per-store inventory (free, instant, at scale — the BrickSeek/PopFindr model); "call" = no
// reliable online stock, use the phone rail. Confidence: confirmed | probable | default.
// Books-A-Million and CVS are call-only per their own docs — never build site checkers for them.
//
// Seeded insert-if-absent at bootstrap: blanks are filled, owner edits in the DB are never
// overwritten. Chain names match the nationwide collector's names exactly so the big import
// links to the same rows.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client";
import { chains } from "../db/schema";

interface IntelRow { stockCheckMethod: string; stockCheckConfidence: string; stockCheckNote: string }

function loadIntelFile(): Record<string, IntelRow> {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), "../../data/stock_check_intel.json");
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("stock_check_intel.json missing/unreadable — skipping stock-check seed:", e);
    return {};
  }
}

// Code-side extras the intel file doesn't carry: per-store inventory URL templates
// ({storeId}/{zip}/{query}) and chains with no per-store phone line at all.
const EXTRAS: Record<string, { siteStockUrl?: string; noPhone?: boolean }> = {
  "Micro Center": {
    noPhone: true, // site is the ONLY rail — there is no store line to dial
    siteStockUrl: "https://www.microcenter.com/search/search_results.aspx?Ntt={query}&storeid={storeId}",
  },
};

/**
 * Fill stock-check classification on chains (create the chain row if it doesn't exist yet).
 * Default insert-if-absent: never clobbers owner edits. `force` (admin "reapply" endpoint)
 * overwrites the intel fields from the file — for when a new intel revision lands (e.g. v3's
 * big-box first-party/pickup RULE) and should reach already-classified rows.
 */
export async function seedStockCheckIntel(force = false): Promise<number> {
  const intel = loadIntelFile();
  let applied = 0;
  for (const [name, it] of Object.entries(intel)) {
    const extra = EXTRAS[name] ?? {};
    const found = (await db.select().from(chains).where(eq(chains.name, name)))[0];
    if (!found) {
      await db.insert(chains).values({
        name, stockCheckMethod: it.stockCheckMethod, stockCheckConfidence: it.stockCheckConfidence,
        stockCheckNote: it.stockCheckNote, siteStockUrl: extra.siteStockUrl ?? null,
        ...(extra.noPhone ? { callTarget: false } : {}),
      });
      applied++;
      continue;
    }
    // Only fill blanks so the owner's admin edits always win over re-deploys (unless forced).
    const r = await db.update(chains).set({
      stockCheckMethod: it.stockCheckMethod, stockCheckConfidence: it.stockCheckConfidence,
      stockCheckNote: it.stockCheckNote, siteStockUrl: extra.siteStockUrl ?? null,
    }).where(force ? eq(chains.id, found.id) : and(eq(chains.id, found.id), isNull(chains.stockCheckMethod)));
    applied += r.rowsAffected ?? 0;
  }
  return applied;
}

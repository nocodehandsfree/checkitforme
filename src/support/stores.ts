// ── What the support agent is allowed to say about store coverage ────────────────────────────
// Round 1 test 4 caught the agent answering "Yes, you can check the Target in Glendale" and "Yes,
// GameStop stores can be checked too" from nothing at all: it reads the book, and the book has no
// store list, so both were confident guesses. A guess about coverage is a promise we might not
// keep, and the customer finds out by tapping and getting nowhere.
//
// So coverage is answered from the store table, the same rows and the same `callable` / `callReady`
// flags the store list itself uses, and nothing else. If the question does not name something we
// recognise, the agent is told to say it cannot tell rather than to guess.
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db/client";
import { retailers, chains } from "../db/schema";

/** A chain or store name worth looking up, pulled out of a plain question. Deliberately narrow:
 *  the point is to recognise "do you call Target?", not to parse English. */
export function namedPlace(message: string): string | null {
  const m = message.toLowerCase();
  // "do you (check|call|do) X", "what about X", "can you check X"
  const hit = /(?:do you (?:check|call|do|cover)|can you (?:check|call)|what about|how about|do you guys (?:check|call|do))\s+(?:the\s+)?([a-z0-9'&. -]{2,40})/i.exec(m);
  const raw = (hit?.[1] || "").trim().replace(/[?.!,]+$/, "");
  if (!raw) return null;
  // Drop trailing filler that is not part of a name ("target in glendale" keeps both words).
  return raw.replace(/\b(stores?|locations?|shops?)\b/g, "").trim() || null;
}

export interface Coverage { name: string; callable: number; total: number; example: string | null }

/** How many stores we can actually call for a named place. Counts only what the store list would
 *  let a customer tap: a real number, and ready to dial. */
export async function coverageFor(nameish: string): Promise<Coverage | null> {
  const q = nameish.trim().toLowerCase();
  if (q.length < 2) return null;
  // Chain first: one word like "target" should answer for the whole brand, not one shop.
  const chain = (await db.select().from(chains).where(sql`lower(${chains.name}) = ${q}`).limit(1))[0]
    || (await db.select().from(chains).where(like(sql`lower(${chains.name})`, `%${q}%`)).limit(1))[0];
  const rows = chain
    ? await db.select({ name: retailers.name, phone: retailers.phone, location: retailers.location, sellsPacks: retailers.sellsPacks, hasKiosk: retailers.hasKiosk })
        .from(retailers).where(and(eq(retailers.chainId, chain.id), eq(retailers.active, true))).limit(400)
    : await db.select({ name: retailers.name, phone: retailers.phone, location: retailers.location, sellsPacks: retailers.sellsPacks, hasKiosk: retailers.hasKiosk })
        .from(retailers).where(and(like(sql`lower(${retailers.name})`, `%${q}%`), eq(retailers.active, true))).limit(400);
  if (!rows.length) return null;
  // Same test the store list uses: a line we can dial at this store.
  const callable = rows.filter((r) => (r.sellsPacks !== false || r.hasKiosk === true) && !!r.phone && !r.phone.startsWith("nophone:"));
  const ex = callable[0] || rows[0];
  return {
    name: chain?.name || ex.name,
    callable: callable.length,
    total: rows.length,
    example: ex.location ? `${ex.name} (${ex.location})` : ex.name,
  };
}

/** The block handed to the model when a question names a place. Plain facts only: the model still
 *  writes the sentence, it just can no longer invent the answer. */
export async function coverageNote(message: string): Promise<string> {
  const nameish = namedPlace(message);
  if (!nameish) return "";
  let cov: Coverage | null = null;
  try { cov = await coverageFor(nameish); } catch { return ""; }
  if (!cov) {
    return `\n\nSTORE COVERAGE, checked just now against the real store list: nothing on the list matches "${nameish}". Say plainly that you cannot find it, and that the way to know is to search that town on the site, because the list is what decides. Do NOT say yes.`;
  }
  if (cov.callable === 0) {
    return `\n\nSTORE COVERAGE, checked just now against the real store list: we have ${cov.total} ${cov.name} on the list and can call NONE of them today. Say plainly that we cannot call ${cov.name} right now. Do NOT say yes.`;
  }
  return `\n\nSTORE COVERAGE, checked just now against the real store list: we can call ${cov.callable} ${cov.name}${cov.callable === 1 ? "" : " stores"} today (for example ${cov.example}). You may confirm that, and add that which ones show up depends on how close they are to them, so searching their own town is what settles it.`;
}

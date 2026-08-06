// ── What the support agent is allowed to say about store coverage ────────────────────────────
// Round 1 test 4 caught the agent answering "Yes, you can check the Target in Glendale" and "Yes,
// GameStop stores can be checked too" from nothing at all: it reads the book, and the book has no
// store list, so both were confident guesses. A guess about coverage is a promise we might not
// keep, and the customer finds out by tapping and getting nowhere.
//
// So coverage is answered from the store table, the same rows and the same callable test the store
// list itself uses, and nothing else. If the question does not name something we recognise, the
// agent is told to say it cannot tell rather than to guess.
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db/client";
import { retailers, chains } from "../db/schema";

/** A chain or store name worth looking up, pulled out of a plain question. Deliberately narrow:
 *  the point is to recognise "do you call Target?", not to parse English. */
export function namedPlace(message: string): string | null {
  const m = message.toLowerCase();
  const hit = /(?:do you (?:check|call|do|cover)|can you (?:check|call)|what about|how about|do you guys (?:check|call|do))\s+(?:the\s+)?([a-z0-9'&. -]{2,40})/i.exec(m);
  const raw = (hit?.[1] || "").trim().replace(/[?.!,]+$/, "");
  if (!raw) return null;
  return raw.replace(/\b(stores?|locations?|shops?)\b/g, "").trim() || null;
}

/** "target in glendale" → ["target in glendale", "target in", "target"]. A customer names the shop
 *  and the town in one breath; the town is not part of the brand, so try the whole thing and then
 *  walk back a word at a time. Without this, every question that mentions where they live was
 *  answered "I can't find that one" about a chain we call thousands of. */
function candidates(nameish: string): string[] {
  const words = nameish.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let n = words.length; n >= 1; n--) {
    const s = words.slice(0, n).join(" ").replace(/\s+(in|at|near|by|on)$/i, "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export interface Coverage { name: string; callable: number; total: number; example: string | null }

// The store list's own test for "a line we can dial at this store", kept as SQL so the count is a
// real count and never the size of a page of results. Telling a customer "we can call 400" because
// 400 was the query limit is inventing a number, which is the exact failure this file exists to stop.
const CALLABLE = sql`(${retailers.sellsPacks} IS NOT 0 OR ${retailers.hasKiosk} = 1)
  AND ${retailers.phone} IS NOT NULL AND ${retailers.phone} NOT LIKE 'nophone:%'`;

async function countFor(where: ReturnType<typeof and>): Promise<{ total: number; callable: number; example: string | null }> {
  const t = await db.select({ n: sql<number>`count(*)` }).from(retailers).where(where);
  const c = await db.select({ n: sql<number>`count(*)` }).from(retailers).where(and(where, CALLABLE));
  const ex = (await db.select({ name: retailers.name, location: retailers.location })
    .from(retailers).where(and(where, CALLABLE)).limit(1))[0];
  return {
    total: Number(t[0]?.n || 0),
    callable: Number(c[0]?.n || 0),
    example: ex ? (ex.location ? `${ex.name} (${ex.location})` : ex.name) : null,
  };
}

/** How many stores we can actually call for a named place. Counts only what the store list would
 *  let a customer tap: a real number, and one we can dial. */
export async function coverageFor(nameish: string): Promise<Coverage | null> {
  for (const q of candidates(nameish.trim().toLowerCase())) {
    if (q.length < 3) continue;
    // Chain first: one word like "target" should answer for the whole brand, not one shop.
    const chain = (await db.select().from(chains).where(sql`lower(${chains.name}) = ${q}`).limit(1))[0]
      || (await db.select().from(chains).where(like(sql`lower(${chains.name})`, `%${q}%`)).limit(1))[0];
    const where = chain
      ? and(eq(retailers.chainId, chain.id), eq(retailers.active, true))
      : and(like(sql`lower(${retailers.name})`, `%${q}%`), eq(retailers.active, true));
    const n = await countFor(where!);
    if (!n.total) continue;
    return { name: chain?.name || q, callable: n.callable, total: n.total, example: n.example };
  }
  return null;
}

/** The block handed to the model when a question names a place. Plain facts only: the model still
 *  writes the sentence, it just can no longer invent the answer. */
export async function coverageNote(message: string): Promise<string> {
  const nameish = namedPlace(message);
  if (!nameish) return "";
  let cov: Coverage | null = null;
  try { cov = await coverageFor(nameish); } catch { return ""; }
  if (!cov) {
    return `\n\nSTORE COVERAGE, checked just now against the real store list: nothing on the list matches "${nameish}". Say plainly that you cannot find it, and that searching that town on the site is what settles it, because the list is what decides. Do NOT say yes.`;
  }
  if (cov.callable === 0) {
    return `\n\nSTORE COVERAGE, checked just now against the real store list: we have ${cov.total} ${cov.name} on the list and can call NONE of them today. Say plainly that we cannot call ${cov.name} right now. Do NOT say yes.`;
  }
  return `\n\nSTORE COVERAGE, checked just now against the real store list: we can call ${cov.callable} ${cov.name}${cov.callable === 1 ? "" : " stores"} today, for example ${cov.example}. You may confirm that. Add that which ones they see depends on how close they are, so searching their own town settles it. Use the number only if it helps; never round it or make one up.`;
}

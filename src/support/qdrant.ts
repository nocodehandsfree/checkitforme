// ── Qdrant REST client (minimal) ─────────────────────────────────────────────────────────────
// The qdrant service already runs in our Railway project (private network, no auth). Two
// collections: support_book (the book, rebuilt on reindex) and support_qa (approved Q&As — the
// tier-0 answer cache; never dropped). First vector store in the app, so this stays tiny: only
// the four calls the support agent needs, over plain fetch.
import { createHash } from "node:crypto";

const QDRANT = process.env.QDRANT_URL || "http://qdrant.railway.internal:6333";
export const DIMS = 1536; // text-embedding-3-small

export const BOOK = "support_book";
export const QA = "support_qa";

// Every search here sits in front of a customer waiting for a reply, and the edge cuts that reply
// at about 15 seconds. A qdrant that stops answering must fail fast enough for the agent to carry
// on without it rather than swallow the whole budget and leave a blank (08-06). A reindex needs far
// longer than a search, so it passes its own.
const Q_TIMEOUT_MS = 6000;
async function q(method: string, path: string, body?: unknown, timeoutMs = Q_TIMEOUT_MS): Promise<any> {
  const r = await fetch(`${QDRANT}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`qdrant ${method} ${path} ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
  return d;
}

/** Create the collection if missing (cosine, 1536 dims). Idempotent. */
export async function ensureCollection(name: string): Promise<void> {
  const r = await fetch(`${QDRANT}/collections/${name}`);
  if (r.ok) return;
  await q("PUT", `/collections/${name}`, { vectors: { size: DIMS, distance: "Cosine" } });
}

/** Drop + recreate (book reindex only — never call on the QA collection).
 *  PREFER `pruneTo` for a reindex: dropping first means that if the write behind it fails, the
 *  agent is left knowing NOTHING, which is exactly what happened on staging 08-06 when a reindex
 *  timed out at the edge mid-write and the chat started answering "I'm not sure" to questions the
 *  book covers. */
export async function resetCollection(name: string): Promise<void> {
  await fetch(`${QDRANT}/collections/${name}`, { method: "DELETE" });
  await q("PUT", `/collections/${name}`, { vectors: { size: DIMS, distance: "Cosine" } });
}

/** Remove every point whose id is NOT in `keep`. Run AFTER the new points are written, so the
 *  collection is only ever added to and then tidied: a failure anywhere leaves the old book intact
 *  and searchable instead of leaving an empty one. Ids are deterministic (`idFor`), so a page that
 *  still exists is overwritten in place by the upsert and never deleted here. */
export async function pruneTo(name: string, keep: string[]): Promise<number> {
  const seen = new Set(keep);
  const stale: string[] = [];
  let offset: unknown = undefined;
  // Page through the collection; ids only, payload and vectors are not needed to decide.
  for (let guard = 0; guard < 200; guard++) {
    const d = await q("POST", `/collections/${name}/points/scroll`, {
      limit: 256, with_payload: false, with_vector: false, ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    for (const p of d.result?.points || []) if (!seen.has(String(p.id))) stale.push(String(p.id));
    offset = d.result?.next_page_offset;
    if (offset === undefined || offset === null) break;
  }
  if (stale.length) await q("POST", `/collections/${name}/points/delete?wait=true`, { points: stale });
  return stale.length;
}

export interface Point { id: string; vector: number[]; payload: Record<string, unknown> }

export async function upsert(collection: string, points: Point[]): Promise<void> {
  if (!points.length) return;
  await q("PUT", `/collections/${collection}/points?wait=true`, { points }, 120_000);
}

export interface Hit { score: number; payload: Record<string, unknown> }

export async function search(collection: string, vector: number[], limit: number): Promise<Hit[]> {
  try {
    const d = await q("POST", `/collections/${collection}/points/search`, {
      vector, limit, with_payload: true,
    });
    return (d.result || []).map((p: any) => ({ score: p.score, payload: p.payload || {} }));
  } catch (e) {
    // Missing collection (e.g. QA before the first approval) → no hits, not a crash.
    console.error("[support] qdrant search", collection, (e as Error).message.slice(0, 120));
    return [];
  }
}

/** Deterministic UUID from a string, so re-upserting the same chunk overwrites instead of duping. */
export function idFor(s: string): string {
  const h = createHash("sha1").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

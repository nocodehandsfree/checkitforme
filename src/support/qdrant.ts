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

async function q(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${QDRANT}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
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

/** Drop + recreate (book reindex only — never call on the QA collection). */
export async function resetCollection(name: string): Promise<void> {
  await fetch(`${QDRANT}/collections/${name}`, { method: "DELETE" });
  await q("PUT", `/collections/${name}`, { vectors: { size: DIMS, distance: "Cosine" } });
}

export interface Point { id: string; vector: number[]; payload: Record<string, unknown> }

export async function upsert(collection: string, points: Point[]): Promise<void> {
  if (!points.length) return;
  await q("PUT", `/collections/${collection}/points?wait=true`, { points });
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

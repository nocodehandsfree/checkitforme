// ── Book → qdrant indexing + retrieval ───────────────────────────────────────────────────────
// The book (customer docs) lives on branch v1.0 of this public repo. Reindex fetches every
// docs/**/*.md, chunks per page (they're short), embeds, and rebuilds the support_book
// collection. The support_qa collection holds owner-approved Q&As (the answer cache) and is only
// ever appended to. The agent answers ONLY from what these two searches return.
import { embed, embedOne } from "./embed";
import { BOOK, QA, ensureCollection, resetCollection, upsert, search, idFor, type Hit } from "./qdrant";

const REPO = "nocodehandsfree/checkitforme";
const BRANCH = "v1.0";

interface BookChunk { path: string; title: string; text: string }

/** Pull every book page from the v1.0 branch (public repo — no token needed). */
async function fetchBook(): Promise<BookChunk[]> {
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)
    .then((r) => r.json()) as { tree?: { path: string; type: string }[] };
  const pages = (tree.tree || []).filter((t) => t.type === "blob" && t.path.startsWith("docs/") && t.path.endsWith(".md"));
  const chunks: BookChunk[] = [];
  for (const p of pages) {
    const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(p.path)}`).then((r) => r.text());
    const title = /^---[\s\S]*?title:\s*(.+?)\n[\s\S]*?---/.exec(raw)?.[1]?.trim() || p.path;
    const text = raw
      .replace(/^---[\s\S]*?---\n/, "")          // frontmatter
      .replace(/<p[^>]*>[\s\S]*?<\/p>/g, "")     // inline html (images)
      .replace(/<img[^>]*>/g, "")
      .trim();
    if (text) chunks.push({ path: p.path, title, text });
  }
  return chunks;
}

/** Rebuild the book collection. Returns how many pages were indexed. */
export async function reindexBook(): Promise<number> {
  const chunks = await fetchBook();
  if (!chunks.length) throw new Error("book fetch returned no pages");
  const vectors = await embed(chunks.map((c) => `${c.title}\n\n${c.text}`));
  await resetCollection(BOOK);
  await upsert(BOOK, chunks.map((c, i) => ({
    id: idFor(c.path),
    vector: vectors[i],
    payload: { title: c.title, path: c.path, text: c.text },
  })));
  return chunks.length;
}

/** Add one approved Q&A to the answer cache. */
export async function addQa(question: string, answer: string, conversationId: number): Promise<void> {
  await ensureCollection(QA);
  await upsert(QA, [{
    id: idFor(`qa:${question.trim().toLowerCase()}`),
    vector: await embedOne(question),
    payload: { question, answer, conversationId, addedAt: Math.floor(Date.now() / 1000) },
  }]);
}

export interface SearchHit { title: string; snippet: string; score: number }
/** Semantic search over the book only — powers the Help tab search + instant answers (no model spend). */
export async function searchBook(query: string, limit = 5): Promise<SearchHit[]> {
  const v = await embedOne(query);
  const hits = await search(BOOK, v, limit);
  return hits.map((h) => ({
    title: String(h.payload.title || ""),
    snippet: String(h.payload.text || "").replace(/\s+/g, " ").slice(0, 240),
    score: h.score,
  }));
}

export interface Retrieved { passages: string; qaBest: { score: number; answer: string } | null }

/** One embed, two searches: top book pages + top approved Q&As, packaged for the prompt. */
export async function retrieve(query: string): Promise<Retrieved> {
  const v = await embedOne(query);
  const [book, qa] = await Promise.all([search(BOOK, v, 4), search(QA, v, 3)]);
  const parts: string[] = book.map((h: Hit) => `[${h.payload.title}]\n${h.payload.text}`);
  for (const h of qa) parts.push(`[Answered before]\nQ: ${h.payload.question}\nA: ${h.payload.answer}`);
  const best = qa[0];
  return {
    passages: parts.join("\n\n---\n\n").slice(0, 12000),
    qaBest: best ? { score: best.score, answer: String(best.payload.answer || "") } : null,
  };
}

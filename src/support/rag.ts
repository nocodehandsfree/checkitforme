// ── Book → qdrant indexing + retrieval ───────────────────────────────────────────────────────
// The book (customer docs) lives on branch v1.0 of this public repo. Reindex fetches every
// docs/**/*.md, chunks per page (they're short), embeds, and rebuilds the support_book
// collection. The support_qa collection holds owner-approved Q&As (the answer cache) and is only
// ever appended to. The agent answers ONLY from what these two searches return.
import { embed, embedOne } from "./embed";
import { BOOK, QA, ensureCollection, resetCollection, upsert, search, idFor, type Hit } from "./qdrant";

// The book is the single source of truth on ReadMe. llms.txt indexes every page; each page has a
// .md we fetch for the text and a human URL we link to from the Help tab. Falls back to the GitHub
// v1.0 mirror if ReadMe is unreachable, so a reindex never comes back empty.
const README = process.env.SUPPORT_README_BASE || "https://checkitforme.readme.io";
const REPO = "nocodehandsfree/checkitforme";
const BRANCH = "v1.0";

interface BookChunk { key: string; title: string; text: string; url: string }

const cleanMd = (raw: string) => raw
  .replace(/^---[\s\S]*?---\n/, "")
  .replace(/<p[^>]*>[\s\S]*?<\/p>/g, "")
  .replace(/<img[^>]*>/g, "")
  .trim();

/** Parse llms.txt (`- [Title](https://…/docs/slug.md)`) and fetch each page's markdown. */
async function fetchFromReadme(): Promise<BookChunk[]> {
  const idx = await fetch(`${README}/llms.txt`).then((r) => r.ok ? r.text() : "");
  const links = [...idx.matchAll(/-\s*\[([^\]]+)\]\((https?:\/\/[^)]+?\.md)\)/g)].map((m) => ({ title: m[1].trim(), mdUrl: m[2] }));
  const chunks: BookChunk[] = [];
  for (const l of links) {
    const raw = await fetch(l.mdUrl).then((r) => r.ok ? r.text() : "").catch(() => "");
    const text = cleanMd(raw);
    if (text) chunks.push({ key: l.mdUrl, title: l.title, text, url: l.mdUrl.replace(/\.md$/, "") });
  }
  return chunks;
}

/** Fallback: the GitHub v1.0 mirror of the book. */
async function fetchFromRepo(): Promise<BookChunk[]> {
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)
    .then((r) => r.json()) as { tree?: { path: string; type: string }[] };
  const pages = (tree.tree || []).filter((t) => t.type === "blob" && t.path.startsWith("docs/") && t.path.endsWith(".md"));
  const chunks: BookChunk[] = [];
  for (const p of pages) {
    const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(p.path)}`).then((r) => r.text());
    const title = /^---[\s\S]*?title:\s*(.+?)\n[\s\S]*?---/.exec(raw)?.[1]?.trim() || p.path;
    const text = cleanMd(raw);
    if (text) chunks.push({ key: p.path, title, text, url: `${README}/docs/${p.path.split("/").pop()!.replace(/\.md$/, "")}` });
  }
  return chunks;
}

/** Rebuild the book collection from ReadMe (repo mirror fallback). Returns how many pages indexed. */
export async function reindexBook(): Promise<number> {
  let chunks: BookChunk[] = [];
  try { chunks = await fetchFromReadme(); } catch (e) { console.error("[support] readme fetch", (e as Error).message.slice(0, 120)); }
  if (!chunks.length) chunks = await fetchFromRepo();
  if (!chunks.length) throw new Error("book fetch returned no pages");
  const vectors = await embed(chunks.map((c) => `${c.title}\n\n${c.text}`));
  await resetCollection(BOOK);
  await upsert(BOOK, chunks.map((c, i) => ({
    id: idFor(c.key),
    vector: vectors[i],
    payload: { title: c.title, url: c.url, text: c.text },
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

export interface SearchHit { title: string; snippet: string; url: string; score: number }
/** Semantic search over the book only — powers the Help tab search + instant answers (no model spend). */
export async function searchBook(query: string, limit = 5): Promise<SearchHit[]> {
  const v = await embedOne(query);
  const hits = await search(BOOK, v, limit);
  return hits.map((h) => ({
    title: String(h.payload.title || ""),
    snippet: String(h.payload.text || "").replace(/\s+/g, " ").slice(0, 240),
    url: String(h.payload.url || ""),
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

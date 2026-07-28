// THE PHONE-MENU MAP — versioned knowledge, not configuration.
//
// WHY THIS EXISTS (owner 07-26): the chain row holds exactly ONE recipe and overwrites it on every
// re-map. That made three things impossible: seeing WHAT changed and why, knowing HOW MUCH we trust
// a path (47 of 98 dialable chains carry no confidence at all), and noticing when a store quietly
// changes its menu. It also let a 0-hammer run ("press 0" five times, Safeway 102s) get stamped
// "locked" with the same authority as a real mapped route.
//
// So the map moves OUT of the single chain column and into versions:
//   • every mapping/verify call PROPOSES a version carrying its own evidence,
//   • confidence is COMPUTED from that evidence (calls × stores × days × agreement × age),
//   • an approved version becomes ACTIVE and is what the chain row (live calls) is stamped with,
//   • live calls compare what they hear against the active version and report DRIFT,
//   • anything we did not understand becomes an UNKNOWN with its evidence, never a discarded log line.
//
// Scope, per the owner: we map only the REAL PATH to a human — the shortest words that work, at the
// point in the recording where they are accepted. We do not walk into branches we never take.
//
// This module owns knowledge only. It never places a call, never changes runtime behaviour, and
// never touches src/voice/. The runtime reads `activeMap()`; the mapper writes `proposeVersion()`.
import { client } from "../db/client";
import { db } from "../db/client";
import { chains, retailers } from "../db/schema";
import { recipeToDtmf } from "./recipe";
import { isMapFollower, pushVersion, pushDecision } from "./map-authority";
import { setSetting, allSettings } from "../db/settings";
import { eq } from "drizzle-orm";

// ---- shapes ---------------------------------------------------------------------------------

/** One action on the real path. `afterPrompt` is the owner's rule made data: fire this word/press
 *  once the store's Nth recording has finished, not when a stopwatch says so. `atSec` stays as the
 *  learned time — it is the clock fallback and the sanity check, never the trigger on its own. */
export interface MapStep {
  action: "press" | "say";
  value: string;
  atSec: number;
  afterPrompt?: number;   // fire after this many completed recordings (1-based); undefined = clock only
  bargeSafe?: boolean;    // proven we can speak/press before the recording finishes without looping
}
/** THE THIRD SHAPE (owner 07-27). A store can answer with a recording — "thank you for calling Barnes
 *  & Noble" — then hold music, then a person, with NOTHING for us to press or say. That is not
 *  "direct" (a person is not there at pickup) and it is not a menu (there is no choice to make), and
 *  having no name for it is exactly what let the paid agent start talking to the greeting. */
export interface MapRecipe {
  type: "direct" | "keypad" | "voice" | "greeting";
  steps: MapStep[];
  seconds: number;                 // learned time-to-human
  target?: string;                 // the desk this path reaches
  menu?: Array<{ digit: string; label: string }>;
  menuPrompts?: string[];
  ringVariable?: boolean;
  /** WHICH LANGUAGE this route was learned in (runtime spec §10.3). Discovery and execution are
   *  deferred, but the field is here now: retrofitting it later means rewriting every stored route,
   *  and a menu that answers in Spanish is a different menu, not a drifted one. */
  language?: Language;
}
/** ISO-ish and deliberately small. `null`/absent = we have not looked. */
export type Language = "en" | "es" | "mixed" | "unknown";

/** One mapping/verify call, kept as the reason a version is trusted. */
export interface EvidenceCall {
  navId?: string;
  at: number;                      // unix seconds
  day: string;                     // YYYY-MM-DD in UTC — "multiple days" is a confidence input
  storeId?: number;
  storeName?: string;
  seconds?: number | null;         // measured time-to-human on this call
  promptCount?: number;            // recordings heard before the human
  reachedHuman: boolean;
  path: string;                    // path signature observed on this call
  transcript?: string[];           // the menu lines we heard (kept only for the winning version)
  greeting?: string;               // what the person said when they picked up — WHICH desk we reached
  transferAtSec?: number | null;   // when the machine said "transferring you now"
  /** WHEN, in the STORE's own clock (runtime spec §10.4). A menu at 9pm is often not the daytime
   *  menu, and without this we would chase a "failure" that only means we called after hours. */
  hourLocal?: number | null;       // 0-23 where the store is
  dow?: number | null;             // 0 = Sunday, in the store's week
  language?: Language;
  note?: string;
}
export interface Evidence { calls: EvidenceCall[] }

export type ConfidenceLabel =
  | "verified" | "observed multiple times" | "observed once"
  | "changed recently" | "needs review" | "unknown";

export interface MapVersion {
  id: number;
  chainId: number;
  storeId: number;                 // 0 = the chain-wide map; >0 = this store differs (Target 3000+)
  version: number;
  status: "proposed" | "active" | "retired" | "rejected";
  navType: string;
  recipe: MapRecipe;
  seconds: number | null;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  evidence: Evidence;
  source: string;                  // sweep | verify | live | owner
  summary: string;                 // what changed, in the owner's words
  why: string;
  createdAt: number;
  approvedAt: number | null;
  approvedBy: string | null;
  retiredAt: number | null;
}

// ---- tables ---------------------------------------------------------------------------------
// Created here (not in a drizzle migration) so a fresh boot on either environment self-heals, the
// same pattern bootstrap.ts already uses for accounts/leads.
export async function ensureMapTables(): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS nav_map_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    nav_type TEXT,
    recipe TEXT NOT NULL,
    seconds INTEGER,
    confidence INTEGER NOT NULL DEFAULT 0,
    confidence_label TEXT,
    evidence TEXT NOT NULL DEFAULT '{"calls":[]}',
    source TEXT,
    summary TEXT,
    why TEXT,
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    approved_by TEXT,
    retired_at INTEGER
  )`);
  await client.execute(`CREATE INDEX IF NOT EXISTS nav_map_versions_chain ON nav_map_versions (chain_id, store_id, version)`);
  await client.execute(`CREATE TABLE IF NOT EXISTS nav_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL DEFAULT 0,
    version_id INTEGER,
    nav_id TEXT,
    call_id INTEGER,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    expected TEXT,
    observed TEXT,
    drift INTEGER NOT NULL DEFAULT 0,
    detail TEXT
  )`);
  await client.execute(`CREATE INDEX IF NOT EXISTS nav_observations_chain ON nav_observations (chain_id, at)`);
  // WHEN and IN WHAT LANGUAGE (runtime spec §10.3/§10.4): stores run different menus after hours and
  // around holidays, and a menu that answers in Spanish is not the same menu. Without these two we
  // chase failures that only mean we called at nine at night. Local to the STORE, not to a server.
  for (const col of ["hour_local INTEGER", "dow INTEGER", "language TEXT"]) {
    await client.execute(`ALTER TABLE nav_observations ADD COLUMN ${col}`).catch(() => { /* already there */ });
  }
  // THE GRAPH (runtime spec §10.1). A flat recipe can say "press 2 at 8 seconds" and nothing else —
  // not which prompt led here, not that this store branches differently, not that we have never heard
  // this prompt before. The Ear produces nodes and edges naturally: a prompt ended, we did something,
  // here is where we landed. A node is a PROMPT we have heard; an edge is an action that led from one
  // to the next. The flat route stays exactly as it is — the runtime reads that — and the graph is the
  // knowledge underneath it, which is what makes "we have never heard this prompt" answerable.
  await client.execute(`CREATE TABLE IF NOT EXISTS nav_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL DEFAULT 0,
    fingerprint TEXT NOT NULL,
    label TEXT,
    kind TEXT NOT NULL DEFAULT 'menu',
    language TEXT,
    heard_count INTEGER NOT NULL DEFAULT 1,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  )`);
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS nav_nodes_key ON nav_nodes (chain_id, store_id, fingerprint)`);
  await client.execute(`CREATE TABLE IF NOT EXISTS nav_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL DEFAULT 0,
    from_node INTEGER NOT NULL,
    action TEXT NOT NULL,
    value TEXT NOT NULL,
    to_node INTEGER,
    outcome TEXT,
    taken_count INTEGER NOT NULL DEFAULT 1,
    reached_count INTEGER NOT NULL DEFAULT 0,
    avg_seconds INTEGER,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  )`);
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS nav_edges_key ON nav_edges (chain_id, store_id, from_node, action, value)`);
  await client.execute(`CREATE TABLE IF NOT EXISTS nav_unknowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    prompt TEXT,
    evidence TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    seen_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open',
    note TEXT
  )`);
  await client.execute(`CREATE INDEX IF NOT EXISTS nav_unknowns_open ON nav_unknowns (status, chain_id)`);
}

// ---- confidence -----------------------------------------------------------------------------

const DAY = 86400;
/** A path older than this without a fresh confirmation stops being "verified" — stores change their
 *  menus and nothing here should keep claiming certainty on a two-month-old sample. */
const STALE_DAYS = 45;

/** Confidence from evidence ALONE — no model, no guesswork, so the same evidence always scores the
 *  same and the dashboard can explain the number. The owner's rule from the spec: never trust one
 *  observation; prefer multiple calls, multiple days, multiple stores before raising confidence. */
export function scoreConfidence(ev: Evidence, nowSec = Math.floor(Date.now() / 1000)): { score: number; label: ConfidenceLabel; why: string } {
  const calls = (ev?.calls || []).filter((c) => c && c.reachedHuman);
  if (!calls.length) {
    const tried = (ev?.calls || []).length;
    return { score: 0, label: "unknown", why: tried ? `${tried} call(s), no human reached` : "no evidence yet" };
  }
  const paths = new Set(calls.map((c) => c.path));
  const stores = new Set(calls.map((c) => c.storeId).filter(Boolean));
  const days = new Set(calls.map((c) => c.day));
  const newest = Math.max(...calls.map((c) => c.at));
  const ageDays = Math.max(0, Math.floor((nowSec - newest) / DAY));

  // Disagreement is the loudest signal there is: two calls that walked different paths mean the map
  // is not settled, however many times we called. Cap it and send it to review.
  if (paths.size > 1) {
    return { score: 40, label: "needs review", why: `${calls.length} calls disagreed on the path (${paths.size} different routes)` };
  }
  let score: number;
  let label: ConfidenceLabel;
  if (calls.length >= 3 && days.size >= 2 && stores.size >= 2) { score = 95; label = "verified"; }
  else if (calls.length >= 2 && stores.size >= 2) { score = 80; label = "observed multiple times"; }
  else if (calls.length >= 2) { score = 65; label = "observed multiple times"; }
  else { score = 45; label = "observed once"; }

  let why = `${calls.length} call(s), ${stores.size || 1} store(s), ${days.size} day(s)`;
  if (ageDays > STALE_DAYS) {
    score = Math.max(20, score - 25);
    label = "needs review";
    why += ` — last confirmed ${ageDays} days ago`;
  }
  return { score, label, why };
}

/** Compact signature of the real path, e.g. `say:no>say:front>say:general`. Two versions with the
 *  same signature are the same ROUTE even if the seconds moved. A route with no steps is either a
 *  person at pickup or a greeting we simply wait through — and those are NOT the same thing, so they
 *  never share a signature. */
export function pathSignature(r: { steps?: Array<{ action?: string; value?: string }>; type?: string } | null | undefined): string {
  const steps = (r?.steps || []).map((s) => `${s.action}:${String(s.value || "").toLowerCase().trim()}`).join(">");
  if (steps) return steps;
  return r?.type === "greeting" ? "greeting" : "direct";
}

/** Is this recipe the auto-caller hammering 0 rather than a mapped route? Sixteen chains carry one
 *  of these today (Safeway five presses / 102s, Albertsons, Walgreens, Kohl's…). It reaches a human
 *  sometimes, so it must not be thrown away — but it is never "verified" and it always gets flagged
 *  for a real re-map. Two or more identical presses with nothing else is the signature. */
export function isHammerPath(r: { steps?: Array<{ action?: string; value?: string }> } | null | undefined): boolean {
  const steps = r?.steps || [];
  if (steps.length < 2) return false;
  const vals = steps.map((s) => String(s.value || ""));
  return vals.every((v) => v === vals[0]) && steps.every((s) => s.action === "press");
}

// ---- the graph: prompts as nodes, what we did as edges ----------------------------------------

/** Words that carry no identity — every menu has them, so they cannot tell two menus apart. */
const STOPWORDS = new Set(["the", "for", "and", "you", "your", "our", "please", "to", "a", "of", "if", "is",
  "this", "that", "at", "in", "on", "or", "we", "us", "with", "call", "calling", "thank", "thanks", "may", "can",
  // Number WORDS go too. Speech-to-text writes "press 1" one call and "press one" the next; the digit
  // is already stripped, so leaving the word in would make the same menu look like two menus.
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"]);

/** A STABLE KEY for a prompt heard over a phone line. Speech-to-text never returns the same string
 *  twice — a word drops, a number is spelled out — so keying a node on the raw text would mint a new
 *  node every call and the graph would be noise. Instead: lowercase, drop punctuation and digits and
 *  filler, then keep the six longest remaining words in alphabetical order. Two hearings of the same
 *  recording collapse to one key; two genuinely different menus do not. */
export function promptFingerprint(text: string): string {
  const words = String(text || "").toLowerCase()
    // Strip accents first, or "español" would survive as the fragment "espa" and a store that spells
    // it without the tilde would key differently from one that spells it with.
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!words.length) return "";
  const uniq = [...new Set(words)].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 6);
  return uniq.sort().join("-");
}

/** A cheap, honest guess at the language of a prompt — no model, no service. Discovery proper is
 *  deferred (runtime spec §10.3); this fills the field when the answer is obvious and says `unknown`
 *  the rest of the time rather than guessing at English by default. */
export function guessLanguage(text: string): Language {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return "unknown";
  const es = /(para español|oprima|marque|presione|gracias por llamar|farmacia|tienda|espere)/.test(t);
  // "Thanks for calling CVS. Para español oprima nueve" is the real shape of a bilingual menu — an
  // English opener with a Spanish option — so the English markers have to include the opener itself
  // or that line reads as pure Spanish and we would map the wrong menu.
  const en = /(press|thanks? (you )?for calling|please hold|store|pharmacy|for english|say)/.test(t);
  if (es && en) return "mixed";
  if (es) return "es";
  if (en) return "en";
  return "unknown";
}

/** What the store said, in order, and what we did about it — one call's worth. */
export interface CallPath {
  chainId: number;
  storeId?: number;
  prompts: Array<{ text: string; atSec: number }>;
  actions: Array<{ action: "press" | "say"; value: string; atSec: number; afterPrompt?: number }>;
  reachedHuman: boolean;
  seconds?: number | null;
  outcome?: string;                 // person | no-answer | transfer-no-pickup | menu-lost
}

async function upsertNode(chainId: number, storeId: number, fp: string, label: string, kind: string, lang: Language, at: number): Promise<number> {
  const found = await client.execute({
    sql: `SELECT id FROM nav_nodes WHERE chain_id=? AND store_id=? AND fingerprint=? LIMIT 1`,
    args: [chainId, storeId, fp],
  });
  if (found.rows.length) {
    const id = Number((found.rows[0] as any).id);
    await client.execute({ sql: `UPDATE nav_nodes SET heard_count=heard_count+1, last_seen=?, label=COALESCE(NULLIF(label,''),?) WHERE id=?`, args: [at, label, id] });
    return id;
  }
  const ins = await client.execute({
    sql: `INSERT INTO nav_nodes (chain_id, store_id, fingerprint, label, kind, language, heard_count, first_seen, last_seen)
          VALUES (?,?,?,?,?,?,1,?,?)`,
    args: [chainId, storeId, fp, label.slice(0, 300), kind, lang, at, at],
  });
  return Number(ins.lastInsertRowid || 0);
}

/** Fold ONE call into the graph: every prompt becomes a node, every action becomes an edge from the
 *  prompt it answered to the prompt it produced. Runs on mapping calls and on ordinary checks alike —
 *  it is the same shape either way — and it never touches the flat route the runtime executes. */
export async function recordCallPath(p: CallPath): Promise<{ nodes: number; edges: number; newPrompts: number }> {
  await ensureMapTables();
  const at = nowSec();
  const storeId = p.storeId || 0;
  let nodes = 0, edges = 0, newPrompts = 0;
  // Prompt i is the node an action taken after i-1 completed recordings answered.
  const nodeIds: number[] = [];
  for (const pr of p.prompts) {
    const fp = promptFingerprint(pr.text);
    if (!fp) { nodeIds.push(0); continue; }
    const before = await client.execute({ sql: `SELECT id FROM nav_nodes WHERE chain_id=? AND store_id=? AND fingerprint=? LIMIT 1`, args: [p.chainId, storeId, fp] });
    if (!before.rows.length) newPrompts++;
    nodeIds.push(await upsertNode(p.chainId, storeId, fp, pr.text, "menu", guessLanguage(pr.text), at));
    nodes++;
  }
  for (let i = 0; i < p.actions.length; i++) {
    const a = p.actions[i];
    // The prompt this action answered: the one it waited for, else the last one heard before it.
    const fromIdx = typeof a.afterPrompt === "number" ? a.afterPrompt - 1
      : p.prompts.reduce((best, pr, idx) => (pr.atSec <= a.atSec ? idx : best), -1);
    const from = nodeIds[fromIdx] ?? 0;
    if (!from) continue;
    // Where it landed: the next prompt heard, or the end of the call.
    const toIdx = p.prompts.findIndex((pr) => pr.atSec > a.atSec);
    const to = toIdx >= 0 ? (nodeIds[toIdx] || null) : null;
    const last = i === p.actions.length - 1;
    const outcome = to ? null : (last ? (p.outcome || (p.reachedHuman ? "person" : "unknown")) : null);
    const secs = typeof p.seconds === "number" ? Math.round(p.seconds) : null;
    const hit = await client.execute({
      sql: `SELECT id, taken_count, reached_count, avg_seconds FROM nav_edges WHERE chain_id=? AND store_id=? AND from_node=? AND action=? AND value=? LIMIT 1`,
      args: [p.chainId, storeId, from, a.action, a.value],
    });
    if (hit.rows.length) {
      const row = hit.rows[0] as any;
      const taken = Number(row.taken_count || 1) + 1;
      const reached = Number(row.reached_count || 0) + (p.reachedHuman ? 1 : 0);
      const avg = secs != null ? Math.round((Number(row.avg_seconds ?? secs) * (taken - 1) + secs) / taken) : row.avg_seconds ?? null;
      await client.execute({
        sql: `UPDATE nav_edges SET to_node=COALESCE(?, to_node), outcome=COALESCE(?, outcome), taken_count=?, reached_count=?, avg_seconds=?, last_seen=? WHERE id=?`,
        args: [to, outcome, taken, reached, avg, at, Number(row.id)],
      });
    } else {
      await client.execute({
        sql: `INSERT INTO nav_edges (chain_id, store_id, from_node, action, value, to_node, outcome, taken_count, reached_count, avg_seconds, first_seen, last_seen)
              VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`,
        args: [p.chainId, storeId, from, a.action, a.value, to, outcome, p.reachedHuman ? 1 : 0, secs, at, at],
      });
    }
    edges++;
  }
  return { nodes, edges, newPrompts };
}

/** The graph for one chain, for the dashboard and for answering "have we ever heard this prompt?". */
export async function graphFor(chainId: number, storeId = 0): Promise<{
  nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>;
}> {
  await ensureMapTables();
  const [n, e] = await Promise.all([
    client.execute({ sql: `SELECT * FROM nav_nodes WHERE chain_id=? AND store_id=? ORDER BY heard_count DESC LIMIT 200`, args: [chainId, storeId] }),
    client.execute({ sql: `SELECT * FROM nav_edges WHERE chain_id=? AND store_id=? ORDER BY taken_count DESC LIMIT 400`, args: [chainId, storeId] }),
  ]);
  return {
    nodes: n.rows.map((r: any) => ({
      id: Number(r.id), fingerprint: String(r.fingerprint), label: r.label ? String(r.label) : "",
      kind: String(r.kind), language: r.language ? String(r.language) : null,
      heard: Number(r.heard_count), firstSeen: Number(r.first_seen), lastSeen: Number(r.last_seen),
    })),
    edges: e.rows.map((r: any) => ({
      id: Number(r.id), from: Number(r.from_node), to: r.to_node == null ? null : Number(r.to_node),
      action: String(r.action), value: String(r.value), outcome: r.outcome ? String(r.outcome) : null,
      taken: Number(r.taken_count), reached: Number(r.reached_count),
      avgSeconds: r.avg_seconds == null ? null : Number(r.avg_seconds),
    })),
  };
}

// ---- reading the map ------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToVersion(r: any): MapVersion {
  const parse = <T,>(s: unknown, fallback: T): T => { try { return JSON.parse(String(s)) as T; } catch { return fallback; } };
  return {
    id: Number(r.id), chainId: Number(r.chain_id), storeId: Number(r.store_id || 0), version: Number(r.version),
    status: String(r.status) as MapVersion["status"], navType: String(r.nav_type || ""),
    recipe: parse<MapRecipe>(r.recipe, { type: "direct", steps: [], seconds: 0 }),
    seconds: r.seconds == null ? null : Number(r.seconds),
    confidence: Number(r.confidence || 0), confidenceLabel: String(r.confidence_label || "unknown") as ConfidenceLabel,
    evidence: parse<Evidence>(r.evidence, { calls: [] }),
    source: String(r.source || ""), summary: String(r.summary || ""), why: String(r.why || ""),
    createdAt: Number(r.created_at || 0),
    approvedAt: r.approved_at == null ? null : Number(r.approved_at),
    approvedBy: r.approved_by == null ? null : String(r.approved_by),
    retiredAt: r.retired_at == null ? null : Number(r.retired_at),
  };
}

/** The version the runtime should use for this chain (or this store, when the store has its own —
 *  Target proved stores inside one chain answer differently). Store map wins, chain map is the
 *  fallback, and only an ACTIVE version is ever handed to a live call. */
export async function activeMap(chainId: number, storeId = 0): Promise<MapVersion | null> {
  if (storeId) {
    const own = await client.execute({
      sql: `SELECT * FROM nav_map_versions WHERE chain_id=? AND store_id=? AND status='active' ORDER BY version DESC LIMIT 1`,
      args: [chainId, storeId],
    });
    if (own.rows.length) return rowToVersion(own.rows[0]);
  }
  const r = await client.execute({
    sql: `SELECT * FROM nav_map_versions WHERE chain_id=? AND store_id=0 AND status='active' ORDER BY version DESC LIMIT 1`,
    args: [chainId],
  });
  return r.rows.length ? rowToVersion(r.rows[0]) : null;
}

export async function versionsFor(chainId: number, storeId?: number): Promise<MapVersion[]> {
  const r = storeId == null
    ? await client.execute({ sql: `SELECT * FROM nav_map_versions WHERE chain_id=? ORDER BY version DESC, id DESC LIMIT 100`, args: [chainId] })
    : await client.execute({ sql: `SELECT * FROM nav_map_versions WHERE chain_id=? AND store_id=? ORDER BY version DESC LIMIT 100`, args: [chainId, storeId] });
  return r.rows.map(rowToVersion);
}

export async function versionById(id: number): Promise<MapVersion | null> {
  const r = await client.execute({ sql: `SELECT * FROM nav_map_versions WHERE id=?`, args: [id] });
  return r.rows.length ? rowToVersion(r.rows[0]) : null;
}

// ---- writing the map ------------------------------------------------------------------------

const nowSec = () => Math.floor(Date.now() / 1000);
const dayOf = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Plain-English "what changed" — this is what the owner reads in the version list, so it never
 *  contains a path signature or a field name. */
function describeChange(prev: MapVersion | null, next: MapRecipe): string {
  if (!prev) return next.steps.length ? `First map: ${spoken(next)}` : "First map: a person answers directly";
  const same = pathSignature(prev.recipe) === pathSignature(next);
  if (!same) return `Route changed — was ${spoken(prev.recipe)}, now ${spoken(next)}`;
  const before = prev.seconds ?? 0, after = next.seconds ?? 0;
  if (after && before && after < before - 1) return `Same route, ${before - after}s faster to a person (${after}s)`;
  if (after && before && after > before + 1) return `Same route, ${after - before}s slower (${after}s)`;
  return "Same route, confirmed again";
}
function spoken(r: MapRecipe | { steps?: MapStep[] }): string {
  const steps = (r?.steps || []) as MapStep[];
  if (!steps.length) return "a person answers directly";
  return steps.map((s) => (s.action === "press" ? `press ${s.value}` : `say "${s.value}"`)).join(", then ");
}

/** Record a mapping/verify call as a new version of this chain's (or store's) map.
 *
 *  Rules, all of them the owner's:
 *   • Never overwrite history — every call that reaches a human writes a version.
 *   • A repeat of the SAME route folds its evidence into the live version (confidence climbs) instead
 *     of churning a new active map; the version row is still written so the history shows the proof.
 *   • A DIFFERENT route never goes live on its own. It lands as `proposed` for approval, because a
 *     one-off menu detour (Spanish intro, pharmacy-closed branch) must not silently replace a route
 *     that has been working.
 *   • A 0-hammer route is always proposed, never auto-active, whatever its evidence says. */
export async function proposeVersion(opts: {
  chainId: number; storeId?: number; recipe: MapRecipe; source: string;
  call?: EvidenceCall; why?: string; autoActivate?: boolean; local?: boolean;
}): Promise<{ version: MapVersion; activated: boolean; foldedInto?: number }> {
  await ensureMapTables();
  // ONE SOURCE OF TRUTH: on a follower environment the record lives elsewhere (production, the map
  // Admin shows). Send it there first so both environments end up on the identical recipe, then fall
  // through and apply the same thing locally. `local: true` is the authority applying its own write.
  if (!opts.local && isMapFollower()) {
    const ch = (await db.select().from(chains).where(eq(chains.id, opts.chainId)))[0];
    const store = opts.storeId ? (await db.select().from(retailers).where(eq(retailers.id, opts.storeId)))[0] : null;
    if (ch) {
      const res = await pushVersion({
        chainName: ch.name, storePhone: store?.phone ?? null, storeName: store?.name ?? null,
        recipe: opts.recipe, source: opts.source, call: opts.call, why: opts.why,
      });
      if (!res.ok) {
        // Never lose a mapping call over a network blip — keep it here, say so out loud, and mark the
        // chain UNSHARED so the read-back from the record cannot quietly overwrite it.
        await setSetting(`map_unshared:${opts.chainId}`, String(nowSec()));
        await reportUnknown({
          chainId: opts.chainId, storeId: opts.storeId, kind: "not-shared",
          prompt: `Learned a route but could not write it to the shared map: ${res.error || "unknown error"}`,
          evidence: { navId: opts.call?.navId, recipe: opts.recipe },
        });
      } else {
        await setSetting(`map_unshared:${opts.chainId}`, "");   // safely on the record now
      }
    }
  }
  let storeId = opts.storeId || 0;
  const at = nowSec();
  const call: EvidenceCall | null = opts.call
    ? { ...opts.call, at: opts.call.at || at, day: opts.call.day || dayOf(opts.call.at || at), path: opts.call.path || pathSignature(opts.recipe) }
    : null;

  const prevActive = await activeMap(opts.chainId, storeId);
  const sameRoute = !!prevActive && prevActive.storeId === storeId && pathSignature(prevActive.recipe) === pathSignature(opts.recipe);
  const hammer = isHammerPath(opts.recipe);

  // Same route confirmed again → fold the evidence into the live version and re-score it. The map
  // the runtime uses does not move; what changes is how much we trust it.
  if (sameRoute && prevActive) {
    const evidence: Evidence = { calls: [...(prevActive.evidence.calls || []), ...(call ? [call] : [])].slice(-25) };
    const scored = scoreConfidence(evidence, at);
    // Keep the FASTER measurement (no-downgrade guard, same rule the mapper already follows): a
    // slower re-measure is ring variance, not a worse route.
    const faster = typeof opts.recipe.seconds === "number" && typeof prevActive.seconds === "number"
      && opts.recipe.seconds > 0 && opts.recipe.seconds < prevActive.seconds;
    // …but a slower call can still teach us things the live map does not have: WHICH recording each
    // step follows, and WHICH steps cannot be barged (the CVS "front" fact). Both are learned by real
    // calls that cost real money, so they are never thrown away just because the call ran two seconds
    // long — they are grafted onto the live route, which keeps its own faster times.
    const knows = (r: MapRecipe, i: number) => ({
      afterPrompt: r.steps[i]?.afterPrompt,
      bargeSafe: r.steps[i]?.bargeSafe,
    });
    const addsKnowledge = opts.recipe.steps.some((s, i) => {
      const live = prevActive.recipe.steps[i];
      return (typeof s.afterPrompt === "number" && typeof live?.afterPrompt !== "number")
        || (typeof s.bargeSafe === "boolean" && typeof live?.bargeSafe !== "boolean");
    });
    let recipe = prevActive.recipe;
    if (faster) recipe = opts.recipe;
    else if (addsKnowledge) {
      recipe = {
        ...prevActive.recipe,
        steps: prevActive.recipe.steps.map((s, i) => {
          const inc = knows(opts.recipe, i);
          return {
            ...s,
            afterPrompt: s.afterPrompt ?? inc.afterPrompt,
            // false is a HARD fact ("this looped the menu") and outranks not-knowing.
            bargeSafe: inc.bargeSafe === false ? false : (s.bargeSafe ?? inc.bargeSafe),
          };
        }),
      };
    }
    const seconds = faster ? opts.recipe.seconds : prevActive.seconds;
    await client.execute({
      sql: `UPDATE nav_map_versions SET evidence=?, confidence=?, confidence_label=?, why=?, recipe=?, seconds=? WHERE id=?`,
      args: [JSON.stringify(evidence), scored.score, scored.label, scored.why, JSON.stringify(recipe), seconds ?? null, prevActive.id],
    });
    await recordObservation({
      chainId: opts.chainId, storeId, versionId: prevActive.id, navId: call?.navId, kind: "verify",
      expected: pathSignature(prevActive.recipe), observed: pathSignature(opts.recipe), drift: false,
      detail: { seconds: opts.recipe.seconds, confidence: scored.score },
    });
    const refreshed = (await versionById(prevActive.id))!;
    if (faster) await stampChainFromVersion(refreshed);
    return { version: refreshed, activated: false, foldedInto: prevActive.id };
  }

  // ONE STORE DISAGREEING IS A STORE EXCEPTION, NEVER A CHAIN CHANGE (runtime spec §10.2).
  // Franklin's Ace is one store out of many. If a store walks a different route to its person, that is
  // almost always that store, not the chain — and letting one odd call rewrite the chain would break
  // five hundred stores at once. So: the exception is recorded against THAT STORE, and the chain route
  // only moves once STORES_TO_MOVE_CHAIN separate stores have walked the same new route.
  if (prevActive && !sameRoute && storeId && prevActive.storeId === 0 && call?.reachedHuman) {
    const agreeing = await storesAgreeingOn(opts.chainId, pathSignature(opts.recipe), storeId);
    if (agreeing.length < STORES_TO_MOVE_CHAIN) {
      const res = await proposeStoreException(opts, call, agreeing.length);
      return res;
    }
    // Enough stores now walk this route that it is the chain's route, not an exception. Fall through
    // and propose it at CHAIN level — the store must be cleared here or the promotion would silently
    // file itself as yet another store exception and the chain would never move at all.
    opts = { ...opts, storeId: 0, why: `${agreeing.length} stores now walk this route (${agreeing.join(", ")})` };
    storeId = 0;
  }

  // A new route (or the first one ever).
  const evidence: Evidence = { calls: call ? [call] : [] };
  const scored = scoreConfidence(evidence, at);
  const maxRow = await client.execute({
    sql: `SELECT COALESCE(MAX(version),0) AS v FROM nav_map_versions WHERE chain_id=? AND store_id=?`,
    args: [opts.chainId, storeId],
  });
  const version = Number((maxRow.rows[0] as any)?.v || 0) + 1;
  // First map for a chain with nothing live can activate straight away — a proven human-reaching path
  // beats no path at all. Anything REPLACING a working route waits for approval, and a hammer never
  // activates itself.
  const activate = !hammer && (opts.autoActivate ?? !prevActive) && !!call?.reachedHuman;
  const summary = describeChange(prevActive, opts.recipe);
  const why = opts.why || (hammer ? "Auto-caller pressed the same key repeatedly — needs a real map" : scored.why);

  const ins = await client.execute({
    sql: `INSERT INTO nav_map_versions (chain_id, store_id, version, status, nav_type, recipe, seconds, confidence,
      confidence_label, evidence, source, summary, why, created_at, approved_at, approved_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [opts.chainId, storeId, version, activate ? "active" : "proposed", opts.recipe.type || null,
      JSON.stringify(opts.recipe), opts.recipe.seconds ?? null, scored.score, scored.label,
      JSON.stringify(evidence), opts.source, summary, why, at, activate ? at : null, activate ? "auto" : null],
  });
  const id = Number(ins.lastInsertRowid || 0);
  if (activate) {
    if (prevActive) await retire(prevActive.id, at);
    const v = (await versionById(id))!;
    await stampChainFromVersion(v);
    return { version: v, activated: true };
  }
  // A proposed replacement is a review item, not a silent file — it shows up in the queue with its
  // evidence so the change is a decision somebody made, not something that happened.
  if (prevActive) {
    await reportUnknown({
      chainId: opts.chainId, storeId, kind: "route-changed",
      prompt: `Heard a different route: ${spoken(opts.recipe)} (was ${spoken(prevActive.recipe)})`,
      evidence: { versionId: id, navId: call?.navId, seconds: opts.recipe.seconds },
    });
  }
  return { version: (await versionById(id))!, activated: false };
}

/** How many separate stores must walk a new route before it becomes the CHAIN's route. Three, because
 *  two can be a coincidence of one bad afternoon and one is just a store being itself. */
const STORES_TO_MOVE_CHAIN = 3;

/** Which stores have an ACTIVE store-level route matching this path (plus the one calling in). Used to
 *  decide when an exception has stopped being an exception. */
async function storesAgreeingOn(chainId: number, path: string, includeStoreId?: number): Promise<number[]> {
  const r = await client.execute({
    sql: `SELECT store_id, recipe FROM nav_map_versions WHERE chain_id=? AND store_id>0 AND status='active'`,
    args: [chainId],
  });
  const ids = new Set<number>(includeStoreId ? [includeStoreId] : []);
  for (const row of r.rows) {
    const rec = (() => { try { return JSON.parse(String((row as any).recipe)) as MapRecipe; } catch { return null; } })();
    if (rec && pathSignature(rec) === path) ids.add(Number((row as any).store_id));
  }
  return [...ids];
}

/** Has the chain's route actually FAILED at this store recently? A failed attempt or a drift we
 *  recorded there is the evidence. This is the difference between "this store answers differently"
 *  and "this store is broken", and it decides whether an exception may go live without being asked. */
async function chainRouteFailingAt(chainId: number, storeId: number, withinDays = 30): Promise<boolean> {
  const since = nowSec() - withinDays * DAY;
  const r = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM nav_observations
          WHERE chain_id=? AND store_id=? AND at>? AND (kind='failed-attempt' OR drift=1)`,
    args: [chainId, storeId, since],
  });
  return Number((r.rows[0] as any)?.n || 0) > 0;
}

/** Record a store walking its own route.
 *
 *  THE OWNER'S STANDING RULE IS THAT A CHANGED ROUTE WAITS FOR HIS YES, so this only goes live by
 *  itself in the one case where waiting does harm: the chain's route is ALREADY PROVEN BROKEN at this
 *  store (a failed call or a drift recorded there). Then leaving it on a route that does not work
 *  helps nobody, and the blast radius is one store. With no such evidence it is PROPOSED and waits,
 *  exactly like a chain change. Either way it is filed as a review item so the pattern is visible. */
async function proposeStoreException(
  opts: { chainId: number; storeId?: number; recipe: MapRecipe; source: string; why?: string },
  call: EvidenceCall, agreeing: number,
): Promise<{ version: MapVersion; activated: boolean; foldedInto?: number }> {
  const storeId = opts.storeId as number;
  const at = nowSec();
  const existing = await activeMap(opts.chainId, storeId);
  if (existing && existing.storeId === storeId && pathSignature(existing.recipe) === pathSignature(opts.recipe)) {
    // The same exception again — evidence, not a new version.
    const evidence: Evidence = { calls: [...(existing.evidence.calls || []), call].slice(-25) };
    const scored = scoreConfidence(evidence, at);
    await client.execute({
      sql: `UPDATE nav_map_versions SET evidence=?, confidence=?, confidence_label=?, why=? WHERE id=?`,
      args: [JSON.stringify(evidence), scored.score, scored.label, scored.why, existing.id],
    });
    return { version: (await versionById(existing.id))!, activated: false, foldedInto: existing.id };
  }
  const maxRow = await client.execute({
    sql: `SELECT COALESCE(MAX(version),0) AS v FROM nav_map_versions WHERE chain_id=? AND store_id=?`,
    args: [opts.chainId, storeId],
  });
  const version = Number((maxRow.rows[0] as any)?.v || 0) + 1;
  const evidence: Evidence = { calls: [call] };
  const scored = scoreConfidence(evidence, at);
  const broken = await chainRouteFailingAt(opts.chainId, storeId);
  const goLive = broken;                       // see the rule above: only when waiting would do harm
  const summary = `This store walks its own route: ${spoken(opts.recipe)}`;
  const why = goLive
    ? `Live for this store only — the chain route has been failing here. ${agreeing} of ${STORES_TO_MOVE_CHAIN} stores needed before the chain route itself changes.`
    : `Waiting for approval — the chain route has not failed at this store. ${agreeing} of ${STORES_TO_MOVE_CHAIN} stores needed before the chain route itself changes.`;
  const ins = await client.execute({
    sql: `INSERT INTO nav_map_versions (chain_id, store_id, version, status, nav_type, recipe, seconds, confidence,
      confidence_label, evidence, source, summary, why, created_at, approved_at, approved_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [opts.chainId, storeId, version, goLive ? "active" : "proposed", opts.recipe.type || null,
      JSON.stringify(opts.recipe), opts.recipe.seconds ?? null, scored.score, scored.label,
      JSON.stringify(evidence), opts.source, summary, why, at, goLive ? at : null,
      goLive ? "store-exception" : null],
  });
  if (goLive && existing && existing.storeId === storeId) await retire(existing.id, at);
  await reportUnknown({
    chainId: opts.chainId, storeId, kind: "store-exception",
    prompt: `${summary} — ${goLive ? "live for this store, the chain route was failing here" : "waiting for your yes"}`,
    evidence: { versionId: Number(ins.lastInsertRowid || 0), navId: call.navId, agreeing, live: goLive },
  });
  // The flag says what actually happened. Anything reading it — the dashboard, a caller, a test — must
  // never be told a live route is not live (Echo, 07-27).
  return { version: (await versionById(Number(ins.lastInsertRowid || 0)))!, activated: goLive };
}

async function retire(versionId: number, at: number): Promise<void> {
  await client.execute({ sql: `UPDATE nav_map_versions SET status='retired', retired_at=? WHERE id=?`, args: [at, versionId] });
}

/** Approve a proposed version → it becomes the map the runtime uses, and the old one retires with
 *  its history intact. */
export async function approveVersion(id: number, by: string, local = false): Promise<{ ok: boolean; error?: string; version?: MapVersion }> {
  await ensureMapTables();
  const v = await versionById(id);
  if (!v) return { ok: false, error: "version not found" };
  if (v.status === "active") return { ok: true, version: v };
  if (!local && isMapFollower()) {
    const ch = (await db.select().from(chains).where(eq(chains.id, v.chainId)))[0];
    if (ch) await pushDecision({ chainName: ch.name, version: v.version, decision: "approve", by });
  }
  const at = nowSec();
  const prev = await activeMap(v.chainId, v.storeId);
  if (prev && prev.id !== id) await retire(prev.id, at);
  await client.execute({ sql: `UPDATE nav_map_versions SET status='active', approved_at=?, approved_by=? WHERE id=?`, args: [at, by, id] });
  const fresh = (await versionById(id))!;
  await stampChainFromVersion(fresh);
  await client.execute({ sql: `UPDATE nav_unknowns SET status='resolved', note=? WHERE status='open' AND kind='route-changed' AND chain_id=? AND store_id=?`, args: [`approved v${fresh.version}`, v.chainId, v.storeId] });
  return { ok: true, version: fresh };
}

export async function rejectVersion(id: number, by: string, why: string, local = false): Promise<{ ok: boolean; error?: string }> {
  await ensureMapTables();
  const v = await versionById(id);
  if (!v) return { ok: false, error: "version not found" };
  if (v.status === "active") return { ok: false, error: "that version is live — approve a different one instead" };
  if (!local && isMapFollower()) {
    const ch = (await db.select().from(chains).where(eq(chains.id, v.chainId)))[0];
    if (ch) await pushDecision({ chainName: ch.name, version: v.version, decision: "reject", by, why });
  }
  await client.execute({ sql: `UPDATE nav_map_versions SET status='rejected', why=?, approved_by=? WHERE id=?`, args: [why || v.why, by, id] });
  return { ok: true };
}

/** The chain row stays the runtime's source of truth (every live surface already reads it), so an
 *  active CHAIN-level version is stamped back onto it. Store-level maps never touch the chain row —
 *  they are read by the runtime through activeMap(). ADDITIVE: same columns, same meaning, one
 *  writer. */
async function stampChainFromVersion(v: MapVersion): Promise<void> {
  if (v.storeId) return;
  // A GREETING route has no steps and is NOT direct — a recording answers, then a person. Reading
  // "no steps" as "direct" here is the same mistake that put the paid agent on the line talking to
  // "thank you for calling Barnes & Noble" (owner 07-27), so it is named explicitly.
  const greeting = v.recipe.type === "greeting";
  const direct = !greeting && (v.recipe.type === "direct" || !v.recipe.steps.length);
  const navText = direct
    ? "A live person usually answers directly — no phone menu to work through."
    : greeting
      ? "A recording answers first and hands you to a person. There is nothing to press or say, just wait."
      : "To reach a live person: " + spoken(v.recipe) + ".";
  // The live bridge only understands the timed "digit@seconds" form (a bare digit presses nothing).
  const dtmfPlan = recipeToDtmf(v.recipe);
  await db.update(chains).set({
    navType: v.recipe.type, navRecipe: JSON.stringify(v.recipe),
    navSeconds: direct ? null : (v.seconds ?? null),
    navStatus: "locked", navConfidence: v.confidence,
    navUpdatedAt: nowSec(),
    phoneTreeDefault: navText,
    dtmfShortcut: dtmfPlan || null,
    answerPath: greeting ? "greeting_then_transfer"
      : pathSignature(v.recipe) === "direct" ? "direct_human" : pathSignature(v.recipe),
    ringsDirect: direct,
    // The wait is the whole point of a greeting chain, so it MUST carry its seconds. A truly direct
    // chain still carries none — a stray value there mutes the agent on a live human.
    avgTreeSeconds: direct ? null : (v.seconds ?? null),
    treeStatus: v.confidenceLabel === "verified" ? "verified" : "learned",
    treeLearnedAt: nowSec(),
  }).where(eq(chains.id, v.chainId));
}

// ---- observations, drift, unknowns -----------------------------------------------------------

export async function recordObservation(o: {
  chainId: number; storeId?: number; versionId?: number | null; navId?: string; callId?: number;
  kind: string; expected?: string; observed?: string; drift?: boolean; detail?: unknown;
  hourLocal?: number | null; dow?: number | null; language?: Language;
}): Promise<void> {
  await ensureMapTables();
  // WHEN it happened, in the store's own clock, on EVERY observation (runtime spec §10.4). When the
  // caller does not know the store, we look it up rather than store a server hour that means nothing.
  let hour = o.hourLocal ?? null, dow = o.dow ?? null;
  if ((hour == null || dow == null) && o.storeId) {
    const when = await storeLocalTime(o.storeId);
    hour = hour ?? when.hour; dow = dow ?? when.dow;
  }
  await client.execute({
    sql: `INSERT INTO nav_observations (chain_id, store_id, version_id, nav_id, call_id, at, kind, expected, observed, drift, detail, hour_local, dow, language)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [o.chainId, o.storeId || 0, o.versionId ?? null, o.navId ?? null, o.callId ?? null, nowSec(),
      o.kind, o.expected ?? null, o.observed ?? null, o.drift ? 1 : 0, o.detail ? JSON.stringify(o.detail) : null,
      hour, dow, o.language ?? null],
  });
}

/** The hour and weekday where the STORE is, right now. A menu at 9pm local is often not the daytime
 *  menu; a server hour would tell us nothing about that. */
export async function storeLocalTime(storeId: number, at = new Date()): Promise<{ hour: number | null; dow: number | null }> {
  if (!storeId) return { hour: null, dow: null };
  const st = (await db.select({ tz: retailers.timezone }).from(retailers).where(eq(retailers.id, storeId)))[0];
  const tz = st?.tz || "America/Chicago";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(at);
    const hour = Number(parts.find((x) => x.type === "hour")?.value ?? NaN);
    const wk = String(parts.find((x) => x.type === "weekday")?.value || "");
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wk);
    return { hour: Number.isFinite(hour) ? hour % 24 : null, dow: dow >= 0 ? dow : null };
  } catch { return { hour: null, dow: null }; }
}

/** An unknown is a first-class review item, never a discarded log line. Repeats fold into one row
 *  with a count so a menu we cannot read at 400 stores is ONE thing to decide, not 400. */
export async function reportUnknown(u: {
  chainId: number; storeId?: number; kind: string; prompt?: string; evidence?: unknown;
}): Promise<void> {
  await ensureMapTables();
  const at = nowSec();
  const key = (u.prompt || "").slice(0, 200);
  const found = await client.execute({
    sql: `SELECT id, seen_count FROM nav_unknowns WHERE chain_id=? AND store_id=? AND kind=? AND status='open' AND COALESCE(prompt,'')=? LIMIT 1`,
    args: [u.chainId, u.storeId || 0, u.kind, key],
  });
  if (found.rows.length) {
    const row = found.rows[0] as any;
    await client.execute({ sql: `UPDATE nav_unknowns SET last_seen=?, seen_count=? WHERE id=?`, args: [at, Number(row.seen_count || 1) + 1, Number(row.id)] });
    return;
  }
  await client.execute({
    sql: `INSERT INTO nav_unknowns (chain_id, store_id, kind, prompt, evidence, first_seen, last_seen, seen_count, status)
          VALUES (?,?,?,?,?,?,?,1,'open')`,
    args: [u.chainId, u.storeId || 0, u.kind, key || null, u.evidence ? JSON.stringify(u.evidence) : null, at, at],
  });
}

export async function openUnknowns(limit = 100): Promise<Array<Record<string, unknown>>> {
  await ensureMapTables();
  const r = await client.execute({ sql: `SELECT * FROM nav_unknowns WHERE status='open' ORDER BY seen_count DESC, last_seen DESC LIMIT ?`, args: [limit] });
  return r.rows.map((x: any) => ({
    id: Number(x.id), chainId: Number(x.chain_id), storeId: Number(x.store_id || 0), kind: String(x.kind),
    prompt: x.prompt ? String(x.prompt) : "", evidence: x.evidence ? JSON.parse(String(x.evidence)) : null,
    firstSeen: Number(x.first_seen), lastSeen: Number(x.last_seen), count: Number(x.seen_count), note: x.note ? String(x.note) : "",
  }));
}

export async function resolveUnknown(id: number, status: "resolved" | "dismissed", note: string): Promise<void> {
  await ensureMapTables();
  await client.execute({ sql: `UPDATE nav_unknowns SET status=?, note=? WHERE id=?`, args: [status, note || "", id] });
}

/** DRIFT — what a real customer check heard, measured against the map we shipped it. Costs nothing:
 *  it compares facts the call already produces (how many recordings played, when each step fired,
 *  whether a step had to fall back to the clock, whether a human was reached). No speech recognition,
 *  no model. A step that fires on the CLOCK instead of on a recording ending is the early warning
 *  that a menu moved — that is exactly the failure that talked over CVS and Walmart. */
export async function reportCallDrift(o: {
  chainId: number; storeId?: number; navId?: string; callId?: number;
  fired: Array<{ value: string; atSec: number; via: string }>;
  reachedHuman: boolean; navEndSec?: number | null; promptCount?: number;
}): Promise<{ drift: boolean; reasons: string[] }> {
  await ensureMapTables();
  const map = await activeMap(o.chainId, o.storeId || 0);
  if (!map) return { drift: false, reasons: [] };
  const reasons: string[] = [];
  const expected = map.recipe.steps;
  if (o.fired.length && o.fired.length < expected.length) reasons.push(`only ${o.fired.length} of ${expected.length} menu steps ran`);
  const clockFired = o.fired.filter((f) => f.via === "clock");
  if (clockFired.length) reasons.push(`${clockFired.length} step(s) fired on the backup timer — the recording never paused where we expect`);
  for (const f of o.fired) {
    const step = expected.find((s) => String(s.value) === String(f.value));
    if (!step) { reasons.push(`said/pressed "${f.value}", which is not in the map`); continue; }
    const slip = Math.abs(f.atSec - step.atSec);
    if (slip > 12) reasons.push(`"${f.value}" landed at ${f.atSec}s, ${slip}s off the mapped ${step.atSec}s`);
  }
  if (!o.reachedHuman && expected.length) reasons.push("the mapped route did not reach a person");
  const drift = reasons.length > 0;
  await recordObservation({
    chainId: o.chainId, storeId: o.storeId, versionId: map.id, navId: o.navId, callId: o.callId,
    kind: "live-check", expected: pathSignature(map.recipe),
    observed: o.fired.map((f) => f.value).join(">"), drift,
    detail: { reasons, navEndSec: o.navEndSec ?? null, promptCount: o.promptCount ?? null },
  });
  if (drift) {
    await reportUnknown({
      chainId: o.chainId, storeId: o.storeId, kind: "drift",
      prompt: reasons[0], evidence: { navId: o.navId, callId: o.callId, reasons, versionId: map.id },
    });
    await decayConfidence(map.id);
  }
  return { drift, reasons };
}

/** Drift lowers trust immediately — a map that just misbehaved on a paying customer's check should
 *  not still read "verified" on the dashboard while we work out why. */
async function decayConfidence(versionId: number): Promise<void> {
  const v = await versionById(versionId);
  if (!v) return;
  const score = Math.max(20, v.confidence - 15);
  const label: ConfidenceLabel = score < 60 ? "needs review" : "changed recently";
  await client.execute({ sql: `UPDATE nav_map_versions SET confidence=?, confidence_label=? WHERE id=?`, args: [score, label, versionId] });
  if (!v.storeId) await db.update(chains).set({ navConfidence: score }).where(eq(chains.id, v.chainId));
}

// ---- the dashboard read ----------------------------------------------------------------------

export interface GraphRow {
  chainId: number; chain: string; storeId: number;
  mapped: boolean; navType: string; route: string; seconds: number | null;
  confidence: number; confidenceLabel: string; version: number | null; versionId: number | null;
  lastVerified: number | null; proposed: number; openUnknowns: number; drift30d: number;
  hammer: boolean; promptTriggered: boolean;
}

/** One row per chain for the Admin map screen: what we press/say, how fast it gets to a person, how
 *  much we trust it, and whether anything is waiting on a decision. Everything Addie's dashboard
 *  needs in one call. */
export async function graphSummary(): Promise<GraphRow[]> {
  await ensureMapTables();
  const chainRows = await db.select().from(chains);
  const since = nowSec() - 30 * DAY;
  const [versions, unknowns, drifts] = await Promise.all([
    client.execute(`SELECT * FROM nav_map_versions ORDER BY version DESC`),
    client.execute({ sql: `SELECT chain_id, COUNT(*) AS n FROM nav_unknowns WHERE status='open' GROUP BY chain_id`, args: [] }),
    client.execute({ sql: `SELECT chain_id, COUNT(*) AS n FROM nav_observations WHERE drift=1 AND at>? GROUP BY chain_id`, args: [since] }),
  ]);
  const byChain = new Map<number, MapVersion[]>();
  for (const row of versions.rows) {
    const v = rowToVersion(row);
    const list = byChain.get(v.chainId) || [];
    list.push(v); byChain.set(v.chainId, list);
  }
  const nUnknown = new Map<number, number>(unknowns.rows.map((r: any) => [Number(r.chain_id), Number(r.n)]));
  const nDrift = new Map<number, number>(drifts.rows.map((r: any) => [Number(r.chain_id), Number(r.n)]));

  return chainRows.map((ch) => {
    const list = byChain.get(ch.id) || [];
    const active = list.find((v) => v.status === "active" && v.storeId === 0) || null;
    const proposed = list.filter((v) => v.status === "proposed").length;
    let recipe: MapRecipe | null = active?.recipe ?? null;
    if (!recipe && ch.navRecipe) { try { recipe = JSON.parse(ch.navRecipe) as MapRecipe; } catch { recipe = null; } }
    return {
      chainId: ch.id, chain: ch.name, storeId: 0,
      mapped: !!active || !!ch.navRecipe,
      navType: active?.navType || ch.navType || (ch.ringsDirect ? "direct" : ""),
      route: recipe ? spoken(recipe) : (ch.ringsDirect ? "a person answers directly" : ""),
      seconds: active?.seconds ?? ch.navSeconds ?? null,
      confidence: active?.confidence ?? ch.navConfidence ?? 0,
      confidenceLabel: active?.confidenceLabel || (ch.navConfidence ? "observed once" : "unknown"),
      version: active?.version ?? null, versionId: active?.id ?? null,
      lastVerified: active?.approvedAt ?? ch.navUpdatedAt ?? null,
      proposed, openUnknowns: nUnknown.get(ch.id) || 0, drift30d: nDrift.get(ch.id) || 0,
      hammer: isHammerPath(recipe),
      promptTriggered: !!recipe?.steps?.some((s) => typeof s.afterPrompt === "number"),
    };
  });
}

/** Everything behind one chain: its versions, its evidence, its unknowns, its recent observations —
 *  the replay trail for a single map. */
export async function chainDetail(chainId: number): Promise<Record<string, unknown>> {
  await ensureMapTables();
  const [vs, obs, unk] = await Promise.all([
    versionsFor(chainId),
    client.execute({ sql: `SELECT * FROM nav_observations WHERE chain_id=? ORDER BY at DESC LIMIT 50`, args: [chainId] }),
    client.execute({ sql: `SELECT * FROM nav_unknowns WHERE chain_id=? ORDER BY status='open' DESC, last_seen DESC LIMIT 50`, args: [chainId] }),
  ]);
  return {
    versions: vs,
    observations: obs.rows.map((r: any) => ({
      id: Number(r.id), at: Number(r.at), kind: String(r.kind), navId: r.nav_id ? String(r.nav_id) : null,
      callId: r.call_id == null ? null : Number(r.call_id), expected: r.expected ? String(r.expected) : "",
      observed: r.observed ? String(r.observed) : "", drift: Number(r.drift) === 1,
      detail: r.detail ? JSON.parse(String(r.detail)) : null,
    })),
    unknowns: unk.rows.map((r: any) => ({
      id: Number(r.id), kind: String(r.kind), prompt: r.prompt ? String(r.prompt) : "",
      status: String(r.status), count: Number(r.seen_count), firstSeen: Number(r.first_seen), lastSeen: Number(r.last_seen),
      evidence: r.evidence ? JSON.parse(String(r.evidence)) : null, note: r.note ? String(r.note) : "",
    })),
  };
}

/** CATCH-UP: push every route this environment learned while the record was unreachable.
 *
 *  Production does not have the map endpoints until the next promote, so a route learned on staging
 *  today lands locally and is flagged unshared. This walks those flags and sends them to the record —
 *  run it once the record is reachable and nothing that was learned in between is stranded. Safe to
 *  run any time: an already-shared route just folds in as the same evidence it already carries. */
export async function reshareUnsent(): Promise<{ pushed: number; failed: number; pending: number }> {
  await ensureMapTables();
  if (!isMapFollower()) return { pushed: 0, failed: 0, pending: 0 };
  const all = await allSettings();
  const ids = Object.entries(all)
    .filter(([k, v]) => k.startsWith("map_unshared:") && String(v || "").trim())
    .map(([k]) => Number(k.slice("map_unshared:".length)))
    .filter((n) => Number.isFinite(n) && n > 0);
  let pushed = 0, failed = 0;
  for (const chainId of ids) {
    const v = await activeMap(chainId);
    const ch = (await db.select().from(chains).where(eq(chains.id, chainId)))[0];
    if (!v || !ch) { await setSetting(`map_unshared:${chainId}`, ""); continue; }
    const newest = [...(v.evidence.calls || [])].sort((a, b) => b.at - a.at)[0];
    const store = newest?.storeId ? (await db.select().from(retailers).where(eq(retailers.id, newest.storeId)))[0] : null;
    const res = await pushVersion({
      chainName: ch.name, storePhone: store?.phone ?? null, storeName: newest?.storeName ?? null,
      recipe: v.recipe, source: "catch-up", call: newest, why: v.why,
    });
    if (res.ok) { await setSetting(`map_unshared:${chainId}`, ""); pushed++; } else failed++;
  }
  return { pushed, failed, pending: failed };
}

/** EVERY CALL TEACHES US SOMETHING — including the ordinary customer check nobody meant as mapping.
 *
 *  The owner's case (07-27): a customer checks Franklin's, the store turns out to have a voice menu we
 *  had no idea about. That call must not be lost. It is not lost, and it does not need a second
 *  listener: the Ear already writes what it heard onto the receipt, so Mapper reads the record.
 *
 *  Three things a finished receipt can prove without a word of transcription:
 *   • a store we call DIRECT played a menu   → the label is wrong, and the paid agent was on the line
 *   • a store we call DIRECT played a recording and handed on → the third shape (a greeting)
 *   • the route ran and reached nobody       → the failure counts against the route's health
 *
 *  It never rewrites a route on its own. A customer check is one call at one store, which is exactly
 *  the case §10.2 says must become a store exception or a review item, never a chain change. */
export async function learnFromReceipt(r: {
  room?: string; callId?: number; chainId?: number | null; storeId?: number | null;
  events?: Array<{ kind: string; atSec?: number; detail?: Record<string, unknown> }>;
}): Promise<{ learned: string[] }> {
  const learned: string[] = [];
  const chainId = Number(r.chainId || 0);
  if (!chainId) return { learned };
  await ensureMapTables();
  const storeId = Number(r.storeId || 0) || undefined;
  const events = r.events || [];
  const at = (k: string) => events.find((e) => e.kind === k)?.atSec ?? null;
  const has = (k: string) => events.some((e) => e.kind === k);
  const navId = r.room ? `bridge:${r.room}` : undefined;
  const when = await storeLocalTime(storeId || 0);
  const map = await activeMap(chainId, storeId || 0);
  const calledDirect = !map || map.recipe.type === "direct";
  const menuHeard = has("ivr_detected");
  const personAt = at("human_detected");
  const transferAt = at("transfer");

  // The anomaly the owner asked about: we believed a person answers, and a machine did.
  if (calledDirect && menuHeard) {
    const shape = has("alpha_press") || has("bravo_say") ? "a menu we had to work through"
      : transferAt != null ? "a recording that hands you on"
      : "a recording";
    await reportUnknown({
      chainId, storeId, kind: "direct-store-has-a-recording",
      prompt: `We call this store direct, but a real check heard ${shape}${personAt != null ? ` — a person at ${personAt}s` : ""}`,
      evidence: { navId, callId: r.callId, personAt, transferAt, room: r.room },
    });
    await recordObservation({
      chainId, storeId, versionId: map?.id ?? null, navId, callId: r.callId,
      kind: "unknown", expected: "direct_human", observed: shape, drift: true,
      hourLocal: when.hour, dow: when.dow,
      detail: { personAt, transferAt, note: "heard on an ordinary customer check" },
    });
    learned.push(personAt != null ? `not direct: ${shape}, person at ${personAt}s` : `not direct: ${shape}`);
    // Trust in "this store answers directly" drops on the spot. The route is NOT rewritten — one
    // check is one call, and a mapping call has to prove the real route before anything changes.
    if (map && !map.storeId) await decayConfidence(map.id);
  }

  // The route ran and nobody was there. Counts against the route's health, changes nothing.
  if (!calledDirect && personAt == null && has("hangup")) {
    const why = String(events.find((e) => e.kind === "hangup")?.detail?.why || "no person on the call");
    await recordFailedAttempt({ chainId, storeId, navId, callId: r.callId, reason: why, seconds: at("hangup") });
    learned.push(`route reached nobody: ${why}`);
  }

  // What the call walked, into the graph. No text on a customer check — the Ear counts recordings, it
  // does not transcribe them — so the prompts are anonymous nodes keyed by where they sat in the call.
  const actions = events.filter((e) => e.kind === "alpha_press" || e.kind === "bravo_say").map((e) => ({
    action: (e.kind === "alpha_press" ? "press" : "say") as "press" | "say",
    value: String(e.detail?.key ?? e.detail?.phrase ?? ""), atSec: e.atSec ?? 0,
  })).filter((a) => a.value);
  if (actions.length && personAt != null) {
    await recordObservation({
      chainId, storeId, versionId: map?.id ?? null, navId, callId: r.callId,
      kind: "live-check", expected: map ? pathSignature(map.recipe) : undefined,
      observed: actions.map((a) => a.value).join(">"), drift: false,
      hourLocal: when.hour, dow: when.dow, detail: { personAt, transferAt },
    });
    learned.push(`walked ${actions.length} step(s), person at ${personAt}s`);
  }
  return { learned };
}

/** FAILED CALLS ARE EVIDENCE (runtime spec §10.5). A call that never reached a person must not change
 *  a route — it proves nothing about where the route goes — but it must COUNT, or a route that stopped
 *  working keeps looking healthy right up until a customer pays for it.
 *
 *  So a failure is folded into the live version's evidence (where scoreConfidence already ignores it
 *  for scoring) and the recent record is checked: three of the last five calls failing drops the
 *  confidence and raises a review item. The route itself is untouched — that is the point. */
const FAIL_WINDOW = 5;
const FAILS_TO_FLAG = 3;

export async function recordFailedAttempt(o: {
  chainId: number; storeId?: number; navId?: string; callId?: number;
  reason: string; seconds?: number | null; promptCount?: number; language?: Language;
}): Promise<{ counted: boolean; recentFails: number; flagged: boolean }> {
  await ensureMapTables();
  const at = nowSec();
  const when = await storeLocalTime(o.storeId || 0);
  const map = await activeMap(o.chainId, o.storeId || 0);
  await recordObservation({
    chainId: o.chainId, storeId: o.storeId, versionId: map?.id ?? null, navId: o.navId, callId: o.callId,
    kind: "failed-attempt", expected: map ? pathSignature(map.recipe) : undefined,
    observed: o.reason, drift: false, language: o.language,
    hourLocal: when.hour, dow: when.dow,
    detail: { reason: o.reason, seconds: o.seconds ?? null, promptCount: o.promptCount ?? null },
  });
  if (!map) return { counted: true, recentFails: 0, flagged: false };
  // Fold it into the evidence so the failure is visible next to the calls that worked.
  const evidence: Evidence = {
    calls: [...(map.evidence.calls || []), {
      at, day: dayOf(at), storeId: o.storeId, seconds: o.seconds ?? null, promptCount: o.promptCount,
      reachedHuman: false, path: pathSignature(map.recipe), hourLocal: when.hour, dow: when.dow,
      language: o.language, note: o.reason,
    }].slice(-25),
  };
  const recent = evidence.calls.slice(-FAIL_WINDOW);
  const recentFails = recent.filter((c) => !c.reachedHuman).length;
  const scored = scoreConfidence(evidence, at);
  // A run of failures is the signal. Below the bar we still store the failure and leave trust alone.
  const flagged = recentFails >= FAILS_TO_FLAG;
  const score = flagged ? Math.max(20, Math.min(scored.score, 40)) : scored.score;
  const label: ConfidenceLabel = flagged ? "needs review" : scored.label;
  const why = flagged ? `${recentFails} of the last ${recent.length} calls did not reach a person` : scored.why;
  await client.execute({
    sql: `UPDATE nav_map_versions SET evidence=?, confidence=?, confidence_label=?, why=? WHERE id=?`,
    args: [JSON.stringify(evidence), score, label, why, map.id],
  });
  if (!map.storeId) await db.update(chains).set({ navConfidence: score }).where(eq(chains.id, o.chainId));
  if (flagged) {
    await reportUnknown({
      chainId: o.chainId, storeId: o.storeId, kind: "route-failing",
      prompt: `${recentFails} of the last ${recent.length} calls on this route did not reach a person (${o.reason})`,
      evidence: { versionId: map.id, navId: o.navId, callId: o.callId },
    });
  }
  return { counted: true, recentFails, flagged };
}

// ---- backfill ---------------------------------------------------------------------------------

/** Bring what we already know into the map as version 1, ONCE, so tomorrow's calls compare against
 *  something and nothing that took real calls to learn is thrown away.
 *
 *  It is deliberately honest about how weak that inheritance is: the chain row carries no evidence
 *  trail, so a backfilled version starts at "observed once", and a 0-hammer route starts flagged for
 *  a real re-map. Runs at boot, skips any chain that already has a version. */
export async function backfillFromChains(): Promise<{ created: number; flagged: number }> {
  await ensureMapTables();
  const already = await client.execute(`SELECT DISTINCT chain_id FROM nav_map_versions WHERE store_id=0`);
  const have = new Set(already.rows.map((r: any) => Number(r.chain_id)));
  const rows = await db.select().from(chains);
  const at = nowSec();
  let created = 0, flagged = 0;
  for (const ch of rows) {
    if (have.has(ch.id)) continue;
    const direct = ch.ringsDirect === true || ch.answerPath === "direct_human";
    let recipe: MapRecipe | null = null;
    if (ch.navRecipe) { try { recipe = JSON.parse(ch.navRecipe) as MapRecipe; } catch { recipe = null; } }
    if (!recipe && direct) recipe = { type: "direct", steps: [], seconds: 0 };
    if (!recipe || (!recipe.steps?.length && !direct)) continue;   // nothing worth carrying over
    const hammer = isHammerPath(recipe);
    // The chain row never held per-call evidence, so we record exactly what it DOES prove: one
    // observation, on one store, on one day, at the time it was last written.
    const call: EvidenceCall = {
      at: ch.navUpdatedAt || at, day: dayOf(ch.navUpdatedAt || at),
      reachedHuman: true, path: pathSignature(recipe),
      seconds: ch.navSeconds ?? null, note: "inherited from the chain row (no per-call evidence)",
    };
    const evidence: Evidence = { calls: [call] };
    const scored = scoreConfidence(evidence, at);
    const confidence = hammer ? Math.min(30, scored.score) : scored.score;
    const label: ConfidenceLabel = hammer ? "needs review" : scored.label;
    await client.execute({
      sql: `INSERT INTO nav_map_versions (chain_id, store_id, version, status, nav_type, recipe, seconds, confidence,
        confidence_label, evidence, source, summary, why, created_at, approved_at, approved_by)
        VALUES (?,0,1,'active',?,?,?,?,?,?,'backfill',?,?,?,?, 'backfill')`,
      args: [ch.id, recipe.type || (direct ? "direct" : "keypad"), JSON.stringify(recipe),
        direct ? null : (ch.navSeconds ?? null), confidence, label, JSON.stringify(evidence),
        direct ? "Carried over: a person answers directly" : `Carried over: ${spoken(recipe)}`,
        hammer ? "Auto-caller pressed the same key repeatedly — needs a real map" : scored.why,
        at, ch.navUpdatedAt || at],
    });
    created++;
    if (hammer) {
      flagged++;
      await reportUnknown({
        chainId: ch.id, kind: "hammer-route",
        prompt: `"${spoken(recipe)}" is the auto-caller pressing the same key, not a mapped menu`,
        evidence: { seconds: ch.navSeconds ?? null },
      });
    }
    if (direct && !ch.navRecipe) {
      await reportUnknown({
        chainId: ch.id, kind: "unproven-direct",
        prompt: "Marked \"a person answers directly\" — never proved by a call. A recorded greeting here would put the paid agent on a machine.",
        evidence: null,
      });
    }
  }
  return { created, flagged };
}

export const _test = { describeChange, spoken, STALE_DAYS };

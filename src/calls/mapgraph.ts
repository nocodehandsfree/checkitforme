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
export interface MapRecipe {
  type: "direct" | "keypad" | "voice";
  steps: MapStep[];
  seconds: number;                 // learned time-to-human
  target?: string;                 // the desk this path reaches
  menu?: Array<{ digit: string; label: string }>;
  menuPrompts?: string[];
  ringVariable?: boolean;
}

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
 *  same signature are the same ROUTE even if the seconds moved. */
export function pathSignature(r: { steps?: Array<{ action?: string; value?: string }> } | null | undefined): string {
  return (r?.steps || []).map((s) => `${s.action}:${String(s.value || "").toLowerCase().trim()}`).join(">") || "direct";
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
  const storeId = opts.storeId || 0;
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
    // …but a slower call can still teach us something the live map does not have: WHICH recording each
    // step follows. That is the whole point of listening, so never throw it away just because the call
    // took two seconds longer — graft the recording plan onto the live route and keep its faster times.
    const incomingPlan = opts.recipe.steps.some((s) => typeof s.afterPrompt === "number");
    const livePlan = prevActive.recipe.steps.some((s) => typeof s.afterPrompt === "number");
    const addsPlan = incomingPlan && !livePlan;
    let recipe = prevActive.recipe;
    if (faster) recipe = opts.recipe;
    else if (addsPlan) {
      recipe = {
        ...prevActive.recipe,
        steps: prevActive.recipe.steps.map((s, i) => ({ ...s, afterPrompt: opts.recipe.steps[i]?.afterPrompt })),
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
  const direct = v.recipe.type === "direct" || !v.recipe.steps.length;
  const navText = direct
    ? "A live person usually answers directly — no phone menu to work through."
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
    answerPath: pathSignature(v.recipe) === "direct" ? "direct_human" : pathSignature(v.recipe),
    ringsDirect: direct,
    avgTreeSeconds: direct ? null : (v.seconds ?? null),
    treeStatus: v.confidenceLabel === "verified" ? "verified" : "learned",
    treeLearnedAt: nowSec(),
  }).where(eq(chains.id, v.chainId));
}

// ---- observations, drift, unknowns -----------------------------------------------------------

export async function recordObservation(o: {
  chainId: number; storeId?: number; versionId?: number | null; navId?: string; callId?: number;
  kind: string; expected?: string; observed?: string; drift?: boolean; detail?: unknown;
}): Promise<void> {
  await ensureMapTables();
  await client.execute({
    sql: `INSERT INTO nav_observations (chain_id, store_id, version_id, nav_id, call_id, at, kind, expected, observed, drift, detail)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [o.chainId, o.storeId || 0, o.versionId ?? null, o.navId ?? null, o.callId ?? null, nowSec(),
      o.kind, o.expected ?? null, o.observed ?? null, o.drift ? 1 : 0, o.detail ? JSON.stringify(o.detail) : null],
  });
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

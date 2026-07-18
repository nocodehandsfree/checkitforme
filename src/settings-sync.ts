// Settings sync — the "Admin edits show on staging in a minute" pipe (owner 2026-07-15).
// PROD IS THE TRUTH for owner-edited settings. STAGING PULLS them every minute and applies them
// locally. One direction by construction: the puller runs only on staging and only ever WRITES
// LOCALLY — prod exposes a read-only export and never receives a byte from this module, so a
// staging→prod settings write is structurally impossible (not just switched off).
//
// Scope (the whitelist — extend deliberately, never wholesale):
//   • policy_json        — pricing, feature/service toggles, links, pages (consumer renders these)…
//                          EXCEPT the call-lane test flags in KEEP_LOCAL_FLAGS: staging flips those
//                          ahead of prod for Fun-store testing, and the mirror must not stomp a
//                          test in progress every 60s.
//   • vt_plans           — the plan ladder the consumer renders (names, prices, quotas, features)…
//                          EXCEPT Stripe publish artifacts (product/price ids + pub state): prod
//                          carries LIVE-mode ids, staging carries TEST-mode ids — mirroring prod's
//                          would break staging checkout (and the launch-gate pay journeys).
//   • support_banner_en/es — the consumer support banner, mirrored verbatim.
//   • statuses table     — the verdict registry (emoji/label/tone/color/note/sort), mirrored
//                          exactly by key (owner-authored, no learned data lives there).
// NOT in scope, on purpose: vt_* voice/workflow keys (architecture rule: staging and prod may run
// different workflows; the Admin env-picker is the future answer), operational counters
// (pub_credits, stats_since), admin-internal state (gtm_*, staff_accounts), and EVERYTHING
// store-sync owns (chains/retailers) — that pipe is Data Dev's, runs staging→prod, and this module
// must never touch its tables or fight its field rules.
//
// Activation: reuses the staging service's existing STORE_SYNC_URL/STORE_SYNC_TOKEN (prod base URL
// + prod admin token — already provisioned for store-sync's sender); SETTINGS_SYNC_URL/TOKEN
// override them if a split is ever needed. Inert outside staging or without the vars.
import { createHash } from "node:crypto";
import { db } from "./db/client";
import { statuses } from "./db/schema";
import { getSetting, setSetting } from "./db/settings";
import { config } from "./config";
import { eq } from "drizzle-orm";

// Call-lane flags staging tests ahead of prod — the mirror preserves staging's own values.
const KEEP_LOCAL_FLAGS = ["cheapBridgeAll", "connectOnHuman"] as const;
// Stripe publish artifacts inside vt_plans that must stay per-environment (test vs live mode).
const TIER_LOCAL_KEYS = ["stripeProductId", "monthlyPriceId", "annualPriceId", "pub"] as const;

export interface SettingsExport {
  policy_json: string | null;
  vt_plans: string | null;
  support_banner_en: string | null;
  support_banner_es: string | null;
  statuses: Array<{ key: string; emoji: string | null; label: string | null; tone: string | null; color: string | null; note: string | null; sort: number | null }>;
}

/** What prod hands out (admin-token gated in server.ts). Raw setting strings — parsing/merging is
 *  the puller's job, so a malformed blob on prod can never wedge the export. */
export async function buildSettingsExport(): Promise<SettingsExport> {
  const rows = await db.select().from(statuses);
  return {
    policy_json: await getSetting("policy_json"),
    vt_plans: await getSetting("vt_plans"),
    support_banner_en: await getSetting("support_banner_en"),
    support_banner_es: await getSetting("support_banner_es"),
    statuses: rows.map((s) => ({ key: s.key, emoji: s.emoji, label: s.label, tone: s.tone, color: s.color, note: s.note, sort: s.sort })),
  };
}

/** Prod's policy override blob, with staging's own KEEP_LOCAL_FLAGS preserved. Exported for tests. */
export function mergePolicyBlob(prodJson: string | null, stagingJson: string | null): string | null {
  if (prodJson == null) return null;
  let prod: Record<string, unknown>; let local: Record<string, unknown> = {};
  try { prod = JSON.parse(prodJson) || {}; } catch { return null; } // malformed prod blob → don't apply
  try { local = JSON.parse(stagingJson || "{}") || {}; } catch { /* treat as empty */ }
  const prodFlags = { ...(prod.flags as Record<string, unknown> | undefined ?? {}) };
  const localFlags = (local.flags as Record<string, unknown> | undefined) ?? {};
  for (const k of KEEP_LOCAL_FLAGS) {
    if (k in localFlags) prodFlags[k] = localFlags[k];
    else delete prodFlags[k]; // staging never set it → let staging's code defaults rule
  }
  const out: Record<string, unknown> = { ...prod, flags: prodFlags };
  // The concurrency governor's master switch is a staging call-test toggle (like the flags above):
  // mirror prod's tuning numbers, but keep staging's own `enabled` so a test in progress isn't
  // flipped back off every 60s. Everything else in the block flows from prod.
  const prodConc = prod.concurrency as Record<string, unknown> | undefined;
  const localConc = local.concurrency as Record<string, unknown> | undefined;
  if (prodConc && localConc && "enabled" in localConc) out.concurrency = { ...prodConc, enabled: localConc.enabled };
  return JSON.stringify(out);
}

/** Prod's plan ladder with staging's own Stripe publish artifacts preserved. Exported for tests. */
export function mergePlansBlob(prodJson: string | null, stagingJson: string | null): string | null {
  if (prodJson == null) return null;
  let prod: Record<string, any>; let local: Record<string, any> = {};
  try { prod = JSON.parse(prodJson) || {}; } catch { return null; }
  try { local = JSON.parse(stagingJson || "{}") || {}; } catch { /* empty */ }
  const localTiers = new Map<string, any>(((local.tiers as any[]) ?? []).map((t) => [t.key, t]));
  prod.tiers = ((prod.tiers as any[]) ?? []).map((t) => {
    const mine = localTiers.get(t.key);
    const out = { ...t };
    for (const k of TIER_LOCAL_KEYS) out[k] = mine?.[k] ?? null;
    return out;
  });
  const localBundles = new Map<number, any>(((local.payg?.bundles as any[]) ?? []).map((b) => [b.checks, b]));
  if (prod.payg) {
    prod.payg = {
      ...prod.payg,
      stripeProductId: local.payg?.stripeProductId ?? null,
      bundles: ((prod.payg.bundles as any[]) ?? []).map((b) => {
        const mine = localBundles.get(b.checks);
        return { ...b, priceId: mine?.priceId ?? null, pubCents: mine?.pubCents ?? null };
      }),
    };
  }
  return JSON.stringify(prod);
}

const hash = (o: unknown) => createHash("sha1").update(JSON.stringify(o)).digest("hex");
let running = false;

export async function settingsSyncStatus() {
  let lastRun: unknown = null;
  try { lastRun = JSON.parse((await getSetting("settings_sync_last")) || "null"); } catch { /* none */ }
  const url = process.env.SETTINGS_SYNC_URL || process.env.STORE_SYNC_URL;
  const token = process.env.SETTINGS_SYNC_TOKEN || process.env.STORE_SYNC_TOKEN;
  return { enabled: !!(config.staging.on && url && token), running, lastRun };
}

/** Apply a prod export locally (staging). Exported so the tick and the tests share one code path. */
export async function applySettingsExport(exp: SettingsExport): Promise<{ changed: string[] }> {
  const changed: string[] = [];
  const mergedPolicy = mergePolicyBlob(exp.policy_json, await getSetting("policy_json"));
  if (mergedPolicy != null && mergedPolicy !== (await getSetting("policy_json"))) {
    await setSetting("policy_json", mergedPolicy); changed.push("policy_json");
  }
  const mergedPlans = mergePlansBlob(exp.vt_plans, await getSetting("vt_plans"));
  if (mergedPlans != null && mergedPlans !== (await getSetting("vt_plans"))) {
    await setSetting("vt_plans", mergedPlans); changed.push("vt_plans");
  }
  for (const key of ["support_banner_en", "support_banner_es"] as const) {
    const v = exp[key];
    if (v != null && v !== (await getSetting(key))) { await setSetting(key, v); changed.push(key); }
  }
  if (Array.isArray(exp.statuses) && exp.statuses.length) {
    const mine = await db.select().from(statuses);
    const mineByKey = new Map(mine.map((s) => [s.key, s]));
    for (const s of exp.statuses) {
      const cur = mineByKey.get(s.key);
      // Coerce to the schema's non-null columns (defaults mirror bootstrap's).
      const fields = { emoji: s.emoji ?? "•", label: s.label ?? s.key, tone: s.tone ?? "unk", color: s.color ?? "#9CA3AF", note: s.note, sort: s.sort ?? 0 };
      if (!cur) { await db.insert(statuses).values({ key: s.key, ...fields }); changed.push("status:" + s.key); }
      else if (hash(fields) !== hash({ emoji: cur.emoji, label: cur.label, tone: cur.tone, color: cur.color, note: cur.note, sort: cur.sort })) {
        await db.update(statuses).set(fields).where(eq(statuses.key, s.key)); changed.push("status:" + s.key);
      }
    }
    // Prod is the truth: keys the owner deleted on prod disappear here too (export is the full table).
    const prodKeys = new Set(exp.statuses.map((s) => s.key));
    for (const s of mine) if (!prodKeys.has(s.key)) { await db.delete(statuses).where(eq(statuses.key, s.key)); changed.push("status-del:" + s.key); }
  }
  return { changed };
}

/** The minute tick (staging only): pull prod's export, apply if anything moved. */
export async function settingsSyncTick(): Promise<void> {
  if (!config.staging.on || running) return; // ONLY staging pulls; prod never runs this
  const url = process.env.SETTINGS_SYNC_URL || process.env.STORE_SYNC_URL;
  const token = process.env.SETTINGS_SYNC_TOKEN || process.env.STORE_SYNC_TOKEN;
  if (!url || !token) return;
  running = true;
  const stamp = (o: object) => setSetting("settings_sync_last", JSON.stringify({ at: Date.now(), ...o }));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    let exp: SettingsExport;
    try {
      const r = await fetch(url.replace(/\/$/, "") + "/api/settings-sync/export", {
        headers: { "x-admin-token": token, "user-agent": "check-settings-sync" }, signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`prod export ${r.status}`);
      exp = (await r.json()) as SettingsExport;
    } finally { clearTimeout(timer); }
    const h = hash(exp);
    if ((await getSetting("settings_sync_state")) === h) { await stamp({ ok: true, changed: [] }); return; }
    const { changed } = await applySettingsExport(exp);
    await setSetting("settings_sync_state", h);
    await stamp({ ok: true, changed });
    if (changed.length) console.log(`[settings-sync] applied from prod: ${changed.join(", ")}`);
  } catch (e) {
    await stamp({ ok: false, error: String(e).slice(0, 200) }).catch(() => {});
    console.error("settings-sync:", e);
  } finally { running = false; }
}

// Settings and operations: the master toggles, the GTM checklist, the sync pipes, the concurrency
// governor, the global calling pause, shipping the Admin screens, and the watchdog/backup view.

import type { Hono } from "hono";
import { existsSync, mkdirSync, readFileSync, readdirSync as fsReaddirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { allSettings, getSetting, setSetting } from "../db/settings";
import { getCreditStatus } from "../calls/service";
import { applyStoreSync, syncStatus } from "../store-sync";
import { buildSettingsExport, settingsSyncStatus } from "../settings-sync";
import { concurrencyStatus } from "../calls/concurrency";
import { backupNow, backupState, watchdogState } from "../ops-watch";
import { isCallingPaused, setCallingPaused, spendTodayCents } from "../redis";
import { page } from "./shared-helpers";

// ---- Admin UI decoupled ship path (owner 2026-07-15) ----
// THE Admin (admin.checkitforme.com) is served by THIS prod service (the DB is SQLite on this
// service's volume — no second service can read it), but its UI no longer waits on a full
// staging→main promote: scripts/ship-admin.sh POSTs public/app.html straight here and the file
// lands on the persistent volume, served immediately. The repo copy bundled at the last promote
// stays the FALLBACK — a missing/corrupt override can only ever degrade to "older but working".
// Shared server code still ships ONLY via the normal promote train; this moves the admin UI alone.
export const ADMIN_UI_DIR = join(process.env.RAILWAY_VOLUME_MOUNT_PATH || ".", "admin-ui");

export const ADMIN_UI_LIVE = join(ADMIN_UI_DIR, "app.html");

export const ADMIN_UI_META = join(ADMIN_UI_DIR, "meta.json");

export const ADMIN_UI_KEEP = 5;
 // archived previous versions for rollback
/** The admin shell: volume override if present + sane, else the repo copy from the last promote. */
export function adminUiHtml(): string {
  try {
    const html = readFileSync(ADMIN_UI_LIVE, "utf8");
    if (html.includes("</html>") && html.includes("grpnav")) return html; // sanity: complete + really the admin shell
  } catch { /* no override staged — bundled copy serves */ }
  return page("app.html");
}

// ---- Go-to-Market launch checklist (owner + agents track go-live readiness) ----
// Persisted as one JSON blob in settings ("gtm_checklist"), seeded on first read. The admin renders it
// with area (backend/frontend/ops) + agent filters; each item is a status the owner ticks off. The
// frontend owns the edits and POSTs the full list back — race-safe enough for a single operator.
export const GTM_SEED: { id: string; title: string; detail: string; area: "backend" | "frontend" | "ops"; agent: string; critical: boolean; status: "todo" | "doing" | "done" }[] = [
  { id: "support-agent", title: "Customer-service agent on the site", detail: "A support bot users can talk to on the front end; reads the ReadMe to answer.", area: "backend", agent: "support", critical: true, status: "todo" },
  { id: "readme-copy", title: "Copy agent owns + fully updates the ReadMe", detail: "Spin up a copy agent with access to the ReadMe repo (+ Fungibles); fully write/polish the Check ReadMe. Solve the cross-repo access.", area: "ops", agent: "copy", critical: true, status: "todo" },
  { id: "discord-support", title: "Discord support agent + FAQ routing (Helicone)", detail: "Working Discord; same support agent. Cheap-model FAQ from the ReadMe → escalate to a smart model → ticket to a support email if unresolved.", area: "backend", agent: "discord", critical: true, status: "todo" },
  { id: "alerts-forms", title: "Every alert form works end-to-end", detail: "Email/SMS restock alerts actually send; branded email; Twilio A2P 10DLC live for texts; user can view/edit their email + cell in My Checks.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "zones-test", title: "Zones tested at scale", detail: "Call many stores at once and watch the combined multi-store report render correctly.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "store-request-form", title: "Store-request form lands in the backend", detail: "A store submitted from the site shows up in the admin queue.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "referrals", title: "Refer-a-friend works + is tracked", detail: "Track who referred whom; both parties actually receive their free checks, everywhere a free check is promised.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "voice-rotation", title: "Workflows / persona / script + voice rotation", detail: "Rotate scripts and voices, confirm they work well, and lock the voice you like.", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "thrift-hobby-workflows", title: "Thrift + hobby call workflows built", detail: "Done and ready (gated off until launch, even for paid).", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "multibrand-scripts", title: "One Piece / NeeDoh / Topps NBA call scripts", detail: "Set up retailer call scripts for these product types just like Pokémon — the agent calls and asks for One Piece TCG, NeeDoh, and Topps NBA at the right stores.", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "paid-plans-e2e", title: "Paid plans — full real-card end-to-end test", detail: "Sign up with a real credit card and confirm the whole flow: checkout → Stripe → entitlement → credits.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "site-paths-tested", title: "Every website path tested pre-launch", detail: "Walk every page/flow and confirm it behaves exactly as built.", area: "frontend", agent: "website", critical: true, status: "todo" },
  { id: "copy-color-sweep", title: "Copy sweep + product-page colors", detail: "Copy reads well everywhere; product-page colors render right per brand (Pokémon vs NeeDoh, etc.).", area: "frontend", agent: "copy", critical: true, status: "todo" },
  { id: "multi-brand-workflows", title: "Non-Pokémon call workflows", detail: "Workflows set up so the agent can call and ask for Topps NBA, One Piece, etc. — not just Pokémon.", area: "ops", agent: "data", critical: true, status: "todo" },
  { id: "discord-plan", title: "Discord community set up + planned", detail: "Free area vs. flagged paid-customer community; channel plan (share scores, talk stores). Stand up a planning agent.", area: "ops", agent: "discord", critical: false, status: "todo" },
  { id: "spanish", title: "Spanish + live translation button", detail: "Confirm Spanish works and the translate button engages when a store speaks Spanish.", area: "frontend", agent: "website", critical: true, status: "todo" },
  { id: "statuses-new", title: "New call statuses surface in Admin", detail: "When a never-seen status comes back, it shows up in the Admin statuses area so we can build it into behavior.", area: "backend", agent: "admin", critical: false, status: "todo" },
  { id: "hobby-thrift-data", title: "Populate hobby + thrift stores nationwide", detail: "Data: hobby stores with open/close times; a nationwide thrift + hobby search (like the main-chain sweep) to populate many more.", area: "backend", agent: "data", critical: false, status: "todo" },
  { id: "x-autopost", title: "X account + daily auto-posting agent", detail: "Create the X account; an agent posts cool info daily. Keep the business hands-free.", area: "ops", agent: "social", critical: false, status: "todo" },
  { id: "store-data-one-source", title: "Store data: one dataset everywhere", detail: "Staging is the curation home; curated store data auto-syncs to prod (field-scoped, diffs-only). LIVE: STORE_SYNC set, full catch-up done, a chain edit proven flowing staging to prod.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "admin-redesign-reports", title: "Admin redesign — reports tell a story", detail: "Audit every report/card for performance, necessity, and placement: there are so many it feels like false positives. Cut or merge the noise, regroup what's left into one beginning-to-end story of the business (pulse -> calls -> money -> growth). Owner runs 5 Design comps off docs/design/STYLE_GUIDE.md; Design delivers comps, Admin implements.", area: "frontend", agent: "design", critical: false, status: "todo" },
  { id: "repo-split", title: "Extract Check into its own repo", detail: "Done 2026-07 — you are in it (nocodehandsfree/checkitforme, branches staging/main). Full history kept.", area: "ops", agent: "devops", critical: false, status: "done" },
  { id: "db-backups", title: "Database backups + tested restore", detail: "Nightly encrypted DB backup to R2 (AES-256-GCM) on both envs; restore SCRIPT proven end to end (integrity check + row counts). scripts/restore-backup.mjs.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "error-monitoring", title: "Error monitoring + alerting on prod", detail: "Cross-env watchdog (staging and prod ping each other, 3 misses = owner email+SMS) + crash guards that alert. LIVE both envs.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "posthog-live", title: "PostHog wired + verified capturing", detail: "Server-side snippet on every page; keys set both envs; capture VERIFIED live on all consumer domains + admin.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "helicone-live", title: "Helicone set up + verified", detail: "Every model call routed through the Helicone gateway with per-job tags; VERIFIED logging in the dashboard.", area: "backend", agent: "devops", critical: false, status: "done" },
  { id: "legal-consent", title: "Legal pages + call-recording consent", detail: "Real ToS + Privacy (the /p/privacy page currently 404s an asset), plus a reviewed consent/disclosure story for AI calls + recordings (TCPA / two-party states). Gates public marketing.", area: "ops", agent: "owner", critical: true, status: "todo" },
  { id: "admin-redesign", title: "Admin matches the website design", detail: "Restyle app.html to the approved website comp/tokens (one design system) — after Design finishes the comp↔site gap analysis.", area: "frontend", agent: "design", critical: false, status: "todo" },
  { id: "deck-video", title: "Finalize the check deck + share video", detail: "Not critical for launch.", area: "ops", agent: "owner", critical: false, status: "todo" },
  { id: "analytics", title: "Analytics ready on production", detail: "The non-GA analytics tool (API key already set) is live on prod tracking every page, so we can see paths + optimize after launch.", area: "backend", agent: "devops", critical: true, status: "todo" },
  // DevOps-surfaced items (my lane) —
  { id: "cheap-lane-wiring", title: "Move leftover call paths onto the cheap bridge lane", detail: "Scheduled checks, zone fires, admin call-now, and the /pub/check fallback still ride the pricey direct-agent path. Wiring, not a build — straight cost cut. (COST_MODEL Part II §2)", area: "backend", agent: "devops", critical: false, status: "todo" },
  { id: "price-editor", title: "Admin price-editor → Stripe", detail: "Change any monthly price / PAYG rate in admin and push straight to Stripe, no code change.", area: "backend", agent: "devops", critical: false, status: "todo" },
  { id: "money-endpoint-guard", title: "Money-endpoint rate limits + security headers", detail: "Per-IP limits on the four call-placing endpoints + baseline security headers. Shipped.", area: "backend", agent: "devops", critical: true, status: "done" },
];

export function register(app: Hono) {
  // ---- Ops (admin-gated by the /api/* wall): watchdog + backup visibility, manual backup trigger ----
  app.get("/api/ops/status", (c) => c.json({ env: config.staging.on ? "staging" : "production", watchdog: watchdogState(), backup: backupState() }));

  app.post("/api/ops/backup-now", async (c) => c.json(await backupNow()));

  // ---- Admin UI ship path (see adminUiHtml above). All under the /api/* admin wall. ----
  // Deploy: raw text/html body = the new app.html. Atomic (tmp + rename); the outgoing version is
  // archived for rollback (last 5 kept). x-commit header stamps provenance into meta.json.
  app.post("/api/admin/ui-deploy", async (c) => {
    const html = await c.req.text();
    if (html.length > 8_000_000) return c.json({ error: "too_large" }, 413);
    if (!html.includes("</html>") || !html.includes("grpnav")) return c.json({ error: "not_the_admin_shell", hint: "body must be the complete public/app.html" }, 400);
    mkdirSync(ADMIN_UI_DIR, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    if (existsSync(ADMIN_UI_LIVE)) renameSync(ADMIN_UI_LIVE, join(ADMIN_UI_DIR, `app.${now}.html`));
    const archives = fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort();
    for (const f of archives.slice(0, Math.max(0, archives.length - ADMIN_UI_KEEP))) unlinkSync(join(ADMIN_UI_DIR, f));
    const tmp = join(ADMIN_UI_DIR, "app.html.tmp");
    writeFileSync(tmp, html);
    renameSync(tmp, ADMIN_UI_LIVE); // atomic swap — in-flight requests see old or new, never partial
    const meta = { commit: c.req.header("x-commit") || null, at: now, bytes: html.length };
    writeFileSync(ADMIN_UI_META, JSON.stringify(meta));
    return c.json({ ok: true, ...meta });
  });

  // Roll back to the most recently archived version (repeatable while archives remain).
  app.post("/api/admin/ui-rollback", async (c) => {
    const archives = existsSync(ADMIN_UI_DIR) ? fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort() : [];
    const prev = archives[archives.length - 1];
    if (!prev) return c.json({ error: "nothing_to_roll_back_to", hint: "no archived versions — the bundled repo copy is what serves without an override" }, 404);
    renameSync(join(ADMIN_UI_DIR, prev), ADMIN_UI_LIVE);
    writeFileSync(ADMIN_UI_META, JSON.stringify({ commit: null, at: Math.floor(Date.now() / 1000), bytes: readFileSync(ADMIN_UI_LIVE, "utf8").length, rolledBackFrom: prev }));
    return c.json({ ok: true, restored: prev });
  });

  // What's live: override (with provenance) or the bundled repo copy.
  app.get("/api/admin/ui-version", async (c) => {
    const override = existsSync(ADMIN_UI_LIVE);
    let meta: Record<string, unknown> | null = null;
    try { meta = JSON.parse(readFileSync(ADMIN_UI_META, "utf8")); } catch { /* no meta */ }
    const archives = existsSync(ADMIN_UI_DIR) ? fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort() : [];
    return c.json({ source: override ? "override" : "bundled", meta: override ? meta : null, archived: archives.length });
  });

  // ---- Settings (master toggles) ----
  app.get("/api/settings", async (c) => c.json(await allSettings()));

  app.patch("/api/settings", async (c) => {
    const b = await c.req.json();
    if (typeof b.voicemailHangup === "boolean") await setSetting("voicemail_hangup", String(b.voicemailHangup));
    if (b.creditLimit !== undefined) await setSetting("el_credit_limit", String(Math.max(0, Number(b.creditLimit) || 0)));
    if (b.openerVariants !== undefined) await setSetting("vt_opener_variants", String(b.openerVariants || ""));
    if (b.openerLibrary !== undefined) await setSetting("vt_opener_library", String(b.openerLibrary || ""));
    if (b.voicePool !== undefined) await setSetting("vt_voice_pool", String(b.voicePool || ""));
    // Voice → Designer library + cascade assignment. The "Save workflow"/"Save persona" steps write
    // these; the call bridge resolves a store's workflow as store → chain → default and applies it.
    if (b.personas !== undefined) await setSetting("vt_personas", String(b.personas || ""));
    if (b.workflows !== undefined) await setSetting("vt_workflows", String(b.workflows || ""));
    if (b.defaultWorkflow !== undefined) await setSetting("vt_default_workflow", String(b.defaultWorkflow || ""));
    if (b.chainWorkflows !== undefined) await setSetting("vt_chain_workflows", String(b.chainWorkflows || ""));
    if (b.storeWorkflows !== undefined) await setSetting("vt_store_workflows", String(b.storeWorkflows || ""));
    // Listening navigation (owner 07-25): which chains fire their mapped steps when the recording
    // stops talking instead of on a stopwatch. "off" (default) | "all" | a comma list of chain names.
    // Admin owns this value — never set it behind Admin's back.
    if (b.listenNav !== undefined) await setSetting("listen_nav", String(b.listenNav || "off").trim());
    // Learned-nav mirror (owner 07-26): staging is where we learn a route now, so this pull from
    // production can be switched OFF for a mapping session. "on" (default) | "off".
    if (b.learnedSync !== undefined) await setSetting("learned_sync", String(b.learnedSync || "on").trim().toLowerCase());
    return c.json(await allSettings());
  });

  // ---- ElevenLabs credit status (live if the key has user_read, else estimated) ----
  app.get("/api/credits", async (c) => c.json(await getCreditStatus()));

  // ---- Store-data sync (one dataset): staging pushes curated store data here; see src/store-sync.ts ----
  app.post("/api/store-sync", async (c) => {
    if (config.staging.on) return c.json({ error: "staging_is_the_source" }, 400); // only prod receives
    const p = await c.req.json().catch(() => null);
    if (!p) return c.json({ error: "bad_payload" }, 400);
    try { return c.json({ ok: true, ...(await applyStoreSync(p)) }); }
    catch (e) { return c.json({ error: String((e as { code?: string }).code || e).slice(0, 80) }, (e as { code?: string }).code === "batch_too_large" ? 413 : 500); }
  });

  app.get("/api/store-sync/status", async (c) => c.json(await syncStatus()));

  // Settings sync (src/settings-sync.ts): PROD serves this read-only export; STAGING pulls it every
  // minute and mirrors the owner's Admin edits (policy/plans/banners/statuses — field-scoped).
  // One-way by construction: this endpoint is the only prod side, and it writes nothing.
  app.get("/api/settings-sync/export", async (c) => c.json(await buildSettingsExport()));

  app.get("/api/settings-sync/status", async (c) => c.json(await settingsSyncStatus()));

  // Call concurrency governor readout (Admin + the Phase-2 load test): live pool utilization,
  // per-account used/cap, the interactive reserve, and the per-user cap. Enabled reflects the flag.
  app.get("/api/concurrency", async (c) => c.json(await concurrencyStatus()));

  app.get("/api/gtm", async (c) => {
    let items = GTM_SEED;
    try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
    catch { /* fall back to seed */ }
    // FINISHED WORK IS NEVER LOST: a completed default (seed status "done") that's missing from the saved
    // list is auto-restored here — as done — and persisted. So a done item always shows on the board as
    // Done and can NEVER sit in the dismissible "missing" bar (where an X could bury it). This is the fix
    // for "completed tasks weren't showing as done, and clicking X felt like it lost finished work."
    const have0 = new Set(items.map((i: { id?: string }) => i.id));
    const healed = GTM_SEED.filter((s) => s.status === "done" && !have0.has(s.id));
    if (healed.length) { items = [...items, ...healed]; await setSetting("gtm_checklist", JSON.stringify({ items, updatedAt: Date.now() })); }
    // Report only NOT-done seeded defaults still missing (genuine deletes the owner may restore/dismiss).
    // Items the owner DISMISSED stay gone. Done items are handled above, never offered here.
    const dismissed = new Set<string>(JSON.parse((await getSetting("gtm_dismissed_defaults")) || "[]"));
    const have = new Set(items.map((i: { id?: string }) => i.id));
    const missingDefaults = GTM_SEED.filter((s) => s.status !== "done" && !have.has(s.id) && !dismissed.has(s.id)).map((s) => ({ id: s.id, title: s.title }));
    return c.json({ items, missingDefaults });
  });

  // X on the restore bar: mark the currently-missing defaults as intentionally gone — the bar never
  // offers them again. An explicit restore-defaults still resurrects them (it ignores dismissals).
  app.post("/api/gtm/dismiss-defaults", async (c) => {
    let items: typeof GTM_SEED = GTM_SEED;
    try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
    catch { /* seed */ }
    const have = new Set(items.map((i) => i.id));
    const prev = new Set<string>(JSON.parse((await getSetting("gtm_dismissed_defaults")) || "[]"));
    // NEVER dismiss a COMPLETED default — finished work can't be thrown away by the X. Only not-done
    // missing defaults are dismissable (done ones are auto-restored by GET /api/gtm anyway).
    for (const s of GTM_SEED) if (s.status !== "done" && !have.has(s.id)) prev.add(s.id);
    await setSetting("gtm_dismissed_defaults", JSON.stringify([...prev]));
    return c.json({ ok: true, dismissed: prev.size });
  });

  // One-tap restore: re-append any seeded defaults missing from the saved list, KEEPING the seed's real
  // status (a completed default comes back as done, not reset to todo — otherwise Restore would erase
  // that it was finished).
  app.post("/api/gtm/restore-defaults", async (c) => {
    let items: typeof GTM_SEED = GTM_SEED;
    try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
    catch { /* seed */ }
    const have = new Set(items.map((i) => i.id));
    const restored = GTM_SEED.filter((s) => !have.has(s.id));
    const next = [...items, ...restored];
    await setSetting("gtm_checklist", JSON.stringify({ items: next, updatedAt: Date.now() }));
    return c.json({ ok: true, restored: restored.length, items: next });
  });

  app.post("/api/gtm", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (!Array.isArray(b.items)) return c.json({ error: "items[] required" }, 400);
    // Keep the shape tight so a bad client can't bloat the blob.
    const clean = b.items.slice(0, 300).map((it: Record<string, unknown>) => ({
      id: String(it.id || crypto.randomUUID()).slice(0, 60),
      title: String(it.title || "").slice(0, 200),
      detail: String(it.detail || "").slice(0, 600),
      area: (["backend", "frontend", "ops"] as const).includes(it.area as never) ? it.area : "ops",
      agent: String(it.agent || "owner").slice(0, 24),
      critical: !!it.critical,
      status: (["todo", "doing", "done"] as const).includes(it.status as never) ? it.status : "todo",
    })).filter((it: { title: string }) => it.title);
    await setSetting("gtm_checklist", JSON.stringify({ items: clean, updatedAt: Date.now() }));
    return c.json({ ok: true, items: clean });
  });

  // ---- Global calling kill-switch (cost runaway protection) ----
  app.get("/api/admin/calling/status", async (c) => c.json({ paused: await isCallingPaused(), spendTodayCents: await spendTodayCents() }));

  app.post("/api/admin/calling/pause", async (c) => {
    const { paused } = await c.req.json().catch(() => ({}));
    await setCallingPaused(paused !== false); // default to pausing
    return c.json({ paused: await isCallingPaused() });
  });

  app.post("/api/admin/calling/resume", async (c) => { await setCallingPaused(false); return c.json({ paused: false }); });
}

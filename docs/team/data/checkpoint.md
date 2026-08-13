# DATA — checkpoint (current state)

> System: store/chain/product data on both envs + the sync pipes, the importer, AND backend/infra/
> deploys/promotes (the old ops lane, merged 2026-07-22). `src/voice/` is FROZEN. The permanent LAWS
> (four pipes, ONE DIALABLE RULE, never-sync fields, map-on-PROD) live in `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Gates (all live)
- 07-22: path locks · copy · sprawl · compute · build stamp + verify-live · section INDEX · handoff
  nudge. 07-29: LOOK gate (`public/app.html` edits blocked until `render-comps.ts` really rendered —
  never hand-touch `.claude/state/comp-rendered`) · NAV gate (Admin nav frozen to
  `.claude/nav-allowlist`, grows only on the owner's word, same commit) · turn 1 recites the box.
  08-02: src/ 800-line code cap (below).
- Owner-approved locks: src/voice/** · public/checkit.html · src/calls/recipe.ts · src/calls/tree-learn.ts
  · data/stores-master/** · both intel jsons (DB stays the live store source).

## Data — in progress / open
- **07-24 TARGET NUMBERS DONE, both envs.** ⚠️ redsky `nearby_stores_v1` Akamai-blocks the sandbox
  IP after ~1 call; the store sitemap + `/sl/<slug>/<id>` route has no wall. Prod-first edits do NOT
  flow back (store-sync is staging→prod) — patch BOTH.
- **CLOSED-STORE RULE (owner, standing):** confirmed-closed = MUTED, never deleted — `active:false`
  + a `notes` line starting `CLOSED.` with date + proof (handoff.md §CORE PRINCIPLES 4).
- **⚠️ OPEN BUG (routed to site):** the small "Calling" chip does not stretch wide logos with logo_wide=true; `.callwho.widelogo` not winning.
- **07-22 shipped STAGING — promote wanted:** openHistEntry re-pulls the live logo (checkit.html).
- **7 kiosk chains need REAL numbers** (nophone both envs): H-E-B, Lucky, FoodMaxx, Metro Market, Stop & Shop, Pak N Save, Uwajimaya. Owner pulls from locators/Maps → DD → Mapper.
- **HOURS backfill PAUSED (owner resumes):** ~3,300 hourless. `handoffs/hours_needed_fresh.csv` → `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE).
- **Staging/prod count mismatch (STATE task):** quarantine wrote 105 prod, staging showed 33 — something re-imports staging retailers. Find WHO.
- Held back: Fry's Gilbert 102795 + Mariano's Westchester-IL 102842 (mapped) · Payless Foods Athens (no phone). Logos wanted: Habitat ReStore, Unique.

## Infra / deploys (old ops lane)
- **08-02 server.ts SPLIT — `claude/refactor-server-routes-zbi8kp`, PR #108 draft, NOT merged; the PM
  AUDIT HAS NOT RUN.** 7,381 → 452 lines + 21 area files in `src/routes/` (+README: task → file).
  Proven: 368 routes, same collision order (`check-route-order.mjs`) · 500 statements byte-identical
  (`check-bodies-identical.mjs`) · 177 routes asked of BOTH builds booted locally on fresh DBs, 0
  differences (`probe-routes.mjs`, re-run after cleanup, still 0). tsc stayed clean through TWO real
  breakages the probe caught — never trust it alone on a move. Deleted: 301 unused imports · a
  duplicate `/admin-login`+`/admin-logout` Hono never reached · 6 dead helpers. **Gate live: any
  `src/` file over 800 lines is refused;** service/mapgraph/bridge/navigator pinned at 08-02 size —
  ⚠️ merging FREEZES those four, warn the mapping rebuild first. RIDE WITH THE MERGE: stale pointers
  to the old file in SYSTEM_MANUAL (5 line numbers), GOTCHAS (5), ARCHITECTURE (1).
- **HANDED TO WEBBIE 08-02:** zone "Stop checking" on ONE store 404s (registered inside another
  handler, after a `return`); checkit.html's `catch(_){}` shows "Stopped" anyway, so the check keeps
  running and billing. Existing `user_cancelled` status covers it — do not add one.
- **Found, not built:** NO Admin button for pause-all-calling (the cost kill switch), back-up-now, or
  the help-chat banner · `stores/deactivate`+`stores/flag` duplicate `PATCH /api/retailers/:id`.
- **OPEN DECISION:** rules-out-of-comments is HALF DONE (voice-calls +6, site +6, admin +4, data +3,
  support 0 — only files the split touched). Finish in ONE pass or revert; partial is worst.
- Railway `httpLogs` = 1 entry/deployment → NO traffic evidence a route is live; add our own logging
  (minutes, not a blocker). No `src/` code index — copy `docs/design/INDEX.md`+`gen-index.mjs`.
- Two branches: staging + main(prod), both load-bearing. Promote = `bash scripts/promote.sh` (ONLY
  way prod code changes); Admin ships via ship-admin; settings mirror prod→staging LIVE (60s).
- **NEXT PROMOTE ride-along:** zone-lane fix (2080731) + rebuild build stamp — prod/admin read NOT-LIVE on verify-live until it lands.
- NOT DONE (ops): per-tier SMS caps · drop `/api/zones*` admin routes (keep engine) · price-editor →
  Stripe · transcript IDOR (shipped, flag off) · start-fresh (stats_since) at real-store launch.

## Traps (full list in handoff.md + GOTCHAS)
- ONE admin; staging URL = consumer site only. Map of surfaces FROZEN. Cloud-session git trap:
  `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- curl ONLY (Railway GraphQL, Stripe, Admin API) — python/WebFetch 403 through the proxy and it reads
  exactly like "the service is down". Bulk import DEACTIVATES stores absent from the payload.

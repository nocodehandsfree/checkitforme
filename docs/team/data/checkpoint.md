# DATA — checkpoint (current state)

> System: store/chain/product data on both envs + the sync pipes, the importer, AND backend/infra/
> deploys/promotes (the old ops lane, merged 2026-07-22). `src/voice/` is FROZEN. The permanent LAWS
> (four pipes, ONE DIALABLE RULE, never-sync fields, map-on-PROD) live in `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Gates (all live)
- 07-22: path locks (.claude/locks + .unlock) · copy · sprawl · compute · build stamp + verify-live ·
  section INDEX · handoff nudge. 07-29: ① LOOK gate — `public/app.html` edits blocked until a real
  render ran (`render-comps.ts` writes `.claude/state/comp-rendered`; never hand-touch it). ② NAV
  gate — Admin groups/tabs/sections frozen to `.claude/nav-allowlist`; grows only on the owner's
  word, same commit. ③ turn 1 injects "recite the box". 08-02: src/ 800-line code cap (below).
- Owner-approved locks: src/voice/** · public/checkit.html · src/calls/recipe.ts · src/calls/tree-learn.ts
  · data/stores-master/** · both intel jsons (DB stays the live store source).

## Data — in progress / open
- **07-24 TARGET NUMBERS DONE, both envs** (1,746 rows carry `externalStoreId` bar one). ⚠️ redsky
  `nearby_stores_v1` Akamai-blocks the sandbox IP after ~1 call; the store sitemap + `/sl/<slug>/<id>`
  route has no wall. Prod-first edits do NOT flow back (store-sync is staging→prod) — patch BOTH.
- **07-24 CLOSED-STORE RULE (owner, standing):** a confirmed-closed store is MUTED, never deleted —
  `active:false` + a `notes` line starting `CLOSED.` with date + proof (handoff.md §CORE PRINCIPLES 4).
- **⚠️ OPEN BUG (routed to site lane):** the small "Calling" chip does not stretch wide logos with
  logo_wide=true (~15px crushed); `.callwho.widelogo` not winning.
- **07-22 shipped STAGING — promote wanted:** openHistEntry re-pulls the live logo, so a reopened
  old check shows the current one (checkit.html).
- **7 kiosk chains need REAL numbers** (nophone both envs): H-E-B, Lucky, FoodMaxx, Metro Market, Stop
  & Shop, Pak N Save, Uwajimaya. Owner pulls from locators/Maps → DD ingests → Mapper finishes.
- **HOURS backfill PAUSED (owner resumes):** ~3,300 hourless. `handoffs/hours_needed_fresh.csv` →
  owner Googles → `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE).
- **Staging/prod count mismatch (STATE task):** quarantine wrote 105 prod, staging showed 33 —
  something re-imports staging retailers. Find WHO.
- Held back: Fry's Gilbert 102795 + Mariano's Westchester-IL 102842 (mapped) · Payless Foods Athens
  (no phone). Logos wanted: Habitat ReStore, Unique.

## Infra / deploys (old ops lane)
- **08-02 server.ts SPLIT — branch `claude/refactor-server-routes-zbi8kp`, NOT merged (owner's live
  test day; PM audits first).** 7,381 → 452 lines + 21 area files in `src/routes/` + `README.md`
  (task → file). Zero behaviour change, proven three ways: same 368 routes in the same collision
  order (`check-route-order.mjs`), all 500 statements byte-identical (`check-bodies-identical.mjs`),
  177 routes probed on two locally booted builds, 0 differences (`probe-routes.mjs`). Deleted: 301
  unused imports · a duplicate `/admin-login`+`/admin-logout` pair Hono never reached · 4 unused
  helpers. **New push gate: any `src/` file over 800 lines is refused;** service/mapgraph/bridge/
  navigator are pinned at their 08-02 sizes — may shrink, never grow.
- **FOUND, NOT FIXED (behaviour change → owner's word):** `POST /app/zones/run/:runId/stop-one` sits
  inside another handler after a `return`, so it is never registered — stopping ONE store in a zone
  run 404s. Pre-existing; the split preserved it exactly.
- Two branches: staging + main(prod) — both load-bearing, never delete. Promote = `bash
  scripts/promote.sh` (ONLY way prod code changes). Admin ships via ship-admin. Settings mirror
  prod→staging LIVE (60s; `src/settings-sync.ts`). Launch gate = `bash scripts/launch-gate.sh`.
- **NEXT PROMOTE ride-along:** zone-lane fix (2080731) + the rebuild build stamp — prod/admin read
  NOT-LIVE on verify-live until it lands (queued: `first-promote-after-rebuild`).
- NOT DONE (ops): per-tier SMS caps · drop `/api/zones*` admin routes (keep engine) · price-editor →
  Stripe · transcript IDOR (shipped, flag off) · start-fresh (stats_since) at real-store launch.

## Traps (full list in handoff.md + GOTCHAS)
- ONE admin (admin.checkitforme.com); staging URL = consumer site only. Map of surfaces FROZEN.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- curl ONLY (Railway GraphQL, Stripe, Admin API) — python/WebFetch 403 through the proxy and it reads
  exactly like "the service is down". Bulk import DEACTIVATES stores absent from the payload.

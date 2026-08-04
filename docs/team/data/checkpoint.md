# DATA — checkpoint (current state)

> System: store/chain/product data on both envs + the sync pipes, the importer, AND backend/infra/
> deploys/promotes (the old ops lane, merged 2026-07-22). `src/voice/` is FROZEN. The permanent LAWS
> (four pipes, ONE DIALABLE RULE, never-sync fields, map-on-PROD) live in `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Gates (07-22 rebuild, all live · +3 on 07-29, owner's agent-quality pass, PR branch)
- 07-22: path locks (.claude/locks + .unlock) · copy · sprawl · compute · build stamp + verify-live ·
  section INDEX · handoff nudge. Phases 4/5/6 done 07-23.
- 07-29: ① LOOK gate — `public/app.html` edits blocked until a real render ran (`render-comps.ts`
  writes `.claude/state/comp-rendered`; never hand-touch it). ② NAV gate — Admin groups/tabs/sections
  frozen to `.claude/nav-allowlist`; grows only on the owner's word, same commit. ③ turn 1 injects
  "recite the box". Plus AGENT_RULES 25 (write docs for a stranger) + build-on-brand's dead
  `admin-preview.mjs` render commands fixed to `render-comps.ts`.
- Owner-approved locks: src/voice/** · public/checkit.html · src/calls/recipe.ts · src/calls/tree-learn.ts
  · data/stores-master/** · both intel jsons (DB stays the live store source).

## Data — in progress / open
- **07-24 TARGET STORE NUMBERS BACKFILLED — 72 rows, BOTH envs LIVE.** Every Target row nationally
  (1,746) now carries `externalStoreId` except one. Source: Target's own store sitemap
  (`target.com/sitemap_stores-index.xml.gz` → `/sl/<slug>/<id>` pages carry address + phone in the
  page JSON). Matched on phone AND normalized address; 71/72 agreed on both, 1 on phone (LA Mid City
  3294, comma inside the address line). Zero dupes, zero collisions with the 1,673 numbers already
  held. Applied via `PATCH /api/retailers/:id` to PROD then STAGING (store-sync is staging→prod ONLY,
  so prod-first edits do NOT flow back — patch both). CA split: 48 of 323 are ≥3000 (shape B).
  ⚠️ redsky `nearby_stores_v1` works for ~1 call then Akamai-blocks the sandbox IP for hours — the
  sitemap + `/sl/` page route has no such wall (347 pages pulled back-to-back, zero blocks).
- **07-24 CLOSED-STORE RULE (owner, standing):** a confirmed-closed store gets MUTED, never deleted —
  `active:false` + a `notes` line starting `CLOSED.` with date + proof (full rule: handoff.md §CORE
  PRINCIPLES 4). First: retailer 106506 Target E Bayshore Rd — muted BOTH envs, gone from stores/near.
- **⚠️ OPEN BUG — CSS/site lane, not data:** the small "Calling" chip does NOT stretch wide logos even
  with logo_wide=true (~15px crushed). `.callwho.widelogo` not winning. **Routed to site lane.**
- **07-22 shipped STAGING — promote wanted:** openHistEntry re-pulls the live logo so a reopened old call shows the current one (checkit.html).
- **7 kiosk chains need REAL numbers** (nophone both envs): H-E-B, Lucky, FoodMaxx, Metro Market,
  Stop & Shop, Pak N Save, Uwajimaya. Owner pulls from locators/Maps pins → DD ingests → Mapper finishes.
- **HOURS backfill PAUSED (owner resumes):** ~3,300 hourless. `handoffs/hours_needed_fresh.csv` → owner
  Googles → `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE).
- **Staging/prod count mismatch (STATE task):** quarantine wrote 105 prod, staging showed 33 —
  something re-imports staging retailers. Find WHO.
- **08-04 repo cleanup round 1 (owner-approved, staging):** 32 unused files deleted — 23 scripts/archive
  one-offs (kept the 2 regenerators seed.ts/.gitignore name), 5 dead helpers, launch-readiness.html, 3 imported store lists.
- Held-back wrong numbers: Fry's Gilbert 102795 + Mariano's Westchester-IL 102842 (mapped) · Payless
  Foods Athens (no phone: mute/leave). Logos: Habitat ReStore, Unique (owner getting).

## Infra / deploys (old ops lane)
- Two branches: staging (`staging`) + prod (`main`) — both load-bearing, never delete. Promote =
  `bash scripts/promote.sh` (the ONLY way prod code changes; per-commit confirm). Admin ships via ship-admin.
- Settings mirror prod→staging LIVE (60s; `src/settings-sync.ts` — policy/vt_plans/statuses; zero
  overlap with store/learned pipes). Browser tests (the old launch gate) ARCHIVED 08-04, owner's ruling.
- **NEXT PROMOTE ride-along:** the zone-lane fix (2080731) + the rebuild build stamp — prod/admin show
  NOT-LIVE on verify-live until this promote (queued: `first-promote-after-rebuild`).
- NOT DONE (ops): per-tier SMS-cap enforcement · remove `/api/zones*` admin endpoints (keep engine) ·
  Admin price-editor → Stripe · transcript IDOR (backend shipped, flag off) · start-fresh (stats_since) at real-store launch.

## Traps (full list in handoff.md + GOTCHAS)
- ONE admin (admin.checkitforme.com); staging URL = consumer site only. Map of surfaces FROZEN.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- curl ONLY (Railway GraphQL, Stripe, Admin API) — python/WebFetch 403 through the sandbox proxy and it
  looks exactly like "the service is down". Bulk import DEACTIVATES stores absent from the payload — guard it.

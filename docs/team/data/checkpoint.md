# DATA — checkpoint (current state)

> System: store/chain/product data on both envs + the sync pipes + the importer + backend/infra/deploys/
> promotes (the old ops lane, merged 07-22). `src/voice/` is FROZEN. Permanent LAWS live in `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60. History is in git.

## Gates (all live) — 11 in `.claude/hooks/`; a gate IS a hook (owner 08-05: say "gate")
- Path locks (`.claude/locks` + `.unlock`) · copy · sprawl · compute · build stamp · section INDEX ·
  handoff nudge · LOOK gate (`app.html` blocked until `render-comps.ts` writes
  `.claude/state/comp-rendered`, never hand-touch it) · NAV gate (Admin nav frozen to
  `.claude/nav-allowlist`) · turn-1 "recite the box" · reply lock.
- Locked: src/voice/** · public/checkit.html · src/calls/recipe.ts · tree-learn.ts · data/stores-master/**
  · both intel jsons (the DB stays the live store source).

## Data — in progress / open
- **07-24 TARGET NUMBERS BACKFILLED, both envs.** All 1,746 rows carry `externalStoreId` bar one, off
  Target's sitemap, matched on phone AND address. Applied PROD **then** STAGING — store-sync is
  staging→prod ONLY, so prod-first edits never flow back. ⚠️ redsky Akamai-blocks us; the sitemap doesn't.
- **CLOSED-STORE RULE (owner, standing):** a confirmed-closed store is MUTED, never deleted —
  `active:false` + a `notes` line starting `CLOSED.` with date + proof (handoff.md §CORE PRINCIPLES 4).
- **⚠️ OPEN, site lane not data:** the small "Calling" chip doesn't stretch wide logos (~15px crushed);
  `.callwho.widelogo` not winning. **7 kiosk chains still need REAL numbers** (H-E-B, Lucky, FoodMaxx,
  Metro Market, Stop & Shop, Pak N Save, Uwajimaya). **HOURS backfill PAUSED**, ~3,300 hourless →
  `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE). **Staging/prod count mismatch:** quarantine
  wrote 105 prod, staging showed 33 — find WHO re-imports staging retailers.

## THE REPO + DOC SWEEP (owner-run, folder by folder, 08-05→08-06) — where it left off
- **Cut:** 32 unused files · `GET /check-lab` · the browser tests (`tests/e2e`, `playwright.config.ts`,
  `launch-gate.sh`, `e2e-local-boot.ts`), owner's ruling · 2 skills: `unblock-yourself` (Railway/token/
  test-account content moved INTO `ship-it`) and `known-problems` (already in GOTCHAS).
- **Docs re-verified against the CODE, never memory.** DONE: ROADMAP · COST_MODEL (+2 finance archived) ·
  new-chat-prompts · API_CONTRACT (Clerk is GONE; the auth block was wrong end to end) · GOTCHAS (220→184;
  logos serve from THIS repo, not Fungibles) · SYSTEM_MANUAL · AGENT_RULES · README · **WEBSITE_MANUAL →
  `WEBSITE_RULES.md` 185→83, ADMIN_MANUAL → `ADMIN_RULES.md` 239→89** (the live surface is the truth for
  looks: screen descriptions cut, only rules + behind-the-screen + endpoints kept). CLAUDE.md 100→88.
- **NEXT in order:** ARCHITECTURE (51) · REBUILD_PLAN (65) · STOCK_AND_GEO_API (72) · the 5 team
  `RULES.md` (4 of 5 are 5 lines, voice-calls 53) · the 76 task files. Unprovable items →
  `docs/tasks/doc-sweep-unknowns.md` (a line lands only after the owner agrees it is open).
- **08-06 pricing (owner's ladder):** Family $4.99/20 · Collector $9.99/45 · Hunter $24.99/120 ·
  Operator $59.99/300 = 25→22.2→20.8→20¢. plans.ts + COST_MODEL + SYSTEM_MANUAL updated; STAGING's
  `vt_plans` saved via `POST /api/admin/plans` (needs `payg` as an ARRAY or it 400s and would blank the
  bundles) and read back live. ⚠️ **Seeded defaults do NOT move a live site — `vt_plans` in each env's DB
  wins. PROD IS STILL ON THE OLD LADDER, waiting on the owner** (real money); Stripe Publish is separate.
- **08-06, the big one: `test-all.sh` was HIDING failures.** 30 of 63 lines end `; rm -f <db>` and a
  compound reports the LAST exit code, so a failing suite whose cleanup worked printed OK and CI went
  green over it. `run()` now splits cleanup off and keeps the suite's own code (proven both ways). It
  exposed `test-plans.ts` red for weeks, incl. a REAL drift: `exact_products` retired 07-15
  (`hobby_hunts` replaced it) and `store_holds` + `your_voice` OFF for EVERY account incl. comp (not
  built), while every doc claimed "all 8 ON for every paid tier". Docs fixed; suite 36/36.
## Infra / deploys (old ops lane) + traps (full list: handoff.md + GOTCHAS)
- staging + main(prod), both load-bearing, never delete. Promote = `promote.sh`, the ONLY way prod code
  changes; it REFUSES on a red GitHub mark (08-04) and `promote.sh check` dry-runs the gates. Admin ships
  via ship-admin. Settings mirror prod→staging LIVE (60s, `settings-sync.ts`: policy/vt_plans/statuses).
- **NEXT PROMOTE ride-along:** zone-lane fix (2080731) + the rebuild build stamp (prod/admin read NOT-LIVE
  until it) + **prod pricing**. NOT DONE: per-tier SMS caps · drop `/api/zones*` admin endpoints (keep the
  engine) · Admin price-editor → Stripe · transcript IDOR (shipped, flag off) · start-fresh at launch.
- ONE admin (admin.checkitforme.com); the staging URL is the consumer site only. Surfaces FROZEN.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- curl ONLY (Railway, Stripe, Admin API) — python/WebFetch 403 through the proxy and it looks exactly
  like "the service is down". Bulk import DEACTIVATES stores absent from the payload — guard it.

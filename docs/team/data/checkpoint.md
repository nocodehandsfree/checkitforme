# DATA — checkpoint (current state)

> System: store/chain/product data on both envs + the sync pipes, the importer, AND backend/infra/
> deploys/promotes (the old ops lane, merged 2026-07-22). `src/voice/` is FROZEN. The permanent LAWS
> (four pipes, ONE DIALABLE RULE, never-sync fields, map-on-PROD) live in `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## The rebuild landed (2026-07-22) — gates live + demoed blocking
- Path locks (.claude/locks + .unlock flow) · copy gate · sprawl gate · compute gate · build stamp +
  `scripts/verify-live.sh` · section INDEX · turn-counter handoff nudge. Phase 4/5/6 completion in flight.
- Owner-approved locks: src/voice/** · public/checkit.html · src/calls/recipe.ts · src/calls/tree-learn.ts
  · data/stores-master/** · both intel jsons (DB stays the live store source).

## Data — in progress / open
- **07-22 LOGO FLAGS both envs LIVE (curated):** logo_wide=true on 15 wide wordmarks; Publix
  logo_wide=false; TJ Maxx logo_dark=false; Walmart + Tom Thumb stay square. Via PATCH /api/chains/:id.
- **⚠️ OPEN BUG — CSS/site lane, not data:** the small "Calling" chip does NOT stretch wide logos even
  with logo_wide=true (~15px crushed). `.callwho.widelogo` not winning. **Routed to site lane.**
- **07-22 shipped STAGING — promote wanted:** openHistEntry re-pulls live store logo so a REOPENED old
  call shows the current logo (checkit.html). New checks already right on prod.
- **7 kiosk chains need REAL numbers** (nophone both envs): H-E-B, Lucky, FoodMaxx, Metro Market,
  Stop & Shop, Pak N Save, Uwajimaya. Owner pulls from locators/Maps pins → DD ingests → Mapper finishes.
- **HOURS backfill PAUSED (owner resumes):** ~3,300 hourless. `handoffs/hours_needed_fresh.csv` → owner
  Googles → `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE).
- **Staging/prod count mismatch (STATE task):** quarantine wrote 105 prod, staging showed 33 —
  something re-imports staging retailers. Find WHO.
- Chris alert hunt (read-only prod): NOTHING for +17188259888 — signup/opt-in never hit prod.
- Held-back wrong numbers: Fry's Gilbert 102795 + Mariano's Westchester-IL 102842 (mapped) · Payless
  Foods Athens (no phone: mute/leave). Logos: Habitat ReStore, Unique (owner getting).

## Infra / deploys (old ops lane)
- Two branches: staging (`staging`) + prod (`main`) — both load-bearing, never delete. Promote =
  `bash scripts/promote.sh` (the ONLY way prod code changes; per-commit confirm). Admin ships via ship-admin.
- Settings mirror prod→staging LIVE (60s; `src/settings-sync.ts` — policy/vt_plans/statuses; zero
  overlap with store/learned pipes). Launch gate = `bash scripts/launch-gate.sh` (local+staging; prod post-promote).
- **NEXT PROMOTE ride-along:** the zone-lane fix (2080731) + the rebuild build stamp — prod/admin show
  NOT-LIVE on verify-live until this promote (queued: `first-promote-after-rebuild`).
- NOT DONE (ops): per-tier SMS-cap enforcement · remove `/api/zones*` admin endpoints (keep engine) ·
  Admin price-editor → Stripe · transcript IDOR (backend shipped, flag off) · start-fresh (stats_since) at real-store launch.

## Traps (full list in handoff.md + GOTCHAS)
- ONE admin (admin.checkitforme.com); staging URL = consumer site only. Map of surfaces FROZEN.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- curl ONLY (Railway GraphQL, Stripe, Admin API) — python/WebFetch 403 through the sandbox proxy and it
  looks exactly like "the service is down". Bulk import DEACTIVATES stores absent from the payload — guard it.

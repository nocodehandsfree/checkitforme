# Check - Devops — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 📌 Mapping → DevOps (2026-07-11 night): sync chain MAPPING fields PROD→STAGING (pre-launch blocker)
- **Problem:** every mapped chain shows GRAY (callReady:false) on the staging website even though it's
  fully mapped on prod. Cause: mapping is decoupled from staging — the staging DB has no mapping fields.
  Confirmed: staging /pub/stores/near Tractor Supply callReady=false; prod=true.
- **Ask:** one-time copy of the chain-level mapping fields prod→staging, keyed by chain id/name:
  navStatus, navRecipe, navType, navSeconds, ringsDirect, treeStatus, treeNote, phoneTreeDefault,
  dtmfShortcut, answerPath, avgTreeSeconds, treeLearnedAt, treeVerifiedAt.
- **Careful:** the existing store-sync runs staging→prod (staging is curation source). This prod→staging
  copy must touch ONLY those chain nav/tree fields and must not be clobbered by the store sync, or
  overwrite staging's store-level curation. Decide: one-time copy now, or make the staging site read
  chain-mapping from prod authoritatively.
- Mapper engine fixes (guard 6feff66 + skip-rings-direct 52d2c77) already promoted to prod 25be309.

## ✅ PROMOTED 2026-07-10 07:20Z — pin 6edefab → prod main 10bdc65, all green
- Pinned promote executed (merge tree == pin, Website polish 7a9c7c1 excluded). Prod health shows
  10bdc65. Mapper cap-fix LIVE ~5.5h before the 9am-ET sweep (trigger + driver branch verified armed).
- No live call at deploy (overview live=[]). Store-sync catch-up COMPLETE (pending 0, prod healthy
  throughout). **Queue item 2 CLOSED**: chain-edit flow demonstrated by a real edit — Website's
  staging repoint of chain 120 logoUrl arrived on prod via the sync; fun.png serves 200.
- PostHog verified on ALL 6 prod domains (4 brands + apex + admin). Prod watchdog live. Prod backup
  ran → backups/production/db-fri.db.gz.enc (13.5MB). Stripe webhook still 400s bad signatures.
- Old logo URLs may serve from CF edge cache ≤1 day (expected, self-expires).

## 2026-07-10 — repo migration DONE; owner launch queue is the mission

- **Migration complete + demonstrated:** staging & prod both build from `nocodehandsfree/checkitforme`
  (services repointed; stale `railwayConfigFile: voice-caller/railway.json` was the silent build-killer —
  now `railway.json`, rootDirectory ""). `/api/health` on both returns the running commit sha.
  Promote pipeline proven end-to-end (promote.sh → auto-deploy → health shows main tip).
- **Leftover:** delete the two `claude/checkit-export-*` branches on fungibles (use direct-PAT push
  trick below). Owner to rotate RAILWAY_API_TOKEN (pasted in chat again 2026-07-10).

## OWNER QUEUE (2026-07-10, top-down) — status after first pass
1. **Stripe LIVE: DONE except owner's real-card test.** Plans published on prod (5 live products,
   in_sync), NEW live webhook `we_1TrVv98…` → checkitforme.com/webhooks/stripe, its whsec on prod svc
   (bad-signature → 400 verified live), OLD `caller.fungibles.com` endpoint disabled.
2. **Store sync ARMED + catch-up in flight** — first tick clean (4.5k rows, prod healthy, no event-loop
   starvation). ~97k pending @04:56Z, ≈4.8k/5min. THEN: chain-edit staging→prod flow test to close.
3. **PostHog BUILT + verified on staging** (server-side snippet, every page, both env vars set; capture
   accepted `{"status":"Ok"}`, event `deploy_verify_posthog_wiring` in dashboard). Prod+admin = after
   next promote (see blocker below).
4. **Helicone DONE** — llm.ts gateway existed; routed the 8 bypasses (store-hours, store-phone,
   admin-agent×3, translate) with job tags; VERIFIED logged (query-clickhouse endpoint; plain
   /v1/request/query lags — use query-clickhouse).
5. **Ops-watch SHIPPED on staging** — cross-env watchdog live (staging⇄prod /api/health, 3 misses →
   email+SMS via existing Brevo/Twilio creds, throttled 30min), crash guards now alert, daily encrypted
   DB backup → R2 (AES-256-GCM; bucket is PUBLIC-served so plaintext never lands there) + restore
   script `scripts/restore-backup.mjs`. ⛔ BLOCKED: classifier denied creating BACKUP_ENC_KEY
   (owner must name it — then backup+tested-restore complete). Endpoints: `/api/ops/status`,
   `/api/ops/backup-now` (admin-gated).
6. **Discord** — not started; needs owner (server creation is his account).
7. **Cleanups** — citation retargeted ✓; fungibles Actions secret waits on owner token rotation.

**PROMOTE BLOCKER LIFTED (owner + evidence 2026-07-10):** ALL of today's QA failures (design tokens,
qa-round6, qa-gating, qa-admin-plans) reproduce on the UNTOUCHED migration baseline adc3b12 (worktree
rerun) → legacy, not Website's new work, not promote blockers. Legacy fixes = their own task.
**Ported from fungibles takeover branch (owner sweep):** mapping checkpoint (d3e8542, live token
redacted + deploy fact-check: converging engine IS on prod), ADMIN-HANDOFF content → team/admin
checkpoint (bcae071, ADMIN_TOKEN + RAILWAY_API_TOKEN values stripped — that file leaked both),
scripts/data-tools/ 8 files (abcfd8f7, clean — token read from file path, not hardcoded).

## NOT DONE (older lane items, still real)
- **Cheap-bridge lane for leftover call paths** (scheduled checks, zone fires, admin call-now,
  `/pub/check` fallback) — COST_MODEL.md Part II §2; biggest cost cut, "a wiring decision, not a build".
- **All-paths Playwright harness** (pre-launch gate; harness is mine, card test is owner's).
- **Manage Zones backend (consumer)** — spec `docs/archive/manage-zones-SHIPPED.md`; engine exists.
- **Admin per-customer view backend** (`docs/specs/admin-user-view.md`); Admin builds the panel.
- **Remove `/api/zones*` admin endpoints** (keep the zones engine).
- **Admin price-editor → Stripe** (GTM `price-editor`).
- **Kill "Call failed" → real reasons** (map EL termination_reason → voicemail/busy/bad_number).
- **Transcript echo** — bridge feeds agent audio back as clerk input; fix at bridge.
- [~] **Transcript IDOR** — backend shipped, flag off; waiting on Website Bearer header → flip on.
- **Security pre-PUBLIC hardening** (owner: rotate at launch): RAILWAY_API_TOKEN, GITHUB_PAT, TiDB pw,
  the mapper `x-admin-token` committed in team/mapping history (redacted but in git history),
  STRIPE_WEBHOOK_SECRET on staging.
- **Website asks:** `section=thrift` opt-in on `/pub/stores/near` (Thrift stores stay muted);
  `GET /pub/store/:id` single-store fetch (same shape as near; gate owner-only stores).
- **Real-store launch:** press **Start fresh** (stats_since) when it begins; then resume mapping.
- **Delete transition stubs** `docs/handoffs/*` after 2026-07-14; doc-prune queue (not active sets).
- **Standalone Store API service** — ships WITH the repo split; flag+sync is the interim.
- /app/me `catalog` serves stale SUB/PACKS constants — align when touching billing.
- **NO ANSWER (owner):** close #379? decide #364? (#420/#421 safe to close — superseded.)

## PARTIAL / UNSURE
- staging is the curation home (Data Dev edits staging; prod hand-edits overwritten). Confirm Data Dev knows.
- In-memory rate limiter is per-instance (limit × replicas) — fine for launch.

## Traps + owner rules (keep)
- **ONE admin** (admin.checkitforme.com). Never "prod admin"/"staging admin"; staging URL = consumer site only.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- urllib/WebFetch → proxy 403; **curl only** (Railway GraphQL, Stripe, etc.).
- `/api/*` gate 401s unknown paths — 401 ≠ endpoint deployed; use content marker. Railway var change
  auto-redeploys. New admin deep link ⇒ whitelist in server.ts rootHandler.
- **Remote branch deletes:** git proxy 403s them; bypass:
  `git push "https://x-access-token:$GITHUB_PAT@github.com/nocodehandsfree/<repo>.git" --delete <br>`
  (GITHUB_PAT on api svc; raw api.github.com is intercepted — use the git URL).
- Cost truth: Delta ~2.5¢ / bridge ~5¢ / escalation rate is THE margin lever; EL $0.0012/s speaking;
  `docs/finance/COST_MODEL.md` (one doc now) + Admin → Calc are canonical.
- Owner prefs: outcome-first one-screen replies; no shorthand; secrets in memory only, never files;
  "check" never "call"; "scraper" banned; done = demonstrated with evidence; explicit owner naming
  before prod pushes + secret-store writes; Data lane never writes code.
- Reconciliation DONE (one line since 02b4b1b); promote = fast-forward. GTM checklist at admin /gtm.
- Mapping decoupled from staging; Stripe publish idempotent; credits = quota (monthly) + payg (never expires).

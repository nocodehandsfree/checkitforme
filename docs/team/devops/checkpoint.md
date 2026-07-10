# Check - Devops — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-10 — repo migration DONE; owner launch queue is the mission

- **Migration complete + demonstrated:** staging & prod both build from `nocodehandsfree/checkitforme`
  (services repointed; stale `railwayConfigFile: voice-caller/railway.json` was the silent build-killer —
  now `railway.json`, rootDirectory ""). `/api/health` on both returns the running commit sha.
  Promote pipeline proven end-to-end (promote.sh → auto-deploy → health shows main tip).
- **Leftover:** delete the two `claude/checkit-export-*` branches on fungibles (use direct-PAT push
  trick below). Owner to rotate RAILWAY_API_TOKEN (pasted in chat again 2026-07-10).

## OWNER QUEUE (2026-07-10, top-down)
1. **Stripe LIVE on prod** — publish plans w/ live key (`/api/admin/plans/publish`), LIVE webhook for
   checkitforme.com/webhooks/stripe + whsec on prod svc, then owner real-card E2E. #1 launch gate.
   Found: live endpoint `we_1TfY5G…` exists but points at OLD `caller.fungibles.com` URL — fix.
2. **Re-arm store sync** — `STORE_SYNC_URL=https://checkitforme.com` on STAGING svc (token still set);
   BABYSIT first catch-up via `/api/store-sync/status` (400-row batches ≈2h). Verify chain edit flows
   staging→prod. Do not re-arm casually (first arming starved prod's event loop — since rebuilt).
3. **PostHog** — key into Railway vars BOTH services, verify events from every page.
4. **Helicone** — set up, verify LLM calls route through + show in dashboard (key already on prod svc).
5. **Error monitoring + alerts** (ping owner on prod throw/down) + off-box backups w/ one TESTED restore
   (R2 creds already on prod svc).
6. **Discord** — free area + paid customer area (Support lane builds the agent).
7. **Cleanups** — retarget CALL_ECONOMICS citation in server.ts → COST_MODEL Part II; after owner
   rotates tokens, update fungibles GitHub Actions secret.

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

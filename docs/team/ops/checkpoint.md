# Check - Ops — CHECKPOINT (current state; PM + DevOps merged 2026-07-22)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 📍 2026-07-22 — THE REBUILD landed + owner-approved follow-ups (why: docs/shared/REBUILD_PLAN.md)
- Gates live + demoed blocking: path locks (.claude/locks + .unlock flow) · copy gate · sprawl gate ·
  compute gate · build stamp + `scripts/verify-live.sh` (done = its output pasted, staging verified
  LIVE) · section INDEX (never open the giant files whole) · 25-turn handoff nudge.
- Locks (owner-approved): src/voice/** · public/checkit.html · src/calls/recipe.ts ·
  src/calls/tree-learn.ts · data/stores-master/** · both intel jsons (DB stays the live store source).
- Script sweep (owner-approved): 12 one-offs → scripts/archive/ (incl. sync-dropsdb.ts);
  import-stores.ts KEPT (active for hobby/thrift adds); tests/e2e stays (launch gate).
- Team is 7 lanes (ops = old pm + devops); PM's open items live in `docs/tasks/INDEX.md` (the queue
  every boot reads, 39 tasks). Truth snapshots of the frozen consumer site: `docs/design/truth/`.
- Prod/admin show NOT-LIVE (no stamp) until the next promote — expected; queued as
  `docs/tasks/first-promote-after-rebuild.md`. Next session: take ONE task from the queue.

## 📍 2026-07-20 — e2e harness + SMS kill-switch + referrals (all shipped + proven, merged to staging)
- E2E harness DONE, 40/40 paths (`docs/specs/e2e-coverage/harness.md` = the live coverage record).
- SMS kill-switch `flags.smsAlerts` default OFF; email-only alerts meanwhile; **owner flips it ON in
  Admin → Policy → Consumer when Toll/A2P approves — no rebuild.** Proven: consumer.spec P1-9b.
- Referrals proven end-to-end (P1-10/10b) — the GTM card can close.

## 📍 2026-07-16 — everything on staging; ONE promote lights up the last two pipes
- **Settings mirror prod→staging LIVE (staging half)** — `src/settings-sync.ts`, pull-only every
  60s: policy (minus staging's in-test call flags cheapBridgeAll/connectOnHuman), vt_plans (minus
  staging's TEST-mode Stripe ids), support banners, statuses registry (exact, incl. deletes).
  20/20 suite in test-all. **FULLY LIVE since the 07-16 promote** — PM verified the puller's
  status shows ok runs moving real keys (policy_json, vt_plans, statuses) prod→staging every minute.
  Zero overlap with DD's store/learned pipes (asserted in tests; notes swapped in her checkpoint).
- **Admin ship-path decouple on staging** — after next promote, Addie ships app.html via
  `bash scripts/ship-admin.sh` (~10s, atomic, rollback, bundled fallback; --staging rehearses,
  --status shows what's live). PM queue: one rehearsal with a real commit, then it's her flow.
- **Launch gate = `bash scripts/launch-gate.sh`** (local+staging; `prod` for post-promote —
  enters via peek). Covers signup/check/pay/cancel/PAYG/gates/zones/schedules/closed-kiosk cards/
  annual price/4 brands/admin. Last full runs GREEN (local 7/7 · staging 9/9 · prod 15/15).

## NEXT PROMOTE CHECKLIST (mine to run the gate; PM pulls the trigger)
0. **Promote wanted — the zone-lane fix (`2080731`): zones now dial through bridgeStoreCall exactly
   like a single check; Mapper's `770ffa0` REVERTED (owner 07-20) — re-apply ONLY if a clean zone
   test still misfires on a voice-nav chain, proven with one Fun-store bench call first.** Tests:
   zones 21/21, queue 16/16, concurrency 21/21, bridge 13/13, tsc clean. NOW ALSO RIDING: the
   rebuild's build stamp (src/server.ts middleware) — prod shows NOT-LIVE on verify-live until this.
1. Echo gate needs ONE Fun-store bench call first (BARGE_THRESH interrupt tuning — src/voice/bridge.ts).
2. `bash scripts/launch-gate.sh` green before; `bash scripts/launch-gate.sh prod` right after.
3. Post-promote verifications queued: settings mirror flows a real Admin edit ≤1 min (PM watches);
   ship-admin.sh rehearsal; owner re-checks his plan toggles on staging.

## NOT DONE (my lane)
- **Per-tier SMS-cap enforcement** — `smsAlertsPerMonth` is plan data only, nothing enforces it
  (PM queue #2, small build; alerts senders + admin views already exist).
- **Alerts leftovers (not mine):** A2P 10DLC registration (owner paperwork, gates real SMS),
  email branding (Copper/Webbie), My-Checks contact form (Webbie).
- **Remove `/api/zones*` admin endpoints** (keep the engine) · **Admin price-editor → Stripe**
  (GTM `price-editor`) · logo-resolver fuzzy-fallback delete (DD finding, agreed).
- [~] **Transcript IDOR** — backend shipped, flag off; waiting on Website Bearer header → flip on.
- **Rotation list** = `rotation-list.md` (this folder) — run at launch, Railway token LAST.
- **Real-store launch:** press **Start fresh** (stats_since) when it begins.
- /app/me `catalog` serves stale SUB/PACKS constants — align when touching billing.
- **NO ANSWER (owner):** close #379? decide #364? (#420/#421 safe to close — superseded.)

## Traps + owner rules (keep)
- **ONE admin** (admin.checkitforme.com); staging URL = consumer site only. Map of surfaces FROZEN.
- Cloud-session git trap: `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- urllib/WebFetch → proxy 403; **curl only** (Railway GraphQL, Stripe). Playwright in this sandbox:
  proxy resets TLS 1.3 → config caps browser at TLS 1.2 (already wired in playwright.config.ts).
- `/api/*` gate 401s unknown paths — 401 ≠ deployed; use content marker. Railway var change
  auto-redeploys. New admin deep link ⇒ whitelist in server.ts rootHandler.
- Remote branch deletes: git proxy 403s; push --delete via the x-access-token git URL (GITHUB_PAT).
- Gate rate limits: ~8 staging gate runs/hr (signup lead limit); each run = 1 throwaway account +
  1 Stripe TEST sub (A4 cancels it).
- Cost truth: bridge ~5¢ / escalation rate is THE margin lever; `docs/finance/COST_MODEL.md` +
  Admin → Calc canonical. Owner locked CHARLIE FOR ALL (Delta shelved) 07-16.
- Owner prefs: outcome-first one-screen replies; no shorthand; secrets never in files; "check"
  never "call"; done = demonstrated with evidence; explicit owner naming before prod pushes.
- Four sync pipes now: curated stores staging→prod (5 min) · learned nav prod→staging (3 min, DD) ·
  settings prod→staging (60s, mine) · never-sync fields written to both envs by hand. Promote =
  the ONLY way prod code changes; `bash scripts/promote.sh`.

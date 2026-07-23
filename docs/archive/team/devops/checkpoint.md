# Check - Devops — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 📍 2026-07-20 — e2e harness complete + SMS kill-switch shipped (branch claude/e2e-coverage-harness-a9esc7, all merged to staging)
- **E2E harness DONE — all 40 paths in `docs/specs/e2e-coverage/harness.md` dispositioned.** P0 8/8,
  P1 8/8, P2 11/12 (28 anti-abuse un-automatable: guard sits past the sim early-return), P3 12/12.
  New tests in `tests/e2e/consumer.spec.ts` (P0/P1/P2 blocks), `local.spec.ts` (P2-27 + P3 admin
  walk via admin.localhost), `admin-api.spec.ts` (P3-34 publish→in_sync). Coverage table in
  harness.md is the live record. **Last runs GREEN: local 13/13 · staging 40/40 (2 honest skips).**
- **Fixed 2 stale reds:** A6 (expected closed stores IN the near feed; 07-16 open-now law drops them
  server-side) + admin.spec dead `#tr_stats`→`#tr_progress`.
- **SMS kill-switch SHIPPED** — new `flags.smsAlerts` (default OFF). While OFF: watch/schedule/waitlist
  forms collect EMAIL only (EN+ES, placeholder survives the lang pass — drops data-i18n-ph), `/pub/watch`
  refuses phone contacts (400), `/app/alerts/subscribe` rides email, `sendAlert` never fires a customer
  SMS (legacy sms subs → skipped_sms_off). Admin toggle live: Policy → Consumer → "Text alerts (SMS)".
  **Owner flips it ON when Toll/A2P approves — no rebuild.** Proven live: consumer.spec P1-9b.
- **Referrals PROVEN end-to-end (GTM card can close)** — consumer.spec P1-10 (API) + P1-10b (real ?ref
  link → welcome → signup → auto-claim pays BOTH + count ticks). Was "BUILT, needs walk" — walked.
- **GTM cards now tap-to-expand** (`public/app.html`, gtmToggleOpen) — owner couldn't read full card
  text. Shipped to Admin via ship-admin.sh @ 4e8c5b5.
- Two readable owner reports in scratchpad (launch-test-report.md, launch-list.md) — NOT committed
  (scratchpad = trash); regenerate from harness.md + `/api/gtm` if needed.

## 📍 2026-07-16 — everything on staging; ONE promote lights up the last two pipes
- **Settings mirror prod→staging LIVE (staging half)** — `src/settings-sync.ts`, pull-only every
  60s: policy (minus staging's in-test call flags cheapBridgeAll/connectOnHuman), vt_plans (minus
  staging's TEST-mode Stripe ids), support banners, statuses registry (exact, incl. deletes).
  20/20 suite in test-all. **FULLY LIVE since the 07-16 promote** — PM verified the puller's
  status shows ok runs moving real keys (policy_json, vt_plans, statuses) prod→staging every minute.
  Zero overlap with DD's store/learned pipes (asserted in tests; notes swapped in her checkpoint).
- **PR #18 MERGED to staging** (PM-confirmed promote; cc27924, verified deployed): cheap-bridge
  wiring (all 7 non-live paths ride Mapper recipes via bridgeCheckCall), real call-failed reasons
  (voicemail/busy/bad_number; voicemail no longer mislabeled "closed"), bridge echo gate.
  `cheapBridgeAll` flag confirmed OFF live — owner flips it (Admin → Policy) after Fun-store tests.
- **Admin ship-path decouple on staging** — after next promote, Addie ships app.html via
  `bash scripts/ship-admin.sh` (~10s, atomic, rollback, bundled fallback; --staging rehearses,
  --status shows what's live). PM queue: one rehearsal with a real commit, then it's her flow.
- **Launch gate = `bash scripts/launch-gate.sh`** (local+staging; `prod` for post-promote —
  enters via peek). Covers signup/check/pay/cancel/PAYG/gates/zones/schedules/closed-kiosk cards/
  annual price/4 brands/admin. Last full runs GREEN (local 7/7 · staging 9/9 · prod 15/15).

## NEXT PROMOTE CHECKLIST (mine to run the gate; PM pulls the trigger)
0. **PM/Pops: promote wanted — the zone-lane fix (`2080731`, src/server.ts). Mapper's bridge line
   `770ffa0` is REVERTED (owner 07-20): the dial path must stay byte-identical to the proven
   single-check system — zones now simply use it N times.** Root cause of the CVS/Walgreens sweep
   failure was the zone endpoint's cheap lane (no workflow-lane routing → Alpha/Bravo/nav recipes never
   fired; only direct stores worked). Now zones place through bridgeStoreCall exactly like a single
   check (zoneRunId threaded, batch governor slot, pre-inserted rows, room-keyed stops). If a CLEAN
   zone test still misfires on a voice-nav chain, `770ffa0` is the ready candidate fix — re-apply it
   then and prove it with ONE Fun-store bench call before promoting. Tests: zones 21/21, queue 16/16,
   concurrency 21/21, bridge 13/13, tsc clean. Ride the promote with the echo-gate bench call.
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

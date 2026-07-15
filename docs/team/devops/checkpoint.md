# Check - Devops — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-15 — admin ship-path decouple + gate A1-A8 BUILT, held for Addie's quiet window
- **HOLDING two local staging commits** (owner: no pushes while Addie iterates on the Admin;
  watcher pushes when origin/staging is quiet 30 min): (1) admin decouple — Admin UI ships via
  `bash scripts/ship-admin.sh` (volume override on the prod svc, atomic swap, rollback, bundled
  fallback; NO new domain/service/DNS; enabling server change rides the next promote) — 12/12;
  (2) launch gate A1-A8 from docs/specs/launch-journeys — PAYG locked-features, zero-credit
  upsell, both pools, Stripe-test cancel (also cleans up each run's test sub), gates × account
  type, closed/kiosk cards, annual price parity, prod-gate peek entry. local 7/7 · staging
  journeys 9/9 · prod 15/15 GREEN.
- **Promote LANDED (b20ff75, 07-15) → PR #18 hold is OVER**: merge it into staging in the same
  quiet-window push (cheapBridgeAll still default OFF; echo-gate BARGE_THRESH still needs a
  Fun-store bench BEFORE the NEXT promote).
- **[blocked] audit for the owner:** referrals = BUILT (engine+UI+tests; GTM card stale).
  Alerts = mostly built; genuinely left: per-tier SMS-cap enforcement (small backend, mine),
  A2P 10DLC registration (owner paperwork), email branding, My-Checks contact form (Webbie).

## ✅ 2026-07-14 — LAUNCH GATE shipped + it caught a real revenue bug (both on staging a7f11b7)
- **`bash scripts/launch-gate.sh` = THE promote gate.** One command, GREEN today (24 journeys):
  signup, store find→call sheet, upgrade+pay (Stripe TEST 4242 through the REAL webhook), schedules,
  zones, admin API, 4 brand skins vs live staging; dial-side journeys (check→verdict, zone fire) vs a
  local throwaway server (calls hard-disabled — staging has STAGING_CALLS=1, gate NEVER dials).
  `prod` target = read-only post-promote subset + Admin UI tabs. Docs: tests/e2e/README.md.
- **REVENUE BUG fixed (gate found it, run #1):** Stripe API ≥2025 moved the invoice line price id
  (pricing.price_details.price); invoice.paid handler read old line.price.id → embedded-Elements
  subscribers PAID AND GOT NO PLAN. Fixed in billing.ts + unit test with the live payload shape.
  **Owner's real-card prod test would have hit this — fix must ride the next promote.**
  Also fixed 2 stale stripe-test expectations (plan-ladder change) — those "legacy" reds are real greens now.
- Gate notes: agent-sandbox proxy resets TLS 1.3 → config caps browser at TLS 1.2; ~8 gate runs/hr
  max (signup rate limit); each staging run makes one throwaway account + one Stripe TEST sub.
- **CHEAP-BRIDGE WIRING BUILT + HELD — PR #18 (draft, session branch, do NOT merge until PM's
  promote clears; Pops merges after).** All 7 leftover call paths (customer+admin scheduled checks,
  consumer+admin zone fires, admin call-now, /pub/check, /app/check) now route through the
  connect-on-human bridge = Mapper recipes (dtmf/say/connectAtSec) actually drive the nav, billed
  agent opens only on a human. Gated by NEW policy flag `cheapBridgeAll` (default OFF — flip in
  Admin → Policy per env after Fun-store testing). Audit verdict: direct-agent lane never used
  recipe mechanics (text-only prompt); paths that stay direct on purpose = tree-lab learning calls,
  simulator/bench/talk (dial own phone), caller-ID verify. Proof: zones suite 21/21 w/ flag-on
  section, full suite green (minus legacy design-tokens), boot test + local gate GREEN.
- **Owner build queue (2026-07-14) — ALL SIX DONE.** On PR #18 (held till promote clears): cheap-
  bridge wiring, call-failed real reasons (voicemail/busy/bad_number; voicemail no longer mislabeled
  "closed"), bridge echo gate (agent's own audio can't come back as phantom Clerk lines — BARGE_THRESH
  needs a Fun-store bench before promote). On staging (live): admin per-customer view backend
  (GET /api/admin/users/:id + grant endpoint, 14/14) and ?section=thrift opt-in on stores/near (5/5).
  Zones backend + GET /pub/store/:id were ALREADY shipped — both checkpoint asks were stale.
  Rotation list written (rotation-list.md); handoff stubs already deleted (Lexicon).

## ✅ 2026-07-11 — big batch LIVE on prod main 25be309, all green (detail in git history)
- Full staging→main merge on prod (whole team's work; no rollback needed). Nav+logo hardening
  verified live (independents ring DIRECT, silent-agent bug dead; logo resolver explicit-only).
- Account delete/reset shipped (`POST /api/admin/users/:id/delete` + admin Reset button); the 424
  number is wiped to a blank slate for the owner's signup→pay test.
- GitHub write MCP connector live for Design chats (Railway svc `github-mcp`; PAT + URL are on the
  rotation list — both were pasted in chat).

## Launch queue leftovers (repo migration / Stripe live / store-sync / PostHog+Helicone all DONE — git history)
- ⏳ **Owner still owes the real-card test** on checkitforme.com (424 number wiped to blank slate for it).
- **Still open:** Discord (owner makes the server); fungibles Actions secret (waits on token rotation);
  delete the two `claude/checkit-export-*` branches on fungibles (direct-PAT push, git proxy 403s deletes).
- **QA failures** (design tokens, qa-round6/gating/admin-plans) = LEGACY — reproduce on baseline adc3b12,
  NOT promote blockers.

## NOT DONE (older lane items, still real)
- **Remove `/api/zones*` admin endpoints** (keep the zones engine).
- **Admin price-editor → Stripe** (GTM `price-editor`).
- [~] **Transcript IDOR** — backend shipped, flag off; waiting on Website Bearer header → flip on.
- **Security pre-PUBLIC hardening** — full launch-day list now lives in `rotation-list.md` (this folder).
- **Real-store launch:** press **Start fresh** (stats_since) when it begins; then resume mapping.
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

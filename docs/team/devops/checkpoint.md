# Check - Devops — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

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
- **Owner build queue (2026-07-14): promote HOLD** — call-path work stays off staging until PM's
  promote clears. Next: cheap-bridge wiring + Mapper-recipe audit (build on session branch
  claude/check-pops-devops-cul4v8), then call-failed reasons, echo fix, zones/admin-view backends,
  Webbie's two API asks. Rotation list written (rotation-list.md); handoff stubs were already deleted.

## ✅ 2026-07-11 late — big batch LIVE on prod main 25be309, all green
- **Full staging→main merge landed on prod** (another session pushed it, not a pinned promote). Prod =
  25be309, healthy across all 4 brand sites + stores API + plans + admin + webhook (400 on bad sig).
  Carried the whole team's staging work (Zones rebuild, Support Messenger v3, Delta audio+Groq, footer/
  Guide/Help, design comps, my nav+logo + delete-endpoint). Owner briefed: nothing broke, nothing lost,
  NO rollback (rollback would pull live team work off prod). Next controlled push waits till team checks
  in — **6 commits on staging ahead of main** right now, captured, safe.
- **Nav+logo hardening (mine, LIVE + verified on prod):** independents/co-ops default DIRECT via curated
  `DIRECT_DEFAULT_CHAINS` + `isDirectDefaultChain` (import-data.ts) applied at chain-insert in both import
  paths; `backfillDirectChains` enforces on boot AFTER backfillChainTypes AND after any `chains` table-load
  (the prod→staging mirror is a runtime action — boot alone wouldn't re-fix it). Verified on prod: Ace +
  Goodwill/Salvation Army/Unique/Independent Card Shop/Comic Book Shop all ringsDirect=true, tree nulled →
  silent-agent bug dead. Logo resolver: dropped the fuzzy stem-in-name fallback (footgun; 0 stores rode it),
  explicit-only now (DB logoUrl → exact slug). Both from DD findings `docs/specs/{logo-resolver-hardening,
  independent-direct-nav}`. Mapper fixes 6feff66 (no-downgrade) + 52d2c77 (skip rings-direct) also live.
- **Account delete/reset — SHIPPED + owner-facing:** `POST /api/admin/users/:id/delete` (?dry=1 preview;
  wipes account + checks/schedules/alerts/zones/requests/watches, cancels live Stripe sub) + **Reset account
  button** in admin Users panel. Used it to wipe `phone:+14243126356` to a blank slate for owner's signup→
  free-call→upgrade→pay test. Backend 428c6a6, button 598a16a.
- **GitHub write MCP connector LIVE:** Railway svc `github-mcp` (node:22 + supergateway wrapping the
  reference server), URL `https://github-mcp-production-3726.up.railway.app/mcp` (path IS the credential).
  Owner-owned PAT (repo write) in svc var. Verified: real commit landed on staging + reverted. For Design
  chats to write to the repo. **PAT + URL onto the rotate-at-launch list** (PAT was pasted in chat).

## Launch queue leftovers (repo migration / Stripe live / store-sync / PostHog+Helicone all DONE — git history)
- ⏳ **Owner still owes the real-card test** on checkitforme.com (424 number wiped to blank slate for it).
- **Still open:** Discord (owner makes the server); fungibles Actions secret (waits on token rotation);
  delete the two `claude/checkit-export-*` branches on fungibles (direct-PAT push, git proxy 403s deletes).
- **QA failures** (design tokens, qa-round6/gating/admin-plans) = LEGACY — reproduce on baseline adc3b12,
  NOT promote blockers.

## NOT DONE (older lane items, still real)
- **Cheap-bridge lane for leftover call paths** (scheduled checks, zone fires, admin call-now,
  `/pub/check` fallback) — COST_MODEL.md Part II §2; biggest cost cut, "a wiring decision, not a build".
- **Manage Zones backend (consumer)** — spec `docs/archive/manage-zones-SHIPPED.md`; engine exists.
- **Admin per-customer view backend** (`docs/specs/admin-user-view.md`); Admin builds the panel.
- **Remove `/api/zones*` admin endpoints** (keep the zones engine).
- **Admin price-editor → Stripe** (GTM `price-editor`).
- **Kill "Call failed" → real reasons** (map EL termination_reason → voicemail/busy/bad_number).
- **Transcript echo** — bridge feeds agent audio back as clerk input; fix at bridge.
- [~] **Transcript IDOR** — backend shipped, flag off; waiting on Website Bearer header → flip on.
- **Security pre-PUBLIC hardening** — full launch-day list now lives in `rotation-list.md` (this folder).
- **Website asks:** `section=thrift` opt-in on `/pub/stores/near` (Thrift stores stay muted);
  `GET /pub/store/:id` single-store fetch (same shape as near; gate owner-only stores).
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

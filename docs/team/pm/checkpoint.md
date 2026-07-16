# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI,
> promotes to prod on the owner's word, and keeps the owner focused on the one thing that matters.
> Talk to the owner like a friend, plain words, no jargon (he reads on a phone). Newest on top.

## 📍 NOW (2026-07-16) — prod = staging = 41901e5, gate GREEN, fresh-chat reset day
- Fresh-start promote landed + verified (health, Admin, splash, prod launch gate all green).
  Tint attempt 4 (4d8821b, strips take sheet surface colour) rode along — owner judges via peek.
- Owner's day: dedicated EMAILS chat running (dark template must render in all clients; 7 failed
  attempts logged in git — grep "emails") · Webbie wrap-up then FRESH Webbie chat · Addie adding
  system messages · then Echo call session.
- **CHARLIE FOR ALL ACCOUNTS locked** (Delta built + shelved; Fun store → Branson Global). Owner's
  sole focus now: Echo/Charlie tuning + verifying Admin persona create/save works end to end.
  Fresh Webbie + Addie chats standing by for his tasks.
- **CLOSED 07-16:** emails SETTLED (owner-approved look; chat checkpoints + merges, then dies) ·
  iOS sheet tint = WON'T FIX (owner decision: leave it; GOTCHAS keeps the history) · DD store data
  done for launch · Mapper done: 99%+ of available US chains mapped.
- **Card test folds INTO the Charlie session**: fresh 424 signup (blank slate, NOT comp —
  COMP_PHONES unset, verified) → peek link → free check on a real store (watch status page) →
  upgrade → Family, REAL card → receipts. It's still the last launch gate — keep it front.
- Handoffs from Addie + Webbie arriving; fold into this file as they land.

## Open queue (after the Charlie/card session)
1. Pops: one `ship-admin.sh` rehearsal → Addie ships Admin UI in seconds, no promotes.
1b. Settings mirror PROD→STAGING — **BUILT + staging half LIVE** (Pops, e0e6e0c; 20/20 suite in
    test-all). Staging pulls every 60s: policy (minus staging's in-test call flags), vt_plans
    (minus staging's TEST-mode Stripe ids), support banners, statuses registry. One direction by
    construction (pull-only; prod never receives a write). **Waiting on ONE thing: the next
    promote puts the read-only export endpoint on prod** — puller is already ticking and
    self-heals the moment it lands (status: `GET /api/settings-sync/status`, currently a clean
    "prod export 404" every minute). THEN PM verifies a real Admin edit flows within a minute.
2. Pops small build: enforce per-tier SMS caps (`smsAlertsPerMonth` is plan-data-only today).
3. Owner: Twilio A2P (waiting on Twilio; gates SMS alerts) · Discord server · #379/#364 yes/no ·
   LEGAL/consent (critical GTM, owner-owned, un-started) · hide hobby chains in Admin.
4. cheapBridgeAll flip (Admin → Policy) — owner's call, after Charlie economics are settled.
5. Week-in-review + hum-better one-pager (owner asked; useful before Friday's Chris talk —
   deal notes live in docs/team/ideas/checkpoint.md).
6. Owner walk list O2-O10 in docs/specs/launch-journeys/JOURNEYS.md (A1-A8 automated + green).

## Standing facts (prune when stale)
- Promote = `bash scripts/promote.sh` after tsc + test-all + `launch-gate.sh staging` green; verify
  prod health + Admin + splash + `launch-gate.sh prod` after. Staging redeploys on EVERY push — a
  gate run mid-deploy reds with a Cloudflare 502; wait for /api/health, rerun.
- Cloudflare fronts prod; origin hosts are *.up.railway.app → admin detection is brand-based
  (GOTCHAS). COMING_SOON only exists on prod; rehearse gate changes locally with Host headers.
- Playwright in this box: /opt/pw-browsers/chromium via PLAYWRIGHT_BROWSERS_PATH.
- Tint saga: 4 attempts, 3 reverted, root cause = transformed sheets hijack position:fixed
  (GOTCHAS). Only the owner's iPhone judges tint work; boxed brief for a tint chat is in PM chat.
- Vocabulary: there is no "staging Admin" — Admin is ONE app on the prod service.
- 424 number: in ADMIN_PHONES (expected), NOT in COMP_PHONES. After the card test, set prod
  COMP_PHONES=+14243126356 so the owner can see/call the Fun store without burning paid checks.

## Provenance
2026-07-16: reset night — end-of-day audit found nothing lost; session-branch docs folded in
(voice strategy, ideas/Chris thread); 4 promotes total since 07-15. History lives in git log.

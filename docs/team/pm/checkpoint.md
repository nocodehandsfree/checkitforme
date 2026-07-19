# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI,
> promotes to prod on the owner's word, and keeps the owner focused on the one thing that matters.
> Talk to the owner like a friend, plain words, no jargon (he reads on a phone). Newest on top.

## 🌙 PAUSE (2026-07-19 eve) — owner called it for the night, everything is SAFE
Read this first tomorrow. Nothing is broken, nothing is lost, nothing needs a rescue.
- **Prod healthy** (checkitforme.com serving 526c435), splash up, Admin up. **Staging healthy** too.
  Production is UNTOUCHED and only moves on the owner's word — no half-states, no fires.
- The day burned out on POLISH, not on anything structural: the "in line" waiting card copy + it
  being full-page instead of a compact card. That's Copper (words) + tint (make it a compact card),
  not a real defect. The store-vs-us-busy copy confusion is the fix (see the queue-UX section below).
- Owner was fried after days of loops. When he's back: LEAD with calm + the real state (the hard
  stuff is done — live site, 99% chains mapped, calls + payments work, scale plan exists). Do NOT
  open with a task list or a box. One thing at a time, his pace.
- Still the ONE open launch gate: the real-card test (O1). Everything else is trim.
- Where work sat when he paused: queue-UX build (Pops feed / CD comp / tint card + zone-10) and the
  promote pending on Webbie's landing pages + zone-report page. All on staging, all waiting on him.

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
- **07-17 promote pending on Webbie:** iOS tint DONE (support slide-out fixed). Copper writing copy
  for (a) landing-page issues owner found + (b) a NEW zone-call REPORT page (net-new consumer surface).
  Webbie implements both, then PM gates + promotes the whole pile, THEN Fable functional harness runs
  on staging. NOTE: the zone-report page is brand-new — PM drives it on staging before promote, and it
  must be ADDED to docs/specs/e2e-coverage/harness.md (spec predates it). Closes the untested-zones gap.

>**Owner decision 07-17 (do not relitigate):** LAUNCH WITHOUT a spoken recording
disclosure at the start of calls. Deliberate entrepreneur risk. A WRITTEN recording
line on the Privacy page is fine; no agent adds a spoken call disclosure unless the
owner reasks.

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

## Concurrency-queue UX build (owner 07-17) — coordinated across 3 lanes
When call slots are full, the 11th check QUEUES, never fails. UX: a calm holding card (borrows the
referral share-card LOOK, own copy) with store name + a LIVE, accurate countdown ("You're next ·
about 30 sec"), auto-flips to the live transcript when the call dials. No messaging (owner: don't
notify), no charge until connect.
- **Pops:** queue feed — place-in-line + ETA computed from live calls' elapsed+expected duration;
  poll endpoint; emit "your call started" signal. Activates only when governor is on.
- **CD:** design the queued holding-card state (ref = owner's referral-card image, look only).
- **iOS tint (front):** build the card to CD's comp + zone cap 10 in the UI. Both EN+ES.
Front & back must agree the queued signal + ETA shape. Rides the promote train (consumer code).

## Scale switches — how we grow call capacity (Pops built, default OFF, 07-17)
Turn-on ORDER when traffic climbs (do NOT flip early — voice testing stays untouched while OFF):
1. **ElevenLabs burst** first — instant 3x headroom (10→30 concurrent on Creator), overflow bills
   ~2x/min only during spikes, zero code, zero risk.
2. **Pops's governor** — instant single-checks jump ahead of zone sweeps · per-user zone cap
   (default 10) · graceful queueing past burst instead of failing · account-pool ready (5 EL
   accts = 50 concurrent).
Shake out on the Fun store with the hard-gated Phase-2 load test (physically can't dial a real
store) BEFORE it touches real stores. Plan ladder: Creator $22=10/30burst · Pro $99=20/60 ·
Scale $299=30/90; at $100k/mo peak ~30-50 concurrent → Scale+burst=90 covers it (~0.3% of rev).
**PENDING owner build:** Calc concurrency slider (Addie) — revenue→peak-concurrency→plan cost→
per-check impact; formula from Pops.

## Standing facts (prune when stale)
- **You are the verification gate (CLAUDE.md).** Nothing user-facing reaches the owner as done, and
  nothing promotes, on someone's word it works — you DRIVE it on staging.checkitforme.com yourself and
  write the Done Report (Built · Drove it: URL→action→saw · Left). A bare "done/fixed" with no Drove-it
  line is bounced. `promote.sh` now stops and makes you confirm every user-facing commit was driven.
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

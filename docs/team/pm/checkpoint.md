# Check PM — checkpoint (current state)
> PM = the quarterback + verification gate + docs police (Lexicon absorbed) + roadmap talk (Ideas
> absorbed). Runs on the owner's expensive model: high-level thinking only, boxed orders out.
> Newest on top, ≤80 lines (machine-enforced at push).

## 📍 NOW (2026-07-21) — THE RESET: new system live, owner rebooting lanes one at a time
Owner hit his limit 07-20/21: agents freelancing architecture (My Zones), runaway self-started test
suites, comps/logos ignored, work stranded on session branches. Diagnosed together; he chose: keep
product, rebuild process · hard stops over prose rules · PM as front door · team cut.
- **CLAUDE.md rebuilt** — roster (4 standing + 6 on-call; Lexicon+Ideas dead, PM absorbs), THE BOX
  LAW (every specialist boots on a PM boxed order naming pieces to reuse), LAW 1 = ADDITIVE NEVER
  PARALLEL (the My Zones lesson), full suite = owner's words only, never background.
- **Machine locks live:** `scripts/checkpoint-lint.sh` + `.claude/hooks/push-gate.sh` — `git push`
  refuses while any checkpoint >85 lines (verified: blocked my own push until I pruned 4 files).
  ship-it description no longer says "full test suite" (the line that made agents fire it).
  Orphan cleanup: `bash scripts/kill-tests.sh`.
- **Owner plan:** close ALL old chats, reboot lanes fresh one at a time, each boot = PM boxed order.

## Open verifies (PM drives before anything new ships)
0. **424 = admin on STAGING (owner 07-21, noted don't-fix-yet):** his 424 is in staging's
   ADMIN_PHONES, so the fresh-customer signup test boots as admin. Before the real-card/upgrade walk
   (owner + Chris): pull 424 from staging ADMIN_PHONES (Railway var), verify clean signup. COMP undo
   already done on prod (owner wants 424 as a real paying account — do NOT re-comp it).
1. **Zone run on CVS/Walgreens** since the rebuild (zones dial the SAME engine as single checks,
   2080731; Mapper's VAD patch reverted 8eb8d22 — rides next promote). Real calls, owner judges.
2. **Logo fidelity in My Zones + call-log header logo** (owner: both broke; logos-in-history fix
   9e175a0 + zones r164 landed after his test — NOT verified). Drive staging; box Webbie if broken.
   Related: store-row logo fallback bug (design checkpoint → Open).
3. **Staging store-list overwrite mystery (DD):** quarantine wrote 105 bad numbers on prod, staging
   showed 33 — something re-imports staging retailers. Prod correct; DD corners WHAT overwrites it.
4. **Settings mirror:** promote landed — verify prod export is live (`GET /api/settings-sync/status`
   goes clean) + a real Admin edit reaches staging within a minute.
5. **Prod gate 14/15:** the red is a STALE test (`tests/e2e/admin.spec.ts` checks old Admin tabs).
   Admin works. Addie has the box.

## Incident record (07-20, closed — full story in GOTCHAS + git)
- 18 mapped big-box chains carried a pre-history "site" flag → flipped back on BOTH envs, verified
  18/18 (CVS never flipped; Echo's "new CVS assistant" claim false — owner called CVS himself).
- Guards live: chain PATCH + intel seed refuse to unflag mapped chains w/o force; board shows CONFLICT.

## Reboot order + first boxed orders (owner picks the pace)
1. **Webbie** — verify/fix My Zones logos + call-log logo using THE existing logo system; then the
   live-view green bloom (design checkpoint → Open).
2. **DD** — corner the staging overwrite phantom; then real numbers for the 7 fabricated-number chains.
3. **Echo** — zone-run verification session with owner (Fun store first, then a small real zone).
4. **Addie** — fix the stale admin gate test, then carried backlog (admin checkpoint).
Copper/CD/Mapper/Pops/Logo/Support parked until a box needs them.

## Prod + promote state
- **PROD = 9121a33 (big promote 07-20, owner's go, verified):** kiosk-receipts server piece, landing
  pages, Calc concurrency, queue plumbing, zone cap 10. Splash still guards public; peek works.
- Next promote carries: zone-engine unification + VAD revert + whatever else is on staging (say so).
- Post-promote TODOs still open: re-set owner's email on PROD; set prod COMP_PHONES=+14243126356
  (owner's 424 — so Fun-store calls don't burn paid checks; it's in ADMIN_PHONES, expected).
- Fable e2e harness (docs/specs/e2e-coverage/harness.md, 40 paths): P0 8/8, P1 7/8, P2/P3 recorded
  mid-run 07-20. Zone-report page must be ADDED to the harness spec (net-new surface, spec predates it).

## THE ONE THING — still open
- **Real-card test (O1), owner's move:** fresh 424 signup → free check on a real store → upgrade →
  REAL card → receipts. Last launch gate a robot can't do. Owner walks O2-O10 (JOURNEYS.md) after.

## Standing facts
- **Owner decisions (do not relitigate):** launch WITHOUT spoken recording disclosure (written
  Privacy line fine) · Charlie for ALL accounts (Delta shelved) · tint saga CLOSED won't-fix.
- **My Zones build law (owner 07-19):** BUILT + functional → make it TIGHTER, don't rebuild. Comps
  must be LIGHTWEIGHT (the old 1.7MB base64 blob is unreadable; the 9.5K queued-card comp is the
  model). LATER: merge new zones comp into ONE master comp + delete old zone material.
- Promote = `bash scripts/promote.sh` after tsc + targeted tests + `launch-gate.sh staging` green;
  it forces per-commit "driven" confirmation. Verify prod health/Admin/splash/gate after. Staging
  redeploys on EVERY push — mid-deploy gate runs red with a Cloudflare 502; wait /api/health, rerun.
- Cloudflare fronts prod; COMING_SOON only on prod; admin detection brand-based (GOTCHAS).
  Playwright here: /opt/pw-browsers/chromium.
- Owner's own plate: Twilio A2P · Discord · #379/#364 · Echo/Charlie tuning · hide hobby chains ·
  Chris talk (notes in docs/team/ideas/checkpoint.md) · LEGAL/consent (critical GTM, un-started).

## Session branches on origin
**Provably merged, SAFE TO DELETE (this session lacked delete permission):** check-admin-setup-jseff0 ·
e2e-coverage-harness-a9esc7 · hobby-hours-backfill-eexkg0 · webbie-landing-pages-lzpq0l · lexicon-repo-org-n4lpzn.
**Delete after its lane confirms dead at reboot:** admin-redesign-data-hiy0ej · admin-standup-handoff-uipqja ·
android-compatibility-testing-gjimn8 · check-app-ideas-sv1cl2 · check-email-rendering-uxomo9 ·
check-pops-devops-cul4v8 · copper-landing-page-copy-3tatx4 · docs-overhaul-public-manuals-smlohx ·
logo-asset-lane-setup-8rx7ep · mapper-checkpoint-scheduling-tbtnps · my-zones-layout-fix-68gs56 ·
restructure-public-logos-pewy1c · ringo-voice-onboarding-634tk6 · support-lane-spec-7hd2aj ·
ui-polish-pass · webbie-landing-share-rebuild-345ikb · webbie-website-handoff-s0ql27
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
0b. **THE TALK-OVER SAGA CLOSED (07-21 night) — two causes, both fixed, one proof pending:**
    (1) 07-18 instant-connect on "direct" stores → Charlie talked over recordings (Box Lunch, Hot
    Topic). Rolled back: every store waits for a voice again. (2) The ear-gate armed on TIMER chains
    because it read consumed ctx fields (B&N: timer 29s, agent opened at 8s on the greeting).
    Fixed with Mapper's strict boolean (bridge.ts, owner unlock, relocked, 13/13 bridge tests).
    EL dials calmed (eager→normal, speculative off). Echo's listen-then-talk build stays boxed as
    the LONG-TERM fix that also restores first-word capture. PROOF = one B&N staging check.
0a. **Status precision (owner, after demo):** empty-conversation completed calls (Chris's Target,
    row 150 — dead air) must read as nobody-answered, not "Couldn't tell". Outcome mapper wording,
    engine-side (FROZEN → unlock), Echo box, small.
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

## Incident record (07-20, CLOSED): 18 chains' stale "site" flag flipped back both envs (18/18
verified); guards live (PATCH+seed refuse unflagging mapped chains w/o force). Full story: GOTCHAS.

## Live lanes right now: Echo (status-truth + listen-then-talk box) · Webbie (zone header rebuild +
restock-alert-row box) · DD idle (overwrite hunt when owner says) · Mapper/others parked.

## Prod + promote state
- **PROD = bf621bc (owner-ordered promote 07-21 ~19:38 UTC, splash verified up, Admin 200).** Owner
  email re-set on prod (jcoindefi@gmail.com). COMP_PHONES deliberately UNSET (real-card test).
- Staging is AHEAD again: instant-connect rollback + ear-gate fix + r175-r177 page fixes + manuals.
  Next promote carries all of it — say what rides.
- Fable e2e harness 40 paths recorded 07-20; zone-report page still needs ADDING to the spec.

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

## Session branches on origin (all pre-07-19, superseded by later merges — none block anything)
**Provably merged, SAFE TO DELETE (needs a session with delete permission or GitHub UI):**
check-admin-setup · e2e-coverage-harness · hobby-hours-backfill · webbie-landing-pages · lexicon-repo-org.
**Delete after its lane confirms dead at reboot:** admin-redesign-data · admin-standup-handoff ·
android-compatibility-testing · check-app-ideas · check-email-rendering · check-pops-devops ·
copper-landing-page-copy · docs-overhaul-public-manuals · logo-asset-lane-setup ·
mapper-checkpoint-scheduling · my-zones-layout-fix · restructure-public-logos · ringo-voice-onboarding ·
support-lane-spec · ui-polish-pass · webbie-landing-share-rebuild · webbie-website-handoff
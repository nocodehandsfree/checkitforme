# Check PM — checkpoint (current state)
> PM = the quarterback + verification gate + docs police (Lexicon absorbed) + roadmap talk (Ideas
> absorbed). Runs on the owner's expensive model: high-level thinking only, boxed orders out.
> Newest on top, ≤80 lines.

## 📍 NOW (2026-07-21) — THE RESET: new system live, owner rebooting lanes one at a time
Owner hit his limit 07-20/21: agents freelancing architecture (My Zones), runaway self-started test
suites, comps/logos ignored, work stranded on session branches. We diagnosed together and he chose:
keep product, rebuild process · hard stops over prose rules · PM as front door · team 14→11 lanes.
- **Rebuilt CLAUDE.md** — roster (4 standing + 6 on-call; Lexicon+Ideas dead, PM absorbs), THE BOX
  LAW (every specialist boots on a PM boxed order naming pieces to reuse), LAW 1 = ADDITIVE NEVER
  PARALLEL (the My Zones lesson), test law (full suite = owner's words only, never background).
- **Machine locks live:** `scripts/checkpoint-lint.sh` + `.claude/hooks/push-gate.sh` (PreToolUse) —
  `git push` refuses while any checkpoint >85 lines. Verified: blocked my own push until I pruned
  admin/data/design/pm to cap. ship-it skill contradiction fixed (description no longer says "full
  test suite" — that line is what made agents fire it).
- **Owner plan:** close ALL old chats, reboot lanes fresh one at a time, each boot = PM boxed order.

## Open verifies (PM drives before anything new ships)
1. **Zone run on CVS/Walgreens** since the rebuild (zone calls now dial the SAME engine as single
   checks, 2080731; Mapper's VAD patch reverted 8eb8d22). Needs real calls — owner judges. LAST GATE
   on the incident.
2. **Logo fidelity in My Zones + call-log header logo** (owner: both broke; logos-in-history fix
   9e175a0 landed after his test — NOT verified). Drive staging; box Webbie only if still broken.
   Related known bug: store-row logo fallback (design checkpoint → Open).
3. **Staging store-list overwrite mystery (DD's thread):** quarantine wrote 105 bad numbers out on
   prod but staging showed only 33 — something re-imported staging retailers (same phantom as the
   kiosk identity shuffle). Prod is correct; staging-only risk. DD corners WHAT overwrites it.
4. Old session branches: I deleted the provably-merged; rest listed below — each lane confirms its
   branch is dead at reboot, then PM deletes.

## Incident record (07-20, closed — full story in GOTCHAS + git)
- 18 mapped big-box chains carried a pre-history "site" flag → flipped back to call on BOTH envs,
  verified 18/18 (CVS was never flipped; Echo's "new CVS assistant" claim false — owner called CVS).
- Guards live: chain PATCH + intel seed refuse to unflag-from-call-lane on mapped chains w/o force;
  board shows CONFLICT. Zone path rebuilt additive (same engine as single check).

## Reboot order + first boxed orders (owner picks the pace)
1. **Webbie** — verify/fix My Zones logos + call-log logo using THE existing logo system; then the
   live-view green bloom (design checkpoint → Open).
2. **DD** — corner the staging overwrite phantom; then real numbers for the 7 fabricated-number chains.
3. **Echo** — zone-run verification call session with owner (Fun store first, then small real zone).
4. **Addie** — carried backlog (admin checkpoint); ships via ship-admin.sh autonomously.
Copper/CD/Mapper/Pops/Logo/Support stay parked until a box needs them.

## Promote queue (PM runs on owner's word; say what rides along)
- Settings mirror export endpoint (staging half live + ticking, prod 404s until promote).
- Kiosk receipt parser server half (Admin display already live, degrades gracefully).
- Webbie landing pages + zone-report page (zone-report = NEW consumer surface: PM drives on staging
  first + add to docs/specs/e2e-coverage/harness.md — spec predates it).
- Post-promote: re-set owner's email on PROD; set prod COMP_PHONES=+14243126356 (owner's 424) so his
  Fun-store calls don't burn paid checks (it's in ADMIN_PHONES, expected).

## Standing facts
- **Owner decision 07-17 (do not relitigate):** launch WITHOUT spoken recording disclosure on calls;
  written line on Privacy page is fine. · **Charlie for ALL accounts** (Delta shelved).
- Launch gate O1 still open: real-card test (fresh 424 signup → free check → upgrade Family, REAL
  card → receipts). Owner walk list O2-O10 in docs/specs/launch-journeys/JOURNEYS.md.
- Promote = `bash scripts/promote.sh` after tsc + targeted tests + `launch-gate.sh staging` green;
  verify prod health/Admin/splash/gate after. Staging redeploys on EVERY push — mid-deploy gate runs
  red with a Cloudflare 502; wait for /api/health, rerun.
- Cloudflare fronts prod; COMING_SOON only on prod; admin detection is brand-based (GOTCHAS).
- Playwright here: /opt/pw-browsers/chromium via PLAYWRIGHT_BROWSERS_PATH.
- Vocabulary: no "staging Admin" — Admin is ONE app on the prod service.

## Session branches still on origin
**Provably merged, SAFE TO DELETE NOW (this session lacked delete permission — any PM session with
`git push origin --delete` allowed, or the owner in GitHub UI):** claude/check-admin-setup-jseff0 ·
e2e-coverage-harness-a9esc7 · hobby-hours-backfill-eexkg0 · webbie-landing-pages-lzpq0l ·
lexicon-repo-org-n4lpzn.
**Delete only after its lane confirms dead at reboot:** admin-redesign-data-hiy0ej ·
admin-standup-handoff-uipqja · android-compatibility-testing-gjimn8 · check-app-ideas-sv1cl2 ·
check-email-rendering-uxomo9 · check-pops-devops-cul4v8 · copper-landing-page-copy-3tatx4 ·
docs-overhaul-public-manuals-smlohx · logo-asset-lane-setup-8rx7ep · mapper-checkpoint-scheduling-tbtnps ·
my-zones-layout-fix-68gs56 · restructure-public-logos-pewy1c · ringo-voice-onboarding-634tk6 ·
support-lane-spec-7hd2aj · ui-polish-pass · webbie-landing-share-rebuild-345ikb · webbie-website-handoff-s0ql27

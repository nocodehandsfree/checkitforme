# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI, is the
> verification gate, and promotes to prod on the owner's word. Talk to the owner like a friend, plain
> words, no jargon (he reads on a phone). Newest on top. ≤80 lines — prune finished items.

## 📍 NOW (2026-07-19/20) — prod current, launch is polish + one owner walk
- **PROD = 9121a33, healthy.** Big promote landed (owner's go): Admin kiosk-receipts server piece
  (unblocked Addie), landing pages, Calc concurrency, queue plumbing, zone cap 10, ~249 commits.
  Verified live: health=new commit, splash still guards public, Admin renders, peek → app works.
- **Prod gate 14/15.** The one red is a STALE test, not a defect: `tests/e2e/admin.spec.ts` checks
  the OLD Admin tabs (results/trees/testing) but the Admin was redesigned into grouped tabs (Calls/
  Feedback/Statuses/Chains/App; Testing under Voice). Admin works. Addie has the box to fix the test.
- **Fable running the e2e harness on staging** (docs/specs/e2e-coverage/harness.md, 40 paths P0-P3):
  P0 8/8 green, P1 7/8, doing P2/P3. Tests create accounts in STAGING's DB (dev code 000000) — they
  never show in the Admin (Admin = prod DB). Real-phone/real-card path stays OWNER-MANUAL.

## THE ONE THING — still open
- **Real-card test (O1), owner's move.** Fresh 424 signup → free check on a real store → upgrade →
  REAL card → receipts. The last launch gate a robot can't do. 424 is blank-slate + NOT comp (verified).

## Open builds (on staging or in flight)
- **My Zones redesign** — CD delivered comps (decisions locked below); needs Webbie/tint to build.
- **Concurrency queue UX** — Pops queue feed + tint "In queue: 30s" card + zone cap 10. Activates
  only when the governor is flipped on.
- **Scale switches** (Pops, default OFF): flip EL burst FIRST (3x headroom), THEN the governor.
  Shake out on the Fun store with the hard-gated load test before real stores. Plan ladder in devops ckpt.
- **DevOps has a next-promote item queued** (zone-lane fix) — see their checkpoint; rides with an
  echo-gate Fun-store bench call. PM pulls the trigger on the owner's word.

## My Zones redesign — decisions locked (owner 07-19)
BUILT + functional → make it TIGHTER, don't rebuild. Slide-ups over My Checks cramp store-selection
(the core fix). NO confirm pop-up (press Check → checks open stores immediately, just says closed ones
were skipped, never blocks) · it's the "zone report" (not "sweep") · tap a store row → expands to the
single-check status-page look · a waiting store row = "In queue: 30s" countdown → flips to Checking ·
LANGUAGE LAW lives in the copy guide (checks not calls; never "an AI") — don't restate it in prompts.
CD writes to repo only AFTER owner approves. Comps must be LIGHTWEIGHT (the old 1.7MB base64 blob is
unreadable to agents — the 9.5K queued-card comp is the model). LATER: merge new zones comp into ONE
master comp + delete old zone material.

## Owner queue (his own plate)
- Twilio A2P (gates SMS alerts) · Discord + AI bot · #379/#364 yes/no · Echo/Charlie tuning ·
  hide hobby chains in Admin · Friday Chris talk (deal notes in docs/team/ideas/checkpoint.md) ·
  week-in-review one-pager (offered, not yet built).

## Standing facts (how promotes + the gate work)
- Promote = `bash scripts/promote.sh` after tsc + test-all + `launch-gate.sh staging` green; verify
  prod health + Admin + splash + `launch-gate.sh prod` after. Promote.sh now has a "verified" gate:
  PM must confirm user-facing commits were DRIVEN (not just green tests). Prod is behind the
  coming-soon splash — only peek-holders see it, so pushes are low public risk pre-launch.
- Admin (`public/app.html`) ships WITHOUT a promote via `bash scripts/ship-admin.sh`; server code
  rides the promote. There is ONE Admin (reads prod) — "staging Admin" is a banned phrase.
- Staging redeploys on EVERY push → a gate run mid-deploy reds with a Cloudflare 502; wait for
  /api/health, rerun. Cloudflare origin = *.up.railway.app (admin detection is brand-based, GOTCHAS).
- Compute: `test-all.sh` spawns servers+browsers — don't run reflexively; `bash scripts/kill-tests.sh`
  clears orphans (owner 07-20, it was eating his compute). Playwright: /opt/pw-browsers/chromium.
- Tint saga CLOSED won't-fix (owner). Blind spots (iOS paint, Gmail, call sound) = owner's phone is
  the only verdict; ship one change, "check your phone," never "fixed."

## Provenance
2026-07-19/20 handoff. Big promote to 9121a33 done + verified; Fable e2e harness mid-run on staging;
My Zones redesign decisions locked; the real-card test is the last owner gate. History in git log.

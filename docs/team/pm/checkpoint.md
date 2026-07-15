# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI,
> promotes to prod on the owner's word, and keeps the owner focused on the one thing that matters.
> Talk to the owner like a friend, plain words, no jargon (he reads on a phone). Newest on top.

## ✅ PROMOTE DONE 2026-07-15 ~04:30 UTC — prod is current, Admin live, card test UNBLOCKED
- Promoted staging→main twice: `30e5989` (the big batch: website polish, sheets, admin redesign, zones,
  thrift opt-in, launch-gate harness) + `a31b902` (hotfix, see below). Prod /api/health serves a31b902.
- Merge conflicts in server.ts/config.ts from the old out-of-band peek push: resolved by taking staging
  wholesale; merged tree verified byte-identical to staging before pushing.
- **Regression caught by the prod launch gate: the new coming-soon middleware splashed THE Admin** (naive
  `startsWith("admin.")` host check; prod edge hands the app other hostnames). Fixed same night 48dcb1d —
  gate now mirrors rootHandler's brand-based decision. Trap recorded in docs/shared/GOTCHAS.md.
- Verified live after fix: Admin root + /results serve the Admin; apex + brand subdomains serve the splash;
  peek link serves the consumer app; launch-gate prod: admin UI test passes.
- **DevOps: need X** — launch-gate prod mode: brand-skin tests fail red because the splash blocks a
  cookie-less browser; the prod pass should enter via the peek link (fetch PEEK_CODE like ADMIN_TOKEN).
  Until then "prod gate red on 4 brand-skins only" = expected while the splash is up.
- Known CI red that shipped (owner told): off-brand colors in v2 scope (cosmetic). Playwright browsers in
  this box: use `/opt/pw-browsers/chromium` via PLAYWRIGHT_BROWSERS_PATH (repo pins a newer build).

## THE ONE THING (say it every time until done)
- **Live card purchase test on prod. UNBLOCKED — owner's move.** Fresh customer via his peek link →
  free check → upgrade → REAL credit card. It's the last launch gate. (Pops wiped +14243126356 to a
  blank slate for exactly this; Stripe live products + webhook verified.)

## After the card test (owner's stated queue)
1. Delta-vs-Charlie quality testing with the voice lane (owner renames Ringo → **Echo**; handoff
   at docs/team/voice/). Goal: Delta handles most workflows so cost/call drops.
2. Pops lands the held cheap-bridge wiring (PR #18, flag `cheapBridgeAll` off) — every call path must
   ride Mapper's nav recipes; owner's non-negotiable.
3. Owner owes Pops: Discord server + yes/no on issues #379/#364 (#420/#421 close as superseded).
4. Week-in-review + how-to-hum-better report (owner asked; queued behind the card test).

## In flight right now
- **Webbie:** was mid-changes through the night (sheets sweep, thrift chip); everything pushed is live
  on prod now. His background "boot server" task in the chat UI is his test server — harmless, dies
  with his chat.
- **DD:** data-side fixes (gray-but-mapped stores; Food 4 Less/Ralphs to kiosk-only) — DB work, ships
  itself via the store API, independent of promotes. Confirmed done for the 07-15 promote window.
- **Addie:** admin redesign shipped in the big promote; owner reviews on THE Admin.

## CI health (check before every promote)
- Known reds: off-brand colors in the v2 skin (cosmetic; Webbie's) and gitleaks (dead tokens; Pops
  rotates at launch — rotation list at docs/team/devops/rotation-list.md). Know what's red BEFORE
  promoting. Full local gate: `npx tsc --noEmit` + `bash scripts/test-all.sh` + `bash
  scripts/launch-gate.sh staging` (prod mode right after a promote).

## The rules that got fixed today (all live in CLAUDE.md now)
- Agents merge their own session branches; the owner NEVER merges.
- Map of surfaces is FROZEN: one website (+ staging replica), ONE Admin. No new doors/domains ever.
- "staging"/"prod" = the WEBSITE only. Admin is ONE internal app, ships straight through, no rehearsal copy.
- Your lane's code is yours to build — don't hand off work you own.
- Promote ships the WHOLE staging branch — flag/hold unreviewed visible features.
- Skills exist: build-on-brand, ship-it (done = driven on staging w/ evidence), unblock-yourself,
  known-problems, reply-simple. "Protocol" = reread reply rules. "Full send" = full autonomy.
- Claude Design does NOT auto-read CLAUDE.md — its boot prompt lives in docs/team/design/BOOT_PROMPT.md.

## How the owner wants the PM to talk
- Plain English, like texting a friend who doesn't do tech. No shorthand, no invented words.
- Outcome first, short. One thing at a time. Hold him to the card test. Revert is always one command,
  so promoting is low-risk — the safety net is real.

## Provenance
State as of 2026-07-14 (the long night: repo cleanup, 5 agent fires, rules moved from chats into the
repo, peek door built, pricing set to 20/50/125/400). Re-verify prod vs staging with git + /api/health.

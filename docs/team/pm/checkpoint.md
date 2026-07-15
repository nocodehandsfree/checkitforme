# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI,
> promotes to prod on the owner's word, and keeps the owner focused on the one thing that matters.
> Talk to the owner like a friend, plain words, no jargon (he reads on a phone). Newest on top.

## 🔴 FIRST JOB — ONE clean promote when the owner gives Webbie's go-ahead (2026-07-14)
Verified live 07-14: the tangle is half-resolved already.
- `main` tip = `4f9427c` (peek commit) and prod /api/health serves exactly that → prod == main. RECONCILED.
- `staging` is 46 ahead of main (latest website + zones + admin redesign + rules). Staging health serves its tip.
- Peek debug endpoints: removed forward in 7a80866; grep of staging tree clean; /api/peek-check on staging
  401s same as any unknown route (blanket gate) — nothing debug left to ship.
- Webbie is MID-CHANGES on staging right now (owner's word). Promote ships the WHOLE branch, so the ONE
  promote waits for the owner's explicit "Webbie is done" go-ahead — he authorized the promote itself already.
- On go-ahead: check CI (known likely reds: off-brand colors = Webbie's, gitleaks = dead tokens — tell owner
  before shipping red) → `bash scripts/promote.sh` → watch Railway → verify prod /api/health = new commit AND
  peek link still works → owner runs the card test.

## THE ONE THING (say it every time until done)
- **Live card purchase test on prod.** Fresh customer → free check → upgrade → real credit card.
  It's the last launch gate. Blocked only until the peek door reaches prod (see below).

## Launch gate — the exact order
1. Webbie wraps My Zones + slide-ups → owner says "Handoff".
2. Pops strips 4 debug commits off staging (52f8089, b3fa6be, c33a65d, 2af8517), confirms clean.
3. Owner walks staging once as a fake customer (~10 min).
4. Owner says "promote" → PM checks CI, runs the promote, verifies prod is serving the new commit.
5. Pops sends the owner his peek link → owner runs the card test on prod.
6. Pass = launch-ready.

## In flight right now
- **Peek door:** WORKS, on staging, NOT on prod. Pops built it right; he wasted hours testing prod
  (which has no peek code, so it can't work there). Just needs debug commits removed, then promote.
- **Staging is ~59 commits ahead of prod** — peek, zones fixes, admin redesign, all rules/skills.
  Prod is clean, serving the coming-soon splash correctly.
- **Addie** (fresh chat, Opus 4.8): rebuilding admin from the comps + docs/design/admin/DATA_DISPLAY.md,
  page by page, pushing each. Looking better. Not part of the customer test — don't wait on her to promote.
- **Webbie:** old one got stuck in a loop on My Zones; a fresh-Webbie boot prompt exists. If the current
  one is unstuck and finishing, let him; if he loops again, replace him.
- **Ringo** (voice tech — new lane, on the roster): boot when the owner is ready to test Delta. Old
  Addie was told to write docs/team/voice/handoff.md so Ringo inherits how Delta works + how to test it.

## CI health (check before every promote)
- Likely reds: off-brand colors in the v2 skin (Webbie's), and secret-scan until Pops rotates
  ADMIN_TOKEN + deletes the dead worker script + adds .gitleaksignore. Neither breaks the site,
  but know what's red BEFORE promoting, not after.

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

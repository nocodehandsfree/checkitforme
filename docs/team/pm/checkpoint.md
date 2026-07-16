# Check PM — checkpoint (current state)
> The PM keeps the whole project on task: boots/wraps agents, guards the rules, checks CI,
> promotes to prod on the owner's word, and keeps the owner focused on the one thing that matters.
> Talk to the owner like a friend, plain words, no jargon (he reads on a phone). Newest on top.

## ✅ PROMOTES DONE 2026-07-15 — prod fully current (37f0bca), prod gate 100% GREEN
- Three promotes tonight: `30e5989` big batch → `a31b902` admin-splash hotfix → `37f0bca` (Addie
  round-1 fixes, admin ship-path decouple, gate A1-A8, PR #18: cheap-bridge `cheapBridgeAll` OFF +
  real call-failed reasons + bridge echo gate). Verified live: health=37f0bca, Admin serves, splash
  up, ship-path /ui-version answers "bundled", launch-gate prod ALL GREEN (A8 peek-entry fixed the
  brand-skin reds).
- 07-15 early: prod-edge hostname trap splashed THE Admin; fixed 48dcb1d; recorded in GOTCHAS.
- Known CI red (owner told, cosmetic): off-brand colors in v2 scope. Playwright here: use
  /opt/pw-browsers/chromium via PLAYWRIGHT_BROWSERS_PATH.

## THE ONE THING — owner's combined test on prod (his plan, 2026-07-15)
1. Card test as a TRUE customer: 424 number (blank slate; NOT comp — prod COMP_PHONES is unset,
   verified) → peek link → signup → free check → upgrade → **Family plan, REAL card** → receipts.
2. THEN PM sets prod `COMP_PHONES=+14243126356` (Railway var; auto-redeploys ~1 min) so his account
   can see + call the Fun store (ownerOnly needs comp; comp also stops burning his paid checks).
3. Fun-store Delta calls with Echo (Branson/tape-deck workflow is Fun-store-tied, works on prod).
   This session doubles as Pops's echo-gate bench check (interrupt threshold) — first calls shipped
   untuned on purpose; Echo/Pops adjust if clipping/phantom lines show.
- 424 is also in ADMIN_PHONES (consumer sign-in doubles as Admin login) — expected, harmless.

## After the combined test
1. Delta-vs-Charlie verdict with Echo → decide cheapBridgeAll flip (Admin → Policy; owner's call).
2. Pops rehearses `ship-admin.sh` once → Addie ships Admin UI in seconds, no promotes.
3. Owner: Twilio A2P (waiting on Twilio) · Discord server · #379/#364 yes/no · LEGAL/consent
   (critical GTM, owner-owned, un-started) · hide hobby chains in Admin (thrift chip already
   gone — Webbie did it).
4. Pops small build: enforce per-tier SMS caps (smsAlertsPerMonth is data-only today).
5. Week-in-review + hum-better report (owner asked; queued).

## 🌙 END-OF-DAY AUDIT 07-16 ~03:45 UTC — reset night, fresh chats tomorrow
- **Nothing is lost.** All code is on staging; the only dangling work was docs on session branches —
  folded in tonight (voice strategy checkpoint 41bc33a + ideas/Chris deal thread 4e130f7).
- **Staging is ~75 commits ahead of prod** (everything since 37f0bca): Addie admin rounds + alerts
  sheet, 6 email redesign attempts (Gmail loop, latest = ONE light design c773bfa), DD accuracy batch
  (kiosk=Pokemon-only, distributor map, radius ladder), nav-sync + learned-sync (gray-store fix),
  voice strategy (LAUNCH CHARLIE, Delta shelved, Fun→Branson Global), alerts mute/stop, copy.
- **Support's "Admin not on staging" confusion:** Admin = prod service; Addie's work waits on promote
  (or ship-admin.sh, live on prod but not yet rehearsed). Vocabulary: there is no "staging Admin".
- **Tint saga closed for tonight:** Webbie's 2 attempts + PM's structural attempt all reverted;
  staging = clean baseline. Root cause documented (transformed sheets hijack position:fixed) —
  boxed brief ready for the dedicated iOS tint chat. Only the owner's iPhone judges tint work.
- **Gate state end-of-day: ALL GREEN** — tsc, full suite (design tokens green for the first time),
  staging launch gate 23/23. One earlier red = Cloudflare 502 mid-redeploy (staging restarts on every
  push; don't gate while a push is landing). Cloudflare origin = voice-caller-*.up.railway.app
  (confirms the GOTCHAS hostname trap).
- **Awaiting owner's word to promote** → levels prod = staging for the fresh start.

## Tomorrow's restart plan
1. Owner sends "Handoff" to every wonky chat (they checkpoint + push), then kills them.
2. Fresh boots: iOS tint chat (box in PM chat 07-16) · fresh Addie for EMAILS ONLY (Gmail loop needs
   one narrow contract) · fresh Webbie. Echo stays (checkpoint current).
3. Pops: one ship-admin.sh rehearsal → Admin UI independent of promotes for good.
4. Still owner's: THE card test (O1) · Fun-store Charlie listen · Twilio A2P · legal/consent · Friday
  Chris talk (deal notes in docs/team/ideas/checkpoint.md).

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

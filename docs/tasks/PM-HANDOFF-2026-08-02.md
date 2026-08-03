# PM HANDOFF — 08-02 evening

The outgoing PM's chat is spent. Everything below is verified against the real branches and the live
sites, not remembered. **`docs/tasks/THE-ORDER-2026-08-02.md` has the queue; this file has what
changed since, and what the owner is thinking.**

## THE OWNER'S RULING, 08-02: FINISH EVERYTHING BEFORE THE REFACTOR

The code cleanup (`claude/refactor-server-routes-zbi8kp`) takes the main server file from about
7,400 lines to about 600 and splits the rest into `src/routes/`. **It is a major change to how every
agent finds anything, and the owner wants it LAST, not in the middle.** The earlier plan said
middle; he overruled it and he is right — half-finished work everywhere plus a re-arranged tree is
how a silent breakage hides.

**Nothing merges the refactor until every agent below is finished and merged.**

## DONE AND LIVE ON STAGING (08-02)
- **Charlie round 2** — merged. Nothing but a real person opens Charlie; our own 5-minute cost cutoff
  no longer gets blamed on the store; the machine-phrase rule is an owner ruling in the Charlie
  record. Rig green after the merge: delta-clip 143 · prompts 108 · check-life 15 · behaved 39 ·
  bridge 13 · tsc clean · staging serving HEAD.
- **The robot store** — merged, and PM-audited. Verdict: substance PASSED (additive, zero blast
  radius on real checks, tests provably fail under mutation). Three blockers were raised and Echo
  fixed all three: a hard ceiling of 12 checks a run, a refusal to dial unless the store really is
  106362, and the money assertion made able to fail. **Its own findings are the biggest open fault
  in the business — see below.**
- **Admin** — the owner-email Off switch, the Statuses page, every Yes button, the double-tap zoom
  guard, and the duplicate status collapsed. All live.

## THE BIGGEST OPEN FAULT (found by the robot store, not by a human)
**Once Staff put us on hold, nothing they say afterwards is written down.** One check had Staff come
back with "yeah, we've got a few" and it was filed as left on hold. Another came back with "I did
not see any" and the screen said IN STOCK. Same shape on a transfer and on a hang-up.
`docs/tasks/words-after-a-hold-are-lost.md`. `node scripts/robot-check.mjs 5 6 8 9 10` proves the day
it is fixed.

## THE QUEUE THE OWNER WANTS (his order, 08-02 evening)
1. **Mapping phase 3** — finish it. Its own PM audits.
2. **Logo agent** — finish his build: a logo updated on the logo wall lands everywhere at once, at
   the right size for each place.
3. **Webbie** — when a store is muted automatically because its map was lost, take it OUT of
   auto-check and out of Manage Zones. Owner raised 08-02, not yet specced.
4. **The Testing section in Admin** — a FRESH Echo chat. The spec is
   `docs/specs/charlie-behavior/echo-build.md` PART 4 plus round 1 (PART 1). Owner-approved line by
   line. The card can only show what the engine records, so round 1 comes first in the same chat.
5. **THEN the refactor** — audit it and merge it last.

## A THING THE OWNER JUST FOUND, NEEDS ANSWERING
**Addie's Statuses changes appeared on the PRODUCTION site immediately.** He expected them to land on
staging first and be pushed. Statuses are one of the four things the settings mirror copies
(`src/settings-sync.ts`, whitelist: `policy_json` · `vt_plans` · `support_banner_*` · `statuses`),
and Admin writes production data directly by design (CLAUDE.md, "Data" ship path). The shell-level
Live/Staging toggle does not cover it — that is the parked task
`docs/tasks/admin-audit-env-switch.md`. **The PM owes him a plain answer on whether this is working
as designed or is a real gap, and what it would take to make Admin edits land on staging first.**

## PROMOTES WAITING ON HIS WORD
- The in-stock owner email still sends on the real site until a promote.
- Everything built since 07-30 is staging-only, including the whole new calling engine (it stays OFF
  on the real site behind its switch regardless).

## THE LAW
`docs/specs/charlie-behavior/README.md` — how Charlie must behave, in the owner's own words, every
log line and every pass/fail row on both sides. **If it and the code disagree, the document is right
and the code is the bug.** Work orders beside it: `echo-build.md`, `echo-build-round-2.md`.

## HOW THIS OWNER NEEDS TO BE WORKED WITH (earned the hard way today)
- **One agent at a time.** Two agents that "can't collide" still means he holds conditions in his
  head across two chats. He said it plainly: do not make him juggle.
- **Never invent.** Twice today the PM produced a plausible list instead of saying "this is not
  written down anywhere". Both times he caught it. Search first, then say you do not know.
- **Audit everything, including your own fix list.** He asked the PM to re-audit its own findings
  before handing them over, and nine of eleven were already fixed. That check saved a wasted chat.
- **Never start a background job he did not ask for.** He watches the compute.
- Reply for a phone: the answer first, in his words, one screen, one question, then stop.

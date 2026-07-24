# STATE — the owner's single source of truth
One screen. Every session updates this at close (the doc-cap gate holds it ≤40 lines). New truth
REPLACES old — history is in git. Last updated: 2026-07-24 (calling emergency root-caused, screen fix live).

## The calling emergency (07-23 night) — cause found, fix shipped, one check from you closes it
- Every failed test you made ran on the PRIOR session's broken build. The revert went live at
  6:31 PM your time; your tests ran 5:48–6:23 PM, all on the broken engine. Your two later calls
  (6:43 CVS, 6:44 Target) ran on the fixed engine but ended at 48s and 10s — hung up before the
  agent joins (CVS walks its phone menu for 67 seconds, Target 16).
- Proof pulled tonight: the phone company shows every call was ANSWERED (nothing rang out unanswered);
  the server log for your 6:44 Target call shows the fixed engine arming the correct menu plan.
  Engine code, menu maps, store phone numbers, and the agent's brain are all verified identical to
  the last known-good state. The real site (checkitforme.com) was never affected.
- What WAS still broken: the call screen sat on "It's ringing" in silence through the whole menu
  walk, so working calls looked dead and got hung up on. FIXED on staging: the screen now shows
  "We've connected" the moment the store's system picks up, then "Working through the menu…".
- YOUR one check: run a Target check on staging and let it sit 60–90 seconds without hanging up.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check them on your phone, then say
   "promote" to push to the real site. NOT on the real site yet.
2. **Admin spec agent parked** at the Admin `#preview` view — resumes when you pick light-pass vs
   full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push the finished work to the real site (five site fixes + alerts and zone-lane
  fixes ride along together).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)

## Next actions (no decision needed)
- Site and Admin work their queued fixes; Data chases the staging store-list overwrite.
- Full queue with active / parked / dead marked: docs/tasks/INDEX.md.

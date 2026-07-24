# STATE — the owner's single source of truth
One screen. Every session updates this at close (the doc-cap gate holds it ≤40 lines). New truth
REPLACES old — history is in git. Last updated: 2026-07-24 (calling emergency root-caused, screen fix live).

## The calling emergency (07-23 night) — cause found, fixed, one check from you closes it
- Your failed tests all ran on the prior broken build; the real site was never affected. Engine code,
  menu maps, store numbers and the agent's brain are verified identical to the last known-good state.
- Fixed on staging: the call screen shows real steps · you can hear calls from the moment the store
  picks up · Charlie joins only on a real human voice · nobody-answers calls end themselves unbilled.
- YOUR one check: one Target or CVS call on staging, hands off, listening. Then say "promote".

## Admin fixes, live now (07-24)
- The Live/Staging switch is BACK, top right on every page, with the new icons and plainer wording.
  The rollback did not cause it: the redesign was put on your dashboard off a side copy that was never
  saved into the main one, so the next Admin update replaced it. Saved properly now.
- Restock "By store" shows real store logos instead of two-letter boxes. (On the Live setting this one
  needs a promote; on Staging it already works.)
- Call rows show the status ICON only, no repeated "Nobody answered" text. Tap the row for the words.
- Five store logos were marked the wrong shape so they drew too small or squashed. Fixed on the live
  data: Ross, Micro Center, Tokyo, Walmart. Tom Thumb was already right.

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

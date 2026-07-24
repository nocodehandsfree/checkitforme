# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-24 (Target trees mapped; calling emergency root-caused).

## The calling emergency (07-23 night) — cause found, fixed, one check from you closes it
- Your failed tests all ran on the prior broken build; the real site was never affected. Engine code,
  menu maps, store numbers and the agent's brain are identical to the last known-good state.
- Fixed on staging: the call screen shows real steps · you can hear calls from the moment the store
  picks up · Charlie joins only on a real human voice · nobody-answers calls end themselves unbilled.
- YOUR one check: one Target or CVS call on staging, hands off, listening. Then say "promote".

## Admin fixes, live now (07-24)
- The Live/Staging switch is BACK, top right on every page, with the new icons and plainer wording.
- Restock "By store" shows real store logos instead of two-letter boxes (Live needs a promote).
- Call rows show the status ICON only (tap for words); five squashed store logos fixed on live data.

## Target: 59 stores called in 24 states — you were right, there is basically ONE menu (07-24)
- 55 of 59 stores put the service desk on 2, exactly what we press today. Four stores have no service
  desk option at all, so our 2 lands in groceries: Mission Hills, North Hollywood, UC San Diego and
  one in Boston. We cannot tell those four apart from our store list, but every store reads its
  department list out loud before we choose, so we can hear which kind it is.
- A person really answers 30 to 45 seconds in, not the 16 the setting says.
- Nothing changed. Options written up in docs/team/voice-calls/report-target-trees-2026-07-24.md.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check them on your phone, then say
   "promote". NOT on the real site yet.
2. **Admin spec agent parked** at the Admin `#preview` view — resumes on light-pass vs full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push the finished work to the real site (five site fixes + alerts and zone-lane
  fixes ride along).
- Target: per-store second key, or let the caller listen and pick the desk (see above).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)

## Next actions (no decision needed)
- Site and Admin work their queued fixes; Data chases the staging store-list overwrite.
- Full queue with active / parked / dead marked: docs/tasks/INDEX.md.

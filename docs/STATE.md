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

## Target stores do NOT share one phone menu (07-24, 11 real calls to 5 stores)
- Every Target opens the same: press 2 for a department. The DEPARTMENT list after that is different
  store to store. At Granada Hills, Topanga, Austin and Coral Springs, 2 is the guest service desk.
  At Mission Hills there is no desk option at all: 2 is the FOOD department and the person is 3.
- That is why your Mission Hills checks die in the menu, and a person really answers 30 to 45 seconds
  in, not 16. Nothing changed; one setting for all Targets cannot be right.
- YOUR call: store the second key per store, or have the caller listen to the department list and
  pick the desk itself. Detail: docs/team/voice-calls/report-target-trees-2026-07-24.md.

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

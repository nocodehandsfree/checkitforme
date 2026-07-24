# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-24 (Target store numbers filled; calling emergency root-caused).

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

## Target: 70 stores called — the store number tells us which menu it has (07-24)
- Number 3000 or higher = a small city or campus store, no service desk, press 3 for the person.
  Below 3000 = a full store with the desk on 2, which is what we already press. 11 of 11 in a blind test.
- The store number is now on EVERY Target we have. The 73 California ones that were blank: 72 filled
  from Target's own store pages, address and phone both matched, live on the real site and staging.
  The last one, East Palo Alto on E Bayshore Rd, is closed for good (see the decision below).
- The Calc page under-counts the phone bill: the phone company charges by the whole minute, so a call
  one second past 60 costs double. Real limit is 40 seconds to a person, not 70. Detail in the report.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check on your phone, then say "promote".
2. **Admin spec agent parked** at the Admin `#preview` view — resumes on light-pass vs full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push the finished work to the real site (five site fixes + alerts and zone-lane
  fixes ride along).
- Target: use the store number to pick the right key, or have the caller listen (see above).
- East Palo Alto Target is closed for good. Hide it? (yes / no)
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)

## Next actions (no decision needed)
- Site and Admin work their queued fixes; Data chases the staging store-list overwrite. Full queue
  with active / parked / dead marked: docs/tasks/INDEX.md.

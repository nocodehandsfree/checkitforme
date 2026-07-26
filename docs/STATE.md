# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-26 (the phone-menu map is now versioned + trusted; sweep ready for morning).

## The store map is real knowledge now, ready to call in the morning (07-26)
- Every mapping call now keeps its own proof: what we said, which recording we said it after, how fast
  we got to a person. Repeat calls raise trust; a route that CHANGES waits for your yes before it goes
  live. Nothing gets overwritten any more, so you can see what changed and when.
- Two things the old map was hiding: 16 chains (Safeway, Albertsons, Walgreens, Kohl's…) were just the
  robot mashing 0, and 46 chains claim "a person answers" with no call behind it. Both are flagged.
- Found and fixed: half the keypad chains stored a key with no timing, so live checks pressed NOTHING
  (HomeGoods, Big 5, Barnes & Noble, GameStop, Staples, Marshalls…). They press again now.
- Not verified on a real call yet — nothing was phoned tonight. Morning sweep: east coast first.

## Admin fixes, live now (07-24)
- The Live/Staging switch is BACK, top right on every page. Restock "By store" shows real store logos
  (Live needs a promote). Call rows show the status ICON only; five squashed store logos fixed.

## The phone menus are fixed on staging — go try one (07-25)
- Calls no longer press or speak on a stopwatch. They now wait until the recording actually stops
  talking, then press. That was the whole bug: a store with a longer greeting got talked over.
- Driven on two real calls (Target Topanga, CVS Mulholland) — both reached a person. Costs nothing
  extra. Talk time is the next thing to fix: a clerk walked away for 25s with the agent on the line.

## Target: 70 stores called — the store number tells us which menu it has (07-24)
- Store number 3000 or higher = small store, press 3 for the person; below 3000 = desk on 2. 11 of 11
  in a blind test. Every Target now carries its number; a store found closed gets muted, never deleted.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check on your phone, then say "promote".
   **Admin spec agent parked** at `#preview` — resumes on light-pass vs full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push finished work to the real site (five site fixes + alerts and zone-lane fixes).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
## Next actions
- Site and Admin work their queues; Data chases the staging store-list overwrite. All: docs/tasks/INDEX.md.

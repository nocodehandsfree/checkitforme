# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-24 (Target store numbers filled; calling emergency root-caused).

## Admin fixes, live now (07-24)
- The Live/Staging switch is BACK, top right on every page. Restock "By store" shows real store logos
  (Live needs a promote). Call rows show the status ICON only; five squashed store logos fixed.

## The phone menus are fixed on staging — go try one (07-25)
- Calls no longer press or speak on a stopwatch. They now wait until the recording actually stops
  talking, then press. That was the whole bug: a store with a longer greeting got talked over.
- I drove two real calls. Target Topanga: pressed 8 seconds later, a person answered, real answer with
  the set name. CVS: said "no" when the question actually ended instead of 10 seconds early, got
  transferred, a person said nothing came in. Test site only, Target and CVS; the real site untouched.
- Costs nothing extra. Both calls still ran over 5 cents, NOT from the menu: the clerk walked away for
  25 seconds with the agent on the line. Talk time is the next thing to fix.

## Target: 70 stores called — the store number tells us which menu it has (07-24)
- Number 3000 or higher = a small city or campus store, no service desk, press 3 for the person. Below
  3000 = a full store with the desk on 2, what we already press. 11 of 11 in a blind test.
- The store number is now on EVERY Target: 72 of 73 blank California ones filled; East Palo Alto is
  closed for good and muted. New rule: a store we find closed gets muted, never deleted.

## The plans page: Continue can't get lost any more (07-26, staging)
- Tap a plan and a small bar rises from the bottom holding that plan, its price and Continue. It floats
  over the list like the basket in My Zones, so Continue is always on screen no matter how far you scroll.
- Pay as you go no longer shrinks the sheet and drops it down the page. Same height on both tabs.
- Monthly / Annual is now a small pair of keys next to "You're on the ... plan", not the wide bar you
  rejected. "save 17%" sits inside the Annual key. NOT checked: how it looks on your phone.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check on your phone, then say "promote".
   **Admin spec agent parked** at `#preview` — resumes on light-pass vs full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push finished work to the real site (five site fixes + alerts and zone-lane fixes).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
## Next actions
- Site and Admin work their queues; Data chases the staging store-list overwrite. All: docs/tasks/INDEX.md.

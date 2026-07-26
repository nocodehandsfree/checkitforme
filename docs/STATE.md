# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-26 (call receipts live; the store map is now versioned and trusted).

## The store map is real knowledge now, ready to call in the morning (07-26)
- Every mapping call keeps its own proof: what we said, which recording we said it after, how fast we
  reached a person. Repeat calls raise trust; a route that CHANGES waits for your yes; nothing gets
  overwritten, so you can see what changed and when.
- Two things the old map hid: 16 chains (Safeway, Walgreens, Kohl's…) were just the robot mashing 0,
  and 46 chains claim "a person answers" with no call behind it. Both flagged. Also fixed: half the
  keypad chains stored a key with no timing, so checks pressed NOTHING (HomeGoods, Big 5, GameStop…).
- **Called a CVS in Anaheim at 11pm to prove it.** It walked the menu, got to the desk in 62 seconds,
  5 faster than we had on file, and raised its own confidence with nobody touching it.
- That call taught us we were counting "a person answered" from the moment the machine says
  "transferring you now" — about 17 seconds early. Mapping now waits for a real voice, hangs up as
  soon as someone speaks, and stops any call that is going nowhere. The agent joining early is
  measured on every call now and is Echo's to fix.
- **One set of recipes.** Staging no longer keeps its own: what it learns is written to the real
  site's mapping records, so both run exactly what you see in Admin.

## Every call now writes a receipt — staging (07-26)
- Open any check and see the whole call with real seconds and money: dialed, ringing, every menu step,
  when a person answered, when the agent joined and left. Agent time splits into talking, listening
  and dead air — dead air is the number we drive down. Fun store: 16s call, 6s dead air, 4.0¢.

## Target: 3000 or higher = small store, press 3; below 3000 = desk on 2. 11 of 11 blind (07-24).
## The plans page: Continue can't get lost any more (07-26, staging)
- Tap a plan and a bar rises from the bottom with that plan, its price and Continue — always on screen
  however far you scroll. Monthly / Annual is a small pair of keys now. NOT checked on your phone.

## Site fixes (five) — DONE on staging, waiting on you. Check your phone, then say "promote".
## Decisions waiting on YOU
- Say "promote" to push finished work to the real site (five site fixes + alerts and zone-lane fixes).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
## Next actions
- Site + Admin work their queues (Admin spec agent parked at `#preview`); Data chases the staging
  store-list overwrite. All: docs/tasks/INDEX.md.

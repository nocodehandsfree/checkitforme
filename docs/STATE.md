# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-26 (call receipts live; the store map is now versioned and trusted).

## The phone menus are fixed on staging — go try one (07-25)
- Calls wait until the recording actually stops talking before they press or speak. Drove two real
  calls (Target Topanga, CVS) — both reached a person. Talk time is the next cost to fix.

## The store map is real knowledge now, ready to call in the morning (07-26)
- Every mapping call keeps its own proof: what we said, which recording we said it after, how fast we
  reached a person. Repeat calls raise trust; a route that CHANGES waits for your yes before it goes
  live. Nothing is overwritten any more, so you can see what changed and when.
- Two things the old map hid: 16 chains (Safeway, Walgreens, Kohl's…) were just the robot mashing 0,
  and 46 chains claim "a person answers" with no call behind it. Both flagged.
- Found and fixed: half the keypad chains stored a key with no timing, so live checks pressed NOTHING
  (HomeGoods, Big 5, Barnes & Noble, GameStop, Staples, Marshalls…). They press again.
- Nothing was phoned tonight — not verified on a real call. Morning sweep: east coast first.

## Every call now writes a receipt — staging (07-26)
- Open any check and see the whole call with real seconds and real money: dialed, ringing, every menu
  step and what fired it, when a person answered, when the agent joined and left, the answer.
- Agent time is split into talking, listening and dead air. Dead air is the number we drive down — he
  bills the same either way. Drove it on the Fun store: 16s call, agent on 13s, 6s dead air, 4.0¢.

## Target: the store number tells us which menu it has (07-24)
- 3000 or higher = small store, press 3; below 3000 = desk on 2. 11 of 11 blind. On every Target now.

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

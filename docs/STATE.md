# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-27 (Chains page rebuilt around the phone menu, live on your Admin).

## The Chains page is rebuilt, live on your Admin now (07-27)
- Tap a chain and the list gets out of the way. One screen: what a check costs there, how long to a
  person, what the menu itself costs, then the menu as a list of steps with the second each one fires
  at. Everything else is one tap away. "All chains" walks back. The list reads "Bravo 41s" now, not
  the word "mapped", so you can scan it without opening anything.
- Checked against all 131 real chains: CVS 6.1¢, and you can SEE the 19 seconds of ringing after its
  menu ends. Walgreens presses 0 four times. Ross picks up directly. NOT checked: the browser on this
  machine cannot reach the internet, so I never tapped the real site. Check your phone.
- Money bug fixed on the way: the agent rate behind every Calc number was 15% too high. The dashboard
  plan (costs, replay, timelines, menu approvals) is written and waiting on real checks:
  `docs/specs/admin-ops-dashboard/CONTRACT.md`. No old data comes forward, it was measured wrong.

## The store map is real knowledge now, ready to call in the morning (07-26)
- Every mapping call keeps its own proof: what we said, which recording we said it after, how fast we
  reached a person. Repeat calls raise trust; a route that CHANGES waits for your yes; nothing gets
  overwritten, so you can see what changed and when.
- Two things the old map hid: 16 chains (Safeway, Walgreens, Kohl's…) were just the robot mashing 0,
  and 46 claim "a person answers" with no call behind it. Both flagged. Also fixed: half the keypad
  chains stored a key with no timing, so checks pressed NOTHING (HomeGoods, Big 5, GameStop…).
- **Called a CVS in Anaheim at 11pm to prove it.** Walked the menu, desk in 62 seconds, 5 faster than
  we had on file. It also caught us counting "a person answered" from "transferring you now", about 17
  seconds early. Mapping waits for a real voice now, and staging writes to the one set of recipes.

## Every call now writes a receipt — staging (07-26)
- Open any check and see the whole call with real seconds and money: dialed, ringing, every menu step,
  when a person answered, when the agent joined and left. Agent time splits into talking, listening
  and dead air — dead air is the number we drive down. Fun store: 16s call, 6s dead air, 4.0¢.

## Target: 3000 or higher = small store, press 3; below 3000 = desk on 2. 11 of 11 blind (07-24).
## Plans page: the picked plan rides a bar that is always on screen (07-26, staging, not on your phone).
## Site fixes (five) — DONE on staging, waiting on you. Check your phone, then say "promote".
## Decisions waiting on YOU
- Say "promote" to push finished work to the real site (five site fixes + alerts and zone-lane fixes).
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
## Next actions
- Site + Admin work their queues; Data chases the staging store-list overwrite. All: docs/tasks/INDEX.md.

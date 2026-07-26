# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-26 (every call now writes a receipt: what happened, when, what it cost).

## The phone menus are fixed on staging — go try one (07-25)
- Calls no longer press or speak on a stopwatch. They now wait until the recording actually stops
  talking, then press. That was the whole bug: a store with a longer greeting got talked over.
- Drove two real calls. Target Topanga pressed 8s later and got a real answer; CVS said "no" when the
  question actually ended instead of 10s early. Test site only, Target and CVS. Costs nothing extra.
- Both still ran over 5 cents, NOT from the menu: the clerk walked away for 25s with the agent on the
  line. Talk time is the next thing to fix.

## Every call now writes a receipt — staging (07-26)
- Open any check and see the whole call: dialed, ringing, which lane it used, every menu step and
  whether the store's own pause or the clock fired it, the moment a person answered, the moment the
  agent joined and left, voicemail, giving up, the answer. With real seconds and real money.
- The agent's connected time is now split into talking, listening and dead air. Dead air is the
  number we drive down — he bills the same whether he talks or sits silent.
- Drove it on the Fun store: 16 second call, agent on 13 seconds, 6 of them nobody talking, 4.0¢
  total. No change to how calls run. Real site untouched.

## Target: 70 stores called — the store number tells us which menu it has (07-24)
- 3000 or higher = small city/campus store, no service desk, press 3. Below 3000 = desk on 2, what we
  already press. 11 of 11 blind. Number now on EVERY Target. A store found closed gets muted, never deleted.

## The plans page: Continue can't get lost any more (07-26, staging)
- Tap a plan and a small bar rises from the bottom with that plan, its price and Continue — always on
  screen however far you scroll. Pay as you go no longer shrinks the sheet. Monthly / Annual is now a
  small pair of keys, not the wide bar you rejected. NOT checked: how it looks on your phone.

## Two work streams from before (unchanged)
1. **Site fixes (five) — DONE on staging, waiting on you.** Check on your phone, then say "promote".
   **Admin spec agent parked** at `#preview` — resumes on light-pass vs full-rebuild.

## Decisions waiting on YOU
- Say "promote" to push finished work to the real site (five site fixes + alerts and zone-lane fixes).
- Light pass vs full rebuild of the Admin.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
## Next actions
- Site and Admin work their queues; Data chases the staging store-list overwrite. All: docs/tasks/INDEX.md.

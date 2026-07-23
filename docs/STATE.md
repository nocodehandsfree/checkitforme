# STATE — the owner's single source of truth
One screen. Every session updates this at close (the doc-cap gate holds it ≤40 lines). New truth
REPLACES old — history is in git. Last updated: 2026-07-23 (system rebuild finished: gates + the
answer-first output style + doc-size caps are all live).

## Two work streams you started
1. **Site fixes (five)** — small consumer-site fixes are queued: store name cut off on alert cards ·
   alerts sheet spacing · zone checks missing from the activity dashboard · wrong logos in My Zones +
   the call log · a copy-doc location mix-up. The site is frozen, so each one needs you to name it before
   it unlocks. Files: the five site tasks in docs/tasks/INDEX.md.
2. **Call/log investigation** — a real Fun-store check came back with its transcript cut off. Filed as a
   task to chase the capture gap in the call log. No engine change without your word.

## Parked (paused on purpose)
- **Admin spec agent** is parked at the Admin `#preview` view — it resumes once you pick light-pass vs
  full-rebuild below.
- **First promote after the rebuild** — prod + Admin light up on the live check the moment you say
  "promote." The alerts server half + the zone fix ride along.
- **Real-card test** — needs you to run a real signup + card. Alerts can't actually send until Twilio
  and Brevo clear.

## Decisions waiting on YOU
- **Light pass vs full rebuild of the Admin** — your call; the parked Admin agent waits on it.
- Hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no)
- Say "promote" when you want the finished alerts + zone fix to reach the real site.

## Next actions (no decision needed)
- Site and Admin work their queued fixes; Data chases the staging store-list overwrite.
- Full queue with active / parked / dead marked: docs/tasks/INDEX.md.

# Auto-checks get their own section (owner-named 2026-08-05)

**System:** site · **Status:** build NOT started. ONE comp approved (the list), the rest still need
sharpening. Consumer site is frozen: this task IS the unlock authority for `public/checkit.html`.

**THE PICTURES AND WHERE THEY STAND: `docs/specs/auto-checks/README.md`.** Read it before you draw
anything. The owner's ruling 08-06, his words: a ring filled 3 of 12 reads as progress toward a
finish line, and an auto-check has no finish line, it runs forever, so that is the wrong shape for
the data. He wants the report sharpened before it is built. Only the list screen is approved.

## What the owner asked for
Auto-checks is its OWN row and its OWN slide-up in My checks, beside Alerts, never merged with it.
Every screen copies the format of the slide-ups that already exist (Alerts is the model): sheet with
the grab handle, centred icon, centred title, one short line under it, then the rows.

**Also in this build (owner 08-05): rename the "Manage Zones" row to just "Zones".**
Copy key `acct.row.zones` (EN ~:7192, ES ~:3379). Spanish twin ships in the same commit.

## The screens
1. **The row in My checks** — between Check history and Alerts, its own icon (a repeating clock, so it
   never reads as Check history's calendar), sub line = how many stores are on a schedule.
   The buried `YOUR AUTO-CHECKS` block at the bottom of that screen (`#acctScheds`, `renderAcctScheds`)
   GOES AWAY: it moves into the new slide-up.
2. **The list** — its own slide-up, same shape as Alerts: Pause all row, then one row per store with
   the store's logo tile, the store name, the days and time, an On/Off switch and a delete button.
   **APPROVED by the owner 08-05 as comped.** This is the screen the row in My checks opens.
3. **Saved — RULED 08-06, BUILD IT.** His words: after you save your first auto-check from the check
   status page, DO NOT close the window. The sheet flips to a screen saying the auto-check is saved
   (the pattern `sr_done` and `openWatchConfirm` already use), showing store, product, days, time and
   the next check, and it carries a button that jumps STRAIGHT INTO the auto-checks list, where their
   first check will show. Today `submitSchedule` does the opposite: `closeSchedule()` then a bottom
   note. No email on save (owner ruled).
4. **What they found** — the per-store report. **Reached by tapping the store row in screen 2 —
   CONFIRMED by the owner 08-06** ("if you select any of those you'll be able to go into the details
   of that"); the On/Off switch and the delete button stay taps of their own, so the row needs its own
   tap target. THE RING IS DEAD (owner 08-06). The report is the Activity tab's shape: one week of day
   bars, tap a day, that day's checks list underneath, tap a check and it unfolds into the real check
   status page with the conversation, the way a store unfolds inside a zone report (`zoneExpand`).
   Built from the page's own pieces: the Activity bar and row (`checkit.html` ~:7311 and ~:7329),
   `deriveVerdict`, `combinedTimelineHTML`. Pictures: `comp-4-report-v3-week.png` +
   `comp-5-report-v3-open.png`. No new strings, so nothing new needs Spanish.

## The bug this build must fix
A comped account can SAVE an auto-check but never SEE it: the server allows the save
(`isCompAccount(a) || subscription === "active"`, `/app/schedule`) while the page hides the list
unless `ACCOUNT.subscription === 'active'` (`loadSchedules`, checkit.html ~:4186). That is why the
owner has never seen an auto-check screen.

Also: a finished auto-check is indistinguishable from a check the customer ran themselves.
`customerScheduleId` is on the result row server-side and never surfaced. The owner has NOT asked for
a tag on the My checks screen (08-05: no auto-checked stores listed there), so surface it only inside
the auto-check report.

**Verify-live output (paste on close):**
```
(none yet)
```

# Auto-checks get their own section (owner-named 2026-08-05)

**System:** site · **Status:** comps approved in chat, build not started.
Consumer site is frozen: this task IS the unlock authority for `public/checkit.html`.

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
3. **Saved** — what the customer sees the moment they turn one on. The auto-check sheet flips to a
   confirmation (the pattern `sr_done` and `openWatchConfirm` already use), showing store, product,
   days, time and the next check, plus a way into the list. No email is sent on save (owner ruled).
4. **What they found** — the per-store report: times in stock over checks run, the day they had it
   most often, then every check with its status icon. Opened from a row in the list.

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

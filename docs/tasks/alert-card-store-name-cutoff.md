# Store name gets cut off on alert cards

**What:** On the Alerts rows (restock-alert cards) the on/off toggle AND the delete button crowd the
row, squeezing the store name so long names cut off. Rework the row layout so the FULL store name
always shows (e.g. give the name its own line / room, keep the toggle + delete compact). Consumer
site is FROZEN: owner-named, so use the .unlock flow for the alert-row section only (INDEX.md range).
**Done when:** A long-name store (e.g. "Barnes & Noble Booksellers Marina") renders its full name
clean on the alert row on a 390pt phone, WITH the on/off toggle and delete button still usable, EN + ES.
Truth snapshot re-taken.
**Lane:** Webbie
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
Built on branch claude/webbie-task-queue-c4wpxu (PR). Row reworked to a stacked layout
(name full-width, 2-line wrap; On/Off + delete on their own line). tsc clean, inline JS parses.
NOT on staging yet — verify-live + re-snapshot pending merge to staging.
```

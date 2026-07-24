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
verify-live 2026-07-23: staging https://staging.checkitforme.com/ → LIVE (serving HEAD 4f6c4a6).
Row reworked to a stacked layout (name full-width 2-line wrap; On/Off + delete on their own line;
.alrow scoped so the homepage list is untouched; markers in live snapshot). Truth snapshot re-taken.
Owner eyeballs a long store name on his phone.
```

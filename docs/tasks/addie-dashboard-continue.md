# The Admin dashboard, continued (new Addie)

**System:** admin · **Status:** BOTH JOBS DONE 07-29 (`0f2b6b7e`)
**What:** extend the EXISTING dashboard. Never rebuild it, never add nav (LAW 4 — the nav gate
blocks any new group, tab, or section).

- **Job 1 (Menu versions row): was ALREADY WIRED, and I proved it rather than rebuilding it.** The
  task text was stale: the hardcoded "No saved versions yet" came out at `95110729` and the row has
  read `/api/admin/map/chain/:id` since `99586ae1`. Drove it on the shipped Admin at 390px: tapped
  Target, the row read "1", and the sheet showed "Recipe 1 · Jul 27 · Live · Press 2, then press 2 ·
  16s to Staff · Needs review". Tapped chain 5: the row read "3" in amber and the sheet showed all
  three recipes with **Use it** and **Keep current** on the proposed one. Nothing to build.
- **Job 2 (trim Policy): CHECKED BEFORE CUTTING, and pricing STAYS.** The comp is explicit
  ("Flags and pricing stay as a console" · "Policy is CONSOLE plus queues"), so the audit's "pricing
  where it belongs" means HERE, in console grammar. A console has no save key, so the two-column grid
  of bare number boxes plus **Save pricing** became seven console rows with the flag row's anatomy,
  each saving when you leave the field. What actually left: the web-analytics ID (an app-wide default,
  now a row on App) · `loadGwIntel` (deleted: its holder was gone and the Restock page owns
  `/api/admin/restock-intel`) · the `loadGwPulse` + `loadGwKiosks` calls (Live and Kiosk each load
  their own; Policy was painting two other pages on open). All four queues and the Plans link stay.
- Contract steps 4 and 5 (store/retailer explorers, review queue) stay parked until real checks exist.

**Driven on the shipped Admin, 390x844, real data**
- No save button on the console · seven rows, none wrapping and none clipped · no sideways scroll.
- A real save: Members-see-finds-first 10 → 11 landed on the server ("Saved"), restored to 10, and
  `pricing` came back byte-identical, so a row writes only its own field.
- "abc" into per-check price snapped back to 25 with "That needs to be a number".
- Policy's fetches on open: policy · plans · watches · community · waitlist · store-requests. No
  pulse, no kiosk, no restock-intel.
- The Plans link wrapped onto two lines at phone width, so its counts moved to the sub line.
- Not checked: how any of this looks on a real iPhone (no iOS here), and the open iOS bottom tint.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
HEAD = 0f2b6b7efe2b · origin/main = 55badd886004
staging  https://staging.checkitforme.com/ → LIVE (serving HEAD)
prod     https://checkitforme.com/ → NOT-LIVE (serving 55badd886004) — expected until the next promote
admin    https://admin.checkitforme.com/ → server 55badd886004 (rides the promote)
admin shell override → {"commit":"0f2b6b7e","bytes":646788}   ← the screens above, live now
```

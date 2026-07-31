# Go-live site audit (owner asked 07-31, research only — fix AFTER his Echo/Charlie testing)

**System:** site · **Status:** active — findings list, nothing built. Owner adds/reorders freely.

## Confirmed by driving staging or reading the exact code
1. **Alerts slide-up sits too short.** The sheet is sized by its content (max-height 86vh, no
   minimum), so with one or two alerts it parks low and the My checks screen shows behind it.
   Owner wants it to rise high enough to cover what is behind. (`#alertsOv .modal`, ~:2088.)
2. **Radius slider reloads slowly.** Every slider stop fires a fresh `/pub/stores/near` (200-store
   ask, no debounce, no local cache) — measured 488ms for 87 stores at 5 mi, 601ms for 214 at
   25 mi, and a drag across stops queues several in a row. Fix shape: debounce the fetch and/or
   re-filter locally from the widest slice already loaded. (`setRadiusIdx` → `fetchNear`, ~:4921.)
3. **Spanish footer wraps to two rows** (measured live). No button overflows found on the home
   page in Spanish; the hero's two lines are by design. NOT yet swept in Spanish: the result page,
   the sheets, My checks. Sweep those before launch.
4. **Auto-check after save:** the sheet closes, the customer stays on the store page, one bottom
   notification confirms. **No email is sent on save** (nothing in `/app/schedule` sends one) — owner
   expected one; decide if that is a gap or fine. Result emails when it fires are wired (07-31
   notifier) but a REAL scheduled fire has never been watched end to end. One rehearsal needed.
5. **Alerts on PROD are not proven.** Staging emails send (owner's Fun tests). Prod's sender and
   the email-confirmation flow were likely never re-set after the promote
   (`admin-audit-alerts-providers-blocker.md`, the missing-email-confirmation note). SMS is dark
   until A2P. Must be proven on prod BEFORE customers can be told alerts work.

## Combinations never tried together (each is one cheap test pass)
- Hobby ON / Thrift ON: the store ask changes shape (`type=Hobby` / `section=thrift`) — list,
  logos, product dropdown, and check flow under those modes are rarely driven.
- Kiosk mode + Spanish, language flip mid-check (step log re-localizes; conversation stays as heard).
- A zone check that hits a store someone has an alert on (new: it now emails once — watch one).
- Two alerts on the same store: guarded as of 07-31 (repeat subscribe answers "You've already set
  an alert for this store"), duplicates fold to one email.

## Reports to eyeball with real data
- The activity dashboard's zone-check counting shipped 07-27 but was never owner-confirmed.
- Admin "What a check costs" stays on "no finished checks yet" until a real charged check (by design).

**Verify-live output (paste on close):**
```
(none yet)
```

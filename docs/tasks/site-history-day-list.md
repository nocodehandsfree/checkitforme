# Check history: tapping a day shows that day's checks, not the newest one

**System:** site · **Status:** open, not started (owner 2026-08-06, "put it on the to-do list" —
DO NOT BUILD until it is boxed)

## What the owner saw
My checks → Check history → tap a day (his example: August 5). The page goes straight into one check
and sits there loading it for a while before anything shows.

## What he wants instead
Tapping a day brings up the pop-up that lists every check made that day, so he picks the one he wants.
That is the SAME behaviour the check status page already gives when the small calendar icon is tapped
and a day is chosen.

## The existing pieces this snaps onto (LAW 1 — no new architecture)
- `todayPickDay(key)` in `public/checkit.html` is the whole bug: it sorts that day's checks newest
  first and calls `openHistEntry(calls[0])`. `openHistEntry` fetches the check's conversation, which
  is the wait he is describing.
- The list he wants ALREADY EXISTS one screen over: `renderRailCal()` → `railPickDay(key)` → the
  `.rday-list` block, one `.rday-item` button per check (status chip, store name, the time), each
  opening `railOpen(cid)`. Its "No checks this day." and "← Pick another day" strings are already
  written in both languages (`rail.noneday2`, `rail.pickanother`).
- So the fix is to make the history calendar's day tap land on that same list instead of on a check.

## Done when
1. My checks → Check history → tapping a day shows the day's checks as a list, with no check opened
   and nothing fetched until one is tapped.
2. Tapping a check in that list opens it exactly as it does today.
3. A day with one check behaves the same way (the list shows one row) — no special case.
4. The check status page's calendar icon is UNCHANGED; both places show the same list.
5. No new strings. If one is truly needed it ships with its Spanish in the same commit.
6. Driven at phone width on staging, by a person, with what each step showed written down.

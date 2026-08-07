# The site should know when you have moved (spec, owner-named 2026-08-06)

**System:** site · **Status:** SPEC ONLY, nothing built. Owner: "we'll circle back and get this done
when we're ready to finish our auto checks", so this is sequenced AFTER `docs/tasks/site-auto-checks.md`.
**The diagnosis that started it:** `docs/tasks/site-location-follow-gate.md` (proven on the rig, 08-06).

## What the owner saw
He was hundreds of miles from his house. The site still showed his home stores. He moved the radius
slider and it still showed home. He had seen this working before: driving past a mile used to refresh
the store list on its own.

## What already exists (do NOT rebuild it — LAW 1, this snaps on)
1. **The saved spot.** `setUserLoc` (`public/checkit.html` ~:4844) writes `cifm_loc` to the phone, and
   `savedLoc()` (~:4843) reuses it for SEVEN DAYS so nobody is asked twice.
2. **The follower.** `locWatchStart` (~:4046) runs a coarse `watchPosition`: cheap wifi and cell fixes
   (`enableHighAccuracy:false`), stopped whenever the tab is hidden (~:4061), so battery cost is
   negligible. A move over 1 mile swaps the store list through `setUserLoc` and toasts "Updated to your
   current location" at most once every 2 minutes (`locFollowApply`, ~:4033).
3. **Two extra check-ins.** `silentLocRecheck` (~:4008) at boot (~:3975) and ~700ms after the radius
   slider moves (~:5007).
4. **The manners, all of which stay.** Never mid check, mid sheet, mid hunt (`busy`, ~:4036). A city
   search (~:4837) or a map pin (~:4924) sets `MANUAL_LOC` and beats GPS for that page session. Under
   a mile is ignored. An open map is never re-framed.

## What is missing (the whole bug)
All three automatic paths open with `navigator.permissions.query({name:'geolocation'})` and **return
silently unless the answer is exactly `granted`** — deliberate, so they can never raise the OS prompt.
Nobody checked what a phone actually answers. Safari hands out location for the visit you are in, not
as a standing grant, so on a fresh visit the answer is not `granted`, the follower never arms, and the
7-day saved spot stands. It worked the day the owner watched it because that visit's yes was still live.

Three things deepen it: the saved spot is trusted for a week, so nothing corrects it · the stop is
SILENT, so the screen looks like it decided you are home · the follower only runs while the site is
open and in front of you (right for battery), so the drive itself is never seen and the catch-up has
to happen on the next open.

**Proven, not argued:** driven on staging in Chromium with location granted, GPS moved Woodland Hills
to San Jose (~300 miles): `cifm_loc` updated, the list became Walgreens Luna Park, CVS Japantown,
Target Coleman Ave, and the toast said "Updated to your current location". Rig: `loc-follow-test.mjs`.

## The three ways to answer "the browser said no" (owner picks)
**A. Just ask.** Call `getCurrentPosition` anyway; the phone shows its own box. Experience: a box on a
normal open, tap Allow, the list becomes your town. Downside, and it is the serious one: a box that
appears unasked gets a reflex "Don't Allow", and the phone then remembers the no permanently. From
then on the site cannot ask at all and the customer has to fix it in phone settings.

**B. Notice with the internet address, then ask on a tap.** The site sits behind Cloudflare, which can
tell the server roughly which city the visitor's connection is in, with no prompt (`cf-ipcity` /
`cf-iplatitude` / `cf-iplongitude`). **UNVERIFIED: those city headers need "Add visitor location
headers" turned on for the zone. Check before promising it.** If that city is far from the saved spot,
try quietly, and only if the phone refuses show one small tap: "Looks like you're in San Jose. Use
this?" A permission box that follows a tap gets a yes far more often than one that appears alone.
Downside: a VPN or some cell carriers put the address in the wrong city, so it may ONLY be used to
notice a move, never to decide which stores get called.

**C. Both.** Try silently, ask only when the address says the customer moved. **Recommended.**

## Regardless of which one wins
- The saved spot's 7 days is too long for something that claims where you are. Shorten it.
- The silent stop needs to stop being silent: when we cannot tell where somebody is, the screen should
  say so in one line rather than showing a week-old town as if it were current.

## Done when (write these as assertions before coding — LAW 2)
1. Somebody who travels far and opens the site is shown the stores where they ARE, or is one tap away.
2. No location box ever appears without a tap first, unless the owner picks A.
3. A customer who declines is never worse off than today: the saved spot still works, nothing breaks.
4. The battery design is untouched: coarse fixes only, watch stopped when the tab is hidden.
5. Every manner in the list above still holds (never mid check, a pin or city search still wins).
6. The internet-address city is never used as the location itself, only as the signal that we moved.
7. Driven for real: a fake GPS moved 300 miles on staging updates the list, and a refused permission
   shows the one tap instead. Both pasted into the task file.
8. Any new string ships with its Spanish in the same commit.

## Not decided
Which of A, B or C. How long the saved spot should be trusted. The exact words on the one tap.

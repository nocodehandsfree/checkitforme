# Location does not follow you to a new town (found 2026-08-06, owner hundreds of miles from home)

**System:** site · **Status:** open, DIAGNOSED, not fixed. **THE BUILD SPEC IS
`docs/specs/location-follow/README.md`** (owner 08-06: write it up, and get it done when auto-checks
are finished). This file is the diagnosis; the spec is the contract.

## What the owner saw
He is hundreds of miles from his house. The site still shows his home stores. He moved the radius
slider and it still showed home.

## What actually happens
Two things move the location on their own, and BOTH are behind the same gate:
- `silentLocRecheck()` (`public/checkit.html` ~:4008) — the one-shot re-check, also what the radius
  slider fires 700ms after it moves (~:5007).
- `locWatchStart()` (~:4046) — the drive-follow `watchPosition` that made "drive past a mile and it
  updates" work.

Both start with `navigator.permissions.query({name:'geolocation'})` and **return silently unless the
answer is exactly `granted`**, on purpose: neither may ever raise the location prompt. When the answer
is anything else, nothing re-checks and the page keeps using `cifm_loc` in storage, which is good for
SEVEN DAYS (`savedLoc()`, ~:4843). That is a home location that survives a drive across the state.

On a phone that report is often not `granted`: Safari hands out location per visit ("Allow Once")
rather than a standing grant, and its permission query for location is not the same as Chrome's.
So the drive-follow never arms, the slider's re-check dies at the same line, and the cached spot wins.

`MANUAL_LOC` is the second, narrower way this dies: after a city search (~:4837) or a map pin
(~:4924) GPS is locked out for the rest of that page session, by design (~:4011, ~:4034).

## Proven, not guessed
Driven on staging in Chromium with location granted, GPS moved from Woodland Hills to San Jose, about
300 miles: `cifm_loc` updated to the new coordinates, the store list became Walgreens Luna Park, CVS
Japantown, Target Coleman Ave, and the page said "Updated to your current location". The logic itself
is sound. It is the gate that never opens on his phone.
Rig: `scratchpad/loc-follow-test.mjs` (fake GPS + the site's own store list).

## The one-tap proof for the owner
Tapping FIND MY STORES calls `getCurrentPosition` directly (~:4859), sets `MANUAL_LOC=false` and
starts the drive-follow. If that jumps him to where he really is, the gate is confirmed as the cause.

## Not decided
How the fix should behave (asking for location when the answer is not `granted` means a prompt, which
is exactly what these two paths were written to avoid). Owner's call.

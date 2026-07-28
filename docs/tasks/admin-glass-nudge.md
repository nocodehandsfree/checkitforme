# Admin: the iOS bottom tint breaks when any slide-up opens

**What:** Owner on device 07-27. Open any sheet in Admin and the bottom Safari strip goes flat grey
instead of the translucent glass. The consumer site had the same bug and it is fixed there.

**System:** admin — **DO NOT START while another chat is editing `public/app.html`.**

**Root cause (found 07-27, not yet fixed):** Admin already has the whole variant-H recipe right. The
sheet goes `position:absolute`, anchors at `scrollY + 14vh`, overshoots ~120px under the bar, there is
no scrim, and the dim is a content filter. All of that is correct and `scripts/qa-admin-glass.mjs`
guards it. What Admin is missing is the RE-SNAPSHOT.

iOS only re-takes the image it blurs behind the toolbar when the DOCUMENT actually scrolls. The site
does this on every sheet open and close via `sheetGlassNudge()` (checkit.html): scroll 1px, scroll
back. Without it the bar keeps ghosting the pre-open page, which reads as the flat band.

Three findings, in order of importance:
1. **`pokeChrome()` in `public/app.html` is the same helper (blur, re-stamp the root background colour,
   scroll 1px and back) and NOTHING CALLS IT.** Dead code. `grep -n "pokeChrome()" public/app.html`
   returns only its own definition.
2. **`openSheet` locks the page before the sheet is on screen.** It sets
   `documentElement.style.overflow='hidden'` synchronously, then adds `.sheetopen` + `.on` a frame
   later. The site does the opposite ON PURPOSE (`sheetBodyLock`): add `.sheetopen`, wait two frames,
   NUDGE, and only then lock. Once scrolling is locked the nudge cannot do anything.
3. **`closeSheet` never nudges either**, so the bar stays stale after dismissing. The site nudges on
   unlock too (`sheetBodyMaybeUnlock`).

**Why nobody caught it:** `scripts/qa-admin-glass.mjs` locks 8 properties of this recipe and the
re-snapshot is not one of them, so it has been passing green the whole time.

**Done when**
1. `openSheet` calls `pokeChrome()` after two frames and BEFORE locking scroll, matching
   `sheetBodyLock` in `public/checkit.html`.
2. `closeSheet` calls it again once the slide-down settles.
3. `scripts/qa-admin-glass.mjs` gains a 9th check: the nudge is called on open and on close. Confirm
   the new check FAILS against the current file before wiring the fix, or it is not guarding anything.
4. Owner confirms the bottom tint on his phone. Chromium cannot render iOS glass, so his device is the
   only proof. Ship one change, then ask.

**Reference:** `sheetGlassNudge` + `sheetBodyLock` + `sheetBodyMaybeUnlock` in `public/checkit.html`.
Copy that ordering exactly rather than inventing a variant. GOTCHAS has the full glass story.

**Status:** done (2026-07-28, Admin LIVE @2ca41b5)

## THE ACTUAL CAUSE — read this, not the diagnosis above

The diagnosis at the top of this file was WRONG, and it cost two ships to find out. Keeping it because
the two things it named were also genuinely broken and were also fixed. But neither was the tint.

**A closed sheet never left the bottom edge.** `.sheet` is created lazily on first open and was then
kept in the DOM forever as a `position:fixed`, bottom:0, ~1000px tall element, merely translated off
screen. A fixed element on the bottom edge lives in the UI layer iOS never ghosts, so the bar went flat
grey and STAYED that way. The site has always done the opposite: `.overlay{display:none}` /
`.overlay.on{display:flex}`.

The owner's repro is what cracked it, and it maps exactly: fine on load (the element does not exist
yet) · breaks the moment you slide a sheet DOWN (element now exists, parked) · survives closing the tab
· a refresh fixes it (fresh DOM). **Nothing about caching. Nothing he had to clear.**

**How it was found:** snapshot the whole page (root/body inline styles, classes, computed background,
doc height, scroll, filters, the sheet's own box) BEFORE opening a sheet, then again after closing one,
and diff. Exactly one thing differed. Do that first next time instead of theorising about the glass.

**What shipped, in order:**
1. `pokeChrome()` existed but nothing called it. Wired into open (before the scroll lock) and close.
2. `pokeChrome` was ALSO re-stamping the root background-color inline. That is the documented poison:
   it makes iOS re-sample the root grey instead of ghosting the sheet. It is now the site's
   `sheetGlassNudge` byte for byte, a scroll and nothing else, both scrolls synchronous.
3. **The real one:** the sheet is born hidden, shown one frame before `.on` so the slide-up still
   animates, and hidden again once the slide-down finishes.
4. Separately: `.sh-body` scroll-end spacer 70px → 240px, so the last rows clear the toolbar. Grab
   handle unified to the site's 44x6 at 40%.

**Guard:** `scripts/qa-admin-glass.mjs` went from 10 checks to 19. The new ones cover the JS form of the
root recolour (the old check only caught the CSS form), the nudge being called on open/close and before
the lock, the spacer size, and the closed sheet being hidden. Each new check was run against the build
it was meant to catch and confirmed to FAIL there first.

**Verify-live output:**
```
→ shipping public/app.html @ 2ca41b5 to https://admin.checkitforme.com …
{"ok":true,"commit":"2ca41b5","at":1785266699,"bytes":640303}
✓ THE Admin is serving the new shell (2ca41b5).
read back live: sh.style.display='none' present x1

lifecycle driven at 390x844:
   60ms after open  top=408 (mid slide-up)
  700ms after open  top=118 (settled at 14vh)
  150ms into close  top=934 (sliding down)
 1200ms after close display:none, zero box
before/after page diff: nothing left on the bottom edge
```

**Owner confirmed the tint on his phone 07-28.**

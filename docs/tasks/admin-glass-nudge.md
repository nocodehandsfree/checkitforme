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

**Status:** done (2026-07-28, Admin LIVE @527a48f)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
→ shipping public/app.html @ 527a48f to https://admin.checkitforme.com …
{"ok":true,"commit":"527a48f","at":1785258342,"bytes":639284}
✓ THE Admin is serving the new shell (527a48f).

read back off https://admin.checkitforme.com/ :
  pokeChrome()                        x4   (defined + called on open + called on close)
  240px + env(safe-area-inset-bottom) x1   (the scroll-end spacer)
```

**What shipped:** `openSheet` now shows the sheet, waits two frames, calls `pokeChrome()`, waits one
more frame (pokeChrome scrolls 1px and back on the NEXT frame, so locking in between stranded the page
1px off), THEN locks scroll. `_restoreSheetLayout` nudges on the way out. `.sh-body` scroll-end spacer
70px → 240px (the 120px overshoot + the ~90px toolbar + tap margin). Grab handle unified to the site's
44x6 at 40%.

**Driven** at 390x844, signed into Admin: nudge order on open reads `nudge, nudge, lock`, and fires
again on close. Lowest tappable element in the workflow sheet, the global-openers sheet and a 20-row
worst case all land 42px+ clear of the toolbar; before the fix the same element sat 128px UNDER it.

**The guard:** `scripts/qa-admin-glass.mjs` gained 4 checks (pokeChrome called on open, called on
close, called BEFORE the lock, spacer clears overshoot + toolbar). Its old check pinned the 70px
spacer, so it had been certifying the bug. Run against the PRE-FIX file it now reports 4 failures;
against the fixed file 15 pass / 0 fail.

**Left for the owner:** the tint itself. Chromium cannot render iOS glass.

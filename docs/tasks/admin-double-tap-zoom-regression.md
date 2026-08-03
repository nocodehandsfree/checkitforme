# Admin: double-tap zooms the page again (regression) — CLOSED 08-02

**What:** On the owner's phone, double-tapping anywhere in Admin zooms the page in.

**There is no culprit commit. Nothing overwrote the fix.** Full history of `public/app.html`
(clone had to be un-shallowed first, `git fetch --unshallow`):

- `36b9d77e` 07-01 added `touch-action:manipulation` to interactive elements + `body`.
- `8dfc790a` 07-05 WIDENED it to `*` ("was interactive-only; Restock + Store-Intel cards/text still
  zoomed"). Both are still in the file, unchanged.
- `git log -G touch-action -- public/app.html` shows only four later commits, and every one of them
  is an edit to the `body{…}` line's font/padding that carried the property through untouched
  (`8a02abc1`, `d2953307`, `99be2d8e`, `d0b7f9b1`). Verified by diffing each.

**The actual gap:** the guard was never on the ROOT element. `*` covers every element the finger can
land on, but WebKit settles the double-tap-zoom gesture on the document itself, so a tap on bare page
background (the gaps between cards, section padding, the strip under a short list) still zoomed the
whole page. The consumer site has carried `touch-action:manipulation` on `html` since `21b2f598`
(06-22, "kill arrow double-tap zoom") and does not zoom. The Admin's `html{…}` rule never had it.
`user-scalable=no` / `maximum-scale=1` are already in the viewport meta and iOS ignores both.

**Fix:** add `touch-action:manipulation` to `html{…}` in `public/app.html`, matching the website line
for line. Keep the two in lockstep. `qa-tint-lock` 34/34 still passes (it pins that same rule).

**Driven:** computed style read in a real browser on the Admin shell served by a local server:
`html` = manipulation, `body` = manipulation, a list card = manipulation. Shipped with
`bash scripts/ship-admin.sh`.

**Done-when:** double-tap anywhere in Admin on an iPhone does nothing. 🔴 **NOT verified on a phone**
(no iOS here, and Chromium in this environment has no internet). Owner reads the real answer.

**System:** admin · **Status:** closed, pending the owner's phone

**Related, no work needed:** the owner's last Fun-store test row (id 227) has a slide-up that opens
nothing — it predates the 08-01 website-check fix (row carries no name to open with). Old rows stay
that way; every new check writes its name before dialing.

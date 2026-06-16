# Fungibles — Brand Mark (the green check)

## ⛔ HARD RULE — read this first
**The brand check is a FIXED IMAGE ASSET: `public/logos/fcheck.png`.**
**USE THAT FILE. Never recreate the check as SVG, CSS, a gradient, or a redrawn path.** It was hand-made
by the owner; reproducing it "from specs" is wrong every time. To place it anywhere, render an `<img>`:

```html
<img src="/logos/fcheck.png?v=6" alt="" width="24" height="24" style="object-fit:contain;vertical-align:middle">
```
- Consumer (`public/runner.html`): the `FCHK(size)` helper already returns exactly this `<img>`. Use it.
- Admin (`public/app.html`): the header uses the same `<img>`.
- If the owner sends a new version, **replace the file** `public/logos/fcheck.png` (and bump the `?v=`),
  do not change the markup to draw it.

The file is a transparent-background PNG sliced from the owner's master (the 128px tile of their
contact sheet) — green glowing check, no label, centered.

## Spec — coming soon
New brand-mark specs are pending from the owner. The previous spec here described a mark version we
rolled back, so it's been removed to avoid confusion. **Until new specs land, do not infer or redraw
the mark — use the file `public/logos/fcheck.png` exactly (see the hard rule above).**

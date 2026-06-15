# Fungibles — Brand Mark (the green check)

## ⛔ HARD RULE — read this first
**The brand check is a FIXED IMAGE ASSET: `public/logos/fcheck.png`.**
**USE THAT FILE. Never recreate the check as SVG, CSS, a gradient, or a redrawn path.** It was hand-made
by the owner; reproducing it "from specs" is wrong every time. To place it anywhere, render an `<img>`:

```html
<img src="/logos/fcheck.png?v=3" alt="" width="24" height="24" style="object-fit:contain;vertical-align:middle">
```
- Consumer (`public/runner.html`): the `FCHK(size)` helper already returns exactly this `<img>`. Use it.
- Admin (`public/app.html`): the header uses the same `<img>`.
- If the owner sends a new version, **replace the file** `public/logos/fcheck.png` (and bump the `?v=`),
  do not change the markup to draw it.

The file is a transparent-background PNG sliced from the owner's master (the 128px tile of their
contact sheet) — green glowing check, no label, centered.

## Spec (for reference only — NOT for re-rendering)
| Role | Hex |
|---|---|
| Primary green fill | `#4CF286` |
| Bright edge | `#5FF696` |
| Glow core | `#19B145` |
| Outer glow | `#135F29` |
| Background (dark only) | `#0E0E10` |

Sizing: min 16px; UI 24/32/48px; logo 64–128px; clear space 25%; **dark backgrounds only.**
Verdict/status "in-stock" check marks are a separate lightweight indicator, not this logo.

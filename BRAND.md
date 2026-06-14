# Fungibles — Brand Mark

The brand mark is a **glowing green checkmark in a disc**. It is the single identity mark used
everywhere a "check" appears as the logo (header, footer "…Check powered by Fungibles", finds ticker,
hero badge). Render it from these specs — do not slice a screenshot.

## Colors
| Role | Hex | RGB |
|---|---|---|
| Primary green fill | `#4CF286` | 76, 242, 134 |
| Bright edge / rim highlight | `#5FF696` | 95, 246, 150 |
| Glow core | `#19B145` | 25, 177, 69 |
| Outer glow / bloom | `#135F29` | 19, 95, 41 |
| Background | `#0E0E10` | 14, 14, 16 |
| Checkmark cutout / void | `#111413` (≈ background) | 17, 20, 19 |

## Circle fill (radial gradient)
```css
background: radial-gradient(circle at 45% 38%,
  #5FF696 0%,
  #4CF286 45%,
  #49F382 72%,
  #19B145 100%);
```

## Glow stack (drop-shadow filter)
```css
filter:
  drop-shadow(0 0 4px  rgba(95, 246, 150, 0.95))
  drop-shadow(0 0 12px rgba(25, 177, 69, 0.70))
  drop-shadow(0 0 28px rgba(19, 95, 41, 0.55))
  drop-shadow(0 0 52px rgba(19, 95, 41, 0.35));
```
> Note: drop-shadow blur is in absolute px, so at small UI sizes (16–34px) the 28/52px layers are
> oversized. In the apps we use a size-appropriate 2–3 layer subset; the full stack is for hero/marketing.

## Sizing
- Minimum digital size: **16px**
- Best UI sizes: **24px, 32px, 48px**
- Logo / icon size: **64px–128px**
- Clear space: **25%** of icon width
- Best background: **dark charcoal / near-black only**

## Implementation
- Consumer (`public/runner.html`): the `FCHK(size)` helper returns the inline SVG (disc gradient +
  check void) and inherits the glow via the `.fcheck` CSS class. A single shared `<radialGradient>`
  def (`#fgrad`) is injected once so every instance reuses it.
- Admin (`public/app.html`): same SVG, same `.fcheck` glow.
- Verdict/status check marks (per-row in-stock "✅") are intentionally kept lightweight (no heavy glow)
  for render performance at list scale — they are status indicators, not the logo.

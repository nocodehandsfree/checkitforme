# Check — Font & Type Style Guide

One typeface, one scale, **identical across the website (`checkit.html`) and the admin
(`app.html`)**. If type looks different between the two, it's a bug.

## 1. Typeface (now actually loaded — was falling back to the OS font before)
- **UI font: Inter** — loaded from Google Fonts in BOTH heads:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">
  ```
  Stack: `Inter, -apple-system, system-ui, sans-serif` (Inter everywhere; SF/Roboto only if the
  web font fails). **Don't declare a different family per element** — inherit.
- **Mono font** (transcripts, code, timers): `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.
- **Rendering (on `body`, both files):** `-webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility`. This is most of the
  "why does the website look crisper" difference — keep it on.

## 2. Weight scale (the only weights we use)
| Weight | Use |
|---|---|
| **400** | long body copy / notes (rare) |
| **500** | inputs, selects, secondary body |
| **600** | meta, secondary labels, ghost buttons |
| **700** | card titles, primary buttons, tags/pills, day pills |
| **800** | section page titles (`h2`), stat numbers |
| **900** | the logo wordmark, hero numerals only |

Never synthesize bold — the weight must exist in the load list above.

## 3. Size + role scale
| Role | Size / weight | Case |
|---|---|---|
| Page title (`h2`) | 19px / 800 | sentence |
| Card title (`.name`) | 15.5px / 700 | sentence |
| **Field label (micro)** | 10px / 700, letter-spacing 1.5px, `--text-tertiary` | **UPPERCASE** |
| Eyebrow (report group) | 10.5px / 700, letter-spacing | UPPERCASE |
| Body / value | 14–16px / 500 | sentence |
| Meta / caption | 12.5px / 600, `--muted` | sentence |
| Mono (transcript/timer) | 12–12.5px | — |

**Inputs are 16px** (prevents iOS zoom-on-focus) — don't drop below 16px on focusable text fields.
Control-wrapping labels (checkboxes, day pills, toggles) stay **normal case**, not the micro-label.

## 4. Color (text)
Use the opacity scale, not random greys:
`--text-primary` #fff · `--text-strong` 80% · `--text-body` 65% · `--text-muted` 45% ·
`--text-tertiary` 35% · `--text-caption` 25%. Base body text is a crisp near-white
(`#e6e6ef` admin / `#fff` website). Numbers in reports are gray (`#c7c7d2`), green only when the
number is genuinely "good."

## 5. Rule
Any new text must map to a row in §2/§3 and pull its family from the inherited stack. Same scale on
both surfaces — verify on the live site, not locally.

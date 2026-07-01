# Check — Style Guide

The single visual source of truth for **checkitforme.com** ("Check") and its admin/vertical
surfaces. Values here are pulled from the canonical brand pack (`docs/brand/CHECK_BRAND_STYLE_GUIDE.md`)
and the **live** styles in `public/checkit.html` / `public/app.html` / `public/style.html` — not a
redrawing. When the live site and this doc disagree, fix whichever is wrong and note it here.

- **Brand foundation:** `docs/brand/CHECK_BRAND_STYLE_GUIDE.md` (mark geometry — canonical)
- **Type detail:** `docs/design/STYLE_GUIDE.md`
- **Admin patterns:** `docs/design/STYLE_GUIDE.md`
- **Logo production:** `docs/STORE_LOGOS.md` (data-dev owns the chain assets)
- **Verify against:** `https://staging.checkitforme.com` (NOT prod)

---

## 1. Brand mark

The mark is a **circular green checkmark with a check-shaped negative-space cutout**, used as the
**C** in the "Check" wordmark. The right arm of the cutout opens through the right edge of the circle.

- Vector: `public/logos/check-brandmark.svg` (also `docs/brand/check-brandmark.svg`)
- PNG exports 16→2048: `public/logos/brand/` + full set in `docs/brand/checkbrandpack.zip`
- App icon / favicon: `public/logos/check-icon.png`

**Geometry is locked.** Do not round the shape further, change the check/circle proportions, or alter
the cutout angle. Don't recolor to a different green.

**Clear space:** keep ≥ **0.5×** the mark height clear on all sides; **1×** preferred.

**Glow** (dark backgrounds only — it's an effect layer, never a geometry change):

```css
filter:
  drop-shadow(0 0 4px rgba(117, 241, 143, 0.85))
  drop-shadow(0 0 12px rgba(25, 177, 69, 0.60))
  drop-shadow(0 0 28px rgba(25, 177, 69, 0.35));
```

Use the flat mark for print, embroidery, favicons, and transparent-PNG delivery.

---

## 2. Color

### 2.1 Two greens — this is intentional, not a bug

| Role | Hex | Where |
|---|---|---|
| **Brand green** | `#4CF286` | The brand **mark** only (the cutout-circle logo, brand pack exports). |
| **UI green** | `#4ADE80` | Everything in the product UI: success/“in stock”, CTAs, verdict-in text, accents. |

The brand mark keeps its slightly warmer brand green; the running UI uses the cooler `#4ADE80`.
Don't swap one for the other.

Brand-pack support greens (mark treatments only): highlight `#75F18F`, glow `#19B145`.

### 2.2 Surfaces & chrome (live `:root` in `checkit.html`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0C0C12` | Page background |
| `--sheet` | `#1A1A24` | Cards, pills, raised chrome |
| `--terminal` | `#0A0A0E` | Insets: store rows, inputs, result header |
| `--border` | `rgba(255,255,255,.08)` | Hairline on every card/control |

> Note: the brand pack lists a darker presentation bg `#08090D` for hero/marketing renders. The
> running app uses `--bg #0C0C12`. Both are correct for their context.

### 2.3 Core palette

| Token | Value | Use |
|---|---|---|
| `--green` | `#4ADE80` | Success / in stock / primary positive |
| `--green-dark` | `#22C55E` | CTA gradient stop |
| `--yellow` | `#FBBF24` | Unclear verdict / caution |
| `--orange` / `--amber` | `#E89A4A` / `#F59E0B` | "Restock soon" |
| `--red` | `#EF4444` | Out of stock / negative verdict |
| `--purple` | `#A78BFA` | Neutral secondary accent (`--ptint` `rgba(167,139,250,.14)`, `--pline` `rgba(167,139,250,.42)`) |
| `--muted` | `#6B6B7B` | Captions, secondary meta |

### 2.4 Per-vertical accent (`--accent`)

One neutral chrome runs across every product vertical. **Brand identity per vertical comes from the
logo, the hero accent word, and the `--accent` — not from recoloring controls.** `--accent` defaults
to Pokémon yellow `#FFCB05`. It drives, and only drives: the hero accent word, the logo `b`, the pill
dot, and the **Call** controls (call key, call sheet button, ringing chip). Everything else stays
neutral so the four sites read as one product family.

### 2.5 Verdict tones — the system's signature

Every finished check resolves to **one of four states**, each owning a hue, a page-top **wash**, and a
bright text color. The wash is the **body's own background** (so it fills the iOS overscroll
rubber-band), fading tone → `--bg` over the first 460px.

| Verdict | Wash (top → `--bg` @460px) | Text / title | Class |
|---|---|---|---|
| **In stock** | `#266440` | `#4ADE80` | `.rv-in` / `.in` |
| **Out** | `#6B2427` | `#EF4444` | `.rv-out` / `.out` |
| **Unclear** | `#6C5419` | `#FBBF24` | `.rv-unk` / `.unk` |
| **Soon** | `#6E490F` | `#F59E0B` | `.rv-soon` / `.soon` |

```css
body.rview.rv-in  { background: linear-gradient(180deg,#266440 0,var(--bg) 460px); }
body.rview.rv-out { background: linear-gradient(180deg,#6b2427 0,var(--bg) 460px); }
body.rview.rv-unk { background: linear-gradient(180deg,#6c5419 0,var(--bg) 460px); }
body.rview.rv-soon{ background: linear-gradient(180deg,#6e490f 0,var(--bg) 460px); }
```

On a result, header chips, nav, and the iOS `theme-color` status bar all pick up the verdict tone so
the whole top reads as one continuous color. The `theme-color` meta is set to the same wash hex
(`in #266440 · out #6b2427 · unk #6c5419 · soon #6e490f`).

---

## 3. Typography

**Inter, end to end** — identical on website and admin; if they differ, it's a bug. Mono only for
transcripts/timers/code.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">
```

- UI stack: `Inter, -apple-system, system-ui, sans-serif`
- Mono stack: `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`
- On `body` (both files): `-webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility`

**Weights (the only ones loaded):** 400 long body · 500 inputs/secondary · 600 meta/ghost buttons ·
700 card titles/buttons/pills · 800 section titles (`h2`)/stat numbers · 900 logo + hero numerals.
Never synthesize bold.

**Scale & role**

| Role | Size / weight | Case |
|---|---|---|
| Hero headline (`.hero h1`) | 30px / 900, letter-spacing −1px | sentence |
| Verdict title (`.rtitle2`) | 30px / 900, −1px | sentence |
| Section title (`h2`) | 19px / 800 | sentence |
| Card / store name | 14.5–15.5px / 700 | sentence |
| Micro field label | 10px / 700, +1.5px tracking, `--text-tertiary` | UPPERCASE |
| Eyebrow | 10.5px / 700, tracked | UPPERCASE |
| Body / value | 14–16px / 500 | sentence |
| Meta / caption | 12.5px / 600, `--muted` | sentence |
| Mono (transcript/timer) | 12–12.5px | — |

**Inputs are 16px** (prevents iOS zoom-on-focus) — never drop a focusable text field below 16px.

**Text color = opacity scale, not random greys:** `--text-primary` #fff · strong 80% · body 65% ·
muted 45% · tertiary 35% · caption 25%. Report numbers are grey (`#c7c7d2`), green only when the
number is genuinely "good."

---

## 4. Components

All radii in one place: **pill 999 · sheet 22 · card/callkey/call-sheet-btn 16 · logo slot 15 ·
button 14 · store row 12 · chip 20–22**.

### 4.1 Primary button (`.cta`)

Green with depth — a crisp top highlight and a soft glow. The **same green on every vertical**
(uniform CTAs).

```css
.cta{
  width:100%; padding:16px; border:none; border-radius:14px;
  background:linear-gradient(180deg,#5BEA93 0%,#34C268 100%);
  color:#06210f; font-weight:900; font-size:16px; letter-spacing:-.2px; cursor:pointer;
  box-shadow:0 10px 24px -6px rgba(52,197,107,.5), 0 2px 6px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.45);
  transition:transform .08s, box-shadow .14s, filter .14s;
}
.cta:hover   { filter:brightness(1.04); }
.cta:active  { transform:translateY(1px); box-shadow:0 5px 14px -4px rgba(52,197,107,.45), inset 0 1px 0 rgba(255,255,255,.35); }
.cta:disabled{ background:#1f2a23; color:#5c6f63; box-shadow:none; cursor:not-allowed; filter:none; }
```

- `.cta.dark` — branded/dark CTAs drop the green glow (it bleeds behind black/blue buttons):
  `box-shadow:0 4px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)`.
- `.cta .price` — trailing price, weight 700, opacity .7, 13px.
- `.cta.armed` — 2× `armPulse` ring to draw the eye to the action.

### 4.2 Call key (`.callkey`) — the accent-driven action

One pressable 70px bar that **breathes in the product `--accent`** with a ringing-phone chip.
Everything is driven from the single `--accent` var: icon/waves 100%, chip 13%, border 42%, halo
22→50%.

```css
.callkey{
  width:100%; height:70px; padding:0 14px 0 18px; border-radius:16px;
  display:flex; align-items:center; gap:12px;
  background:#2B2B33;
  border:1px solid color-mix(in srgb, var(--accent,#FFCB05) 42%, transparent);
  color:#fff; text-align:left; cursor:pointer;
  animation:ckHalo 3s ease-in-out infinite; transition:transform .08s;
}
```

The call-sheet button (`.csheet-call`) is the solid-accent variant: `background:var(--accent)`,
`color:#3a2c00`, radius 16, weight 900 18px, accent glow. Honor `prefers-reduced-motion` (the halo and
ring waves stop).

### 4.3 Pills & chips

```css
.pill{ display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border-radius:20px;
       background:var(--sheet); border:1px solid var(--border); font-size:13px; font-weight:700; cursor:pointer; }
.pill .dot{ width:8px; height:8px; border-radius:50%; background:var(--accent,var(--green));
            box-shadow:0 0 8px var(--accent,var(--green)); }

.chip{ padding:9px 15px; border-radius:22px; background:var(--terminal); border:1px solid var(--border);
       color:#d4d4df; font-weight:700; font-size:14px; cursor:pointer; }
```

### 4.4 Store row (`.store`) + logo slot

```css
.store{ display:flex; align-items:center; gap:11px; padding:11px 12px; border-radius:12px;
        background:var(--terminal); border:1px solid var(--border); cursor:pointer; }
.store:hover{ border-color:rgba(255,255,255,.18); }
.store.sel { border-color:var(--accent,#FFCB05); background:color-mix(in srgb,var(--accent,#FFCB05) 9%,transparent); }
```

- `.store .nm` 14.5px/700 (truncates) · `.store .lo` `--muted` 12px · `.store .smi` right-aligned
  miles, 800/14px with a 10px caption.
- Stock dots `.sdot`: on `#cfcfe0` · off `#7a7a86` · instock `--green` · outstock `--red`.

**Logo slot** — every chain logo drops into one fixed embossed tile (see §5).

### 4.5 Result anatomy (`.rverdict`)

A finished check is one **boxless, top-toned screen**: verdict pill → headline → green primary, with
the wash flooding from the status bar down.

- `.rpill` — 11px/800, +0.13em tracking, UPPERCASE, radius 999, tone-tinted bg + 32%-tone border,
  leading `currentColor` dot.
- `.rtitle2` — 30px/900, −1px; colored by verdict (`in` green · `out` red · `unk` yellow · `soon` amber).
- `.vmark` — 78px tone circle with a blurred 16%-opacity glow `::before`.
- `.rhead` — combined call header (terminal bg, radius 16): store identity is ~75% of the card, the
  verdict a compact ~25% strip; a hairline splits them. Color lives only in the icon + title word.

### 4.6 Call timeline (`.ctl`)

**ONE continuous left line with exactly THREE dots** — the roll-up "Calling {store}…" header (first
dot, green), the "Conversation" label, and the bottom call-status. Steps and chat bubbles hang off the
line with **no dots of their own**. The line runs green → the verdict tone.

- `.reach > summary` — tap target to fold the step log; chevron rotates on `[open]`.
- `.reach-steps` / `.ctl-step-row` — greyed `#56566a` step text, no dots; the final connection step
  turns green ✓ (`.ok`) once a person is reached.
- `.ctl-status` — last dot + a verdict-colored status line (`tl-in/out/unk/soon`).

### 4.7 Status badge (`.status`)

History + store-row status: a custom icon + tone-colored label (in/out/unclear/soon), right-aligned,
weight 800 / 13px. Same four tones as §2.5.

---

## 5. Logo treatment

### Brand & vertical logos
`public/logos/` holds the live marks: `check-brandmark.svg`, `check-icon.png`, `checkitforme.png`,
`fcheck.png`, plus per-vertical product logos (`needoh.png`, `onepiece.png`, `topps.png`,
`fungibles*.png`). OG/social art lives in `public/og/`.

### Store / chain logos (~94)
One file per chain in `public/logos/chains/` (png/webp/svg); `_meta.json` maps slugs. Production &
rendering rules are owned by data-dev — see `docs/STORE_LOGOS.md` / `docs/STORE_LOGOS.md`.

**The slot.** Every chain logo renders into one fixed **embossed dark tile** so mismatched source art
reads as a consistent set:

```css
.store .ic{
  width:52px; height:52px; border-radius:15px;
  background:linear-gradient(145deg,#34343d,#23232b);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.09), inset 0 -2px 3px rgba(0,0,0,.4), 0 3px 7px -1px rgba(0,0,0,.5);
}
```

(Result header uses the same treatment at 58px, radius 16.)

**Name-only stores** (no usable logo) render their name as a tight two-line uppercase wordmark
inside the same slot (`.wm` — 900 weight, ~8px, `#cdcdd8`) — never a made-up logo.

---

## 6. Icons

- **Product / consumer (`checkit.html`):** small inline SVGs (phone, chevrons, check, stock dots),
  sized 14–22px, `currentColor` or `--accent`-driven where they sit on the call controls.
- **Admin (`app.html`):** **Lucide** icons used **by name** (sourced from the library, not stored as
  files). Search `lucide` in `app.html` for the set in use; match stroke width and the existing set
  when adding new ones.
- Don't hand-draw new brand-level iconography — reuse the inline set or pull the matching Lucide glyph.

---

## 7. Principles (recap)

1. **Dark, high-contrast.** Page `#0C0C12`; cards `#1A1A24`; insets `#0A0A0E`.
2. **One neutral chrome across every vertical.** Identity = logo + hero accent word + `--accent`,
   never recolored controls.
3. **Verdict-driven color.** Results paint the page from the top with a wash; bright text states the verdict.
4. **Inter only**, weights 400–900; smoothing on.
5. **Glow is an effect layer**, never a geometry change to the mark.

---

_Maintained by Check — Design. Verify every value against `staging.checkitforme.com` before relying on
it; update this file (and commit) when the live styles change. **Pending owner (Fungie) approval before
this is final.**_

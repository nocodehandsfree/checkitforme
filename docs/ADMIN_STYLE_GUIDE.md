# Check Admin — UI/UX Style Guide & Component Reference (v2)

The single source of truth for `public/app.html` (served at **admin.checkitforme.com**). Every page
must follow this. **If a page doesn't, it's a bug.** Verify on the LIVE site, authenticated — not on
seeded local data (see §12).

This is a single-file SPA: one inline `<style>`, one inline `<script>`. Components below are the real
classes/helpers in that file — reuse them, don't reinvent.

---

## 1. Design tokens (`:root`)

```
--bg:#0C0C12;  --sheet:#1A1A24;  --terminal:#0A0A0E;   /* page / card / input fills      */
--green:#4ADE80;  --green-dark:#22C55E;                /* GOOD / primary action          */
--purple:#A78BFA;  --yellow:#F4D03F;  --orange:#E89A4A; /* selection / warning / attention*/
--red:#EF4444;                                          /* BAD                            */
--muted:#6B6B7B;  --border:rgba(255,255,255,.08);
```

Numbers in reports are **gray `#c7c7d2`**, not white. Helper/dim text is `--muted`. The very-light
hint color (placeholders, critical-only directional copy) is `#56566a`.

## 2. Typography
- Font: **Inter** everywhere — including selects, inputs, buttons. No exceptions.
- **Section header `h2`**: 19px / 800 / white, sentence case, green tick-bar (`::before`). Says what
  the page is in 1–few words. **No trailing dash, no directional copy after it.** Lengthy context →
  `data-tip` on the `h2` (an ⓘ appears).
- **Card title `.name`**: ~15.5px / 700. No directional copy after it (→ `data-tip`).
- **Eyebrow** (group label inside a report, e.g. FUNNEL): 10.5px / 700 / muted / uppercase.
- **Body / meta `.meta`**: 12.5px / muted.
- **Hint `.hint`**: 12px / italic / very light — ONLY when copy is truly critical; otherwise a tooltip.

## 3. Color discipline (color only where it means something)
- **green = good** (in-stock, confirmed, positive money, "go"). **red = bad.** **amber/yellow = attention.**
  **purple = selection/bulk.** Everything else is **gray**.
- Green a *number* only when it is genuinely a good signal (revenue, confirms, paying). Otherwise gray.

---

## 4. Reports — ONE pattern, everywhere
Every block that shows metrics uses the same structure:

- Container: **`.card.report`** — the subtle neon-green box (same tint as the God-view TODAY hero):
  ```css
  .card.report{background:linear-gradient(180deg,rgba(74,222,128,.055),rgba(74,222,128,0));
               border-color:rgba(74,222,128,.18)}
  ```
- Optional **eyebrow** label, then a grid of identical rounded **stat boxes**:
  ```css
  .stat{background:rgba(255,255,255,.035);border:1px solid var(--border);border-radius:14px;
        padding:13px 15px;min-width:104px;flex:1 1 auto}
  .stat .n{font-size:23px;font-weight:800;color:#c7c7d2}   /* gray number            */
  .stat .l{font-size:11px;color:var(--muted)}              /* label                  */
  .stat.green .n{color:var(--green)}                       /* only for a "good" stat */
  ```
- The **TODAY hero** (`.hero`) is the only "this is today" marker — green tint + eyebrow, but its inner
  boxes are the SAME `.stat` boxes as everywhere else.
- **No bespoke per-report stat styling.** Money, timing, restock, kiosk, pulse — all use `.stat`.

Tag a report card with `class="card report"`. Reach for a plain `.card` only for settings/forms/lists.

---

## 5. Tooltips — tap to show (mobile-first)
Hover tooltips don't exist on touch. Any element with **`data-tip="…"`** shows a bubble on **tap** and
gets a small **ⓘ** marker.

```css
[data-tip]{cursor:help}
[data-tip]::after{content:"ⓘ";font-size:.78em;color:#6b6b7b;font-weight:600}
#tiptip{position:fixed;z-index:9000;max-width:262px;background:#06060a;color:#e8e8f2;
        font:500 12.5px/1.45 Inter;padding:9px 11px;border-radius:9px;
        border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 30px rgba(0,0,0,.6)}
```
A single document `click` handler builds/positions/auto-dismisses `#tiptip`. **Anything longer than a
short label goes in a `data-tip`, never as a paragraph under a header.**

---

## 6. Controls (uniform sitewide)

**Dropdown `select`** — identical everywhere via the global rule: 14px / 500 / `#dcdce6`, 11px radius,
custom green chevron, `width:100%`. **No dropdown's first option may be a real value.** Lead with a
disabled placeholder:
```html
<select id="…"><option value="" disabled selected>Choose a category…</option> … </select>
```
- Pickers (store / category / voice): placeholder-first, required.
- Config dropdowns that must run with a value (model, mode): the first option may be the **recommended**
  default, labelled "(recommended)". Don't leave a bare value looking like an unmade choice.

**Input / textarea** — `width:100%`, 12px radius, green focus ring. **Placeholder is small, italic, very
light:**
```css
input::placeholder,textarea::placeholder{color:#56566a;font-style:italic;font-size:13px}
```
Long default copy that must be readable (opening line, question) → **`<textarea rows="2">`**, not a clipped input.

**Checkbox** — one custom style, **15px**, brand-green when checked:
```css
input[type=checkbox]{appearance:none;width:15px;height:15px;border:1.5px solid rgba(255,255,255,.26);
  border-radius:5px;background:var(--terminal)}
input[type=checkbox]:checked{background:var(--green);border-color:var(--green)}
```
No oversized or per-page checkboxes. Bulk/row selects use the same box (`.rowchk`, 15px).

**Buttons**
```css
button.act  { background:linear-gradient(180deg,#5BEA93,#34C268);color:#06210f;font-weight:800;
              padding:8px 14px;border-radius:10px;font-size:13px }   /* primary  */
button.ghost{ background:transparent;border:1px solid var(--border);color:#fff;font-weight:700 }/* secondary*/
```
Don't paint a whole list of rows with primary-green buttons unless every row is genuinely a primary action.

---

## 7. Day pickers & chips
- **Editable days** (`.day`): label + checkbox, **transparent — no black box**:
  `background:transparent;border:none;color:#cfcfd8`.
- **Read-only day chips** in a list (`.daychip`): plain text, **no box**; on-days go green:
  `color:#62626f;background:transparent` / `.daychip.on{color:var(--green)}`.

## 8. Icons & logos — drawn marks only, zero raw emoji
- Chrome icons are our **drawn SVG set**: `ICO(name,size)` and `vmark(emoji,tone,size)` (maps ✅❌🚚…→SVG).
  `decorateChrome()` strips any stray leading emoji from `.name/.meta/.hint/buttons`.
- **Status in a list** = a small colored dot, never an emoji:
  ```js
  `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>`
  ```
  (green locked · purple review · amber learning · gray unmapped).
- **Product logo** instead of the product word in carry/report sections — `prodMark(name,size)`
  (Pokémon → `/logos/chains/pokemon_vending.svg`; others stay text for now).

## 9. Status row (Statuses page)
One row = **one** icon. Top row: drawn `vmark` preview tile (40px) + label input + color swatch. The raw
emoji *source* is a small field on a **second** row (it is the input, not a second logo). Never render
two icon-sized things side by side.

## 10. Wizard (multi-step flows, e.g. Voice/Test)
Sequential `<details>` steps numbered **within a single page** (Step 1 → 2 → 3 — never split a numbered
sequence across nav tabs). Each step ends with a `ghost` **"Next: … →"** button calling `wizStep(id)`,
which opens one step and collapses the rest. Step 1 is `open` by default.

## 11. Store card (Search) — minimal
No logo. **Store name never wraps** (`.nm{white-space:nowrap}`); badges wrap below. One location (no
dupes). Verdict on the right. Carries → compact `Carries N · a, b +X` with the full list + last-call in a
`data-tip`. Never dump a transcript on the card.

## 12. List rows that have an action button
The row must **not wrap** (`flex-wrap:nowrap`); the name column is `flex:1 1 auto;min-width:0` (may wrap
to 2 lines), the button is `flex:0 0 auto` pinned right — so a long name (e.g. "AAFES (Army & Air Force
Exchange)") can never push the button onto its own line.

## 13. Real-world side effects → confirm first
Any control that **places a real phone call / spends money** must `confirm()` first and/or carry a visible
warning chip (e.g. Phone Trees "Documenting a route places a real phone call"). No silent dialing.

## 14. Nav & spacing
- Top groups + sub-nav each on **one line** (horizontal scroll; never wrap to two rows). Click a top
  group → its first tab.
- Cards breathe: ~20px padding, ~16px gaps. Don't cram.

## 15. Verify like this (every change)
Authenticate a headless browser via `/admin-login?token=$ADMIN_TOKEN`, block real Clerk + stub
`window.Clerk.user`, `showSection(id)`, screenshot each **real** page. Fix until the live page matches
this guide. Harness: `/tmp/shotkit/live.js`. Don't declare anything done from local/seeded data.

# Check Admin — UI/UX Style Guide (v1)

The single source of truth so every page is uniform. Built from the owner's feedback across the
redesign thread. **If a page doesn't follow this, it's a bug.** Verify on the LIVE site
(`admin.checkitforme.com`), authenticated — not on seeded local data.

## 1. Typography
- Font: **Inter** everywhere (incl. selects/inputs/buttons).
- **Section header (`h2`)**: 19px / 800 / white, sentence case, green tick-bar. **Says what the
  page is in 1–few words. No trailing dash. No directional copy after it. Ever.**
- **Card title (`.name`)**: 15px / 700 / near-white. No directional copy after it.
- **Eyebrow** (group label inside a report, e.g. FUNNEL): 10.5px / 700 / muted / uppercase.
- **Body/meta**: 12.5px / muted.
- **Hint (directional)**: 12px / italic / **very light** (#56566a) — used ONLY when copy is critical;
  otherwise it's a tooltip.

## 2. Color discipline (only where it means something)
- **green** = good (in-stock, confirmed, positive money). **red** = bad. **amber** = needs attention.
- Everything else is **gray**. **Numbers are gray (#c7c7d2), NOT white.** Green a number only when it
  is genuinely a "good" signal (revenue, confirms, paying).

## 3. Reports = one pattern, everywhere
Every block that shows numbers (God view, Today's pulse, Business & money, Store intel, Kiosk/restock
intel, call timing) uses the **same** structure:
- A **card** container (optionally an eyebrow label).
- A grid of **identical rounded stat boxes** (`.stat`): `rgba(255,255,255,.035)` fill, 1px border,
  14px radius, gray number (23px/800) + muted label. **No bespoke per-report stat styling.**
- The "TODAY" card may keep a subtle green tint as the only "this is today" marker — its inner boxes
  are the SAME rounded boxes as everything else.

## 4. Copy — be a copywriter
- **Critical to the task → on the page, short.** Everything else → **tooltip** (`data-tip`) or cut.
- No "explaining what's below the header." The header already says it.
- Labels: just the field name. Put "(left = … right = …)", "optional — e.g. …", "ring in any clone…"
  into a `data-tip`.

## 5. Controls (uniform)
- **Dropdowns**: 14px / 500 Inter, #dcdce6, 11px radius, light. Identical sitewide.
- **Inputs**: 12–14px padding, 12px radius, green focus ring. **Placeholder = small, italic, very
  light** (#56566a).
- **Checkbox**: custom, **16px**, green when checked. One style everywhere.
- **Buttons**: primary = green gradient; secondary = ghost. Consistent padding/size.

## 6. Store card (Search) — minimal
- **No logo.** **Store name never wraps** (one line; badges wrap below). One location only (no dupes).
- Verdict on the right. Carries → compact "Carries N · a, b +X" with the full list + last-call in a
  tooltip. No transcript dumped on the card.

## 7. Nav
- Top groups + sub-nav each on **one line** (horizontal scroll, never wrap to 2 rows).
- Click a top group → jump to its first tab.

## 8. Icons
- **Our drawn marks only** (the `ICO`/`vmark` SVG set). **Zero standard emoji** anywhere.

## 9. Spacing
- Cards breathe: 20px padding, 16px gaps. Don't cram.

## 10. Verify like this
Authenticate a headless browser via `/admin-login?token=$ADMIN_TOKEN`, stub Clerk, screenshot each
real page. Fix until the live page matches this guide.

# Product types: per-product on/off flags (auto-hide the dropdown)

**What:** Each product type (Pokemon, One Piece, Topps, Nee Doh, etc.) gets its own on/off flag in
Admin (Policy page) — only new flag rows, nothing else in Admin changes. The consumer product
dropdown shows ONLY the enabled product types. Key rule: when exactly ONE product type is enabled
(e.g. Pokemon only), the site shows that product with NO dropdown at all — just the single product.
ADDITIVE (LAW 1): reuse the existing policy-flags plumbing + the existing product dropdown; snap the
gate onto them, don't fork a parallel path. Consumer site is FROZEN — owner-named, so use the
`.unlock` flow for `public/checkit.html` (product-selector scope only), verify-live, delete `.unlock`,
re-snapshot the page.

**Done when:** On staging, disabling a product type removes it from the dropdown; enabling multiple
shows them all in the dropdown; enabling exactly one shows that product with NO dropdown rendered.
Selecting/checking still works for every enabled product. EN + ES. Default = all current products on.
Truth snapshot re-taken.
**Lane:** Webbie (+ Admin flag rows)
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
Built on branch claude/webbie-task-queue-c4wpxu (PR). tsc clean, inline JS parses.
NOT on staging yet — verify-live + re-snapshot pending merge to staging.
```

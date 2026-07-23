# In-stock banner: owner on/off toggle

**What:** The in-stock banner on the consumer site should be switchable on/off from Admin.
Add ONE new policy-flag row in Admin (Policy page) — nothing else in Admin changes — and make
the consumer site read that flag: flag on → banner shows as today; flag off → banner hidden.
ADDITIVE (LAW 1): reuse the existing policy-flags plumbing the site already reads; do not build
a new config path. Consumer site is FROZEN — owner-named, so use the `.unlock` flow for
`public/checkit.html` (banner scope only), verify-live, delete `.unlock`, re-snapshot the page.

**Done when:** In Admin, toggling the new flag off hides the in-stock banner on staging; toggling
it on shows it. Default matches today's behavior (banner on). EN + ES unaffected. Truth snapshot re-taken.
**Lane:** Webbie (+ one Admin flag row)
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
verify-live 2026-07-23: staging https://staging.checkitforme.com/ → LIVE (serving HEAD 4f6c4a6).
inStockBanner flag live in policy + Admin (ship-admin @4f6c4a6, inStockBanner marker in live snapshot).
Truth snapshot re-taken. Defaults keep the banner ON; owner confirms the OFF state on his phone.
```

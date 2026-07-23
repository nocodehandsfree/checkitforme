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
Built on branch claude/webbie-task-queue-c4wpxu (PR). tsc clean, inline JS parses.
NOT on staging yet — verify-live + re-snapshot pending merge to staging.
```

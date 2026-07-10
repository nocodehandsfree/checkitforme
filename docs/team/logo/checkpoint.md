# Logo — checkpoint (current state)

_Newest on top. Keep ≤80 lines. Finished items drop off — git keeps history._

## Now
- **Shipped the 5 missing chains** (commit `f11b29a` on `claude/logo-asset-lane-setup-8rx7ep`,
  PR #7 → staging): habitat_restore, unique, metro_market, pak_n_save, payless_foods.
  All sourced from real marks, `_meta` set, cache bumped `?v=74`, STATUS rows updated.
  Verified locally at the exact tile math (52px / 42 sq / 44×34 wide) against locked
  neighbors. **NOT verified on staging /logo-wall** — needs the PR merged to `staging` first.
- **Awaiting owner approval** of the 5 (contact sheet sent in chat 07-10).

## ⚠️ Flag for owner / Webbie — "unique" fuzzy-match collision
`chainLogoFile()`'s fuzzy pass matches any store whose name contains the word "unique"
(staging has ~6: "Unique Card Depot", "Unique Emporium", "B. Unique", …). Once unique.png
merges, those unrelated stores will show the thrift-store logo. Fix belongs in render code
(exact-match guard for generic-word chains) — NOT an asset fix. Owner to decide.

## Sourcing notes (this batch)
- Habitat ReStore: mark-only (house emblem) from official vector (en.wiki
  `Logo_Habitat_for_Humanity.svg`), recolored brand green #54B848. 748 stores NOT in
  staging DB yet — resolver needs the chain name to contain "habitat restore" contiguously
  (e.g. "Habitat ReStore"); "Habitat for Humanity ReStore" will NOT fuzzy-match. Tell DD.
  Alt treatment if owner prefers: "ReStore" wordmark — no clean vector found yet.
- Unique = Savers brand (verified: stores.savers.com runs their pages). Official SVG:
  `assets.savers.com/images/uni-us-logo-240x42.svg`. ® dropped.
- Metro Market = Kroger/Roundy's WI. App icon (seller "The Kroger Co."). Brown m + leaf —
  same exact brown as locked Mariano's (#71554d vs #72524b), left unlightened for family
  consistency.
- Pak 'n Save = Albertsons/Safeway Emeryville+San Leandro CA (NOT the NZ chain, whose app
  comes up first on iTunes). Real lettering from BOTW print-logo scan (only public source,
  200px — fine at tile size); lozenge border + "Foods" dropped, stacked "Pak 'n"/"$ave".
- Payless Foods = the LA chain (620 E El Segundo Blvd — matches our store's "Athens CA").
  Official logo from paylessfoods.com (Squarespace CDN). The iTunes "Payless Foods" app
  (Four B Corp, Kansas) is a DIFFERENT brand — do not use.

## State of the assets
- 102 chain PNGs; cache `?v=74`. Locked: chunks 1–6a, 7b, 8. Awaiting approval: 6b, 7a, 9,
  New-stores (incl. this batch of 5).
- Pre-existing test failures on staging (qa-design 1 fail, qa-round6/gating/admin-plans) —
  unrelated to logos, present with logo changes stashed.

## Blockers
- Owner approval on the 5 new logos; then merge PR #7 and QA staging.checkitforme.com/logo-wall.

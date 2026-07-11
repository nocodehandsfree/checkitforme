# Logo — checkpoint (current state)

_Newest on top. Keep ≤80 lines. Finished items drop off — git keeps history._

## Now
- **Batch of 5 LOCKED by owner 07-10** (through commit `4736e87`, PR #7 → staging):
  habitat_restore, unique, metro_market (= copy of locked mariano_s per owner),
  pak_n_save (vector-traced red, 2 lines), payless_foods (owner's P mark). Cache `?v=78`.
  Iterations were sizing + color per owner review — all tight canvases (square-canvas
  padding was the "renders small" bug; locked set is trimmed tight).
- **MERGED to staging** (PR #7, merge `c99d0ad`) + VERIFIED live: all 5 render on
  staging.checkitforme.com/logo-wall at cache v78, files byte-match the locked assets.
- **Not yet on prod.** To reach checkitforme.com they need a staging→main promote
  (`bash scripts/promote.sh`) — owner-gated, not done. R2-migrate the 5 after promote so
  the `logo_url` pointers travel too.

## ⚠️ Single-source + explicit-binding (owner directive 07-11 — DD/Webbie own it)
Owner wants: ONE logo source (kill the repo-file vs R2 duplication) + logos bound to the
store's CHAIN, not matched by name. Individual stores (no chain) fall back to the store-type
icon already shown on site. No new "individual vs chain" field needed — `retailers.chainId`
(set = chain → `chains.logoUrl`; null = individual → type icon) already encodes it.
**Owner said "we're on top of it"** — DD/Webbie driving; not my lane to build.

Measured on staging (offline, replicating `chainLogoFile` on all 111,098 stores by name —
FILESYSTEM path only, does NOT see the DB-first `chainId→chains.logoUrl` path, so fuzzy is an
UPPER bound on reliance):
- 115 exact-slug (clean) · ~91,853 fuzzy-name-only · ~19,130 no logo (generic icon).
- Top fuzzy carriers: dollar_general 20k, dollar_tree 9k, walgreens 7.7k, family_dollar 7k,
  walmart 4.6k, ace_hardware 4.5k…
- The number that sizes the job (DD query): of the ~92k, how many already have a real
  `chainId` link (safe) vs only survive on the name-guess (would drop to generic if guess is
  removed). Until that's known, safest small fix = anchor the fuzzy match so it can't hit a
  loose generic word ("unique","pak"). The "unique" collision (Unique Card Depot etc.) is a
  subset of this.

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

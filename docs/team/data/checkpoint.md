# Check - Data — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, ≤80 lines. Prune finished
> items (history lives in git). Access token: Railway staging `ADMIN_TOKEN` → scratchpad `.atok`.

## KEY FACTS / DECISIONS (written nowhere else — do NOT re-learn the hard way)
- **ENV + SYNC (all four pipes LIVE, no hand-sync ever):** staging & prod are separate deploys/DBs.
  ① CURATED store data staging→prod every 5 min (`storeSyncTick`; fields in `store-sync.ts` CHAIN_CURATED/
  RETAILER_CURATED). ② LEARNED chain-nav prod→staging every 3 min (`learnedSyncTick`; manual
  `POST /api/admin/learned-sync`). ③ Owner's Admin settings prod→staging every 60s (`settings-sync.ts`,
  Pops' pipe — never touches chains/retailers; if a curated field ever moves into `settings`, flag Pops).
  ④ Never-sync fields (`phone`, `hours`, per-store learned) — write to BOTH envs directly, prod first.
  ⚠️ Hand-set nav on staging is overwritten from prod within 3 min — **map on PROD, it flows down.**
- **OPEN NOW ONLY (owner law 07-16):** `/pub/stores/near` never returns a store that's closed at
  request time (list, pins, rural fallback; owner-only test stores exempt). `hiddenClosed` in the
  response = suppressed count for UI copy. Lives in the FEED so list behavior is Data's lever, not Webbie's.
- **ONE DIALABLE RULE:** `chainDialable()` (recipe.ts) = !muted && callTarget && stockCheckMethod!=='site'.
  Read by mapping board + overnight batch + single-map — no surface re-decides callability on its own.
  Board rows carry `phones` + `blocker` so a data gap can never read as "all stores closed".
- **EVERY ODD-STATE DOOR SELF-DOCUMENTS (owner law 07-16):** muted / no-call-target / site-check chains
  carry their WHY in `unmappableReason`/`stockCheckNote` ON THE CHAIN ROW (syncs to prod). Audit = 0 missing.
  Keep it that way: never mute/flip a chain without writing the reason in the same breath.
- **KIOSK IDENTITY TRAP (full story in GOTCHAS):** the vending overlay re-binds rows when TPCi moves
  machines — NEVER patch kiosk rows by DB id across time; match by ADDRESS+state+chain-token
  (`ingest_kiosk_contacts.py` does this). TPCi API has NO phone field. Root fix open: key rows by place.
- **SILENT-AGENT BUG:** stray `avgTreeSeconds` on a direct chain mutes the agent on a live human.
  Read-guard `connectAtSecFor` (recipe.ts); write-guard in `PATCH /api/chains/:id`. Independents+co-ops
  default direct via `DIRECT_DEFAULT_CHAINS`+`backfillDirectChains()` (enforced every boot; nav-sync skips them).
- **BOOT BACKFILLS (`import-data.ts` via `bootstrap.ts`):** `backfillChainTypes()` fill-only re-derives
  `chain.type` from `CHAIN_TYPES` (brand missing from table → reverts to "Other" every deploy).
- **PRICING/CALLABLE:** MSRP retailer → `stockCheckMethod="site"` (never called, off the mapping board;
  Micro Center is the archetype — owner: never callable). Hobby (sells ABOVE MSRP) → `"call"`.
- **PRODUCTS:** Drops DB read-only sync (`scripts/sync-dropsdb.ts`); curated adds via
  `data/pokemon-catalog-supplement.json`. Never fabricate a historical MSRP.
- **THIS BOX:** python-http AND headless Chromium proxy-blocked; Google/Bing/DDG bot-block curl; Overpass
  blocked. Free web scraping impossible here → owner's phone/Google loop (boxes) is THE harvest path.
  Admin API via `curl` subprocess only. TPCi vending API IS reachable (no UA tricks needed).
- **NEVER** run the paid hours backfill (`/api/hours/backfill`) or re-chain big-box from directories.

## IN PROGRESS (owner away — resume here)
- **WALGREENS INCIDENT CLOSED 07-20 (full story in GOTCHAS):** 18 mapped big-box chains carried a
  pre-history "site" flag → ALL flipped to call on BOTH envs (verified 18/18). Sweep: 93 mapped chains,
  zero recipes wiped. Today's CVS/Walgreens zone failures = the NEW My Zones call path skipped
  Alpha/Bravo recipe attachment (its builder fixing) — NOT the flag, NOT a new CVS phone system
  (owner called CVS himself: unchanged; Echo's "new assistant" claim = false). Guards live: intel seed
  + chain PATCH refuse to unflag-from-call-lane on mapped chains w/o force; board shows CONFLICT.
- **Mapping is at 99.9% (Mapper's final run 07-16):** Publix (1,240) + Woodman's + H Mart locked;
  Macy's muted. The last 0.1% = the 7 chains whose Google numbers were fabricated (see OPEN below) —
  once real numbers land, Mapper takes one more pass. H-E-B nav note for that pass: press 0 works but
  only AFTER the greeting plays (barge at 3s gets dropped — Mapper tested).
- **NEXT SESSION ON DECK (owner's plan):** owner pulls real numbers from each chain's OWN store
  locator / Google Maps pins (never the answer box), I ingest address-verified, Mapper finishes.
- **HOURS backfill loop (PAUSED by owner — resume when he says):** ~3,300 fresh storefronts (Habitat
  ReStore + WPN adds) still hourless. Batch 2 (150) was cut and never pasted back. Flow:
  send box from `docs/team/data/handoffs/hours_needed_fresh.csv` → owner Googles → 
  `ingest_hours.py <resp> <sent> --apply` (id-keyed is SAFE here — these are storefronts, not kiosk rows).
- **"Time to reach a human" on the call button:** `reach` field already ships on `/pub/stores/near`
  ({kind:direct} | {kind:menu,seconds} | null, evidence-only). Webbie owns the UI; data side done.

## OPEN (smaller)
- **7 kiosk chains need REAL numbers (Google answer box FABRICATED the last batch — owner dialed 3/3
  bad; all 105 quarantined to nophone on both envs 07-16 evening):** H-E-B, Lucky, FoodMaxx,
  Metro Market, Stop & Shop, Pak N Save, Uwajimaya. NEW LAW: phones ONLY from the chain's own store
  locator or the Google MAPS pin — never the AI answer box. Woodman's + H Mart numbers were real
  (Mapper locked both). Hours kept (display-only, low risk).
- **Staging/prod count mismatch to chase:** quarantine found 105 bad numbers on prod but only 33 on
  staging — something re-imported/overwrote staging retailers again (same phantom as the identity
  shuffle). Check for dupe rows on the kiosk chains and find WHO runs the overlay.
- Payless Foods Athens: 1 store, NO phone exists anywhere. Mute or leave.
- Fry's Gilbert 102795 + Mariano's Westchester-IL 102842: held-back wrong numbers; chains already mapped.
- Kiosk root fix (my lane, post-launch): key kiosk rows by PLACE, overlay machines via `kiosks` table,
  so TPCi machine moves stop rewriting row identities.
- Logos needed (real brands): Habitat ReStore, Unique — owner getting. Logo-resolver hardening spec →
  DevOps: delete the fuzzy substring fallback (0 stores ride it).
- Grade ~38 unscored chains (`tier:null`). Expand `data/distributors.json` when owner's research lands.
- New-chain candidates (free, same playbook): Buffalo Exchange, Plato's Closet, St. Vincent de Paul, ARC.
- PROD front-end BEHIND staging (promote = owner's call, not mine): `type` filter + hobby/thrift chips.

## DONE 2026-07-16 (kiosk day — detail in git log)
Kiosk phones COMPLETE (178 numbers applied both envs, address-verified; 13 mall-common-area machines
muted w/ reason) · misdial incident fixed + GOTCHAS'd · learned-sync built · chainDialable() unified ·
radius ladder + rural fallback live on `/pub/stores/near`.

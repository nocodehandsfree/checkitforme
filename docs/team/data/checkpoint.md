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

## IN PROGRESS
- **Mapper is mapping NOW (owner confirmed 07-16):** the 9 all-kiosk grocery chains — H-E-B (84 stores,
  owner-verified PRESS 0 → customer service), Woodman's (14, 24h), Lucky (7), H Mart (6), FoodMaxx (5),
  Metro Market (5), Stop & Shop (2), Pak N Save (1), Uwajimaya (1) — plus a one-call test of Macy's
  Toys-R-Us counter (dead-end ⇒ mute, owner approved). Locked nav lands on prod → auto-flows to staging.
  My side is DONE (phones+hours on both envs); nothing to do unless Mapper hits a data gap.
- **HOURS backfill loop (PAUSED by owner — resume when he says):** ~3,300 fresh storefronts (Habitat
  ReStore + WPN adds) still hourless. Batch 2 (150) was cut and never pasted back. Flow:
  send box from `docs/team/data/handoffs/hours_needed_fresh.csv` → owner Googles → 
  `ingest_hours.py <resp> <sent> --apply` (id-keyed is SAFE here — these are storefronts, not kiosk rows).
- **"Time to reach a human" on the call button:** `reach` field already ships on `/pub/stores/near`
  ({kind:direct} | {kind:menu,seconds} | null, evidence-only). Webbie owns the UI; data side done.

## OPEN (smaller)
- Payless Foods Athens: 1 store, NO phone exists anywhere (only board blocker left). Mute or leave.
- Two owner-googled numbers held back as WRONG: Fry's Gilbert 102795 "(482)" nonexistent area code,
  Mariano's Westchester-IL 102842 "(914)"=NY number. Re-google someday; chains already mapped.
- Kiosk root fix (my lane, post-launch): key kiosk rows by PLACE, overlay machines via `kiosks` table,
  so TPCi machine moves stop rewriting row identities.
- Logos needed (real brands): Habitat ReStore, Unique — owner getting. Logo-resolver finding → DevOps
  (`docs/specs/logo-resolver-hardening/`): delete the fuzzy substring fallback (0 stores ride it).
- Grade ~38 unscored chains (`tier:null`). Expand `data/distributors.json` when owner's research lands
  (TPCi is ACQUIRING Excell, announced 2026-02-19 — re-verify the map when it closes).
- New-chain candidates (free, same playbook): Buffalo Exchange, Plato's Closet/Once Upon a Child,
  St. Vincent de Paul, ARC.
- PROD front-end BEHIND staging (promote = owner's call, not mine): `type` filter + hobby/thrift chips.

## DONE 2026-07-16 (kiosk day — detail in git log)
- **Kiosk phones COMPLETE:** owner googled 178 numbers+hours in 3 boxes; applied to BOTH envs,
  address-verified. Every verified kiosk is dialable except Payless (no number exists). 13 machines in
  mall common areas = muted for good with owner's reason stamped on the chain (Pokemon Vending).
- **Misdial incident caught+fixed:** batch-1 numbers applied by id landed on shuffled rows (TPCi moved
  machines mid-day) — all reverted + re-applied by address on both envs; verified clean; GOTCHAS'd.
- **learned-sync built** (prod→staging nav, closes the "mapped on prod, gray on staging" class),
  **chainDialable() unified**, mapping board shows phones/blocker, 20 unexplained mutes labeled,
  radius ladder + Check Plus cap + rural fallback live on `/pub/stores/near`.

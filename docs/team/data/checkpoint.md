# Check - Data — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, ≤80 lines. Prune finished
> items (history lives in git). Access token: Railway staging `ADMIN_TOKEN` → scratchpad `.atok`.

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** store/chain/product data on BOTH envs + the sync pipes. The CALLING ENGINE
   (`src/voice/`) is FROZEN — machine-blocked; data shapes call behavior ONLY through
   recipes/settings via the guarded doors, reason stamped in the same breath, never a new writer.
2. **KEY FACTS below are LAW** — the four pipes, the ONE DIALABLE RULE, never-sync fields,
   map-on-PROD, phones ONLY from the chain's own locator or the Google MAPS pin (never the answer
   box), no paid hours backfill, kiosk rows matched by ADDRESS.
3. **Mapped chains are untouchable:** the flip-guard refuses unflagging without force — never force
   it without a PM/owner box. Every mute/flip writes its WHY on the chain row, same breath.
4. **Done** = counts verified on BOTH envs + Done Report (Built/Drove/Left). Never run the full
   suite unprompted, never in background.

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
- **CALLABLE LAW (rewritten 07-20):** `stockCheckMethod="site"` is for UNCALLABLE chains ONLY
  (Micro Center, Spencer's, Best Buy). Every mapped chain = "call" — 18 big-box flipped 07-20, and
  code now REFUSES to flag a mapped chain site/muted/no-call without force (PATCH 409 + seed skip).
- **PRODUCTS:** Drops DB read-only sync (`scripts/sync-dropsdb.ts`); curated adds via
  `data/pokemon-catalog-supplement.json`. Never fabricate a historical MSRP.
- **THIS BOX:** python-http AND headless Chromium proxy-blocked; Google/Bing/DDG bot-block curl; Overpass
  blocked. Free web scraping impossible here → owner's phone/Google loop (boxes) is THE harvest path.
  Admin API via `curl` subprocess only. TPCi vending API IS reachable (no UA tricks needed).
- **NEVER** run the paid hours backfill (`/api/hours/backfill`) or re-chain big-box from directories.

## IN PROGRESS (owner away — resume here)
- **WALGREENS INCIDENT CLOSED 07-20 (full story in GOTCHAS):** 18 mapped big-box flipped site→call
  both envs (18/18 verified); sweep = 93 mapped chains, zero recipes wiped. Real failure cause: My
  Zones path skipped recipe attachment (builder fixing). CVS unchanged (owner-verified). Guards live.
- **Mapping 99.9%:** last 0.1% = the 7 fabricated-number chains (OPEN below). Next session: owner
  pulls numbers from chain locators/Maps pins, I ingest address-verified, Mapper finishes
  (H-E-B: press 0 only AFTER the greeting — barge at 3s gets dropped).
- **HOURS backfill PAUSED (owner resumes):** ~3,300 storefronts hourless. Box from
  `handoffs/hours_needed_fresh.csv` → owner Googles → `ingest_hours.py <resp> <sent> --apply`
  (id-keyed SAFE here — storefronts, not kiosk rows).

## OPEN (smaller)
- **7 kiosk chains need REAL numbers** (answer-box fabrications quarantined to nophone both envs
  07-16): H-E-B, Lucky, FoodMaxx, Metro Market, Stop & Shop, Pak N Save, Uwajimaya. Owner pulls from
  store locators, I ingest address-verified, Mapper finishes.
- **Staging/prod count mismatch to chase:** quarantine wrote 105 on prod but staging showed 33 —
  something re-imports/overwrites staging retailers (same phantom as the identity shuffle). Find WHO.
- Admin fields build AWAITING OWNER GO (mockup: claude.ai/code/artifact/b5259f70-2c73-4557-938a-9d182f353a42).
- Payless Foods Athens (no phone exists: mute or leave) · Fry's Gilbert 102795 + Mariano's
  Westchester-IL 102842 held-back wrong numbers (chains already mapped).
- Kiosk root fix (post-launch): key kiosk rows by PLACE (`kiosks` overlay) so TPCi moves stop
  rewriting row identities.
- Logos: Habitat ReStore, Unique (owner getting) · logo-resolver: delete the fuzzy substring fallback
  (0 stores ride it) · grade ~38 unscored chains · re-verify distributor map when TPCi's Excell
  acquisition closes (announced 2026-02-19).
- PROD front-end BEHIND staging (promote = owner's call): `type` filter + hobby/thrift chips.

## DONE (detail in git log)
- 07-16 kiosk day: 178 owner-googled phones applied address-verified both envs; misdial caught+fixed;
  learned-sync + chainDialable + board blockers + radius ladder + open-now feed law shipped.
- 07-20: Walgreens incident closed (see IN PROGRESS top); mapped-chain guards live + verified.

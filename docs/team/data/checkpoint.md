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
- **07-22 LOGO FLAGS — both envs, LIVE (curated, feed-verified):** logo_wide=true on 15 wide wordmarks
  (Scheels, Sheetz, Smith's, Staples, Star Market, TJ Maxx, Tractor Supply, Vons, Walgreens, Wawa, Wegmans,
  WinCo, Micro Center, Ross Dress for Less, Tokyo Japanese Lifestyle); Publix logo_wide=false; TJ Maxx
  logo_dark=false (killed white plate). Walmart + Tom Thumb stay square. Via PATCH /api/chains/:id.
- **⚠️ OPEN BUG — NOT data, CSS/Webbie lane:** the small "Calling" chip does NOT stretch wide logos even
  with logo_wide=true (~15px crushed). `.callwho.widelogo` (public/checkit.html ~L485) not winning; store
  tiles + result header stretch fine. Owner verified staging still small (2 strikes). **PM: route to Webbie.**
- **07-22 shipped STAGING — PM: promote wanted:** openHistEntry re-pulls live store logo so a REOPENED old
  call shows the current logo. public/checkit.html. New checks already right on prod; old-call repaint needs promote.
- **Mapping 99.9%:** last 0.1% = 7 fabricated-number kiosk chains (OPEN). Owner pulls numbers from chain
  locators/Maps pins, I ingest address-verified, Mapper finishes.
- **HOURS backfill PAUSED (owner resumes):** ~3,300 hourless. `handoffs/hours_needed_fresh.csv` → owner
  Googles → `ingest_hours.py <resp> <sent> --apply` (id-keyed SAFE — storefronts).

## OPEN (smaller)
- **07-22 CHRIS ALERT HUNT (read-only prod):** NOTHING for +17188259888 — 1 account (owner only), 0 subs,
  0 sends. Break = signup/opt-in never hit prod. Left: Clerk auth records + staging. **PM routes.**
- **7 kiosk chains need REAL numbers** (nophone both envs): H-E-B, Lucky, FoodMaxx, Metro Market, Stop &
  Shop, Pak N Save, Uwajimaya.
- **Staging/prod count mismatch:** quarantine wrote 105 prod, staging showed 33 — something re-imports staging retailers. Find WHO.
- Held-back wrong numbers: Fry's Gilbert 102795 + Mariano's Westchester-IL 102842 (mapped) · Payless Foods Athens (no phone: mute/leave).
- Logos: Habitat ReStore, Unique (owner getting) · delete logo-resolver fuzzy fallback (0 ride) · grade ~38 unscored · re-verify distributor map post-TPCi/Excell.
- PROD front-end BEHIND staging (promote = owner): `type` filter + hobby/thrift chips.

## DONE (detail in git log)
- 07-20 Walgreens closed (18 big-box site→call both envs; guards live) · 07-16 kiosk day: 178 phones
  address-verified both envs; learned-sync + chainDialable + radius ladder + open-now feed law shipped.

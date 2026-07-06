# Check — Data Dev (store data)

You are **Check - Data Dev.** You own the store dataset: adding/cleaning stores, logos, types,
shipment days, values, and the import structure. (You manage the *rows*; Admin builds the *UI*.)

## ⚠️ CORE PRINCIPLES — data integrity (READ FIRST, never violate)

You are the STEWARD of this data. Your job is not to obey instructions blindly — it is to keep the
data honest. If an instruction (even from the owner) would put wrong or un-callable stores in front of
users, **STOP and push back BEFORE you do it.** The owner has explicitly asked you to do this. Getting
this wrong erodes user trust in the whole product. Data integrity ALWAYS wins.

**1. The prime directive — a store is "callable" ONLY if a human at THAT physical location can answer
   about stock right now.** Not the chain. Not a call center. Not a recording. If there is no dialable
   store line, it is NOT callable. Period.

**2. Never make a whole chain callable by assumption.** "The brand sells Pokémon online / at this
   chain" is chain-level evidence — it does NOT prove a given store has product on its shelf or a human
   who can check. Flipping a whole chain to callable floods the list with dead calls and looks broken.
   *(Real mistake, 2026-07-04: flipped every Kroger/Ralphs/Vons/Albertsons store callable → owner saw
   14 grocers in one retail screen. Correct move was machine-stores ONLY. I should have refused the
   blanket flip and proposed the narrow one.)*

**3. The four store modes (get the flags right):**
   | Real-world store | hasKiosk | sellsPacks | phone | stockCheckMethod | shows in |
   |---|---|---|---|---|---|
   | Machine **+** shelf | true | true | real | call | Kiosk **and** Retail (dual, tier 5) |
   | Machine only (no shelf) | true | false | (any) | call | Kiosk only |
   | Shelf only, no machine | false | true | real | call | Retail only |
   | **Uncallable, HIDE** (call center / recording, no stock feed) | any | false | (any) | (any) + **`muted=true`** | nothing — hidden everywhere (Best Buy, Spencer's) |
   | **Uncallable, SHOW** (site mirrors live stock) | false | false | (recording/none) | **site** | Buy-online / live-stock card, no call (Micro Center) |
   - `callable = sellsPacks !== false && phone && !phone.startsWith("nophone:")` — this is THE gate.
   - The call script follows the TAB the user tapped (kioskMode from the request wins over store flags),
     so ONE dual-flagged row serves both sections. Do not create duplicate rows.

**4. Uncallable chains (no human at the store answers) — pick the right treatment, never leave callable:**
   - **HIDE it → `muted=true`** (chain-level kill-switch): vanishes from every list, never called. Use
     when we can neither call NOR show useful stock (central call center / recording, no live-stock feed).
     e.g. **Best Buy**, **Spencer's** (chain 19, store # is a corporate recording that hangs up — muted
     2026-07-04). `muted` is independent of `online`/`sellsPacks` (a muted chain may still sell packs/online).
   - **SHOW as buy-online → `stockCheckMethod="site"` + `sellsPacks=false`** (site-rail): uncallable but
     the chain's website mirrors live stock, so we show it with live stock + buy link, no call. e.g.
     **Micro Center**. ONLY when a `/pub/stock` feed exists — else it renders a dead "checking…" state,
     so mute instead. (Schema doc: `docs/specs/store-data-schema.md` §5, muted row fixed 2026-07-04.)

**5. "Absolutely certain" has a standard.** Shelf presence = the chain's OWN online store lists the SKU
   (chain-level) OR a machine is on site (per-store). Social-media / anecdotal sightings = NOT certain →
   HOLD, do not flip. (Held for this reason: WinCo, Woodman's, Gelson's, Lucky, FoodMaxx, H Mart.)

**6. Safe-change discipline.** Staging first; prod only on the owner's explicit word. Every bulk change
   must be reversible and you must know how to revert it before you run it. NEVER delete a real store
   (deactivate only). Snapshot / dry-run before big writes.

**7. The levers (endpoints, all admin-gated, browser UA + `x-admin-token`):**
   - Surgical bulk update: `POST /api/stores/patch {where:{chain|ids[]|state}, set:{...}, dryRun}`.
   - Full scan (for filtering by hasKiosk/etc.): `GET /api/admin/table-dump?name=retailers&limit=20000&offset=N`.
   - Chain edit: `PATCH /api/chains/:id` (type, muted, stockCheckMethod, isMSRP, repackOnly, sellMethods…).
   - Import/upsert-by-phone: `POST /api/stores/import`. Region/tz backfill: `POST /api/stores/backfill-regions`.
   - Key chain flags: `type` (chip bucket; the CHAIN NAME is the specific kind), `muted` (hide chain),
     `isMSRP` (false ⇒ resale/market-price ⇒ "SHOP PRICES" tag), `stockCheckMethod` (call|site).

## Your lane
- `data/` — the 100K-store source JSON (stores-master, zones, intel).
- `src/stores-import.ts` — the importer (field mapping, dedupe-by-phone, region/tz).
- Store data via the admin CMS + the in-admin AI agent (`src/agent/admin-agent.ts` tools) and the
  import script `scripts/import-stores.ts`.
- The store columns in `src/db/schema.ts` (`retailers`, `chains`) — propose schema changes to DevOps.

## Don't touch
- The call/auth/billing/voice backend, the web UIs (request UI changes from Website/Admin),
  schema changes outside store tables (request from **DevOps**).

## Read (in order) — open only what you need
1. `/HANDOFF.md` · `docs/ARCHITECTURE.md`
2. **`docs/DATA_PROVENANCE.md`** — where ALL store data comes from + the one-source-of-truth rule
   (every surface reads the same DB rows). **Read this first** so you never introduce a parallel list.
3. **`docs/specs/store-data-schema.md`** — the full store-data reference: every collector field →
   DB column, the hours format (incl. the 2 AM bug), dedupe rules, the behavior flags, and how to
   load a file. (This is also the doc handed to the planning chat for new data.)
4. **`docs/specs/scoring.md`** — the 1–5 tier rubric (`retailers.tier`), derived from the owner's
   scoring package now committed at `data/source/chain-scoring-2026-06/`.
5. `data/stores-master/README.md` + `COVERAGE_REPORT.md` · `docs/STOCK_AND_GEO_API.md` (store shapes)
6. The `retailers`/`chains` tables in `src/db/schema.ts` · `src/stores-import.ts`

## How you access files & keep the lane clean (process)
- **Edit only your lane:** `src/stores-import.ts`, `data/**`, `scripts/import-stores.ts`, and the
  `retailers`/`chains` columns in `src/db/schema.ts`. Everything else is read-only for you.
- **Don't load files outside the Read list** unless a task needs them — keeps your context lean and
  avoids stepping on another lane's in-flight edits.
- **Schema changes (new columns) are NOT yours to make** — `src/db/schema.ts` + `src/db/bootstrap.ts`
  are co-owned with DevOps and schema is bootstrap-managed (never `drizzle-kit generate`). Propose the
  column to **DevOps**; they add the `ALTER TABLE` to bootstrap, then you populate it.
- **UI is not yours** — if a fix needs a map/list change (e.g. how a logo renders), file it to
  **Admin** (admin UI) or **Website** (consumer UI); you supply the rows + assets, they render.
- **Loading data:** dry-run first (`tsx scripts/import-stores.ts <file> … --dry`), then the real run.
  Import is an idempotent upsert keyed on phone — safe to re-run; appending can't create dupes.
- Work on the **staging** branch `claude/checkitforme-website-takeover-pagiis`; push = live at
  staging.checkitforme.com in ~3 min. Promote to prod by merging staging → prod.

## Roadmap (later)
- **Hobby: one best-price report (after zones).** Today Hobby is manual. The user picks the exact
  product (series, set, type), calls each nearby hobby shop one at a time, hears the price, and decides
  for themselves. When **zones** ship, turn this into one report: fan out to the nearest 3 or 4 hobby
  shops, ask each "do you have {product}, and what's your price," and return a single answer ranked by
  price, cheapest on top.
  - **Data dependency:** the call has to capture a **price** per hobby call. New field on `call_results`
    (DevOps schema add) so prices can be compared and stored. The picker data is already ready:
    `data/pokemon-sets.json` (era to set) plus the products catalog for types and the retail anchor
    (`pmsrp` = what Pokémon charges).
  - **Also needs (call backend):** firing several calls for one request and grouping them into one
    result, plus a "has it but wouldn't quote a price" state. Call scripts/workflows are added per store
    (`vt_store_workflows`), so a rotation of scripts that try to get the price can be dropped in now.

## Standing duty: the Pokémon set registry
`data/pokemon-sets.json` is the CANONICAL era/set registry (13 eras, 129 sets, Base Set 1999 → today;
codes + release dates, newest first). The website pulls it at **`GET /pub/pokemon-sets`** (serve-time
merge of each set's product types + retail anchors from the products catalog). **Whenever a new set is
announced or released: add it here** (upcoming sets go in early with their future date so the front end
can badge them), bump `updated`, push. Verified codes 2026-07-02 vs TCGplayer (ME2.5 = Ascended Heroes,
ME03 = Perfect Order — the design grid had these mislabeled).

## Current focus (KEEP UPDATED)

**Session 2026-07-06 — hours truth fix + real LA shop hours + launch-readiness board (autonomy grant).**
- **Midnight "open" bug (owner's 00:11 map, Hallmark + thrifts showing Open) — FIXED.** `src/store-hours.ts`
  `unknownHoursState()`: stores with NO looked-up hours now read **"Likely closed" 9 PM–7 AM** (window
  crosses midnight) and the call gate (`known && !open`) refuses them in that window. Daytime unchanged
  (fail-open to preserve coverage). 16/16 unit tests pass (`scripts/test-store-hours.ts`, `test-storehours.ts`).
- **Real per-day hours imported for 119 LA card/comic shops** — looked up via **FREE Google (my WebSearch
  subagents), $0 owner spend** (the server's backfillHours/OpenAI path BILLS the owner — do NOT run it;
  I killed a mistaken run last session). Method: 5 batches of ~30 shops → agents return per-day
  `{mon:"HH:MM-HH:MM"|"closed"|"unknown",…}` → `scratchpad/agg_hours.py` zips to input list, matches shop
  data by name for phone, converts to canonical `hours` JSON, upserts via `POST /api/stores/import`
  (updated 119, inserted 0 = no dupes). "24:00" close → "00:00" (renders "till 12 AM"). Verified live:
  LVLUP "Closed" (past Sun close), Joyful Toad "till 12 AM", Best Deer Antlers "Closed · opens 9 AM tomorrow".
- **6 stores deactivated** (never deleted): 5 permanently-closed (returned closed ALL 7 days — Meltdown
  Comics, Comics Unlimited, Earth-2, Card Shack HB, LA Gaming TCG) + Evike.com (airsoft big-box
  mis-harvested into the card set; was already inactive from the prior junk sweep).
- **23 all-"unknown" shops left on the fallback** (night-window covers them) — next: scale the free-lookup
  method nationwide to the ~10K stores still without real hours.
- **Launch-readiness board** published as an Artifact (store network 110,316 / callable 103,970 / **90.8%
  real hours** / 52 states / catalog 11-of-129 sets with products). Honest about the 2 gaps: hours tail +
  older-era product depth. Numbers from `/api/admin/store-intel` + full `retailers` scan (`scratchpad/scan_launch.py`).

**Session 2026-07-04 — Drops DB is the product SOURCE OF TRUTH; catalog now syncs from it.**
- **dropsdb.fungibles.com** (closed beta, password login) is where product types/MSRP/retailers are
  captured. `data/drops_db.json` is a SNAPSHOT that `seed.ts` loads → `products` table → `/pub/pokemon-sets`.
  **New sync tool: `scripts/sync-dropsdb.ts`** (`DROPSDB_PASSWORD=… npx tsx scripts/sync-dropsdb.ts`) pulls
  the live catalog into the snapshot. Store `DROPSDB_PASSWORD` in Railway so it can run in CI/on-demand.
  seed.ts is `onConflictDoNothing`, so NEW products flow in on the next deploy (price changes on existing
  rows need an upsert — future improvement).
- **Answered "why do some sets have more product types than others":** they don't in OUR pipeline — the
  feed mirrors the Drops DB EXACTLY (verified product-by-product with the beta pw). Chaos Rising = 3 types
  in BOTH feed and Drops DB (7 rows, per-retailer, dedupe to ETB/Booster Bundle/Booster Box); Ascended
  Heroes = 7 in both. So the variance is **Drops DB data-ENTRY completeness**, not a sync bug. 112 of 129
  registry sets have 0 products because the Drops DB only tracks CURRENT drops (older sets are out of print).
- **Gap audit for whoever maintains the Drops DB** (entered types are uneven — even core types missing):
  Prismatic Evolutions missing Booster Box+Bundle; Ascended Heroes missing Booster Box; Chaos Rising
  missing Blister/Build&Battle; many sets 1-3 types. Complete those IN the Drops DB → they flow to the feed.

**Session 2026-07-04 (latest) — Data-integrity principles written up top + online-only flag.**
- Added the **⚠️ CORE PRINCIPLES** block at the top of this doc (read-first). Owner directive: the Data
  Dev is the data STEWARD and must push back on any instruction that would break integrity, BEFORE
  acting — not after. Captured the grocery over-reach as the cautionary example.
- **Uncallable-chain flagging (reconciled with mapping dev + the muted convention):** two treatments —
  `muted=true` HIDES the chain (Best Buy), `stockCheckMethod=site`+`sellsPacks=false` SHOWS it as
  buy-online with live stock (Micro Center). **Spencer's** (chain 19, corporate recording, hangs up):
  first flagged site-rail, then **MUTED 2026-07-04** because owner wants it gone AND there's no live-stock
  feed → hidden (199→61 search results). Fixed the misleading muted definition in
  `docs/specs/store-data-schema.md` §5 (it said "repack-only only" — now covers the uncallable reason too).
  Mapping dev surfacing more uncallable chains; mute or site-rail each per the §3 table.
- **Minor debt spotted:** a few non-Spencer rows ("Spencer School", "Spencer's Corners Farm") are
  mis-mapped under chain 19 — a name-match import artifact; re-chain/clean when convenient.

**Session 2026-07-04 (later) — Grocers made callable for SHELF Pokémon (dual kiosk+retail). Staging.**
- **Problem:** grocery chains were in our data ONLY as Pokémon vending-KIOSK sites (from
  `pokemon-vending-import.json`, 1,915 machines) — `sellsPacks=false`, so a call only asked "is the
  machine working?", never "do you have Pokémon in stock?". But these grocers also sell Pokémon on
  SHELVES, so they should be callable.
- **Model (verified in code):** the call script follows the TAB, not the store — `SEL_KIOSK` is set by
  which section you tap (checkit.html 3560 retail→false, 3575 kiosk→true) and the request's `kioskMode`
  WINS over the store's flags (service.ts 208). So ONE dual-flagged row (`hasKiosk=true` +
  `sellsPacks=true` + real phone) shows in BOTH sections and asks the right question each. No duplicate rows.
- **Did it — CORRECTED to MACHINE-STORES ONLY (scope A).** First pass flipped `sellsPacks=true` on ALL
  rows of the 23 verified banners (4,647) — WRONG: it flooded the retail list with plain grocery stores
  that have no card presence (owner saw 14 grocers near Woodland Hills, only 2 with machines). The rule
  is: a store is dual ONLY if it has a MACHINE **and** the chain sells shelf. So reverted the **2,972
  non-machine** grocery rows back to `sellsPacks=false` (out of retail) via table-dump scan → patch by
  ids; **kept the 1,675 machine-grocers dual** (`hasKiosk=true`+`sellsPacks=true`, tier 5). Verified:
  Woodland Hills retail went 14 grocers → 2 (both machine-stores); machine-grocer still in both sections.
  Verified banners: Kroger family (Kroger, Fred Meyer, Fry's, King Soopers, Food 4 Less, Smith's, QFC,
  Pick 'n Save, Metro Market, Mariano's, City Market, Harris Teeter, Ralphs) + Albertsons family
  (Albertsons, Safeway, Jewel-Osco, Vons, Shaw's, Acme, Tom Thumb, Randalls, Star Market, Pavilions).
  **LESSON: only flip machine-stores dual; do NOT make a whole grocery chain callable.**
- **Certainty gate (owner: "absolutely certain they sell shelf Pokémon"):** confirmed via each family's
  online store (kroger.com, safeway/vons/albertsons.com list live Pokémon SKUs). H-E-B confirmed too.
- **HELD (not flipped):** **H-E-B** (84 rows — verified shelf-seller BUT placeholder rows have NO phone;
  heb.com is Akamai-walled, so phones need a local pull / research-Claude — "you run the rest" case).
  **WinCo, Woodman's, Gelson's, Lucky, FoodMaxx, H Mart, Uwajimaya** = shelf-Pokémon unproven, held.
  **Mall kiosks** (Citadel/Chapel Hills/etc.) = no shelf, stay kiosk-only.
- **Promote to prod:** re-run the same `/api/stores/patch` sellsPacks=true for those 23 banner names on
  checkitforme.com. Then do H-E-B once its phones exist.

**Session 2026-07-04 — THE PHONEBOOK: 4,123 card + 436 comic shops harvested; Thrift turned on. Staging.**
- **National Hobby 1,188 → 5,710. Thrift 0 → 3,479.** All on staging, all correctly tagged, zero tag drift.
- **cardshophub.com is fully harvestable** (the "phonebook"): each shop page is server-rendered JSON-LD
  (`<script id="shop-json-ld">` → name/streetAddress/city/state/zip/telephone/geo). Sitemap enumerates
  6,672 shop URLs at `/states/<st>/<city>/<shop>/`. Plain curl (browser is proxy-blocked with
  ERR_CONNECTION_RESET; curl through `$HTTPS_PROXY` works). Harvested all 6,672 → **4,123 card shops,
  50 states** after dropping 2,254 big-chain rows (GameStop/Target/etc — NEVER re-chain those) + 254
  no-phone + 41 dup. Tooling committed: `scripts/harvest-shop-directory.py` + `scripts/transform-shops.py`.
- **comicshoplocator.com = one-file dump.** Its locator.js does `fetch('/comic-shops/stores-search.json')`
  — the whole directory (443 shops, compact keys n/st/c/sta/z/la/lo/p) in ONE request. → **436 comic
  shops, 45 states.** Comic shops carry Pokémon/Magic/Yu-Gi-Oh/One Piece/Lorcana.
- **Store-type model (owner: "must figure out the store type… maybe a Bookstore vertical later"):** chip
  `type` is the UMBRELLA (both comic + card = "Hobby" so they ride the Hobby chip); the CHAIN is the
  specific kind — **"Comic Book Shop" (chain 129)** vs **"Independent Card Shop" (chain 128)**, both
  `type=Hobby isMSRP=false` (SHOP PRICES). Thrift kinds = Goodwill/Salvation Army/Savers/**Unique** (116-119,
  `type=Thrift`). A **Bookstore** vertical is a straight `?type=Bookstore` later (that type already exists, 746).
- **⚠️ HOURS ARE THE GAP.** Neither directory publishes structured open/close times — harvested shops
  default to "open by day, closed 1-6am". The paid lookup works (proved on 6 LA shops → real hours +
  live labels): `POST /api/hours/backfill` (bulk, fire-and-forget) or `POST /api/hours/:id/refresh`,
  gated by policy flag `dogfoodHours` (OFF, ~1-2¢/store, ~5k hobby shops ≈ ~$100). **Owner deciding
  whether to green-light.** Server has the OPENAI/GEMINI keys; my shell does not.
- **Durable + prod-promotable:** `data/hobby-card-shops.json` (4,123), `data/comic-shops.json` (436),
  `data/hobby-shops.json` (8 curated). **Promote to prod** = `POST checkitforme.com/api/stores/import`
  each file, then PATCH the thrift chains (116-119→Thrift) + assert 128/129→Hobby on prod. Loop cron
  `9e2bde0e` (15-min, 12x) keeps re-verifying tags (clobber watch) and stands ready to fold in hours.

**Session 2026-07-03 (late) — Hobby expansion + phonebook-source assessment. Staging.**
- **8 more verified card shops live on the LA Hobby chip** (was 16 CA Hobby, mostly GameStop; the LA
  metro read as 5 GameStop + 2 indies). New indies, each Census-geocoded, real address/phone/hours,
  in **`data/hobby-shops.json`** (version-controlled = re-importable to any env): Cards and Coffee
  (Hollywood, Calabasas, Murrieta, Salt Lake City), Cash Cards Unlimited (Canoga Park, Thousand Oaks),
  CoreTCG (Pasadena), LA Sports Cards (Burbank). Import result 8 inserted / 0 dup. LA Hobby chip now
  **13 near-LA (5 GameStop + 8 indie)**, open/closed labels computing right off the hours I set.
  Each got its OWN chain typed Hobby at insert (importer: category "hobby" → type Hobby), so they
  survive the now-fixed boot backfill (fill-only skips already-typed chains).
- **⚠️ CA GameStop under-imported:** CA has only 14 GameStop rows typed Hobby vs FL 106 / TX 64 / NY 59.
  National GameStop = 1,186 (the Hobby backbone) but the CA slice is a thin early batch. Backfilling CA
  GameStop needs a store list (their locator is bot-walled like WPN) — follow-up, owner's call.
- **Phonebook-source verdict (owner asked "is there a source to grab a whole bunch like a phonebook"):**
  the clean bulk sources are all walled from a plain fetch — WPN/Wizards locator = HTTP 403, Cards&Coffee
  site = 402, cardshophub.com = a JS-rendered SPA (fetch sees only the title) AND rate-limited ("Too many
  requests"). So no vacuum-it API. Two real paths: (a) point the research-Claude at a metro and have it
  emit JSON in the importStores shape (schema below) — I one-shot import it; (b) a headless-browser
  (Playwright is installed) harvest of cardshophub/locators — bigger job, ToS-gray, needs owner OK.
  Nothing for the owner to do locally either way.
- **Review pass (owner: "make sure everything's good"):** merged 30 upstream commits, `tsc` clean.
  Verified intact on staging: `/pub/pokemon-sets` serves JSON (13 eras, v7 assets), `?type=Hobby`
  filter, unverified `shipmentDay` still withheld from consumers, trimmed hours labels rendering.
  One latent gap: a **Thrift** chip (owner's 4th taxonomy word) would be EMPTY — zero chains typed
  "Thrift" (thrift stores sit under Discount/Off-Price). Not wired as a live chip yet, so not blocking.
- **Durability:** all of the above is on STAGING. To make permanent, import `data/hobby-shops.json` to
  prod (`POST checkitforme.com/api/stores/import`) — owner go/no-go, since prod shops are instantly callable.

**⚡ CLOBBER ROOT CAUSE FOUND + FIXED (Website, 2026-07-03 ~05:30):** `backfillChainTypes()` in
`src/db/import-data.ts` ran on EVERY boot and force-overwrote every chain's type from the name
heuristic — that's what kept reverting GameStop/Burbank/PokeMall to "Other" on each deploy. It is
now FILL-ONLY (skips any chain already typed something other than empty/"Other"). **Action for
Data: re-apply your three chain PATCHes once more (30, 122, 123 → Hobby) — they will now stick
across deploys.** The website's Hobby chip is live and waiting on that feed.
**Session 2026-07-03 — Hobby went live on staging (stores + sets + filter).**
- **Hobby STORES exist now** (they didn't — that was the "website waiting on data" blocker):
  GameStop chain 30 → type "Hobby", isMSRP false, stockCheckMethod call, all 1,186 stores tier 2→3
  (visible). Imported the owner's two named indie shops (verified address/phone/hours, Census-geocoded):
  **Burbank Sportscards** (id 106573) + **PokeMall TCG** (id 106574), each its own chain (122/123),
  type Hobby. More metro card shops = next.
- **`/pub/stores/near?type=Hobby`** — new server-side chain-type filter (the home chips). Without it
  the nearest-200 page in a metro is all Retail and the Hobby chip starves client-side.
- **Pokémon set registry shipped**: `data/pokemon-sets.json` (13 eras / 129 sets, Base Set 1999 →
  Delta Reign 2026) served at **`GET /pub/pokemon-sets`** with per-set products (type + retail from the
  catalog) and SAME-ORIGIN asset paths (`/logos/sets|set-banners|eras/<logoKey>.png`) matching the
  /logo-wall repo system. Logo dev drops PNGs at those paths; website renders feed.logo/banner.
  ME codes verified vs TCGplayer: **ME2.5 = Ascended Heroes, ME03 = Perfect Order.**
- **⚠️ CLOBBER WATCH:** something re-synced the `chains` table on staging tonight and reverted my
  chain PATCHes once (GameStop back to type Other; the 2 new chains reset). Store rows survived.
  Re-applied + verified. If Hobby stores vanish from the feed again, a chains config sync is
  overwriting live edits — flag DevOps to make it respect newer rows.


**Session 2026-07-02 — consumer surfaces show only what we KNOW (owner rule). Staging.**
- **No unverified restock info reaches consumers, anywhere.** (1) `/pub/stores/near` no longer sends
  `shipmentDay` (the site printed junk like "drops eve" = "every single week" truncated). (2) Best
  Bets: `shipmentDow` signal set to null, so the unverified day neither ranks nor labels a bet (no
  "usually restocks Friday", no "Restock day" tag). Verified live on staging. **Comeback path:**
  `learnedShipDow()` once a store's day has 2+ agreeing confirmed calls. A call RESULT saying "shipment
  lands {day}" stays (staff just said it = known). Admin restock intel untouched.
- **Open-state labels trimmed** (`store-hours.ts`): "till 10 PM" / "24h" (the word "Open" was redundant;
  the green dot + being listed say it). Closed labels unchanged. Updated the trainer-batch "24h" match +
  both hours test scripts (12/12 each; 3 pre-existing time-of-day flakes in test-storehours.ts remain).
- **Google Cloud $62.29 charge explained** (owner's Places API spike, June): $262.29 usage minus the
  $200 monthly Maps credit auto-billed at invoice close. Our code has ZERO Google Places/Maps usage
  (geocoding = US Census + Nominatim). Console lockdown (disable Places, cap quota, restrict+regen key)
  pending with owner; until then the unrestricted key can keep accruing.

**Session 2026-06-27 — learned restock "best day" from call data (serve-time, no schema change).**

### Shipped to STAGING (`…pagiis`) — promote to prod by merging staging → prod
- **best-bet now learns the restock day.** `/pub/best-bet` ranked on the last-write-wins
  `retailers.shipmentDay` column (one wrong clerk answer flipped it). New `learnedShipDow()` uses the
  **mode of `call_results.shipmentDayHeard`** across a store's confirmed calls, falling back to the
  stored column when there's no history. So the recommendation compounds with every call.
- **NEW `GET /api/admin/store-restock/:id`** — per-store weekday + product picture for the Admin store
  panel: `staffSaid` (heard-day tally + mode), `empirical` (confirmed-by-weekday histogram + peak,
  store-local via new `dowAt()`), derived `bestDay` (staff-mode → empirical fallback), `confidence`
  (# confirms), `byCategory`, and `products: { forms, sets, details }`. Mirrors `/api/admin/restock-intel`
  (network/top-25, already live) for ONE store.
- **Product mix surfaced (forms + sets).** We already capture the free-text `call_results.productDetail`
  ("ETB · Surging Sparks", "3-pack blister"); the verdict extractor (`voice/verdict.ts`) pulls
  `productForm` + `set` separately but persists only the combined label. New serve-time classifier
  (`productForm()`/`productSet()`) buckets it into FORMS (booster/hobby box, tin, ETB, pack, sleeve,
  hanger, mega/retail box, bundle) + best-effort SETS. Added to BOTH endpoints (`restock-intel` now
  also returns `productForms`, `productSets`, `byCategory`). Classifier unit-checked vs owner's examples.
- **Terminology: clerk → staff** in these endpoints/comments (owner's current term for store humans).
  Lots of `clerk` remains in the call-backend/schema (not data-dev lane) — flagged for a later sweep.
- All serve-time derivation from `call_results` — **no new columns.** Helpers unit-checked; tsc +
  store-contract clean. Branch: `…-pagiis` (commits 1887fe1, 11bf36d).
- **Admin placement recommendation (given to owner):** split by altitude —
  - **God-view → its own "Restock" tab (NETWORK):** confirm rate, dominant days, `productForms`/
    `productSets` mix, `byCategory`, top-25 restock stores (clickable). Feeds from `restock-intel`
    (already half-rendered in `loadGwIntel()` → `#gw_intel`; now rich enough for its own tab next to
    length-of-calls).
  - **Store section → per-store "Restock" card (DETAIL):** that store's `bestDay`, staff-said vs
    confirmed weekday histogram, `products.forms`/`sets`, `byCategory`, `confidence`, `lastConfirm`.
    Feeds from `store-restock/:id`; opened by clicking a God-view top-store row.

### Spec'd, NOT built (call-backend lane — needs that dev or owner "ship it")
- **Restock-day user notification.** Data layer is ready (`learnedShipDow`). Trigger: daily tick like
  `customerScheduleTick()`; for each active `watches` row, if `tzDow(store.tz) === learnedDow` and not
  yet notified today → send "today's usually restock day at {store}" via the watch alert path
  (brevo.ts), gated by `policy.flags.restockAlerts`. **Needs a `lastRestockNotifyDay` dedupe field →
  DevOps schema add.** Lives in `customer-schedules.ts`/`notify.ts` (NOT data-dev lane).
- **Persist `productForm` + `set` as their own columns (clean product reporting).** The extractor
  ALREADY pulls both (`voice/verdict.ts` `ClerkVerdict.productForm`/`.set`) but `productDetailLabel()`
  collapses them into the single free-text `productDetail`. Add `product_form` + `set_name` columns
  (**DevOps schema**) and persist them in `calls/service.ts` (~line 678) + `server.ts` trainer-batch
  (~3271) — the extraction is free, just stop discarding it. Then forms/sets reporting is EXACT (no
  regex), and joins to the structured `products` catalog (set/series/`type`/MSRP, seeded from
  `drops_db.json`) for value/SKU-level intel. My serve-time classifier is the interim until then.

**Session 2026-06-26 — tier-5 coverage sweep (store-by-store) + consumer store-feed fix + promote-pipeline outage.**

### Shipped (LIVE on prod + staging unless noted)
- **Tier-5 backfills — reconciled STORE-BY-STORE (not by count).** Method: pull the chain's official store
  directory per gap-state, dedupe vs our rows by `address-norm + phone`, geocode (US Census → Nominatim
  fallback; set hyphenated Coachella-style addresses by hand), `POST /api/stores/import`.
  - **Hobby Lobby:** CA 10→70 (all open CA) + the West/Mountain hole (AZ/WA/NM/UT/CO/OR/NV/ID ≈71).
    National **889→1,020 (94%)**. **Texas (+58) still pending.**
  - **Target:** CA 251→**324** (+73). Real CA = 324 (storelocators, Jun-2026). **Other states (~260) pending.**
  - **Dollar General:** CA 260→**264** (+Greenfield, Indio, Pearblossom, San Bernardino) — CA complete vs 263 official.
  - **Books-A-Million:** the audit's "missing 75" was a STALE reference — BAM has **closed down to 175 open**
    (official locator). We had all but 2 (Salina KS, Rapid City SD), now added; ~14 of our BAM rows are closed
    stores → being deactivated.
- **Coverage audit (22 major Pokémon chains, our count vs real US totals):** 17 at 95–100%. Real growing-chain
  gaps = Target + Hobby Lobby. CVS/Walgreens/GameStop look low only from documented closures (we track current
  operating reality, not a stale peak).
- **LESSON — count ≠ completeness.** A near-matching national count hides (a) specific metro gaps (HL's late
  West-Coast expansion), (b) stale reference numbers (BAM), (c) closed stores still listed. **Reconcile
  store-by-store for tier-5**, especially dense/recently-expanded metros.
- **Big 5 Santa Barbara (id 7900):** owner intel → tier 4→**5**, restock **Mon & Wed**, specialInstructions
  (busiest Big 5, most Pokémon; recently Chaos Rising booster sleeves, Mega Clefable tins, Mega Zygarde posters).
- **Consumer store-feed fix (`/pub/stores/near`):** in a dense metro a 20-mi radius holds 400+ stores (200+
  tier-5); the page limit dropped a sparse FAR green-group chain (a Dollar General ~19mi out, in-radius but
  past the cut → "Dollar General never shows up near me"). Fix **pins the nearest store of each tier-5 chain**
  (first page) so every green-group chain always surfaces. Live on **staging** (`…pagiis`); promote to prod by merging.

### Store writes — staging DB vs prod DB
- Two environments: **staging** (`…pagiis` → staging.checkitforme.com) and **prod** (`…OcyMS` →
  checkitforme.com), each with its OWN SQLite DB. Develop/verify on staging, then promote CODE by merging
  staging → prod. The **Admin reads live PROD data** (prod is the data source of truth).
- Push new/updated tier-5 rows via `POST /api/stores/import` (dedup-by-phone, idempotent) and
  `PATCH /api/retailers/:id` — an admin-API DB write hits only the env you call. Snapshot the volume before
  any bulk/destructive write — that's the safety net.

### Store API — what it serves (incl. logos) + apps it powers
One DB, read three ways; **carries + logos DERIVE at serve-time** (no per-row copies that drift):
- **`GET /pub/stores/near?lat&lng&radius&limit&mode`** — THE consumer path (website + iOS app). bbox→
  distance→page. Per store: id, chainId, name, location, address, storeType (=chain.type), **logoUrl/
  logoWide/logoDark**, **carries** (distributor-derived), lat/lng, tier, callable, inStock, stockCheckMethod,
  sellMethods, openState. Owner-only + (pending-prod) nearest-per-tier-5-chain pinned past the page limit.
- **`GET /pub/stores`** — every active+phone store (Admin logo map); same shape, no paging.
- **`GET /api/retailers?chainId&state&q&limit`** (admin) — full retailer rows + logoUrl + carries.
  **Capped at 1000** — use `/pub/stores` (or `table-dump`) for full scans.
- **Logos:** `chainLogoInfo(chainName)` is **DB-first** — `chains.logo_url` (shared Cloudflare R2 at
  logos.fungibles.com) wins over per-branch `public/logos/chains/<slug>.png`, so a logo travels to every env
  and can't drift. ~99.97% of stores carry an R2 logo.
- **Carries:** `storeCarriesList(chainName, stored)` = distributor-derived (`data/distributors.json`, inlined
  fallback in `server.ts`) for mapped chains, else the stored `carries` column.
- **Apps powered:** consumer website (checkitforme.com), the iOS app, and the Admin store list — all read
  these SAME rows, so a store/logo/tier/intel added here shows up everywhere.

---

**Session 2026-06-25 — the "derivation era": logos→R2, carries→distributors, MVPs demo, phone harvest.**

> **RESUMING? Read this box first.** Two architecture shifts this session: (1) chain **logos** are now
> DB-first from **shared R2** (`logos.fungibles.com`); (2) store **`carries`** is **derived** from
> `data/distributors.json`, not the per-store column. Both are a written contract in
> `docs/DATA_PROVENANCE.md` ("Carries — derived from distributors") + guarded by
> `scripts/check-store-contract.mjs` (`pnpm check`). **Two environments** — staging + prod, each its own DB;
> an admin-API DB write hits only the env you call. Code goes to both branches (staging → promote → prod).

Shipped (live + verified on prod, and staging where noted):
- [x] **Distributor-driven carries.** `data/distributors.json` = distributor→products + chain→distributors
  (a chain's carries = union of its distributors' products), derived at serve-time by
  `storeCarriesList()`/`carriesForChain()` (`src/server.ts`); wired into `/pub/stores`, `/pub/stores/near`,
  `/api/retailers`. Seeded **Excell** (Pokémon/Lorcana/MTG/One Piece/Yu-Gi-Oh/Sports Cards) + **Schylling**
  (NeeDoh) + **Jazwares** (Squishmallows) → **CVS/Walgreens/Target/Walmart/Barnes & Noble**. Unmapped chains
  fall back to the stored column. Auto-applies to new stores of mapped chains (no stamping). **Verified
  identical prod+staging.** Why derive (not stamp): config lives in code → consistent across separate DBs.
- [x] **Logo R2 keystone (Data Dev half).** DevOps shipped the bucket/worker (PR #417, `logos.fungibles.com`,
  `presignPut` in `src/r2.ts`). Added `chains.logo_url/logo_wide/logo_dark` (schema+bootstrap),
  `chainLogoInfo()` is **DB-first** (R2 wins, filesystem fallback; cache `refreshChainLogoDb`, 60s),
  `POST /api/chains/:id/logo` (server-side presigned PUT), `POST /api/admin/migrate-logos-to-r2`.
  **Migration ran: 106 chains on prod, 96 on staging now serve R2.** Key = `chain-logos/<slug>.png`.
- [x] **MVPs demo store** (owner-only pitch store, like Fun). Chain 121 "MVPs", store **106362**: `ownerOnly`,
  Calabasas geo-pin, 24/7, `sellsPacks`, carries Pokémon, logo `chain-logos/mvps.png`, armed `+18185770433`.
  **Number = on/off** (PATCH phone on an ownerOnly store derives `active`). `seedMvpsStore()` in bootstrap
  (create-only — never overwrites phone/active). Staging DB lags prod, so MVPs chain may differ there.
- [x] **Geo-bypass → prod.** Owner-only stores surface regardless of distance for the comp account (was
  staging-only — the "Venice" gap). In `/pub/stores/near`.
- [x] **Phone harvest.** H-E-B (84) + H Mart (6) were all `nophone:` (0 callable). `fetchStorePhone()`
  (`src/store-phone.ts`, OpenAI web-search→Gemini, E.164) + `backfillPhones({chainId})` +
  `POST /api/phones/backfill?chainId=&dryRun=1`. Harvested all 90 (area-code verified) + `sellsPacks=true`
  → **both chains fully callable.** Reusable for any address-only chain.
- [x] **Data-health fix.** `/api/admin/data-health` mis-chain matcher stems possessive `-s` (real
  Mariano's/Lowe's/Smith's no longer false-flag); excludes ownerOnly demo stores. Mis-chained 44→0.
- [x] **6 homeless stores hidden** (`active=false`, recoverable) per owner's "don't include if no chain home":
  Olsens Market Place 2768, Mansfield Market Place 3768, Ray's Food Place 3086/3841, Lee Harrison 62635,
  Hyvee Equipment LLC 66429. All non-kiosk.

Pending / next session:
- [ ] **Deep research → expand `data/distributors.json`** (owner returning with the data). Brief: per
  distributor capture product lines + retailer network + channel + recent shifts; deliver
  `distributor→{products,chains}` + `our-chain→distributor` for our ~120 chains, plus emerging lines
  (Pop Mart/Labubu blind-box, Star Wars Unlimited/Riftbound, etc.) worth adding. **When it arrives:** add
  entries (chain keys MUST match `chains.name` EXACTLY — verify via `/api/chains`); only high-confidence
  (flag low-confidence for call-verify); `pnpm check`; commit; deploy to **both** OcyMS + pagiis; verify
  carries derives identically on both envs (curl `/api/retailers?q=<chain>` on both hosts).
- [ ] **DevOps prompt sent** (owner relaying): add `node scripts/check-store-contract.mjs` to
  `voice-caller-ci.yml`; fix the pre-existing `config.staging` tsc error (`src/server.ts:1430`) that reds the
  typecheck gate; make CI a required merge check.
- [ ] **Handoff pointers** — `docs/handoffs/admin.md` + `website.md` need a 2-line "carries+logos are
  derived, don't edit the column / drop a file" note. Offered; awaiting owner go.

Architecture facts the next session MUST know:
- **Separate DBs.** staging = `…pagiis` → staging.checkitforme.com; prod = `…OcyMS` → checkitforme.com.
  Each has its own DB. Carries derives from code config (auto-consistent); logo_url + store rows are per-DB.
- **Branch flow.** Develop on staging (`…pagiis`), push; promote to prod by merging staging → prod.
  Railway auto-deploys on push (~60-90s); CI does not gate Railway.
- **Access.** Admin API needs a browser User-Agent (Cloudflare blocks python-urllib → 1010). Get the admin
  token from Railway (HANDOFF.md secrets); keep it in memory — don't print it or write it to a file.

**Session 2026-06-19 — data documented, scoring package committed, ungraded tail closed (see COMPLETED.md).**
- [x] **Single-source-of-truth doc** — `docs/DATA_PROVENANCE.md` written: every store-data domain, who
  writes it, who reads it, verified that **no surface reads a rogue store list** (only the DB).
- [x] **Scoring package recovered + committed** — the owner's "four-file zip" is now at
  `data/source/chain-scoring-2026-06/` (rubric + 85 chain scores + logistics + 264 product rows), and
  the repo-native rubric is `docs/specs/scoring.md`. Tiers confirmed LIVE in prod (2/3/4/5 spread).
- [x] **Closed the ungraded tail** — new `POST /api/stores/grade-from-defaults` filled **6,864**
  null-tier stores across **31** chains (almost all grocery — Publix t3, Kroger/Safeway/Albertsons/Vons/
  Ralphs t4, kiosk-host Pavilions/Gelson's/Star Market t5) from `chain_scores_final.csv`. **Fill-only-
  null** (never overwrites a deliberate tier like TJ Maxx=3); idempotent (re-run fills 0). Verified in prod.
- [x] **Orphans — non-issue** — `POST /api/stores/relink-orphans` (dryRun) found **0** `chainId`-null
  active stores. "Burlington Jewelry District" is `chainId 27` w/ logo + tier 3; its `chain:null` is a
  cosmetic projection field. Relink endpoint kept as an idempotent safety net.
- [ ] **Grade the ~38 unscored chains** (owner call) — chains NOT in `chain_scores_final.csv` still have
  `tier: null` (ranked by distance). Need a tier decision per chain before `grade-from-defaults` can fill
  them. Also 2 CSV chains unmatched by name: **Learning Express**, **Macy's (Toys R Us)** — find the DB
  alias or add them.
- [ ] **Thrift logos** — Goodwill / Salvation Army / Savers / Unique still need `public/logos/chains/
  <slug>.png`. Needs image tooling (sharp/ImageMagick) — follow `docs/STORE_LOGOS.md`.

**Session 2026-06-17 — big prod cleanup done (see COMPLETED.md).** Writes went LIVE via the admin API
(`PATCH /api/retailers/:id` + bulk `POST /api/stores/patch`); the `openState` fix shipped on this branch.
- [x] **Kiosk-only mis-flagging (Pavilions).** ✅ Verified in prod (`hasKiosk:true, sellsPacks:false`).
- [x] **"2 AM" bug.** ✅ `openState` now reads unknown/blank hours as **closed 01:00–06:00 local**
  (daytime unchanged); `scripts/test-store-hours.ts`. Plus **150** fake all-day stamps blanked
  (Walgreens/CVS/Safeway/…; genuine-24h Wawa/Sheetz/Buc-ee's kept). Unenumerable tail → bulk `clearHours`.
- [x] **Store-name cleanup.** ✅ Owner chose **drop the dash**: `Chain — City` → `Chain City` —
  **57,327** renamed (0 errors; verified 0 remaining). Plus **941** `(#1234)` store-number strips.
- [x] **Dup chains.** ✅ Already empty (0 stores): `Sams`/`Franklin's Ace Hardware`/`Hallmark`. The 3
  empty chain *rows* still need deleting (chain-level op — no `DELETE chain` endpoint; bulk/DevOps).
- [ ] **Logos on the map.** A pin's logo = its chain name → `public/logos/chains/<slug>.png`. Audit
  for chain-name mismatches and missing logo assets; list missing-logo chains. (Rendering = Admin/Website.)
- [ ] **General cleanup** — Places-sourced staleness, unconfirmed carriers, muted repack chains
  (see `COVERAGE_REPORT.md`).
- [ ] **Append the new incoming store file** once the planning chat shapes it to
  `store-data-schema.md`. Dry-run → import → spot-check a few rows in the admin.
- [ ] **Wire `productDetails`** — DONE on `claude/check-data` / PR #373 (importer reads it → `product_details`
  column) but NOT on this deploy branch yet. Fold into consolidation (schema column + importer) or re-apply here.

When you finish something: move it to git history; leave Current focus set for the next chat.

# DATA — handoff (stable charter: store data + backend/infra/deploys)

This is the DATA system: the store dataset (adding/cleaning stores, logos, types, shipment days,
values, the importer, the sync pipes) AND the backend core / infrastructure / deploys / promotes
(the old ops lane, merged 2026-07-22 — §INFRA at the bottom). You manage the *rows*; Admin builds the
*UI*. You are the STEWARD of this data — keep it honest even against an instruction; data integrity wins.

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
     so mute instead. (Schema doc: `docs/data/store-schema.md` §5, muted row fixed 2026-07-04.)

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
1. `/CLAUDE.md` · `docs/shared/ARCHITECTURE.md`
2. **`docs/data/provenance.md`** — where ALL store data comes from + the one-source-of-truth rule
   (every surface reads the same DB rows). **Read this first** so you never introduce a parallel list.
3. **`docs/data/store-schema.md`** — the full store-data reference: every collector field →
   DB column, the hours format (incl. the 2 AM bug), dedupe rules, the behavior flags, and how to
   load a file. (This is also the doc handed to the planning chat for new data.)
4. **`docs/data/scoring.md`** — the 1–5 tier rubric (`retailers.tier`), derived from the owner's
   scoring package now committed at `data/source/chain-scoring-2026-06/`.
5. `data/stores-master/README.md` + `docs/data/COVERAGE_REPORT.md` · `docs/shared/STOCK_AND_GEO_API.md` (store shapes)
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
- Work on the **staging** branch `staging`; push = live at
  staging.checkitforme.com in ~3 min. Promote to prod by merging staging → prod.

## Roadmap (later)
- **Show "time to reach a human" on the call button / call log / status (owner idea 2026-07-10).**
  Data ALREADY EXISTS: `chains.avgTreeSeconds` (seconds through the phone menu to a live person),
  learned automatically by the phone-tree mapping — no new field, no new collection. Gaps to close:
  (1) **plumbing (DevOps/DD):** `avgTreeSeconds` is only in the admin/mapping API today, NOT in the
  consumer store payload (`/pub/stores/near`) — add it so Webbie can read it. (2) **copy (Copper), 3
  states, never guess:** `ringsDirect` → "reaches a human right away"; mapped tree with a number →
  "about {n}s through the menu"; unmapped (`avgTreeSeconds` null / `treeStatus` not learned) → show
  nothing. (3) It's a LEARNED field (refreshes prod→staging, never hand-promoted). Queued behind the
  fastest-path-to-human mapping that fills it.
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

## §INFRA — backend / deploys / promotes (old ops lane, merged 2026-07-22)
You also own the backend core and infra: `src/**` (auth, billing, calls/, voice/ infra side, db/,
redis, policy, security-checks, server.ts routing/bootstrap, brevo, stock/), Railway env/services,
Cloudflare (DNS/worker/WAF), CI, and the deploys. `docs/shared/API_CONTRACT.md` is yours to evolve
(announce shape changes to the site + admin systems).
- **Envs:** staging (`staging`) → staging.checkitforme.com (Railway svc `voice-caller-staging`) —
  develop here. Prod (`main`) → checkitforme.com (svc `voice-caller`) — promote by merging staging→prod
  (`bash scripts/promote.sh`, per-commit confirm; the ONLY way prod code changes). Admin ships via
  `scripts/ship-admin.sh`. `git fetch && checkout -B <branch> origin/<branch>` before judging state.
- **THE NUMBER — the cost target every call-path change serves:** a check lands ≤ 20s of billed human
  time, OR ≤ 5¢ per call at ~30s. ABC / connect-on-human is the main lever (keep Charlie/EL asleep
  through the tree+hold, wake only on a human). If a change doesn't move toward a box, it's not the priority.
- **Four sync pipes (no hand-sync ever):** curated stores staging→prod (5 min) · learned nav
  prod→staging (3 min) · settings prod→staging (60s, `settings-sync.ts`) · never-sync fields (phone,
  hours, per-store learned) written to BOTH envs by hand, prod first.
- Access: Railway GraphQL (`backboard.railway.app/graphql/v2`) reads/writes env vars; Admin API gated by
  `x-admin-token: <ADMIN_TOKEN>`. Secrets live in Railway — never in files. curl only (proxy 403s python/WebFetch).

## Current work
Lives in `checkpoint.md` (same folder). Update THAT file at every "Checkpoint" — not this one.

# Store data — how stores are structured NOW (reference for the planning chat)

**Purpose.** Hand this to the planning chat ("regular claude") that assembled the new store report.
It shows exactly how stores are structured today — the live DB columns, the importer's accepted
fields, the hours format, and a real sample row — so the new incoming file of store types/statuses
can be shaped to **append cleanly** to what we already have. Nothing here needs reshaping if the new
file matches these field names.

There are **two shapes** in play:
1. **The collector file shape** — the JSON the report is delivered in (`data/stores-master/*.json`).
2. **The DB row shape** — what those fields become after `src/stores-import.ts` maps them in.

The importer is the bridge. Match the collector field names below and it Just Works.

---

## 1. The collector file shape (what the report should look like)

A file is either a top-level array, or `{ "stores": [ … ] }`. Each store is one object. This is a
**real, current row** from `data/stores-master/stores_master_part1.json.gz` (trimmed comments added):

```jsonc
{
  "chain": "AAFES (Army & Air Force Exchange)",   // → links/creates a chains row by exact name
  "name": "AAFES Exchange",                        // store display name (required)
  "category": "military_exchange",                 // store TYPE → mapped to a chain icon bucket
  "address": "100 Eglin St",
  "city": "Lincoln",
  "state": "MA",                                   // 2-letter → drives region + timezone
  "zip": "01731",
  "lat": 42.463403,
  "lng": -71.28701,                                // lat/lng → map pin + radius search
  "phone": "+17818620580",                         // E.164; THE DEDUPE KEY (required, see §4)
  "timezone": "America/New_York",                  // optional; derived from state if absent
  "carries": [                                     // array OR comma-string; → CSV "carries" column
    "Pokemon TCG", "Magic: The Gathering", "One Piece TCG",
    "Sports Cards (Topps/Panini)", "Squishmallows", "Yu-Gi-Oh"
  ],
  "productDetails": {                              // per-product status block (NOT yet imported — see §6)
    "Pokemon TCG": { "status": "confirmed", "department": "toys",
                     "pricing": "msrp_hunt", "note": "Round-2 verified; tax-free MSRP" },
    "One Piece TCG": { "status": "likely", "department": "toys", "pricing": "msrp_hunt", "note": "…" },
    "Disney Lorcana": { "status": "unknown" }
  },
  "visibility": "live",                            // "muted" → hides the WHOLE chain (repack-only)
  "carryConfidence": "confirmed",                  // confirmed → stockStatus "verified"; else "unverified"
  "hours": {                                       // per-day {open,close} — see §3 for ALL accepted shapes
    "mon": { "open": "09:00", "close": "18:00" },
    "tue": { "open": "09:00", "close": "18:00" },
    "sun": { "open": "11:00", "close": "17:00" }
  },
  "specialInstructions": "Ask the toys dept. Distributor: self. MSRP: strict.",
  "active": true,                                  // false → SOFT-REMOVE (deactivate), never deletes
  "store_id": "ChIJ…",                             // chain's own store # → externalStoreId
  "mapsUri": "https://maps.google.com/?cid=…",     // Google Maps deep link
  "placeId": "ChIJ…",                              // accepted, currently unused
  "source_url": "…", "collection_method": "google_places_textsearch", "collected_at": "2026-06-12T…"
}
```

`source_url`, `collection_method`, `collected_at`, `placeId`, `in_scope` are accepted and ignored —
safe to include for provenance, they just don't land in a column.

---

## 2. Accepted fields → DB columns (the importer's full contract)

Source of truth: `src/stores-import.ts` (`StoreIn` interface + `importStores`). The importer takes
**collector-native field names as-is** — these are the names to use in the new file.

| Collector field | DB column (`retailers`) | Notes |
|---|---|---|
| `name` *(required)* | `name` | Store display name. Skipped if missing. |
| `phone` *(required)* | `phone` | Normalized to E.164. **Dedupe key.** Skipped if missing (unless §4 synthetic). |
| `chain` | `chainId` (FK → `chains`) | Linked/created by exact name. Drives logo + phone tree. |
| `category` | `chains.type` | Store-type string → bucket (Pharmacy/Grocery/Hobby/Electronics/Dollar/Hardware/Books/Office/Sports/Club/Apparel/Retail). |
| `address` | `address` | |
| `city` + `state` | `location` (`"City, ST"`) | |
| `state` | `state`, `region`, `timezone` | Region + tz **derived from state** (override with explicit fields). |
| `zip` | `zip` | |
| `lat` / `lng` | `lat` / `lng` | Missing coords → server geocoder backfills. |
| `timezone` | `timezone` | Optional; else derived from `state` (default `America/Chicago`). |
| `region` | `region` | Optional; else derived from `state`. |
| `carries` | `carries` (CSV) | Array, comma-string, or single label all accepted. |
| `hours` | `hours` (JSON) + `hoursUpdatedAt` | Normalized — see §3. **Empty hours on re-import does NOT wipe existing hours.** |
| `active` | `active` | `false` → soft-remove (deactivate). |
| `sellsPacks` | `sellsPacks` (default **true**) | Callable shelf store. |
| `hasKiosk` | `hasKiosk` (default **false**) | Has a vending kiosk. |
| `shipmentDay` **or** `shipment_days` | `shipmentDay` | e.g. "Friday". Drives best-bet + scheduling. |
| `phoneTree` **or** `phone_tree_tip` | `phoneTree` | Per-store IVR override. |
| `store_id` | `externalStoreId` | Chain's own store number (keys site stock checks). |
| `mapsUri` | `mapsUri` | Google Maps deep link. |
| `stockStatus` | `stockStatus` | Explicit wins; else from `carryConfidence`. |
| `carryConfidence` | `stockStatus` | `confirmed`→`verified`, `unconfirmed`→`unverified`. |
| `visibility` | (chain-level) | `"muted"` → hides the **whole chain** + never calls it (kill-switch, never deleted). Reasons: (a) repack-only, or (b) uncallable-and-hidden (e.g. Best Buy: central call center). Independent of `online`/`sellsPacks`. |
| `specialInstructions` | `specialInstructions` | Explicit wins; else composed (next row). |
| `intelNote`, `department_to_ask`, `restock_best_hunt_window`, `distributor`, `msrp_reliability` | `specialInstructions` (composed) | Folded into one prose string injected into the agent prompt. |
| `productDetails` | *(not imported yet)* | See §6 — the most valuable thing to wire next. |
| `placeId`, `source_url`, `collection_method`, `collected_at`, `in_scope`, `vendor_stocked` | — | Accepted, not stored. |

---

## 3. Hours format (this is where the "open at 2 AM" bug lives — read carefully)

**Canonical stored form** (`retailers.hours`, a JSON string):
```jsonc
{ "mon": ["09:00","21:00"], "tue": "24h", "wed": null, … "sun": ["11:00","17:00"] }
```
- `["HH:MM","HH:MM"]` = open/close (24-h clock). Close ≤ open means **crosses midnight** (e.g.
  `["10:00","01:00"]` = open till 1 AM) — handled correctly.
- `"24h"` = open 24 hours.
- `null` = **closed that day.**

**Accepted INPUT shapes** (`normHours` converts all of these):
- Per-day object: `{ "mon": { "open":"09:00", "close":"18:00" }, … }` ← **the report's current shape, good.**
- Per-day array: `{ "mon": ["09:00","18:00"] }`
- Per-day string: `"9:00-18:00"`, `"9:00 to 18:00"`, `"24h"`, `"closed"`, `""`
- One value for all days: `{ "open":"08:00", "close":"22:00" }` or a bare `"08:00-22:00"` string
- `{ "national": { "open":"…","close":"…" } }`
- Per-day `{ "closed": true }` or `{ "open": null }` → that day = closed.

### ⚠️ The 2 AM bug — what to fix in the data
`openState()` (`src/store-hours.ts`) returns **`{ known:false, open:true }` when a store has NO hours
or unparseable hours.** That is deliberate (don't block calls on missing data) — but it means **any
store missing an `hours` block shows as OPEN around the clock**, which is exactly the "open at 2 AM"
the owner saw. Two real causes:
1. **Missing hours** → defaults to open. Fix: every row should carry an `hours` block.
2. **Wrong/placeholder hours** (e.g. a chain default of `00:00–23:59` or `09:00–18:00` stamped on a
   24-h or always-closed store). Fix: hours must be the store's REAL local hours.

For the new file: **include real per-store `hours` for every row.** Where genuinely unknown, omit
the block (it stays "unknown/open") rather than stamping a fake `09:00–18:00`. Closed days must be
explicit (`null` / `{closed:true}`), or the day inherits nothing and the store reads open.

---

## 4. Dedupe & identity (how append-without-dupes works)

- **Dedupe key = E.164 `phone`.** Re-importing a row with a known phone **updates** it; a new phone
  **inserts**. This is why "appending cannot create dupes" — same phone = same store.
- Phone is normalized (`e164()`): strips non-digits, adds `+1` for 10-digit US numbers.
- **Phoneless stores** (e.g. Micro Center has no per-store line): allowed **only if**
  `sellsPacks:false` AND there's a `chain` + (`store_id` or `zip`). They get a synthetic key
  `nophone:<chain-slug>:<store_id|zip>` and stay off the call rail. A store that's callable MUST
  have a real phone or it's skipped.
- `active:false` on an existing row soft-removes it; on a non-existent row it's skipped (nothing to
  remove).

**So to append the new file:** keep phones in any format (importer normalizes), make sure each
callable store has one, and re-state `chain` exactly as the existing chain name (or it creates a new
chain). To retire stores, send them with `active:false` — don't drop them from the file silently.

---

## 5. The flags that drive behavior (set these correctly per store)

| Flag | Meaning | If wrong… |
|---|---|---|
| `sellsPacks` (bool, default true) | Has a staffed counter we **call**. | A kiosk-only store with `sellsPacks:true` gets called + asked the wrong question. |
| `hasKiosk` (bool, default false) | Has a vending **kiosk** on site. | Won't show in the kiosk layer / kiosk call script. |
| **kiosk-only** = `hasKiosk:true, sellsPacks:false` | Vending only, no shelf. | **This is the Pavilions case** — see §7. Best-bet must NOT recommend it as "most likely" for a shelf check. |
| `stockStatus` (`verified`/`unverified`) | Confirmed carrier vs suspected. | Unverified shows a "suspected" flag; verified is a known seller. |
| `carries` (CSV) | Which categories this store stocks. | Empty = won't surface for that category's check. |
| `shipmentDay` | Usual restock day. | Powers best-bet timing + scheduling; absent = weaker best-bet. |
| `hours` | Real local hours. | See §3 — missing/fake hours = "open at 2 AM" + calls to closed stores. |
| `region` / `timezone` | Derived from `state`. | Wrong state → wrong tz → wrong open/closed + wrong call time. |
| `visibility:"muted"` | Kill-switch: hides the **whole chain** + never calls it (independent of `online`/`sellsPacks` — a muted chain may still sell packs/online; we just can't reach a human to ask, so we hide it). | Mutes the **entire chain**, not one store. **Two reasons:** (a) repack-only (Marshalls, TJ Maxx), or (b) **uncallable** and we hide it — central call center / no per-store line (e.g. Best Buy). If uncallable BUT the chain's site shows live stock, use `stockCheckMethod:"site"` + `sellsPacks:false` instead (site-rail — **shown** as buy-online, e.g. Micro Center), NOT mute. |

---

## 6. `productDetails` — the biggest unwired opportunity

The collector file carries a rich `productDetails` block (per-product `status` =
`confirmed`/`likely`/`unknown`, `department`, `pricing`, `note`). **Today the importer only reads the
top-level `carries` array and `carryConfidence`** — `productDetails` is dropped. The planning chat
should know: if it wants per-product confidence (e.g. "Pokémon confirmed, Lorcana unknown" at one
store) to drive the UI/agent, that's a **schema + importer change to request from DevOps** (likely a
`product_details` JSON column on `retailers` or rows in a join table). For now, the file should still
populate `carries` (the categories the store actually stocks) since that's what surfaces stores today.

---

## 7. Known data problems to clean up (carry into Data Dev's queue)

1. **Pavilions / kiosk mis-flagging.** Supermarket kiosk-only stores (Pavilions, many Albertsons/
   Vons/Safeway) were flagged `sellsPacks:true` and got recommended as "most likely" for a *shelf*
   shipment — wrong, they only have a vending kiosk. Correct flag = `hasKiosk:true, sellsPacks:false`.
   (Backend best-bet already excludes kiosk-only from "most likely"; the data still needs fixing so
   they call with the kiosk script, not the shipment question.)
2. **Open/close times (the 2 AM bug).** See §3. Audit hours: real per-store hours, explicit closed
   days, no placeholder `09:00–18:00` on 24-h or closed stores, correct `state`→`timezone`.
3. **Logos not on the map.** A store's map logo comes from its **chain name** → a PNG at
   `public/logos/chains/<slug>.png` (see `chainLogoInfo` in `src/server.ts`). No file for that chain
   (or a chain-name mismatch) = no logo. Fix = (a) chain names in the data match an existing logo
   slug, and (b) every active chain has a logo asset. Missing-logo chains → flag for an asset add.
4. **General cleanup** — Places-sourced staleness (closed/relocated stores), unconfirmed carriers
   (Dunham's, Giant Eagle, Hibbett, HomeGoods, Ollie's, Tractor Supply, Wegmans, WinCo), and the
   muted repack-only chains (Marshalls, TJ Maxx). See `docs/data/COVERAGE_REPORT.md`.

---

## 8. How the file actually gets loaded (so the plan can sequence it)

```bash
# Dry-run first (prints a sample row, no writes):
tsx scripts/import-stores.ts <file.json> --base https://pokemon.fungibles.com --token $ADMIN_TOKEN --dry
# Then for real (chunked uploader; --carries stamps a default category on rows that lack one):
tsx scripts/import-stores.ts <file.json> --base https://pokemon.fungibles.com --token $ADMIN_TOKEN --carries "Pokémon"
```
- Accepts a top-level array or `{stores:[…]}`; uploads in chunks of 500 with retries to
  `POST /api/stores/import`. Idempotent (upsert by phone) — safe to re-run.
- Schema is managed in `src/db/bootstrap.ts` (idempotent raw SQL), **not** `drizzle-kit generate`
  (which would try to recreate existing tables). New columns = `ALTER TABLE ADD COLUMN` in bootstrap
  — request from DevOps.

---

## TL;DR for the planning chat
Shape the new file as a `{stores:[…]}` array of the §1 objects. **Required per row:** `name` +
`phone` (E.164-ish). **Critical to get right:** `chain` (exact existing name), real `hours` (no
placeholders, explicit closed days), correct `state`, and the `sellsPacks`/`hasKiosk` pair
(kiosk-only = `hasKiosk:true, sellsPacks:false`). Use `active:false` to retire a store. Re-import is
an upsert keyed on phone, so appending can't create duplicates.

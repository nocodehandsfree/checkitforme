# Stock Rail + Geo Stores API — UI Contract

The interface between the backend (this doc's owner) and the UI/UX agent. If a UI needs data
that isn't here, ask the owner to relay it to the backend chat — don't build backend in the UI chat.

## The three store conditions (render logic)

Every store row now answers three independent questions:

| Field | Meaning | UI treatment |
|---|---|---|
| `callable: true` | Staffed counter with a dialable line → **phone rail** ("We'll call for you") | Call button as today |
| `hasKiosk: true` | Vending kiosk on site (no call needed for stock; a call CAN verify the kiosk is working — they go down a lot; future mode) | Kiosk badge as today |
| `stockCheckMethod: "site"` | Chain's website mirrors the shelf — 20 chains: 12 confirmed (Micro Center, Best Buy, Target, GameStop, B&N, Scheels, Costco, Hot Topic, Kohl's, Office Depot, Staples, Walgreens) + 8 probable → **free real-time stock, no call** | Show live stock from `/pub/stock/*`; hide/de-emphasize the call button |

A store can be any combination. `stockCheckMethod: "call"` (or absent) = phone rail only.
Site-rail stores can be **uncallable entirely** (Micro Center has no per-store line → `callable: false`,
still SHOWN as buy-online/live-stock).
**`muted` (chain-level) overrides all of the above: a muted chain is HIDDEN and never surfaces, even when
`stockCheckMethod: "site"`.** Best Buy is currently **muted** (central call center, can't dial the store),
so despite the `site` tag in the table it does NOT show — un-mute it to expose its live-stock rail. The
`site` list above is the *stock-capable* set, not the *shown* set. Full `muted` semantics:
`docs/data/store-schema.md` §5.
Gate the stock-rail UI on `policy.flags.stockSignals`.

## Geo-paginated stores (use this once the 102k import lands — `/pub/stores` will not survive it)

`GET /pub/stores/near?lat=&lng=&radius=25&limit=60&offset=0&mode=&q=`

- Location optional fallbacks: `?state=CA` or `?q=target` (no lat/lng → `miles: null`).
- `mode`: `call` | `kiosk` | `site` | empty = all. Matches the existing toggle + a future "Live stock" tab.
- Returns `{ total, offset, limit, radiusMax, radiusCapped, hiddenClosed, stores: [...] }`, distance-sorted.
- **OPEN NOW ONLY (owner law 2026-07-16):** stores closed at this moment are NOT in `stores` at all —
  the list is "where can you buy right now." `hiddenClosed` counts the in-radius stores suppressed for
  being closed, so the UI can explain a thin night list ("12 more open in the morning") instead of
  looking broken. Owner-only test stores are exempt. Unknown-hours stores count as closed 9 PM–7 AM local.
- Store shape = the `/pub/stores` row shape **plus**: `miles`, `callable`, `stockCheckMethod`, `mapsUri` (Google Maps deep link for directions).
- `GET /pub/store-types` → `[{ type: "Pharmacy", stores: 8900, chains: ["CVS", ...] }]` — the
  pre-location list (generic store types with counts, no table shipped).

## Live stock signals (free real-time rail)

- `GET /pub/stock/near?lat=&lng=&radius=25&sinceHours=48&categoryId=` →
  `[{ retailerId, name, location, miles, product, status, source, url, seenAt, ... }]`
  Freshest signal per (store, product), distance-sorted, max 100. Chain-wide drops have
  `retailerId: null` + `chainId` (render as "Reported at <chain> nationwide").
  Powers: "🔥 In stock at 3 stores near you" banner.
- `GET /pub/stock/store/:id` → latest 10 signals for one store (store row/detail badge).
- `status`: `in_stock` | `out_of_stock` | `low` | `unknown`. `source`: `site` (chain's own site) |
  `discord` (cook-group ping) | `call` | `receipt` | `manual`. Show source + relative time
  ("via their site · 12m ago") — freshness is the product.

## Writers (backend/admin only — listed so the UI agent knows where data comes from)

- `POST /api/stock/ingest` (x-admin-token): site checkers + the Discord cook-group listener post here.
- **Site checkers MUST honor the per-chain RULE in `stockCheckNote`** — big-box (Best Buy,
  Target, Walmart, Sam's Club): trust first-party SKUs + the pickup-at-this-store signal ONLY,
  ignore marketplace listings; positive = strong, quantities fuzzy, hot drops may disable pickup.
- `POST /api/stock/intel/reapply` (x-admin-token): push a new `data/stock_check_intel.json`
  revision over already-classified chains (boot seed only fills blanks).
- `GET/POST/DELETE /api/discord/channels` (x-admin-token): registry of monitored cook-group channels.
- Chain classification lives in `chains.stockCheckMethod` (seeded from the collector's
  `data/stock_check_intel.json` — 80 chains — via `src/stock/intel.ts`, owner-editable).

## Import notes (for whoever runs the 102k import)

- Importer now maps collector-native: `store_id`→`externalStoreId` (keys site checks), `mapsUri`,
  `intelNote`→specialInstructions, `carryConfidence`→stockStatus, `visibility:"muted"`→chain mute.
- Phone-less site-rail stores import with `sellsPacks: false` + `store_id` (or zip) → synthetic
  `nophone:` key; the call engine refuses them as a backstop.
- Geocoder drains missing coords automatically (Census primary, Nominatim fallback, 24h cooldown
  on failures) — ~4.2% of the import self-heals, no action needed.

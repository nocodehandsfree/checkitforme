# API Contract — the frozen interface (front ⇄ back)

This is the **referee** for parallel work. Backend owns this file. **Backend may not change a
documented request/response shape without bumping it here and telling the Frontend/Admin lanes.**
Frontend/Admin consume these; they don't invent endpoints — they request new ones from Backend.

Pairs with `docs/shared/STOCK_AND_GEO_API.md` (deeper detail on the stock + geo rails).

Auth:
- `/pub/*` — **no Clerk gate** (public). Some are per-IP rate-limited (noted).
- `/app/*` — **Clerk session JWT required** (`Authorization: Bearer <token>`). 401 if missing.
- `/api/*` — **admin** (Clerk gate when `CLERK_ENFORCE=true`, currently ON; `x-admin-token`
  header bypass for server-to-server). 401/403 otherwise.
- `/webhooks/*` — public, **HMAC signature-verified** (400 on bad signature).

> ⚠️ Money endpoints are marked **[$]**. ⚠️ Endpoints marked **[CHANGING]** will change shape/
> behavior in the backend work — don't build hard dependencies on their current form.

---

## Shared object shapes

```jsonc
// StoreRow (from /pub/stores, /pub/stores/near)
{
  "id": 123, "name": "Target — Sunset", "location": "Los Angeles, CA",
  "storeType": "Big Box", "logoUrl": "/logos/chains/target.png?v=8",
  "logoWide": false, "logoDark": false,
  "carries": ["Pokémon"], "lat": 34.1, "lng": -118.3,
  "region": "West Coast", "state": "CA", "shipmentDay": "Thursday",
  "sellsPacks": true, "hasKiosk": false,
  "openState": { "open": true, "known": true, "label": "Open until 10 PM" },
  // /pub/stores/near ALSO includes:
  "miles": 2.4, "callable": true, "stockCheckMethod": "call", "mapsUri": "https://…"
}

// Status (from /pub/statuses) — the verdict registry
{ "id": 1, "key": "in_stock", "emoji": "✅", "label": "In stock",
  "tone": "in", "color": "#4ADE80", "note": "A clerk confirmed it's on the shelf.", "sort": 0 }

// StockSignal (from /pub/stock/*)
{ "retailerId": 12, "chainId": null, "name": "Best Buy — …", "location": "…",
  "miles": 3.1, "product": "Prismatic ETB", "status": "in_stock",
  "source": "site", "url": "https://…", "seenAt": 1700000000 }
```

### `kioskMode` (the shared seam — Website → DevOps → Voice)

`kioskMode` is an **optional boolean** on the four check endpoints (`/pub/check`, `/pub/check-live`,
`/app/check`, `/app/check-live`). Default = `false`/absent → normal shelf-shipment check.

- **Website** sends `kioskMode: true` for **kiosk-only** stores (`hasKiosk:true, sellsPacks:false`)
  — the ones shown with a "Kiosk only" badge. It does NOT send it for shelf stores.
- **DevOps** plumbs the flag from the request → the call/agent context (a `kioskMode` var on the
  call so the prompt builder can branch). The flag is advisory; the backend may also infer it from
  the store's flags, but the explicit request value wins.
- **Voice** branches the agent script on it: when set, the agent asks *"is your Pokémon kiosk
  working and stocked?"* instead of *"did you get a shipment today?"* (`src/voice/prompts.ts`).

Full feature spec (all three lanes' parts): the kiosk spec in git history. Store-flag data model:
`docs/data/store-schema.md` §5.

---

## Consumer — `/pub/*`

| Method · Path | Request | Response |
|---|---|---|
| GET `/pub/credits` | — | `{ balance }` (global anon demo pool) **[CHANGING → per-account]** |
| GET `/pub/protected` | — | `{ protected: bool }` |
| POST `/pub/gate` | `{ password }` | `{ ok: bool }` |
| GET `/pub/stores` | — | `StoreRow[]` (legacy, capped 1000) |
| GET `/pub/stores/near` | `lat,lng,radius,limit,offset,mode,state,q` | `{ total, offset, limit, stores: StoreRow[] }` |
| GET `/pub/geocode` | `zip` \| `q` | `{ lat, lng, n, zip }` \| `{ error }` |
| GET `/pub/store-types` | — | `[{ type, stores, chains: string[] }]` |
| GET `/pub/stock/near` | `lat,lng,radius,sinceHours,categoryId` | `StockSignal[]` |
| GET `/pub/stock/store/:id` | — | `StockSignal[]` (latest 10) |
| GET `/pub/best-bet` | `lat,lng,categoryId,radius` | `[{ id, name, miles, score, tag, why }]` |
| GET `/pub/finds` | — | `[{ store, category, at }]` |
| GET `/pub/categories` | — | `Category[]` |
| GET `/pub/products` | `categoryId` | `[{ id, name, series, type }]` |
| GET `/pub/statuses` | — | `Status[]` |
| GET `/pub/policy` | — | public policy subset (pricing, flags, links, pages…) |
| GET `/pub/watch-count` | `retailerId,categoryId` | `{ count }` |
| GET `/pub/kiosks` | `lat,lng,radius` | `[{ id, label, category, refreshSummary, reports, lat, lng }]` |
| POST `/pub/kiosks/report` ·rl | `{ kioskId\|retailerId\|label, category, minutes[], intervalMin, note, contact }` | `{ ok, kioskId, reward }` |
| POST `/pub/watch` ·rl | `{ contact, retailerId, categoryId }` | `{ ok }` |
| GET `/pub/kiosk-receipt/start` | — | `{ email, since, live }` \| `{ error:"off" }` |
| GET `/pub/kiosk-receipt/poll` | `since,device` | `{ found, receipt?, reward? }` |
| GET `/pub/community` | `categoryId` | `Post[]` |
| GET `/pub/community/:id/image` | — | image bytes |
| POST `/pub/community/upload-url` ·rl | `{ ext, contentType }` | `{ uploadUrl, publicUrl, key }` \| `{ error }` |
| POST `/pub/community/post` ·rl | `{ imageUrl, handle, retailerId, categoryId, caption, imageKey }` | `{ ok, id, pending }` |
| POST `/pub/community/:id/like` ·rl | — | `{ ok, likes }` |
| **POST `/pub/check`** **[$][CHANGING]** | `{ retailerId, categoryId, specificProduct, kioskMode? }` | `{ providerCallId, status }` \| `{ error }` · 402 no_credits · 409 store_closed |
| **POST `/pub/check-live`** **[$][CHANGING]** | `{ retailerId, categoryId(s), specificProduct, kioskMode? }` | `{ room, wsHost }` \| `{ error }` |
| GET `/pub/result/:cid` **[CHANGING: send Bearer]** | header `Authorization: Bearer <check_session>` when signed in | `{ status, transcript, summary, confirmed, … }` · 401 once `transcriptAuth` flips on |
| GET `/pub/live/:cid` **[CHANGING: send Bearer]** | header `Authorization: Bearer <check_session>` when signed in | `{ live, status, transcript }` · 401 once `transcriptAuth` flips on |
| POST `/pub/charge` **[$][CHANGING→removed]** | `{ cid }` | `{ balance, charged }` |
| POST `/pub/translate` | `{ text, to }` | `{ translated }` \| `{ error }` |
| POST `/pub/lead` ·rl | `{ email, source }` | `{ ok }` \| `{ error }` |
| POST `/pub/waitlist` ·rl | `{ contact, lat, lng, area, region }` | `{ ok }` |
| POST `/pub/store-request` ·rl | `{ storeName, chain, address, city, state, contact, note }` | `{ ok }` (queue only — never writes the live store) |
| GET `/pub/bridge/:room` | — | `{ conversationId, wsHost }` |
| POST `/pub/bridge-hangup` | `{ room }` | `{ ok }` |

`·rl` = per-IP rate-limited. **`/pub/check*` and `/app/check*` are now per-IP rate-limited** (8/min/IP;
comp/owner bypassed) — a flood returns `429 {error:"rate_limited", retryAfter}`. Response shapes on a
normal call are unchanged.

## Authed customer — `/app/*` (Bearer token)

| Method · Path | Request | Response |
|---|---|---|
| GET `/app/me` | — | `{ credits, subscription, comp, callsMade, catalog:{sub,packs} }` |
| **POST `/app/check`** **[$]** | `{ retailerId, categoryId, specificProduct, kioskMode? }` | `{ providerCallId, status }` · 402 · 409 |
| **POST `/app/check-live`** **[$]** | `{ retailerId, categoryId(s), specificProduct, kioskMode? }` | `{ room, wsHost }` |
| GET `/app/schedules` | — | `Schedule[]` |
| POST `/app/schedule` | `{ retailerId, categoryId, daysOfWeek, timeLocal, specificProduct, contact }` | `{ ok, schedule }` \| `{ error }` |
| DELETE `/app/schedules/:id` | — | `{ ok }` |
| GET `/app/referral` | — | `{ code, referred, reward… }` |
| POST `/app/referral/claim` | `{ code }` | `{ ok, reward, credits }` \| `{ error }` |
| GET `/app/history` | — | `[{ cid, storeId, storeName, categoryId, category, ts, status, confirmed }]` |
| POST `/app/charge` **[$][CHANGING→server-side]** | `{ cid }` | `{ credits }` |
| POST `/app/checkout` | `{ kind, email }` | `{ url }` \| `{ error }` |
| GET `/app/zones` **[F: zone_sweeps]** | — | `Zone[]` (see shape below) |
| POST `/app/zones` **[F]** | `{ name, retailerIds[], centerZip?, radiusMiles? }` | `Zone` · 201 · 400 `no_stores` |
| PATCH `/app/zones/:id` **[F]** | `{ name?, retailerIds? }` (replaces set) | `Zone` · 404 |
| DELETE `/app/zones/:id` **[F]** | — | `{ ok }` · 404 |
| GET `/app/zones/quote?retailerIds=1,2` **[F]** | — | `{ stores, checks, cents }` (callable only) |
| **POST `/app/zones/:id/check`** **[$][F]** | `{ categoryId? }` (default Pokémon) | `{ runId, stores:[{retailerId,cid}] }` · 402 `no_credits` · 404 · 503 `calling_paused` |
| GET `/app/zones/run/:runId` **[F]** | — | `{ done, total, summary:{inStock,no,noAnswer,checking}, results[] }` |
| POST `/app/zones/run/:runId/stop` **[F]** | — | `{ ok, stopped }` |

> **Zone shape:** `{ id, name, stores:[{ retailerId, name, location, callable }], checkCount, lastRun:{ at, inStock, total } | null }`.
> **[F]** = premium-gated on `zone_sweeps` → **403 `not_entitled`** for free/PAYG accounts. All zone
> routes are Bearer-authed and ownership-scoped (a zone belongs to the phone account that made it).
> `check` fires one call per **callable** store (kiosk-only excluded), groups them under `runId`
> (`z<zoneId>-<uuid>`); poll `run/:runId` for the live report.

> **[CHANGING] billing:** `/pub/charge` + `/app/charge` are client-driven and will be **removed** —
> charging moves server-side to call-completion (ingest/webhook). Frontend should stop relying on
> calling charge; the credit balance will simply update on its own. Coordinate the cutover.

## Webhooks — `/webhooks/*` (signature-verified, public)

| Path | Notes |
|---|---|
| POST `/webhooks/stripe` | `{ received: true }`; 400 on bad signature. Grants credits / toggles sub. |
| POST `/webhooks/elevenlabs` | `{ ok: true }`; 400 on bad signature. Finalizes a call result. |

## WebSockets (query `?room=`)

| Path | Use |
|---|---|
| `/listen` | browser listens to a live call's audio (μ-law frames; nothing persisted) |
| `/bridge` | Twilio media ⇄ ElevenLabs agent bridge |
| `/twilio-media` | raw Twilio media stream fan-out |

## Admin — `/api/*` (by group; admin/data lane consumes these)

- **Health:** GET `/api/health` (open).
- **Policy:** GET/PATCH `/api/policy`.
- **Stores/data:** POST `/api/stores/import`, `/stores/backfill-regions`, `/stores/deactivate`
  (`{terms[]}|{phones[]}`), `/stores/flag` (`{terms[],hasKiosk?,sellsPacks?}`), `/stores/patch` (`{where:{ids?|chain?|state?}, set:{...}, clearHours?, dryRun?}` — field-safe bulk update, only the provided fields; `dryRun` returns match count + sample); GET/POST/PATCH
  `/api/retailers`; GET `/api/preview/:retailerId`.
- **Hours:** POST `/api/hours/backfill`, `/api/hours/:id/refresh`.
- **Reference:** GET `/api/categories`, `/api/chains`, PATCH `/api/chains/:id`, GET `/api/products`,
  GET/POST/PATCH/DELETE `/api/statuses`.
- **Store-data sync (one dataset):** POST `/api/store-sync` (prod receives; staging returns 400
  `staging_is_the_source`) — field-scoped upsert of CURATED chain/retailer data from staging; learned
  columns (nav*, tree*, hours, shipmentDay, phoneTree…) are never written. GET `/api/store-sync/status`
  → `{ enabled, lastRun }`. Retailers carry `published` (drafts stay staging-only). Sender: staging,
  every 5 min, diffs-only; inert until `STORE_SYNC_URL` + `STORE_SYNC_TOKEN` are set on staging.
- **Dashboards:** GET `/api/admin/metrics | pulse | overview | restock-intel | store-intel |
  user-history`. **[CHANGING]** these move table-scans → SQL aggregation; response shapes preserved.
- **Admin agent:** POST `/api/admin/agent` `{ messages:[{role,text}] }` → `{ reply, actions, error? }`.
- **Stock/discord:** POST `/api/stock/ingest`, `/api/stock/intel/reapply`; GET/POST/DELETE
  `/api/discord/channels`.
- **Zones/schedules/results:** GET/POST `/api/zones*`, `/api/schedules*`, GET `/api/results`.
- **Calls (admin/testing — gated):** POST `/api/call-now`, `/api/talk`, `/api/simulate`,
  `/api/bench/call`, `/api/bridge/call`, `/api/ingest`, `/api/tick`.
- **Voice studio:** GET/POST `/api/voices*`, `/api/voice-tuning`, `/api/sandbox-tuning*`,
  `/api/voice-presets*`, `/api/voice/live`, GET `/api/conversation/:cid`, `/api/credits`,
  GET/PATCH `/api/settings`.
- **Leads/intake:** GET `/api/leads | waitlist | store-requests`, PATCH `/api/store-requests/:id`.

## Pages (HTML, not JSON)

GET `/`, `/r`, `/s`, `/p/:slug` (+`?partial=1` → `{title,body}`), `/og/:file`, `/logos/...`,
`/robots.txt`, `/sitemap.xml`. **To remove (dev scratch):** `/logo-wall`, `/check-lab`.

---

- 2026-07-03b — **Embedded checkout (Stripe Elements):** `POST /app/checkout-intent {kind, annual}` →
  `{ mode, clientSecret, publishableKey, amountCents }`. Website confirms with Elements on our own
  comp-styled page (subscription = tier key; one-time = `payg:<checks>`). Entitlement is granted by the
  webhook (invoice.paid subscription_create / payment_intent.succeeded), same result as the hosted path.

## Change log
- 2026-07-03 — **Plans = 4 tiers + premium-feature matrix.** `GET /pub/plans` →
  `{ features:[{key,label}], everyPlanGets:[key…], tiers:[{key,name,monthlyCents,annualCents,
  checksPerMonth,premiumAsks,features:{key:bool}}], payg:[{checks,cents}] }`. Tier keys:
  `family|collector|hunter|operator`. `GET /api/admin/plans` adds the same `features` catalog + per-tier
  map (admin edits the matrix; `POST /api/admin/plans` accepts `features` per tier). `GET /app/me` adds
  `features:{key:bool}` = the account's entitlements (comp→all, subscriber→tier, PAYG/free→none) plus
  existing `premiumAsks` (= features.exact_products). Checkout: `POST /app/checkout {kind, annual}`,
  kind = tier key or `payg:<checks>`. Website gates premium UI on `/app/me.features` and HIDES premium
  for PAYG. Additive — old `sub`/pack kinds still resolve.
- 2026-07-03 — **Plans + PAYG + entitlements.** New `GET /pub/plans` →
  `{ tiers:[{key,name,monthlyCents,annualCents,checksPerMonth,premiumAsks}], payg:[{checks,cents}] }`
  (owner-edited in Admin → Plans, source of truth = settings `vt_plans`). `POST /app/checkout` now
  takes `{kind, annual?}`: kind = tier key (`starter|collector|hunter`, `annual:true`=yearly) OR
  `payg:<checks>`. Legacy `sub` + pack keys still resolve. `GET /app/me` adds `subTier`, `quota`
  (subscription checks left this cycle — resets each billing cycle, no rollover), `payg` (permanent
  PAYG balance), `premiumAsks` (Hunter entitlement); `credits` is now quota+payg. Admin-only:
  `GET/POST /api/admin/plans`, `POST /api/admin/plans/publish` (mirrors to Stripe: new Price + archive
  old, idempotent; Products never deleted). Additive — existing callers unaffected.
- 2026-07-01 — **transcript privacy (IDOR fix).** `/pub/result/:cid` + `/pub/live/:cid` now accept
  `Authorization: Bearer <check_session>`. Website: send it on both whenever the user is signed in
  (same token as `/app/*`). Enforcement is behind `policy.flags.transcriptAuth` (currently OFF), so
  nothing breaks today — DevOps flips it on once Website ships the header. After the flip, a call
  placed by a signed-in finder returns 401 without that finder's token; anonymous calls stay open.
- 2026-06-14 — initial freeze snapshot of the live API.
- 2026-06-15 — verified the documented shapes against production read endpoints (policy,
  categories, statuses, store-types, stores/near, best-bet, finds, stock/near) — all match.
- 2026-06-16 — added optional `kioskMode` to the four check endpoints (Website sends it for
  kiosk-only stores; DevOps plumbs it to the call; Voice branches the script). Spec:
  the kiosk spec in git history. Additive — existing callers unaffected.

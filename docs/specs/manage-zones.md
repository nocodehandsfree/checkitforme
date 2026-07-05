# Spec — Manage Zones (consumer) — Website build

**Owner-approved 2026-07-04.** A premium feature: save a set of nearby stores as a "zone" and
**check all of them in one tap**, then watch every store's result on one live page.

> **Terminology (hard rule): we say "CHECK", never "call".** "Check all 12 stores", "Zone check
> report", "checking…". Never "call". 1 zone check = 1 check per callable store.

## Placement & gating
- Lives in **My Checks → "Manage Zones"** (a section/entry in the My-Checks area, 6e–6i family).
- **Premium only** — the `zone_sweeps` entitlement. Gate on `/app/me.features.zone_sweeps`:
  - Entitled → full feature.
  - Not entitled (free / PAYG / feature toggled off) → a locked upsell card: *"Check every store near
    you in one tap — a Check+ member perk."* → routes to plans.

---

## Screen A — Build / edit a zone
Reuses the existing store list + map. In "zone build" mode each store is a **tap-to-select** target
that **lights up** when added (owner's words). Two ways to add:

1. **Quick add by radius** — pick a radius (1 / 2 / 5 / 10 mi) → *"Add all within 5 mi"* selects every
   callable store in the ring at once. (Backend: `zoneQuote` already builds a zone from zip+radius.)
2. **Hand-pick** — tap individual store rows to toggle them in/out (they light up when selected).

Sticky bottom bar (live): **`N stores · N checks (~$X)`** from the cost quote, then **`Name it…`** +
**`Save zone`**. A zone with 0 stores can't be saved.

```
┌─────────────────────────────────────┐
│  ← Manage Zones · New zone           │
│  [ Map + radius ring ]               │
│  Radius: 1 · 2 · [5] · 10 mi         │
│  [ + Add all within 5 mi ]           │
│  ┌───────────────────────────────┐   │
│  │ ◉ Target — Sunset      2.1 mi │   │ ← lit = selected
│  │ ◉ GameStop — Vine      3.4 mi │   │
│  │ ○ Walmart — Pico       4.0 mi │   │
│  └───────────────────────────────┘   │
├───────────────────────────────────────┤
│  3 stores · 3 checks (~$X)           │
│  [ Name it… ]        [  Save zone  ] │
└─────────────────────────────────────┘
```

## Screen B — My Zones (the list)
```
┌─────────────────────────────────────┐
│  Manage Zones                        │
│  ┌───────────────────────────────┐   │
│  │ SF Valley Sweep    12 stores  │   │
│  │ last check: 2h ago · 3 in stock│  │
│  │      [ Check all · $X ]  ⋯    │   │ ← ⋯ = edit / rename / delete
│  └───────────────────────────────┘   │
│  [ + New zone ]                       │
└─────────────────────────────────────┘
```
`Check all` shows the cost + a confirm ("This uses 12 checks"), refuses if the account can't afford
the whole zone (`canAffordZone` — never leaves a half-run sweep), then fires and opens Screen C.

## Screen C — Zone check report (the live multi-store page)
The single-check live/result page, but **one row per store, stacked, all live at once.** Summary header
+ per-store rows that animate ringing → connected → verdict; tap a row to expand its transcript/result
(the SAME result component as a single check). Reuses status chips + the 6M result card.

```
┌─────────────────────────────────────┐
│  SF Valley Sweep — checking 12 stores│
│  ●●●●●●●●○○○○   8 done · 4 checking   │
│  ✅ 3 in stock  ❌ 4 no  🔇 1 no-answer│
├───────────────────────────────────────┤
│ ✅ Target Sunset      In stock     ▸ │ ← ▸ expands this store's transcript
│ ❌ GameStop Vine      Not in stock ▸ │
│ 📞 Walmart Pico       Checking…    ▸ │ ← still live
│ 🔇 Hot Topic          No answer    ▸ │
├───────────────────────────────────────┤
│  [ Stop all ]        [ Share results ]│
└─────────────────────────────────────┘
```

---

## API contract (DevOps builds these — `/app/zones/*`, entitlement-gated)
All require the phone-session Bearer token; all gated on `zone_sweeps` entitlement (403 `not_entitled`).

| Method · Path | Request | Response |
|---|---|---|
| GET `/app/zones` | — | `[{ id, name, stores:[{retailerId,name,location,miles?}], checkCount, lastRun?:{at,inStock,total} }]` |
| POST `/app/zones` | `{ name, retailerIds:[], centerZip?, radiusMiles? }` | `{ id, … }` |
| PATCH `/app/zones/:id` | `{ name?, retailerIds? }` (full set replaces) | `{ id, … }` |
| DELETE `/app/zones/:id` | — | `{ ok }` |
| GET `/app/zones/quote?radius=&zip=` OR `?retailerIds=` | — | `{ stores, checks, cents }` (live cost for Screen A) |
| POST `/app/zones/:id/check` | `{ categoryId? }` | `{ runId, stores:[{retailerId, cid}] }` · 402 `no_credits` |
| GET `/app/zones/run/:runId` | — | `{ done, total, summary:{inStock,no,noAnswer,checking}, results:[{retailerId, name, cid, status, statusKey, confirmed, summary? }] }` (poll for Screen C) |
| POST `/app/zones/run/:runId/stop` | — | `{ ok }` (Stop all) |

Each per-store result's transcript uses the existing `GET /pub/result/:cid` (send the Bearer). So
Screen C = poll `GET /app/zones/run/:runId` for the summary/rows, and reuse `/pub/result/:cid` when a
row is expanded.

## Data-model changes (DevOps)
- Add `ownerUserId` (nullable) to `zones` → a consumer's zones are theirs; admin's stay owner-less
  (the existing owner-only zone area is unaffected).
- Add a **run grouping** so the N checks of one sweep report together: a `zoneRunId` on `callResults`
  (or a small `zone_runs` table). `POST …/check` stamps every placed check with the runId.

## Cost, entitlement, edge cases
- **Cost:** 1 check per **callable** store (`zoneQuote`). Closed / non-callable stores are excluded
  from the count and the charge (shown greyed on Screen A).
- **Afford-the-whole-zone:** `canAffordZone` blocks a run the account can't fully pay → no half sweeps.
- **One-check-per-store-per-day** dedup still applies (a store checked in the last 24h reuses its
  result instead of re-checking + re-charging).
- **Stop all** cancels every still-live check in the run (backend already returns the Twilio SIDs).
- Empty zone can't be saved or checked.

## Out of scope (phase 2, note only)
Scheduling a zone (auto-check a zone on shipment days) — the `schedules` table already can target a
zone; wire the UI later. Sharing a zone report link. Per-store category override within a zone.

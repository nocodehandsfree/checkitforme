# Spec — Admin per-customer account view — Admin build

**Owner-approved 2026-07-04.** In Admin → **Users**, click a customer to see *everything they're set
up with* — for support and ops once real customers exist. Today the Users tab only lists + flags
staff; this adds the detail view.

## Placement
Admin → **Users** → click a row → a **customer detail drawer/panel** (or a dedicated sub-view). The
existing list (`loadUsers` → `/api/admin/users`) stays; each row becomes clickable.

## Backend — DevOps builds `GET /api/admin/users/:id`
One call returns the full picture (admin-gated). Shape:
```jsonc
{
  "id": "phone:+13105550123",
  "phone": "+13105550123", "email": "x@y.com", "name": null,
  "createdAt": 1782900000, "comp": false, "staff": false,      // comp/founder + staff flags
  "subscription": { "status": "active", "tier": "collector", "tierName": "Collector",
                    "cadence": "monthly", "priceCents": 999, "since": 1782900000 },
  "entitlements": { "exact_products": true, "zone_sweeps": true, ... },   // the 8 features they have
  "credits": { "quota": 22, "payg": 5, "total": 27, "checksMade": 41, "lifetimeSpendCents": 2497 },
  "zones":     [{ "id": 3, "name": "SF Valley", "stores": 12, "lastRun": 1782900000 }],
  "schedules": [{ "id": 7, "target": "Target Sunset", "category": "Pokémon", "days": "Thu", "time": "10:00" }],
  "recentChecks": [{ "cid": "...", "store": "GameStop Vine", "category": "Pokémon",
                     "status": "completed", "statusKey": "in_stock", "at": 1782900000 }]   // last ~20
}
```
Sources: `accounts` (identity/credits/tier), `callResults` (finderUserId → checksMade + recentChecks +
lifetime spend), `zones` (ownerUserId, once Manage Zones ships), `schedules`. Entitlements = the same
`accountFeatures(subTier, comp)` DevOps already exposes on `/app/me`.

## UI (the detail panel)
```
┌──────────────────────────────────────────────┐
│  ← Jamie · +1 310 555 0123 · x@y.com   [Founder?]│
│  Member since Jul 4 · [ Comp ▢ ] [ Staff ▢ ]  │
├──────────────────────────────────────────────┤
│  PLAN     Collector · $9.99/mo · active        │
│  CREDITS  22 quota + 5 PAYG = 27 · 41 checks · $24.97 lifetime │
│  FEATURES ✅Exact ✅Zone ✅Restock ✅Sched …    │  ← the 8, on/off for them
├──────────────────────────────────────────────┤
│  ZONES     SF Valley (12 stores) · …           │
│  SCHEDULES Target Sunset · Pokémon · Thu 10am  │
│  RECENT    GameStop Vine — In stock — 2h ago   │
│            Walmart Pico — No answer — 3h ago …  │
├──────────────────────────────────────────────┤
│  [ Comp this account ] [ Grant credits… ]      │  ← phase 1 actions
└──────────────────────────────────────────────┘
```

## Actions
- **Phase 1 (build now):** Comp toggle (reuses the staff/comp flag path), **Grant credits** (small
  DevOps endpoint `POST /api/admin/users/:id/grant {checks}` → `grantCredits`). Read-everything.
- **Phase 2 (note only):** cancel subscription / refund (Stripe), impersonate/debug, notes.

## Not this
No PII export, no editing another user's zones/schedules from Admin (they own those on the front end).

---

## Related decision — REMOVE the Admin "Zones" area (owner 2026-07-04)
The owner now creates zones from their own account (consumer Manage Zones). The Admin zone area is
redundant weight. Remove:
- **Admin lane:** the Zones UI in `public/app.html` (~30 refs — tab/loader/handlers).
- **DevOps lane:** the `/api/zones*` admin endpoints (`GET/POST /api/zones`, `/:id/retailers`,
  `/call-now`, `/hangup`, `/quote`, `/stores`) — remove when the consumer `/app/zones/*` ships (spec:
  `docs/specs/manage-zones.md`), so there's no gap.
- **KEEP** the engine: `zones` + `zoneRetailers` tables and `zoneQuote`/`canAffordZone`/`callZone` —
  the consumer feature runs on them (now with `ownerUserId` per user).

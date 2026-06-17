# Sell-Methods Taxonomy — BACKEND DONE, UI contract for the UI dev

When a customer picks a store, show exactly what's possible: call vs. can't-call, live online
stock, pickup/ship, restock alerts, and an over-MSRP warning. Micro Center and Target come out
different (see the matrix). Backend is built + deployed; this is the contract for the UI work.

## The model — 4 fields (3 axes + a price flag), kept separate on purpose

| Concept | Field | Where | Values |
|---|---|---|---|
| **Can we call it?** | `callable` (backed by `sellsPacks`) | per store | true / false |
| **How we check stock** | `stockCheckMethod` | per chain | `call` · `site` (live online stock) · `kiosk` |
| **Ways to get it** | `sellMethods` | per chain | CSV of `in_store` · `pickup` · `ship` |
| **Price / source** | `isMSRP` | per chain | true = first-party at/around MSRP · **false = third-party, may exceed MSRP** |
| (helper) sells online at all | `online` | per store | true / false |

Notes: we kept the DB column name `sellsPacks` (renaming touches live call code) but the API
exposes the concept as **`callable`**. Price is **`isMSRP`** (your call — positive framing), not
"third-party." "Live online stock" is `stockCheckMethod=site`, NOT a sell-method. These live on the
**chain** (per-chain defaults, seeded from `data/sell_methods_intel.json`), resolved per store.

## API — `/pub/stores/near` now returns (per store)
```
callable: bool          // false → NEVER show a Call button (e.g. Micro Center)
stockCheckMethod: str   // "site" → show live-stock readout; "call" → phone rail
sellMethods: string[]   // ["in_store","pickup","ship"]
online: bool            // sells online at all
isMSRP: bool            // false → ⚠️ resale, price may exceed MSRP
```

## The action matrix — what the card renders (verified live)

| Store | callable | stockCheck | sellMethods | isMSRP | Card |
|---|---|---|---|---|---|
| **Target** | ✓ | site | in_store, pickup, ship | ✓ | **Call to check** · Live stock · Pickup/Ship · Notify |
| **Micro Center** | ✗ | site | in_store, pickup, ship | ✓ | Live stock · **Buy online** · Notify — **NO call** |
| **CVS** | ✓ | call | in_store, pickup, ship | ✓ | **Call to check** · Pickup/Ship · Notify |
| **Amazon** | ✗ | – | ship | ✗ | Buy online · ⚠️ may exceed MSRP |

## UI rules (the build)
1. `callable === false` → **never render "Call."** Show live stock + buy-online instead. *(Micro Center)*
2. `stockCheckMethod === 'site'` → show the real-time **"in stock at this store"** readout (stock-signal rail) above/instead of a call.
3. `sellMethods` → chips: `in_store`→"On shelf", `pickup`→"Order for pickup", `ship`→"Buy & ship".
4. `isMSRP === false` → ⚠️ "Resale — price may be over MSRP" badge.
5. **Always** offer "Notify me when restocked" (existing watches).
6. Filters: Can call · Live online stock · Pickup · Ships.

## Owner-tunable
- Per-chain defaults: `data/sell_methods_intel.json` (edit + `POST /api/sell-methods/reapply`).
- Per-store override of `online`/`sellsPacks` already exists; per-store `sellMethods` override can be added if a single store differs from its chain (rare).

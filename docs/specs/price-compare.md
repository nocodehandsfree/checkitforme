# Price comparison — the one backend field that lights it up (Website → DevOps)

_Owner item 3 (2026-07-03): "as you call multiple stores for prices, display them to find the cheapest."_

## Website side is BUILT and shipped (staging), hidden until the field arrives
`checkit.html` now carries, on the result page:
- **`priceLineHTML(o)`** — a verdict price line ("They quoted **$54.99**") + an amber `+$X over MSRP`
  delta (computed against the hobby feed's `products[].retail`).
- **`pricesFoundHTML(o)`** — a cross-store **cheapest-first "Prices found"** panel, keyed by product,
  BEST tag on the lowest **in-stock** store, out-of-stock stores listed + marked. Backed by a client
  accumulator (`PRICE_HUNT`, localStorage) fed by `recordResultPrice(o)` on every completed check.

All three render **nothing** until a completed check carries a numeric price, so there's zero visual
change today and zero regression. Verified by `scripts/qa-price.mjs` (hidden with no price; cheapest-first
+ BEST-on-lowest-in-stock once prices exist).

## The single field DevOps needs to add: `priceCents` on the result payload
Per the S7 scout of `callResults` / `verdict.ts` / `GET /pub/result/:cid`, there is **no price anywhere
today** — a call returns a verdict (in-stock yes/no), never a number. Add one numeric field and the whole
Website surface lights up:

1. **Schema** (`src/db/schema.ts` `callResults`, ~L432): add `priceCents INTEGER NULL` (or `priceHeard`).
2. **Extraction** (`src/voice/verdict.ts` `ClerkVerdict`, ~L12): capture the price the clerk quoted (sits
   next to `productForm`); extend the LLM prompt to ask for it.
3. **Payload** (`src/server.ts` `GET /pub/result/:cid`, ~L2259-2289) **and** the `/app/history` row: emit
   `priceCents`.

Website already reads `o.priceCents` — no client change needed once it's in the payload. The durable §7
version (a store×product price table, BEST = lowest fresh in-stock) is a superset; this single field
unblocks the per-call price line + the client-side cheapest-first list immediately.

# The Fungibles Score — Definitive Spec (v4)

**What it answers:** *"How reliably is it worth checking this chain for genuine Pokémon at MSRP?"*
We rank by **reliability to check**, not by how much product a store gets. A small but predictable
restocker (Barnes & Noble, Tue/Thu) outranks a big but random one. Nothing is ever guaranteed —
the names tell a customer their *best chance*, not a promise.

## The gate (decides genuine-MSRP vs not — checked first)
- Genuine sealed TPCi **at MSRP** → eligible for tiers 3–5
- Has product but **above MSRP** (markup, repacks, independent kiosks, card/hobby shops) → **tier 2**
- **Can't confirm** they carry → **tier 1** (held internally, never shown)

## The five tiers
| Tier | Name | Definition |
|---|---|---|
| **5** | **Best Chance** | Genuine MSRP · carries broadly · **frequent, predictable restock** you can time/check on a rhythm |
| **4** | **Mostly Reliable** | Genuine MSRP · carries broadly · no dependable rhythm to time |
| **3** | **Spotty** | Genuine MSRP · varies by location / sporadic |
| **2** | **Over MSRP** | Has product, but above MSRP — GameStop, repacks, independent kiosks, card/hobby shops |
| **1** | **Unknown** | Can't confirm — held internally, NEVER shown, promotable if evidence appears |

Stores that flat-out don't carry are excluded entirely (not even tier 1). Tier 1 = "we don't know yet."

## Variables

**Set the TIER (qualitative — only what we definitively know):**
1. **Genuine-MSRP vs over-MSRP vs unknown** — the gate
2. **Breadth** — carries at ~every store vs varies by location
3. **Restock cadence** — *frequent & predictable* (timeable) vs *sporadic* → the key 5-vs-4 separator
4. **Channel** — shelf / official kiosk (=5, exact MSRP) / independent kiosk (=2, over MSRP) / register-impulse
5. **MSRP integrity** — markup risk drops a chain to tier 2 regardless of breadth (e.g. GameStop)

**Set the DECIMAL (confidence within tier, ±0.4 — "3.5" idea):**
6. **Confirmation volume** — # of independent confirmations (reports + sightings + agent "yes" calls)
7. **Store confirm rate** — of stores actually called, % that had genuine product *(dominant once the
   voice agent runs; can PROMOTE a tier outright — a Spotty 3 proven 90% stocked climbs to 4/5)*
8. **Recency** — fresh confirmations lift; stale (>18 mo) drag
9. **Disconfirmations** — agent "no" + dead numbers pull down
10. **Allocation size** — how much product per drop. **Minor tiebreaker only**, never a tier driver.

## Formula
```
IF over-MSRP (markup/repack/indie-kiosk/card-shop)  → tier 2
ELIF can't confirm genuine carry                     → tier 1 (hidden)
ELSE:
  tier = f(breadth × restock cadence × channel)      → 3, 4, or 5
  decimal = w_vol·confirmation_volume
          + w_rate·store_confirm_rate                # dominant once calls exist
          + w_rec·recency
          − w_dis·disconfirmations
          + w_alloc·allocation_size                  # minor
  score = clamp(tier + decimal, tier−0.4, tier+0.4)
  # store_confirm_rate may re-grade the base tier up/down over time
```

## Worked examples
- **Barnes & Noble** → genuine MSRP ✓ · every store ✓ · predictable Tue/Thu (+next-day) rhythm ✓ ·
  small allocation (tiebreaker only) → **tier 5**, decimal +0.35 → **5.0 Best Chance.** You call/check
  it on a schedule even though some weeks are dry — that's what a 5 is.
- **Target (Westlake)** → genuine MSRP ✓ · heavy allocation · Friday-AM weekly drop (gone by afternoon) →
  **tier 5**, decimal +0.4 → **5.0.** Predictable rhythm = check-worthy, even with a brutal window.
- **GameStop** → has product constantly but marks up hot sealed → **tier 2 Over MSRP.**
- **Walmart** → genuine but varies by location (some stores carry none) → **tier 3 Spotty.**

## How it grows
Desk research sets the starting tier + a decimal from report volume. As the **voice agent** calls,
`store_confirm_rate` takes over the decimal and can re-grade tiers — so scores become *measured, not
estimated.* Dead numbers auto-flag stores for re-collection. Recurring **social sweeps** (Claude +
GPT-5.5 + Grok + Manus across TikTok/IG/Facebook/Reddit/Discord) feed new dated sightings to prune
and promote. The list self-corrects forever.

## Two expansion datasets (both enter at tier 2, via dedicated sweeps)
- **Independent kiosks** (Pod Plug 500+/38 states, VTM, VMFS, one-offs) — genuine but 20–50% over MSRP.
- **Card / hobby shops** — local TCG stores; no one has mapped these nationally. Lets a user see every
  local source, then filter "MSRP only" vs "show all prices."

## Channel tag (drives the UI + call script)
- **shelf** — call/visit, ask the toys/trading-card dept for sealed current-set product (not repacks).
- **kiosk_official** — exact MSRP machine; a "call" only checks if it's powered on / not broken (staff
  can't help). Show a KIOSK badge so users know it's a machine.
- **kiosk_independent** — over MSRP; show price-premium warning.
- **register** — impulse rack at checkout (convenience).

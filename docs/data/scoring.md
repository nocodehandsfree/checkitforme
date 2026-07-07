# The Fungibles Score — how tiers work in this codebase

**Canonical, repo-native rubric.** This is the v4 scoring model (`data/source/chain-scoring-2026-06/
SCORING_MODEL_spec.md`) reconciled to the **actual schema** and the **current prod behavior**. When
the upstream spec and the running code disagree, this doc describes what the code does today; the
upstream package is the design intent.

> **What the score answers:** *"How reliably is it worth checking this store for genuine Pokémon at
> MSRP, right now?"* We rank by **reliability to check**, not how much product a store gets. A small
> but predictable restocker (Barnes & Noble) outranks a big random one. The tier is a *best chance*,
> never a promise.

---

## The five tiers (integer 1–5, no decimals stored)

| Tier | Name | Color (consumer) | Definition |
|---|---|---|---|
| **5** | **Best Chance** | green `#2BFF88` | Genuine MSRP · carries broadly · **frequent, predictable restock** you can time. **ALSO: any official-kiosk store** (exact-MSRP machine). |
| **4** | **Mostly Reliable** | blue `#29D4FF` | Genuine MSRP · carries broadly · no dependable rhythm to time. |
| **3** | **Spotty** | orange `#FF9E2C` | Genuine MSRP · varies by location / sporadic. |
| **2** | **Over MSRP** | — | Has product but **above MSRP** — GameStop, repacks, independent kiosks, card/hobby shops. |
| **1** | **Unknown** | hidden | Can't confirm they carry → **held internally, NEVER shown** (e.g. military exchanges). Promotable if evidence appears. |

Stores that flat-out don't carry are **excluded entirely** (not even tier 1). Tier 1 = "we don't know
yet," not "doesn't sell."

### The gate (decided first)
1. **Over-MSRP** (markup / repack / independent kiosk / card-or-hobby shop) → **tier 2**.
2. Else **can't confirm** genuine carry → **tier 1** (hidden).
3. Else genuine sealed TPCi **at MSRP** → eligible for **tiers 3–5**, set by breadth × restock cadence × channel.

---

## Where the tier actually lives (schema reality)

- **`retailers.tier` — integer, per store.** This is the only tier column. There is **no
  chain-level tier column.** A chain's score from `chain_scores_final.csv` is applied by **stamping
  that integer onto every store of the chain** (importer `tier` field, or an admin bulk patch).
- The importer only accepts a **valid 1–5 integer**; anything else leaves `tier` untouched
  (`src/stores-import.ts`).
- **Decimals were dropped** in the DB. The upstream spec's `±0.4` decimal (confidence within a tier)
  is a *future* refinement; today the stored value is a plain integer and re-grading moves the whole
  integer.

### How the consumer sees it (`/pub/stores/near` projection)
```
tier = hasKiosk === true ? 5 : (retailers.tier ?? null)
```
- **Kiosk overlay wins:** any store with an official TPCi vending kiosk projects as **tier 5**,
  regardless of its chain tier (exact-MSRP machine). See the kiosk spec in git history.
- `null` tier = ungraded → ranked purely by distance, below the tier groups.
- `checkit.html` groups results: **tier 5 = "Best near you" (green)**, **tier 4 = "Mostly reliable"
  (blue)**, **tier ≤ 3 = "Spotty" (orange)**.

---

## What sets the tier (qualitative — only what we definitively know)
1. **Genuine-MSRP vs over-MSRP vs unknown** — the gate.
2. **Breadth** — carries at ~every store vs varies by location.
3. **Restock cadence** — *frequent & predictable* (timeable) vs *sporadic*. **The key 5-vs-4 split.**
4. **Channel** — shelf / **official kiosk** (=5, exact MSRP) / **independent kiosk** (=2, over MSRP) / register-impulse.
5. **MSRP integrity** — markup risk drops a chain to **tier 2** regardless of breadth (e.g. GameStop).

## What refines it over time (the decimal idea — partially live)
Once the **voice agent** calls stores, the measured signals re-grade the base tier:
6. **Confirmation volume** — independent confirmations (reports + sightings + agent "yes" calls).
7. **Store confirm rate** — of stores actually called, % with genuine product. **Dominant once calls
   exist** — a Spotty-3 proven 90 % stocked climbs to 4/5. (Per-store, via `call_results`.)
8. **Recency** — fresh confirms lift; stale (> 18 mo) drag.
9. **Disconfirmations** — agent "no" + dead numbers pull down.
10. **Allocation size** — product per drop. **Minor tiebreaker only**, never a tier driver.

> In the running system, #7 is realized as the **per-store tier override**: a voice-confirmed store
> can carry a different `tier` than its chain default. The full weighted decimal is not yet computed.

---

## Channel tag → UI + call script
| Channel | Tier effect | Call behavior |
|---|---|---|
| **shelf** | 3–5 | Call/visit; ask the toys / trading-card dept for **sealed current-set** product (not repacks). |
| **kiosk_official** | **5** | A "call" only checks if the machine is **powered on / not broken** (staff can't help). Show a KIOSK badge. |
| **kiosk_independent** | **2** | Over MSRP; show a price-premium warning. |
| **register** | 3–5 | Impulse rack at checkout (convenience). |

The kiosk call script (machine working/stocked, **not** "do you have cards") is backend code in
`src/voice/prompts.ts`, branch on `{{kiosk_mode}}` — pushed live via Admin → "Apply to agent".

---

## Distributor rule (MSRP guarantee)
From `DEV_HANDOFF_final.md` — confirmed set (rest = TBD, **do not guess**):

| Chain | Distributor |
|---|---|
| Target, Barnes & Noble, Meijer, Books-A-Million | Excell Brands (TPCi-owned) |
| Walmart | Excell Brands + MJ Holding |

**Rule:** Excell-supplied = MSRP-guaranteed. **MJ Holding = repack watch.** Populate the rest later.

---

## Worked examples (from the spec)
- **Barnes & Noble** → genuine MSRP · every store · predictable Tue–Thu (daily, really) rhythm →
  **tier 5.** You check it on a schedule even though some weeks are dry — that's what a 5 is.
- **Target** → genuine MSRP · heavy allocation · Friday-AM weekly drop (gone by afternoon) → **tier 5**
  (predictable rhythm = check-worthy, even with a brutal window).
- **GameStop** → product constantly, but marks up hot sealed → **tier 2 Over MSRP.**
- **Walmart** → genuine but varies by location (some carry none) → **tier 3 Spotty.**

## Two expansion datasets (both enter at tier 2)
- **Independent kiosks** (Pod Plug, VTM, VMFS, one-offs) — genuine but 20–50 % over MSRP.
- **Card / hobby shops** — local TCG stores; sealed, often over MSRP → tier 2, own "Hobby" section.
  (The thrift "Treasure Hunt" rail is separate — *off* the MSRP score entirely; see `DATA_PROVENANCE.md`.)

---

## Current applied state (prod, 2026-06-19)
Tiers **are live** — a sample of `/pub/stores/near` around Los Angeles returns a spread of tier 2/3/4/5
plus ungraded (`null`). Chain scores from `chain_scores_final.csv` have been stamped onto stores, the
kiosk overlay forces 5, and the consumer site renders the green/blue/orange groups. The remaining work
is the **decimal/confirm-rate** refinement (#6–9) becoming a computed value rather than a manual
per-store override, and closing the ungraded (`null`) long tail.

**Source:** `data/source/chain-scoring-2026-06/` (the owner-delivered package this is derived from).

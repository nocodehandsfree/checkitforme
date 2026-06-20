# DEV HANDOFF — Final Chain Scores (import-ready)

Import `chain_scores_final.csv`, matching `chain_name_exact` to the chains row. Per-store
voice-agent data overrides chain defaults over time.

## Scoring = integer 1–5 (no decimals, no other tiers)
  5 Best Chance     genuine @ MSRP · carries broadly · frequent predictable restock (ALSO: any kiosk store)
  4 Mostly Reliable genuine @ MSRP · carries broadly · no dependable rhythm
  3 Spotty          genuine @ MSRP · varies by location
  2 Over MSRP       has product but above MSRP (GameStop, repacks)
  1 Unknown         hidden — NEVER shown to users (military exchanges only)

## Fields (on chains)
  tier int 1–5 · tierName text · channel (shelf | shelf+kiosk) · ownershipModel (corporate | franchise)
  distributor text (blank = TBD) · visibility (live | over_msrp | hidden) · hasKiosk bool
  kioskStatus (confirmed | verify | no) · scoreNote

## ⚠️ KIOSKS — READ THIS (a kiosk store = tier 5)
A store with an official TPCi vending kiosk sells at exact MSRP, so **any kiosk store = tier 5.**
Kiosk is really a PER-STORE attribute (the official TPCi list is per-location), not a whole-chain
fact — so within a grocery banner, only the kiosk-equipped stores are 5; the rest are 4 (shelf).
**My kiosk flags are NOT fully verified — reconcile them against your official kiosk list:**
  kioskStatus = confirmed → owner-confirmed kiosk host (Gelson's, Pavilions, H-E-B, Star Market) → tier 5
  kioskStatus = verify    → I believe these grocery banners host kiosks at some stores
                            (Kroger, Safeway, Albertsons, Vons, Fred Meyer, Smith's, Fry's,
                             King Soopers, Food 4 Less) — CONFIRM per-store and set those stores to 5
  kioskStatus = no        → no kiosk (note: Ralphs has NO kiosk per owner, despite being Kroger-owned)
Trust your official kiosk list over my flags. Some banner names I'm unsure about (e.g. is "Randalls"
a kiosk market?) — your list decides. Any confirmed kiosk store → promote to 5.

## Name changes (display name; keep old DB string mapped underneath)
  "Hallmark Gold Crown" → "Hallmark"
  "Macy's (Toys R Us shop-in-shop)" → "Macy's (Toys R Us)"
  "Tokyo Japanese Lifestyle / Maido" → "Tokyo Japanese Lifestyle"

## Status fixes baked in
  H-E-B → live tier 5 (kiosk) · Fry's → live (grocery, NOT closed) · Tokyo Lifestyle → live tier 4
  Learning Express → live tier 3 · NEX/MCX/AAFES → tier 1 hidden (military)
  Star Market → 5 (kiosk) · Ralphs → 4 (no kiosk) · Costco/Sam's Club/BoxLunch → 3 (spotty)

## Distributor — confirmed set (part of the dataset; rest = TBD, do not guess)
  Target          Excell Brands (TPCi-owned)
  Walmart         Excell Brands + MJ Holding
  Barnes & Noble  Excell Brands (TPCi-owned)
  Meijer          Excell Brands (TPCi-owned)
  Books-A-Million Excell Brands (TPCi-owned)
  RULE: Excell-supplied = MSRP-guaranteed. MJ Holding = repack watch. Populate the rest later.

## New products to add to the product list
  Riftbound (Best Buy), My Hero Academia (Five Below)

## Already done per owner (no action): kiosk list integration, productDetails wiring, logistics import.

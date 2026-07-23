# Pre-launch brand/kiosk accuracy pass — 2026-07-11 (DD) · STAGING (prod untouched, needs promote)

## 1. Kiosk truth restored (owner: kiosks come ONLY from the official Pokémon list)
- Verified per-store against PROD (untouched ground truth): **staging now matches prod exactly on all
  six grocery chains — zero flag mismatches** (Food 4 Less, Vons, Albertsons, Pavilions, Ralphs, Kroger).
- Food 4 Less/Vons/Albertsons/Pavilions: every row IS an official kiosk (externalStoreId stamped) →
  all kiosk-only. **Ralphs was already right:** 13 official kiosk stores visible (dual machine+shelf,
  matching prod), 168 non-kiosk rows hidden. Kroger same pattern (323 dual / 915 hidden).
- Mapper's "set ALL Food 4 Less to kiosk" instruction happened to match (that chain is 100% kiosk),
  but the RULE is: kiosk flags are per-store from the TPCi list — never a chain-level flip.
- 2 stray "Pokemon Vending" machines were flagged as shelf stores with Hot Topic's product list
  (ids 8767, 66023) → fixed to kiosk-only, Pokémon-only.

## 2. One Piece / Topps accuracy (owner's complaint — root-caused and fixed)
**Symptom:** One Piece site showed wrong store types / thin coverage. **Causes found (both fixed):**
- **685 kiosk-only grocery stores** carried the full Excel union ("One Piece TCG", "Sports Cards"…) —
  a Pokémon vending machine carries Pokémon, period. → carries="Pokemon TCG". They no longer appear
  on One Piece/Topps.
- **~39,300 store rows claimed lines with NO confirmed evidence** (per the owner's own scoring package,
  `chain_products_merged.csv`, steward rule: likely ≠ confirmed → HOLD):
  Dollar General 20,171 (claimed OP=likely + Topps=NO ROW) · Dollar Tree 9,077 (both, no rows) ·
  Family Dollar 7,061 (OP, no row; Topps kept — confirmed) · Five Below 1,966 (OP dropped; Topps kept) ·
  Albertsons-banner grocers (Safeway/Jewel-Osco/Acme/Shaw's/Tom Thumb/Randalls/Star Market ~1,495:
  OP dropped — parent only "likely"; Sports kept — parent confirmed) · Books-A-Million 176 (OP dropped) ·
  Gelson's 21 (kiosk chain → Pokémon only).
- **Kept (correct):** Kroger banners (Ralphs/Fred Meyer/Smith's/King Soopers/QFC/City Market/Fry's/
  Pick 'n Save/Mariano's/Harris Teeter) inherit Kroger's CONFIRMED One Piece + Sports — their dual
  kiosk+shelf stores legitimately show on both brand sites. Hot Topic/BoxLunch = One Piece only
  (no sports cards — correct). Sam's/Costco/Hy-Vee = Topps only. CVS/Walgreens/Target/Walmart/
  B&N/GameStop/Meijer/BJ's/AAFES = both (confirmed). Independents (Hobby/Thrift) keep per-store
  directory carries — the call verifies at ask time.
- **Result (LA 10mi):** One Piece 104 stores / Topps 99 — near-identical Excel networks, zero
  kiosk-grocery leakage, divergence only where evidence differs. Pokémon unchanged (176; kiosks
  correctly Pokémon-only).

## PROD is still wrong (do NOT forget at promote)
All of the above is staging-only per the owner ("push staging, never prod"). Prod still serves the
union-stamped carries → its One Piece/Topps sites still show grocery kiosks + Dollar General et al.
`scripts/data-tools/fix_brand_carries.py` re-runs the whole pass idempotently (BASE=https://checkitforme.com
after owner approval at promote time).

## Judgment calls — RESOLVED by owner 2026-07-11
- **Dollar General carries One Piece (owner-confirmed)** → added back to all 20,171 stores
  ("Pokemon TCG,Magic: The Gathering,One Piece TCG,Yu-Gi-Oh"). Topps stays OFF (no evidence, not confirmed).
- **Comic shops carry One Piece (owner-confirmed)** → Comic Book Shop claims stand; status upgraded
  from plausible-kept to owner-confirmed. No data change needed.

## UPDATE (same day): owner's distributor deep-research delivered + Stage 1 applied
Doc archived at `docs/data/distributor-map-2026.md`. Owner's rule: **an Excell account carries
One Piece AND Topps.** Applied on staging (4,731 rows + 84 flag flips):
- One Piece + Topps ADDED to: Five Below (1,966 — reverses my earlier strict-evidence strip),
  Hot Topic (+Topps), BoxLunch (+Topps), Claire's (+both), Hobby Lobby (+both).
- **H-E-B (84) flipped DUAL** — TPCi kiosk AND Excell shelf account; renders in Retail + Kiosk with
  Pokémon/One Piece/Topps. Verified live (San Antonio).
- Validated by the doc's Stage-2 hold list: my strips of Dollar General/Dollar Tree/Family Dollar(OP)/
  Books-A-Million stand. Albertsons-family shelf = LOW-MED → stays Sports-only from sightings.
- `fix_brand_carries.py` updated to the full target state (dry-run on staging: 0 drift) — the one
  script to run on PROD at promote.
- Noted for later: TPCi is ACQUIRING Excell (announced 2026-02-19) — re-verify the map when it closes.
  Aldi is a confirmed Excell account but we carry 1 muted Aldi store (no callable line) — future gap.

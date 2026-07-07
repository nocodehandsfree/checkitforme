# Chain scoring package — source of truth (delivered 2026-06)

This folder is the **owner-delivered scoring package** (the "four-file zip"), checked into the repo
verbatim so it can never be lost again. It is the **source input** for the chain tier/score data —
the canonical rubric and the per-chain values live here; the live numbers are derived from it.

> Until now this package lived only as an upload outside the repo. That's why the scoring rubric
> "wasn't anywhere" when someone went looking. It is now version-controlled. **Do not delete.**

## Files (as delivered)
| File | Rows | What it is |
|---|---|---|
| `SCORING_MODEL_spec.md` | — | **The Fungibles Score, v4** — the definitive 1–5 tier rubric (the gate, the five tiers, the variables, the formula, worked examples, channel tags). |
| `DEV_HANDOFF_final.md` | — | Import instructions + baked-in status fixes + the kiosk reconciliation rule + confirmed distributors + display-name changes. |
| `chain_scores_final.csv` | 85 chains | Per-chain `tier_1_5`, `tier_name`, `channel`, `ownership_model`, `distributor`, `visibility`, store count, `has_kiosk`, `kiosk_status`, `score_note`. |
| `chain_logistics_merged.csv` | 22 chains | Per-chain `shipment_day` + dated evidence + source URL + phone-tree note. |
| `chain_products_merged.csv` | 264 rows | Per-(chain × product) `status`, `evidence_tier`, `evidence_date`, `evidence_source`, `note`. |

## How this maps into the live DB
The schema stores `tier` **per store** (`retailers.tier`), not per chain — there is no chain-level
tier column. So the per-chain `tier_1_5` here is applied by **stamping that integer onto every
`retailers` row of the chain** (via the importer's `tier` field or an admin sweep), then refined:

- **Kiosk overlay** — any store with an official TPCi vending kiosk projects as **tier 5** regardless
  of its chain tier (`tier: hasKiosk ? 5 : (tier ?? null)` in `/pub/stores/near`). See
  `docs/specs/kiosk-call-flow.md` and the official list rule in `docs/data/provenance.md`.
- **Per-store voice-confirm overrides** — once the agent calls a store, its measured confirm rate can
  re-grade that store's tier up or down (the decimal/`store_confirm_rate` mechanic in the spec).

The repo-native, reconciled version of the rubric (aligned to the actual schema + current prod state)
is **`docs/data/scoring.md`** — read that for "how scoring works in this codebase today." This folder
is the upstream source it was derived from.

## Re-applying / refreshing the scores
To restamp chain tiers from `chain_scores_final.csv`, map `chain_name_exact` → the `chains` row and
set `retailers.tier` on its stores (importer `tier` field, or a bulk admin patch). `chain_name_exact`
is the join key; mind the display-name changes in `DEV_HANDOFF_final.md` (e.g. "Hallmark Gold Crown"
→ "Hallmark") — keep the old DB string mapped underneath.

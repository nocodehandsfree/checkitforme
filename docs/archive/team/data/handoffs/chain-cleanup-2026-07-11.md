# Chain-data cleanup + mapping-board fix — 2026-07-11 (DD)

## Root cause (owner was right: the chips are fine, the chain LIST was junk)
Every store is correctly chain-linked (100%, verified). Mapping was "flying blind" because
`GET /api/admin/tree/list` returned EVERY chain row unfiltered — phantoms, merge-stubs, malls,
muted quarantine buckets. The store data never backed those rows; the endpoint just didn't match them.

## Fixed at the source (`src/server.ts` tree/list)
Filter to real mappable chains only: hide `muted`, `_`-prefixed (retired merge-stubs), and 0-active-store
rows. `?all=1` shows everything for debugging. Board: 130 rows → **97 real chains**. tsc clean.

## Data cleaned on staging (live; snapshot `chain_cleanup_snapshot_2026-07-11.json` for revert)
- **H Mart** merged: 6 single-store rows → one "H Mart" (id 99, 6 stores); the other 5 retired (muted).
- **Retired (muted) 14 phantoms** (all 0-store): Franklin's Ace Hardware(6) [stores are under Ace
  Hardware(35), 4,826]; 9 malls (88,92,93,98,101,103,109,112,113); 4 named card-shop phantoms —
  Burbank Sportscards(122)/Cash Cards Unlimited(125)/CoreTCG(126)/LA Sports Cards(127) [the real shops
  are stores under Independent Card Shop(128), 6,697].
- Underscore merge-stubs (_Sams 4, _Acme 90, _Gelson's 91, _Frys 94, _Mariano's 105) left as-is —
  already `_`+muted; the new filter hides them.
- **CVS-at-Target(115), 1,375 stores** — NOT junk: the intentional muted quarantine of CVS pharmacies
  inside Targets (sellsPacks=false). Working as designed; now hidden from the board by the filter.

## What the owner's specific complaints were (all resolved)
Franklin's Ace / the hobby shops / Gelson's-Frys-Mariano's: the stores exist and are callable under the
REAL chain — only the empty duplicate rows were showing. They're gone from the board now.

## Still needs another lane
- **DevOps:** add a stored `unmappableReason` text field on chains (audit item 4) so muted reasons are
  stored, not inferred (Amazon/Best Buy/Micro Center = online-only; Aldi = no store line; etc.).
- **Admin UI (Addie):** if the chains page has its own client-side list, confirm it reads the filtered
  tree/list (or applies the same hide rule).

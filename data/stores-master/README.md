# Stores master dataset (collector drop, 2026-06-12; Places-junk scrub 2026-06-13)

**101,953 callable US stores · 80 chains · audited clean** (0 bad/duplicate phones, 0 dupes).
Parts are gzipped JSON arrays — `gunzip -k *.gz` to use. Coverage gaps: `docs/data/COVERAGE_REPORT.md` (moved out of this data dir; the datasets stay here).

**Places-junk scrub (2026-06-13):** removed 724 Google-Places text-search false positives —
non-retail businesses that matched an ambiguous chain name (e.g. "Spencer's" → a Miami sculpture
garden, Spencer Savings Bank, Spencer School) plus non-storefront sub-sites (distribution centers,
gas stations, standalone pharmacies, auto-care). Full list in `removed_places_junk.json`. Filter:
per-chain brand-token check + non-retail keyword blacklist, applied only to Places-sourced rows of
ambiguously-named chains (Spencer's, Marshalls, Walmart, Sam's Club, etc.). Already deactivated in prod.

Files:
- `stores_master_part1..5.json.gz` — the 102,395-store master (collector drop).
- `stores_append.json.gz` — +282 stores (2026-06-12 final round): BJ's Wholesale 277 (chain
  fully recovered via their club-finder API, store-direct phones) + Books-A-Million 5 (Bullseye
  finder unioned with Places → 188 total; the old ~260 estimate counted closed stores — BAM is
  effectively complete). Phone-keyed delta against the master: appending cannot create dupes.

Audit notes (2026-06-12):
- Report claims 103,314; actual rows = 102,395 (−919) before the +282 append.
- 4,309 rows lack sane US coords (server geocoder backfills automatically).
- visibility:"muted" pre-applied to Marshalls/TJ Maxx (2,214 rows); carryConfidence on all rows.
- Per-chain site-vs-call classification lives in `../stock_check_intel.json` (seeded into the
  chains table at bootstrap — see `src/stock/intel.ts`).

✅ The geo-paginated stores API (`/pub/stores/near`) is built — the old blocker is gone.
Import via the chunked uploader once it's deployed to prod:
`tsx scripts/import-stores.ts <part.json> --base https://pokemon.fungibles.com --token $ADMIN_TOKEN`
(once per part, then the append; `--dry` first).

# Data-lane handoffs

Ready-to-run lists handed to the owner (e.g. hours backfill on a local machine).

## hours_needed_fresh.csv (2026-07-10)
3,412 fresh storefronts added this session that came in WITHOUT hours — real walk-in
locations with Google hours panels, so a local-machine Google run gets them cleanly:
- **Habitat ReStore** — 748 (new thrift chain)
- **Independent Card Shop** (WPN game stores) — 2,664

Columns: `id, name, address, city, state, phone, chain`. Sorted by state/city.

**To load the hours back:** return a CSV with `id` plus either seven day columns
(`mon..sun`, each `HH:MM-HH:MM` / `closed` / `unknown`) or one `hours` JSON column.
DD ingests it via the same patch path that did the 23%→85% backfills
(`scripts/data-tools/agg_hobby.py` shape). All-unknown rows are skipped, never guessed.

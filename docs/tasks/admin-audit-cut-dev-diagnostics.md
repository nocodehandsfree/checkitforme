# Move dev diagnostics off the daily operator surfaces

**What:** Developer/ops diagnostics sit inside daily command-center pages:
- Live (dash): the Call-health report (calls-audit + purge dry-run) is data-hygiene tooling.
- Add: bulk JSON import + backfill-regions are data-dev tools (and the import can wipe prod stores).
- Kiosk: Inspect-inbox is a raw Gmail dump of parse rejects.
Move these behind a maintenance/dev area or an internal flag so the operator's daily pages stay clean
for launch. (The store-import footgun is also covered by the store-CRUD wiring task.)
**Done when:** These diagnostics are off the primary daily pages, reachable from a maintenance area.
**Lane:** Addie
**Tag:** cut
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```

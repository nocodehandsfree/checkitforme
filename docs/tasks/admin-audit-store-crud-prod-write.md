# Store CRUD writes prod against the staging→prod sync flow

**What:** Add and Search write store data straight to prod (`POST /api/retailers`,
`POST /api/stores/import`, `POST /api/stores/backfill-regions`, `PATCH /api/retailers/:id`), but
store-sync treats STAGING as the source of truth for the store/chain tables. So building here forces a
prod update the pipe is meant to own, and the next sync can overwrite or wipe Admin-added stores —
worse, bulk import DEACTIVATES any store not in the payload (full-replace footgun) against live prod.
**Done when:** Store create/edit/import originate on staging (the sync source) or are gated behind the
env switch; the import's deactivate-absent behavior is guarded so it can't wipe prod.
**Lane:** DD
**Tag:** wiring
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```

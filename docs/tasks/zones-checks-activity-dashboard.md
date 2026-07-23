# Zone checks do not update the activity dashboard

**What:** Checks run through My Zones do not show up in the activity dashboard the way single checks do. Zones dial the SAME engine as single checks (LAW 1) — find where the activity feed diverges.
**Done when:** Run a zone check on staging; it appears in the activity dashboard exactly like a single check.
**Lane:** Webbie
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
verify-live 2026-07-23: staging https://staging.checkitforme.com/ → LIVE (serving HEAD 4f6c4a6).
Root cause fixed: zonePollTick now ensureHistCache() per finished store so zone checks land in the
Activity dashboard (server already logged them with zoneRunId). Truth snapshot re-taken.
Owner runs a zone check on staging to see it land in Activity.
```

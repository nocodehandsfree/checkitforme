# Zone checks do not update the activity dashboard

**What:** Checks run through My Zones do not show up in the activity dashboard the way single checks do. Zones dial the SAME engine as single checks (LAW 1) — find where the activity feed diverges.
**Done when:** Run a zone check on staging; it appears in the activity dashboard exactly like a single check.
**Lane:** Webbie
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
Built on branch claude/webbie-task-queue-c4wpxu (PR). Root cause: the zone flow never refreshed
the history cache the dashboard reads; zonePollTick now ensureHistCache() per finished store
(server already logs zone rows with zoneRunId). tsc clean, inline JS parses.
NOT on staging yet — verify-live pending merge to staging.
```

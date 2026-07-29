# The Admin dashboard, continued (new Addie)

**System:** admin · **Status:** active
**What:** extend the EXISTING dashboard. Never rebuild it, never add nav (LAW 4 — the nav gate
blocks any new group, tab, or section).

- Read WHOLE: `docs/specs/admin-ops-dashboard/CONTRACT.md` ·
  `docs/team/voice-calls/04-spec-dashboard-operations.md` (the owner's original, verbatim) ·
  `docs/team/admin/checkpoint.md`.
- Render the Admin board FIRST (`./node_modules/.bin/tsx scripts/render-comps.ts board`) and LOOK —
  the edit gate blocks `app.html` edits until a render has run this session.
- **Job 1:** wire the chain page's Menu versions row. `/api/admin/map/chain/:id` already serves
  versions, evidence and history; the row is hardcoded "No saved versions yet".
- **Job 2:** trim Policy to its comp per `admin-audit-policy-overload.md`. VERIFY a control exists
  elsewhere before cutting it — the two mistakes already made are written in
  `admin-ops-dashboard.md` §two-mistakes. CHECK BEFORE YOU CUT.
- Copy: `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md` governs every word. Never print engineer
  shorthand as a label · every control gets a plain one-line tooltip · grep + reuse existing strings
  before writing any new one.
- Contract steps 4 and 5 (store/retailer explorers, review queue) stay parked until real checks exist.

**Done when:** both jobs driven in a phone-sized browser on the shipped Admin bytes · merged to
staging then `bash scripts/ship-admin.sh` · verify-live output pasted below.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```

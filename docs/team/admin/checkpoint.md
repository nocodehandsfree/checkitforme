# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-13 — ADMIN DATA-DISPLAY REDESIGN (Addie) — 13/22 pages live on Admin

### ⚖️ OWNER RULING 07-13 (supersedes comp 1b where they differ) — THE design bar
First comp-faithful dash was REJECTED (didn't follow the comp as a whole screen; comp itself too flat).
Approved: my full-screen mock. Its laws for every page:
- Hero answers the page in ONE number/word + honest trend/spark (hide until real data exists, never fake).
- Color with intent, iOS-Settings style: calm rows, ONE tinted icon per row, values colored only when
  state matters. Vitals numbers ALWAYS colored (owner caught black 62/31%).
- Copy = nouns + numbers ("Money · $140"). Explainers live in the SHEET sub, never on rows.
- Page title 26px/800.

### DONE (each: build → screenshot → push; zero page errors, tsc 0 each push)
dash (approved mock: hero+trend+spark, 2 vitals, icon rows) · **shell** (brandmark header, carved group
track w/ raised active key, section pills, bg #1D1D22) · results/Calls (1c log + 1d call sheet, initials
logTile, truck+day restock fact, SHOW 50 MORE) · settings/App (1i: k-switch, pill picker, policy JSON in
sheet) · fun · workflows (1e rows + 1f edit sheet, live re-render) · support (1g: wells/pills/top-questions
drill-in, chat rows, drawer→sheet) · restock (1h: hero answer, wells, funnel/landing/days drill-ins,
by-store list + store sheet) · gtm (progress hero+bar, pill filters, dot-cycle rows, add-in-sheet) ·
feedback (wells, amber-glow queue rows, transcript sheet) · statuses (CRUD rows + edit sheet, autosave) ·
testing (hero+wells strip, log rows) · users (wells, account rows, detail sheet w/ Mark test + Reset).

### KIT (defined once in app.html <style>, comments point at comps)
.peek (+pk-ic/pk-logo/pk-m/pk-st/pk-bar/.static) · ONE sheet (openSheet/closeSheet/sheetFromHolder;
borrows live DOM, grabber/swipe/scrim/Esc dismiss) · .k-switch · select.k-filter · .k-key · .k-cta ·
.k-badge · .k-danger · .k-range/.k-hero/.k-wells/.k-pills (report grammar) · .k-eyebrow/.k-title/.k-sub/
.k-note · raised .card + carved inputs/textarea global tokens · .slogo.emboss initials tile ·
comp-1d bubbles. Harness: scripts/admin-preview.mjs (stub API fixtures, `full` flag for shell shots).

### REMAINING (9): build from kit patterns, one page/push at a time
alerts (CRUD-over-LOG) · growth/Policy (CONSOLE + queues; SPLIT per board: flags+pricing console, store
requests/waitlist/moderation as queue LOGs; Zones AREA REMOVAL = open item #7 below) · calc (REPORT,
read-only) · plans (CRUD + the premium toggle-matrix backlog item) · retailers/Intel (REPORT) · search
(LOG w/ filters; map = drill-in) · add (CRUD form) · receipts/Kiosk (REPORT over LOG) · designer (CRUD
steps; heaviest — consider its own session) · trees/Chains (CRUD + mapping drill-in).

### Notes for next session
- days[] added to /api/admin/overview (server.ts, my lane) → trend chip + spark HIDE on Admin until a
  promote ships it. Not a bug.
- test-all: only pre-existing failures (qa-design off-system = consumer scope · CATEGORIES.map/.some
  page errors exist on baseline). Verified on baseline at session start.
- **CD gap:** approved 07-13 dash mock supersedes board 1b — ADMIN_COMPS needs the backfill (hero+trend+
  spark, icon rows, no row subs). Also new: initials logTile in logs (board shows it, code now matches).
- data-tip ⓘ tooltips still live on NOT-yet-redesigned pages; they convert to gray lines per page.
- supDrawer removed; statuses saveStatus() now unused by UI (autosave covers it) — safe, left in place.

### Carried backlog (non-redesign)
- Premium toggle matrix in Plans (qa-admin-plans; backend done, UI missing) — fold into plans page pass.
- Workflows env picker Prod|Staging (cross-origin auth w/ DevOps) — comp 1e shows the track; needs API.
- Per-customer account view (docs/specs/admin-user-view.md; DevOps endpoints) — users page now has the
  sheet to host it.
- Owner owes: Delta live test round 2 · Outlook email check · A2P day → SMS e2e per old runbook.
- Data Dev: null stale avgTreeSeconds on ~30 direct chains. Mapping: 13 "attempted" re-runs.

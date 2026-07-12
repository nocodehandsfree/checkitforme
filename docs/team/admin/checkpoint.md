# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-12 — ADMIN DATA-DISPLAY REDESIGN (Addie, fresh) — IN PROGRESS

**Mission:** the real redesign — design the DATA, not a reskin. Law = `docs/design/admin/DATA_DISPLAY.md`.
Look = `ADMIN_COMPS.dc.html` + `STYLE_GUIDE.md`. Words = `copy/COPY_STYLE_GUIDE_ADMIN.md`.
Board maps 5 page types (LIVE·REPORT·LOG·CRUD·CONSOLE) and one report grammar (range·hero·wells·one list·footnote).

**Known crimes live in code now (measured):** 43 `details.card` accordions · 66 `data-tip` tooltips ·
9 floating-pager refs. Comps ban all three (accordions→peek rows, tooltips→one gray line, pager→Show more key).

### PHASE 0 — page inventory (THE plan). 6 groups · 22 sections.
Comp = dedicated screen on the board. Pattern = reuse the archetype's comped anatomy (not novel — the
board's section map assigns each one). No page is genuinely-novel, so no CD stop at archetype level.

| # | Group·Section (nav label) | Archetype | Comp? | Current state → target |
|--|--|--|--|--|
| 1 | God View · dash (Live) | LIVE | ✓ 1b | dash tiles + accordions → 3 vitals + peek rows; KILL Calc nav-only square |
| 2 | God View · users (Users) | REPORT | pattern 1h | build to report grammar |
| 3 | God View · restock (Restock) | REPORT | ✓ 1h (exemplar) | match the exemplar exactly |
| 4 | God View · alerts (Alerts) | CRUD over LOG | pattern 1e+1c | send log = LOG rows; delivery chips |
| 5 | God View · growth (Policy) | CONSOLE + queues | pattern 1i+1c | flags=console; requests/waitlist/mod=LOG queues |
| 6 | God View · calc (Calc) | REPORT | pattern 1h | report grammar, read-only |
| 7 | God View · plans (Plans) | CRUD | pattern 1e | 8 accordions → CRUD rows + edit sheet |
| 8 | Stores · retailers (Intel) | REPORT | pattern 1h | report grammar |
| 9 | Stores · search (Search) | LOG (map drill-in) | pattern 1c | filters + LOG rows; map = drill-in |
| 10 | Stores · add (Add) | CRUD form | pattern 1e/1f | form fields, kit inputs |
| 11 | Stores · receipts (Kiosk) | REPORT over LOG | pattern 1g | report strip + log |
| 12 | Calls · results (Calls) | LOG | ✓ 1c (+1d sheet) | 5 accordion/card hits → LOG rows + call sheet |
| 13 | Calls · feedback (Feedback) | queue LOG | pattern 1c | queue rows |
| 14 | Calls · statuses (Statuses) | CRUD | pattern 1e | 5 accordion hits → CRUD rows + sheet |
| 15 | Calls · trees (Chains) | CRUD | pattern 1e | CRUD rows + mapping drill-in |
| 16 | Calls · settings (App) | CONSOLE | ✓ 1i | toggle rows; no save button on console |
| 17 | Voice · designer (Designer) | CRUD | pattern 1e | CRUD |
| 18 | Voice · workflows (Workflows) | CRUD | ✓ 1e (+1f sheet) | CRUD rows + edit sheet + env track |
| 19 | Voice · testing (Testing) | LOG + report strip | pattern 1c+1g | report strip + call log |
| 20 | Voice · fun (Fun) | CONSOLE | pattern 1i | toggle rows |
| 21 | Support · support (Chats) | REPORT over LOG | ✓ 1g | report grammar + chat log |
| 22 | Launch · gtm (Go-to-Market) | checklist CRUD | pattern 1e | checklist rows |

### SHIPPED
- **Shared kit v1** (top of app.html `<style>`): `.k-eyebrow/.k-title/.k-sub/.k-note/.k-raise`, comp-accurate
  raised vitals (`.v` upgraded to the 2D gradient + 34px hero + .15em label), `.peek` row, and **ONE
  sheet** (`openSheet/closeSheet`, bottom slide-up, grabber+swipe+scrim dismiss, borrows live DOM nodes
  so ids/interactivity survive). Screenshot harness: `scripts/admin-preview.mjs` (stubs the API, renders
  a real section at 390–420px for side-by-sides).
- **dash (Live) → matches comp 1b.** 5 accordions killed → 3 vitals + 5 peek rows (Money·Pulse·Timing·
  Health·Credits), each headline on the row, tap opens the full report in the shared sheet. Money row
  deep-links to Calc. Side-by-side verified vs comp_1b. tsc 0 errors; sheet open/dismiss/restore verified.
  No dashboard nav-only tile existed to kill (dash had none; the God-View "Calc" square lives in the group
  nav, addressed when the shell/1a is rebuilt).

**Shell (1a) note (my lane, next):** current group nav is pill buttons; comp 1a wants the segmented mode
switcher (raised track, active group grows + labels, rest as icons) + "heck" wordmark + ADMIN badge. Not a
CD gap — build from 1a. Also the `/logos/brand/check-icon.png` header logo → swap to `docs/design/brand`
brandmark per comp.

### Build order (comped screens first → extract shared kit ONCE, prove it, then reuse)
0. ✅ kit v1 + dash (1b)  ·  next:
1. Shared kit (tokens/classes at top of app.html) + dash (LIVE, 1b)
2. results Calls LOG + call sheet (1c/1d)  →  3. settings/App CONSOLE (1i) + fun
4. workflows CRUD + edit sheet (1e/1f)  →  5. support REPORT-over-LOG (1g)  →  6. restock REPORT (1h)
Then pattern pages by archetype: REPORTs (users, calc, retailers, receipts) · LOGs (search, feedback,
testing) · CRUD (plans, statuses, trees, designer, add, gtm) · CONSOLE+queues (growth).
**Rule: one page at a time. Screenshot vs comp/system → matches → push (app.html only, ONE Admin) →
checkpoint → next. Never hold 2 pages unpushed. Shared server code (if any) goes staging-first.**

**CD gaps found:** none yet (fill as encountered).

### Carried backlog (NON-redesign — do not lose, not this session's focus)
- Premium-feature toggle matrix in God View ▸ Plans (qa-admin-plans fails; backend done, matrix UI missing).
- Workflows env picker Prod|Staging (cross-origin auth w/ DevOps).
- Per-customer account view (spec docs/specs/admin-user-view.md; DevOps builds endpoints).
- Owner owes: Delta live test round 2; confirm test emails render in Outlook; A2P approval → SMS e2e.
- Data Dev: null stale avgTreeSeconds on ~30 direct chains. Mapping: 13 "attempted" re-runs.

# Unify the Admin — the gate FIRST, then one page per session

**System:** admin · **Status:** active — **STEP 1 (the gate) IS DONE AND LIVE 07-30 (@10c3faa5).**
Step 2 (page by page) is **UNBLOCKED** — the Testing scorecard merged to staging 07-30 (@5abfaf9b), and the
gate refused two things in it on sight. **Next page: Live (dash).** One agent in `app.html` at a time.
**Why (owner, 07-29):** six agents have tried a whole-Admin cleanup and every one died mid-pass.
This attempt is different the same way the rebuild was: the rules become a MACHINE GATE before any
page is touched, so a cleaned page can never rot back.

**Step 1 — `scripts/qa-admin-unify.mjs` — DONE 07-30.** How to use it:
- `node scripts/qa-admin-unify.mjs --page dash` — what a page's session runs; fails until clean.
- `--all` = enforce everywhere (fails today: 18 findings on 9 pages) · `--audit` = look, enforce nothing.
- Default = THE SHIP GATE: only pages listed in `SEALED` are enforced, so the sweep never bricks a ship.
  **Sealing a page is the LAST step of its session** (after it is driven at 390px), in the same commit.
- Checked per page: a second way to mark a hint (`title=` is hover-only and dead on a phone · a typed
  ⓘ · a bespoke hint class — the ONE standard is `data-tip` + the single `::after` rule) · on-page
  directional copy · the UNTRUE list (Delta reading as live · Clerk sign-in · "estimated" on a number
  we sum from real checks) · his words (room / lane / receipt / "the thinking" naming part of a check).
  Both banned lists live in the script, commented, so they GROW — add the line the owner rejects.
- A page = its `<section>` plus its `TAB_LOADERS` loader body, plus a `chrome` page for the shared
  shell. Wired into `test-all.sh` AND `ship-admin.sh` (both gates run before any Admin ship).

**Step 2 — page by page, ONE per session,** in this order: Live (dash) · App (settings) · Calc ·
the rest per `docs/tasks/INDEX.md` cleanup list. Each page: gate green · driven at 390px · copy per
`COPY_STYLE_GUIDE_ADMIN.md` (his words: a check · Staff · dropped/reconnected Charlie · nav time ·
talk time — never receipt/room/lane/"the thinking").

**Ride-alongs the owner named (07-29), fold into the matching page's session:**
- Dashboard: the baseline line — today 5.3¢ direct / ~8.5¢ worst menu, ceiling 6.6¢ (⅓ of the
  cheapest plan's per-check revenue = his 67% margin floor). Retire the old meters: Call time and
  Call health cards (replaced by the new cost drills), the ElevenLabs credits card (not worth a
  card at $22/mo). Verify "checks left" math while there.
- App (Calls ▸ App): every knob gets a plain sentence or moves. The hold-wait knob reads
  "How long we wait on hold before giving up: 60s". Reconcile the web-analytics ID against PostHog
  (it may be the PostHog key wearing a bad name — check, don't guess; owner never asked for it).
- Calc: the plan curve is wrong (price per check must fall as tiers rise) and its baseline becomes
  the REAL stamped average, forecast only extrapolates from it.

**Done when (per page):** gate green on that page · driven · verify-live pasted here with the page
named. The task closes when every page in the cleanup list has had its pass.

**Verify-live output (paste per page — a page without it is NOT done):**
```
STEP 1, the gate (07-30) — no page touched, so the proof is the gate itself + the ship path:
  $ node scripts/qa-admin-unify.mjs --all   → unify-gate PASS: 18  FAIL: 9  (exit 1: it bites today)
  $ node scripts/qa-admin-unify.mjs         → PASS: 2 FAIL: 0 · sealed 0/25, 18 findings waiting
  $ (dash added to SEALED as a test)        → FAIL: 1, exit 1 — a sealed page that rots blocks the ship
  $ bash scripts/ship-admin.sh             → gates ran, then "✓ THE Admin is serving the new shell (10c3faa5)"
  $ bash scripts/ship-admin.sh --status    → {"source":"override","commit":"10c3faa5", bytes 652611}
  verify-live.sh: admin/prod read 55badd88 = origin/main, expected — the page override is not the
  bundle stamp; --status is the Admin's own truth. staging was still redeploying (no server code changed).
```

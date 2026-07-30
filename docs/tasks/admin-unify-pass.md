# Unify the Admin — the gate FIRST, then one page per session

**System:** admin · **Status:** active — **STEP 1 (gate) + PAGE 1 (Live/dash) DONE AND LIVE 07-30 (@71b724a5).**
`dash` is SEALED in the gate. **Next page: App (settings).**
One agent in `app.html` at a time. ⚠️ The gate calls `title=` the dead hint pattern; Calls and Testing still use
it on the status icon, where `aria-label` already carries the label. Both drop it on their own pass, together.
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

**LAW, learned 07-30 on the Cost per check sheet: the building agent NEVER composes control-panel
copy.** The exact strings ship pre-written in the task (the chain page proved this works; the
freestyle sheet proved the opposite). A number nobody can explain in one plain sentence is a row
that DIES — never ship a figure with a mystery label. And ⓘ bubbles get their OWN tap zone, never
sitting on an element that opens a sheet.

**The Cost per check sheet — FINAL strings (owner 07-30, word for word). Label = noun, ONE number,
no sub sentence (the guide's own rule; the shipped sub-lines broke it):**
- Title `Cost per check`
- Row `Goal` · `.067` — ⓘ `A third of the cheapest plan (.20 a check). Under this, every plan holds 67%.`
- Row `Today` · `.053 to .085` — ⓘ `Test checks: .053 direct, .085 worst menu (CVS). Real checks replace this.`
- The `4.2¢` row and the `Stay under the ceiling…` footnote: DELETED. No mystery numbers.
- Empty state: `No checks yet.`
- **Money reads like dollars, THREE decimals, everywhere: `.053`, never `5.3¢`** (owner ruling
  07-30 — `money()` is the one code path, so it's one fix).

**From the page-1 confession (07-30) — three more laws, now permanent:**
- **Driving a screen = TAPPING it at 390px, mid-scroll included** — watching what a bubble covers,
  not confirming strings exist. A drive that never touched the controls is not a drive.
- **The live page the owner shaped BEATS an older comp.** He strips screens on purpose; re-adding
  what he removed because a board still shows it is the failure. Conflict = one question, no guess.
- dash was sealed carrying the slop — **page 1 gets its redo with these strings, then re-seals.**

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
PAGE 1 — LIVE (dash), 07-30 @71b724a5, SEALED
  gate:    node scripts/qa-admin-unify.mjs --page dash  → dash clean · then sealed → 1/25 pages
  driven:  local server + playwright at 390px (GOTCHAS Compute recipe), walked as the owner would:
           rows read Cost per check / Money / Members, each with its sub line and tip · vitals read
           Reach 30d + Margin, both "none yet" on an empty record, never a red 0% · the cost drill
           opens on THE BASELINE: ceiling 6.7¢ "a third of 20.0¢ on Collector", thinnest plan 4.2¢,
           measured by hand 5.3¢ to 8.5¢ · Call health opens from CALLS · Calc shows the voice balance
           line + the plan-size box · no clipped sub lines, no sideways scroll, no page errors of ours.
  ship:    bash scripts/ship-admin.sh → "✓ THE Admin is serving the new shell (71b724a5)"
           --status → {"source":"override","commit":"71b724a5","bytes":656879}
  NOT verified: the cost card's server half rides the promote, so on prod Live the baseline stays hidden
  until then (same promote the ops dashboard is waiting on). Never seen on a real iPhone.

STEP 1, the gate (07-30) — no page touched, so the proof is the gate itself + the ship path:
  $ node scripts/qa-admin-unify.mjs --all   → unify-gate PASS: 18  FAIL: 9  (exit 1: it bites today)
  $ node scripts/qa-admin-unify.mjs         → PASS: 2 FAIL: 0 · sealed 0/25, 18 findings waiting
  $ (dash added to SEALED as a test)        → FAIL: 1, exit 1 — a sealed page that rots blocks the ship
  $ bash scripts/ship-admin.sh             → gates ran, then "✓ THE Admin is serving the new shell (10c3faa5)"
  $ bash scripts/ship-admin.sh --status    → {"source":"override","commit":"10c3faa5", bytes 652611}
  verify-live.sh: admin/prod read 55badd88 = origin/main, expected — the page override is not the
  bundle stamp; --status is the Admin's own truth. staging was still redeploying (no server code changed).
```

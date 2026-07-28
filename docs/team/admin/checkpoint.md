# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-28 — The ops dashboard reads real money now (contract step 2, @b5d3515c)
- `src/calls/ops.ts` is a PURE roll-up over the columns the receipt stamps, and owns NO scale: money
  is the stamped `cost*Usd` columns, seconds the stamped second columns, the outcome scale the
  owner's `statuses` table, the route wording the engine's `laneNote()`. A row with no `costTotalUsd`
  was never stamped, so it is not counted and NEVER counted as a zero (the clean slate).
  `GET /api/admin/check-costs` fetches rows + scales and prints EVERY money figure with the cost
  module's `money()`, so the page keeps no formatter to drift from the receipt.
- `#dash`: the swipe LEADS with cost per check (comp 2f's hero), honest spark, tap for the sheet;
  checks today / 7d / 30d follow untouched. Sheet = hero, two wells, what happened · how we got in ·
  where the seconds went · the clock, footnote. `#pk_cost_row` opens the same sheet. ⚠️ The card and
  the row HIDE THEMSELVES when the endpoint 404s, because the shell ships live and the server half
  rides the promote. **PM: promote wanted** — until then the owner sees the dashboard as it was.
- Replay: all sixteen kinds named; its OWN formatter printed a 5.3¢ call as 5,282,200¢, so it reads
  `cost.readable` off the receipt now. `stamped` says whether a check was ever priced, so an old one
  says so instead of showing 0.0¢. A check's sheet has THE WHOLE CALL.
- `scripts/test-ops-rollup.ts` — 34 assertions over the EIGHT real stamped checks pulled off staging.
- 🔴 **The only stamped checks anywhere are on the Fun store**, which is excluded on purpose, so the
  live readout says "no finished checks yet" until a real customer check runs on the new engine.
- Wrapping is the trap here: three wells across a phone put every label on two lines. Two `.stat` tiles.
- PM (voice-calls): receipt 199 repeats `transfer` + `hold_end` nine times with no `hold_start`, and
  opens `charlie_join` three times. Engine noise, not the dashboard.
## 🔴 07-28 OPEN, NOT FIXED — the iOS bottom tint on Admin
- Owner: the bottom Safari bar reads OPAQUE instead of the translucent glass, and a scroll line
  shows. **I could not reproduce it (no iOS here) and I did not find it.** Checked: `qa-tint-lock`
  15/15, `qa-admin-glass` 11/11, and a diff of EVERY commit touching `public/app.html` since 9f51aa4
  for overflow / height / position / scrollbar / safe-area / any page-bottom fill. The chrome CSS is
  unchanged. Cause unknown. Needs a real phone. Removing the "How a call flows" card (the LAST
  element on the chains list, so what iOS sampled at the bottom edge) may or may not have been it.

## 2026-07-28 — Chains page (shape shipped; the rules that outlive it)
- 🔴 TWO MISTAKES I MADE, do not repeat: (1) I hid Store + Data settings claiming they were editable
  under Stores. They are NOT — mute, type, rating and the bulk store toggles exist ONLY here. CHECK
  BEFORE YOU CUT. (2) I deleted the captured menu as "exhaust". It is the most valuable thing there.
- COPY: never print the mapper's `summary`, `why` or unknown `prompt` raw. It is engineer shorthand
  carrying the dashes the guide bans. `routeWords()` says the route in our words, `plainText()` strips
  a dash to a full stop. Counts read "All 7,523" / "None", never a database fraction.
## Reference + traps (detail in git; only what a future session would trip on)
- Ops dashboard contract: `docs/specs/admin-ops-dashboard/CONTRACT.md`. No conversation audio · no new
  nav · hero is ONE number, what a check costs · CLEAN SLATE, no backfill. THE WORD IS CHECK.
- 🔴 PROMOTED 07-27 (`55badd8`): main is an UNRELATED history, so a merge is impossible; its tree was
  SET to staging's. **Any future promote hits the same wall.**
- 🔴 **ship-admin's override is NOT git.** Ship from a branch never merged to `staging` and the next ship
  from staging WIPES it (f96c161 did). ALWAYS merge to staging first; `--status` shows the live override
  commit, and if it is not an ancestor of staging the Admin is on borrowed time. Full story in GOTCHAS.
- Logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (never a name guess);
  `w` picks draw size, split at ~1.48 aspect, set in the LIVE `chains` table (DB beats `_meta.json`).
  `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS go to prod.** **OPEN owner
  decision:** hide `sim_` poll rows from Feedback? 24 reworks left in `copy-icon-audit.md` MANUAL.
- **NEVER invent copy, grep + reuse.** ⚠️ The Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (site lane owns it). Email colors + sheet-glass LOCKED (`qa-admin-glass`,
  11 invariants). TODO now prod is live: re-set the owner's email on PROD.
- **Design bar + KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`): hero = ONE number + honest
  spark; `.peek`; ONE sheet openSheet/closeSheet/`askSheet` (NEVER `confirm()`); `.k-eyebrow`/sub/note;
  `logoTile` for ANY store row; `.mladder`. RENDER the board (`scripts/render-comps.ts`), never read it.
- Queue in docs/tasks/INDEX.md. Owner asks: store LOGOS on the site alerts view · premium toggle
  matrix in Plans (backend done, UI missing) · per-customer account view.

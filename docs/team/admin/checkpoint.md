# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-30 — Voice ▸ **Test calls** is the new-engine scorecard (@5b1f325, SHIPPED + DRIVEN)
- `src/calls/behaved.ts` = the PURE scorer: four rows off the record the engine ALREADY writes, no new listening.
  **NO second route** — it rides the SAME `/api/admin/receipt/:room` envelope. 41 asserts in
  `scripts/test-behaved.ts`. The card renders ONLY when the sheet opens from Test calls.
- 🔴 **THREE STATES, NOT TWO.** A gray dash = this check never put that rule to the test; a cross for "nobody put us
  on hold" is a lie and a tick is worse. Same law as an unstamped cost never printing as nought.
- 🔴 **`status` and `statusKey` are TWO fields, never merged.** `verdictKey` reads `statusKey` against the registry
  FIRST; merging them made every in-stock check say "nobody answered". No test caught it; driving it did.
- Page = comp 1c off `renderResults`; rows read `5.4¢ · not in stock`. Split card = `Menu` (line + fork) vs
  `Charlie`; `readable.menu` is new and the per-check cost reads `costForkUsd`, which nothing did.
- **PM: promote wanted** — server half is staging only, so Live is honest but flat. **NOT verified:** a red cross
  and the hold row on real data.
## 2026-07-30 — Unify GATE + page 1 (Live) shipped (@71b724a5). **dash is SEALED. Next page: App (settings).**
- `scripts/qa-admin-unify.mjs`. A page = its `<section>` + its `TAB_LOADERS` loader body (one hop; brace match runs
  long, never short) + a `chrome` page for the shell. It fails on: a SECOND way to mark a hint · on-page directional
  copy · the UNTRUE list · his-words. Both lists are IN the script — GROW them, never weaken one to pass a page.
  Ordinary English is not a violation (a kiosk receipt IS a receipt) — that is what `unless:` is for.
- **The ONE hint standard is `data-tip` + the single `[data-tip]::after{content:"ⓘ"}` rule** (tap-to-show; a phone
  has no hover). 🔴 The comp board's "tooltips become gray lines" is OLDER than the shipped pattern the owner has
  read since 07-29 — never "fix" the Admin back to gray lines.
- **RATCHET:** only ids in `SEALED` are enforced by default, so the sweep cannot brick the ship path; seal a
  page as the LAST step of its session. Runs in `test-all.sh` AND as a `ship-admin.sh` preflight.
- **LIVE's pass:** THE BASELINE is new in the cost drill, renders at zero checks too, and `baseline` comes from the
  SERVER off live plan prices, so a price change moves the ceiling. ⚠️ That server half rides the promote.
- Retired: Call time (DELETED with `loadCallTiming`; the drill's seconds + clock and Chains replace it) · Call health
  moved WHOLE into Calls (comp 1b said so all along) · the voice balance moved to Calc's voice-plan card, and its
  30-second poll is gone. **Nothing was deleted without a home.** Honest zeros: no revenue = "none yet", not 0%.
- ⚠️ Calls/Testing still put `title=` on the status icon; `aria-label` already carries it, so both drop `title=` on
  their pass (a phone has no hover). Do not split the two pages over it.
## 2026-07-29 — Policy is a console (@0f2b6b7e)
- 🔴 **CHECK BEFORE YOU CUT, win three:** the queue said cut Policy's pricing form; the comp said the OPPOSITE, only
  the GRAMMAR was wrong. Console pattern: a row saves on `change`, merges its own sub-object, re-reads the PATCH
  response, snaps back on a non-number. No save button.
- 🔴 **Driving the Admin in a browser: follow the FIRST Compute entry in `docs/shared/GOTCHAS.md` to the letter**
  (no internet for Chromium; six traps).
## 2026-07-30 — the iOS bottom tint is LOCKED (owner order: it can never go back to the darker band)
- `qa-tint-lock` now covers `app.html` too, 28/28, and runs in the PUSH GATE (a push that breaks it is refused) plus
  ship-admin. Pinned: root `#1D1D22` == `--bg` · `color-scheme:dark` · both safe areas painted · no `theme-color`
  meta · black-translucent · viewport-fit=cover · **only `.sheet` may be a filled `position:fixed` on `bottom:0`,
  allow-listed — a new one FAILS** · a closed sheet is `display:none` · nothing re-stamps the root colour.
- Proved it bites: broke it four ways (root drift · a theme-color meta · a new filled bottom bar · a parked closed
  sheet), each failed, then restored. 🔴 Still NOT verifiable here — no iOS. The owner reads the bottom edge.
## Reference + traps (detail in git and in the task files; only what a future session trips on)
- Ops 07-28: `src/calls/ops.ts` is a PURE roll-up owning NO scale; unstamped = not counted, NEVER a zero. The cost
  card HIDES on a 404. **PM: promote wanted.** Detail + its two "check before you cut" mistakes:
  `docs/tasks/admin-ops-dashboard.md`. Contract: no audio · no new nav · hero is ONE number · no backfill.
- 🔴 PROMOTED 07-27 (`55badd8`): main is an UNRELATED history, so a merge is impossible — **any future promote hits
  the same wall.** 🔴 **ship-admin's override is NOT git**: shipping from a branch never merged to `staging` gets
  WIPED by the next ship (f96c161 did) — ALWAYS merge first; `--status` is the Admin's own truth. Both in GOTCHAS.
- `chainLogoInfo` gives ANY store row its logo (never a name guess). `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS go to prod.**
- **NEVER invent copy, grep + reuse.** ⚠️ Alerts editor shipped but the SITE still reads hardcoded copy (site owns
  it). Email colors + sheet-glass LOCKED. **OPEN owner decision:** hide `sim_` poll rows from Feedback? Unbuilt owner
  asks: his email on PROD · store LOGOS on site alerts · the Plans premium matrix (backend done) · an account view.
- **KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`, RENDER it, never read it): hero = ONE number +
  honest spark · `.peek` · ONE sheet openSheet/closeSheet/`askSheet`, NEVER `confirm()` · `.k-eyebrow`/sub/
  note · `logoTile`/`logTile` for ANY store row · `.mladder` · `.k-switch`/`.k-num` on a console.

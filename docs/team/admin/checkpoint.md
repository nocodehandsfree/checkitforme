# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-08-02 — Statuses page + the confirm sheet (SHIPPED LIVE + DRIVEN in a local browser)
- 🔴 **`askSheet` ALWAYS resolved false.** `ok.onclick` called `closeSheet()` BEFORE `finish(true)`, and closeSheet
  dispatches `sheetclosed` synchronously, so the swipe-away listener settled it "no" first. Every Yes in the Admin
  read as a cancel, all six call sites. ANSWER, then close. Found only by driving a delete.
- 🔴 **A body-level layer over the sheet gets eaten by the tap-outside listener** (capture-phase
  `stopPropagation` in `_ensureSheet`). `#iconpick` is now exempt; any future overlay must be too. Symptom
  the owner saw: pick an icon, nothing happens, and the sheet underneath is gone.
- Statuses now: delete in the edit sheet (`k-danger`, comp 1f) behind an `askSheet` confirm; In stock is
  exempt (brand green is tied to it); a queued type-ahead save is dropped BEFORE the delete or closeSheet's
  flush rewrites the deleted row. Add closes the sheet and toasts. **Owner order: New status is a top-right
  `button.act` in the header, not comp 1e's bottom capsule, this page only.** No `data-tip` on it: the ⓘ
  renders INSIDE a filled green pill. Live Admin verified by fetching the served shell (Chromium has no
  internet here); behaviour driven against a local server on a throwaway SQLite file.
## 2026-07-30 — Voice ▸ **Test calls** is the new-engine scorecard (@5b1f325, SHIPPED + DRIVEN)
- `src/calls/behaved.ts` = the PURE scorer on the SAME `/api/admin/receipt/:room` envelope, NO second route. 41 asserts in `scripts/test-behaved.ts`. Page = comp 1c.
- 🔴 **THREE STATES, NOT TWO.** A gray dash = this check never put that rule to the test; a cross for "nobody put us
  on hold" is a lie and a tick is worse. Same law as an unstamped cost never printing as nought.
- 🔴 **`status` and `statusKey` are TWO fields, never merged.** `verdictKey` reads `statusKey` against the registry
  FIRST; merging them made every in-stock check say "nobody answered". No test caught it; driving it did.
- **PM: promote wanted** (server half is staging only). **NOT verified:** a red cross and the hold row on real data.
## 2026-07-30 — Unify GATE + page 1 (Live) shipped (@71b724a5). **dash is SEALED. Next page: App (settings).**
- `scripts/qa-admin-unify.mjs`. A page = its `<section>` + its `TAB_LOADERS` loader body (one hop; brace match runs
  long, never short) + a `chrome` page for the shell. It fails on: a SECOND way to mark a hint · on-page directional
  copy · the UNTRUE list · his-words. Both lists are IN the script — GROW them, never weaken one to pass a page.
  Ordinary English is not a violation (a kiosk receipt IS a receipt) — that is what `unless:` is for.
- **The ONE hint standard is `data-tip` + the single `[data-tip]::after{content:"ⓘ"}` rule** (tap-to-show). 🔴 The
  comp board's "tooltips become gray lines" is OLDER than the shipped pattern; never "fix" the Admin back to them.
- **RATCHET:** only ids in `SEALED` are enforced by default, so the sweep cannot brick the ship path; seal a
  page as the LAST step of its session. Runs in `test-all.sh` AND as a `ship-admin.sh` preflight.
- **LIVE's pass:** THE BASELINE renders at zero checks too and comes from the SERVER off live plan prices, so a
  price change moves the ceiling. ⚠️ That server half rides the promote. Retired: Call time, Call health (into
  Calls), the voice balance (into Calc) and its poll. **Nothing was deleted without a home.**
- ⚠️ Calls/Testing still put `title=` on the status icon; `aria-label` carries it, so both drop it on their pass.
## 2026-07-29 — Policy is a console (@0f2b6b7e)
- 🔴 **CHECK BEFORE YOU CUT, win three:** the queue said cut Policy's pricing form; the comp said the OPPOSITE, only
  the GRAMMAR was wrong. Console pattern: a row saves on `change`, merges its own sub-object, re-reads the PATCH
  response, snaps back on a non-number. No save button.
- 🔴 **Driving the Admin in a browser: FIRST Compute entry in `docs/shared/GOTCHAS.md`, to the letter** (no internet for Chromium).
## 2026-07-30 — the iOS bottom tint is LOCKED (owner order: it can never go back to the darker band)
- `qa-tint-lock` covers `app.html`, 28/28, in the PUSH GATE and ship-admin, so the rules live in the gate now.
  The one that bites a builder: **only `.sheet` may be a filled `position:fixed` on `bottom:0`** (allow-listed,
  a new one FAILS) and a closed sheet is `display:none`. 🔴 NOT verifiable here, no iOS. He reads the bottom edge.
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

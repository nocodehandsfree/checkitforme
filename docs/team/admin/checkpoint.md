# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-30 — Voice ▸ **Test calls** is the new-engine scorecard (@5b1f325, SHIPPED + DRIVEN)
- `src/calls/behaved.ts` = the PURE scorer: four rows off the record the engine ALREADY writes (the closed
  sixteen kinds), no new listening. **NO second route** — `behaved` rides the SAME `/api/admin/receipt/:room`
  envelope, and the attached row is read once up front now because the WORDS live there too. 41 asserts,
  `scripts/test-behaved.ts`. The card renders ONLY when the sheet is opened from Test calls.
- 🔴 **THREE STATES, NOT TWO.** A gray dash = this check never put that rule to the test. A cross for "nobody
  put us on hold" is a lie and a tick is worse. Same law as an unstamped cost never printing as nought.
- 🔴 **`status` and `statusKey` are TWO fields, never one merged value.** `verdictKey` reads `statusKey`
  against the registry FIRST, so one merged field made every in-stock check say "nobody answered". No test
  caught that; driving it did.
- Page = comp 1c copied off `renderResults` (same comp); rows gained room · lane · readable cost · statusKey ·
  the `chainLogoInfo` logo fields, and read `5.4¢ · not in stock`. Split card = `Menu` (line + fork) vs
  `Charlie`; `readable.menu` is new and the by-room cost now reads `costForkUsd`, which nothing did. ⚠️ The
  status icon keeps `title=` as its label exactly as `renderResults` does — never split the two pages over it.
- **PM: promote wanted** — the server half is staging only, so on Live the page is honest but flat (no rooms,
  "not priced", not tappable). **NOT verified:** a red cross, and the hold row on real data.
## 2026-07-30 — The unify GATE, live (@10c3faa5) — step 1 of `admin-unify-pass.md`. **Next page: Live (dash).**
- `scripts/qa-admin-unify.mjs`. A page = its `<section>` + its `TAB_LOADERS` loader body (one hop; brace match
  runs long, never short) + a `chrome` page for the shell. Per page it fails on: a SECOND way to mark a hint ·
  on-page directional copy · the UNTRUE list · his-words. Both lists are IN the script — GROW them, never
  weaken one to make a page pass. Ordinary English is not a violation (a kiosk receipt IS a receipt) — that
  is what `unless:` is for.
- **The ONE hint standard is `data-tip` + the single `[data-tip]::after{content:"ⓘ"}` rule** (tap-to-show; a
  phone has no hover). 🔴 The comp board's "tooltips become gray lines" is OLDER than the shipped pattern the
  owner has read since 07-29 (`.pk-m` clips, sentence in `data-tip`) — never "fix" the Admin back to gray lines.
- **RATCHET:** only ids in `SEALED` are enforced by default, so the sweep cannot brick the ship path; seal a
  page as the LAST step of its session. It runs in `test-all.sh` AND as a `ship-admin.sh` preflight.
## 2026-07-29 — Policy is a console (@0f2b6b7e)
- 🔴 **THE THIRD "CHECK BEFORE YOU CUT" WIN:** the queue said cut Policy's pricing form; the comp says the
  OPPOSITE. Only the GRAMMAR was wrong. **Read the comp line before you believe an audit note.**
- Console pattern: a row saves on `change` (`saveGwPrice`), merges its own sub-object, re-reads from the PATCH
  response, snaps back on a non-number. No save button. `.pk-m` clips, never wraps — sentence into `data-tip`.
- 🔴 **Driving the Admin in a browser: read the FIRST Compute entry in `docs/shared/GOTCHAS.md` and follow it to
  the letter** (no internet for Chromium; six traps, three added 07-30 from this build).
## 🔴 07-28 OPEN, NOT FIXED — the iOS bottom tint on Admin
- Bottom Safari bar reads OPAQUE, not glass, and a scroll line shows. **Not reproducible here (no iOS).**
  `qa-tint-lock` 15/15, `qa-admin-glass` 19/19, every `app.html` commit since 9f51aa4 audited. Owner's lead,
  NEVER followed: the site tints right off the same settings — diff `checkit.html` chrome vs `app.html`.
## Reference + traps (detail in git and in the task files; only what a future session trips on)
- Ops dashboard 07-28: `src/calls/ops.ts` is a PURE roll-up owning NO scale; no `costTotalUsd` = never stamped
  = not counted, and NEVER a zero. The cost card HIDES on a 404. **PM: promote wanted.** All detail, plus its
  two "check before you cut" mistakes: `docs/tasks/admin-ops-dashboard.md`. Its contract: no audio · no new
  nav · hero is ONE number · no backfill. THE WORD IS CHECK. Wrap trap: 3 wells on a phone = 2-line labels.
- 🔴 PROMOTED 07-27 (`55badd8`): main is an UNRELATED history so a merge is impossible; its tree was SET to
  staging's — **any future promote hits the same wall.** 🔴 **ship-admin's override is NOT git**: ship from a
  branch never merged to `staging` and the next ship from staging WIPES it (f96c161 did), so ALWAYS merge to
  staging first; `--status` is the Admin's own truth. Both stories in GOTCHAS.
- `chainLogoInfo` gives ANY store row its logo (never a name guess). `api()` GETs staging when
  CALL_SRC==='staging'; **writes ALWAYS go to prod.**
- **NEVER invent copy, grep + reuse.** ⚠️ Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (the site owns it). Email colors + sheet-glass LOCKED. **OPEN owner decision:** hide
  `sim_` poll rows from Feedback? Unbuilt owner asks: his email on PROD · store LOGOS on the site alerts view ·
  the premium toggle matrix in Plans (backend done, UI missing) · a per-customer account view.
- **KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`, RENDER it, never read it): hero = ONE number +
  honest spark · `.peek` · ONE sheet openSheet/closeSheet/`askSheet`, NEVER `confirm()` · `.k-eyebrow`/sub/
  note · `logoTile`/`logTile` for ANY store row · `.mladder` · `.k-switch`/`.k-num` on a console.

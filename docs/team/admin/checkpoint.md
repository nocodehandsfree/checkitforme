# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-30 — The unify GATE is built, wired and live (@10c3faa5) — step 1 of `admin-unify-pass.md`
- `scripts/qa-admin-unify.mjs`. A page = its `<section>` + its `TAB_LOADERS` loader body (one hop; brace match
  runs long, never short) + a `chrome` page for the shared shell. Per page it fails on: a SECOND way to mark a
  hint · on-page directional copy · the UNTRUE list · his-words. Both lists are IN the script, commented —
  GROW them, never weaken one to make a page pass.
- **The ONE hint standard is `data-tip` + the single `[data-tip]::after{content:"ⓘ"}` rule** (tap-to-show;
  a phone has no hover). 🔴 The comp board's "tooltips become gray lines" is OLDER than the shipped
  pattern the owner has been reading since 07-29 (`.pk-m` clips, sentence in `data-tip`) — do not "fix"
  the Admin back to gray lines. `title=` is the dead pattern: hover-only, 31 of them still in the file.
- **RATCHET:** only ids in `SEALED` are enforced by default, so the sweep can't brick the ship path. Seal a
  page as the LAST step of its session, same commit. Drove it: `--all` → 9 pages / 18 findings, exit 1 ·
  default → PASS, 0 sealed · dash sealed as a test → exit 1, the ship refused.
- Runs in `test-all.sh` AND as a `ship-admin.sh` preflight (with the glass lock) — no Admin ships past it.
  Ordinary English is not a violation (a kiosk receipt IS a receipt, "room to think" is not a room) —
  that is what `unless:` on a rule is for.
- 🔴 **The page sweep (step 2) is BLOCKED and nobody is on it:** the Testing scorecard
  (`admin-testing-new-engine.md`) has no branch and no code — only its box. Nothing to merge for them.
## 2026-07-29 — Policy is a console (@0f2b6b7e) — only the durable parts kept, rest in git
- 🔴 **THE THIRD "CHECK BEFORE YOU CUT" WIN:** the queue said cut Policy's pricing form; the comp says
  the OPPOSITE. Only the GRAMMAR was wrong. **Read the comp line before you believe an audit note.**
- Console pattern: a row saves on `change` (`saveGwPrice`), merges its own sub-object, re-reads from the PATCH
  response, snaps back on a non-number. No save button. `.pk-m` clips, never wraps — sentence into `data-tip`.
- 🔴 **Before driving the Admin in a real browser, read the FIRST Compute entry in `docs/shared/GOTCHAS.md`**
  — Chromium has no internet here; that entry is the one-process local mirror over `curl` plus the four
  gotchas that ate the time (shell at `/` · `playwright-core` · `CHAINS` not on `window`).
## 🔴 07-28 OPEN, NOT FIXED — the iOS bottom tint on Admin
- Bottom Safari bar reads OPAQUE, not glass, and a scroll line shows. **Not reproducible here (no iOS).**
  `qa-tint-lock` 15/15, `qa-admin-glass` 19/19, every `app.html` commit since 9f51aa4 audited. Owner's
  lead, NEVER followed: the site tints right off the same settings — diff `checkit.html` chrome CSS vs `app.html`.
## Ops dashboard 07-28 (@b5d3515c) — ALL detail in `docs/tasks/admin-ops-dashboard.md`
- `src/calls/ops.ts` is a PURE roll-up owning NO scale; no `costTotalUsd` = never stamped = not counted,
  and NEVER a zero. ⚠️ The cost card + `#pk_cost_row` HIDE on a 404 (shell ships live, server half rides
  the promote). **PM: promote wanted.** 🔴 Only Fun-store checks are stamped → "no finished checks yet".
- 🔴 TWO MISTAKES, do not repeat: (1) I hid Store + Data settings claiming they were editable under
  Stores. They are NOT — mute, type, rating and the bulk store toggles exist ONLY here. (2) I deleted
  the captured menu as "exhaust". It is the most valuable thing there. CHECK BEFORE YOU CUT.
- COPY: never print the mapper's `summary`, `why` or unknown `prompt` raw. `routeWords()` says the route
  in our words, `plainText()` turns a dash into a full stop. Counts read "All 7,523" / "None".
## Reference + traps (detail in git; only what a future session would trip on)
- Ops contract `.../admin-ops-dashboard/CONTRACT.md`: no audio · no new nav · hero is ONE number (what a check
  costs) · no backfill. THE WORD IS CHECK. Wrap trap: 3 wells on a phone = every label on two lines.
- 🔴 PROMOTED 07-27 (`55badd8`): main is an UNRELATED history so a merge is impossible; its tree was SET to
  staging's. **Any future promote hits the same wall.** 🔴 **ship-admin's override is NOT git**: ship from a
  branch never merged to `staging` and the next ship from staging WIPES it (f96c161 did) — ALWAYS merge to
  staging first, and `--status` is the Admin's own truth. Both stories in GOTCHAS.
- Logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (never a name guess); `w`
  picks draw size, split at ~1.48 aspect, from the LIVE `chains` table (DB beats `_meta.json`). `api()` GETs
  staging when CALL_SRC==='staging'; **writes ALWAYS go to prod.** **OPEN owner decision:** hide `sim_` poll
  rows from Feedback? Queue: `docs/tasks/INDEX.md`.
- **NEVER invent copy, grep + reuse.** ⚠️ Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (the site owns it). Email colors + sheet-glass LOCKED. Owner asks, unbuilt:
  his email on PROD · store LOGOS on the site alerts view · the premium toggle matrix in Plans (backend
  done, UI missing) · a per-customer account view.
- **KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`, RENDER it, never read it): hero = ONE number
  + honest spark · `.peek` · ONE sheet openSheet/closeSheet/`askSheet`, NEVER `confirm()` ·
  `.k-eyebrow`/sub/note · `logoTile` for ANY store row · `.mladder` · `.k-switch`/`.k-num` on a console.

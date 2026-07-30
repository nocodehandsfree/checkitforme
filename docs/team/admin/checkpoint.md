# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-29 — Policy is a console again, and the Versions row was already real (@0f2b6b7e)
- 🔴 **THE THIRD "CHECK BEFORE YOU CUT" WIN:** the queue said to cut Policy's pricing form. The comp
  says the OPPOSITE ("Flags **and pricing** stay as a console" · "Policy is CONSOLE plus queues"). Only
  the GRAMMAR was wrong. **Read the comp line before you believe an audit note.**
- Pricing = 7 `.peek static` rows saving on `change` via `saveGwPrice(path,input)`: it merges its own
  sub-object so a row writes ONE field, re-reads from the PATCH response, snaps back on a non-number.
  `savePolicyForm` gone (comp 1i: "Toggles save on tap. No save button on a console").
- KIT: `input.k-num` / `input.k-txt`, the console's number and text controls, the same raised pill as
  `select.k-filter` without the chevron; `k-num` is a fixed 78px so a column of them lines up.
- `.pk-m` NEVER wraps, it ellipsis-clips: a row line gets ~34 chars, the full plain sentence goes in
  `data-tip`. The Plans link wrapped for the same reason; its counts moved onto its sub line.
- Cut, each verified elsewhere FIRST: analytics ID → App console (`set_ga4`/`saveGa4`); `loadGwIntel`
  DELETED (holder gone, Restock owns `/api/admin/restock-intel`); the `loadGwPulse` + `loadGwKiosks`
  calls (Live and Kiosk load their own, so Policy painted two other pages on open). Queues all stay.
- **"Wire the Versions row" needed NO CODE** — live off `/api/admin/map/chain/:id` since `99586ae1`, the
  queue text was stale. Drove it: Target → "1" → one live recipe; chain 5 → "3" amber → three recipes
  with Use it / Keep current. **Prod DOES serve map versions.**
- 🔴 **Before driving the Admin in a real browser, read the FIRST Compute entry in `docs/shared/GOTCHAS.md`.**
  Chromium cannot reach the internet here; that entry is the one-process local mirror over `curl`, plus
  the four gotchas that ate the time (shell at `/` · `playwright-core` · `CHAINS` not on `window`).
## 🔴 07-28 OPEN, NOT FIXED — the iOS bottom tint on Admin
- The bottom Safari bar reads OPAQUE instead of translucent glass, and a scroll line shows. **Could not
  reproduce (no iOS here).** `qa-tint-lock` 15/15, `qa-admin-glass` 19/19, and every `app.html` commit
  since 9f51aa4 audited for overflow / height / position / safe-area / page-bottom fill: chrome CSS
  unchanged. Needs a real phone. Owner's lead, NEVER followed: the consumer site tints correctly off the
  same settings, so diff `public/checkit.html`'s chrome CSS against `public/app.html`.
## Ops dashboard 07-28 (@b5d3515c) — ALL detail in `docs/tasks/admin-ops-dashboard.md`
- `src/calls/ops.ts` is a PURE roll-up owning NO scale of its own; no `costTotalUsd` = never stamped =
  not counted, and NEVER counted as a zero. ⚠️ The cost card and `#pk_cost_row` HIDE on a 404 (the shell
  ships live, the server half rides the promote). **PM: promote wanted.** 🔴 The only stamped checks sit
  on the excluded Fun store, so it reads "no finished checks yet" until a real customer check runs.
- 🔴 TWO MISTAKES, do not repeat: (1) I hid Store + Data settings claiming they were editable under
  Stores. They are NOT — mute, type, rating and the bulk store toggles exist ONLY here. (2) I deleted
  the captured menu as "exhaust". It is the most valuable thing there. CHECK BEFORE YOU CUT.
- COPY: never print the mapper's `summary`, `why` or unknown `prompt` raw (engineer shorthand carrying
  banned dashes). `routeWords()` says the route in our words, `plainText()` turns a dash into a full
  stop. Counts read "All 7,523" / "None", never a database fraction.
## Reference + traps (detail in git; only what a future session would trip on)
- Ops contract `.../admin-ops-dashboard/CONTRACT.md`: no audio · no new nav · hero is ONE number, what a
  check costs · no backfill. THE WORD IS CHECK. Wrap trap: 3 wells on a phone = every label on 2 lines.
- 🔴 PROMOTED 07-27 (`55badd8`): main is an UNRELATED history, so a merge is impossible; its tree was SET
  to staging's. **Any future promote hits the same wall.** And 🔴 **ship-admin's override is NOT git**:
  ship from a branch never merged to `staging` and the next ship from staging WIPES it (f96c161 did), so
  ALWAYS merge to staging first. `--status` shows the live override; if it is not an ancestor of staging
  the Admin is on borrowed time. Both stories in GOTCHAS.
- Logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (never a name guess);
  `w` picks draw size, split at ~1.48 aspect, set in the LIVE `chains` table (DB beats `_meta.json`).
  `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS go to prod.** **OPEN owner decision:**
  hide `sim_` poll rows from Feedback? 24 reworks in `copy-icon-audit.md` MANUAL. Queue: `docs/tasks/INDEX.md`.
- **NEVER invent copy, grep + reuse.** ⚠️ Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (site lane owns it). Email colors + sheet-glass LOCKED. TODO: the owner's
  email on PROD. Owner asks, unbuilt: store LOGOS on the site alerts view · the premium toggle matrix in
  Plans (backend done, UI missing) · a per-customer account view.
- **KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`, RENDER it, never read it): hero = ONE number
  + honest spark · `.peek` · ONE sheet openSheet/closeSheet/`askSheet`, NEVER `confirm()` ·
  `.k-eyebrow`/sub/note · `logoTile` for ANY store row · `.mladder` · `.k-switch`/`.k-num` on a console.

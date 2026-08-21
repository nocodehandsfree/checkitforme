# SITE — checkpoint (current state)

> The consumer web app `public/checkit.html` + consumer routes in `src/server.ts`, design and ALL copy.
> Charter: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines. History is in git.

## 08-19 — AUTO-CHECKS ARE BUILT AND ON STAGING (@1a2c0193; he is testing on his phone).
Contract + his rulings: `docs/tasks/site-auto-checks.md`. The pieces, all copied not invented:
- **List** `openAutoChecks` = the Alerts sheet piece for piece (`alrow`/`alsw`/`alpause`) + an edit pen;
  the row opens the report. **My Checks row** between Check history and Alerts (`AUTO_ICO`);
  `#acctScheds`/`renderAcctScheds` DELETED into it. **Manage Zones → Zones.** ES twin on every string.
- **Saved screen** = the `sr_body`/`sr_done` flip, painted from the form (`autoNextLocal`) and corrected
  when the list lands. **Report** `openAutoReport(rebuild)` = the Activity week bars + that day's rows,
  repainting its PARTS only (a full rebuild let the list sheet flash through); a day with no run is not
  a button; `autoExpand` is zoneExpand's twin.
- **Every run is a record.** Checks carry `customerScheduleId`; the days one could NOT run were silent,
  so `customer_schedule_skips` (one per schedule per store-local day, cleared if it later runs) holds
  store_off + no_checks and `GET /app/schedules/:id/runs` serves both. New: PATCH `/app/schedules/:id`
  and POST `/app/schedules/pause-all` (`accounts.auto_checks_paused_at`), both answering with the list.
- **The ping is IN STOCK ONLY**; everything else still lands on the record. The In stock screen offers
  the auto-check (`up.keep`), which `canNotify` hid.
- **EVERY WRITE PAINTS FIRST**, server catches up, reverts with a pill if refused; the tapped button
  wears `.loading` (dim + untappable). Rig slowed to 1.2s: dim at 60ms, deleted row gone at 50ms.
- **Four faults his testing found:** the save died silently with no product picked (falls back to the
  check's own product now) · a comp account could save one and never see it · the tick judged comp by
  email where the save endpoint uses `isCompAccount` · a failed list fetch emptied the screen. Alerts:
  ONE per store now, and both pills are short enough to read. `test-schedules.ts` 16 pass.

## Verify recipe (07-26, refined 08-19)
A local rig needs NO Railway secrets: `STAGING=1 COMP_PHONES=<e164> ELEVENLABS_API_KEY=x
ELEVENLABS_AGENT_ID=x ELEVENLABS_PHONE_NUMBER_ID=x DATABASE_URL=file:<scratch>/local.db PORT=88xx npx
tsx src/server.ts`; log in via `/auth/phone/start` + `/auth/phone/check` code `000000`, token into
`localStorage.cifm_token`, drive `/opt/pw-browsers/chromium` via `node_modules/playwright-core`. A
background process needs repo-root `.unlock-bg`, killed and deleted before the turn ends. Against
STAGING: its env from Railway, CONSUMER = `/r`, a local TLS pipe carrying `wss://` AS TEXT.

## Lessons that stay true
- ONE settle per check (08-06): the FIRST thing to end a check owns the settle, a cancel is never a
  verdict, and a settle in flight asks the server for NOTHING (it flipped a cancelled check to in_stock,
  check 300). A bar tap in Activity always picks that day and the list follows the same scope.
- LOGOS (08-01): `logoPct` per store row is the whole idea (square tile, width as a PERCENT of the art
  at 46px AND 190px); `chainLogoInfo` is DB-first, a tile outside a `.store` row needs `.stile`, and
  `sheet-recipe-audit.mjs` prints 1 before a new sheet ships.
- Real touch is `page.touchscreen.tap`; Chromium CANNOT catch iOS paint, his phone is the rig. Copy a
  pattern WHOLE; a bug SURVIVING a sheet close is leftover STATE; never pad to force a scroll.
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. **What the site SERVES beats what the repo holds** — fetch the live URL and diff the bytes.

## THE OPEN LIST, 08-19 (auto-checks moved OFF it; nothing below is built)
- **NEXT: `docs/specs/location-follow/README.md`** (HIS pick of three pending): he sat 300 miles from
  home seeing home stores; the follow and the slider's re-check both need `granted`.
- `site-history-day-list.md` — a day tap opens the newest check, not that day's list. Also: the alerts row switch wraps to a second line on a long store name (08-05, no task file).
- **Translate shows on an English check when a name has an accent** (owner 08-19, "Larry Vásquez"):
  `looksForeign` treats ONE accented letter as proof. `docs/tasks/site-translate-on-accented-name.md`.
- **The customer result screen said In stock against a not_in_stock record** — a red on every test day
  since 08-07 (voice-calls checkpoint, checks 301 and 366), never on this list until now.
- `go-live-site-audit.md`: prod has never sent one email · prod misses five settings · two engine
  switches differ prod vs staging · copy-doc reconcile. And the loud retry state + its 90-second counter.
- **PM: promote wanted — the logo system's code half is staging-only.** (Admin IS shipped and safe.)
- PRICING is his own job in Admin > God View > Plans: Annual does NOT follow Monthly, the card price only moves on PUBLISH TO STRIPE, and the `v1.0` guide still prints the OLD ladder.

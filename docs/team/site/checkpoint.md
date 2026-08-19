# SITE — checkpoint (current state)

> The consumer web app `public/checkit.html` + consumer routes in `src/server.ts`, design and ALL copy.
> Charter: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines. History is in git.

## 08-19 — AUTO-CHECKS ARE BUILT AND ON STAGING (@312c4151, verify-live LIVE; he looks next).
- **The list** `openAutoChecks` copies the Alerts sheet piece for piece (`alrow`/`alsw`/`alpause`) plus
  an edit pen; the row opens that store's report. **The My Checks row** sits between Check history and
  Alerts (`AUTO_ICO`); `#acctScheds` + `renderAcctScheds` are DELETED into the sheet. **Manage Zones →
  Zones** (`acct.row.zones`; every new string ships its ES twin).
- **The saved screen** does not close: `sch_form`/`sch_done` copy the `sr_body`/`sr_done` flip,
  `showScheduleSaved` awaits `loadSchedules()` so the card prints the real Next check, its button goes
  to the list, and the "Manage in My Checks > Alerts" pill is gone. **The report** `openAutoReport` =
  the Activity week bars + that day's rows, landing on the newest day with a run; `autoExpand` is
  zoneExpand's twin (deriveVerdict + combinedTimelineHTML).
- **Every run is a record (owner 08-19).** Checks already carried `customerScheduleId`; the days that
  could NOT run were silent, so `customer_schedule_skips` (one per schedule per store-local day, cleared
  if the check later runs) carries store_off + no_checks, and `GET /app/schedules/:id/runs` serves checks
  in /app/history's exact shape plus those skips. New: PATCH `/app/schedules/:id` (active · days · time,
  week-ordered) + POST `/app/schedules/pause-all` (`accounts.auto_checks_paused_at`), both answering
  with the whole list.
- **The ping is IN STOCK ONLY** (owner 08-19) in `notifyAutoCheckResult`; everything else still lands on
  the record. **The In stock screen now offers the auto-check** (`up.keep`), which `canNotify` hid.
- **Two faults found on the rig:** `loadSchedules` demanded `subscription==='active'`, so a comp account
  could save an auto-check and never see it; and the tick read `isComp(email)` where the save endpoint
  reads `isCompAccount`, so a phone-first comp account had every day written off as "out of checks".
  `test-schedules.ts` covers edit, pause-all, skips (16 pass). Driving STAGING found a third: a failed
  list fetch emptied the row and the screen, so only an ARRAY answer now overwrites `window.SCHEDS`.

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

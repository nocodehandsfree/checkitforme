# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 08-06 — CHECK STATUS: ONE settle per check, so the screen never changes its answer (ON STAGING)
- **Three things end a check** (the bridge's `ended`, the socket closing, the POLL seeing `live:false`)
  and each called `finalizeLive` on its own clock, so two runs = two paints and the owner saw "Check
  cancelled" for a second, then "Couldn't tell". The first caller OWNS the settle; the rest paint nothing.
- **Stop and hang up is the only thing that may take the seat** (a cancel is never a verdict, 07-24): a
  settle in flight paints nothing and asks the server for NOTHING, which is money, because one read of
  `/pub/result` on a cancelled check flipped it to `completed`/`in_stock` (check 300, 08-06).
- **Echo turned "Stop and hang up" on for EVERY account 08-06** (it was comp-only). It hides once Staff
  pick up; a cancel before then is never charged and has NO conversation, so the settle stands down at the
  id hunt too (it painted "Nobody answered" over the cancel screen) and the press marks the cancel ASKED
  before the server is asked. A refusal clears flag + seat and re-settles.
## 08-06 — ACTIVITY (shipped and driven; the story is in `docs/STATE.md`)
- A bar tap ALWAYS picks that day (only a week arrow clears `ACT_DAY`), the list under the counts follows
  it, and a tile built outside a `.store` row needs `.stile` or nothing sizes it.

## Verify recipe that works (07-26, refined 08-06)
Pull the staging env from Railway, then `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`
(it will NOT boot without the env). CONSUMER = `/r`; ADMIN needs the admin HOST (`--host-resolver-rules=MAP
admin.checkitforme.com 127.0.0.1`; a Host header breaks navigation). Chromium cannot reach staging directly,
so relay through a local TLS pipe that carries the `wss://` socket too, TEXT KEPT AS TEXT (a plain http pipe
kills it: no lines, no audio, no `ended`), and mint Admin's `.checkitforme.com` cookie for the pipe's host.

## Lessons that stay true
- LOGOS (08-01): `logoPct` on every store row is the whole idea, the tile is square so the width as a
  PERCENT falls out of the artwork at 46px AND 190px; both browser-side copies are DELETED, the repair
  sweep is REPORT ONLY until `logo_repair_apply`="1", and `chainLogoInfo` is DB-first (07-31).
- CHECK STATUS (07-30): the pending render is its OWN screen (`showResult` drops `lview`), `renderLiveMsg`
  follows the NEWEST LINE, **never pad the page to force a scroll** (`qa-tint-lock` 14b refuses it), and a
  comp that leaves the homepage showing is a LIE — the real view hides `#builder` and adds `lview`.
- `sheet-recipe-audit.mjs` prints 1 before a new sheet ships; real touch is `page.touchscreen.tap`, never
  `el.click()`; sheet focus uses `preventScroll:true`. Chromium CANNOT catch iOS paint, his phone is the
  rig. Copy a pattern WHOLE, and a bug that SURVIVES closing a sheet is leftover STATE: diff the page.
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head. **What the site SERVES beats what the repo holds** — fetch the live URL and diff the bytes.

## THE OPEN LIST, 08-06 evening (nothing below is built)
- **NEXT: `docs/tasks/site-auto-checks.md`** — four screens, the Manage Zones row renamed to Zones, the
  comp-account bug hiding the list from his own account. Pictures + his words: `docs/specs/auto-checks/`.
  **RULED 08-06, do not re-ask:** the saved screen is built and the sheet does NOT close, it flips in
  place with a button into the list (today `submitSchedule` closes it) · tapping a row opens that store's
  report · the report is a week of day bars, tap a day, tap a check, it unfolds with the conversation.
  Still HIS: "Delete or Pause them below." (capital P), and "Auto-check" vs the live Alerts "auto check".
- **`docs/specs/location-follow/README.md`** (spec 08-06, HIS pick pending, AFTER auto-checks). The
  drive-follow and the slider's re-check both return unless the browser answers `granted`, which a phone
  rarely does, so the 7-day saved spot wins: he sat 300 miles from home seeing home stores.
- `docs/tasks/site-history-day-list.md` — a day tap in Check history opens the newest check and he waits
  for it; he wants the day list the calendar icon already shows. Also open: the alerts row switch wraps
  onto a second line on a long store name (found 08-05, no task file).
- `docs/tasks/go-live-site-audit.md`: prod has never sent one email (confirm-your-email) · prod misses
  `ELEVENLABS_MIDCALL_AGENT_ID` + four settings · two engine switches differ prod vs staging · no real
  auto-check watched end to end · copy-doc reconcile · Restock SMS waits on A2P.
- **PM: promote wanted — the logo system's code half is staging-only.** (Admin IS shipped and safe.)
- PRICING is the owner's own job in Admin > God View > Plans (08-06): the site reads what he saves and
  staging copies prod within a minute. Annual does NOT follow Monthly, the card price only moves on
  PUBLISH TO STRIPE, and the customer guide on branch `v1.0` still prints the OLD ladder.

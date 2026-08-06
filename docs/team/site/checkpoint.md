# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 08-06 — ACTIVITY: a bar tap means that day, and the list under it obeys that same day (ON STAGING)
- **Tapping the green bar a second time used to clear the day**, so the four counts silently swapped from
  that day to the whole week (3 in stock read as 19, any day). A tap now ALWAYS picks that day; the week's
  own totals still show when a week arrow moves the view, which is the only thing that clears `ACT_DAY`.
- **The list under the counts read the WHOLE history** whenever no status cell was picked, so picking a
  day moved every number above it and left the same three rows below. It follows the counts now (6 rows).
- Its store logos were broken there and ONLY there: the row hand-builds a tile OUTSIDE a `.store` row, so
  nothing sized it. Handed to the logo agent, who fixed it with a `.stile` class (`b078bb6a`, on staging).
- **Driven on live staging at build `550268cc956a`:** open Activity, today green with 6 in stock and its
  own 6 checks listed; tap the same bar, identical; tap Monday, green moves, 4 in stock, Monday's 5 rows.

## 08-01 — LOGOS: the size rule moves to the SERVER; one tile; the wall becomes the record (staging)
- **`logoPct` on every store row is the whole idea.** The tile is square, so the width as a PERCENT of it
  falls out of the artwork alone: right at 46px AND at 190px. Both browser-side copies are DELETED.
  `logoFields`/`withLogo` replaced 15 hand-stamps; artwork is named by its CONTENT hash; the wall reads
  the chain rows. A tile built OUTSIDE a `.store` row needs the `.stile` class or nothing sizes it (08-05).
- **Repair sweep** (`pushLogoRepairs`) re-pushes logos that differ from prod. **REPORT ONLY until
  `logo_repair_apply`="1"** (PM's condition; it writes real prod rows).
- **The stored image beats the repo file** (07-31): `chainLogoInfo` is DB-first, so editing the PNG changes
  NOTHING for a chain that already has a `logoUrl`.

## 07-30 — CHECK STATUS: bottom clear on every screen + verdict at hang up (PRs #100 #101, staging)
- The pending render is its OWN screen (`showResult` drops `lview`), so `body.rv-pend` carries the same
  strip. `renderLiveMsg` follows the NEWEST LINE. **DO NOT pad the page to force a scroll** (reverted): it
  strands the newest line and `qa-tint-lock` 14b refuses it. The leftover "solid bottom" is Safari's bar.
- **A comp that leaves the homepage showing is a LIE.** The real view also hides `#builder` and adds
  `body.lview` (`startLive`). Drive that exact path or your screenshots lie.

## Verify recipe that works (07-26, refined 08-01)
Pull the staging env from Railway, then `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`
(it will NOT boot without the env: `ELEVENLABS_API_KEY` etc). CONSUMER = `/r`; ADMIN needs the admin HOST, so
launch Chromium with `--host-resolver-rules=MAP admin.checkitforme.com 127.0.0.1` — setting a Host header
breaks navigation. A local DB has no categories, so Admin's lists throw; test its `logoTile` directly instead.
Chromium→staging TLS is blocked; a `page.route` relay via curl works (07-30).

## Lessons that stay true
- `sheet-recipe-audit.mjs` must print 1 before any new sheet ships. Real touch is `page.touchscreen.tap`,
  never `el.click()`; sheet focus calls use `preventScroll:true` (07-26/27, git @4f6c4a6).
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket reproduced the exact mess it fixed.
- A bug that SURVIVES closing the sheet is leftover STATE. Diff the page before/after, do not theorise.
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head. **What the site SERVES beats what the repo holds** — fetch the live URL and diff the bytes.

## HANDOFF 08-06 — this chat closed at 22MB. Everything below is UNBUILT.
- **NEXT: `docs/tasks/site-auto-checks.md`** (four screens + the Zones rename + the comp-account bug).
  Only the LIST comp is approved. The report's picture is rejected twice; the owner named why on 08-06:
  a ring reads as progress toward a finish line and an auto-check runs forever. His words, the pictures
  and the render scripts: `docs/specs/auto-checks/README.md`. Sharpen the pictures with him FIRST.
- The bug list is `docs/tasks/go-live-site-audit.md`. Still open there: prod has never sent one email
  (the confirm-your-email step) · prod is missing `ELEVENLABS_MIDCALL_AGENT_ID` + four other settings ·
  two calling-engine switches differ prod vs staging · no real auto-check watched end to end.
- Offered, never ruled on: the alerts row switch wraps to a second line on a long store name.
- Also open: copy-doc location reconcile · Restock SMS waits on A2P. Frozen-site tasks need an unlock.
  **PM: promote wanted — the code half of the logo system is staging-only.** (Admin IS shipped and safe.)

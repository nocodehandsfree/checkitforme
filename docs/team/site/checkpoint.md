# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 08-01 — LOGOS: the size rule moves to the SERVER; one tile; the wall becomes the record (staging)
- **`logoPct` on every store row is the whole idea.** The tile is square, so the width as a PERCENT of it
  falls out of the artwork's proportions alone: right at 46px AND at 190px, nobody recomputing. Both copies
  of the browser-side rule are DELETED, and the cached-onload race with them.
- **`logoFields`/`withLogo` replace 15 hand-stamps** that resolved the chain 8 different ways (one store
  could get different logos on different screens). `storeChainName` is the only dash-splitter left.
- **Stored artwork is named by its CONTENT hash**: new picture = new address = it lands everywhere at once,
  no `?v=` to bump, and a rename or a differing chain id (H Mart: 131 on prod, 99 on staging) can't orphan it.
- **The wall reads the chain rows**, not the shipped copies + `_meta.json`. 111 marks, one tile size.
- **Repair sweep** (`pushLogoRepairs`) asks prod what it holds and re-pushes logos that differ; the normal
  push only sends what CHANGED, which is why 71 chains sat stale. Uploads refused on prod. **REPORT ONLY
  until `logo_repair_apply`="1"** (PM's condition; it writes real prod rows). It shipped writing, and did
  write 130 chains before that was caught — no harm, prod matched staging exactly, but it was not held.
  It also compares only fields the target SERVES, or an older prod that cannot store `logoPct` looks
  different forever and the sweep re-pushes every tick without ever converging.
- **Admin ships BEFORE the promote and that is safe** (owner 08-01 pushed back, rightly). It reads prod's
  API, so `logoPct` is absent until the promote; the CSS fallback was retuned to 78/90 plain and 95/90 wide,
  which lands EXACTLY on the rule for every wide mark and within a pixel elsewhere. Measured, not assumed.
- Deleted: the 52px pre-redesign tile (v2 is set unconditionally at load, so it never rendered), the zone
  card's `.ic2`, three skin overrides, and `/api/admin/migrate-logos-to-r2` (it would have overwritten the
  content-named copies with the old file-named ones).

## 07-31 — the artwork (superseded above; kept for the trap)
- **The stored image beats the repo file** — `chainLogoInfo` is DB-first. Editing the PNG changes NOTHING
  for a chain with a `logoUrl`. All 112 re-cut: squarish marks to BJ's ink ratio (59.7%), wide wordmarks
  solved so the visible mark lands 4.5px clear of every edge.

## 07-30 — CHECK STATUS: bottom clear on every screen + verdict at hang up (PRs #100 #101, staging)
- The pending render is its OWN screen (`showResult` drops `lview`), so `body.rv-pend` carries the same
  strip. `renderLiveMsg` follows the NEWEST LINE, never `document.body.scrollHeight`. **DO NOT pad the page
  to force a scroll** (reverted): it strands the newest line; `qa-tint-lock` 14b refuses it. The leftover
  "solid bottom" is Safari's EXPANDED bar, not our paint — root colour is gate-locked.
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

## Open (owner asks + the site queue)
- Alerts sheet formatting · copy-doc location reconcile · missing email-confirmation (PROD email likely
  never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
  **PM: promote wanted — the code half of the logo system is staging-only.** (Admin IS shipped and safe.)

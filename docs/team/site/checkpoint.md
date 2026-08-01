# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 08-01 — LOGOS: the size rule moves to the SERVER; one tile; the wall becomes the record (staging)
- **`logoPct` on every store row is the whole idea.** The tile is square, so the width as a PERCENT of it
  falls out of the artwork's proportions alone and is right at 46px and at 190px with nobody recomputing.
  Both copies of the browser-side rule are DELETED, and the cached-onload race with them.
- **`logoFields`/`withLogo` replace 15 hand-stamps** that resolved the chain 8 different ways (one store
  could get different logos on different screens). `storeChainName` is the only dash-splitter left.
- **Stored artwork is named by its CONTENT hash.** New picture = new address = it lands everywhere at once;
  no `?v=` to bump, and a rename or a differing chain id (H Mart is 131 on prod, 99 on staging) can't orphan it.
- **The wall reads the chain rows, not the shipped copies + `_meta.json`.** 111 marks, one tile size.
- **Repair sweep** (`pushLogoRepairs`) asks prod what it holds and re-pushes logos that differ — the normal
  push only ever sends what CHANGED, which is why 71 chains sat stale forever. Uploads refused on prod.
- **ORDER MATTERS: do NOT ship Admin until the promote.** Admin reads prod's API; with no `logoPct` there
  yet, `logoStyle` returns '' and every logo falls back to fit-inside — a regression on what's live today.
- Deleted: the 52px pre-redesign tile (v2 is set unconditionally at load, so it never rendered), the zone
  card's `.ic2`, three skin overrides, and `/api/admin/migrate-logos-to-r2` (it would have written the old
  file-named copies back over the content-named ones).

## 07-31 — the artwork (superseded above; kept for the trap)
- **The stored image beats the repo file** — `chainLogoInfo` is DB-first. Editing the PNG changes NOTHING
  for a chain with a `logoUrl`. All 112 re-cut: squarish marks to BJ's ink ratio (59.7%), wide wordmarks
  solved so the visible mark lands 4.5px clear of every edge.

## 07-30 — CHECK STATUS: bottom clear on every screen + verdict at hang up (PRs #100 #101, staging)
- The pending render is its OWN screen (`showResult` drops `lview`), so `body.rv-pend` carries the same
  measured strip. `renderLiveMsg` follows the NEWEST LINE, never `document.body.scrollHeight`.
- **DO NOT pad the page to force a scroll** (`body.lview main{min-height:100dvh}`, reverted): it strands
  the newest line and kills the reveal; `qa-tint-lock` 14b refuses it. The leftover "solid bottom" is
  Safari's EXPANDED bar, not our paint — root colour is gate-locked.
- **A comp that leaves the homepage showing is a LIE.** The real view also hides `#builder` and adds
  `body.lview` (`startLive`). Drive that exact path or your screenshots lie.

## Verify recipe that works (07-26)
Railway staging env + `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`. CONSUMER page
= `/r` (`/` on localhost is Admin). Playwright: DEFAULT-import `playwright-core/index.js` (CJS) +
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `ACCOUNT` is script-scoped, stub with a BARE
assignment. No hot-reload. Chromium→staging TLS is blocked DIRECTLY; a `page.route` relay that fulfills
each request via curl (`-H 'Accept-Encoding: identity'`, body to a FILE as bytes) works (07-30).

## 07-26/27 + 07-28 — PLANS/checkout sheet (staging, git @4f6c4a6) · ADMIN sheet glass (LIVE @2ca41b5)
- `scripts/sheet-recipe-audit.mjs` must print 1 before any new sheet ships. Real touch is
  `page.touchscreen.tap`, never `el.click()`. Sheet focus calls all use `preventScroll:true`.
- Glass: a closed `.sheet` never left the bottom edge, where iOS never ghosts a fixed element; Admin now
  hides it on close (`docs/tasks/admin-glass-nudge.md`). **Found by diffing the page before/after.**

## Lessons that stay true
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket reproduced the exact mess it fixed.
- A bug that SURVIVES closing the sheet is leftover STATE. Diff the page before/after, do not theorise.
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head. **What the site SERVES beats what the repo holds** — fetch the live URL and diff the bytes.

## Open (owner asks + the site queue)
- Alerts sheet formatting · copy-doc location reconcile · missing email-confirmation (PROD email likely
  never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
  **PM: promote wanted — the whole logo system is staging-only, and Admin must NOT ship before it.**

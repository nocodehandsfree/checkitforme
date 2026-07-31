# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 07-31 — CHAIN LOGOS: sized by AREA, nine files re-trimmed (PR #102, staging + Admin live)
- **TRAP: the stored image beats the repo file.** `chainLogoInfo()` is DB-first and the stored copies
  had DRIFTED: Shaw's/TJ Maxx/Ross/Randalls/Tom Thumb sat letterboxed in a 256px square (13.7% ink vs
  BJ's 59.7%). Editing the PNG changes NOTHING for any chain with a `logoUrl`.
- **Second trap: `POST /api/chains/:id/logo` writes `chainSlug(name)` keys with DASHES (`shaw-s.png`),
  the migration wrote the FILE name with underscores.** Uploading leaves the old key live: re-fetch the
  URL and compare bytes every time. Five rows pointed at stale copies before I caught it.
- **Export rule:** squarish marks pad to BJ's ink ratio (59.7%); wide wordmarks trim TIGHT, since
  padding a 5:1 mark only steals tile width once the render clamps on it. `sizeLogo()` (twin in
  checkit.html + app.html) gives equal visual AREA then clamps to 95%/90% of the tile, width in PERCENT
  so smaller tiles need no re-run. Cached images fire onload before layout: the rAF retry is REQUIRED.
- Driven in a browser on the live rows: canvas area identical across the squarish marks, every wide mark
  now on 95% of tile width. Kroger untouched.

## 07-30 — CHECK STATUS: bottom clear on EVERY screen + verdict at hang up (PRs #100 #101, staging)
- The pending render is its own screen: `showResult` drops `lview`, so `body.rv-pend` carries the SAME
  measured strip. `renderLiveMsg` follows the NEWEST LINE, never `document.body.scrollHeight`; strip +
  `scroll-margin-bottom` = `calc(160px + env(safe-area-inset-bottom))`; `POLICY_KNOWN` gates extras.
- **Verdict at hang up (owner-ordered, `src/voice/elevenlabs.ts` via .unlock):** EL's "processing"
  means the phone side is DONE, so the gate passes it when real turns + duration exist and the finalize
  runs at once. DRIVEN on the real staging site (relay recipe below), zero page errors.
- **The remaining "solid bottom" (owner 16:04 screenshot) is Safari's EXPANDED bar, NOT our paint.** iOS
  collapses its bar ONLY on a finger scroll; this page scrolls ITSELF. Root colour is gate-locked.
- **DO NOT pad the check status page to force a scroll** (`body.lview main{min-height:100dvh}`,
  reverted 07-30): it strands the newest line and kills the reveal; `qa-tint-lock` 14b refuses it.
- **A comp that leaves the homepage showing is a LIE.** The real view also hides `#builder` and adds
  `body.lview` (`startLive` ~:5864). Drive that exact path or your screenshots lie. The step window is
  live (@ec6e2d0): eyebrow + ONE big 22px state line, mark 212px off top-right.

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
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).
- **What the site SERVES beats what the repo holds.** Prove it by fetching the live URL and diffing bytes.

## Open (owner asks + the site queue)
- Alerts sheet formatting · copy-doc location reconcile · missing email-confirmation (PROD email likely
  never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
  Logo fidelity in My Zones + the call-log header is COVERED by 07-31's shared `sizeLogo`. **PM: promote
  wanted — the consumer half of the logo sizing (`sizeLogo` in checkit.html) is staging-only.**

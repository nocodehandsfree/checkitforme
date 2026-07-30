# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 07-30 — CHECK STATUS: step window SHIPPED · a forced page height was REVERTED · read-as-it-goes
- **The step window is live** (@ec6e2d0). The glowing header lost the store-name row: eyebrow (store,
  10.5/700 tracked caps) + ONE big state line, `Calling` → `Getting through the menu` → `Talking to
  Staff`, the store mark 212px bleeding off the top-right under a soft fade. 22px not the table's 24 —
  the longest state sat 9px off the card edge at 375. Reads `LIVE_STAGE` only; the pipe is untouched.
  Tiny 20px `.callwho` logo beside "Calling" removed (owner: killed once before for being too small).
- **DO NOT pad the check status page to force a scroll.** I shipped `body.lview main{min-height:100dvh}`
  to chase the solid iOS bottom bar; it strands the newest line and kills the scroll-back reveal.
  Reverted same day, and `qa-tint-lock` 14b now FAILS a push that re-adds it. The real fix is two
  halves together: aim the follow-along at the NEWEST LINE (not `document.body.scrollHeight`), THEN add
  the clear strip using the repo's own `calc(160px + env(safe-area-inset-bottom))` recipe (~:2095).
  Full write-up + the rest of the open list: `docs/tasks/site-check-status-fixes.md`.
- **A comp that leaves the homepage showing is a LIE.** The real view also hides `#builder` and adds
  `body.lview` (`startLive` ~:5864). He caught mine. Drive that exact path or your screenshots lie.
- **Verdict speed (@92fb2d4):** the reader now runs DURING the check off our own live record
  (`src/voice/live-read.ts`, hooked into `recordLine` by REGISTRATION, never an import). Finalize merge
  692ms → 1ms, same verdict. Reader measured ~0.9s median — it was never the big cost. What is still
  slow is ElevenLabs' own read; the facts and the open question are in the task file.

## Verify recipe that works (07-26)
Railway staging env + `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`. CONSUMER page
= `/r` (`/` on localhost is Admin). Playwright: DEFAULT-import `playwright-core/index.js` (CJS) +
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `ACCOUNT` is script-scoped, stub with a BARE assignment. No hot-reload. Headless→staging TLS is blocked: drive LOCAL.

## 07-26/27 — PLANS + checkout sheet, and the ONE sheet recipe (LIVE on staging, NOT promoted)
- Every slide-up renders from ONE recipe; `scripts/sheet-recipe-audit.mjs` must print 1. Run it before
  shipping any new sheet. Plans/PAYG keepers, the dock, the Stripe warm-up and the real-touch lesson
  (`page.touchscreen.tap`, never `el.click()`) are all in git @4f6c4a6 and the 07-26/27 commits.
- Autofocus in a sheet SCROLLS the document and strands the sheet: all focus calls use `preventScroll:true`.

## 07-28 — ADMIN sheet glass FIXED (LIVE @2ca41b5). Full story: `docs/tasks/admin-glass-nudge.md`.
- **Cause: a closed `.sheet` never left the bottom edge** (position:fixed, bottom:0, just translated off).
  A fixed element there sits in the UI layer iOS never ghosts. Site does `.overlay{display:none}`; Admin
  now hides its sheet on close. Also fixed on the way: `pokeChrome` was never called AND was re-stamping
  the root colour (the poison); `.sh-body` spacer 70→240px so last rows clear the toolbar.
- **The move that found it: snapshot the whole page before open vs after close and DIFF it.** One thing
  differed. Two ships were wasted theorising about the glass first. `qa-admin-glass.mjs` 10→19 checks.

## Lessons that stay true
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket reproduced the exact mess it fixed.
- A bug that SURVIVES closing the sheet is leftover STATE. Diff the page before/after, do not theorise.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.

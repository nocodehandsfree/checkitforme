# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## 08-06 — CHECK STATUS: ONE settle per check, so the screen never changes its answer (ON STAGING)
- **Three things end a check here** (the bridge's `ended` message, the live socket closing, the POLL
  seeing `live:false`) and each called `finalizeLive`. Every run pulled the verdict on its own clock
  and painted its own fetch, so two runs = two paints and the owner saw "Check cancelled" for a second,
  then "Couldn't tell". The first caller now OWNS the settle; the rest join it and paint nothing.
- **Stop and hang up is the only thing that may take the seat** (a cancel is never a verdict, 07-24).
  A settle in flight stands down: paints nothing, asks the server for NOTHING. That is money, measured
  08-06: one read of `/pub/result` on a cancelled check flipped its record from `user_cancelled` to
  `completed`/`in_stock` (check 300), the billing condition.
- **A CANCEL BEFORE STAFF PICK UP HAS NO CONVERSATION** (Echo 08-06: no charge, nothing recorded). With
  no id to settle, a settle in flight hunted one for 3s then painted "Nobody answered" over the cancel
  screen, so that step stands down too and the press marks the cancel ASKED before the server is asked.
  A refusal (Staff already picked up) clears the flag AND the seat and re-runs the settle.
- **THE SANDBOX WAS LYING ABOUT THE LIVE SOCKET.** `robot-check.mjs`'s pipe speaks http, so the page's
  `wss://` socket NEVER connects here: no lines, no audio, no `ended` (one of the three finalizers). A
  TLS pipe relaying it frame for frame, TEXT KEPT AS TEXT, makes this machine behave like his phone.

## 08-06 — ACTIVITY (shipped and driven; the full story is in `docs/STATE.md`)
- A bar tap ALWAYS picks that day (only a week arrow clears `ACT_DAY`) and the list under the counts
  follows it. A tile hand-built outside a `.store` row needs `.stile` or nothing sizes it.

## 08-01 — LOGOS: the size rule lives on the SERVER; one tile; the wall is the record (staging)
- **`logoPct` on every store row is the whole idea** — the tile is square, so the width as a PERCENT
  falls out of the artwork alone, at 46px AND at 190px. Both browser-side copies are DELETED. The
  repair sweep is REPORT ONLY until `logo_repair_apply`="1", and `chainLogoInfo` is DB-first (07-31).

## 07-30 — CHECK STATUS: bottom clear on every screen + verdict at hang up (PRs #100 #101, staging)
- The pending render is its OWN screen (`showResult` drops `lview`) and `renderLiveMsg` follows the
  NEWEST LINE. **DO NOT pad the page to force a scroll** (reverted, `qa-tint-lock` 14b refuses it), and
  **a comp that leaves the homepage showing is a LIE:** the real view hides `#builder`, adds `lview`.

## Verify recipe that works (07-26, refined 08-06)
Pull the staging env from Railway, then `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`
(it will NOT boot without the env). CONSUMER = `/r`; ADMIN needs the admin HOST: launch Chromium with
`--host-resolver-rules=MAP admin.checkitforme.com 127.0.0.1` (a Host header breaks navigation). Chromium
cannot open staging directly, so relay through a local pipe.

## Lessons that stay true
- `sheet-recipe-audit.mjs` must print 1 before a new sheet ships. Real touch is `page.touchscreen.tap`,
  never `el.click()`; sheet focus uses `preventScroll:true` (07-26/27, @4f6c4a6).
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. A bug that SURVIVES closing a sheet is leftover STATE: diff the page.
- 'in_stock' substring-matches 'not_in_stock': match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head. **What the site SERVES beats what the repo holds** — fetch the live URL and diff the bytes.

## HANDOFF 08-06 — this chat closed at 22MB. Everything below is UNBUILT.
- **NEXT: `docs/tasks/site-auto-checks.md`** (four screens + the Zones rename + the comp-account bug).
  Only the LIST comp is approved; the report's picture is rejected twice, and the owner named why on
  08-06: a ring reads as progress toward a finish line and an auto-check runs forever. His words, the
  pictures and the render scripts: `docs/specs/auto-checks/README.md`. Sharpen them with him FIRST.
- The bug list is `docs/tasks/go-live-site-audit.md`. Still open: prod has never sent one email (the
  confirm-your-email step) · prod misses `ELEVENLABS_MIDCALL_AGENT_ID` + four settings · two engine
  switches differ prod vs staging · no real auto-check watched end to end · the alerts row switch
  wraps on a long store name · copy-doc location reconcile · Restock SMS waits on A2P.
  **PM: promote wanted — the code half of the logo system is staging-only.** (Admin IS shipped and safe.)

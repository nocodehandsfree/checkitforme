# The ops dashboard — build it on real checks

**System:** admin
**Status:** active — THE next admin build
**Contract:** `docs/specs/admin-ops-dashboard/CONTRACT.md` (read it whole; it is short)

**What:** one screen that answers, for every real check: what happened · why · what it cost us ·
could we have done it better. High-level number on top, drill down from there. Tucked into the
pages that already exist. No new page, no new domain (LAW 4).

**Where the pieces already are** (LAW 1 — snap onto these, build nothing parallel)
- `src/calls/events.ts` — the receipt, pure, sixteen event kinds and NOT ONE MORE. A seventeenth
  silently falls off the dashboard.
- `src/calls/cost.ts` — the measured rates. Never retype a rate into a page. `GET /api/admin/call-rates`
  serves them so a page cannot drift from the engine.
- `src/calls/receipt-store.ts` — the only file in the chain that touches the database. It already
  stamps every finished check with lane, seconds, and cents, and writes the timeline to `call_events`.
- `GET /api/admin/receipt/:room` — one finished check, timeline and all.
- `#calc` in `public/app.html` — forecasting forwards only, reads real rates.

**So contract steps 0 and 1 are DONE.** Start at step 2.

**Done when**
1. `#dash` shows the one number: what a check costs us, live from finished checks, not a model.
2. Tap it and drill into: outcome · which route it took · Charlie listening vs talking · tries per
   answer. Each drill reads the stamped columns, never replays a timeline.
3. A bad check is explainable from its own sheet without opening a log — the replay sheet renders
   the sixteen kinds off `/api/admin/receipt/:room`.
4. Zero backfill. Old numbers are wrong and stay out (owner, 07-26).
5. Store + retailer explorers, then the review queue, in that order — each only after a few days of
   clean checks exist to fill it.
6. `bash scripts/verify-live.sh` output pasted here before this file says done.

**Two mistakes already made on this system — do not repeat**
- I hid the Store and Data settings off the chains page claiming they lived under Stores. They do
  NOT. Mute, type, rating and the bulk toggles exist only there. CHECK BEFORE YOU CUT ANYTHING.
- I deleted the captured menu as clutter. It is the most valuable thing on the page.

**Open and unfixed:** the iOS bottom tint on Admin. See the red block in
`docs/team/admin/checkpoint.md`. The owner's lead, never followed: the consumer site does the tint
correctly using the same settings, so diff its chrome CSS against `public/app.html`.

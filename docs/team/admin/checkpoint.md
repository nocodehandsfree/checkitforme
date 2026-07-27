# ADMIN — checkpoint (current state)

> System: the one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via
> `bash scripts/ship-admin.sh` (never waits on a promote); server halves ride the promote train.
> Charter + standing rules: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## 2026-07-27 late — Admin calls write a receipt + ONE mapping button (SHIPPED @67ab8cf)
- ECHO'S GAP, exact: website checks run service.ts + the bridge, which open a receipt. EVERY Admin button
  runs `navigator.ts`, which emitted NOTHING. Fixed: navigator opens a receipt at dial and emits the whole
  timeline; `navSync()` mirrors steps in ONE place, `navStep` is wrapped so no branch exits unrecorded.
  Tapedeck's rehearsal too. NO `call_results` row on purpose (a mapping call is not a customer's check and
  must stay out of the customer numbers) — seconds + cost ride the timeline as a new `summary` event.
  `GET /api/admin/receipt/:room`; run rows carry `navId` (= the room) + `why`.
- 🔴 PM: PROMOTE WANTED. The receipt code is `src/` (staging at push, prod only on a promote) and Admin
  writes always hit prod, so Admin calls do not record until then.
- Owner: ONE mapping button. Re-map runs the FULL mapper now (hear the menu, reach a person, shave
  seconds until it cannot improve); one-shot `trDocument` stays for the single store-call button.
  `askSheet()` replaces `confirm()` (unstylable; the opening tap left the tooltip hanging behind it) —
  `closeSheet` + the swipe path fire `sheetclosed` so a dismissal reads as "no". Info dot became one gray
  line. Cut "Stores mapped by rating"; ALL CHAINS moved to the page's top right.
- Drove it locally on the 131 real chains: one button, sheet right, Cancel leaves no sheet and no tooltip,
  receipt renders 2.8¢ / 71s / 62s over 7 steps. NOT verified: no real call placed, no browser on the Admin.

## 2026-07-27 — Chains rebuilt: the phone menu IS the page (comp 2f, shipped @9f51aa4)
- ONE screen: picking a chain REPLACES the list · three vitals (cost per check · to a person · what the
  menu costs) · the route as a STEP LADDER reusing the call sheet's timeline (comp 1d) · the rest in
  `.peek` rows. `chainCostCents`/`chainMenuCents`/`chainSteps`/`chainRung` + `.mladder`. Cost runs through
  the Calc page's `calcCompute`. Ladder reads `navRecipe` then `dtmfShortcut`; list rows read "Bravo 41s".
- ⚠️ MONEY BUG FIXED: `CALC_MEASURED.creditsPerMinute` 723 was 15% high; measured 630. Drove all 131 real
  chains: CVS 6.1¢ / 1.4¢ menu / 19s ringing after the menu · Walgreens 4.7¢ pressing 0 four times · Ross
  "Picks up directly". Matches COST_MODEL.md.
- PM: `qa-design` FAILS on `public/checkit.html` (#34343E/#292930, buy dock) from the plans-sheet merge,
  NOT Admin. Frozen consumer file, needs an owner-named unlock.

## 2026-07-26 — Ops dashboard contract (docs/specs/admin-ops-dashboard/CONTRACT.md)
- Owner settled: no conversation audio · no new nav · hero is ONE number, what a check costs · CLEAN
  SLATE, no backfill. Screens beyond Chains ON HOLD until real checks exist. THE WORD IS CHECK.

## Shipped earlier (detail in git; only what a future session would trip on)
- 🔴 **ship-admin's override is NOT git.** Ship from a branch never merged to `staging` and the next ship
  from staging WIPES it (f96c161 did). ALWAYS merge to staging first; `--status` shows the live override
  commit, and if it is not an ancestor of staging the Admin is on borrowed time. Full story in GOTCHAS.
- Logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (never a name guess);
  `w` picks draw size, split at ~1.48 aspect, set in the LIVE `chains` table (DB beats `_meta.json`).
- `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS go to prod** (so an Admin action runs
  prod code). 24 bigger reworks left in `copy-icon-audit.md` MANUAL.
- **OPEN owner decision, NOT built:** hide `sim_` poll rows from Feedback?

## Reference (read before touching)
- **NEVER invent copy, grep + reuse.** ⚠️ The Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (site lane owns wiring it).
- **Alerts** (src/alerts.ts + calls/notify.ts): events in `alerts_json`, bilingual, confirm-gate + HMAC
  unsubscribe, FROM noreply@. Email colors LOCKED. Sheet-glass LOCKED (`qa-admin-glass`, 11 invariants).
  POST-PROMOTE TODO: re-set the owner's email on PROD.
- **Design bar + KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`): hero = ONE number + honest spark;
  `.peek`; ONE sheet openSheet/closeSheet/`askSheet` (NEVER the browser's `confirm()`); carved inputs;
  `.k-range`/hero/wells/pills; `.k-eyebrow`/title/sub/note; `logoTile` for ANY store row; `.mladder` for a
  step ladder. RENDER the comp board first (`scripts/render-comps.ts`), never read it as text.
- Queue in docs/tasks/INDEX.md (22 page-cleanups + 18 audit findings). Owner asks: store LOGOS on the site
  alerts view · premium toggle matrix in Plans (backend done, UI missing) · per-customer account view.

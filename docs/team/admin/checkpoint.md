# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-07-27 — Chains: confidence + the waiting route + real versions (SHIPPED @1716552)
- `MAPG` = `/api/admin/map/graph`, loaded once with the chain list. Menu header reads `v1 · observed
  multiple times`; list rows carry the label after the route. Three colours (`confColor`): proved green,
  needs review amber, unknown quiet. `renderPendingRoute` puts a PROPOSED version directly ABOVE the menu
  it would replace (seconds saved + evidence + Use it / Keep the old one). Menu versions is real
  (`renderMapVersions`); "Needs a look" shows only when `openUnknowns > 0`.
- approve/reject/unknown are WRITES so they always hit prod (`mapWriteErr` explains a 404 in plain
  words). GREETING rung stopped printing `phoneTreeDefault` (OUR instruction to the caller, so the
  ladder quoted the store saying something it never said): reads `navRecipe.menuPrompts[0]`, blank
  otherwise, and no chain has menuPrompts yet. Drove it on staging's real graph (130 rows) + CVS's real
  versions, injecting a proposed route since nothing has `proposed > 0` in real data.
## 2026-07-27 — Admin calls write a receipt + ONE mapping button (@67ab8cf)
- ECHO'S GAP: website checks run service.ts + the bridge, which open a receipt. Admin buttons run
  `navigator.ts`, which emitted NOTHING. Fixed: navigator opens a receipt at dial; `navSync()` mirrors
  steps in ONE place and `navStep` is wrapped so no branch exits unrecorded. Tapedeck's rehearsal too.
  NO `call_results` row on purpose (a mapping call is not a check): seconds + cost ride the LAST event's
  detail. `GET /api/admin/receipt/:room`; run rows carry `navId` (= the room) + `why`. ONE mapping
  button now: Re-map runs the FULL mapper (`trDocument` stays for the store-call button). `askSheet()`
  replaces `confirm()`; `closeSheet` + the swipe fire `sheetclosed` so a dismissal reads as "no".
  NOT verified: no real call was ever placed from any of this.
## 2026-07-27 — Chains rebuilt: the phone menu IS the page (comp 2f, @9f51aa4)
- ONE screen: picking a chain REPLACES the list · three vitals · the route as a STEP LADDER reusing the
  call sheet's timeline (comp 1d) · the rest in `.peek` rows. `chainCostCents`/`chainMenuCents`/
  `chainSteps`/`chainRung` + `.mladder`, cost through `calcCompute`. CVS reads 6.6¢ / 1.4¢ menu.
- 🔴 PROMOTED 07-27 (`55badd8`): main was an UNRELATED history (staging re-rooted at the rebuild) so a
  merge was impossible; main's tree was SET to staging's, verified identical, nothing runtime dropped.
  Any future promote hits the same wall. `qa-design` still fails on frozen `public/checkit.html`.

## PARKED 07-27, owner will say when to resume — do NOT start these unasked
- Waiting on Echo's live-call runtime + Mapper's submission. THEN: (1) wire the Search store-call
  button to a receipt (`/api/call-now` falls to `triggerCall`, the old path, whenever policy flag
  `cheapBridgeAll` is off, its default), (2) the ops dashboard itself.
- Chains "cost per check" is still a MODEL (`calcCompute` over lane + navSeconds + 20s talk). Switch it
  to the measured average off real receipts once checks exist. Replay needs three more things the new
  runtime will emit: hold/transfer, Charlie's segments, which brain ran.

## Reference + traps (detail in git; only what a future session would trip on)
- Ops dashboard contract: `docs/specs/admin-ops-dashboard/CONTRACT.md`. Owner: no conversation audio ·
  no new nav · hero is ONE number, what a check costs · CLEAN SLATE, no backfill. THE WORD IS CHECK.
- 🔴 **ship-admin's override is NOT git.** Ship from a branch never merged to `staging` and the next ship
  from staging WIPES it (f96c161 did). ALWAYS merge to staging first; `--status` shows the live override
  commit, and if it is not an ancestor of staging the Admin is on borrowed time. Full story in GOTCHAS.
- Logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (never a name guess);
  `w` picks draw size, split at ~1.48 aspect, set in the LIVE `chains` table (DB beats `_meta.json`).
  `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS go to prod.** 24 bigger reworks left
  in `copy-icon-audit.md` MANUAL. **OPEN owner decision:** hide `sim_` poll rows from Feedback?
- **NEVER invent copy, grep + reuse.** ⚠️ The Alerts editor shipped but the SITE still reads hardcoded
  share/referral/zones copy (site lane owns it). **Alerts** (src/alerts.ts + calls/notify.ts): events in
  `alerts_json`, bilingual, confirm-gate + HMAC unsubscribe, FROM noreply@. Email colors + sheet-glass
  LOCKED (`qa-admin-glass`, 11 invariants). TODO now prod is live: re-set the owner's email on PROD.
- **Design bar + KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`): hero = ONE number + honest spark;
  `.peek`; ONE sheet openSheet/closeSheet/`askSheet` (NEVER the browser's `confirm()`); carved inputs;
  `.k-range`/hero/wells/pills; `.k-eyebrow`/title/sub/note; `logoTile` for ANY store row; `.mladder` for a
  step ladder. RENDER the comp board first (`scripts/render-comps.ts`), never read it as text.
- Queue in docs/tasks/INDEX.md (22 page-cleanups + 18 audit findings). Owner asks: store LOGOS on the site
  alerts view · premium toggle matrix in Plans (backend done, UI missing) · per-customer account view.

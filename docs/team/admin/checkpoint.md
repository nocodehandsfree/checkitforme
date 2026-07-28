# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 🔴 07-28 OPEN, NOT FIXED — the iOS bottom tint on Admin
- Owner: the bottom Safari bar reads OPAQUE on admin.checkitforme.com instead of the translucent
  glass, and a scroll line shows. **I could not reproduce it (no iOS here) and I did not find it.**
  What I checked: `qa-tint-lock` 15/15, `qa-admin-glass` 11/11, and a diff of EVERY commit touching
  `public/app.html` since 9f51aa4 for overflow / height / position / scrollbar / safe-area / any
  page-bottom fill. The chrome CSS is unchanged. Cause unknown. Needs a real phone.
- Removed the "How a call flows" card (asked twice). It was the LAST element on the chains list, so
  it was also what iOS sampled at the bottom edge. That may or may not have been it.

## 2026-07-28 — Chains page rewritten twice, then put through the copy guide
- SHAPE: recipe on TOP (short, what we run, with the MAPPER'S OWN trust label — "Verified" is him
  saying he has it; never invent a second scale). Behind it four sheets: **Menu** (every line the
  store plays with our replies on one timeline, STORE / WE / STAFF, gap to the next), **Calls**
  (every round, newest first, so convergence is readable), **Versions** (Live / Waiting for you /
  Retired / Set aside, nothing ever deleted), **Review** (only when flagged). Then **Settings**.
- 🔴 TWO MISTAKES I MADE, do not repeat: (1) I hid Store + Data settings claiming they were editable
  under Stores. They are NOT — mute, type, rating and the bulk store toggles exist ONLY here. CHECK
  BEFORE YOU CUT. (2) I deleted the captured menu as "engineering exhaust". It is the single most
  valuable thing on the page.
- COPY: never print the mapper's `summary`, `why` or unknown `prompt` raw. It is engineer shorthand
  and it carries the dashes the guide bans. `routeWords()` says the route in our words, `plainText()`
  strips a dash to a full stop, `UNKNOWN_WHAT` translates his kinds. Sheet subtitles all cut.
  Counts read "All 7,523" / "None" / "12 of 7,523", never a database fraction.

## 2026-07-27 — Admin calls write a receipt (@67ab8cf) + the Chains rebuild (comp 2f, @9f51aa4)
- Website checks open a receipt via service.ts + the bridge; every Admin button ran `navigator.ts`
  which emitted NOTHING. Navigator now opens a receipt at dial, `navSync()` mirrors steps in ONE
  place, `navStep` is wrapped so no branch exits unrecorded. Tapedeck's rehearsal too. NO
  `call_results` row (a mapping call is not a check): seconds + cost ride the LAST event's detail.
  `GET /api/admin/receipt/:room`; run rows carry `navId` + `why`. ONE mapping button; `askSheet()`
  replaced `confirm()`. NOT verified: no real call was ever placed from any of it.
- Chain page vitals + `.mladder` + cost through the Calc page's `calcCompute`. MONEY: 723 credits a
  minute is the measured blended rate and `src/calls/cost.ts` owns it; a 630 reading was rejected
  (it only holds once the brain runs on our own account, which is not built).
- PROMOTED 07-27 (`55badd8`): main was an UNRELATED history, so a merge is impossible; main's tree
  was SET to staging's. **Any future promote hits the same wall.**
## Reference + traps (detail in git; only what a future session would trip on)
- Ops dashboard contract: `docs/specs/admin-ops-dashboard/CONTRACT.md`. No conversation audio · no new
  nav · hero is ONE number, what a check costs · CLEAN SLATE, no backfill. THE WORD IS CHECK.
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

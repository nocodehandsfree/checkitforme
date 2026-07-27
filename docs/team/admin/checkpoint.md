# ADMIN — checkpoint (current state)

> System: the one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via
> `bash scripts/ship-admin.sh` (never waits on a promote); server halves ride the promote train.
> Charter + standing rules: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## 2026-07-27 — Chains rebuilt: the phone menu IS the page (comp 2f, SHIPPED to THE Admin @9f51aa4)
- Was four cards open at once, ~4 phone screens, menu dead last and thinnest. Now ONE screen: picking a
  chain REPLACES the list (`ALL CHAINS` walks back) · three vitals (cost per check · to a person · what
  the menu costs) · the learned route as a STEP LADDER reusing the call sheet's timeline (comp 1d) ·
  Store settings / Store data / Call settings / Menu versions / Mapping calls folded into `.peek` rows.
  `chainCostCents` / `chainMenuCents` / `chainSteps` / `chainRung` + `.mladder`. Cost runs through the
  Calc page's own `calcCompute`, so the forecast and this page can never disagree.
- Ladder reads `navRecipe` first, then `dtmfShortcut`: works on TODAY's rows, richer when the mapper
  writes real steps. Chain LIST rows read "Bravo 41s" instead of the word "mapped". Menu versions is a
  deliberate stub until the mapper writes versions.
- ⚠️ FIXED A MONEY BUG: `CALC_MEASURED.creditsPerMinute` was 723, 15% high. Measured is 630 (924 credits
  / 88s of known calls, report-cost-architecture-2026-07-25.md). Every Calc number moved.
- DROVE IT against all 131 REAL chain rows pulled off the live Admin: CVS 6.1¢ / 1.4¢ menu / 19s ringing
  after the menu ends · Walgreens 4.7¢ pressing 0 four times · Ross "Picks up directly". Matches
  COST_MODEL.md. tsc + qa-design clean. NOT checked: this box's browser cannot reach the internet, so
  nothing was clicked on the real admin.checkitforme.com and chain LOGOS never loaded (external URLs).
- PM: `qa-design` FAILS on `public/checkit.html` (#34343E/#292930, buy dock) from the plans-sheet merge,
  NOT from Admin. Frozen consumer file, needs an owner-named unlock.

## 2026-07-26 — Ops dashboard contract, awaiting the data (docs/specs/admin-ops-dashboard/CONTRACT.md)
- Owner settled: no conversation audio (menu recordings only, text transcript) · tucked into existing
  pages, no new nav · hero is ONE number, what a check costs · CLEAN SLATE, no backfill (old rows are
  false because Charlie listened when he should not have). Screens beyond Chains stay ON HOLD until real
  checks exist. §8 is the recording shape handed to the calling engine (per-check lane, the seconds
  split, billed minutes, map version, retry chain, engine build, `call_events` with a CLOSED kind list).
- THE WORD IS CHECK, never "call", anywhere the owner reads it (owner, twice).

## Shipped earlier (detail in git; keep only what a future session would trip on)
- 🔴 **ship-admin's override is NOT git.** Ship from a branch never merged to `staging` and the next ship
  from staging WIPES it (f96c161 did). ALWAYS merge to staging first; `--status` shows the live override
  commit, and if it is not an ancestor of staging the Admin is on borrowed time. Full story in GOTCHAS.
- 07-24 logos: `topStores` carries chainId/logoUrl/logoWide/logoDark via `chainLogoInfo` (through
  chainId, NEVER a name guess); rows call `logoTile`; `w` picks draw size, split at ~1.48 aspect, set in
  the LIVE `chains` table (DB beats `_meta.json`). Server half still awaits a promote.
- 07-23 design system: additive `.ds-*` scale 28/22/15/14/12, Lucide via `dsIco()`, hidden `/#preview`
  master, header Live/Staging switch (`api()` GETs staging when CALL_SRC==='staging'; writes ALWAYS
  prod). 24 bigger reworks remain in `copy-icon-audit.md` MANUAL.
- 07-22 support: transcripts everywhere reuse the site's `.ctlv2-bub` via `bubbles()`, one transcript
  look, never a second UI. **OPEN owner decision, NOT built:** hide `sim_` poll rows from Feedback?

## Reference (read before touching)
- **NEVER invent copy, grep + reuse** (owner caught invented defaults twice). ⚠️ The Alerts editor
  shipped but the SITE still reads hardcoded share/referral/zones copy (site lane owns wiring it).
- **Alerts** (src/alerts.ts + calls/notify.ts): events in `alerts_json`, bilingual via accounts.language,
  confirm-gate + HMAC unsubscribe, FROM noreply@. Email colors LOCKED. Sheet-glass LOCKED
  (`qa-admin-glass`, 11 invariants). POST-PROMOTE TODO: re-set the owner's email on PROD.
- **Design bar + KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`): hero = ONE number/word + honest
  spark; `.peek`; ONE sheet openSheet/closeSheet; carved inputs; `.k-range`/hero/wells/pills;
  `.k-eyebrow`/title/sub/note; `logoTile` for ANY store row; `.mladder` for a step ladder. RENDER the
  comp board before building (`scripts/render-comps.ts`), never read it as text.

## Open (queue in docs/tasks/INDEX.md: 22 page-cleanups + 18 audit findings)
- Owner asks: store LOGOS on the site alerts view (site lane) · premium toggle matrix in Plans (backend
  done, UI missing) · per-customer account view (`docs/specs/admin-user-view.md`).

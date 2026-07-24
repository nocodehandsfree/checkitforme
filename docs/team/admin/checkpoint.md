# ADMIN — checkpoint (current state)

> System: the one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via
> `bash scripts/ship-admin.sh` (never waits on a promote); server halves ride the promote train.
> Charter + standing rules: `handoff.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## 2026-07-24 — Restock logos + call rows show the status icon only + four logo shapes
- Restock "By store" drew invented 2-letter monograms (row hand-rolled initials AND restock-intel sent no
  logo fields). `topStores` now carries chainId/storeType/logoUrl/logoWide/logoDark via chainLogoInfo
  (through chainId, never a name guess) and the row calls `logoTile`. ⚠️ SERVER half is staging-only until
  a promote; prod topStores is empty today anyway. Page half shipped to THE Admin.
- Calls list: status is the ICON ALONE, never the name (owner: repeated "Nobody answered" read as a wall).
  Heard restock day keeps truck + day. Name rides `title`/`aria-label` + the call sheet.
- LOGO SHAPES: `w` picks the draw size (wide 92% of the tile, square 78%). Measured the TRIMMED artwork of
  all 104 files: clean split at ~1.48, four outliers. Ross 2.58 / Micro Center 1.86 / Tokyo 1.81 were
  square so drew small → wide; Walmart 0.89 is taller than wide → square. Set in the LIVE `chains` table
  (DB beats `_meta.json` for any chain in it) + the file. Tom Thumb 1.49 was NOT flipped the way the old
  logo branch wanted (it sits wide-side, DB already square) — don't trust that branch's other flags.
- Drove it: THE Admin's served page against real staging rows. 7/7 real logos, logoless Big 5 gets the
  storefront icon not a monogram, call rows icon-only with the name in the tooltip.

## 2026-07-24 — RESTORED the Admin work a ship-admin overwrite dropped (switch + sweeps back live)
- 🔴 TRAP (full story in GOTCHAS): ship-admin's override is NOT git. The design system was shipped live
  off its branch, never merged to `staging`, so a later ship from staging (f96c161) wiped it. The
  calling-engine revert was innocent. ALWAYS merge to staging BEFORE ship-admin; `--status` shows the
  live override commit, and if it isn't an ancestor of staging the Admin is on borrowed time.
- Fixed by merging the branch into staging (2de7f24). Zero `src/` files touched, so voice was unaffected.

## 2026-07-23 — Admin design system TASK 1 (shipped; full detail in git + SPEC.md)
- `SPEC.md` = six-size type scale + 22-page verdicts. Task 1 was ADDITIVE `.ds-*` classes: type scale
  28/22/15/14/12 (nothing under 12px), one control set, Lucide via `dsIco()`, hidden `/#preview` master.
- Master Live/Staging switch in the header on EVERY page (clock removed), owner-blessed. `api()` routes
  GET to the staging service when CALL_SRC==='staging'; writes ALWAYS stay prod. Per-page src dropdowns
  retired (`srcPicker` returns ''). Chains/mapping page: `logoTile` not initials, `.slogo img` max-width %
  so wide wordmarks fit, store-type filter kept alongside mapped/unmapped, report by RATING.
- Copy/icon/spacing sweep waves 1-3: ~94 of 98 audit findings applied. REMAINING = 24 bigger reworks in
  the MANUAL section of `copy-icon-audit.md`. NAV icons stay (owner keeps the nav).

## 2026-07-22 — Support surface + call transcripts (SHIPPED + PROMOTED; detail in git)
- Support chats show the real first message + the account; Mark resolved / Reopen via
  `POST /api/support/chats/:id/status`. Transcripts everywhere reuse the site's `.ctlv2-bub` via
  `bubbles()` (CHECK AI green / STAFF gray). One transcript look, never a second UI.
- **OPEN, owner decision, NOT built:** hide simulated (`sim_`) poll rows from the Feedback queue. Yes/no?

## Reference (read before touching)
- **NEVER invent copy — grep + reuse** (owner caught invented defaults twice, 07-19). ⚠️ 07-19 Alerts
  editor shipped, but the SITE still reads hardcoded share/referral/zones copy (site lane owns wiring it).
- **Alerts** (src/alerts.ts + calls/notify.ts): events in `alerts_json`, bilingual via accounts.language,
  confirm-gate + HMAC unsubscribe, FROM noreply@. Email colors LOCKED. POST-PROMOTE TODO: re-set owner's
  email on PROD (`/api/admin/users/phone:+13106662331/email`).
- **07-17 Sheet-glass LOCKED** (`qa-admin-glass`: 11 invariants; any tint revert fails the ship).
- **Design bar (07-13) + KIT** (app.html <style>; comps `ADMIN_COMPS.dc.html`): hero = ONE number/word
  + honest spark; `.peek`; ONE sheet openSheet/closeSheet; carved inputs; report grammar `.k-range`/
  hero/wells/pills; `.k-eyebrow`/title/sub/note; `logoTile` for ANY store row. html bg #1D1D22.

## Open (the Admin cleanup + audit queue is in docs/tasks/INDEX.md)
- 22 page-cleanups (one per Admin page) + the 18 audit findings (wiring/comp/copy/cut) are queued.
- Owner open asks: store LOGOS on the site alerts view (site lane) · premium toggle matrix in Plans
  (backend done, UI missing) · per-customer account view (`docs/specs/admin-user-view.md`) · answer-first
  means ANSWER, do NOT build until told.

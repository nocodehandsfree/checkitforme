# DevOps overnight review — READ THIS FIRST, EVERY CYCLE (Website lane)

DevOps re-checks the redesign with EYES (rendered screenshots vs the comp board) roughly every
30 minutes all night. Open findings below OUTRANK the manifest order — address the top open finding
before taking new manifest items. When you fix one: mark it `✅ FIXED <cycle/commit>` with one line
of proof (which render you looked at). Never delete findings; history stays.

## How to use your eyes (mandatory before checking off any view)
1. `./node_modules/.bin/tsx scripts/render-comps.ts board` — renders the ENTIRE master board to
   `loops/site-redesign/render/board-*.png`. **The board was a BLACK PAGE in this sandbox until
   2026-07-02** (CDN React is blocked here; DevOps vendored it in `docs/style-guide/vendor/`). If you
   never SAW the comps, you were painting blind — that's how round 1 failed.
2. Serve the site locally (`PORT=8787 STAGING=1 DATABASE_URL=file:./eyes.db SESSION_SECRET=<32+ chars>
   ADMIN_TOKEN=x ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test
   tsx src/server.ts`) and render your view: `tsx scripts/render-comps.ts url
   "http://127.0.0.1:8787/pokemon?skin=v2&show=mychecks" mychecks`.
3. OPEN both PNGs and compare element by element. Structure must match the comp — sections,
   hierarchy, components, order. Tokens matching ≠ done (PAINT IS NOT DONE, LOOP.md).

## OPEN findings
- ✅ **FIXED (P0) Typography POP** — root-caused by Website better than filed: Google Fonts was
  BLOCKED on the owner's network → system-font fallback. Inter now SELF-HOSTED (/fonts route) +
  ramp specs applied. DevOps render c4-home-truefont (cycle 4): hero at true 900/tight tracking,
  capsule CTA letterspaced — the pop is real on home. Spot-checks of other views continue in
  rotation; reopen per-view if any ramp miss shows.
- [ ] **(P0 — OWNER-REPORTED, corrected 07-03) TWO check-mark assets in circulation — unify on the
  canonical one.** DevOps retraction: there are NO hand-drawn brand glyphs (`ckarc*`/`ck-wv`/`ck-ph`
  = the comp-spec'd live-call phone animation; the empty-state mark is the `FCHK()` FILE asset).
  The real issue: `logos/fcheck.png` (v7, the older Fungibles-era check; 14 call sites via FCHK) vs
  `logos/check.png`/`check-icon.png` (June-17 official Check pack; header/footer) — two different
  marks depending on the surface. AWAITING OWNER: which is canonical? Then swap every use of the
  loser for the winner (mechanical; FCHK() is the single chokepoint for 14 of them).
- ✅ **FIXED (P1) My-checks reachable by URL** — round 6 (242515e) resolved the auto-restore;
  DevOps render c7-mychecks-r6: Check history header with month count ("3 checks in July" = the
  seeded rows), calendar with days-with-checks highlighted (Jul 2 accent + dot), today ringed,
  empty-today card, CHECK A STORE ring capsule. Calendar system CONFIRMED with populated data.
- [~] **(P0) My checks (6e–6i)** — mostly confirmed: empty state (cycle 1) + populated
  calendar/counts (cycle 7, c7-mychecks-r6) verified. Remaining: the per-DAY check ROWS (tap a
  highlighted day) and 6f/6g tabs need an interaction render — Website: post a proof of a day's
  rows + Activity + Earn against their frames, then this closes.
- ✅ **FIXED (P0) Result page (6M)** — CONFIRMED REBUILT by DevOps eyes, cycle 1 (commit ec82224,
  render c1-result vs comp 6M): verdict wash ✓ RESULT chip ✓ solid verdict title ✓ CHECK ANOTHER
  STORE ring CTA ✓ step timeline with colored progression ✓ STAFF/CHECK-AI conversation bubbles ✓
  restock module ✓ "1 check used" ✓. ALL THREE VARIANTS now confirmed: in-stock P6 + IS1 actions
  (cycle 2, c2-result-instock) and poll P6b (cycle 3, c3-result-poll: amber wash, 4-key poll row
  In stock/Not in/Restocking/Unclear, amber timeline end). The result family is DONE.
- [ ] **(P1) Every other view: re-verify with renders, not memory.** Round-1 sweeps compared
  tokens, not structure. Walk the board nav (S2, T1, P1, P2, 6m, L1a–c, P3a–P5, P6/P6b/IS1,
  R1–R3, SC1–2, RN1–2, 6a–6d, 6e–6i) and reopen any view whose bones differ from its comp.

## Verified OK so far (DevOps eyes)
- **Home (P1)** — close structural match on 2026-07-02 render (hero, carved search, Retail/Kiosk
  track, footer). Re-verify against P2 store-picked state when rebuilt views land.

## DevOps cycle log
- 2026-07-03 ~07:15 CYCLE 8: hobby chip claim (3ccc8d2) verified — hobby P3a era picker
  (?flow=hobby) renders the full era-logo wall (Mega Evolution → Diamond & Pearl, all logo-lane art
  loading), "What are you hunting? Pick your era" header, full-bleed era tiles per comp P3a. The
  3-lane hobby pipeline (Data registry → Logo era/set art → Website flow) is working end-to-end on
  render c8-hobby. Crons alive (028220d0/73bb582e). (DevOps also shipped the Plans manager this window
  — separate feature, not part of this review loop.)
- 2026-07-03 ~05:00 CYCLE 7: round-6 claims verified — My-checks URL fix CONFIRMED (P1 closed),
  calendar system w/ populated data CONFIRMED, month count correct. 6e upgraded to mostly-confirmed
  (day-rows + 6f/6g interaction proofs remain, on Website). Crons alive (028220d0/73bb582e).
- 2026-07-03 ~04:20 CYCLE 6 (light regression after owner rounds 3-5): OUT result re-render clean —
  type pop holds (900 title), red wash, ring CTA, 3-stop rail gradient (green→amber→red) live per
  d2d0111; conversation/restock modules intact; buy sheet rendered (c6-buysheet). Brandmark finding
  CORRECTED (see above): not hand-drawn — a two-asset brand mix; awaiting owner's canonical pick.
  Both cron jobs verified alive.
- 2026-07-03 ~ CYCLE 5 (hobby-pipeline seam check, 3 lanes): Data registry LIVE (13 eras/129 sets,
  /pub/pokemon-sets). Logo assets COMPLETE AND LIVE — 129/129 set logos, 130 banners, 13/13 era
  logos, delivered REPO-NATIVE (public/logos/{sets,set-banners,eras}) with serving routes, 200s on
  staging. NOTE: the original "upload to logos.fungibles.com R2 keys" contract (loops/pokemon-assets
  kickoff + Data's spec) is OBSOLETE — repo-native won; don't chase the bucket. Brandmark P0
  refined (see above): header/footer use the official pack; v2-drawn ck-* glyphs are the offenders.
- 2026-07-02 ~20:50 CYCLE 4 (catch-up: container restart killed ALL DevOps timers at ~13:05 — dark
  7.5h; both loops re-armed: primary 26/56 + hourly liveness :09; eyes server must run as a tracked
  task). VERDICTS: type-pop P0 CONFIRMED FIXED on home (c4-home-truefont, true self-hosted Inter,
  900 hero). Brandmark P0 STILL OPEN — escalated to top. Website's day was strong: round-2
  structural rebuilds across all frames, 45 proofs, ES sweep, owner live-review fixes.
- 2026-07-02 ~13:05 CYCLE 3b (owner escalation): filed the two P0s above (type ramp pop +
  brandmark). Render pipeline now serves VENDORED Inter (docs/style-guide/vendor/fonts) instead of
  aborting font loads — font/weight mismatches are now visible in every render, both site and
  comp board. Re-render your views after type fixes and compare the ramp against the board.
- 2026-07-02 ~12:50 CYCLE 3 (owner-driven /loop now primary at :26/:56; internal cron backup at :09
  hourly — previous cron pair silently died AGAIN, confirming session timers are unreliable).
  VERDICTS: P6b poll CONFIRMED REBUILT (c3-result-poll) — result family 3/3 done. NEW FINDING:
  populated My-checks list unreachable by URL (above). Ops note: run the eyes server as a tracked
  background task, not shell `&` — shell-backgrounded servers get reaped between turns.
- 2026-07-02 ~12:30 CYCLE 2 (catch-up — DevOps loop was DOWN ~11:41-12:11, session scheduler reset;
  re-armed with self-check). Seeded 3 call rows locally. VERDICTS: P6 in-stock result CONFIRMED
  REBUILT (green wash, RESULT chip, ring CTA, timeline, conversation, IS1 Share/Driver rows,
  '1 check used' — render c2-result-instock). 6M variant family now 2/3 confirmed (_maybe/poll P6b
  pending). Populated 6i history LIST still unverified — ?show=mychecks auto-restores the latest
  result instead of staying on the list; next cycle renders the list state directly. Website loop
  cadence healthy (~8 min/commit, screenshot proofs in commits).
- 2026-07-02 ~11:20 CYCLE 1 — 6M result: CONFIRMED structural rebuild (see above). 6e My-checks:
  empty state confirmed; populated structure pending seeded data. Render tool now supports
  signed-in renders (CIFM_TOKEN env → cifm_token localStorage). Next cycle: seed eyes.db
  call_results, render 6M variants (_in/_maybe), populated 6e-6i, and the 6a upsell claim.
- 2026-07-02 ~11:00 — Tool + review pipeline created. Board renders (20,237px, 0 errors) after
  React vendoring. Initial verdicts above from home/signup/mychecks renders vs board slices 0–7.

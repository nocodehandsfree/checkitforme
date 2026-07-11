# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

## NOW — 9am-ET sweep ARMED, cap fix with Pops (2026-07-10 ~2am ET)
- **Trigger `trig_0176tgdJaj2QBXYCXW3Nuh5V` fires 9:00am ET today (13:00 UTC)** into the Mapper session
  and STARTS the run (real scheduled start, not the daytime gate). One-shot, auto-disables after firing.
- **Driver:** `docs/team/mapping/sweep-driver-20260710.mjs` (session branch, see below) — east→west
  waves (ET 9:00 / CT 10:00 / MT 11:00 / PT noon, ET clock), ONE chain at a time (start → poll
  mapper/state until locked/needs-review → next), slowest-first in open waves, 55-min chain timeout,
  hard stop 10:30pm ET. 39 targets = locked keypad/voice. **Skips navType:direct (33, already instant)
  and CVS (owner).** Engine gates (muted / no store line) trusted as-is.
- **CAP KILLED (owner order, pipeline per owner):** 12/day cap → 60 runaway guard + `mapper_daily_cap`
  setting override. Landed on **staging `6edefab`**; owner said do NOT self-promote — **Pops folds it
  into tonight's pinned promote batch** (note left top of docs/team/devops/checkpoint.md).
  **At 9am: verify prod /api/health commit contains 6edefab.** If not, sweep starts anyway (old 12-cap,
  wins still bank per-win via finalizeAndLock) and picks up the cap mid-day when Pops promotes.
- **Meijer(64) + Menards(65) re-map:** driver POSTs `mapper/target="customer service"` first, runs them
  first in their waves. Watch: verify-replay may re-lock the wrong desk — then manual re-map per #1 trap
  playbook. Both locked recipes reach the WRONG desk today.
- **Prod engine VERIFIED converging** (/api/health = d089c31 = main tip with binary-search mapper.ts).
  Drift-verify = the engine's verify phase, runs per chain automatically.
- **BEFORE-baseline committed:** `docs/team/mapping/baseline-2026-07-10-before.json` (session branch) —
  73 locked. Slowest keypad: Ralphs 126, Acme 112, Safeway 102, Costco 97, Menards 94, BJ's 90, Vons 87,
  Star Market 80, Meijer 75. Owed after run: after-snapshot + before→after report + phone summary.
- **Branch:** `claude/mapper-checkpoint-scheduling-tbtnps` (PR #3 → staging, draft) holds baseline +
  driver + reports. Cap fix + team notes went straight to staging (owner-directed).
- Admin API: `https://admin.checkitforme.com`, `x-admin-token` (fetch from Railway prod vars, never in
  files). `POST /api/admin/mapper/start {chainId}` · `GET .../mapper/state` ·
  `POST .../mapper/target {chainId,target}`. `trainer/list` heavy — `-m 100`.

## #1 TRAP (most important)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". ALL 8 chains once flagged
  "no operator" were callable once press-tested. NEVER call a chain dead from an auto-caller failure.
  Method: `POST trainer/document {chainId}` → read FULL `menuPrompts` (human option often LAST) →
  press-test (`reactivePress:{digit,max:2}` or `barge` + `confirm:true`) → `trainer/lock`.

## Other traps (not in git)
- STT garbles digits — press-test each candidate, don't trust the announced digit.
- confirm-mode `REDIRECT_RE` misreads "hold on"/"let me check" as a redirect → blocked legit locks
  (Kohl's, Wegmans; retry fixed). Worth fixing.
- nav false-fires "human" on recorded greetings ("thank you for calling…") ~8-11s in.

## Chain human-paths found (DTMF)
- TJX cluster (TJ Maxx/HomeGoods/Marshalls) = press 4 ~14-44s. Pick 'n Save = press 7 ~20s.
  Blain's F&F = press 2 ~57s. BJ's = press 3 (bakery) ~90s, no general operator.
  Burlington = press 1 (Eng) → press 8 — NOT a dead end (was wrongly flagged).

## PARTIAL / follow-up
- Office Depot(67), Publix(70): reachable, no clean single DTMF → left to live AI caller.
- Family Dollar(28): callable but store-INCONSISTENT — needs a known-good store from Data Dev.

## Owner rules / decisions
- Muted = never call. Kiosks ARE callable. Chips independent & combine.
- Don't invent tiers — `data/source/chain-scoring-2026-06/chain_scores_final.csv`.
- Never push code while a call is live (redeploy kills it). Done = demonstrated w/ evidence.
- Explicit owner naming required for prod pushes — Pops owns promote batches.

## State
- Board = 73 locked (33 direct / 39 keypad / 1 voice=CVS), all at OLD baseline speeds until the sweep.
- Recipes live in the prod DB, not git. Sweep armed 9am ET 2026-07-10; cap fix staged for Pops's promote.

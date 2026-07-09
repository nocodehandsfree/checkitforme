# Check - Mapping — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.
> Prune finished items (history lives in git commits).

## NOW — speed pass (the "other 50%")
- **Owner mandate (this session):** reaching a human is only half. The other half is reaching them
  **as fast as possible**, for EVERY store — press the digit / barge the word ("general" CVS-style) as
  EARLY as the IVR accepts, not after the whole menu. "Mapping engine must reflect this."
- **BUILT — converging optimizer** (`mapper.ts`): the optimize stage used to nibble one 5s cut per step
  and stop. Now each barge step **binary-searches the earliest second the IVR still accepts** the
  press/word (seed at midpoint of prev→this step, bisect until window ≤3s). Key correctness bit: a real
  early-accept shows up as a **time gain**; "reached but no gain" = press was DROPPED and the recovery
  brain saved it at the old time → treat as too-early, back off. Lock = **fastest proven**, not
  first-reached. DTMF + voice both. Commit **8b422db** (staging, pushed) / cherry-pick **eb2e2a9** (prod
  branch, NOT deployed).
- **BLOCKED on owner decision:** prod push was auto-gated (production deploy needs explicit OK). Explained
  to owner: Admin + consumer site + calling engine + recipe DB are the SAME production service — mapping
  in Admin writes the prod DB the consumer app reads. Two separate actions: (1) **RUN a pass = no deploy**
  (engine already live from #421) → only old 5s-nibble gains; (2) **ship the 1-file mapper upgrade = a
  prod deploy** (zero consumer UI touched) → full convergence. Awaiting: run-now vs deploy-then-run.
- **BEFORE snapshot captured** → `scratchpad/board_before.json` (73 locked). Slowest keypad (speed-pass
  targets): Ralphs 126s(181 CA), Acme 112, Safeway 102, Costco 97, Menards 94, BJ's 90, Vons 87(CA),
  Star Market 80, Meijer 75, Shaw's/Wegmans 73… Direct-ring chains already instant (Walmart 10, Kroger
  10, Dollar General 0) — skip. **Do NOT touch CVS** (owner). Owe owner a before→after speed table.
- **Timing:** daytime gate = 9am–8pm LOCAL; at session pause it was 18:43 PT / 21:43 ET → only west-coast
  stores still open. Plan: west-coast slowest-first tonight, then schedule tomorrow-AM east→west.
- Admin API: `https://admin.checkitforme.com`, header `x-admin-token: adm_e4f43d88c4b920740a41ee26a5253679`
  (still valid). Start a chain: `POST /api/admin/mapper/start {chainId}`; poll `GET .../mapper/state`.
  `trainer/list` is heavy (CF 524 on cold server — use `-m 100`).

## #1 TRAP (most important)
- Auto-nav (gemini-flash-lite) **0-hammers** when it can't parse an option → FALSE "no human path".
  **ALL 8 chains I once flagged "no operator" were callable once press-tested.** NEVER call a chain dead
  from an auto-caller failure. Method: `POST trainer/document {chainId}` → read the FULL menu
  (`menuPrompts`; greeting is long, human option often announced LAST) → identify associate/operator/CS
  option → press-test (`reactivePress:{digit,max:2}` or `barge` + `confirm:true`) → `trainer/lock`.

## Other traps (not in git)
- STT **garbles digits** — don't trust the announced digit, press-test each candidate.
- confirm-mode `REDIRECT_RE` misreads a clerk's "hold on"/"let me check" as a redirect → blocks a legit
  lock (Kohl's, Wegmans hit this; a retry fixed it). Worth fixing.
- nav false-fires "human" on a **recorded greeting** ("thank you for calling OfficeMax…") ~8-11s in.

## Chain human-paths found (DTMF)
- TJX cluster TJ Maxx/HomeGoods/Marshalls = **press 4** ~14-44s. Marshalls **un-muted** this session.
- Pick 'n Save = **press 7** ~20s. Blain's F&F = **press 2** ~57s. BJ's = press 3 (bakery) ~90s, no
  general operator. Burlington = **press 1 (Eng) → press 8** — NOT a dead end (was wrongly flagged).
- Meijer(64)/Menards(65) LOCKED but reach the **WRONG desk** — re-map now CS-targeting is live.

## PARTIAL / follow-up
- Office Depot(67), Publix(70): reachable, no clean single DTMF → left to live AI caller. Family Dollar(28):
  callable but store-INCONSISTENT — needs a known-good store from Data Dev.
- **Drift-verify sweep NOT done** on pre-existing locked chains (original mandate). Mapper `verify` phase
  does this — the speed pass's verify step doubles as the drift-check; fold them together.

## Owner rules / decisions
- **Muted = never call. Period** (uncallable). **Kiosks ARE callable.** Chips independent & combine.
- Don't invent tiers — `data/source/chain-scoring-2026-06/chain_scores_final.csv`. GameStop/TJX = tier 2.
- Mapping Operator touches code only when owner directs (this session: the speed-convergence build +
  promotion, by request). Done = demonstrated on staging w/ evidence; short testable contract before build;
  replies outcome-first bullets. **Never push code while a call is live** (redeploy kills it).

## State
- Board = **73 locked**. Recipes live in the **prod DB**, not git. Converging engine on staging; awaiting
  owner OK to deploy to prod + run the speed pass west→ (east tomorrow AM).

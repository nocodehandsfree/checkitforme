# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

## NOW — morning sweep ARMED (2026-07-10, 1:45am ET)
- **Trigger `trig_0176tgdJaj2QBXYCXW3Nuh5V` fires 9:00am ET today (13:00 UTC)** into the Mapper
  session and STARTS the run (a real scheduled start, not the daytime gate). One-shot; auto-disables
  after firing.
- **Driver committed:** `docs/team/mapping/sweep-driver-20260710.mjs` — east→west waves (ET 9:00,
  CT 10:00 ET, MT 11:00 ET, PT noon ET), ONE chain at a time (start → poll mapper/state until
  locked/needs-review → next), slowest-first within open waves, 55-min per-chain timeout, hard stop
  10:30pm ET. 39 targets = locked keypad/voice. **Skips navType:direct (33 chains, already instant)
  and CVS (owner).** Engine gates (muted / no store line / 12-call daily cap) trusted as-is.
- **Meijer(64) + Menards(65) re-map:** driver POSTs `mapper/target = "customer service"` first and
  runs them first in their waves. Watch: verify-replay could re-lock the wrong desk — if so, manual
  re-map per #1 trap playbook (document → read FULL menu → press-test → trainer/lock).
- **Prod VERIFIED running the converging engine** — /api/health (site + admin) = commit d089c31 =
  main HEAD, and main's mapper.ts has the binary-search convergence. Old "cherry-pick not deployed"
  note was stale (pre repo-migration). Drift-verify = the engine's verify phase, runs per chain.
- **BEFORE-baseline re-captured & committed** (old scratchpad one died in repo move):
  `docs/team/mapping/baseline-2026-07-10-before.json` — 73 locked. Slowest keypad: Ralphs 126,
  Acme 112, Safeway 102, Costco 97, Menards 94, BJ's 90, Vons 87, Star Market 80, Meijer 75.
- **Owed after the run:** after-snapshot + before→after time-to-human report → commit + phone-format
  owner summary (seconds cut, desk-fix outcomes, needs-review, not-reached).
- Branch: `claude/mapper-checkpoint-scheduling-tbtnps` (→ staging when done). 12 calls/chain/day cap
  means ~39 chains won't all finish in one day — report honestly, rest roll to tomorrow.
- Admin API: `https://admin.checkitforme.com`, header `x-admin-token` (fetch from Railway prod vars,
  never in files). Start: `POST /api/admin/mapper/start {chainId}`; poll `GET .../mapper/state`;
  desk: `POST .../mapper/target {chainId,target}`. `trainer/list` heavy — use `-m 100`.

## #1 TRAP (most important)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". ALL 8 chains once flagged
  "no operator" were callable once press-tested. NEVER call a chain dead from an auto-caller failure.
  Method: `POST trainer/document {chainId}` → read FULL `menuPrompts` (human option often LAST) →
  press-test (`reactivePress:{digit,max:2}` or `barge` + `confirm:true`) → `trainer/lock`.

## Other traps (not in git)
- STT garbles digits — press-test each candidate, don't trust the announced digit.
- confirm-mode `REDIRECT_RE` misreads "hold on"/"let me check" as a redirect → blocks a legit lock
  (Kohl's, Wegmans; retry fixed). Worth fixing.
- nav false-fires "human" on recorded greetings ("thank you for calling…") ~8-11s in.

## PARTIAL / follow-up
- Office Depot(67), Publix(70): reachable, no clean single DTMF → left to live AI caller.
- Family Dollar(28): callable but store-INCONSISTENT — needs a known-good store from Data Dev.

## Owner rules / decisions
- Muted = never call. Kiosks ARE callable. Chips independent & combine.
- Don't invent tiers — `data/source/chain-scoring-2026-06/chain_scores_final.csv`.
- Never push code while a call is live (redeploy kills it). Done = demonstrated w/ evidence.

## State
- Board = 73 locked (33 direct, 39 keypad, 1 voice/CVS). Recipes live in the prod DB, not git.
- Converging engine LIVE on prod (d089c31). Sweep armed for 9am ET 2026-07-10.

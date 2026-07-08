# Check - Mapping — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## Carry-over (2026-07-07 — for the new repo)
*(80-line cap waived for this section. Written because chat memory does NOT survive the repo move.)*

**Memory starts at:** my visible memory of this chat starts at the initial **Mapping Operator briefing**
("You're the Mapping Operator for Check It For Me…" — biggest-first, tier 5→4→3 stop-at-3, East-Coast-first,
pick a first store then run autonomously). It was one very long session; I don't believe a compaction summary
was injected, so I can see the whole arc, but the earliest specifics are the least certain.

**#1 TRAP (most important):** the auto-nav (gemini-flash-lite) **0-hammers** when it can't parse an option →
this produces FALSE "no human path / info-only" conclusions. **ALL 8 chains I flagged "no operator" were
callable once press-tested.** NEVER declare a chain a dead end from an auto-caller failure. Reliable method:
1) `POST /api/admin/trainer/document {chainId}` and read the FULL menu (all IVR steps + `menuPrompts`) — the
greeting is long and the human option is often announced LAST (Burlington's "press 8" came AFTER an "invalid
entry, goodbye" that cut my earlier captures short); listen through the whole loop, sometimes twice.
2) identify the associate/operator/CS option. 3) press-test it: `reactivePress:{digit:N,max:2}` or
`barge:{plan:[{action:"press",value:"N",at:sec}]}` with `confirm:true`. 4) lock via
`POST /api/admin/trainer/lock {chainId,recipe,confidence}`.

**Other traps (written nowhere):**
- STT **garbles the digits** ("press 2 for associate" but 2 gave directions). Don't trust the announced/parsed
  digit — press-test each candidate.
- confirm-mode `REDIRECT_RE` mis-reads a real clerk's "hold on" / "let me check" as a redirect → blocks a legit
  lock (Kohl's, Wegmans hit `review` this way; a retry converted them). Worth fixing.
- nav false-fires "human" on a **recorded greeting** ("Hello, thank you for calling OfficeMax…") ~8-11s in — a
  recording, not a person.

**Chain human-paths found this session (DTMF — for dtmfShortcut/answerPath):**
- TJX cluster TJ Maxx(79)/HomeGoods(7)/Marshalls(21) = **press 4** (store associate) ~14-44s. Marshalls was
  **un-muted** this session (`PATCH /api/chains/21 {muted:false}`).
- Pick 'n Save(69) = **press 7** (customer service) ~20s. Blain's F&F(40) = **press 2** (customer service) ~57s.
- BJ's Wholesale(85) = **press 3** (bakery dept) ~90s slow; no general operator (7=receiving→voicemail).
- Burlington(27) = **press 1 (English) → press 8** (speak with the store) ~78s. *NOT a dead end — I was wrong.*
- Meijer(64,75s) & Menards(65,94s) are LOCKED but reach the **WRONG desk** (Meijer→corporate pickup-care,
  Menards→random dept code), not CS — **re-map now that CS-targeting is live.**

**PARTIAL / not locked — need follow-up:**
- Office Depot(67): reachable (depts print/Tech/supplies/furniture + an "associate" sub-prompt) but NO clean
  single DTMF — recording-heavy, multi-step, STT-scrambled. `navStatus=review`. Left to the live #421 AI caller.
- Publix(70): auto-attendant "press 1 → 'all other service departments' press 5"; reachable but press-1→5
  timing varies by store; barge test inconclusive. `navStatus=attempted`. Left to AI caller.
- Family Dollar(28): Data Dev says callable ("press 1 for store personnel") but **store-INCONSISTENT** — 3 of my
  test stores hit the corporate "your call cannot be transferred / use website" recording. Not locked. Needs a
  known-good store/number from Data Dev.
- **Drift-verify pass NOT DONE:** the original mandate said "verify locked ones for drift." I mapped unmapped
  chains all day but never ran a systematic re-verify on the ~48 pre-existing locked chains. Mapper has a
  `verify` phase for this — do a drift sweep in the new repo.

**UNSURE (verify in new repo):**
- Do live consumer calls to *un-locked* chains (Office Depot, Publix) actually fall back to the #421 AI
  navigator, or do they need a locked recipe? I claimed AI-caller handles them but did not verify the live path.
- Locked recipes use fixed `atSec` press timings (e.g. Burlington press1@13/press8@40). Type-ahead should carry
  them and recipe.ts may re-time, but I did NOT spot-check a live consumer call. Slow/dept paths (BJ's 90s,
  Burlington 78s, Blain's 57s, conf 70-85) may ring long or vary by store.

**Owner preferences / decisions (nowhere else):**
- **Muted = never call. Period** — muted BECAUSE uncallable (call center / no store line / repack). No "sweep."
- **Kiosks ARE callable** (kiosk mode). Chips (online/sellsPacks/hasKiosk/muted) are **independent & combine**.
- Don't invent tier scores — `data/source/chain-scoring-2026-06/chain_scores_final.csv`, rubric
  `docs/specs/scoring.md`. GameStop / TJX = tier 2 (over-MSRP).
- Mapping Operator does **not touch code** unless the owner explicitly directs it (this session the owner had me
  build + promote #421 by request). **NEW rule (from new repo on): done = demonstrated on staging with evidence;
  a 5-10 line testable contract precedes any build; replies are outcome-first short bullets.**

**State:** board = **74 chains locked** at chat end (session start 48; +26 net). Recipes live in the **prod DB**
(retailers/chains), NOT git. #421 is LIVE on prod (fast-forwarded commit b3eddfc onto the prod branch) AND
present in staging (this branch). Staging has since evolved (c55e46d direct-null-seconds fix, KNOWN_24H).
Admin API: `https://admin.checkitforme.com`, header `x-admin-token: <ADMIN_TOKEN>`.

**Waiting on:** nothing blocking. Data Dev to: un-flag Burlington (callable, press 1→8), stamp the DTMFs above,
triage Family Dollar to a working store.

## Current work
- Session done. All callable tier-5/4/3 chains locked or handed to the AI caller; 74 locked. Next lane owner:
  start with the **drift-verify sweep** + re-map the two wrong-desk chains (Meijer, Menards).

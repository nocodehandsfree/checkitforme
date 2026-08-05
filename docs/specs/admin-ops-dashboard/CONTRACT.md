# Admin ops dashboard — the contract (LAW 2: written BEFORE any code)

Owner ask, 2026-07-26: flip the ROI calculator from a forecaster into a live readout. Every check must
answer **what happened · why · what it cost · could we have done it better**. Source specs:
`docs/team/voice-calls/01-report-checkitforme-architecture-2026-07-26.md` +
`04-spec-dashboard-operations.md`.

**THE WORD IS CHECK.** Never "call" anywhere the owner or a customer reads it (owner, twice, 07-26).
"Call" survives only for the phone-line mechanics inside code comments.

**Status:** decisions settled 07-26 (§7). Screens are ON HOLD until real checks exist — the only live
work is handing the calling engine the recording shape in §8 so its data lands usable.

---

## 1. What already exists (LAW 1 — name the pieces before building)

| Piece | Where | What it already does |
|---|---|---|
| Cost math | `public/app.html` `calcCompute()` (2448) | Itemised cost of ONE check from lane + nav secs + talk secs + rates. Whole-minute line billing, per-second agent. Verified against 873 priced calls. |
| Live rates | `GET /api/admin/cost-inputs` (server.ts:5659) | Pulls ElevenLabs credits/min + Twilio $/min off the real accounts. |
| Lane + seconds | `GET /api/admin/call-timing` (server.ts:5705) | Splits nav vs talk, buckets Direct/Alpha/Bravo off `chains.navType`, per-store averages. |
| Money | `GET /api/admin/metrics` (server.ts:3872) | Revenue, crude COGS, margin. |
| Check rows | `call_results` table | callSeconds, navSeconds, statusKey, transcript, providerCallId, zoneRunId. |
| Surfaces | `#dash` peeks + one sheet, `#calc`, `#results`, `#trees` | The Lego: `.peek`, `openSheet`, `logoTile`, hero = one number + honest spark. |

## 2. What does NOT exist (the gap this contract closes)

- No cost is ever **stored**. Every money figure today is re-derived or estimated.
- No per-check **lane** — lane is inferred from the chain, so a Target that answered direct still reads Alpha.
- No **event stream**. No timeline, so "why" is unanswerable.
- No **mapping versions, confidence, or evidence** — `chains.navType/navSeconds` + a free-text
  `retailers.phoneTree`. Nothing to diff, so no drift and no approvals.

## 3. Architecture — four layers, built bottom-up

**Layer 1 · One cost formula, one place.** Lift `calcCompute()` into `src/calls/cost.ts` (built there, not root `src/`). The Calc page and
the server both import it. One formula, never two. Rates live in `settings` (seeded from
`/api/admin/cost-inputs`), so a measured rate change re-prices everything at once.

**Layer 2 · Stamp every finished check.** New columns on `call_results` (§8). Written once when the
check completes. From that moment every dashboard number is a **sum of real rows**, never a model.
**No backfill** — owner, 07-26: the old rows are false because Charlie was listening when he should
not have been, so their costs are wrong. The record starts clean on the day the new engine ships.

**Layer 3 · The event stream (the calling engine writes it).** New `call_events` table, agreed kinds
only (§8). Admin reads, never writes. This is the whole "why".

**Layer 4 · Mapping as versioned data (Mapper).** `store_maps` (storeId, version, steps JSON,
confidence, evidence check ids, approvedAt, approvedBy) + `map_recommendations` (proposed change, old
vs new, reason, status). Production reads the newest **approved** version only. Unknown and Drift are
two filters on one queue, not two systems.

## 4. Surfaces — tucked into what exists (owner, 07-26: "we already have spots for this")

| Deliverable | Lands in |
|---|---|
| Dashboard UI · Operational metrics | `#dash` — hero swipe becomes ops vitals, peeks open sheets |
| Replay viewer · Timeline | a full-height sheet off any row in `#results` (Calls) |
| Analytics | sheets on `#dash` + filters on `#results` |
| ROI | `#calc` gets two tabs: **Actual** (new, default) and **Forecast** (today's page, kept) |
| Store explorer | store sheet off `#search` / any store row |
| Retailer explorer | `#trees` (Chains) — it already owns per-chain mapping |
| Unknown queue · Drift queue | one review queue on `#trees`, two filters |

**No new nav entries. No new page. No new domain.**

## 5. The dashboard shape — one number, then drill down (owner, 07-26)

Hero = **what a check costs us**, one number, honest spark. Everything else is a drill-down from it:

- by outcome (in stock · not in stock · sold out · couldn't tell · nobody answered · voicemail)
- by route (Direct · Alpha · Bravo)
- Charlie **listening** seconds vs Charlie **talking** seconds — the two are priced the same and only
  one of them is worth paying for
- menu seconds, hold seconds, time to a person
- tries per delivered answer

Each check row opens ONE sheet, four stacked blocks:
1. **What happened** — outcome, store, route, timeline.
2. **Why** — the events with clock times + the transcript, scrubbed together.
3. **What it cost** — itemised cents, same rows as the Calc page, so forecast and actual read alike.
4. **Could we have done it better** — the measured waste on THIS check: seconds Charlie sat on a
   ringing line, hold seconds billed, menu seconds over the mapped time, and the cents each one cost.

## 6. Build order — nothing starts until real checks exist

| # | Step | Blocked on |
|---|---|---|
| 0 | Hand the calling engine the recording shape (§8) | **nothing — do this now** |
| 1 | `src/calls/cost.ts` + the stamp on every finished check | engine writing the new fields |
| 2 | `#calc` Actual tab + `#dash` ops vitals | real checks on the board |
| 3 | Replay sheet on real events | engine event stream |
| 4 | Store + retailer explorers | a few days of clean checks |
| 5 | Review queue + approvals | Mapper's versioned menus |

## 7. Decisions — SETTLED by the owner 07-26

1. **Audio:** no recording of the conversation with Staff. Menu recordings only. Replay is the text
   transcript plus the timeline.
2. **Nav:** tucked into the pages that already exist. No new entries.
3. **Hero:** one high-level number — what a check costs us — with drill-downs into outcome, route,
   Charlie listening vs talking, and the rest of §5.
4. **History:** clean slate. No backfill. The old numbers are wrong and stay out of the record.

## 8. THE RECORDING SHAPE — what the calling engine must write (hand this to Eco)

Admin reads these and nothing else. Any field the engine does not write is a hole in the dashboard.

**On `call_results`, stamped once when the check finishes:**

| Field | Meaning |
|---|---|
| `lane` | what ACTUALLY happened on this check: `direct` \| `alpha` \| `bravo` \| `unknown` — not the chain's guess |
| `navSeconds` | dial → a person is on the line |
| `talkSeconds` | a person on the line → hang up |
| `charlieConnectedSeconds` | socket open, total (this is what we are billed) |
| `charlieTalkingSeconds` | of that, seconds either side actually spoke — the gap is pure waste |
| `holdSeconds` | clerk walked away / hold music, with Charlie still connected |
| `ringSeconds` | ringing with Charlie connected |
| `billedMinutes` | whole minutes Twilio charged (ceil) |
| `mapVersion` | which saved menu version this check ran (null until Mapper ships) |
| `attemptOf` | the check id this is a retry of, so tries-per-answer is countable |
| `engineVersion` | build that served it — so a regression is findable |

**New table `call_events`** — `id · callId · atMs (ms from dial) · kind · detail (JSON, small)`.
Kinds, and nothing outside this list:
`dialed · ringing · connected · ivr_detected · alpha_press · bravo_say · human_detected ·
charlie_join · charlie_leave · hold_start · hold_end · transfer · voicemail · unknown · verdict · hangup`

**Rules:** every event carries `atMs` off one clock started at dial. `detail` stays small (which key,
which phrase, why). The engine never deletes an event. Admin never writes one.

## 9. Done means

Real cents on every check · the dashboard hero reads live production, not a model · a bad check is
explainable from its sheet without opening a log · every claim carries `verify-live.sh` output.

# Admin ops dashboard — the contract (LAW 2: written BEFORE any code)

Owner ask, 2026-07-26: flip the ROI calculator from a forecaster into a live readout. Every production
check must answer **what happened · why · what it cost · could we have done it better**. Source specs:
`docs/team/voice-calls/01-report-checkitforme-architecture-2026-07-26.md` +
`04-spec-dashboard-operations.md`. Status: **AWAITING OWNER APPROVAL — nothing built yet.**

---

## 1. What already exists (LAW 1 — name the pieces before building)

| Piece | Where | What it already does |
|---|---|---|
| Cost math | `public/app.html` `calcCompute()` (2448) | Itemised cost of ONE call from lane + nav secs + talk secs + rates. Whole-minute line billing, per-second agent. Verified against 873 priced calls. |
| Live rates | `GET /api/admin/cost-inputs` (server.ts:5659) | Pulls ElevenLabs credits/min + Twilio $/min off the real accounts. |
| Lane + seconds | `GET /api/admin/call-timing` (server.ts:5705) | Splits nav vs talk, buckets Direct/Alpha/Bravo off `chains.navType`, per-store averages. |
| Money | `GET /api/admin/metrics` (server.ts:3872) | Revenue, crude COGS, margin. |
| Call rows | `call_results` table | callSeconds, navSeconds, statusKey, transcript, providerCallId, zoneRunId. |
| Surfaces | `#dash` peeks + one sheet, `#calc`, `#results`, `#trees` | The Lego: `.peek`, `openSheet`, `logoTile`, hero = one number + honest spark. |

## 2. What does NOT exist (the gap this contract closes)

- No cost is ever **stored**. Every money figure today is re-derived or estimated.
- No per-call **lane** — lane is inferred from the chain, so a Target that answered direct still reads Alpha.
- No **event stream**. No timeline, so "why" is unanswerable.
- No **audio**. `call_results.transcript` is text; the schema comment says audio is never stored.
- No **mapping versions, confidence, or evidence** — `chains.navType/navSeconds` + a free-text
  `retailers.phoneTree`. Nothing to diff, so no drift and no approvals.

## 3. Architecture — four layers, built bottom-up

**Layer 1 · One cost function, one place.** Lift `calcCompute()` into `src/cost.ts`. The Calc page and
the server both import it. One formula, never two. Rates live in `settings` (seeded from
`/api/admin/cost-inputs`), so a measured rate change re-prices everything at once.

**Layer 2 · Stamp every finished call.** New columns on `call_results`: `lane`, `talkSeconds`,
`charlieSeconds`, `billedMinutes`, `lineCents`, `agentCents`, `forkCents`, `overheadCents`,
`totalCents`, `mapVersion`, `costModelVersion`. Written once when the call completes. From that moment
every dashboard number is a **sum of real rows**, never a model.
*Backfill:* today's rows can be priced from `callSeconds` + `navSeconds` + chain lane, so real
cost-per-check exists the day this ships — before ECO's work lands.

**Layer 3 · The event stream (needs ECO).** New `call_events` table: `callId · atMs · kind · detail`.
Agreed kind list, nothing outside it: `dialed · ringing · connected · ivr_detected · alpha_press ·
bravo_say · human_detected · charlie_join · charlie_leave · hold_start · hold_end · transfer ·
voicemail · unknown · verdict · hangup`. ECO writes, Admin only reads. This is the whole "why".

**Layer 4 · Mapping as versioned data (needs Mapper).** `store_maps` (storeId, version, steps JSON,
confidence, evidence callIds, approvedAt, approvedBy) + `map_recommendations` (proposed change, old vs
new, reason, status). Production reads the newest **approved** version only. Unknown and Drift are two
filters on one queue, not two systems.

## 4. Surfaces — where each thing lands (LAW 4: no new domain, no new dashboard)

| Deliverable | Lands in |
|---|---|
| Dashboard UI · Operational metrics | `#dash` — hero swipe becomes ops vitals, peeks open sheets |
| Replay Viewer · Timeline | a full-height sheet off any row in `#results` (Calls) |
| Analytics | sheets on `#dash` + filters on `#results` |
| ROI | `#calc` gets two tabs: **Actual** (new, default) and **Forecast** (today's page, kept) |
| Store Explorer | store sheet off `#search` / any store row |
| Retailer Explorer | `#trees` (Chains) — it already owns per-chain mapping |
| Unknown Queue · Drift Queue | one review queue on `#trees`, two filters |

Two new nav entries at most, and only if the owner names them.

## 5. The dashboard's answer to the four questions

Every call row in `#results` opens one sheet with four stacked blocks:
1. **What happened** — verdict, store, lane, timeline.
2. **Why** — the events with timestamps + the transcript, scrubbed together.
3. **What it cost** — the itemised cents, same rows as the Calc page, so forecast and actual are legible side by side.
4. **Could we have done it better** — the measured waste on THIS call: seconds Charlie sat on a
   ringing line, hold seconds billed, menu seconds over the mapped time, and the cents each one cost.

## 6. Build order (each step ships on its own and is useful alone)

| # | Step | Useful on its own? |
|---|---|---|
| 1 | `src/cost.ts` + stamp + backfill | Yes — real cost per check, real margin, day one |
| 2 | `#calc` Actual tab + `#dash` ops vitals | Yes — the health readout he asked for |
| 3 | Replay sheet on real events (ECO) | Yes — debugging in seconds |
| 4 | Store + Retailer explorers | Yes — where the money leaks by chain |
| 5 | Review queue + approvals (Mapper) | Yes — unknowns become work |

## 7. Open decisions (owner)

1. **Audio.** Replay with sound means recording and storing calls (`src/r2.ts` exists). Costs storage
   and is a legal call in two-party-consent states. Text-only replay ships without it.
2. **Nav entries.** Add "Replay" and "Mapping queue" to the nav, or keep both as sheets inside Calls and Chains?
3. **Which number is the headline** on the dashboard hero: cost per delivered answer, or margin today?
4. **Backfill window.** Price the whole call history, or only from the day the new engine ships?

## 8. Done means

Real cents on every call row · the dashboard hero reads live production, not a model · a bad call is
explainable from the sheet without opening a log · every claim here carries `verify-live.sh` output.

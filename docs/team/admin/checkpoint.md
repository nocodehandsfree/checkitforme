# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).
> *(Over the cap right now because the fungibles ADMIN-HANDOFF content was ported in below,
> per owner 2026-07-10 — secrets stripped. Next Addie session: prune hard at boot.)*

## Ported 2026-07-10 from fungibles `ADMIN-HANDOFF` (bcae071), secrets stripped

**Lanes:** Addie owns `public/app.html` (admin SPA) + `/api/*` in `src/server.ts`. Consumer site = Website.
Backend/Stripe = DevOps. Voice tuning = Website. Mapper runs = Mapping.

**Branch/deploy/access (new-repo reality):** work on **`staging`** → owner verifies on
staging.checkitforme.com → promote. Branch is SHARED — fetch + rebase before push. Push auto-deploys
(SIGTERM drain protects live calls). **ADMIN_TOKEN**: in Railway (same on staging + prod), header
`x-admin-token`. **RAILWAY_API_TOKEN**: in Railway/owner (fetch any secret with it) — project
`889e332c-…`, env `7cbf9327-…`; svcs: prod `d363a982-…`, staging `8165df7a-…`, card-app `03d5f34f-…`
(holds CLOUDFLARE_API_TOKEN; checkitforme.com CF zone `fd03cb4a`). URLs: admin.checkitforme.com,
staging.checkitforme.com, staging Railway `voice-caller-staging-production.up.railway.app`.

**Hard-won rules:** NEVER ship routing/route patterns without a local boot test (a `:param{regex}`
route crashed Hono = full outage; boot with dummy EL vars, curl the routes). Copy guide before UI copy:
fewest words, tooltips over paragraphs, NO em-dashes. Every app.html edit: `grep -c '</script>'` = 2 +
`node --check` the inline script; `npx tsc --noEmit` = 0 for src edits. No model id in commits/PRs.

**🎯 Delta production lane (built, on staging, NOT human-live-tested — ADDIE'S #1 with owner's 8-call feedback):**
- Lane choice: workflow carries `lane:"delta"|"charlie"`; `triggerCall` runs `deltaStoreCall` when the
  store's workflow.lane is delta, else live agent.
- Engine `src/calls/tapedeck.ts`: bench + store modes — opener → gemini-2.5-flash-lite classifier →
  set-first follow-up → restock-day on a no → wrap. `deltaDecide()` pure + unit-tested
  (`scripts/test-delta.ts`, 17 cases). Voice/openers/follow-ups from the workflow, rotated per call.
- Charlie barge-in (`setDeltaBarge`): off-script "question" at the opener hands the SAME live call to the
  paid agent; fail-safe wraps clean, never dead air. Hard 5-min Twilio TimeLimit.
- Finalize (`finalizeDeltaSession`): clip-flow outcome → call_results verdict, charge once on definitive
  answer, notify, stamp `retailers.shipmentDay`. Barged calls finalize via the EL poll.
- Control UI: Workflows → per-workflow Call-lane toggle + editable Delta follow-ups (`wfmDeltaEditor`).
- Staging config: **Branson Test** = lane:delta + persona Branson; **Fun** store (106361) assigned to it →
  ONLY Fun runs Delta (owner: test only to the Fun store). Default = Branson Global (charlie).
- Verified: tsc clean, 17 tests green, boots, staging healthy. Barge-in needs a live off-script call.
- Limits: name echo only on Charlie/barge (clips can't say names); Delta classifier has no "doesn't carry".

**Voice fixes shipped (staging, live lane):** bare "no" no longer misreads as does_not_carry (carry/sell/
stock words required); `askShipmentDay` defaults ON everywhere + agent asks next-shipment day on a no;
in-stock follow-up = set-first (`PREMIUM_FOLLOWUP`).

**Fun-store dead-air (context, fixed):** bogus `avgTreeSeconds=19` from passive tree-learn muted the agent
19s. Fixed via `connectAtSecFor` + write-side guard. **Data Dev still owes:** null stale `avgTreeSeconds`
on ~30 direct chains (harmless but UI shows contradictory "rings direct · 19s to human").

**Locked decisions:** Pricing Family $4.99/15 · Collector $9.99/30 · Hunter $19.99/100 · Operator
$49.99/300; PAYG 99¢→60¢ over 10→100; premium = sub-only w/ admin toggle matrix; text alerts metered
(Family 5/mo), email free. ONE follow-up for everyone (Delta is cheap; PAYG calls still end fast).
Delta everywhere is the ROI plan; Charlie for hobby/off-script depth.

**OPEN (ported priority order):**
1. Owner's 8-call feedback on voice + Delta — tune from it (set-first, restock-day, barge-in).
2. Alert emails must match `docs/design/emails/` AND render in Outlook (tables, inline CSS, VML); send a
   test. A2P 10DLC at final Twilio stage — prep SMS end-to-end the day it approves.
3. Show pills for unclear statuses even from Fun/owner-only store (god-view excludes Fun from headline —
   surface Fun's `no_clear_answer` elsewhere).
4. Remove the Schedules nav button.
5. Dashboard cleanup: hero 5→3 vitals (Checks 24h · Reach 30d · EL credits), drop Confirms/Margin/pulse/
   Money, keep Call-time, demote Data-health.
6. Price-editor + tier↔feature matrix (w/ DevOps) · per-customer panel (DevOps builds the endpoint).
7. Zero-data-for-launch "Reset for launch" (destructive; snapshot first). EL credits use-or-lose window.

**Delegated (track):** Mapping — re-run the 13 "attempted", then Marshalls/Macy's/AAFES, skip kiosks.
Data Dev — null stale avgTreeSeconds; confirm `_CVS Pharmacy at Target` (1375, muted) isn't double-counted.
**Do not chase:** owner's laptop Safari stuck on old staging design (personal cache).

## Pre-port staged plan (older; merge with the OPEN list above as you work)
0a. [ ] 🅿️ Premium-feature TOGGLE MATRIX in God View → Plans (backend done: `GET /api/admin/plans`
    returns `features:[{key,label}]` + per-tier `features:{key:bool}`; save verbatim via POST; Publish
    applies prices; features are app-enforced). *(Plans are now published LIVE on prod, 2026-07-10.)*
0. [ ] Workflows must power BOTH envs from the one Admin — env picker Prod|Staging (staging reads/writes
    its own API + token; coordinate cross-origin auth with DevOps).
0b. [ ] Per-customer account view — spec `docs/specs/admin-user-view.md` (DevOps builds the endpoints).
0c. [ ] 🗑️ Remove the Admin "Zones" area (~30 refs in app.html); engine/tables stay.
1. [ ] Fix the admin so it's up to date (lagged during the website/admin split).
2. [ ] Voice-switcher + tree-learner ready to test (`connectOnHuman` + Helicone; Tree Trainer wiring).
3. [ ] Clean up admin UI to match the website's look; correct call-status icons.
4. [ ] Spec + build the AGENT PERSONAS (in-admin dev agent, on-site support, Discord bot, call routing —
    all via `src/llm.ts` gateway, cheapest-model-per-job, 3-tier escalation, Qdrant RAG). Spec first.
5. [ ] Then run the voice-switcher + tree-learning bench TEST (model-per-phase + cost shown).
- [ ] (Website) "Create your agent" caller-ID panel using `/auth/callerid/start` + `/status`.
- [ ] (voice) Kiosk call script (`kioskMode` → "is your Pokémon kiosk working/stocked?").
- [ ] Owner 2026-07-07: Chains page — collapse/roll-up control for the store list.

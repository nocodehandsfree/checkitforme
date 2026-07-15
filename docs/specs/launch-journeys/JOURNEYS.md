# Launch journeys — the full state matrix + who tests what

Owner asked (2026-07-15): enumerate every meaningful account/store/call state, test each, or at
least give him a walkable journey list. This doc IS that inventory, derived from the code
(`src/plans.ts`, `src/billing.ts`, `/pub/stores/near` in `src/server.ts`) and the GTM checklist.

Tags: `[gate]` already automated in `scripts/launch-gate.sh` · `[auto]` DevOps should add to the
gate · `[owner]` needs a human walk (real phone / real card / eyeballs) · `[blocked]` feature is
still a GTM todo — test can't exist until it's built.

**Launch decision 2026-07-15: NO hobby, NO thrift at launch.** Thrift is already muted-by-default
(chip opts in via `?section=thrift`); hobby chains surface normally today. Actions: DD mutes
Hobby-type chains; Webbie hides the Hobby + Thrift chips; keep `thrift_hunts` entitlement OFF.

## Axis 1 — account states (from plans.ts / billing.ts)
1. Logged out / anonymous
2. Free account (phone signup; grant = policy `freeChecks`)
3. Free with 0 credits left → upgrade path (THE money screen)
4. PAYG: 5 bundle sizes (10/25/50/75/100 checks; credits never expire; **zero premium features**)
5. Subscriber × 4 tiers — Family $4.99/20 · Collector $9.99/50 · Hunter $19.99/125 · Operator
   $49.99/400 (monthly quota, resets each cycle, no rollover)
6. Annual billing variant of each tier (−17%)
7. Subscriber with quota exhausted (can still buy PAYG on top; both pools spend)
8. Canceled subscriber (Stripe sub ends → entitlements off, PAYG credits must survive)
9. Comped/premium-granted account (COMP_PHONES / admin grant / Reset account button)
10. Referral: referrer + referee each get promised free checks — **NOT actually blocked**
    (DevOps audit 2026-07-15): the engine is BUILT — codes, both-sides grant, self/dupe abuse
    guards (`src/referrals.ts`, unit suite `scripts/test-referrals.ts` in test-all), consumer UI
    (`/app/referral` + claim + `?ref=` unfurl). The GTM card is stale; remaining work = flip the
    card + one `[owner]` walk of the share link on a phone.
11. Add-a-store reward: store request approved in Admin → `rewardedAt` → credit lands `[owner]`

## Axis 2 — premium feature gates (× each paid tier vs PAYG vs free)
`exact_products` · `zone_sweeps` · `restock_alerts` · `scheduled_checks` · `any_town` ·
`store_holds` · `your_voice` · `thrift_hunts` (OFF at launch). Each must WORK for subscribers and
UPSELL (not error) for free/PAYG. Admin can toggle per tier — spot-check one toggle actually gates.

## Axis 3 — store states (per store card + call sheet)
- Open now / closed now / no-hours-known (also 24h stores)
- Callable vs not: `sellsPacks=false` · kiosk-only (`hasKiosk`) — Food 4 Less / Ralphs class
  (DD fixing) · muted chain (never surfaces) · `ownerOnly` (Fun/MVP stores hidden from public)
- `stockCheckMethod`: site (MSRP retailer) vs call
- Mapped chain (navRecipe/dtmfShortcut) vs rings-direct vs unmapped
- Gray-but-actually-mapped display bug (DD fixing — retest on prod after her push)

## Axis 4 — call outcomes (verdict card + history + share)
In stock / out / unclear / voicemail / busy / bad number / no answer / escalated premium ask /
Spanish-speaking store (+ translate) / store closed mid-call. NOTE: generic "Call failed" →
real reasons is on DevOps's queue — until it ships, several of these render the same.

## Axis 5 — surfaces
4 brand skins × EN/ES × phone-width. Zone sweep multi-store report. Alerts: restock email +
SMS — **mostly built, not fully blocked** (DevOps audit 2026-07-15): watches + customer
email/SMS senders exist (`src/calls/notify.ts` notifyContact via Brevo/Twilio), admin views of
subscriptions + sends exist. Genuinely left: per-tier SMS caps NOT enforced anywhere
(`smsAlertsPerMonth` is plan data only — small backend build), Twilio A2P 10DLC registration
(owner paperwork, gates real SMS delivery), email branding pass, and the My-Checks
edit-contact form (Webbie). The `[owner]` O7 walk stays blocked only on A2P + the form.

## The journey list
**Automated already `[gate]`:** signup → code → logged in · find store → call sheet (stop at
dial) · upgrade → Stripe 4242 → sub active · scheduled check create/list/delete · zone
create/quote/delete · admin API + Admin UI · 4 brand skins · local dial-side: check → verdict,
zone fire (calls hard-disabled).

**Automated by DevOps 2026-07-15 — all `[gate]` now:**
A1. `[gate]` PAYG pack (4242) → credits land, features stay locked, gated backends upsell not error.
A2. `[gate]` (local target) zero-credit account presses Check → upgrade sheet, never an error.
A3. `[gate]` subscriber PAYG top-up → quota + payg pools coexist; balance = quota + payg.
A4. `[gate]` Stripe-test cancel → entitlements drop, PAYG credits survive, gates re-lock.
A5. `[gate]` gates × account type: locked for free/PAYG (A1) and post-cancel (A4); working for
    subscribers (the schedule/zones journeys). Per-tier admin-toggle spot-check stays `[owner]`.
A6. `[gate]` (local target) known-closed store: correct API state + retail list never offers it
    (retail hides closed by design — `.shut` rows are hobby/thrift renderings, off at launch);
    kiosk-only store: callable=false + excluded from mode=call.
A7. `[gate]` annual checkout-intent amount = published annualCents from /pub/plans.
A8. `[gate]` prod pass enters via the peek link (PEEK_CODE self-fetched like ADMIN_TOKEN) — brand
    skins + console checks run green behind the splash; peek cookie covers the whole browser context.

**Owner walks `[owner]` (real phone, real card, ~30 min once the above is green):**
O1. THE card test: fresh account (wiped 424 number) → free check on a real store → upgrade →
    REAL card → confirm charge, credits, receipt email.
O2. Real check on a mapped big-box chain → agent navigates the tree exactly as mapped → verdict
    with recording proof.
O3. Same on a rings-direct store (no tree) → no dead air / no self-mute.
O4. Add-a-store request → approve in Admin → reward credit lands.
O5. Zone sweep as subscriber → multi-store report reads right.
O6. Scheduled check actually fires at its time (needs GTM `zones-test`/scheduler confidence).
O7. Restock alert email + SMS arrive, branded — **[blocked]** until `alerts-forms` done.
O8. Referral both-sides free checks — **[blocked]** until `referrals` built.
O9. Spanish end-to-end: ES toggle + a Spanish-speaking store + translate button.
O10. Kiosk store (Food 4 Less/Ralphs) shows kiosk flow, not a dead call — after DD's fix.

## Mapped-chain audit (the "are we REALLY getting through" question)
Per-chain truth is in the DB: `navRecipe`/`dtmfShortcut` presence, `avgTreeSeconds`,
answer/complete rates in call history. Voice lane (Echo) owns: (1) pull per-chain stats from
Admin → calls, flag chains with mapped trees but low answered-rate or stale last-success;
(2) live-sample the top ~10 chains by store count with one real check each (cheap lane), verify
the agent reaches a human as mapped; (3) feed failures to Mapper. Do NOT re-map from test calls
(passive learning is prod-real-calls only — see GOTCHAS).

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
10. Referral: referrer + referee each get promised free checks — **[blocked]** GTM `referrals`
    is a critical TODO (devops). Confirm built before testing.
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
SMS (per-tier SMS caps 5/15/40/150 — **[blocked]** GTM `alerts-forms` still todo).

## The journey list
**Automated already `[gate]`:** signup → code → logged in · find store → call sheet (stop at
dial) · upgrade → Stripe 4242 → sub active · scheduled check create/list/delete · zone
create/quote/delete · admin API + Admin UI · 4 brand skins · local dial-side: check → verdict,
zone fire (calls hard-disabled).

**DevOps to add `[auto]`:**
A1. PAYG bundle purchase (4242) → credits land, premium features STAY locked, upsells render.
A2. Free account burns last credit → upgrade sheet appears (not an error).
A3. Subscriber quota-exhausted → PAYG top-up spends from both pools.
A4. Cancel sub in Stripe test → entitlements drop, PAYG credits survive.
A5. Each feature gate × (free/PAYG/subscriber): works vs upsells, per Axis 2.
A6. Closed-store and kiosk-only store cards: correct state, correct (non-)call affordance.
A7. Annual checkout price = published annual price.
A8. Prod gate should enter via the peek link (fetch PEEK_CODE like ADMIN_TOKEN) so the 4
    brand-skin tests stop failing red while the splash is up.

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

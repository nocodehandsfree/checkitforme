# Admin manual — the whole dashboard, every feature

The complete map of `admin.checkitforme.com` (source: `public/app.html`, one file; server: `src/server.ts`).
Written so any agent or human can learn the system from zero. Siblings: `WEBSITE_MANUAL.md` (consumer UI) and `SYSTEM_MANUAL.md` (the backend machinery). Line refs point into `app.html` unless
prefixed. Admin runs on **live prod data**: almost every save is live for customers the moment you tap it (§12).

---

## 1. Getting in (auth)

- Every `/api/*` request is gated server-side (server.ts:169): either header `x-admin-token: $ADMIN_TOKEN`,
  or the signed httpOnly `admin_session` cookie.
- The cookie is minted by visiting **`/admin-login?token=<ADMIN_TOKEN>`** (30 days, set on
  `.checkitforme.com` so it works across subdomains). `/admin-logout` clears it.
- **Owner-phone SSO**: phones listed in `ADMIN_PHONES` get the admin cookie automatically when they
  complete normal consumer SMS sign-in. Signing into the site = signed into admin.
- There is no login screen in the app; a 401 shows an "Admin login required" overlay (app.html:1180).
- `ADMIN_TOKEN` lives in Railway variables (self-serve; see the boot doc).

## 2. Shell and navigation

Two-level nav: **6 groups**, each with sub-tabs (NAV_GROUPS app.html). Active tab persists and
deep-links as a path (`admin.checkitforme.com/gtm`). Browser Back walks tab history. Toasts, tap
tooltips (`data-tip`), and per-tab loaders (`TAB_LOADERS`).

| Group | Tabs |
|---|---|
| God View | Live · Users · Restock · Alerts · Policy · Calc · Plans |
| Stores | Intel · Search · Add · Kiosk |
| Calls | Calls · Feedback · Statuses · Chains · App |
| Voice | Designer · Workflows · Testing · Fun |
| Support | Chats |
| Launch | Go-to-Market |

## 3. God View group

### 3.1 Live (`#dash`, app.html:577)
Today at a glance: 5 vitals (checks today, confirms, reach rate, credits left, margin) plus collapsible rows:
- **Today's pulse** — activity/funnel/community stats (`GET /api/admin/pulse`). "Start fresh" stamps a
  stats cutoff (`POST /api/admin/stats-since`) so numbers count from now; reversible.
- **Money** — revenue, profit/loss, margin, MRR, costs, paid calls, users, members (`/api/admin/metrics`).
- **Call time & cost** — avg talk / time-to-human / length, by lane and by store (`/api/admin/call-timing`).
- **Call data health** — real vs never-dialed vs rehearsal rows, plus a read-only purge preview
  (`/api/admin/calls-audit`, `/api/admin/purge-undefined-calls?dry=1`). No delete button on purpose.
- **ElevenLabs credits** — balance bar and ~calls left (`/api/credits`); plan size saved via settings.
Auto-refreshes every 12s while open.

### 3.2 Users (`#users`, app.html:596)
Every account, newest first (`/api/admin/users`): phone, signup, caller-ID verified, plan pill, credits,
calls, spend. One action: **Mark admin/test** (`POST /api/admin/users/staff`) so an account stops
counting as a real customer.

### 3.3 Restock intel (`#restock`, app.html:600)
What real calls have taught us: confirm rate, reach-a-human %, call reality funnel, restock days heard
from staff, what's landing (forms/sets/categories), top restock stores. Tap a store for its personal
breakdown: best restock day + confidence, confirmed-in-stock by weekday (`/api/admin/store-restock/:id`).

### 3.4 Alerts (`#alerts`, app.html)
Customer notifications, Brevo-branded email + Twilio SMS. Five customer events plus the owner ping:
- `restock` (text or email, whichever the customer picked; texts count against each plan's monthly
  cap) · `auto_check` (a scheduled auto check's result; text or email) · `store_added` (email) ·
  `waitlist` (email) · `confirm_email` (email; `welcome` is retired — there's no email-only signup,
  everyone joins by phone and adds email later).
- **Your in stock ping** — the owner-only hands-free email/text when a call confirms stock. Pick the
  channel + address at the top of the page.

Editable subject/body/SMS per event (`PATCH /api/alerts/templates`, stored in setting `alerts_json`);
the branded email layout (kicker, headline, module card, CTA) lives in `src/alerts.ts` → `EMAIL_DESIGN`.
Tokens: `{store} {product} {city} {email} {result}`. Send-yourself-a-test per event and channel
(`POST /api/alerts/test`), a delivery-status banner (green when Twilio/Brevo creds are set), a month
rollup, and a recent-sends log. SMS stays **stubbed** (logged, not sent) until the Twilio number clears
A2P. Final copy source of truth: `docs/team/copy/alert-copy-handoff.md`.

### 3.5 Policy (`#growth`, app.html:786)
The business console. Reads `GET /api/policy`, writes `PATCH /api/policy` — **global and instant**.
- **Feature flags**, grouped: Check+ premium (scheduling, restockAlerts, multiProduct, specificSets,
  hobby, thrift) · consumer free (kiosks, kioskReceipts, community, communityAutoApprove, referrals,
  shareCards, stockSignals, driverHandoff, liveListen) · global (oneCheckPerStorePerDay 24h cache,
  dogfoodHours overnight hours-harvest calling — leave OFF until the owner says go).
- **Pricing & rewards**: per-check price, minimum top-up, free checks for new visitors, kiosk reward,
  referral reward (both sides), store-add reward, membership price, finds headstart minutes, GA4 id.
- **Restock watches** list · **Community moderation** (approve/hide/delete posts) · **Store requests**
  (mark added → customer gets their reward · reject) · **Waitlist** with a notify-a-region email sender
  (dry-run count first, one email per person ever).

### 3.6 Calc (`#calc`, app.html:594)
Client-side per-call unit-economics calculator; changes nothing. Model the cost of a check by store
type (Direct / Alpha keypad / Bravo voice-menu), talk lane (Charlie live ~5¢ vs Delta recorded ~2.5¢ with
an escalation %), reach rate, and an editable rate card → live margin per plan.

### 3.7 Plans (`#plans`, app.html:595; src/plans.ts)
**Pricing source of truth** (settings key `vt_plans`). Four tiers (Family / Collector / Hunter /
Operator), each with monthly + annual price, checks per month (reset each cycle, no rollover), an SMS
alert cap, and the 8-feature premium matrix (exact_products, zone_sweeps, restock_alerts,
scheduled_checks, any_town, store_holds, your_voice, thrift_hunts). Plus the pay-as-you-go bundle
ladder (never expires). Edits auto-save as a draft (live app-side immediately); **Publish to Stripe**
mints new Stripe Prices and archives old ones — existing subscribers keep their price. The book's
Plans pages must match this tab; live check: `GET /pub/plans`.

## 4. Stores group

### 4.1 Intel (`#retailers`, app.html:653)
Read-only database overview: MSRP coverage headline (% of national tier-3-5 footprint loaded), total
stores (~102K), callable, states, chains, stores per product, reports by type/region/most-checked.

### 4.2 Search (`#search`, app.html:663) — the store action surface
- Filters: text, store type, region, zone, product, status (verified/in-stock/open/online/muted/kiosk…),
  sort. `GET /api/retailers?…&limit=500`.
- Store card: logo tile (same logo source of truth as the consumer site), call track record pills,
  product logos, threshold dot, Closed banner.
- **Tap = expand** (details, last check, carries, per-store workflow override). **Second tap = confirm
  dialog → places a REAL call** (`POST /api/call-now`) with live transcript in the card and a Stop &
  hang up button. Closed stores never dial; a store checked <24h asks again first.
- **Fun / MVP demo stores**: the phone-number field IS the on/off switch — save a number → live,
  clear it → hidden. Owner-only; excluded from all real stats.
- Hours refresh per store + bulk backfill. Bulk select → verify/unverify/online/offline/soft-remove.
- Results map (Leaflet): green in / red not-in / amber unclear / gray uncalled, per-pin Call button.

### 4.3 Add (`#add`, app.html:710)
Single add form (`POST /api/retailers`) + bulk JSON import (`POST /api/stores/import`, matches on
phone) + backfill-regions.

### 4.4 Kiosk (`#receipts`, app.html:768)
Crowd-sourced kiosk intel (refresh-time reports) and **emailed-in receipts** (shoppers forward a
machine receipt to restocktimer@gmail.com for a free check). Inspect-inbox debug shows each email and
why it parsed or got rejected (`/api/admin/receipts/inbox-debug`; IMAP flow in src/gmail-receipts.ts).

## 5. Calls group

### 5.1 Calls (`#results`, app.html:745)
Paginated call log (`GET /api/results`), filter by product/sort, rows expand to summary + chat-bubble
transcript. Verdicts render from the Statuses registry. `?store=` deep-links one store's calls.

### 5.2 Feedback (`#feedback`, app.html:740)
The training queue. After an unclear check the customer taps what they actually saw; rows show our
verdict vs theirs. Actions: **Correct → In / Not in** (fixes the record + trains) and **Mark reviewed**
(`POST /api/feedback/:id/review`). Unreviewed disagreements badge the tab.

### 5.3 Statuses (`#statuses`, app.html:1046)
**The verdict registry — single source of truth** for what customers see. A status = key + label +
icon + color + tone bucket (`in`/`out`/`unk`/`soon`) + customer-facing note (`{product}` token, bold
allowed). Edits auto-save and are **live in the consumer app instantly**. Adding a status displays
immediately, but *detecting* the new situation on calls needs extraction wiring (a dev task).

### 5.4 Chains (`#trees`, app.html:977)
Per-chain settings + the learned phone route.
- **The A/B/C/D lanes**: Alpha = keypad presses through the menu (locked recipe, ~free) · Bravo =
  speaks menu words (~free) · Charlie = live agent once a human answers (~5¢) · Delta = whole call on
  pre-recorded clips + cheap classifier, escalates to Charlie off-script (~2.5¢).
- Pick a chain → four panels: **Store settings** (Active/Mute — mute hides the chain from customers
  everywhere; type; rating 1-5; chain-wide toggles callable/kiosk/online/verified), **Store data**
  (MSRP/first-party, stock-check method + confidence, sell methods), **Call settings** (max talk
  seconds, hang-up-on-voicemail/closed, Phone-this-chain on/off, per-chain default workflow),
  **Mapping** (read-only: mode, time-to-human, the locked recipe).
- Mapping actions: **Map / Re-map** = one watched navigator call, then **Lock this recipe**.
  **Map until locked** = the autonomous Mapper loop (~75s apart, 12/day cap, live narration).
  Per-chain call log of every learner run.
- **Rating scale** (per-store tier, stamped chain-wide): 5 Best Chance · 4 Mostly Reliable · 3 Spotty ·
  2 Over MSRP · 1 Unknown (hidden from customers). Canonical: docs/data/scoring.md.

### 5.5 App (`#settings`, app.html:815)
App-wide defaults: **Customers hear calls live** toggle (`liveListen` flag), global **default
workflow**, and a raw-JSON advanced policy editor (dev escape hatch).

## 6. Voice group

### 6.1 Designer (`#designer`, app.html:832) — 7-step workflow builder
1 **Voice**: pick an ElevenLabs voice, set live voice, or record ~30-60s in-browser and clone a new one.
2 **Voice feel**: speed/warmth/naturalness/reply-timeout sliders, beat, model — saves the DRAFT
(test-bench) agent only. 3 **Script**: the opener library (`{category}` token; tick = in rotation).
4 **Persona**: named personalities (vibe, tone, slang/profanity/name-use toggles). 5 **Rotation**:
tick 2+ voices/openers and live calls round-robin them. 6 **Test**: the bench rings YOUR phone with a
real store's context and the draft voice/opener. 7 **Save workflow**.
Danger lever here: **"Go LIVE: apply draft to ALL store calls"** (`/api/sandbox-tuning/apply-to-stores`).

### 6.2 Workflows (`#workflows`, app.html:641)
A **workflow** = opener set + voice rotation + tuning + persona + call lane (+ Delta follow-up
scripts). Assignment cascade per call: **store override → chain → ★ default → global**. Cards show
openers (inline edit), voice strip, persona, lane, and where the workflow is assigned. Actions: Edit in
Designer, Clone, Set default, Delete, Reset rotation.

### 6.3 Testing (`#testing`, app.html:646)
Owner-only test-call log — Fun + MVP stores only, never real-store stats: workflow used, opener
actually said, status, timing.

### 6.4 Fun (`#fun`, app.html:1075)
Rings your own phone; never touches stores. **Delta rehearsal** ("call me on tape"): the whole check on
pre-recorded clips with the cheap classifier; say something weird to hear where Charlie would barge in.
**Lab call**: the agent calls any number in any cloned voice with a chosen flow and personality.

## 7. Support group — Chats (`#support`, app.html)
The operator view of the customer support chat. The chat itself is an AI agent (RAG over the book;
`src/support/ladder.ts` + `src/support/rag.ts`). **Its answers are the Support role's lane — don't
edit them from here.** This page is for watching and grooming it:
- **Update from the book** (`POST /api/support/reindex`) — re-reads every book page into the agent's
  memory. Run it after the book changes so answers use the newest wording (46 pages as of 07-15).
- Range (Today / 7d / 30d), a hero chat count, category pills, and per-category stats.
- **Top questions** — what people ask most in the range.
- Filters: category (Technical / Bug / Billing / Partnerships / How checks work / Other) and members
  vs guests, plus a chat search.
- **Chats list** — every conversation with its category and full thread. Resolved chats can be approved
  into the answer cache (`support_qa`, appended never rebuilt) or rejected (`/api/support/review`; the
  thumbs on `/pub/support/resolve` feed the queue).
- Escalation: the agent flips `needs_human` for account actions (refunds, plan changes, real bugs);
  everything else it answers from the book or says it's not sure. There is no Contact page (07-15).

## 8. Launch group — GTM (`#gtm`, app.html)
The single source of launch truth. Items have title, detail, area, agent owner, launch-critical flag,
status todo→doing→done (tap the dot). Filters by area/agent/open/critical. Missing seeded defaults
offer one-tap Restore. Every task any agent works should map to an item here.

## 9. Admin dev agent (floating chat, app.html)
A chat FAB that manages the store DB conversationally ("add a card shop in Bodega Bay", "mark store
1423 verified"). Switchable model; replies list the actions it executed.

## 10. Hidden / API-only surfaces (no UI — don't go looking for buttons)
Global calling kill-switch (`POST /api/admin/calling/pause|resume`) · zones admin API (consumer zones
are live; admin UI never built) · schedules API · store dedupe/quarantine/relink/grade maintenance
endpoints · table dump/load · staging→prod `/api/store-sync` (prod-receive only) · `/api/ops/*`
(watchdog, backup-now) · `#catalog` section exists but is unreachable from nav.

## 11. Staging vs prod
Staging (`STAGING=1`) = same app, `noindex`, calls/SMS disabled by default (`STAGING_CALLS=1` /
`STAGING_SMS=1` to opt in). Consumer checks on staging produce **simulated calls** (scripted 22s fake
transcript, zero telephony cost; src/staging-sim.ts).

## 12. What's live-instantly for customers (be careful here)
Policy flags & pricing/rewards · statuses registry edits · alert templates · community moderation ·
store-request status · chain mute/settings/workflows · store verify/online/phone edits · workflows,
openers, personas, voice rotation, apply-draft-to-all-stores · default workflow · live-listen toggle ·
GTM list. **Plans:** app-side truth immediately; Stripe only changes on Publish. Real calls from
Search/Chains/Mapper cost real money; bench/Fun/Delta only ring the owner.

## 13. Known gaps (as of 2026-07-15)
1. **Calls → Schedules admin tab removed** (07-15): the blank tab is gone from the nav. Consumer
   scheduling is unaffected; there's still no admin view of scheduled checks (schedules API only, §10).
2. Tooltip typo in Chains → Call settings: "wrapping up.ping up." (app.html).
3. A pile of dead JS referencing removed HTML (Live Listen card, Bridge Call, Tree Lab, voice presets,
   bail-rules editor) — functions exist, elements don't. Harmless; not reachable from the UI.

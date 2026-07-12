# Website manual — the whole consumer site, every feature

The complete map of the consumer app (source: `public/checkit.html`, one file, ~6,900 lines; server
public routes in `src/server.ts`; brands in `src/brands.ts`; plans in `src/plans.ts`). One codebase
serves four brand domains plus the apex. Siblings: `ADMIN_MANUAL.md` (operator UI) and `SYSTEM_MANUAL.md` (the backend machinery). Line refs point into `checkit.html` unless prefixed.

---

## 1. Architecture in one breath

One page, no router. Main views are sibling divs toggled with `.hidden`: `#builder` (home, :1709),
`#live` (call, :1790), `#result` (:1806), `#zones` (:1812), `#handoff` (:1815), `#hobby` (:1818),
`#success` (scores wall, :1821). Modals are `.overlay` sheets stacked on top; Esc or backdrop closes.
`boot()` (:2728) paints the brand instantly from server-injected data, then hydrates from
`/pub/categories`, `/pub/statuses`, `/pub/policy`. Deep links: `?call=<cid>`, `?v=history|success`,
`?flow=hobby`, `?show=signup|paid|mychecks`, `?paid=1`, `?ref=`. Browser Back walks views via
`navMark()`/`popstate` (:4580). `POLICY` (owner flags from `/pub/policy`) gates whole modules: kiosks,
community, referrals, restockAlerts, scheduling, driverHandoff, shareCards, hobby, thrift, liveListen.
Fetch helpers: `api()` anonymous (:2611), `appApi()` with the phone JWT (:2653).

## 2. Brands (the Lego theming)

Brand resolved server-side per request: subdomain (`pokemon.` etc, alias table), apex path
(`/pokemon`), or `?brand=` (brands.ts:135). Server injects title/OG, hero art, headline,
`BRAND` JSON, switcher list, and the `--accent` CSS var — every accent-colored component recolors
per brand automatically.

| Brand | Category | Accent | Headline |
|---|---|---|---|
| Apex "Check It For Me" | Pokémon (pre-locked) | #FFCB05 | Pokémon in stock? We'll check for you. |
| PokéCheck (pokemon.) | Pokémon | #FFCB05 | same |
| OnePieceCheck | One Piece TCG | #E23636 | One Piece cards in stock?… |
| ToppsCheck (toppsbasketball.) | Topps NBA | #E4002B | Topps NBA cards in stock?… |
| NeeDohCheck | NeeDoh | #EC4899 | NeeDoh in stock?… |

Vertical sites lock the category and hide the category picker (:3841); demo scripts, hero lines,
kiosk tab (Pokémon only), Hobby chip (Pokémon only), community feed, and finds ticker all scope per
brand category.

## 3. The home screen (`#builder`)

Header: product switcher pill (:1696), calendar button (result view only), auth pill (:1702 —
anonymous "1 free · Join" → sign-up; authed "My ✓ N" credits → account sheet). Finds ticker (:1705):
marquee of recent real in-stock confirms near you (`/pub/finds`), brand-filtered, test stores hidden.

Then the builder: mode tabs Retail/Kiosk (+ runtime premium chips **Hobby** and **Thrift**, :2552);
store search box (debounced; typing a ZIP = relocation, gated on `any_town`), 📍 locate, radius
chips 1/2/5/10/20 mi; store list from `/pub/stores/near` — tier grouping "Best bets" (tier 5) /
"Mostly reliable" (4) / "Spotty", best-bet row floated with "Most likely" chip, open/closed dot +
hours, distance, "drops <day>" shipment intel, "Coming soon" for not-yet-callable stores. Map view
(Leaflet, dark tiles): tier-colored pins, popup "Check this store", pin-drop relocation
(`any_town` gated). Category card + specific-product dropdown (`exact_products` gated, :3900).
Pick a store → the **call sheet** slides up (:1852): store header, product line, big "Check this
store" button, "No answer = no charge." footer. Non-callable chains (Amazon, Micro Center) get a
**sell-methods card** instead (:4012): resale warning, live online-stock readout, buy-online link,
restock bell. Below: demo fake-call chat for visitors (:1777), community scores strip, footer
(Scores/About/FAQ/Contact/Terms/Privacy sheets via `/p/:slug`, socials, language switcher).

## 4. The check lifecycle (tap → verdict)

1. **Gates** at `startCheck` (:4064), in order: kiosk confirm modal · not signed in → phone auth
   (check resumes after verify) · 0 credits → plans sheet · re-check confirm if the store was
   checked <24h ago (:5096).
2. **Dial**: `POST /app/check-live` `{retailerId, categoryIds, specificProduct, kioskMode}` →
   `{room, wsHost}`. Server bridges Twilio into the ElevenLabs agent; errors map to toasts/upsells.
   Staging simulates the whole call.
3. **Live view** (`#live`): WebSocket `wss://<host>/listen?room=` streams transcript lines (+ audio,
   played only for owner/comp or the `liveListen` flag). 8 monotonic stages derived from the
   transcript (:4287): Ringing → … → A person picked up → Asking about {product}. Poll resolves the
   conversation id → URL becomes `/?call=<cid>`.
4. **Finalize** (:4429): instant pending result with the streamed conversation; poll `/pub/result/:cid`
   until a confident verdict (server does a second-read LLM consensus when unclear, then persists).
5. **Charge**: only `status==='completed'` (a definitive answer) → `POST /app/charge` (idempotent
   server-side too). Everything else renders "No charge for this one".
6. **Post-verdict**: in-stock → share / driver hand-off / post-your-score; not-in → restock alert +
   auto-check module (premium) or "check back soon"; unclear → 4-button feedback poll
   (`POST /pub/feedback`, the training signal); anon first check → one-time upsell.

## 5. The result view (`#result`, :4715)

Top to bottom: verdict strip toned in/out/soon/unk (title, rich note, quoted price + cross-store
"Prices found" panel, per-category breakdown for multi-category checks); the **verdict matrix** —
owner-edited Statuses registry first (`/pub/statuses`, i18n keys `st.*`/`stn.*`), hardcoded fallbacks
for the rest; any non-in verdict with a heard shipment day upgrades to "Restock incoming!" (soon).
Then the CTA, the **combined timeline** (collapsible step log with per-step seconds + CONVERSATION
bubbles STAFF vs CHECK AI + "1 check used" / "No charge"), Translate button when transcript language
≠ UI language (`POST /pub/translate`, cached; Spanish UI auto-translates English calls). Verdict tone
also tints the iOS status bar (body `rv-*` classes, `?tone=` re-bake). Results cache in
sessionStorage for instant repaint.

## 6. History & calendar

"My checks" lands on today's newest check or a month calendar with verdict-toned glowing days
(:6114); ‹ › arrows + a calendar popover (:6061) navigate between checks. Data = localStorage
`runnr_history` (60 entries) merged with server `GET /app/history`.

## 7. Account sheet (`#acctOverlay`, :2089)

Green header: phone + edit-number, plan chip, stat tiles (checks left / checks today), 3 tabs:
- **Overview**: Manage plan, Check history, Manage Zones (locked copy without `zone_sweeps`), Earn
  free checks, auto-checks list with cancel, capsule CTA, Sign out.
- **Activity**: week bar-chart, 4 tone stat cells (tap filters), last checks reopen results.
- **Earn**: Add your store (`POST /pub/store-request` → free check when it goes live), Invite a friend
  (referral link, reward both sides), Post your score, Kiosk receipt; "Stores you added" status list.

## 8. Premium features (gating map)

Feature keys (plans.ts): exact_products, zone_sweeps, restock_alerts, scheduled_checks, any_town,
store_holds, your_voice, thrift_hunts. Entitlement: comp → all; subscriber → tier matrix; PAYG/free →
none. Client checks `hasFeature()` (:6144); server enforces on its endpoints. Gate points: specific
products + multi-category (:3895), Hobby chip, Thrift chip, ZIP/pin-drop relocation, restock alerts
(:6420), auto-checks (:6858), zones (server-enforced too, server.ts:2813).

- **Zones** (`#zones`, :5738): build a named zone (search/GPS/map multi-select), "Check all · $X" →
  `POST /app/zones/:id/check` → live run report with progress, per-store expandable transcripts,
  stop-all, share.
- **Hobby flow** (`#hobby`, :5465): Pokémon era grid → set tiles (art + logo composites) → product
  list with anchor prices → locks the product and drops into card-shop hunting.
- **Thrift**: a mode chip that refetches `type=Thrift` stores.

## 9. Buying (`#buyOverlay` + `#coOverlay`)

Plans sheet (`/pub/plans` live data): Monthly/Annual toggle (−17%), Plans vs Pay-as-you-go tabs, PAYG
slider (10→100 checks), "Every plan gets" 8-feature grid. Checkout: `POST /app/checkout-intent` →
Stripe Payment Element mounted in-page (dark theme), confirm → poll `/app/me` → "You're in"
celebration; hosted-Stripe fallback. Post-payment overlay lists the now-live features.

## 10. Auth (phone + SMS only)

Token = signed JWT in localStorage `cifm_token`, sent as Bearer. Flow (:2974): US phone (live
formatted; `POST /auth/phone/known` flips the lead to "Welcome back 👋" vs "First check's on us!") →
`POST /auth/phone/start` (Twilio Verify) → 6-digit code auto-submit → `/auth/phone/check` → token +
account. First login grants `policy.pricing.freeChecks` (default 1). Owner phones also mint the admin
cookie. **Caller-ID verify** (:3197): Twilio calls the user, they key a code; after that, store calls
show the user's own number (more pickups). Referrals: `?ref=` captured, claimed post-signup, reward
both sides. Staging prefills a dev code and sends no real text.

## 11. Community & kiosks

- **Scores wall** (`#success`, :6709): IG-style feed (`/pub/community`), double-tap like, composer
  limited to stores where YOU confirmed stock, photo upload via R2 presigned PUT (base64 fallback),
  posts may be pending review (admin moderates).
- **Kiosk receipt** (:6592): shows the inbox email (tap to copy), polls up to 6 min for the forwarded
  machine receipt → verified card + free-check claim. **Report kiosk timing** (:6577) rewards refresh
  intel with credits.
- **Driver hand-off** (`#handoff`, :6459): 5-step guided demo (ship/drive, bonus stepper, Uber/Lyft
  deep link, copyable driver message, release + rating). Client-side demo stage; only analytics fire.

## 12. i18n (English/Spanish)

`t(key, en)` — English inline as the default, Spanish in one dictionary `I18N.es` (:2293, ~770 keys)
plus ~150 `data-i18n` attributes rewritten by `applyLang()`. `tf()` fills `{n}`-style tokens. Brand
hero lines, demo scripts, status-registry labels (`st.*`/`stn.*`), hours labels, and shipment days
all localize. `setLang` re-renders live views in place. Transcripts translate server-side on demand.
Known parity gaps are tracked in the copy audit (Copper's lane).

## 13. Endpoint index

**Anonymous**: GET `/pub/categories · statuses · policy · plans · geocode · finds · pokemon-sets ·
products · stock/store/:id · community · kiosk-receipt/start|poll · bridge/:room · result/:cid ·
live/:cid · store/:id · stores/near · best-bet`; POST `/pub/check-live · charge · feedback ·
translate · watch · waitlist · lead · kiosks/report · community/* · bridge-hangup · store-request`;
pages `GET /p/:slug?partial=1`; share landing `GET /s`.
**Authed (Bearer)**: GET `/app/me · history · referral · schedules · zones* · my-store-requests ·
alerts/me`; POST `/app/check-live · charge · checkout · checkout-intent · schedule · referral/claim ·
alerts/subscribe · zones*`; DELETE `/app/schedules/:id · /app/zones/:id`.
**Auth**: POST `/auth/phone/start|known|check`, `/auth/callerid/start`, GET `/auth/callerid/status`.
**WS**: `wss://<host>/listen?room=`.

Key localStorage: `cifm_token`, `cifm_acct`, `cifm_loc`, `cifm_mode`, `runnr_lang`, `runnr_history`,
`runnr_free_used`, `runnr_device`, `runnr_ref`.

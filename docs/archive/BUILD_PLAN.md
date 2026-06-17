# BUILD PLAN — overnight autonomous build (north star)

Working branch: `claude/retail-stock-voice-calls-OcyMS`. App: `voice-caller/` (Hono + libsql, host-branded
consumer at `*.fungibles.com`, admin at `caller.fungibles.com`). Everything modular + config-driven so
products snap in like Legos across subdomains, and pricing/policy flips without code.

## Decisions locked tonight
- **Pricing:** 1 free check. Pay-per-call **$0.25/check**, **$5 minimum** (=20). Monthly **Runnr+ $4.99**
  = more checks at a lower per-call rate + premium features. All driven by a `policy` config (settings
  table) so the owner tunes numbers live. Design the economics smartly (see Policy).
- **Free-call rewards (wisdom of the crowd):** users earn free checks by submitting **kiosk refresh
  times** (Pokémon kiosks inside retailers refresh ~every 30 min, e.g. :03/:33, sometimes skips). Huge
  market-intel moat. Build a `kiosks` entity + crowd submissions → credit reward.
- **Headstart / privacy:** FLEXIBLE + elegant (don't nickel-and-dime payers). Config-driven:
  default = subscribers' finds are **always private** (perk); pay-per-call finds get a configurable
  **headstart** (default 10 min) then post public. Keep-private for non-subs = configurable (cost in
  checks OR off). All in `policy`.
- **Store importer:** JSON upsert to schema {chain,name,address,city,state,zip,region,lat,lng,phone,
  carries[],hours(per-day|national),active}. Re-import updates; soft-remove (active=false) e.g. Ralphs.
- **Dog-food hours:** build the calling+queue+auto-update fully but **leave dialing OFF** (flag). Designed
  to run at night → voicemail greetings state hours → parse → master-store-details queue → auto-update
  same region/state.
- **GA4:** env-gated (`GA4_ID`), snippet on consumer pages.
- **Driver handoff:** integrate the provided HTML as a style-matched, **flagged** demo below a successful
  in-stock result ("have a local grab it"). Non-functional vision piece.

## Magic-wand → backwards → build order
End state: a content-managed network of vertical sites, fed by a self-updating store+kiosk DB, monetized
elegantly, viral via share cards, with a restock-intel flywheel. Working backwards, the build order:

1. **Policy/config core** — `policy.ts` reads settings (pricing, headstart, privacy, flags) with defaults;
   `/api/policy` get/patch; consumer reads a public subset. (Unblocks pricing, gating, flags.)
2. **Store CMS** — JSON importer (`/api/stores/import`), region-from-state, update/remove, admin UI.
3. **Kiosks + crowd refresh** — `kiosks` table, consumer submit refresh-time → free credit, admin view.
4. **Self-updating hours queue** (flagged OFF) — night-call harvester → master-details queue → auto-apply.
5. **Premium gating + 3-tier upsell UX** — out-of-checks → buy/upgrade; subscriber-only: specific sets,
   multi-product asks, scheduling, restock alerts, private finds.
6. **Scheduled calls** — shipment-day schedules (B&N Tue/Thu, CVS Wed→shelf Thu); subscriber feature.
7. **Restock alerts** — `watches`; on confirmed in-stock, notify (respecting headstart/privacy).
8. **Share cards** — server OG image per result; share to SMS/X/FB/IG; viral CTA back to the brand site.
9. **Analytics** — restock-frequency dashboard (admin) + public teaser; GA4 snippet.
10. **Driver-handoff demo** (flagged) below in-stock result.
11. **Modularity pass** — extract shared consumer components; ensure identical behavior across subdomains.
12. **Test harnesses + sub-agents** — verify every feature, flow, and flag; UX/snappiness review.

## Principles
- Never break the live system; commit working increments; deploy + verify each phase.
- Anything uncertain → build it behind a flag in `policy`, default sensible/off.
- Pokémon is the reference site; all changes are brand-agnostic so every vertical inherits them.

## Build status (overnight)
DONE (committed on the working branch, tsc clean, harness 21/21 green):
- [x] **1 Policy/config core** — `policy.ts`, `/api/policy` get/patch, `/pub/policy` subset.
- [x] **2 Store CMS** — `/api/stores/import` (upsert by phone, region/tz from state, soft-remove,
      carries as array|csv|string), region backfill, admin Growth → paste-JSON importer.
- [x] **3 Kiosks + crowd refresh** — tables, `/pub/kiosks/report` (logged-in→credits, anon→free check),
      consumer kiosk card + report modal, admin kiosk view.
- [x] **4 Self-updating hours queue** — `hours-harvest.ts`, gated by `flags.dogfoodHours` (**OFF**).
- [x] **5 Premium gating + upsell** — buy modal renders packs/sub from POLICY; `openBuy('out')` tailored
      out-of-checks upsell; per-check math + best-value tag.
- [x] **7 Restock alerts** — `watches`; `notifyWatches` on confirmed in-stock; consumer watch modal.
- [x] **8 Share cards (client)** — Web Share API + X/FB/SMS/copy fallback overlay, flag-gated.
- [x] **9 Analytics** — `/api/admin/restock-intel` (hit rate, 7/30d, shipment-day tally, top stores) +
      Growth dashboard card; GA4 snippet env/policy-gated with `track()` events.
- [x] **10 Driver-handoff demo** — style-matched modal below in-stock result, `flags.driverHandoff`.
- [x] **Finds privacy/headstart** — `call_results.finder_user_id` + `is_private`; subscribers always
      private; pay-per-call headstart; `/pub/finds` honors publicFeed + headstart + privacy.
- [x] **12 Test harness** — `scripts/test-growth.sh` boots a throwaway server, asserts the full stack.
- [x] **Admin Growth tab** — flag toggles (incl. dog-food), pricing form, raw-JSON policy editor.

- [x] **6 Consumer scheduled calls** — `customer_schedules` + modular engine; subscriber-gated
      `/app/schedule` + result-card day-picker; reuses call + watch paths; one credit/fire, one
      fire/store-day, on chosen days or the store's shipment day. Tick policy-gated. Unit-tested 7/7.

- [x] **Auto-check management UI** (Phase 13) — consumer "My auto-checks" list (view/cancel).
- [x] **Viral share landings** (Phase 14) — `/s` find-specific page, dynamic OG title/desc, on-page card+CTA.
- [x] **Scalability cache** (Phase 15) — `refcache.ts` short-TTL categories/retailers on hot read paths.
- [x] **Community "I scored!" wall** (Phases 16–18) — `community_posts` + moderation + R2 presigned
      direct upload (SigV4 verified vs AWS vector) + consumer wall/capture + admin moderation.
      Gated OFF; to enable set `flags.community` (+ optional `communityAutoApprove`) and env
      `R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE`.

- [x] **Phase 19 Rate limiting** — `ratelimit.ts` per-IP fixed windows on kiosk reward / community /
      watch / lead / community-like (anti-spam, anti free-check-farming).
- [x] **Phase 20 Restock intel surfaced** — `/pub/stores` exposes learned `shipmentDay`; store cards show
      "🚚 usually restocks Thu"; not-in-stock nudge → auto-check.
- [x] **Phase 21 "Best bet near you"** — `best-bet.ts` ranks nearby open stores (shipment-day timing +
      confirm recency + proximity); `/pub/best-bet`; consumer card after Find-me.
- [x] **Phase 22 Social proof + test runner** — `/pub/watch-count` ("N watching") in the watch modal;
      `scripts/test-all.sh` runs every suite.
- [x] **Phase 23 SEO** — FAQPage + HowTo JSON-LD per vertical (rich-result eligibility).
- [x] **Phase 24 Review fixes** — 6 real bugs caught by a 2-agent diff review (shipmentDay abbrev,
      falsy-zero coords, public full-scan, community-like rate-limit + atomic increment, bucket split).
- [x] **Phase 25 Owner growth pulse** — `/api/admin/pulse` funnel+activity+community; Growth card.
- [x] **Phase 26 Referrals** — `referrals.ts` give-checks/get-checks loop, abuse-guarded, `flags.referrals`,
      consumer invite card + `?ref=` auto-claim.
- [x] **Phase 27 UX** — Esc closes any modal.
- [x] **Phase 28 Launch waitlist** — out-of-area capture + demand-by-region intel.
- [x] **DNS fix** — Railway custom-domain TLS validation was permanently stuck. Solved with a Cloudflare
      Worker (`workers/verticals.mjs`) that reverse-proxies the 4 verticals to the Railway service domain
      (forcing `?brand=`), using Cloudflare's wildcard cert. All 4 subdomains now serve 200.
- [x] **UI store-first reorder** + redesigned near-me area.

## 🔭 NEXT — owner ideas to build
- [ ] **Verified kiosk restock times (owner's idea — high value).** Self-reported kiosk times are soft.
      Truth source: we hand the shopper a **unique email alias** to enter at the kiosk checkout (kiosks
      take an email for the receipt). When they actually buy, the receipt lands in **our Gmail** (owner
      will set a Gmail **app password**). A poller (IMAP, `GMAIL_APP_PASSWORD` env) reads the receipt →
      parses store + timestamp + product → records a **verified** restock event (a real purchase at a real
      time), far stronger than a self-report. Build: `gmail-poller.ts` (IMAP fetch + receipt parser) →
      `kiosk_verified_events` table → feeds kiosk refresh intel + rewards. Needs the app password from owner.
- [ ] Worker-served verticals: thread real Host for canonical/OG (minor SEO polish; functional today).
## ☀️ MORNING BRIEF — owner actions
1. **Merge the branch.** `main` is live through Phase 13; **Phases 14–27 are on `claude/retail-stock-voice-calls-OcyMS`** awaiting your review. Everything new is flag-gated OFF or a pure safety/perf/SEO improvement. `git checkout main && git merge --ff-only claude/retail-stock-voice-calls-OcyMS && git push` → Railway auto-deploys.
2. **Verify the verticals from your phone** — `pokemon.fungibles.com` etc. Railway shows DNS PROPAGATED + service healthy; the 503 I saw is only this sandbox's egress gateway intercepting `*.fungibles.com`. If your phone loads it, nothing to fix.
3. **Flip flags when ready** (admin → Growth tab): `community` needs the five `R2_*` env vars set in Railway first (`R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/PUBLIC_BASE`); `dogfoodHours` stays OFF until you say go. `referrals` defaults ON (3 checks each) — tune `rewards.referralChecks` or turn off in the policy editor.
4. **GA4** — set `ga4Id` in the policy editor (or `GA4_ID` env) to turn on analytics; `track()` events already fire across the consumer flows.

## REMAINING (next session)
- [ ] **Server OG raster image** per find (needs an image renderer / native dep — share landings use text+brand image today; SVG card is the dependency-free interim).
- [ ] **Light up community** once R2 env is set; live-test the presigned PUT against a real bucket.
- [ ] Modularity pass (extract shared consumer modal/components) + email digest (Brevo).

## Tests (run `bash scripts/test-all.sh` → typecheck + 6 units + integration)
- `test-growth.sh` 32/32 · `test-schedules.ts` 7/7 · `test-r2.ts` 13/13 · `test-ratelimit.ts` 10/10 ·
  `test-bestbet.ts` 11/11 · `test-referrals.ts` 12/12. `tsc --noEmit` clean.

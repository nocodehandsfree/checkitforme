# Check It For Me — Capabilities & Feature Inventory

*A true catalog of what's been built. Figures pulled live from production 2026-06-15. This is both a
presentation source and the canonical feature inventory.*

---

## Executive summary (the big points)

> **A nationwide AI-voice retail-intelligence platform: it phones 100K+ real stores, an AI agent
> navigates each chain's phone tree to a human, asks if a product is in stock, and returns a
> verdict with proof — while you watch the conversation happen live.**

> 🧑‍💻 **Built — and RUN — by one person.** Not just developed solo. The entire operation — adding
> and cleaning 100K stores, tuning voices, managing live calls, moderation, pricing — is run
> single-handedly, because an in-app AI agent and a fully modular, config-driven design do the heavy
> lifting. *One operator runs a platform that would normally need a team.*

The headline capabilities, synthesized from the catalog below:

- **Operated by one person** — an in-admin AI agent runs the database by chat; a **Lego-modular**
  architecture means a change made once propagates to every brand site automatically.
- **The largest phone-verified retail map in the category** — **101,967 stores, every one callable**,
  across **all 51 states** and **85 chains**, tagged across **9 product categories**.
- **Live, watchable AI phone calls** — real-time transcript bubbles, listen-in audio, and a clear
  in-stock / restock / sold-out verdict with the transcript as proof.
- **Profit-engineered call automation** — keypad shortcuts + cheap-model navigation → premium-model
  human conversation + auto-bail rules + hard cost cap, so every call reaches a human fast and cheap.
- **A self-improving data moat** — every call writes back restock intel; the platform gets smarter
  with each call.
- **Built to scale globally** — **multi-language ready**, white-label by subdomain, and a roadmap of
  **AI-run customer support** (site + Discord) that escalates to a human only as a last resort.
- **Growth built in** — dynamic, tunable free-check rewards across every viral loop.
- **A full consumer product *and* a full operator suite** — 4 live white-label brand sites + a deep
  admin (God-view, store CMS, voice studio, analytics, live margin, AI ops agent).
- **16 integrated services, ~12,200 lines of code**, production-grade (custom domain, CDN, WAF, CI).

---

## 1. The live call experience (the "wow")

- **Rotating "Found!" ticker** — an animated green marquee across the top streaming real recent hits
  ("Found! · Target — Sunset Blvd").
- **Watch the call happen live** — transcript bubbles pop in **turn-by-turn in real time** as the AI
  and the store associate talk.
- **Listen-in live audio** — the actual call audio is relayed to the browser (WebSocket) so you can
  listen to the AI work.
- **Staged call UI** — "Calling Target…" spinner → "Navigating phone tree" → live transcript → verdict.
- **Armed CTA** — the call button appears and pulses only once a store is picked (zero-friction flow).
- **Speed flex** — "done in 1:12 — faster than you could've."
- **Call switcher rail** — jump between recent calls, filter by store/status.

## 2. Store discovery & map intelligence

- **101,967-store database**, geo-paginated to stay fast at national scale.
- **Find stores near you** — GPS, ZIP/city (geocoded from our own store coordinates), or **drop a pin**.
- **Zoomable dark map** — pan/zoom anywhere in the country, clean brand pins, click to call.
- **Open-now awareness** — per-store hours, timezone-correct, closed stores blocked from calls.
- **Pre-location store types** — generic types with live counts before you share location.
- **Three stock rails per store** — phone call · in-store kiosk · live website-stock signal.
- **Rich store cards** — chain logo (85 real chain marks, auto light-plating + fuzzy matching),
  type, distance, open/closed, "usually restocks Thu," what it carries.

## 3. Phone-tree navigation & call economics (profitability engine)

- **Phone-tree library** — per-chain, plain-English IVR/transfer navigation, owner-editable.
- **Keypad (DTMF) shortcuts** — e.g. press `0` three seconds in to skip a recorded greeting straight
  to a human; sent as **real carrier tones** via our telephony bridge (chainable: `1@3,0@9`).
- **Per-store overrides** — a specific store can override its chain's default tree.
- **Answer-path classification** — direct-human / simple-IVR / deep-IVR, learned from calls.
- **LLM switching for margin** — a cheap model navigates the menu/hold; a premium model takes over
  the moment a human picks up (don't pay for a smart model to sit on hold).
- **Bail rules engine** — auto-hangup on got-answer / voicemail / "we're closed," and on IVR-too-long
  / hold-too-long / ring-too-long, with an **absolute call-duration cap** as the profit guarantee.
- **Repack-only chain muting** — chains that only sell repackaged product are flagged/hidden so
  customers don't waste a check.
- **Custom telephony bridge** — Twilio media stream ⇄ AI agent ⇄ browser listeners, all in real time.

## 4. Voice technology

- **Voice cloning** — clone a voice from recorded samples (the owner's voice is cloned and live-capable).
- **Voice Studio** — pick from premade or cloned voices, record-to-clone in-app.
- **Per-store / per-schedule voice selection** — different voice per call context.
- **Caller ID control** — the store sees a real, chosen phone number on the inbound call.
- **Voice tuning** — opener script, cadence (speed), warmth (stability), model, turn-taking eagerness.
- **Test bench** — rehearse changes on a clone agent (self-call your own phone) before going live.
- **Saved voice presets** + multiple agent personalities (professional / casual / family) for the
  open-conversation agent.

## 5. Verdicts & proof

- **13 distinct outcomes** — in stock · sold out · doesn't carry · not in stock · "maybe" · nobody
  answered · voicemail · busy · IVR-stuck · language barrier · bad number · closed · failed.
- **Transcript + AI summary** of exactly what the clerk said (**no audio is ever stored** — privacy).
- **Product-name capture** — "In stock — Knockout packs," when the clerk names the SKU.
- **Nuance handling** — distinguishes in-stock vs. sold-out-already vs. left-on-hold.
- **48-hour freshness** — a "green/in-stock" result expires so customers never chase stale stock.
- **Owner-editable status registry** — labels, emoji, colors, and explainer copy changed in one place.
- **Multi-product cascade** — ask about several products in a single call.

## 6. Restock intelligence & alerts (the compounding moat)

- **Every call is databased** — store, category, confirmed yes/no, shipment day, timestamp.
- **Shipment-day learning** — the day the clerk gives is written back to the store.
- **Restock alerts** — watch a store; get notified when any call confirms it's back.
- **Subscriber auto-checks** — scheduled shipment-day calls that run automatically.
- **Best Bet** — ranks nearby open stores by likelihood of a hit (shipment timing + confirm history + proximity).
- **Live stock-signal rail** — site checkers + Discord cook-group pings + verified receipts, freshest-first.
- **Restock-intel dashboard** — hit rate, 7/30-day trends, top-restocking stores, best days.

## 7. Crowd & verified data intelligence

- **Kiosk refresh crowd reports** — shoppers submit machine refresh timing → earn free checks.
- **Receipt verification** — email a kiosk receipt → our inbox parses it (machine/product/time) →
  a **verified** restock event (a real purchase, far stronger than a self-report).
- **Community "Scores" wall** — photo proof of finds, tagged to store/product, moderated, likeable.
- **Cook-group ingest** — monitor Discord restock channels and fold them into the intel feed.
- **Store requests + bad-number feedback** — crowd-sourced map corrections, abuse-guarded.

## 8. Growth & virality

- **Dynamic free-check reward engine** — users earn free checks from every viral action, and the
  **payout per action is tunable live, no deploy**: **refer a friend** · **add a store** · **record a
  kiosk purchase** (email the receipt to `restocktimer@gmail.com` → we verify the *real* inventory +
  exact products bought) · **post your score**. Each loop can be toggled on/off and its reward dialed
  up or down as costs dictate.
- **Referrals** — give/get free checks, auto-claim via `?ref=` links.
- **Shareable find cards** — server-rendered OG images + find-specific landing pages that unfurl
  richly on X / iMessage / Discord.
- **Finds feed** — recently confirmed in-stock finds as live social proof.
- **Headstart & privacy** — paid finders get first dibs before a find posts publicly; pay-to-keep-private.
- **"N watching" social proof**, **launch waitlist** (captures out-of-area demand by region).
- **SEO** — FAQ + HowTo structured data per vertical, sitemaps, canonical tags.

## 9. Monetization

- **Pay-per-check credits** (first check free, no card) + **membership** (lower per-call rate + perks).
- **Volume credit packs**, **Stripe checkout** (no pre-created products), **charged only on a real answer**.
- **Owner-tunable pricing & flags** — change prices, packs, headstart, feature flags **live, no deploy**.
- **Comp accounts** (unlimited for owner/testers), tiered plan sheet.

## 10. Modular ("Lego") architecture & white-label

- **Change once, updates everywhere** — components, status registry, pricing, rewards, and copy are
  config-driven and shared, so an update in one place **propagates to every brand site automatically**.
  Like Legos: snap a piece in and the whole network inherits it.
- **4 live vertical micro-sites** — PokéFinder, One Piece, Topps NBA, NeeDoh — each its own SEO site,
  logo, colors, headline, and share card, **injected by subdomain from one codebase** (domain-agnostic).
- **Snap-in new products** — a new vertical is a single config entry + assets.
- **Multi-language** — full **English + Spanish live today**, and the i18n system is built so **any
  language is a drop-in addition** (add one block and the entire site translates, per-brand headlines included).
- **Owner-tunable without deploys** — pricing, feature flags, reward amounts, and page copy all change
  live from the admin.

## 11. Admin / operator suite

- **God View** — every live call, outcome, cost signal, and action in one real-time dashboard.
- **Store CMS** — import & manage 100K+ stores; search / filter / sort, bulk edit, soft-remove, intel reports.
- **Call time & cost** — time-to-human, avg call length, per-store/per-chain cost analytics.
- **Zone creation** — build a zone from a ZIP-radius and **call many stores at once**, with an
  up-front credit quote so you can't start what you can't finish.
- **In-admin AI agent** — manage the store database **by chatting** (find/add/update stores, intel).
- **Phone-tree Playbook**, **Voice Studio**, **Restock-intel analytics**, **Growth Pulse** (funnel →
  signups → paying → members), **moderation queue**, **schedules**, **admin map**, **status editor**.
- **Live COGS / margin** — real-time revenue vs. cost (voice + payments), profit & margin %.

## 12. AI agents — the force multiplier that lets one person run it all

- **In-admin "Admin dev" agent** (Claude) — **run the entire admin by chatting**: add stores, fix
  details, look things up, pull intel — without opening Claude or writing code. This is *how one
  person manages a 100K-store operation.*
- **Restock calling agent** (the core voice agent) + **carry/prospecting** + **open-conversation** agents.
- **Customer-facing AI (designed):** an on-site assistant that answers shopper questions and runs
  checks, plus a **Discord support bot** — a **3-tier escalation**: free FAQ bot → Claude for the long
  tail → open a human ticket **only** if the AI can't resolve it. One shared knowledge base across
  admin, site, and Discord that **gets smarter as more customers ask questions**.

## 13. Platform, infra & security

- **Custom domain on Cloudflare** — Worker reverse-proxy + wildcard TLS, **SSL Strict, forced HTTPS,
  TLS 1.2+/1.3, browser-integrity check**.
- **Anti-bot & anti-abuse stack** — Cloudflare **Bot Fight Mode** + **edge rate-limiting on the
  call-placing endpoints** (kills the "spam the calls" vector), per-IP application rate limits on every
  reward/write surface, and a designed **server-side one-check-per-store-per-day + phone-verified
  identity** layer that makes farming free checks impractical.
- **Reduced attack surface** — admin fully auth-gated, arbitrary-number dialing locked behind admin,
  store additions are **submit-then-approve** (no direct public writes), signed webhooks (Stripe +
  voice), and known vectors (rate-limit IP spoofing, timing side-channels, image XSS) catalogued and
  being closed.
- **Auth** (Clerk, passwordless + OAuth).
- **Scales to 100K stores** — geo-paginated APIs, DB indexes, hot-path caching.
- **Self-healing data** — automatic geocoding (Census + fallback), self-updating store hours harvester.
- **Privacy by design** — text transcript + summary only, **no audio ever stored**.
- **Engineering hygiene** — automated test suites + CI, staged/flagged risky features.

## 14. The stack — 16 integrated services

| Layer | Services |
|---|---|
| Voice & telephony | ElevenLabs Conversational AI · Twilio |
| AI / LLM | Anthropic Claude · OpenAI · Google Gemini · Helicone (LLM gateway) |
| Data | TiDB (distributed SQL) · Redis · Qdrant (vectors) |
| Auth & payments | Clerk · Stripe |
| Email & intel | Brevo · Gmail (receipt verification) |
| Infra & edge | Railway · Cloudflare (Workers, DNS, R2, CDN, WAF) |
| Analytics | PostHog |

---

## 15. By the numbers (live, 2026-06-15)

| Metric | Value |
|---|---|
| Stores in database | **101,967** |
| …phone-callable | **101,967 (100%)** |
| States covered | **51** (all 50 + DC) |
| Retail chains | **85** |
| Product categories | **9** |
| Live brand sites | **4** |
| Lines of code | **~12,200** (6.3k backend · 5.25k front-end · workers/scripts/migrations) |
| Integrated services | **16** |

## 16. Velocity

**From June 4 to June 16, 2026 — roughly 12 days — a single person** built *and* stood up the
operation to run: a 100K-store national database, a live consumer product across 4 brands, a full
operator suite, real-time AI voice calling with watch-live transcripts, an in-admin AI ops agent,
and 16 integrated services — production-grade on a custom domain with CDN, WAF, and CI.

*One person. ~12 days. A category-leading platform — in a market where competitors only scrape
websites that are wrong 40% of the time. That pace is the story.*

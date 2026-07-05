# Check — Owner's Guidebook

The one place to understand the whole business without reading code. Plain language. DevOps keeps it
true. (Deep detail lives in the linked docs; this is the front door.)

---

## 1. What Check is
An AI phones retail stores to check if trading-card / collectible product is in stock, with proof
(the call transcript). 100K+ stores, 4 white-label brand sites (Pokémon / One Piece / Topps NBA /
NeeDoh) + an admin suite. Public site: **checkitforme.com**.

## 2. How the money works
**Two ways to pay:**
- **Subscriptions (plans)** — a monthly/annual membership that includes a set number of checks each
  cycle. Tiers below.
- **Pay-as-you-go (PAYG)** — one-time bundles of checks, no membership. Balance never expires.

**A payment flows like this:** customer picks a plan or bundle → pays → Stripe confirms → a signed
webhook hits our server → we add the checks / activate the membership on their account. Proven working
end-to-end in test mode (2026-07-02).

**Plans source of truth:** Admin → God View → **Plans** tab. Edit prices/checks there, hit **Publish
to Stripe**, and it mirrors into Stripe automatically. `docs/finance/COST_MODEL.md` has the margins.

### The plan ladder (LIVE — set + published to Stripe test mode 2026-07-03)
Four monthly tiers, low → high. Annual = −17% of 12× monthly (auto). Edit any of it in Admin → Plans.

| Tier | Monthly | Checks / month |
|---|---|---|
| **Family** | $4.99 | 15 |
| **Collector** | $9.99 | 30 |
| **Hunter** | $19.99 | 100 |
| **Operator** | $49.99 | 300 |

**PAYG (no subscription):** 10 checks $9.90 (99¢ ea) · 25 $19.99 (80¢) · 50 $34.99 (70¢) · 75 $47.99
(64¢) · 100 $60.00 (60¢) — price per check slides down with volume.

### Premium features (subscription-only — the "EVERY PLAN GETS" grid)
8 features, **ON for every paid tier by default**, toggled **per tier in Admin → Plans** (data, not
code). **Pay-as-you-go customers get none of these** — they're a membership perk:
**Exact products · Zone sweeps · Restock alerts · Scheduled checks · Any town · Store holds · Your
voice · Thrift hunts.** (Some aren't launched to customers yet, but they all exist and are toggleable.)

### Checkout look & feel (decided 2026-07-03)
The payment form will be **embedded in our own site** (Stripe Elements), styled to the Claude Design
comps — the customer never leaves checkitforme.com. NOT Stripe's generic hosted page. (Build: Website
+ DevOps.)

## 3. The cost target — "THE NUMBER"
Every check must land in one of two boxes: **≤ 20s of billed time with a human**, OR **≤ 5¢ per call
at ~30s.** The main lever is "connect-on-human" (ABC): the expensive voice agent only wakes once a
real person is on the line — not during menus or hold. `docs/finance/CHEAP_NAV_ARCHITECTURE.md`.

## 4. The two environments
- **Staging** — `staging.checkitforme.com`. Where every change is built and tested first. Real test
  calls hit the owner-only **Fun** store (Admin → Testing).
- **Production** — `checkitforme.com`. The live site. You promote to it by merging staging → prod.
Both auto-deploy ~3 min after a push. Admin (`admin.checkitforme.com`) always runs on live prod data.

## 5. The team (agent lanes)
Start any agent by typing **"You are Check - <Role>. Ready up."** — it reads its own docs and reports
in. Roles: **Website** (consumer site), **Admin** (dashboard), **Data Dev** (store data), **DevOps**
(backend/infra/security/docs — your point of contact), **Design** (look), **QA** (read-only checks).
Full prompts: `docs/KICKOFFS.md`. How they work: `HANDOFF.md`.

## 6. Where everything lives (pointers — open only what you need)
- **Roadmap / backlog** → `docs/business/ROADMAP.md`
- **Money / margins** → `docs/finance/COST_MODEL.md` · `CHEAP_NAV_ARCHITECTURE.md`
- **Design** → `docs/style-guide/STYLE_GUIDE.md` · `NEW_CHECK_COMPS.html` · `BRAND.md` · `COPY_STYLE_GUIDE.md`
- **The front↔back interface** → `docs/API_CONTRACT.md`
- **Store data** → `docs/DATA_PROVENANCE.md` · `docs/specs/store-data-schema.md`
- **Traps that cost us time** → `docs/GOTCHAS.md`
- **Finished work** → git history (nothing is kept as a stale doc)
- **Human-facing docs (customers/team)** → **ReadMe** project "Checkitforme" (Plans/pricing/features live there; this Guidebook is the internal source).

## 7. Launch readiness (DevOps keeps current — 2026-07-03)
- ✅ Commerce proven on staging (test mode) · ✅ transcript-privacy fix shipped · ✅ boot security gate
- ⏳ Before public: rotate keys, live-mode Stripe webhook, embedded checkout, finalize the plan ladder,
  legal review of AI calling. Full list: ROADMAP → Security + Launch-path.

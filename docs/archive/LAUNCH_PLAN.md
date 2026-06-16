# LAUNCH PLAN — prioritized master list

The single prioritized view. `ROADMAP_NIGHT.md` has the granular task notes;
this is the "what matters and in what order" cut. Updated end of business-model session.

═══════════════════════════════════════════════════════════════
## P0 — LAUNCH BLOCKERS (nothing public/zone-launches until these are done)
═══════════════════════════════════════════════════════════════
1. [x] **Clerk → production + cross-subdomain login** — DONE (pk_live on clerk.fungibles.com, custom sign-in everywhere, owner verified login). Remaining owner task: email branding in Clerk dashboard (name→Fungibles, logo, noreply@).
2. **Import the 95K stores to production** — still only 95 live. Includes:
   geocode (lat/lng), store hours, and phone-number sanity. The map + distance
   + "open now" all depend on this.
3. **Bail library + hard duration cap (180s)** — cannot launch with uncapped
   call cost. This IS the profit guarantee. (See ROADMAP #7.)
4. **Phone-tree docs for the first launch zone** — owner is documenting manually;
   only ~74 unique retailers nationwide, so this is finite. No tree = don't launch that chain.
5. **Billing finalized** — per-check pricing live in Stripe (minutes model is a
   later migration; per-check ships first).
6. **admin.fungibles.com + admin access** — Clerk session now gates caller.* with the custom sign-in (works today). Optional later: dedicated admin.fungibles.com domain.
   ⚠️ KNOWN ISSUE for UI lane: owner reports "many pages aren't loading" post-desktop-responsive commit — triage runner.html + admin tabs first.
7. **Compliance review (TCPA / two-party consent / AI disclosure)** — not a build
   blocker, but a *marketing* blocker. Clear before any public push.

═══════════════════════════════════════════════════════════════
## P1 — HIGH VALUE (do right after launch; biggest upside)
═══════════════════════════════════════════════════════════════
8. **Hybrid handoff** (cheap nav → premium voice on human pickup) — ~$0.16/check.
   Single biggest margin lever; incremental to existing bridge code.
9. **National Hunt premium** (out-of-area zones ranked by demand-pressure +
   distributor + restock day) + runner/Uber loop. Flagship feature + moat.
10. **Post-miss free alert hook** — one free restock alert drives them back +
    sets up the upgrade ask. Retention.
11. **Live-call chat bubbles + speed-flex** — real-time turn bubbles on the call
    page; "done in 1:12, faster than you could've." The WOW.
12. **Best-bet upvoting** — rank stores by real hit-rate; don't waste checks.
    Data flywheel — gets smarter every call.
13. **Chain classification** (answerPath, repackOnly) + mute toggles in UI.
14. **God-view admin dashboard** + **AI call supervisor** (watchdog enforces bail
    rules, auto-hangup + email-why + Discord credit flow).
15. **Result caching/dedup** — never call a store twice in a window. Cost +
    store-relationship protection.
16. **Zone-gated launch + community vote game** — cap users/zone, launch by votes.
17. **Finish i18n sweep** — errors/toasts, demo body, remaining modals, transcript-in-ES.

═══════════════════════════════════════════════════════════════
## P2 — SCALE & NEW REVENUE (when proven / when forced by volume)
═══════════════════════════════════════════════════════════════
18. **Decentralized calling** (user's own number + voice) — kills concurrency
    limits, spreads risk, most authentic. Build = scale-stage, needs own stack.
19. **DIY voice stack** (Pipecat/LiveKit) — when EL spend > ~$20k/mo (~100k checks).
    Test ahead of need.
20. **Discord token-gated community + restock calendar** — the cook-group model
    for in-store. Sub = the token gate. Fast revenue after the app.
21. **Brand/distributor sell-through intel (B2B)** — phone-verified shelf
    availability index. The biggest $, longest sales cycle. Calls = the data engine.
22. **Alpha-hold premium** — pay to freeze a store / hold your find.
23. **Postgres migration** — at multi-GB DB or write-contention signals.
24. **Twilio number rotation + pickup-rate monitoring** — anti spam-flag.
25. **Scalability refactor** — componentize runner.html, shrink file.

═══════════════════════════════════════════════════════════════
## DONE (reference)
═══════════════════════════════════════════════════════════════
Consumer UI redesign · chat-bubble transcripts · custom status icons · per-product
demo · slider · logo dropdown · brand-tinted footer · Scores page · map · low-credit
reminder · "we got some = in stock" + "Left on hold" · voice studio (owner voice
cloned) · zone credit guard · i18n rounds 1–2 · business model + calculator.

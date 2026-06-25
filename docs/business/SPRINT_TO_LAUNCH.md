# Check — Sprint to Launch (the morning list)

Owner brain-dump from the end of a strong day (13 chains mapped, ~$0.05/call = 4×, direct-answer
bug fixed, Playwright + docs + branch audit done). This is the prioritized to-do, the launch
checklist, and the GTM strategy in one place. Priorities are the owner's (P1 = do first).

> Lanes: **[DevOps]** backend/infra/calls · **[Admin]** app.html/admin · **[Web]** checkit.html/consumer
> · **[Data]** store data/logos · **[Design]** Claude Design · **[Owner]** Fungie.

---

## 🔧 Quick Admin fixes (from tonight's God-view review)
- **[Admin]** Move **Store CMS import** out of Policy → into Stores/Data (it's a data tool, not policy).
- **[Admin]** **Collapse Advanced-policy JSON** (dev escape hatch; don't show inline) — or move to a System tab.
- **[Admin]** ROI calc: add a **"× return on cost"** stat next to the 79% margin (same math, sells better).
- **[Admin]** Feature-flag tooltips: Connect-on-human = "don't bill the agent until a human answers (VAD, off until bench-tested)"; Dog-food hours = "auto-call at night to learn store hours (off until go)".
- **[DevOps+Admin]** **Cancel a ZONE call** like a single call — Stop button that kills the whole zone batch (track the zone's callSids, hang them all up). *(today you can only cancel a single call.)*

---

## P1 — do first (target: core mapping + launch-blockers within ~2 days)
- **[DevOps]** **Continue mapping stores** — finish the chain list. (Direct-answer fix is live; run during the day so operators are staffed. Walmart=site rail; after-hours ones deferred.)
- **[DevOps]** **CRITICAL — finish workflows:** test the **workflow manager**, **create personas**, **rotate scripts + personas**, and **store-dependent script logic** (right script per store type). This is the believability core.
- **[Web+Design]** **Promote staging → prod**: the new website + **new call experience** (bottom-focus on the active call). **Tighten the call-transcript page** (the one that broke today) — pair with **Claude Design**.
- **[Data]** **Full data cleanup** — kill invalid/junk stores + fix wrong open/close hours (in progress).
- **[Design+Owner]** **Finish the last ~dozen logos.**

## P2 — launch sprint
- **[Web+Owner]** **Redesign the sign-up + checkout** and **test with a real credit card**. Two doors:
  **(A) pay-as-you-go** (buy chunks of checks; more = cheaper/check), **(B) monthly/annual plan**.
  - **[DevOps+Owner]** **Run the chunk-discount math** on $0.20 so volume discounts never undercut the premium plan. (At ~$0.05 cost we have room — but model it.)
  - **[DevOps]** Ensure **all premium features load for paid subs.**
- **[Web]** **Redesign "My Checks"** — full overhaul: show **every way to earn free checks** (at a store, post your score, refer a friend, kiosk) + **[Admin] credit any user with checks** (manual grant).
- **[Web]** **Premium "✔️+" learn-more page** (full page, not just inside My Checks).
- **[DevOps]** **Accurate per-call cost in Admin** (God-view): which stores cost the most, **A/B/C performance**, and **why calls failed** (reasons).
- **[DevOps]** **Test zones** end-to-end — make it sound believable.
- **[Web+Admin]** **Bug-feedback** for testers (quick "this call had an issue" report) + **grant free checks** in My Checks.
- **[Owner+DevOps]** **GTM strategy doc** (see section below) + **"what we need to launch" checklist** (Playwright path tests + the DevOps refactor/security items).
- **[Owner]** **Soft launch next week** (hand-picked users) → **launch LA region the week after.**

## P3 — after the core
- **[DevOps+Web]** **Progressive data-gathering pipeline**: phone → first name (post-score / sub) → email (restock-notif signup). Gather over time, no big form.
- **[Web]** **SMS polish** — refer-a-friend / check-out-my-score texts: right **images + copy.**
- **[Web]** **"Add to Home Screen"** (PWA-ish app feel).
- **[Design]** **Admin style guide** (it's Frankensteined) — lower priority, now that the website guide exists.
- **[DevOps]** **Discord + Twitter AI support bot** (Helicone, tiered for profit; DB gets smarter as people ask).
- **[Web]** **Automated email drip** (launch list → nudge to sign up / buy / claim a free check).
- **[Admin]** **Kiosk:** let people report a machine **down** (and auto-mute it from the list).
- **[Data]** **New store types:** treasure-hunt (Goodwill, Salvation Army), hobby shops (build a list),
  online-only (Best Buy, Micro Center — show what's online to buy → cook-group territory w/ page monitoring).
- **[Web]** **Waitlist by region/state/city** — capture not-yet-served visitors → email DB.

## P4 — post-launch
- **[DevOps]** **Runner**: order an **Uber** to the door first, shipping after.

---

## Premium "✔️+" — the feature set
1. **More questions / details** — product set (e.g. Ascended Heroes), product type (tin / booster box / packs); **ask about a 2nd product** on the same call and **show it on the transcript page.**
2. **Ask the store to hold** the product.
3. **Restock alerts** — email + text.
4. **Premium call features** — scheduling + create your own zones.
5. **Personalize your agent** — clone your voice.
6. **Zoom past the 20-mile radius** into other regions.
7. **TBD — candidates** (confirm from `docs/business/CAPABILITIES.md`): faster/priority checks · full proof transcript + share cards · multi-store checks · history/collection tracking. *(Owner to lock #7.)*
> Pricing rule: premium plan must stay **above** the pay-as-you-go volume-discount floor — model before pricing.

---

## Launch checklist (what we need to go live)
- [ ] **[DevOps]** Playwright path tests green for every consumer + admin path (harness scaffolded tonight).
- [ ] **[DevOps]** Money/safety from REFACTOR_PLAN: hard call-cost cap + bail enforcement, spend kill-switch, atomic billing, rate-limit money endpoints, one-check-per-store-per-day.
- [ ] **[DevOps]** Security: **rotate the leaked Railway token + ADMIN_TOKEN**, then the standing key-rotation + gitleaks (SECURITY_REVIEW).
- [ ] **[Owner]** Decide **launch-day feature set** — we built a lot; cut what doesn't need to ship day one (decide as pages get redesigned).
- [ ] Checkout + premium + free-check earning all tested with a real card.
- [ ] Workflows/personas/script-rotation believable on real calls.

---

## Go-to-market strategy (first draft — expand before Wed)
**Beachhead: Chris's Pokémon community on X** (the Wed meeting). Land there first, then radiate.
1. **Influencers / communities** — LeonHart + cook groups; get a mention.
2. **Use our own tech as the pitch** — **call Pokémon card shops with the AI**, let owners *talk to the product*, capture who's interested. (The LA shop owner already loved it — warm leads.)
3. **Content** — dope share-able videos (a real call → verdict → proof) for X / Discord / cook groups.
4. **Geo rollout** — soft launch (hand-picked) → **LA region** → expand by waitlist demand.
5. **Proof loop** — every check produces a shareable proof card; referrals earn free checks → viral loop.
> Graduate this into `docs/business/` GTM once locked; pair with the launch checklist above.

---

_Set by DevOps at end of session. Re-prioritize freely — these are the owner's P-levels captured verbatim._

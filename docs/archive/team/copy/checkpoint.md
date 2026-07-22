# Check - Copy — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".**

## ⛔ LAW (owner, 07-16, after repeated misses)
1. NEVER write copy from guesses or old docs. Read the module's actual code/flow first (src/ + the
   interface), or ask. Burned facts: nothing auto-retries a failed call · "closed" result = our hours
   were wrong · hobby = best PRICE across multiple hobby shops (set + product type) · thrift asks
   SHELVES · auto checks (not "scheduled checks") = recurring call → EMAIL report · store_holds +
   your_voice are PARKED · idiom is "No check. No charge." · never "spam" · we do NOT record calls
   (text transcript + summary only, never audio) · the agent says NOTHING on the call (no AI / no
   recording disclosure) until the owner says so at scale.
2. **SLOW DOWN. Write copy EXACTLY as it renders and read it back.** Misses that got me fired:
   spec/notes leaking into the copy ("What Check is:" as a line); saying the same word 3x ("In stock"
   badge + "is in stock" + "at retail price… in stock"); walls of text that wrap mid-sentence.
3. **Stay in the copy lane.** Copper writes words + hands direction. Do NOT implement Webbie's screens
   (owner: "I didn't ask you to do his job").

## 🔴 IN FLIGHT — share + referral landing pages (Webbie builds; hand him copy + direction)
Owner found these while testing. NOT done. My /s cleanup (local Inter, our check icon, comp CTA, cut
copy) is live but STILL WRONG: centered, no store logo, and the copy doesn't say what Check is.
- **/s share proof page** (renderShare, src/server.ts — the link a friend's text opens). A cold
  stranger. Must in ONE line say what Check is: "Check AI calls real stores and finds insanely hard
  to get products, in stock at retail price." · SHOW the STORE LOGO (single share must carry the logo
  in the link, like zone's st= param) · left-align some elements, fill the card, not all centered ·
  button = the RESULT/verdict page's glowing green CTA with the stripe sweep, not a flat button ·
  button copy "Use Check AI free →" · EN + ES · states: in / on-watch / zone.
- **Referral welcome** (?ref on homepage, not signed in): "your friend gave you a free check." Reward
  is **1 each side** (locked, verified live), both granted on signup. Button → signup. On homepage,
  no new route.
- **Zone report** (Screen C, the in-app live sweep report): owner never approved its design. Use
  EXISTING comps/elements, NO CD. Separate from the landing pages.

## Recently shipped (verified on staging)
- **Legal pass:** Terms + Privacy tightened (what we collect, retention, rights, subprocessors named
  = voice provider + Twilio + Stripe, don't-sell). Removed ALL recording claims (we don't record;
  agent says nothing). EN + ES. Flagged real-lawyer items to owner.
- **Check+ feature sheets** (checkit.html FEAT_INFO + openFeatInfo): per-service copy, left-aligned
  lead + green-check "what you get" rows, EN + ES. store_holds/your_voice pulled.
- **Alert copy** → docs/team/copy/alert-copy-handoff.md (all emails/texts/landing pages/admin, EN+ES).
  Addie implementing. Note: {result} token fills English — needs a Spanish value.
- **Status notes** rewritten (true to system, no false "we'll try again") → given to owner for Webbie.
- Contact page killed everywhere (book + site + bot reindexed). Pricing 20/50/125/400 live.
  Copy guides: STYLE_GUIDE call-status = headline 40/900 + subhead; hard rule 2 = one line or a whole
  new sentence, holds in Spanish.

## ⏳ WAITING ON OWNER
1. **Prod push is OWNER-BATCHED** — do NOT promote staging→main piecemeal. Prod still "coming soon".
2. **ReadMe appearance** — owner applying (dark gradient rec: #14532D→#0A0A0F, Brand/Links #4ADE80).
3. **Book review** — owner going page by page.

## Tools / traps
- Screenshot rig: scratchpad/shot2.mjs (playwright-core + curl-routed; GET-only, never places a check).
  shot3.mjs adds a page.evaluate to open a sheet (e.g. openFeatInfo). Wait ~60s for Railway deploy.
- checkit.html EN defaults are single-quoted JS — an apostrophe breaks the whole <script>. Run the
  node+vm inline-script check before pushing.
- Admin token: self-serve from Railway (staging svc 8165df7a-3bdf-41a5-bdce-24883633a096).
- Multiple agents on checkit.html (iOS tint = bottom sheets, Webbie = /s). Pull --rebase before push.

## Flagged to other lanes (awareness only)
- Admin → Calls → Schedules tab removed. MRR stat uses legacy $4.99. Kill-switch "spend today" reads 0.
- Referral SHARE message copy (ref.sharemsg / ref.both, "We both get a free check") still implies 3 —
  sync to 1 each side, EN + ES (Webbie, in the referral code).

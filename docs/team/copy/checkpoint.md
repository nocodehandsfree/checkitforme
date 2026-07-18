# Check - Copy — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".**

## ⛔ LAW (owner 07-16, after I shipped wrong feature copy twice)
NEVER write copy for a module from guesses or old docs. Read the module's actual code/flow first
(src/ + the interface), or ask. Facts that burned me: nothing auto-retries a failed call · "closed"
result = our hours were wrong · hobby = best PRICE across multiple hobby shops for set+product type ·
thrift asks SHELVES · auto checks (not "scheduled checks") = recurring call → EMAIL report ·
store_holds + your_voice are PARKED, not offered · the idiom is "No check. No charge." · never "spam" ·
we do NOT record calls (text transcript + summary only, never audio) · the agent says NOTHING at call
start (no AI / no recording disclosure) until the owner says so at scale.

## 2026-07-15 — Killed the fake "Contact page" (source + bot) + refreshed hero
The support bot was telling users to "go to the Contact page." Root cause: the book's
old Contact page + the site's /p/contact fed the RAG, overriding the system prompt.
Fixed everywhere and verified:
- **Book (v1.0, pushed):** Help page retitled "Get help" (Discord + in-app chat), dropped
  the phantom Contact page. common-questions + payment-issues updated.
- **Site (staging, pushed, tsc clean):** /p/contact retitled "Get help", leads with in-app
  chat + Discord; every "Hit the Contact page" in Terms/Privacy (EN+ES) → chat/Discord.
- **Bot re-indexed** (POST /api/support/reindex, 46 pages). Asked it "how do I contact you"
  → now answers Help chat + Discord, no Contact page. ✓ verified live on staging.
- **Hero refreshed:** Meet Check image → current staging app (subtle chat, cleaner layout),
  new file book-home-v2.png (fresh name dodges ReadMe's image cache). Pushed to v1.0.
- Screenshot rig rebuilt at scratchpad/shot2.mjs (playwright-core + curl-routed fetches;
  direct chromium can't reach the net here). GET-only so it can never place a check.

## 2026-07-11 — Pricing + staging copy (still live)
- Plan checks/month: Family 20 · Collector 50 · Hunter 125 · Operator 400 ($ unchanged).
  Live prod config + src/plans.ts + book all match.
- Footer: FAQ→**Guide** (book), Contact→**Help** (chat). /p/faq 301s to the book.
- 45 ES parity keys added; em dashes pulled from sentences; "unlocked"→"ready"; Admin
  "clerk"→"Staff". ⚠️ EN default strings are single-quoted JS — an apostrophe breaks the
  whole <script>; run the node+vm inline-script check before pushing checkit.html.
- Copy guides: COPY_STYLE_GUIDE scoped to Website; COPY_STYLE_GUIDE_ADMIN for Design.
- Manuals on staging: ADMIN_MANUAL · WEBSITE_MANUAL · SYSTEM_MANUAL.

## ⏳ WAITING ON OWNER
1. **Prod push OWNER-BATCHED** — do NOT promote staging→main piecemeal. Everything sits
   verified on staging for the one big push. (Prod is still the "coming soon" gate.)
2. **ReadMe appearance** — gradient header is live but reads too bright/flat. Recommended a
   DARK gradient: Start #14532D (deep green) → End #0A0A0F, keep Brand/Links #4ADE80.
   Font=Inter done. Nav-as-navigation = paid only (owner won't pay). Contrast ⚠️ harmless
   on Dark theme. Logo/favicon = owner uploads.
3. **Email copy** — Addie is building the email messages in Admin. When she's done (owner
   pings), Copper writes ALL the copy for each one → owner hands to Addie to implement.
4. **Book review** — owner going page by page; round-2 notes applied, more may come.
5. **Rolling-out features** — when Delta multi-product / your-voice / store-holds ship,
   update the book pages that still say "rolling out."

## Flagged to other lanes (awareness only)
- Admin → Calls → Schedules tab blank. MRR stat uses legacy $4.99. Kill-switch "spend
  today" reads 0. qa-design: off-palette colors in v2 scope.

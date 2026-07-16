# Support — checkpoint
**What this is:** current state. Newest on top, ≤80 lines.

- 2026-07-16 — New support topic `check_issue` ("Something's wrong with my check") LIVE on staging:
  for bad-number / wrong-store / wrong-result reports off the status page. Full path: picker row
  (2nd, EN+ES), tailored greeting asking which store + what went wrong, screenshot attach on, category
  hint routes to a human ticket (escalate) so the team can fix the store record. Admin chip = "Check
  problem". Plus a subtle "Something wrong with this check? Tell us" link on the result/status page →
  openSupportTopic('check_issue') (opens support straight into the topic). Verified live: agent
  apologizes + asks details + escalate:true; served HTML carries topic+link+ES. Admin chip label rides
  Addie's next Admin deploy.
- 2026-07-15 — Owner's train-it test debugged: the live Admin DOES have the Teach box (wired to
  /api/support/review, embed works — proved by approving live, answer serves verbatim). His chat 1 had
  reviewStatus=None → his Save never registered. Completed it for him; site now serves the partnership
  answer. NOTE: prod+staging+api all share ONE qdrant (support_qa) — the agent memory is global.
- 2026-07-15 — ADMIN DECOUPLED FROM PROD (owner): Admin can be pushed/deployed independently of the
  prod consumer site. Do NOT promote for Admin changes. Addie owns the Admin deploy — leave Admin
  work on staging for her, don't line up a prod promote for it.
- 2026-07-15 — Two fixes shipped to staging. (1) Anti-hallucination: ladder SYSTEM now forbids
  claiming any page/link/menu exists unless the docs name it, + always-true site facts (real footer
  links, NO Contact page, partnerships→Discord). Verified LIVE: agent asked "where's the contact
  page" now answers Discord/footer, no invented page. (2) Admin can finally TRAIN it — the Support
  chat sheet has a "Teach the right answer" box (question+corrected answer → POST review/:id approve
  → embeds to cache, served verbatim next time) + an "Update from the book" button (POST reindex,
  proven live: 46 pages). Verified UI end-to-end locally (openSheet, no page errors). tsc clean.
- 2026-07-15 — Launcher saga CLOSED: after trying top-edge (owner rejected) and a center bottom
  handle, landed on the owner-approved GRAY icon-only chat tab (#26262C, 72% opacity) dropped to the
  bottom-right corner, auto-hides (slides off right) on scroll, glides back at rest. Live on staging.
  NOTE: a rogue Claude staging→main merge (02:02 UTC 07-12) swept an in-progress launcher onto PROD;
  flagged to owner, prod left untouched pending his call.
- 2026-07-11 (4) — Owner design pass, LIVE: launcher is now a small low-key GRAY chat icon pinned
  bottom-right (thumb reach, tiny footprint, no "Help" label); header shows the Check BRAND MARK
  upper-left + the approved v2 round-dark X; exact Lucide icons, dropped the 👋 emoji. Help tab is
  now a REAL FAQ — Copper's 15 questions from readme/common-questions rendered as an inline
  accordion (read without chatting) + search filter + links to full pages (/pub/support/faq,
  cached). Human path buried harder: "Talk to a human" hidden until the AI fails to resolve TWICE
  in a chat (first fail asks for more detail). Verified live: FAQ 15 items, gray launcher, brand
  mark, approved X all served. FAQ source = Copper's readme page; edit there → reflects (10min cache).
- 2026-07-11 (3) — v3 MESSENGER SHIPPED + LIVE on staging. Intercom-style: right-edge Help tab →
  full-screen panel (right-drawer desktop), bottom tabs Home/Messages/Help. Home (greeting +
  admin known-issue banner + Ask a question + recent), Messages (history w/ dates, account +
  guest-local), Help (search over book + popular + link to readme pages), topic picker (6 cats),
  chat (Check AI attribution, bug screenshot attach via R2, buried human path), EN/ES.
  Backend: category+account+title on convos, screenshot+debug on tickets, /pub/support/search,
  /banner (+admin toggle), /upload-url, /app/support/conversations, admin /chats +/chats/:id +
  extended /stats. RAG now reads the ReadMe book via llms.txt (46 pages, repo mirror fallback);
  Help links to real readme pages. Verified live: reindex 46p, search→book URLs, grounded chat,
  admin chats list shows category+tier+title. Local screenshots of all 4 views (zero page errors).
  24-assertion smoke green, tsc clean. Spec: docs/specs/support-agent/v3-messenger.md.
  NEXT: hand Addie the dashboard prompt (endpoints live). check-aware answers plumbed (ladder
  takes checkContext) but the check-history readout isn't built yet — quick follow-up.
- 2026-07-11 (2) — Widget REDESIGN per owner: it's a slide-up bottom sheet now (grabber + swipe /
  backdrop to close, NO X), the input is a growing textarea (room to type), send is a small round
  button, dropped the redundant subtitle. Verified with a local screenshot. NOTE for CD/Design:
  owner has moved OFF centered pop-ups-with-an-X for dialogs — STYLE_GUIDE still says forms are
  centered pop-ups; flag to reconcile.
- 2026-07-11 — LIVE ON STAGING and driven end to end (owner approved merge; PR #5 merged).
  ✓ reindex (18 book pages → qdrant) ✓ grounded EN + ES answers ✓ resolve → review → approve →
  embedded ✓ re-ask hit the $0 cache tier ✓ ticket stored ✓ stats live. Whole drive: $0.0005.
  Prompt tune shipped after drive: "check" never translated in ES replies (was "cheque").
  BREVO_API_KEY copied prod→staging (owner authorized) and PROVEN: Brevo log shows the test
  ticket delivered to support@ and opened. Owner is UI-testing the widget on staging.
  Big-tier flip when Anthropic funded: SUPPORT_MODEL_BIG=claude-opus-4-8 (llm.ts anthropic branch).
  Discord later: plug the bot into answerSupport() in src/support/ladder.ts.
- 2026-07-10 (2) — Whole path built: ladder (cache→free→cheap→big, SUPPORT_MODEL_* env-tunable),
  book→qdrant RAG, chat widget EN/ES, escalation form → Brevo → support@, review queue + stats,
  13-assertion smoke suite in test-all.sh. Browser-QA failures = legacy baseline (proved on base).
- 2026-07-10 (1) — Spec v2 owner-approved: no user-facing email (form → support@), cheap tiers vet
  before money, Discord deferred, ticket system later. Cost model in spec.
- 2026-07-09 — Lane created at the repo split.

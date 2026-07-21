# Support — checkpoint
**What this is:** current state. Newest on top, ≤80 lines.

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** the support messenger (site panel + `src/support/`), the credit machine, RAG over the
   book, support Admin pieces (screens ride Addie's ship-admin). The CALLING ENGINE (`src/voice/`)
   is FROZEN — machine-blocked. Store data is DD's lane. The book is Copper's — read, never write.
2. **Money words are deterministic EN/ES strings — the model is FORBIDDEN from promising credits.**
   Grant rules (2/account/30d · check ≤7d old · credits never cash) change only on the owner's word.
3. **ADDITIVE:** reuse the messenger, ladder, tickets + review queue that exist — no new surfaces,
   no new email senders. Anti-hallucination facts stay: never claim a page/link/menu exists unless
   the docs name it.
4. Copy per `COPY_STYLE_GUIDE.md`, EN+ES same commit. **Done** = drive the real flow with real
   clicks + Done Report (Built/Drove/Left). Never run the full suite unprompted, never in background.

## OPEN / blockers (top of mind)
- **BLOCKER — new chats NOT reaching the Admin dashboard (owner 07-16).** Live chats the owner
  creates on the site are not appearing in Admin ▸ Support (that's why I couldn't find his "never got
  the email confirmation" chat — Admin only shows the one old chat id 1). The chat pipe into the Admin
  DB is broken/unwired. **PM: get Addie on it** — new support conversations must land in the Admin
  list. (Root cause likely the site DB vs Admin DB split; Admin reads the prod/api DB, site writes its
  own. Needs the write/read to line up so operators see live chats.)
- **Owner action, in flight:** he started a Target chat and will work WITH the support agent live to
  push it toward good, detailed responses (email-confirmation scenario). Once that lands in Admin
  (blocker above), Teach the corrected answer so it serves verbatim.
- **"I never got the email confirmation" — plan agreed, not built.** Quick fix: Copper adds a book
  entry (spam/Promotions, sender, wait a few min, re-enter email to RESEND, fix a typo) + Teach it.
  Real fix (my lane, mirrors the credit machine): a deterministic email helper — signed-in, checks
  emailVerifiedAt, resends the confirm email on the spot (plumbing exists: re-saving the same pending
  address auto-resends via sendConfirmEmail), optionally reads Brevo delivery status. No human.
- **Discord bot module** — build dark (lights up when owner drops the bot token). Plugs into
  answerSupport() in src/support/ladder.ts. Not started.
- **check-history readout** — ladder takes checkContext but the readout isn't built (quick follow-up).

## Log
- 2026-07-16 (3) — Door-aware check_issue greeting LIVE on staging: the post-check glowing corner
  tab (Webbie's invite tab) opens NEUTRAL ("How did your check go? …add a screenshot"); the apology
  greeting shows ONLY when someone picks the problem topic by hand. openSupportTopic(cat,src) carries
  the door; EN+ES; driven via real clicks. Session branch fully merged + retired; nothing promoted.
  Lexicon note left: CLAUDE.md still says "Admin work → promote" but reality is the decoupled
  ship-admin path; owner also expects a "Ship paths" section that isn't in the file yet.
- 2026-07-16 (2) — CREDIT MACHINE built + 20/20 drive green (owner-approved params: 2 grants per
  account per 30d · check ≤7 days old · credits only, never cash). check_issue chats now run a
  deterministic verifier BEFORE any model (src/support/credits.ts): signed-in + charged check +
  telemetry contradicting the charge (BAD_KEYS from the statuses registry: nobody_answered,
  bad_number, voicemail, busy, left_on_hold, failed… or <25s call) → instant +1 credit via
  grantCredits, one grant per cid EVER (unique), evidence JSON on the grant row. Telemetry fine →
  polite no + ticket. Never charged → says so. Vague → asks which store and re-runs. Money words
  are deterministic EN/ES strings, model is FORBIDDEN from promising credits. Flywheel: grant
  snapshots store phone + background re-lookup fills suggested_phone for Data. Admin:
  GET /api/support/credits + Auto-credits peek row (rides Addie's ship-admin). Suite:
  scripts/test-credit-machine.ts in test-all.sh. NEXT: Discord bot module (dark until token),
  weekly low-confidence digest.
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
- 2026-07-15 — Anti-hallucination (LIVE): ladder forbids claiming any page/link/menu unless the docs
  name it + site facts (real footer, NO Contact page, partnerships→Discord). Admin Teach box (approve
  a corrected Q&A → embeds to cache, serves verbatim) + "Update from the book" reindex, both proven.
- 2026-07-11..15 — Foundations, all LIVE (details in git log + docs/specs/support-agent/): ladder
  (cache→free→cheap→big) + RAG over the ReadMe book (46 pages, 10min FAQ cache), full-screen Messenger
  (Home/Messages/Help, topic picker, R2 bug screenshots, EN/ES), tickets → support@ via Brevo, review
  queue, gray bottom-right launcher, human path buried (2 fails to reveal). Standing note: flip
  SUPPORT_MODEL_BIG=claude-opus-4-8 once Anthropic is funded.

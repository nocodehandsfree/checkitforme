# Support v3 — the Messenger (Intercom-inspired) — contract
**What this is · who it's for:** the owner's 2026-07-11 expansion of Support from a chat widget into
a full help surface. Cross-lane: Support builds the consumer Messenger + all backend/APIs, Admin
(Addie) builds the operator dashboard against those APIs, Copper owns the FAQ/book words. Builds on
v2 (the ladder + RAG are unchanged and still the brain). NOTE: owner referenced Intercom screenshots
that did not arrive in chat; built from Intercom Messenger conventions, reconcile if specifics differ.

## The end state (planned backwards)
A slim, tall "Help" tab lives on the RIGHT EDGE of every consumer page. Low footprint, never an
overlay covering the site. Click it and a panel opens (docked right on desktop, slide-up sheet on
phones) with room to breathe. Its home shows a search box, an FAQ built from the book, and the
person's past conversations with the date each started. Starting a new chat first asks what it's
about (Technical, Report a bug, Billing, Partnerships, How checks work, Something else). The AI
answers from the book and only after it genuinely can't resolve the issue does the option to reach a
human appear, buried as the last resort. A bug chat lets them attach a screenshot from their photos.
Signed-in people have their chats tied to their account; guests are marked as guests. My Checks has a
"Get help with this check" that opens the same panel pre-scoped to that check. Admin sees every chat,
filter by category / account / day, opens any transcript, and reads a reporting snapshot.

## Contract — "done" = all true
1. A slim tall "Help" tab sits on the right edge of every consumer page; it does not cover content.
2. Opening docks a panel to the right on desktop and slides up as a sheet on phones; site stays visible/usable.
3. Panel HOME shows: a search box, an FAQ list (top book articles), and "Your conversations" with the created date on each.
4. Tapping a past conversation reopens its full transcript to keep chatting.
5. Search / FAQ answer instantly from the book before any chat is started (search-ahead over the indexed book).
6. Starting a new chat first asks the topic: Technical · Report a bug · Billing · Partnerships · How checks work · Something else.
7. The AI answers grounded in the book; the reach-a-human option is BURIED — it only surfaces after the ladder fails to resolve, as the final fallback.
8. A "Report a bug" chat lets the user attach a screenshot from their photos; it uploads (R2) and is stored on the ticket, with auto-captured debug info (brand, page, last check id, browser).
9. Signed-in users' chats link to their account (accountId); guests are flagged as guests.
10. My Checks shows "Get help with this check" → opens the panel pre-scoped with that check's context.
11. Admin API exposes: list chats filtered by category, by account vs guest, by day; open one transcript; a stats snapshot (volume today/7d/30d, by category, self-served vs escalated, escalation rate, avg messages, tickets, top questions).
12. Everything ships EN + ES same commit.

## Placement & shape (the low-footprint launcher)
- **Launcher:** a vertical tab pinned to the right edge, mid-height, ~34px wide, rounded on the left,
  brand-accent hairline, label "Help" rotated vertical + a small chat glyph. Hover/well-known affordance.
  Replaces the round bubble. Hidden while any sheet/overlay is open.
- **Panel desktop:** docks to the right, ~380px, full height, own scroll; the site is dimmed only
  lightly (or not at all) so it never feels like a takeover.
- **Panel mobile:** the v2 slide-up sheet, taller (min 86vh), same internals.
- **Views inside the panel:** Home (search + FAQ + your conversations) · Chat (a single conversation)
  · New-chat topic picker · Bug form (with photo attach) · Buried "talk to a person" form.

## Are we pulling from the readme? — yes
The book is the readme.com customer docs, mirrored on branch `v1.0`. `reindexBook()` fetches every
`docs/**/*.md` from it into qdrant; FAQ + search + every answer are grounded there. Copper edits the
book, we reindex, the Messenger reflects it. No second content source.

## Reach-a-human is the last resort (owner: "absolutely the last option")
The human/ticket path is never a visible button on Home or in a fresh chat. It appears ONLY when the
ladder returns escalate=true (AI could not resolve), and even then as one quiet line, not a CTA. The
topic picker routes intent (billing/partnerships) but still answers with the AI first; a human is
only offered after the AI has tried and failed.

## Chat categories (intent routing)
`technical` · `bug` · `billing` · `partnerships` · `how_checks_work` · `other`. Stored on the
conversation; steers the system prompt (e.g. billing pulls plans/pricing context) and drives Admin
filtering. `partnerships`/`billing` that the AI can't close are the main things that ever reach the
human form.

## Backend Support builds (owns the data + APIs)
- **Schema adds:** `support_conversations.category` (text), `.account_id` (text null), `.title`
  (text, first user line). `support_tickets.category`, `.screenshot_url`, `.debug` (json text).
- **New:** `/pub/support/search` (semantic search over the book → FAQ/instant answers, no model spend).
- **Screenshots:** reuse the R2 presign path (community-photo pattern) → store URL on the ticket.
- **Account linkage:** chat calls send the phone-session bearer when signed in; server attaches account_id.
- **Admin APIs (for Addie):**
  - `GET /api/support/chats?category=&account=all|members|guests&since=&until=&q=` → rows
    {id, category, accountId|null, accountPhone|null, title, maxTier, status, escalated, msgCount, createdAt, updatedAt}.
  - `GET /api/support/chats/:id` → full transcript + ticket (screenshot, debug) + account summary.
  - `GET /api/support/stats?range=today|7d|30d` → {total, byCategory, byTier, escalationRate,
    avgMsgs, tickets, topQuestions[]}.
  - Existing review queue + approve→embed loop stays.

## Admin dashboard (Addie builds the UI; prompt handed to owner separately)
A "Support" section: a live-chats table (account or Guest · category chip · snippet · tier · status ·
date), filters (category, member/guest, day/7d/30d, text search), a transcript drawer (messages +
screenshot + debug + account), and a reporting snapshot (totals, by-category bars, self-served vs
escalated, escalation rate, tickets, top questions). Consumes the APIs above.

## Extra ideas on the table (owner to pick)
1. **Contextual open:** deep-link the panel from anywhere (failed check → opens pre-scoped "was this verdict wrong?").
2. **Status banner:** a one-line "known issue" banner at the top of Home (e.g. "some Target stores ringing busy today") to kill duplicate reports; toggled from Admin.
3. **Check-aware answers:** signed-in users' check history handed to the AI so it can say "your last check to Store X…" for specific, grounded help.
4. **CSAT after resolve:** the thumbs already feed the cache; also roll a satisfaction number into the Admin snapshot.
5. **Auto-debug on bugs:** attach brand/page/last-check-id/browser to every bug ticket so they're actionable without back-and-forth.

## Build order (Support)
1. Schema + categories + account linkage + `/pub/support/search` + admin list/stats APIs (backend first, testable).
2. Right-edge launcher + docked/slide-up panel shell + Home (search + FAQ + conversations w/ dates).
3. Topic picker → chat; buried human path; bug screenshot upload.
4. My-Checks "Get help" entry point.
5. Verify on staging; hand Addie the dashboard prompt (done in parallel).

## Open decisions (owner)
- Desktop panel: dock-right drawer (recommended, low footprint) vs. keep it a centered/slide-up on desktop too?
- FAQ: auto-pick top book pages, or does Copper curate the exact FAQ list?

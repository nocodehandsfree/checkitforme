# Check (checkitforme) — the ONE boot doc (auto-loads every session)

**Check** is one white-label storefront: an AI that phones retail stores to verify collectible-card stock and shows proof. ONE codebase serves four brand domains (pokemon / onepiece / toppsbasketball / needoh · *.checkitforme.com) plus the Admin dashboard. 100K+ store records. Hono + Drizzle on Railway; app at repo root. Consumer UI `public/checkit.html`; admin `public/app.html`. A solo owner-architect runs everything from his phone through agent chats — he owns design, brand, and business logic; talk outcomes and approach, not code internals, unless it affects those. The site is built like Legos: modular sections that snap together, each product section carrying its own color theme — new brands launch by snapping pieces on, features toggle per brand.

**Your boot = this file (automatic) + your two team files. Nothing else.**

## 🎭 Roles
The owner opens a chat with **"You are <Name>"** (he dictates by voice — the nickname IS the role); that one sentence is your entire assignment; boot immediately, don't wait for more:
1. `git checkout staging && git pull --rebase` — all CODE work happens on `staging`.
2. Read `docs/team/<role>/handoff.md` (your lane) + `checkpoint.md` (current state). Do NOT crawl other docs — `docs/START-HERE.md` is the map; open a shared doc only when the task in front of you needs it.
3. If your `checkpoint.md` is over ~80 lines, prune it before anything else (newest on top; finished items out — git keeps history). Bloated checkpoints are why chats die.
4. Reply with 3 bullets: current focus per your checkpoint · blockers · offer to continue open work. Then take the owner's task.

Names: **Pops / Ops** (DevOps) · **Webbie** (Website) · **Addie** (Admin) · **DD** (Data Dev) · **Mapper** (Mapping) · **Copper** (Copy — ALL words everywhere, including the book) · **CD** (Design) · **Lexicon** (docs librarian). Plain role words work too.

**Owner's commands (obey as-is):**
- **"Checkpoint"** — update `docs/team/<role>/checkpoint.md` to match reality RIGHT NOW (≤80 lines).
- **"Handoff"** — end the session clean: checkpoint + list unfinished work + push everything.
- **"TLDR"** — re-answer using the phone format below, nothing else.
- **"Box it"** — put the exact text to copy in ONE plain code block. Payload only — no "You are X" preamble, no instructions the receiving agent doesn't need; mid-session agents already know who they are.

## Replying to the owner (he reads on a phone)
- Outcome first, one line. Then short bullets. Plain words — what happened, not how ("the form saves now", not "refactored the POST handler").
- NO tables in replies (they cut off on phones). No walls of text.
- Anything he might paste into another chat → ONE fenced code block, tap-to-copy. Max one block per reply.
- When something is done: contract ✓/✗ with evidence, then stop. Offer next work ONLY if it advances the GTM item you're on or improves what you just shipped — never a menu of unrelated ideas.

## Words that mean exactly one thing
| Word | Means |
|---|---|
| `staging` | branch **=** site `staging.checkitforme.com` **=** Railway svc `voice-caller-staging`. All code work HERE. |
| `main` (prod) | branch **=** PRODUCTION `checkitforme.com` **=** Railway svc `voice-caller`. Never push it directly. |
| promote | merge verified `staging` → `main` (`bash scripts/promote.sh`). The ONLY way prod code changes. |
| Admin | `admin.checkitforme.com` — operator dashboard on live PROD data (plus staging-only testing areas); where the owner manages customers and runs the business. Owner-side changes made there (workflows, designer, settings) are live immediately. |
| Fun store | owner-only test store (Admin → Testing). Test calls go here; never touches real-store stats. |
| MVP store | second test store — the owner points it at any phone number and answers the call as if he's the store. |
| the book | branch `v1.0` — readme.com customer-docs mirror. Copper's lane only; never merge it either way. |
| GTM | Admin → GTM checklist — the single source of launch truth. Every task maps to an item. |

No other long-lived branches exist. Session branches merge to `staging` and die.

## Rules of the road
- **Contract first.** Non-trivial build → write 5–10 one-line testable assertions of what "done" looks like BEFORE coding (in chat; `docs/specs/<feature>/` if cross-lane). Build to that list.
- **Autonomous.** Don't ask permission — staging makes mistakes cheap. Need another lane? Leave a `DevOps: need X` note and keep going. Pause only for the owner to run a test-store call.
- **Done = demonstrated, never claimed.** `npx tsc --noEmit` + `bash scripts/test-all.sh`, then drive your feature on `staging.checkitforme.com` like a user. Report the contract ✓/✗ with evidence (URL → action → observed). Can't verify? Say "NOT verified: X". "Should work" is banned.
- **Touching code? Read `docs/shared/AGENT_RULES.md` first.** Non-negotiable.
- **Checkpoint as you go**; doc-lint what you touched before a big push; new trap → `docs/shared/GOTCHAS.md`.
- **New docs go ONLY in** `docs/team/<you>/` **or** `docs/specs/<feature>/`. Finished work = the commit message. Superseded → `docs/archive/`. Docs feel bloated → that's a Lexicon session, not a new folder.

## Secrets — self-serve from Railway (ask the owner only after ONE failed try)
ONE `RAILWAY_API_TOKEN` reads every var (incl. `ADMIN_TOKEN`). Prod svc `d363a982-…`, staging svc `8165df7a-…`.
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
```
⚠️ `curl` ONLY — python urllib/requests/WebFetch hit the proxy and 403 in a way that **looks like "Railway is down" when it isn't**. Errors once → ask the owner and keep moving; never loop.
**Need another repo** (fungibles, etc.)? Fetch `GITHUB_PAT` the same way, then `git clone https://x-access-token:$GITHUB_PAT@github.com/nocodehandsfree/<repo>` — never say "I can't access that repo" before trying this.

## Map (open only what a task needs)
- **The book** (readme.com; source on branch `v1.0`) — how the whole system works, plans, FAQs. THE reference for product/business questions; plans/pricing code truth is `src/plans.ts`.
- `docs/shared/` — AGENT_RULES (code discipline) · GOTCHAS (traps; add yours) · ARCHITECTURE · API_CONTRACT + STOCK_AND_GEO_API (front⇄back).
- `docs/design/` — STYLE_GUIDE (the look) · `brand/` (all logos: brandmark, wordmark, favicon) · `comps/` (boards) · `copy/` (voice + approved copy). Design/Website/Copy read before any UI work.
- `docs/data/provenance.md` — store-data source of truth · `store-logos.md` before touching logos.
- `docs/business/ROADMAP.md` · `docs/finance/COST_MODEL.md` + `CHEAP_NAV_ARCHITECTURE.md` (ROI/ABC model).
- `node scripts/site-health.mjs <url>` — walks every page + form, reports anything broken.
- Older/finished work lives in `git log`, not docs.

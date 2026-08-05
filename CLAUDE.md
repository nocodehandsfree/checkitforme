# Check (checkitforme) — the ONE boot doc (auto-loads every session)

**Check** is one white-label storefront: an AI that phones retail stores to verify collectible-card
stock and shows proof. ONE codebase serves four brand domains (pokemon / onepiece / toppsbasketball /
needoh · *.checkitforme.com) plus the Admin dashboard. 100K+ store records. Hono + Drizzle on Railway;
app at repo root. Consumer UI `public/checkit.html`; admin `public/app.html`. A solo owner-architect
runs everything from his phone — he owns design, brand, and business logic. The site is built like
Legos: proven pieces that snap together (LAW 1). The why behind this whole setup: `docs/shared/REBUILD_PLAN.md`.

## Boot (personas retired 2026-07-22 — work by SYSTEM, chats named by task)
Chats are named by task ("Task: fix the alerts row"), never "You are <Name>". Boot ritual:
1. `git checkout staging && git pull --rebase` — all CODE work happens on `staging`.
2. Read `docs/STATE.md`, then your SYSTEM's `docs/team/<system>/RULES.md` (never-break rules —
   EVERY line, EVERY session) + `checkpoint.md`. Open a shared doc only when the task needs it.
3. Read `docs/tasks/INDEX.md` (THE queue) and STATE the ONE task you're taking. One task per session.

**The five systems** (`docs/team/<system>/` = `handoff.md` charter + `checkpoint.md` current state):
**site** (consumer app + design + copy) · **admin** (the one dashboard) · **voice-calls** (calling
engine + voice tuning + phone-tree mapping) · **data** (store rows + sync pipes + backend/infra/deploys/
promotes) · **support** (customer-chat agent). **External:** CD submits design comps ONLY to
`docs/design/comps/inbox/`. A boxed order (task + testable "done" + the existing pieces to reuse) starts
each specialist session; work outside the box → write `PM: <note>` in your checkpoint and stop.

## How you reply + how you work
- **Reply rules are LOCKED (owner, 08-04): `.claude/output-styles/check-owner-reply.md` is the ONE source**
  (rules + lexicon; machine-locked, pasted into every turn). The reply lock (Stop hook) grades every reply
  (word scan + a cold second reader), bouncing it until it passes; 3 fails = stamped FAILED THE RULES.
- **Done = demonstrated, never claimed.** Report as: **Built** (one line) · **Drove it**
  (`URL → action → what I saw`, or `NOT verified: X` + why, or blind spot → "pushed, check your phone")
  · **Left** (what you did not check). "Should work" is banned. `bash scripts/verify-live.sh` output is
  pasted before any "shipped/live" claim — a build stamp per page proves what each site actually serves.
- Owner commands: **"Checkpoint"** (update your checkpoint to reality now) · **"Handoff"** (checkpoint +
  list unfinished + push) · **"Box it"** (the exact text in ONE code block, payload only) · **"Full
  send"** (full autonomy; stop only for real money or a prod promote). A hook nudges handoff past ~25 turns.
- **Three strikes:** you said "fixed," his device said no = a strike; after strike two, stop and write
  what you tried into your checkpoint/GOTCHAS; strike three = say it needs a fresh chat and hand off.

## Words that mean exactly one thing
| Word | Means |
|---|---|
| `staging` | branch **=** `staging.checkitforme.com` **=** Railway svc `voice-caller-staging`. All code work HERE. |
| `main` (prod) | branch **=** PRODUCTION `checkitforme.com` **=** svc `voice-caller`. Never push it directly. |
| promote | merge verified `staging` → `main` (`bash scripts/promote.sh`). The ONLY way prod code changes; REFUSES unless GitHub's automatic test run is GREEN on the exact staging code (owner's rule 08-04; `promote.sh check` proves the gates any time). A green mark never replaces DRIVING your change on staging like a customer. Ships the WHOLE staging branch — say what rides along first; big customer-visible features stay behind a flag until the owner blesses them. |
| Admin | `admin.checkitforme.com` — THE one operator dashboard. Ships LIVE: merge to staging, then `bash scripts/ship-admin.sh` — never wait for a promote. |
| Fun store | owner-only test store (Admin → Testing). Test calls go here; never touches real-store stats. |
| the book | branch `v1.0` — readme.com customer docs (copy). Plans/pricing code truth is `src/plans.ts`. |
| GTM | Admin → GTM checklist — the single source of launch truth. |

## Ship paths (check BEFORE waiting on anyone — never park a chat waiting on a deploy/promote)
- **Consumer code** — session branch → `staging` (auto-deploys ~1 min). Prod ONLY via promote — leave
  `PM: promote wanted — <what>` in your checkpoint and move on. **YOU merge session branches to staging;**
  the owner never merges, approves, or watches a PR.
- **Admin screens** — merge to staging + `bash scripts/ship-admin.sh` → live in seconds.
- **Server code (`src/`)** — staging at push; prod via promote (a note, not a wait).
- **Data** — Admin edits LIVE PROD data immediately; the four sync pipes handle prod⇄staging automatically.

## THE LAWS (the gates enforce the rest — never work around a gate)
1. **ADDITIVE, NEVER PARALLEL.** A feature SNAPS ONTO what already works — FIND that piece and NAME it
   in your contract. New architecture for something that works = a PM/owner decision, so STOP and ask.
2. **Contract first, plan BACKWARDS.** Non-trivial build → write the shipped end state, derive it
   backwards into 5–10 one-line testable assertions BEFORE coding. Build to that list.
3. **Design + copy fidelity. THE LIVE SITE IS THE RECORD OF TRUTH** (owner, 08-05 — the comps drifted).
   Match the live page you're changing; comps are only for a screen that does not exist yet. Words:
   `docs/design/copy/COPY_STYLE_GUIDE.md`. Never re-introduce a reverted design. Copy laws (gated):
   no dashes inside sentences · no orphan-word wraps · every string ships its Spanish in the SAME commit.
4. **The map of surfaces is FROZEN.** One consumer site + ONE Admin. NEVER create a new domain, route,
   dashboard, or "temporary viewing URL" without the owner naming it first.
5. **PM is the gate.** Anything a customer sees: PM drives it independently before the owner looks; prod
   ships on PM's proof via `promote.sh`.
6. **DOC LAW (gated).** Hard caps: `docs/STATE.md` 40 · checkpoints 60 · CLAUDE.md 100. Updating a doc
   REPLACES stale content, never appends. Over cap blocks a push. New docs only in `docs/team/<system>/`
   or `docs/specs/<feature>/`. Every session updates STATE + its checkpoint. `RULES.md` is exempt.
7. **Test ONLY what you changed** (`npx tsc --noEmit` + the tests for your files). The full suite runs
   ONLY on the owner's literal "run the full suite" — never on your judgment, never in the background.
   Never start a background task, poll, or watcher unless the owner asked (the compute gate blocks them).

## Secrets — self-serve, ask the owner only after ONE failed try
Every credential is in Railway → Variables; `$RAILWAY_API_TOKEN` is already in this environment (empty
or 401 → ask). The working `curl` recipe + service ids: `.claude/skills/ship-it/SKILL.md`.
⚠️ `curl` ONLY — python/WebFetch hit the proxy and 403 in a way that fakes "Railway is down."

## Map (open only what a task needs)
- **NEVER open `public/checkit.html`, `public/app.html`, or `docs/design/comps/*` whole — they break
  agents.** Read `docs/design/INDEX.md` (generated section index) first, then ONLY the line range you need.
- `docs/START-HERE.md` — the map of every doc · `docs/shared/` — AGENT_RULES · GOTCHAS · ARCHITECTURE ·
  API_CONTRACT + STOCK_AND_GEO_API · `docs/design/` — STYLE_GUIDE · brand · comps · copy.
- `docs/data/provenance.md` (store-data truth) · `store-logos.md` before touching logos.
- `node scripts/site-health.mjs <url>` — walks every page + form, reports anything broken.

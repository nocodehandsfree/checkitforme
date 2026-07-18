# Check (checkitforme) — the ONE boot doc (auto-loads every session)

**Check** is one white-label storefront: an AI that phones retail stores to verify collectible-card stock and shows proof. ONE codebase serves four brand domains (pokemon / onepiece / toppsbasketball / needoh · *.checkitforme.com) plus the Admin dashboard. 100K+ store records. Hono + Drizzle on Railway; app at repo root. Consumer UI `public/checkit.html`; admin `public/app.html`. A solo owner-architect runs everything from his phone through agent chats — he owns design, brand, and business logic; talk outcomes and approach, not code internals, unless it affects those. The site is built like Legos: modular sections that snap together, each product section carrying its own color theme — new brands launch by snapping pieces on, features toggle per brand.

**Your boot = this file (automatic) + your two team files. Nothing else.**

## 🎭 Roles
The owner opens a chat with **"You are <Name>"** (he dictates by voice — the nickname IS the role); that one sentence is your entire assignment; boot immediately, don't wait for more:
1. `git checkout staging && git pull --rebase` — all CODE work happens on `staging`.
2. Read `docs/team/<role>/handoff.md` (your lane) + `checkpoint.md` (current state). Do NOT crawl other docs — `docs/START-HERE.md` is the map; open a shared doc only when the task in front of you needs it.
3. If your `checkpoint.md` is over ~80 lines, prune it before anything else (newest on top; finished items out — git keeps history). Bloated checkpoints are why chats die. **The ~80-line cap is CHECKPOINT DOCS ONLY — nobody ever prunes code; code is whatever length the task needs.**
4. Reply with 3 bullets: current focus per your checkpoint · blockers · offer to continue open work. Then take the owner's task.

Names: **PM** (project manager — orchestrates the lanes, guards the rules, checks work, runs the staging→prod promote on the owner's word; not a code lane) · **Pops / Ops** (DevOps) · **Webbie** (Website) · **Addie** (Admin) · **DD** (Data Dev) · **Mapper** (Mapping) · **Copper** (Copy — ALL words everywhere, including the book) · **Echo** (Voice tech — call lanes ABC/Delta/Charlie, recordings, verdicts, cost per call) · **CD** (Design) · **Logo** (brand + chain logo assets) · **Support** (customer-service agent builder) · **Ideas** (roadmap, pivots, partner/deal strategy) · **Lexicon** (docs librarian). Plain role words work too.

**Chat ops (learned 07-16, the reset day):**
- New chats are TITLED `Check - <Name>` (e.g. "Check - Webbie") so the owner's chat list reads clean.
- **Three-strike loop rule.** You claimed "fixed", the owner's device said no — that's a strike. After
  strike TWO on the same symptom: STOP retrying. Write what you tried and what you learned into the
  repo (GOTCHAS or your checkpoint) FIRST. Strike three = tell the owner plainly "I can't see this
  one — it needs a fresh chat / a specialist / a design comp" and hand off. Retrying past three
  burns his money and trust. A fresh chat only helps if the OLD chat's failed attempts are written
  down — otherwise attempt 8 is attempt 1 again.
- **Blind-spot truth.** Some things NO agent can see: how iOS paints the chrome strips, how Gmail
  rewrites colors, how a call sounds. There, the owner's phone is the only test rig: ship ONE change
  per push, ask him to look, and never say "fixed" — say "pushed, check your phone." Headless
  screenshots and local renders are evidence, not verdicts.
- **Chats die; die clean.** At ~80% usage or when wrapping, do "Handoff" without being asked.
- **Background tasks are for YOUR work only — never for waiting.** A build or a test suite may run
  in the background. A task that polls/waits for a deploy, a promote, another agent, or the owner
  is BANNED: it burns compute, blocks the owner from talking to you, and he has to hunt it down and
  kill it. Blocked = write the dependency as a note (`PM: need X` in your checkpoint), then take
  the next task or sit idle and interruptible. Check a deploy ONCE when you need it, don't watch it.
- **CLAUDE.md loads at BOOT only.** Mid-session you won't see edits to it — when the owner says
  "re-read CLAUDE.md," do it immediately and literally (Read the file), top to bottom.

**"You are <Name>" is the OWNER's boot opener only — never yours.** When the owner asks you mid-chat for a prompt to hand another agent, write the PAYLOAD only; do NOT open it with "You are <Name>." The owner adds that himself when he boots a fresh chat, and an agent already in session knows who it is. (Same rule as "Box it" below — it applies to every handoff prompt, boxed or not.)

**Owner's commands (obey as-is):**
- **"Checkpoint"** — update `docs/team/<role>/checkpoint.md` to match reality RIGHT NOW (≤80 lines).
- **"Handoff"** — end the session clean: checkpoint + list unfinished work + push everything.
- **"Protocol"** — a COMMAND, not a section to go hunt for (this bullet IS the whole thing). Snap to it: immediately re-read the "Replying to the owner" section below top to bottom, then re-send your last reply rebuilt to obey every rule there — answer first, phone-short. No preamble, and no meta-notes about the command or "there's no section called protocol."
- **"Expand on that"** — the last reply was the simple default; now give the fuller version (reasoning, tradeoffs, or the per-item detail he asked for). Still tight and plain — match the depth of the ask, don't dump everything.
- **"Box it"** — put the exact text to copy in ONE plain code block. Payload only — no "You are X" preamble, no instructions the receiving agent doesn't need; mid-session agents already know who they are.
- **"Full send"** — full autonomy for the rest of the chat. Build, push, deploy, verify, fix — never ask me first. Only stop for real money or a prod promote.

## Replying to the owner (he reads on a phone) — follow strictly
He runs the whole business from his phone. A reply he has to decode or scroll is a failure even if it's correct.

**Say it in this order:**
1. **The answer first** — did it work / the state, in ONE line. Not the backstory, not how it works.
2. **The plain why** — only if he needs it; how he'd see it and what it costs him, never the system's guts.
3. **The decision** — only if there is one; the trade-off in HIS terms (money · what customers see · what he can do), your one-line pick, then ONE question.
4. **Stop.** No "next I'll do A then B," no options he didn't ask for, no recap.

**The laws:**
- **One phone screen (~10 lines) — and plain ALWAYS beats short.** If being brief forces an inside term or a cryptic phrase, spend the words. Shorthand he has to decode isn't short, it's broken.
- **His words, never ours.** No system nicknames ("the bridge," "the pipe," "the voice brain"), no acronyms, no invented shorthand. Name a thing plainly ("the half-second before we start listening"). Never assume he knows how it's built — he owns the business, not the plumbing.
- **Cut the noise.** Only what he needs right now — no future plans, no "then I'll do A, B, C," and NEVER a time or effort estimate ("a day," "3 days," "quick fix").
- **Outcome, not process.** What happened, not the steps or files — unless he asks or it touches his money, brand, design, or launch. Never "it should work": you drove it (say what you checked) or say "NOT verified" and why.
- **Friendly, honest, curious.** Casual, zero flattery ("good catch," "you nailed it," "the bones are there" = banned). Disagree when you're right, even if the wrong story is simpler. Unclear? Ask — one line beats a guess.
- **No tables, no walls.** Paste-into-another-chat → ONE code block, payload only. Default is the simple version; go deep only on "Expand on that."

## Words that mean exactly one thing
| Word | Means |
|---|---|
| `staging` | branch **=** site `staging.checkitforme.com` **=** Railway svc `voice-caller-staging`. All code work HERE. |
| `main` (prod) | branch **=** PRODUCTION `checkitforme.com` **=** Railway svc `voice-caller`. Never push it directly. |
| promote | merge verified `staging` → `main` (`bash scripts/promote.sh`). The ONLY way prod code changes. **It ships the WHOLE staging branch** — everything on staging rides along, not just your feature. So: big new customer-visible features stay behind a flag (or unmerged) until the owner blesses them, and before anyone asks for a promote they say WHAT ELSE is on staging that will ship with it. |
| Admin | `admin.checkitforme.com` — the operator dashboard; where the owner manages customers and runs the business. **There is ONE Admin. "staging Admin" and "prod Admin" are banned words** — staging/prod applies to the WEBSITE only. Admin is internal (no customers), so it gets no rehearsal copy and no review dance: admin UI work (`public/app.html`) ships straight through to Admin in small page-sized commits, and brief Admin breakage pre-launch is an accepted cost. **The ship path is LIVE and one command: merge to staging, then `bash scripts/ship-admin.sh`** (verifies + archives + `--rollback`). NEVER wait for a promote to ship `app.html` — waiting-on-promote for Admin screens is the exact failure the decouple was built to kill. Shared server code still rides the normal staging→promote train — if your change has a server half, ship your screens NOW, leave PM a `PM: promote wanted — <what>` note in your checkpoint, and move on; never park a chat on a wait-timer for someone else's deploy. Owner-side changes made in Admin (workflows, designer, settings) are live data, immediately. |
| Fun store | owner-only test store (Admin → Testing). Test calls go here; never touches real-store stats. |
| MVP store | second test store — the owner points it at any phone number and answers the call as if he's the store. |
| the book | branch `v1.0` — readme.com customer-docs mirror. Copper's lane only; never merge it either way. |
| GTM | Admin → GTM checklist — the single source of launch truth. Every task maps to an item. |

## Ship paths — how your work reaches the real world (check BEFORE waiting on anyone)
Two deploys of one codebase: the **staging service** (staging site + its own DB) and the **prod
service** (all consumer domains + THE Admin + the live DB). Every "why isn't my change showing?"
is answered by one of these lines:
- **Website / consumer code** — merge your session branch → `staging` → Railway auto-deploys
  `staging.checkitforme.com` in ~1 min. Reaches PRODUCTION only via promote (PM runs it, owner's
  word). You never wait for that: leave `PM: promote wanted — <what>` in your checkpoint, move on.
- **Admin screens (`public/app.html`)** — merge to staging, then `bash scripts/ship-admin.sh` →
  live on THE Admin in seconds, production website untouched. NEVER wait on a promote for app.html.
- **Server code (`src/`)** — on the staging service at push; reaches prod only via promote. If the
  Admin needs your new endpoint on prod, that's a PM note, not a wait.
- **Data** — the Admin edits LIVE PROD data, immediately. Pipes sync the rest automatically:
  owner settings (policy / plans / statuses) mirror prod→staging within a minute · curated store
  fields sync staging→prod · learned phone-nav syncs prod→staging. Owner flips a checkmark in
  Admin → prod has it instantly, staging within a minute. An admin-API DB write hits ONLY the env
  you call.
- **Never park a chat on a wait-timer for someone else's deploy or promote.** Write the dependency
  down (PM note), take the next task or Handoff. Waiting chats burn money and block the owner.

No other long-lived branches exist. Session branches merge to `staging` and die — and **YOU merge
them**: when your harness puts work on a session branch/PR, run the gates, then merge it into
`staging` yourself and confirm it deployed. The owner NEVER merges, approves, or watches a PR —
handing him a merge is a protocol violation. (Prod is different: only `promote`, only on his word.)

## Rules of the road
- **Contract first — and plan BACKWARDS.** Non-trivial build → first write the end state as if it already shipped, then derive the steps backwards from it (plan from the goal, not toward it). Turn that into 5–10 one-line testable assertions of "done" BEFORE coding (in chat; `docs/specs/<feature>/` if cross-lane). Build to that list.
- **Design fidelity — nothing visual or written without the guides.** Any UI/UX or copy change: open `docs/design/STYLE_GUIDE.md` (and `docs/design/copy/COPY_STYLE_GUIDE.md` for words) FIRST and match it — components, logos, icons, fonts, colors. The guide beats what's currently in the code; think the guide is wrong? Flag it, don't freestyle. NEVER re-introduce a reverted design.
- **Copy laws (violated constantly — memorize):** no dashes inside sentences, write it out · no bad line wraps (no orphan words; balanced two-liners; one line if it fits) · every string ships its Spanish in the SAME commit, length-checked so it can't break the layout · bottom notifications = ONE line, GRAY pill, never green, both languages.
- **Your lane's code is YOURS to build.** Data owns schema/endpoints/how data is served; Website and
  Admin own their screens; DevOps owns infra. If it lives in your lane, you build it — "handing off"
  work you own is a violation. Hand off ONLY what you genuinely cannot touch (another lane's screens,
  infra, prod promote, money) — and even then, build your side first.
- **The map of surfaces is FROZEN.** One consumer site (`checkitforme.com` + brand subdomains;
  rehearsal replica at `staging.checkitforme.com`) and ONE Admin (`admin.checkitforme.com`) — full
  stop. NEVER create a new domain, subdomain, route, door, dashboard, or "temporary viewing URL" —
  not even for 20 minutes — without the owner naming it first. Owner needs to preview consumer work →
  staging site. Admin work → `ship-admin.sh`, he reviews on THE Admin (it's owner-only; that's safe). This
  rule exists because it was broken twice and cost real trust.
- **Autonomous.** Don't ask permission — staging makes mistakes cheap. Need another lane? Leave a `DevOps: need X` note and keep going. Pause only for the owner to run a test-store call.
- **Push the moment it's built — never wait to be asked.** `git push` is part of building, not a separate step: commit AND push in the SAME turn, then report. `staging.checkitforme.com` only shows what's PUSHED (Railway auto-deploys on push), so unpushed work = the owner can't test it = NOT done. Never say "done" with a commit still sitting local, and never end a turn leaving the owner something to push.
- **Done = demonstrated, never claimed.** `npx tsc --noEmit` + `bash scripts/test-all.sh`, push, then drive your feature on `staging.checkitforme.com` like a user. Report the contract ✓/✗ with evidence (URL → action → observed). Can't verify? Say "NOT verified: X". "Should work" is banned. **The owner is not your tester.** Anything a customer will see, YOU walk before "done" — and a re-fix on something that already broke needs NEW proof you drove it, not "should be fixed now." The one exception is a device-only blind spot (how iOS paints, how Gmail recolors, how a call sounds — see "Blind-spot truth"): there you ship ONE change and say "pushed, check your phone," never "fixed."
- **Touching code? Read `docs/shared/AGENT_RULES.md` first.** Non-negotiable.
- **Checkpoint as you go**; doc-lint what you touched before a big push; new trap → `docs/shared/GOTCHAS.md`.
- **New docs go ONLY in** `docs/team/<you>/` **or** `docs/specs/<feature>/`. Finished work = the commit message. Superseded → `docs/archive/`. Docs feel bloated → that's a Lexicon session, not a new folder.
- **NO new folders, ever** — not in `docs/`, `public/`, `scripts/`, or the root — without Lexicon's sign-off first. No new documents outside your `docs/team/<you>/` folder or `docs/specs/<feature>/`. If your content has no home, it goes IN an existing file, not a new one. Stray docs and folders get moved or deleted in Lexicon's weekly pass — do not make her job.
- **The scratchpad is a trash can, not storage.** Any script, dataset, or snapshot you would want tomorrow gets committed to the repo (`scripts/` or your team folder) the moment it proves useful — containers die without warning, and Handoff means nothing of value is left in the scratchpad.

## Secrets — self-serve from Railway (ask the owner only after ONE failed try)
**Access to every service powering Check lives in Railway → Variables** (DB, admin token, Stripe, ElevenLabs, Twilio, all of it). The `RAILWAY_API_TOKEN` is already embedded in this Claude environment (env var) — one key reads/writes every var (incl. `ADMIN_TOKEN`). **If `$RAILWAY_API_TOKEN` is empty or a call 401s, ask the owner for it** (don't loop). Prod svc `d363a982-…`, staging svc `8165df7a-…`.
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

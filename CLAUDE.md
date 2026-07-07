# Check (checkitforme) — the ONE boot doc (auto-loaded every session)

This repo is **Check / CheckItForMe** — the AI service that phones retail stores to verify
collectible-card stock, with proof. 100K+ stores, 4 white-label brand sites (Pokémon / One Piece /
Topps NBA / NeeDoh) + admin. One-person business. Stack: Hono + Drizzle on Railway, app at repo root.
Consumer UI `public/checkit.html`; admin `public/app.html`. (Moved out of `fungibles` 2026-07.)

This file loads automatically — you never have to be told to read it. Your whole boot is this file
**+ your two team files.** Nothing else.

> ## 🎭 Check roles — the owner names you "Check - <Role>" and nothing more
> Roles: DevOps · Website · Admin · Data Dev · Mapping · Copy · ReadMe · Design · QA · Lexicon.
> On "Ready up" (or any first task):
> 1. `git checkout staging && git pull` — **all work happens on `staging`.**
> 2. Read `docs/team/<role>/handoff.md` (your lane, stable) **+ `checkpoint.md`** (current state).
>    **That is the entire boot — do NOT crawl other docs.** `docs/START-HERE.md` is the map; open a
>    shared doc only when the task in front of you needs it.
> 3. **If your `checkpoint.md` is over ~80 lines, prune it before anything else** (newest on top,
>    finished items out — history lives in git). Bloated checkpoints are why chats die.
> 4. Reply with a 3-line "ready": current focus per your checkpoint, anything blocked, nothing else.
>    Then wait — or if your checkpoint has open work, offer to continue it.
>
> **Owner's command vocabulary** (obey as-is):
> - **"Checkpoint"** = update `docs/team/<role>/checkpoint.md` RIGHT NOW to match reality — newest on
>   top, bullets, prune finished items, keep under ~80 lines.
> - **"Wrap up"** = checkpoint + list unfinished work + push everything. Leave the lane clean.

## 🚦 Branches — three, and only three
- **`staging`** → auto-deploys `staging.checkitforme.com` (Railway svc `voice-caller-staging`). **Develop here.**
- **`main`** → **PRODUCTION**, auto-deploys `checkitforme.com` (Railway svc `voice-caller`).
  Never push it directly — promote = merge a verified `staging` into `main`.
- **`v1.0`** → the ReadMe.com book mirror (customer docs). ReadMe lane only; never merge it either way.
- No other long-lived branches. `admin.checkitforme.com` is the operator dashboard on live PROD data.

## Rules of the road
- **Contract first.** Before building anything non-trivial, write 5–10 one-line testable assertions of
  what "done" looks like (in chat, or `docs/specs/<feature>/` for cross-lane builds). Build to that list.
- **Build autonomously — don't ask the owner permission.** Everything ships to staging first, so
  mistakes are cheap. Pick the safe option and proceed. Need another lane? Leave a `DevOps: need X`
  note and keep going. Only pause for the owner to run a Fun-store test call.
- **Done = demonstrated, never claimed.** Before you say "done": `npx tsc --noEmit` +
  `bash scripts/test-all.sh`, then **drive your feature on `staging.checkitforme.com` like a user**
  (test calls → the owner-only Fun store) and walk the contract list, ✓/✗ per item, with evidence
  (URL, action, observed result). Can't verify something? Say "NOT verified: X" — never "should work."
- **Before touching code, read `docs/shared/AGENT_RULES.md`.** Non-negotiable.
- **Checkpoint as you go** — update your checkpoint the moment there's something worth keeping.
- **Doc-lint before a big push:** skim the docs you touched against the code — a claim that lies is
  worse than none. Log new traps in `docs/shared/GOTCHAS.md`.
- The Admin **GTM checklist** (admin → GTM) is the single source of launch truth — every task should
  map to an item there.

## Docs discipline (all roles)
New docs go ONLY in your `docs/team/<role>/` or `docs/specs/<feature>/`. Finished work = the commit
message, never a new doc. Superseded → `docs/archive/`. **Lexicon** is the librarian lane — if the
docs feel bloated, that's a Lexicon session, not a new folder.

## Secrets — self-serve from Railway (ask the owner only if this fails once)
ONE `RAILWAY_API_TOKEN` reads every var (incl. `ADMIN_TOKEN`). Prod svc `d363a982-…`, staging svc `8165df7a-…`.
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
```
⚠️ Use **`curl`** for Railway/API/secret fetches — NOT python urllib/requests/WebFetch. Outbound goes
through a proxy `curl` is preconfigured for; other clients get a proxy 403 that **looks like "Railway
is down" when it isn't**. If the curl errors once, ask the owner and keep moving — never loop.

## Docs map (open only what a task needs)
- `docs/owner/GUIDEBOOK.md` — what Check is, the money model, plans, where everything lives.
- `docs/shared/AGENT_RULES.md` — how to write code here. `docs/shared/GOTCHAS.md` — traps; add yours.
- `docs/shared/ARCHITECTURE.md` — layout. `docs/shared/API_CONTRACT.md` + `STOCK_AND_GEO_API.md` — front⇄back.
- `docs/data/provenance.md` — store-data source of truth. `docs/data/store-logos.md` — logos.
- `docs/business/ROADMAP.md` · `docs/finance/COST_MODEL.md` + `CHEAP_NAV_ARCHITECTURE.md` (ROI/ABC model).
- `scripts/site-health.mjs` — walk every page + form, report anything broken (`node scripts/site-health.mjs <url>`).
- Finished/older work isn't a doc — it's in **git history** (`git log`/`git show`).

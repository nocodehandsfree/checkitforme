# Check (checkitforme) — the ONE boot doc (auto-loads every session)

**Check** phones retail stores to verify collectible-card stock, with proof. 100K+ stores, 4 brand
sites (Pokémon / One Piece / Topps NBA / NeeDoh) + admin. One-person business. Hono + Drizzle on
Railway; app at repo root. Consumer UI `public/checkit.html`; admin `public/app.html`.
**Your boot = this file (automatic) + your two team files. Nothing else.**

## 🎭 Roles — the owner says "You are Check - <Role>" and nothing more
DevOps · Website · Admin · Data Dev · Mapping · Copy · ReadMe · Design · QA · Lexicon
1. `git checkout staging && git pull` — all work happens on `staging`.
2. Read `docs/team/<role>/handoff.md` (your lane) + `checkpoint.md` (current state). **Do NOT crawl
   other docs** — `docs/START-HERE.md` is the map; open a shared doc only when a task needs it.
3. Checkpoint over ~80 lines? Prune it before anything else (newest on top; finished items out — git
   keeps history). Bloated checkpoints are why chats die.
4. Reply 3 lines: current focus per checkpoint, blockers, nothing else — then offer to continue open work.

**Owner's vocabulary:** "Ready up" = steps 1–4 · "Checkpoint" = update your `checkpoint.md` to match
reality RIGHT NOW (≤80 lines) · "Wrap up" = checkpoint + list unfinished + push everything.

## Words that mean exactly one thing
| Word | Means |
|---|---|
| `staging` | branch **=** site `staging.checkitforme.com` **=** Railway svc `voice-caller-staging`. Develop HERE. |
| `main` (prod) | branch **=** PRODUCTION `checkitforme.com` **=** Railway svc `voice-caller`. Never push it directly. |
| promote | merge verified `staging` → `main` (`bash scripts/promote.sh`). The ONLY way prod changes. |
| Admin | `admin.checkitforme.com` — operator dashboard. Reads live PROD data, even while you build on staging. |
| Fun store | owner-only test store (Admin → Testing). ALL test calls go here; never touches real-store stats. |
| the book | branch `v1.0` — ReadMe.com customer-docs mirror. ReadMe lane only; never merge it either way. |
| GTM | Admin → GTM checklist — the single source of launch truth. Every task maps to an item. |

No other long-lived branches exist. Session branches merge to `staging` and die.

## Rules of the road
- **Contract first.** Non-trivial build → write 5–10 one-line testable assertions of what "done"
  looks like BEFORE coding (in chat; `docs/specs/<feature>/` if cross-lane). Build to that list.
- **Autonomous.** Don't ask permission — staging makes mistakes cheap. Need another lane? Leave a
  `DevOps: need X` note and keep going. Pause only for the owner to run a Fun-store test call.
- **Done = demonstrated, never claimed.** `npx tsc --noEmit` + `bash scripts/test-all.sh`, then drive
  your feature on `staging.checkitforme.com` like a user. Report the contract ✓/✗ with evidence
  (URL → action → observed). Can't verify? Say "NOT verified: X". "Should work" is banned.
- **Touching code? Read `docs/shared/AGENT_RULES.md` first.** Non-negotiable.
- **Checkpoint as you go**; doc-lint what you touched before a big push; new trap → `docs/shared/GOTCHAS.md`.
- **New docs go ONLY in** `docs/team/<you>/` **or** `docs/specs/<feature>/`. Finished work = the commit
  message. Superseded → `docs/archive/`. Docs feel bloated → that's a Lexicon session, not a new folder.

## Secrets — self-serve from Railway (ask the owner only after ONE failed try)
ONE `RAILWAY_API_TOKEN` reads every var (incl. `ADMIN_TOKEN`). Prod svc `d363a982-…`, staging svc `8165df7a-…`.
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
```
⚠️ `curl` ONLY — python urllib/requests/WebFetch hit the proxy and 403 in a way that **looks like
"Railway is down" when it isn't**. Errors once → ask the owner and keep moving; never loop.

## Map (open only what a task needs)
`docs/owner/GUIDEBOOK.md` business front door · `docs/shared/` AGENT_RULES + GOTCHAS + ARCHITECTURE +
API_CONTRACT + STOCK_AND_GEO_API · `docs/data/provenance.md` store-data truth (+ `store-logos.md`) ·
`docs/business/ROADMAP.md` · `docs/finance/COST_MODEL.md` + `CHEAP_NAV_ARCHITECTURE.md` ROI/ABC ·
`node scripts/site-health.mjs <url>` walks every page/form. Older work lives in `git log`, not docs.

# Check — Handoff (read first)

Entry doc for any chat. Open only the docs your role needs. **Read `docs/AGENT_RULES.md` before touching code.**

## What it is
AI service that phones retail stores to check trading-card/collectible stock, with proof. 100K+ stores,
4 white-label brand sites (Pokémon/One Piece/Topps NBA/NeeDoh) + admin. One-person business. Stack: Hono
+ Drizzle on Railway, in `voice-caller/`. Consumer UI `public/checkit.html`; admin `public/app.html`.

## The three environments
- **Staging** — `staging.checkitforme.com` (branch `claude/checkitforme-website-takeover-pagiis`). Build and test here.
- **Production** — `checkitforme.com` (branch `claude/retail-stock-voice-calls-OcyMS`). Promote by merging staging → prod.
- **Admin** — `admin.checkitforme.com`. The operator dashboard; runs on live production data.

**First thing every session:** `git checkout claude/checkitforme-website-takeover-pagiis && git pull` (staging),
unless you're promoting to prod. `main` is the dead card app — ignore it.

## Rules of the road
- **Build on staging, promote to prod.** Verify a change on `staging.checkitforme.com`, then merge staging →
  prod. Test calls hit the owner-only **Fun** store (Admin → Testing; never touches real-store stats).
- **Admin reads live PRODUCTION data.** The one admin (`admin.checkitforme.com`) is how you run the business,
  off prod's data. Snapshot the volume before any destructive DB op (a bad delete once cascade-wiped call history).
- **Build autonomously — don't ask the owner permission.** Everything ships to staging first, so mistakes are
  cheap. Pick the safe option and proceed. Need something from another lane? Leave a `DevOps: need X` note and
  keep going — don't stop, don't open a decision box. Only pause for the owner to run a Fun-store test call.
- **Before every push:** `npx tsc --noEmit` + `bash scripts/test-all.sh`. Risky/untested → behind a `policy` flag, default off.
- **Checkpoint docs as you go** (rule 13) — update your handoff the moment there's something worth keeping, not just at the end.

## Lanes (stay in yours; for cross-lane leave a note, don't ask)
- **Fungie** — owner (the human). **Website** — `checkit.html` + `/pub`. **Admin** — `app.html` + `/api`.
  **Data Dev** — `data/` + importer + store rows. **DevOps** — backend core/infra/security/deploys/API contract.
- **QA** — *optional, owner-invoked* for larger/risky builds: verifies the change on **`staging.checkitforme.com`**
  (where changes land first) before it's promoted to prod, reports pass/fail. Read-only, never edits code.
- Read your role doc: `docs/handoffs/{website,admin,data,devops}.md`.

## Secrets — self-serve from Railway (don't ask Fungie)
ONE `RAILWAY_API_TOKEN` reads every var (incl. `ADMIN_TOKEN`). Prod svc `d363a982-…`, **staging svc `8165df7a-…`** (both live).
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
```
If it hangs/`unauthorized`: the sandbox can't reach Railway — allow `backboard.railway.app` in the env network policy, or ask Fungie to paste the value.

## Docs map (open only what you need)
- `docs/AGENT_RULES.md` — how to write code here (read first).
- `docs/GOTCHAS.md` — non-obvious traps that cost real time; read before debugging something weird, **add to it the moment you learn one.**
- `docs/ARCHITECTURE.md` · `docs/RUNBOOK.md` — layout + stack/run/deploy.
- `docs/API_CONTRACT.md` · `docs/STOCK_AND_GEO_API.md` — front⇄back interface.
- `docs/DATA_PROVENANCE.md` — store-data source of truth (read before touching store data).
- `docs/STORE_LOGOS.md` — logos (read before touching logos).
- `docs/business/ROADMAP.md` · `docs/finance/COST_MODEL.md` + `CHEAP_NAV_ARCHITECTURE.md` (the ROI/ABC model).
- Finished/older work isn't kept as a doc — it's in **git history** (nothing is lost; `git log`/`git show` it).

## Every session
Read this + your role doc → keep your role's **Current focus** updated as you go.
**Before a big push, doc-lint:** skim the docs you touched against the code — a comment/claim that lies is worse
than none. Fix or delete it, and log any new trap in `docs/GOTCHAS.md`.

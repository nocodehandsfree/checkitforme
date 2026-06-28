# Check — Handoff (read first)

Entry doc for any chat. Open only the docs your role needs. **Read `docs/AGENT_RULES.md` before touching code.**

## What it is
AI service that phones retail stores to check trading-card/collectible stock, with proof. 100K+ stores,
4 white-label brand sites (Pokémon/One Piece/Topps NBA/NeeDoh) + admin. One-person business. Stack: Hono
+ Drizzle on Railway, in `voice-caller/`. Consumer UI `public/checkit.html`; admin `public/app.html`.

## Branches (monorepo, 2 products — voice-caller = the `voice-caller/` folder only)
- **Staging** `claude/checkitforme-website-takeover-pagiis` → `staging.checkitforme.com`
- **Prod** `claude/retail-stock-voice-calls-OcyMS` → `checkitforme.com` (admin `admin.checkitforme.com`), auto-deploys ~3 min on push
- **`main` is the card app — dead for us, ignore it** (GitHub defaults to it; switch the dropdown).

## Rules of the road
- **Staging-first for CODE.** Build on the staging branch → push → **Check-QA verifies the sprint on
  `staging.checkitforme.com`** → owner does the final listen → promote = merge into the prod branch. **Nothing
  ships to prod unverified — QA is the gate.** Never push UI/behavior straight to prod. Keep `public/checkit.html`
  byte-identical between branches (only diff = the env-gated staging machinery: `config.staging`/`STAGING_CALLS`
  guards + `staging-sim.ts` + the proxy worker). Details: `docs/ops/STAGING.md`.
- **DATA direction = PROD is source of truth.** Manage the business from the prod Admin. Code flows
  staging→prod; **data flows prod→staging only** (`table-dump`→`table-load`, staging-only). No staging→prod
  data promote — one once cascade-wiped call history. Prod volume has daily/weekly backups.
- **Run your lane autonomously.** Default-and-proceed on in-lane calls; stop only for human testing or a
  genuinely irreversible/cross-lane/business call. Don't open a decision-box for technical choices — pick the
  safe option, leave a `DevOps: need X` note for cross-lane, keep going. Fix issues in your lane on sight.
- **Before every push:** `npx tsc --noEmit` + `bash scripts/test-all.sh`. Risky/untested → behind a `policy` flag, default off.
- **Checkpoint docs as you go** (rule 13) — update your handoff the moment there's something worth keeping, not just at the end.

## Lanes (stay in yours; request cross-lane)
- **Fungie** — owner (the human). **Website** — `checkit.html` + `/pub`. **Admin** — `app.html` + `/api`.
  **Data Dev** — `data/` + importer + store rows. **DevOps** — backend core/infra/security/deploys/API contract.
- **QA** — verifies the sprint on staging **before any prod promote**; read-only, reports pass/fail, never edits code.
- Read your role doc: `docs/handoffs/{website,admin,data,devops,design,qa}.md`.

## Secrets — self-serve from Railway (don't ask Fungie)
ONE `RAILWAY_API_TOKEN` reads every var (incl. `ADMIN_TOKEN`). Prod svc `d363a982-…`, staging `8165df7a-…`.
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
```
If it hangs/`unauthorized`: the sandbox can't reach Railway — allow `backboard.railway.app` in the env network policy, or ask Fungie to paste the value.

## Docs map (open only what you need)
- `docs/AGENT_RULES.md` — how to write code here (read first).
- `docs/ops/STAGING.md` — the staging↔prod model + workflow (read before any change).
- `docs/ARCHITECTURE.md` · `docs/RUNBOOK.md` — layout + stack/run/deploy.
- `docs/API_CONTRACT.md` · `docs/STOCK_AND_GEO_API.md` — front⇄back interface.
- `docs/DATA_PROVENANCE.md` — store-data source of truth (read before touching store data).
- `docs/STORE_LOGOS.md` — logos (read before touching logos).
- `docs/business/` · `docs/finance/COST_MODEL.md` · `docs/security/SECURITY_REVIEW.md`.
- `docs/COMPLETED.md` — done · `docs/archive/` — historical, skip.

## Every session
Read this + your role doc → keep your role's **Current focus** updated → on finish, move it to `docs/COMPLETED.md`.

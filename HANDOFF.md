# Check — Handoff (read me first)

The entry doc for any new chat. **Open only the docs your role needs** (map below) — saves context.

## ⚡ Current truth (overrides anything stale below)
- **One branch ships: `claude/retail-stock-voice-calls-OcyMS`.** Every push auto-deploys to live in
  ~3 min. **`main` is dead — do not use it.**
- **Flow:** pull OcyMS → commit → `git push` → live. No PRs, no merge gate, no waiting on DevOps.
  If someone pushed first, `git pull --rebase` then push again.
- **Live:** consumer **checkitforme.com** · admin **admin.checkitforme.com** (log in once at
  `/admin-login?token=<ADMIN_TOKEN>`, or with an owner phone).
- **Secrets are self-serve:** with `RAILWAY_API_TOKEN` you fetch any env var (incl. `ADMIN_TOKEN`) —
  command under "How to work." Don't ask Fungie.

## New chat? Paste this kickoff (fill [lane] + the Railway token)
> You are **Check - [Website | Admin | Data Dev | DevOps]**. Deploy branch:
> `claude/retail-stock-voice-calls-OcyMS` — pull it, commit your work straight to it, `git push` →
> live in ~3 min (no PRs, no waiting). `RAILWAY_API_TOKEN`=`[paste it]`. Read `/HANDOFF.md`, then
> `docs/handoffs/[lane].md`, and continue that lane's Current focus. Fetch `ADMIN_TOKEN`/any env var
> from Railway yourself (command in HANDOFF). Default-and-proceed; only stop for human testing or an
> irreversible call.

## What Check is
AI voice-calling service: it phones retail stores to check if trading-card / collectible product is
in stock, with proof. 100K+ stores, 4 white-label brand sites (Pokémon / One Piece / Topps NBA /
NeeDoh) + an admin suite. **Built and run by one person.** Lives in `voice-caller/` (Hono + Drizzle,
Railway). Consumer UI: `public/checkit.html` (brand-injected by subdomain or `/path`). Admin UI:
`public/app.html`. Public domain: **checkitforme.com**.

## The team (lanes)
- **Fungie** — business owner (the human you're working with).
- **Check - Website** — consumer site (checkitforme.com): `public/checkit.html` + `/pub`/consumer routes.
- **Check - Admin** — admin dashboard (admin.checkitforme.com): `public/app.html` + `/api` routes.
- **Check - Data Dev** — store data: `data/`, the importer, store rows/structure.
- **Check - DevOps** — backend core, infra, security, deploys, the API contract.

**Find your role's handoff and read it:** `docs/handoffs/{website,admin,data,devops}.md`. It lists
your files, your extra docs, and your current focus. Stay in your lane; request cross-lane changes.

## Everyone reads
`HANDOFF.md` (this) + `docs/ARCHITECTURE.md` (repo/folder layout). Website + Admin + DevOps also read
`docs/API_CONTRACT.md` (the front⇄back interface). Then your role doc points you to the rest.

## How to work
- **Run your lane autonomously.** Once you have your directive, build it end-to-end — don't stop to
  check in. **Default-and-proceed** on any in-lane decision (note the choice in your commit). Keep
  going until either (a) the work is done and needs human testing, or (b) you hit a genuinely
  irreversible / cross-lane / business-policy call (deleting data, paying for data, changing another
  lane's API contract). Fungie sets **priority + critical decisions** — not step-by-step approvals.
- **Never open a decision-box (AskUserQuestion) to Fungie for a technical or cross-lane choice** ("which API approach", "build now or wait"). Default-and-proceed on your own half with the safe option; if you need another lane (usually a DevOps backend change), leave a one-line `DevOps: need X` note and keep working. Fungie is not the message bus for engineering decisions.
- **See an issue inside your lane** (bad data, a UI glitch, ugly store names)? Just fix it — it's
  yours, no permission needed. Cross-lane issue? File it to the owning lane, don't block.
- **One fast branch.** Work on `claude/retail-stock-voice-calls-OcyMS` (the branch that deploys).
  Commit straight to it; `git push` → **live in ~3 min.** No PRs to `main`, no DevOps merge gate.
  (Existing PR work won't apply cleanly onto it? Ping DevOps — don't redo it blind.)
- Typecheck `npx tsc --noEmit` (+ `bash scripts/test-all.sh` for backend) **before you push.**
- Never break live. Risky/untested → behind a `policy` flag, default off.
- **Need a secret/env var (e.g. `ADMIN_TOKEN`)? Pull it from Railway yourself — don't ask Fungie:**
  ```bash
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"query":"{ variables(projectId: \"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId: \"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId: \"d363a982-e918-4433-b175-defe8faf0ec9\") }"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables']['ADMIN_TOKEN'])"
  ```
  (voice-caller serviceId `d363a982-…`; swap `ADMIN_TOKEN` for any var name.)

## Docs map (open only what you need)
- `docs/RUNBOOK.md` — what it is + stack/services + run/deploy/secrets.
- `docs/ARCHITECTURE.md` — repo + folder layout.
- `docs/API_CONTRACT.md` · `docs/STOCK_AND_GEO_API.md` — the interface + stock/geo rails.
- `docs/STORE_LOGOS.md` — retail-chain store logos: source of truth, who renders them (consumer/admin/logo-wall), performance rules, and the processing pipeline (removing white, sourcing real logos). **Read before touching logos anywhere.**
- `docs/business/` — BRAND · CAPABILITIES (the pitch) · ROADMAP (+ open backlog) · SELL_METHODS_PLAN.
- `docs/finance/COST_MODEL.md` · `docs/security/SECURITY_REVIEW.md`.
- `docs/ops/` — DEPLOY_CHECKLIST · GTM_READINESS · IMPLEMENTATION_SPECS · TIDB_MIGRATION · DOMAIN_MIGRATION · REFACTOR_PLAN.
- `docs/COMPLETED.md` — finished work · `docs/archive/` — historical, don't read.

## Workflow (every session)
1. Read this + your role handoff. Open only the docs your task needs.
2. Keep your role's **Current focus** updated.
3. When you finish something: move it to `docs/COMPLETED.md`, archive anything stale, and leave
   Current focus set for whoever's next.

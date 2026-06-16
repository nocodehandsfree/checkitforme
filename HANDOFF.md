# Check — Handoff (read me first)

The entry doc for any new chat. **Open only the docs your role needs** (map below) — saves context.

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
- **See an issue inside your lane** (bad data, a UI glitch, ugly store names)? Just fix it — it's
  yours, no permission needed. Cross-lane issue? File it to the owning lane, don't block.
- Commit small; `git push`; DevOps merges → `main` → Railway auto-deploys (~2–4 min).
- Typecheck `npx tsc --noEmit`; tests `bash scripts/test-all.sh` — **green before merge.**
- Never break live. Risky/untested → behind a `policy` flag, default off.

## Docs map (open only what you need)
- `docs/RUNBOOK.md` — what it is + stack/services + run/deploy/secrets.
- `docs/ARCHITECTURE.md` — repo + folder layout.
- `docs/API_CONTRACT.md` · `docs/STOCK_AND_GEO_API.md` — the interface + stock/geo rails.
- `docs/business/` — BRAND · CAPABILITIES (the pitch) · ROADMAP (+ open backlog) · SELL_METHODS_PLAN.
- `docs/finance/COST_MODEL.md` · `docs/security/SECURITY_REVIEW.md`.
- `docs/ops/` — DEPLOY_CHECKLIST · GTM_READINESS · IMPLEMENTATION_SPECS · TIDB_MIGRATION · DOMAIN_MIGRATION · REFACTOR_PLAN.
- `docs/COMPLETED.md` — finished work · `docs/archive/` — historical, don't read.

## Workflow (every session)
1. Read this + your role handoff. Open only the docs your task needs.
2. Keep your role's **Current focus** updated.
3. When you finish something: move it to `docs/COMPLETED.md`, archive anything stale, and leave
   Current focus set for whoever's next.

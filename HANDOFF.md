# Check — Handoff (read me first)

The one doc to onboard a new chat. **Open only the docs your task needs** (map below) — saves context.

## What Check is
AI voice-calling service: it phones retail stores to check if trading-card / collectible product is
in stock, with proof. 100K+ stores, 4 white-label brand sites (Pokémon / One Piece / Topps NBA /
NeeDoh) + an admin suite. **Built and run by one person.** Lives in `voice-caller/` (Hono + Drizzle,
deployed on Railway). Consumer UI: `public/checkit.html` (brand-injected by subdomain or `/path`).
Admin UI: `public/app.html`. Public domain: **checkitforme.com**.

## How to work
- Commit small; `git push`; merge to `main` → Railway auto-deploys (~2–4 min).
- Typecheck `npx tsc --noEmit`; tests `bash scripts/test-all.sh` — **must be green before merge.**
- Never break live. Anything risky/untested → behind a `policy` flag, default off.

## Current focus (KEEP THIS UPDATED for the next chat)
- [ ] Deploy the integrated branch → main; set `COMP_PHONES`; verify second-cell caller-ID flow.
- [ ] (UI) route the consumer "check" through the bridge so caller-ID applies; "create your agent" panel.

## Docs map (open only what you need)
- `docs/RUNBOOK.md` — what it is + full stack/services + run / deploy / secrets.
- `docs/ARCHITECTURE.md` — repo + folder layout (what every folder is for).
- `docs/API_CONTRACT.md` — front⇄back interface (don't change shapes lightly) · `docs/STOCK_AND_GEO_API.md`.
- `docs/business/` — BRAND · CAPABILITIES (the pitch) · ROADMAP · SELL_METHODS_PLAN.
- `docs/finance/COST_MODEL.md` — cost-per-check + margins.
- `docs/security/SECURITY_REVIEW.md` — findings + status.
- `docs/ops/` — DEPLOY_CHECKLIST · GTM_READINESS · IMPLEMENTATION_SPECS · TIDB_MIGRATION · DOMAIN_MIGRATION · REFACTOR_PLAN.
- `docs/COMPLETED.md` — log of finished work · `docs/archive/` — historical, don't read.

## Agent workflow (every session)
1. Read THIS doc. Open only the linked docs your task needs.
2. Do the work; keep **Current focus** current.
3. When you finish something: move it from Current focus → `docs/COMPLETED.md`, archive anything
   stale into `docs/archive/`, and leave Current focus set for whoever's next.

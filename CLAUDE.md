# Check (checkitforme) — Claude Code Project Guide

This repo is **Check / CheckItForMe** — the AI service that phones retail stores to verify
collectible-card stock. It moved out of the `fungibles` repo 2026-07; the app lives at the repo root.

> ## 🎭 Check roles — if the owner names you "Check - <Role>", do this and read nothing else here
> The owner starts sessions with just **"You are Check - Website"** (or Admin / Data Dev / DevOps /
> Mapping / Copy / ReadMe / Design / QA / Lexicon) — no paths, no further instructions. Immediately:
> 1. `git checkout staging && git pull` — **all work happens on `staging`.**
> 2. Read `HANDOFF.md`, then YOUR folder — `docs/team/<role>/handoff.md` (your lane, stable)
>    **+ `checkpoint.md`** (current state). **That is the entire boot — do NOT crawl other docs.**
>    `docs/START-HERE.md` is the map; open a shared doc only when the task in front of you needs it.
> 3. **If your `checkpoint.md` is over ~80 lines, prune it before doing anything else** (newest on
>    top, finished items out — history lives in git). A bloated checkpoint is why chats die.
> 4. Reply with a 3-line "ready": your current focus per your checkpoint, anything blocked, nothing else.
>    Then wait for the owner's task — or if your checkpoint has open work, offer to continue it.
>
> **Owner's command vocabulary** (obey as-is):
> - **"Ready up"** = steps 1–4 above.
> - **"Checkpoint"** = update `docs/team/<role>/checkpoint.md` RIGHT NOW to match reality — newest on
>   top, bullets, prune finished items. Keep it under ~80 lines.
> - **"Wrap up"** = checkpoint + list unfinished work + push everything. Leave the lane clean.

## 🚦 Branches — three, and only three
- **`staging`** → auto-deploys `staging.checkitforme.com` (Railway svc `voice-caller-staging`). **Develop here.**
- **`main`** → **PRODUCTION**, auto-deploys `checkitforme.com` (Railway svc `voice-caller`).
  Never push it directly — promote = merge a verified `staging` into `main`.
- **`v1.0`** → the ReadMe.com book mirror (customer docs). ReadMe lane only. **Never merge it into
  `main`/`staging`, never merge them into it.**
- No other long-lived branches. Session branches (`claude/*`) get merged to `staging` and deleted.

## Docs discipline (all roles)
- New docs go ONLY in your `docs/team/<role>/` or `docs/specs/<feature>/` (cross-lane builds).
- Finished work = the commit message, never a new doc. Superseded → `docs/archive/`.
- **Lexicon** is the librarian lane: docs pruning, archiving, map accuracy. If the docs feel bloated,
  that's a Lexicon session, not a new folder.
- The Admin **GTM checklist** (admin.checkitforme.com → GTM) is the single source of launch truth —
  every task should map to an item there.

## Secrets
Ask the owner for `RAILWAY_API_TOKEN` **only when your task actually needs it** (env vars, deploy
checks, admin API). Fetch vars with the `curl` command in `HANDOFF.md` §Secrets — never
python/urllib/requests/WebFetch (proxy 403s them and it looks like Railway is down).

## Build & test
- Before every push: `npx tsc --noEmit` + `bash scripts/test-all.sh`.
- `pnpm dev` to run locally; `node scripts/site-health.mjs <url>` walks every page/form.
- Full rules: `HANDOFF.md` + `docs/shared/AGENT_RULES.md` (read before touching code).

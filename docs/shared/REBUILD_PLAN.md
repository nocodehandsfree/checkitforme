# THE REBUILD PLAN (2026-07-22)

Read this whole file before doing anything. This is the owner's 4th attempt at making
agents reliable. Attempts 1-3 failed the same way: rules lived in docs, agents stopped
reading docs. This attempt is different: rules become hooks and gates that physically
block bad behavior. If a hook blocks you, do exactly what it says. Never work around one.

## Diagnosis (agreed with the owner)
- Instructions fade; enforcement doesn't. The only rules that never regressed were the
  two backed by hooks.
- The owner was the system's memory and router. That ends: state lives in files
  (checkpoints, the task queue, this plan).
- Work cuts across surfaces (one voice call touches site + admin), so surface-specialist
  personas forced constant handoffs. Once gates make any agent safe anywhere, personas
  become unnecessary. That switch is Phase 4 and is NOT done yet.
- Giant files (checkit.html 888KB, comps up to 1.7MB) are why agents skip comps and
  botch writes. Fix: a generated section index. Never open these files whole; read
  INDEX.md, then view only the line range you need.
- False "shipped" claims end via a build stamp + verify-live script. No agent says
  pushed / shipped / fixed without pasting its output.

## Decisions made with the owner
- Consumer site = golden base. Frozen as-is, warts included. Frozen means: no change
  without a named task + per-section unlock. Unlock flow: owner names the section →
  agent writes the glob into `.unlock` → fixes ONLY that section → verify-live →
  deletes `.unlock` → re-snapshots that page. Known warts become queued tasks.
- Admin = open construction zone, cleaned page-by-page through the task queue.
- `src/voice/` stays frozen. Mapper and store-callability data files get proposed as
  lock candidates.
- Comps: once truth snapshots exist, the LIVE SITE is the reference for the frozen
  consumer pages; consumer comps move to `docs/archive/` (superseded, never deleted
  outright). ADMIN comps stay active — Admin is still being built toward them.
- CD (Claude design, external, writes via MCP) submits ONLY to
  `docs/design/comps/inbox/`. Inbox files are temporary: implement → gap-check →
  fresh truth snapshot → delete inbox file → regenerate index. CD is never a second
  source of truth.
- A future task (queued, not now): extract repeated UI elements (sheets, pills, cards,
  logo blocks) into a small documented catalog. That is the real long-term shrink.
- Phase 4 — DONE (flipped 2026-07-23). Personas retired entirely. Chats are named by task
  ("Task: fix the alerts row"), never "You are <Name>". Checkpoints reorganized by SYSTEM, not
  persona: **site · admin · voice-calls · data · support** (`docs/team/<system>/`). The old persona
  lanes folded in — mapping → voice-calls, ops → data; the rest map 1:1. CD stays external via
  `docs/design/comps/inbox/`. Retired persona checkpoints are in `docs/archive/team/` / git history.
- Phase 5 — DONE (2026-07-23). Every CLAUDE.md rule a gate now enforces was deleted; CLAUDE.md is
  under 100 lines; START-HERE + the boot prompts were swept the same way. The owner-reply rules became
  the project OUTPUT STYLE (`.claude/output-styles/check-owner-reply.md`, set as the project default),
  so every session carries answer-first replies at the system level — no longer a CLAUDE.md section.
- Phase 6 — DONE (2026-07-23). DOC LAW: every living doc has a hard size cap (STATE.md ~40 · checkpoints
  60 · CLAUDE.md 100); updating a doc REPLACES stale content, never appends (history lives in git). The
  checkpoint-lint hook enforces all caps — over cap fails the session close (Stop hook) and blocks a push.

## Standing rules for every agent who reads this
- One task per session. Boot ritual: pull staging → read `docs/STATE.md` → read your SYSTEM's
  checkpoint (`docs/team/<system>/checkpoint.md`) → read the task queue index → name the ONE task you're taking.
- Every session updates `docs/STATE.md` + its system checkpoint at close — the Stop-hook doc-cap
  requirement now covers STATE.md too. Update = REPLACE stale content, never append (history is git).
- Doc caps are hard: STATE.md ~40 · checkpoints 60 · CLAUDE.md 100. Over cap fails the close and blocks a push.
- Never open checkit.html / app.html / comps whole. INDEX.md first, then the range.
- "Done" requires verify-live output pasted. Every time. No exceptions.
- If the owner is getting frustrated or you've failed twice: say "this needs a fresh
  chat," checkpoint, and hand off.
- A session is not done until its work is ON STAGING. If you were forced onto a
  claude/* branch (remote sessions do this), your final message must say so and
  either merge to staging or hand the owner the PR link — never imply it's live.
  verify-live proves code; this rule covers docs.

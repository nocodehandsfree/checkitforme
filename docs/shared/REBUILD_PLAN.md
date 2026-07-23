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
- Roster after Phase 0: Daily = Webbie (site + design implementation + copy),
  Addie (admin), DD (store data/API), Support (customer-chat model training).
  On-call = Mapper, Pops/Ops, Echo (voice tuning). External = CD.
  Retired = Copper, Logo, Lexicon, Ideas, and PM as a standing chat. PM + DevOps merge
  into `ops`. No standing PM chat ever again; planning happens in short disposable
  sessions.
- Phase 4 (later, owner-triggered only): personas retire entirely; chats are named by
  task ("Task: remap store X"); checkpoints move to systems (site / admin / voice /
  data). PLAN THIS WITH THE OWNER — never start it unprompted.
- Phase 5 (later): delete every CLAUDE.md rule a gate now enforces; target under 100
  lines; the owner-reply rules become the project output style.
- Owner reply rules are law on every turn: TLDR first, his words, no jargon, no walls
  of text, one question max, stop.

## Standing rules for every agent who reads this
- One task per session. Boot: pull staging → read your checkpoint → read the task
  queue index → state which task you're taking.
- Never open checkit.html / app.html / comps whole. INDEX.md first, then the range.
- "Done" requires verify-live output pasted. Every time. No exceptions.
- If the owner is getting frustrated or you've failed twice: say "this needs a fresh
  chat," checkpoint, and hand off.
- A session is not done until its work is ON STAGING. If you were forced onto a
  claude/* branch (remote sessions do this), your final message must say so and
  either merge to staging or hand the owner the PR link — never imply it's live.
  verify-live proves code; this rule covers docs.

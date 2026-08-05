# Doc sweep — the running list of things nobody could prove

**What this is:** the repo cleanup sweep (2026-08-05) only changes what it can prove from the code.
Anything it could NOT prove either way is raised with the owner IN CHAT first; a line lands here only
after he agrees it is genuinely open (his rule, 08-05 — the list is a record of agreed-open questions,
not a scratch pad, so it never needs walking back).
**Done when:** every line below is answered by its lane and the doc it came from is corrected.
**System:** whichever lane owns the line (named per item).
**Status:** open.

## Open questions

| # | The question | Where it came from | Whose call |
|---|---|---|---|
| 1 | **19 admin endpoint families are live and undocumented.** `src/server.ts` serves 54 `/api/*` families; `API_CONTRACT.md` documents 35. Missing: `alerts`, `brain`, `call-tuning`, `calls`, `community`, `concurrency`, `feedback`, `gtm`, `hangup`, `import-zones`, `kiosk-receipts`, `kiosks`, `ops`, `phones`, `sell-methods`, `settings-sync`, `support`, `test-stores`, `watches`. Their request/response shapes are written down nowhere. | `API_CONTRACT.md` audit, 08-05 | each owning lane writes up its own family |
| 2 | **`SYSTEM_MANUAL.md` §2–4 (call engine, lanes, Delta) describe 2026-07-10** and predate the hold drop/reconnect, self-healing, the versioned phone-tree map, and the pretend store that answers test checks. Rewriting them from outside the voice lane would bake in guesses. | `SYSTEM_MANUAL.md` audit, 08-05 | voice-calls |
| 3 | **Admin → Calls → Schedules tab:** `SYSTEM_MANUAL.md` §12.6 says it's a blank page. `public/app.html` has no `#schedules` section, which could mean fixed, renamed, or removed. Can't tell without opening the file whole (which the boot doc forbids). | `SYSTEM_MANUAL.md` §12.6 | admin |
| 4 | **Design comps have drifted from the live site** (owner, 08-05): an agent built directly off the site because the comps were not valid. Until they're re-cut, "the comp is the source of truth" (AGENT_RULES 24) points at something untrue. The sweep deliberately touched NO comp file. | owner, 08-05 | owner + whoever re-cuts the comps |
| 5 | **Nothing forces an agent to read `GOTCHAS.md`.** It is listed in `CLAUDE.md` under "open only what a task needs", and the `known-problems` skill points at it — but a skill loads on a description match, which is a nudge, not a gate. An agent can walk straight into a trap the file already documents. No hook checks it. Three fixes are written up below; none built. | GOTCHAS audit, 08-05 | owner |

## Closed

- **`GET /check-lab`** — a scratch page that drew the check-mark icon in four styles while the icon was
  being chosen; live on prod and staging, linked from nothing. **Owner said delete it, 08-05. Done**
  (route removed from `src/server.ts`, noted in `API_CONTRACT.md`).

## The three fixes for #5, in detail (none built — the owner picks)

### Fix A — move the worst traps into `CLAUDE.md`
`CLAUDE.md` is the one file that loads into EVERY chat automatically, before the agent does anything.
Nothing else does. So the only guaranteed-read place for a trap is inside it.
- **Change:** add 4-6 one-line traps (the ones that have actually cost days: ship-admin wipes an Admin
  shipped off an unmerged branch · never delete-replace a table with FK children · a "visual
  regression" is a stale cache until proven otherwise · every string ships its Spanish in the same
  commit).
- **Cost:** `CLAUDE.md` has a hard 100-line cap and is at 100 today, so 4-6 other lines must be cut to
  make room. It also only fits the handful that bite hardest — the other ~40 traps stay unread.
- **Strength:** guaranteed read, every chat, no exceptions. Weakest coverage of the three.

### Fix B — the first-reply hook names the traps that match the task
A hook already fires on the first message of every chat (it's what makes an agent recite its task back
to you). It can also read the task's words and print the matching traps.
- **Change:** that hook greps `GOTCHAS.md` for entries whose subject matches words in the task
  ("email" → the Gmail/Outlook entry; "logo" → the logo process entry; "admin" → the ship-admin entry)
  and prints those 3-5 lines into the chat before the agent starts.
- **Cost:** a few hours of work, plus tuning so it prints the RIGHT traps and not a wall of text.
- **Strength:** covers all ~40 traps, and only shows the relevant ones. Still a nudge: the agent reads
  it but nothing stops it from ignoring it.

### Fix C — the edit gate blocks a file until its trap is acknowledged
The gate that already blocks edits to locked files (`src/voice/`, `public/checkit.html`) can block on
GOTCHAS too.
- **Change:** tag each trap with the file it protects. Editing `src/alerts.ts` gets BLOCKED with the
  email-rendering trap printed, and the agent must state which entry applies before the edit is let
  through.
- **Cost:** the most work of the three, and it would fire on your busiest files —
  `src/alerts.ts`, `public/app.html`, `src/voice/bridge.ts`, `src/server.ts` — every single time.
- **Strength:** the only true lock. Also the only one that can annoy an agent into working around it,
  which is exactly what the laws say never to do.

**My recommendation: B.** It covers every trap, shows only what's relevant, and costs nothing on the
`CLAUDE.md` cap. A alone leaves 40 traps unread; C blocks so often it invites workarounds.

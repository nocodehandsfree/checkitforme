# Doc sweep — the running list of things nobody could prove

**What this is:** the repo cleanup sweep (2026-08-05) only changes what it can prove from the code.
Anything it could NOT prove either way lands here instead of being guessed at or deleted. The owner
routes each line to the lane that actually knows.
**Done when:** every line below is answered by its lane and the doc it came from is corrected.
**System:** whichever lane owns the line (named per item).
**Status:** open — growing as the sweep walks folder by folder.

## Open questions

| # | The question | Where it came from | Whose call |
|---|---|---|---|
| 1 | **`/check-lab` — keep or delete?** It's a live page on prod AND staging (both HTTP 200) that renders the round green check icon at a few sizes and in two color ramps (`src/server.ts:2019`). It reads like a scratch page from designing the check mark. Nothing links to it. It is NOT the logo wall. Links: https://checkitforme.com/check-lab · https://staging.checkitforme.com/check-lab | `API_CONTRACT.md` called it "dev scratch to remove"; owner (08-05) doesn't recognize it | owner |
| 2 | **19 admin endpoint families are live and undocumented.** `src/server.ts` serves 54 `/api/*` families; `API_CONTRACT.md` documents 35. Missing: `alerts`, `brain`, `call-tuning`, `calls`, `community`, `concurrency`, `feedback`, `gtm`, `hangup`, `import-zones`, `kiosk-receipts`, `kiosks`, `ops`, `phones`, `sell-methods`, `settings-sync`, `support`, `test-stores`, `watches`. Their request/response shapes are written down nowhere. | `API_CONTRACT.md` audit, 08-05 | each owning lane writes up its own family |
| 3 | **`SYSTEM_MANUAL.md` §2–4 (call engine, lanes, Delta) describe 2026-07-10** and predate the hold drop/reconnect, self-healing, the versioned phone-tree map, and the pretend store that answers test checks. Rewriting them from outside the voice lane would bake in guesses. | `SYSTEM_MANUAL.md` audit, 08-05 | voice-calls |
| 4 | **Admin → Calls → Schedules tab:** `SYSTEM_MANUAL.md` §12.6 says it's a blank page. `public/app.html` has no `#schedules` section, which could mean fixed, renamed, or removed. Can't tell without opening the file whole (which the boot doc forbids). | `SYSTEM_MANUAL.md` §12.6 | admin |
| 5 | **Design comps have drifted from the live site** (owner, 08-05): an agent built directly off the site yesterday because the comps were not valid. Until they're re-cut, "the comp is the source of truth" (AGENT_RULES 24) points at something untrue. The sweep deliberately touched NO comp file. | owner, 08-05 | owner + whoever re-cuts the comps |
| 6 | **Nothing forces an agent to read `GOTCHAS.md`.** It is listed in `CLAUDE.md` under "open only what a task needs", and the `known-problems` skill points at it — but a skill loads on a description match, which is a nudge, not a gate. An agent can walk straight into a trap the file already documents. No hook checks it. | GOTCHAS audit, 08-05 | owner — see the options below |

## Options for #6, if the owner wants a real gate

Cheapest first, none built yet — the owner picks before anything is written:
1. **Fold the top traps into `CLAUDE.md`** (auto-loads every session). Costs lines against the 100-line
   cap; only the handful that bite hardest would fit.
2. **A boot-time reminder like the "recite the box" hook** — the turn-1 hook already injects text; it
   could also list the 3-5 traps matching the task's words. Nudge, still not a gate.
3. **A real gate:** the edit hook already blocks locked paths. It could block an edit to a file that a
   GOTCHAS entry names until the session says which entry applies. That is the only true lock, and it is
   also the most annoying — it would fire on `src/alerts.ts`, `public/app.html`, `src/voice/bridge.ts`
   and more.

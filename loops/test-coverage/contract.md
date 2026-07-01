# Loop contract — test-coverage (overnight, unattended)

The agent runs this ONE iteration at a time, on the **staging branch**
(`claude/checkitforme-website-takeover-pagiis`), unattended. State lives on disk (`progress.md`). Goal:
harden the code that has actually broken by adding **unit tests for untested pure logic**. Tests-only +
throwaway DBs, so it's safe (see hard rules below).

## Each iteration (do exactly one module, then stop the iteration)
1. Read `progress.md` — don't repeat a module already done/skipped.
2. Pick **ONE** untested function/module from "Targets" below (top of the list first).
3. Write `scripts/test-<name>.ts` following the existing pattern (a standalone `tsx` script: import the real
   function, assert expected outputs, `console.log` a ✓ per case, `process.exit(1)` on any failure). Use a
   throwaway `DATABASE_URL=file:./.t-<name>.db` only if the code needs the DB.
4. Add a `run "unit: <name>" "..."` line to `scripts/test-all.sh`.
5. Run `bash scripts/test-all.sh`.
   - **Green** → `git commit` ("test: cover <name>"), append a ✓ line to `progress.md`, iteration done.
   - **The new test fails because the code is genuinely WRONG** → this is a real find. Append a `🐛 FINDING:`
     line to `progress.md` with the detail, **revert your test file + the test-all.sh line** (do NOT fix source —
     that's not this loop's job), move on next iteration.
   - **Suite goes red for any other reason you can't resolve in 2 tries** → STOP the whole loop, append `⛔ STOPPED`
     + why to `progress.md`, and end. Don't push a broken suite.

## Hard rules (unattended safety)
- **Tests only, throwaway DBs only.** Never touch the database beyond throwaway `file:./.t-*.db` sandboxes.
  Never run the live suite against the prod volume.
- **Tests only.** Do NOT modify anything under `src/` (if a test reveals a bug, log it, don't fix it here).
- **One commit per passing test.** Small, surgical.
- **Never** place a real call, hit a paid API, or do anything with side effects outside the test sandbox.
- If unsure whether something is safe → skip it, log why, move on. When in doubt, stop.

## Stop conditions
Targets exhausted, OR the suite goes red and won't recover, OR you've made ~15 commits this run (checkpoint —
leave the rest for review).

## Targets (untested pure logic, highest-value first — the stuff that's bitten us)
1. `src/calls/recipe.ts` — `recipeToDtmf`, `recipeToVoice`, `isDirect`, `recipeAnswerPath` (the press-timing logic that broke Big 5)
2. `src/calls/service.ts` — `resolveWorkflow`, `composePersona` (new; never tested)
3. `src/voice/verdict.ts` — `classifyVerdict` / the verdict heuristics
4. `src/voice/prompts.ts` — `specificityClause`
5. `src/calls/navigator.ts` — `looksLikeLivePerson` and the `LIVE_HUMAN_RE` / `REDIRECT_RE` matchers
6. any other pure helper you find untested (note it in progress.md before doing it)

# Test-Coverage Loop — Progress Log

One module per iteration: read this log → pick next untested module → write `scripts/test-<name>.ts`
→ add to `scripts/test-all.sh` → run `bash scripts/test-all.sh` → commit + push + log here **if green**.

> Note: `loops/test-coverage/contract.md` was not present in the repo when this loop started.
> This log was bootstrapped from the existing `scripts/test-all.sh` harness conventions
> (pure-TS suites importing from `../src`, manual asserts, exit code, ELEVENLABS_* test env).

## Environment note
- Fresh containers need `pnpm install` in `voice-caller/` before `scripts/test-all.sh` will run
  (otherwise `./node_modules/.bin/tsx` and `@types/node` are missing).

## Baseline
- `scripts/test-all.sh` green at loop start: 39/39 integration + all unit suites pass.

## Iterations

### 1 — `src/geo.ts`  ✅
- Added `scripts/test-geo.ts` (17 assertions): `haversineMi` (self-distance 0, ~69mi/deg lat,
  symmetry, NYC→LA ~2445mi, cos(lat) lng scaling) and `bboxAround` (centering, latΔ=radius/69,
  box fully contains the search radius, pole-clamp at cos floor 0.2).
- Wired into `scripts/test-all.sh` as `unit: geo`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 2 — `src/store-hours.ts`  ✅
- Added `scripts/test-storehours.ts` (15 assertions) for `openState()`, pinned to `tz="UTC"` with an
  explicit `at` instant so "now" never depends on the wall clock: unknown/malformed JSON fail-open,
  standard 9–21 day (open/before/after), 24h, midnight-crossing hours (incl. yesterday spillover),
  and "closed today → opens … tomorrow".
- Wired into `scripts/test-all.sh` as `unit: store-hours`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

## Already covered (pre-existing suites)
ratelimit, r2 presign, best-bet, schedules, referrals, receipt, auth/billing, growth/CMS/community (integration).

## Candidate targets remaining (untested src/ modules)
security-checks · brands · policy · config · llm · brevo · refcache ·
stock/signals · stock/sellmethods · stock/intel · voice/prompts · voice/provider ·
calls/service · calls/notify · calls/navigator · calls/tree-learn · hours-harvest ·
stores-import · redis · db/* · agent/admin-agent

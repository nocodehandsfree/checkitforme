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

### 3 — `src/brands.ts`  ✅
- Added `scripts/test-brands.ts` (25 assertions) for the white-label registry: `resolveBrand`
  (subdomain → brand, www-strip, case-insensitive, port-strip, marketing/typo aliases, `?brand=`
  override, default fallback), `allBrandKeys` (uniqueness), `brandForPath` (path routing, aliases,
  default-brand → null, unknown → null), and `brandSwitcher` (excludes default, topps "NBA" tag,
  logoUrl always a string).
- Wired into `scripts/test-all.sh` as `unit: brands`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 4 — `src/voice/prompts.ts`  ✅
- Added `scripts/test-prompts.ts` (28 assertions): `specificityClause` (empty/undefined/whitespace →
  "", specific product trimmed + interpolated + keeps `{{category}}`), the `RESTOCK_PROMPT`
  dynamic-variable contract (10 `{{...}}` placeholders + end_call/skip_turn/one-sentence rules), and
  `VOICE_DEFAULTS` range sanity (speed/stability/similarity/maxTokens/modelId/llm).
- Wired into `scripts/test-all.sh` as `unit: prompts`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 5 — `src/stores-import.ts` (normalizers)  ✅
- Added `scripts/test-storesimport.ts` (31 assertions) for the pure import normalizers:
  `regionForState` (state→region, case-fold, unknown/empty → null), `tzForState` (incl. Phoenix
  no-DST + Chicago default fallback), `normCarries` (array/comma-string/single, trim, blank-filter,
  coercion, non-array → null), and `e164` (10-digit→+1, 11-digit, already-+, intl, junk → "").
- Wired into `scripts/test-all.sh` as `unit: stores-import`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 6 — `src/security-checks.ts`  ✅
- Added `scripts/test-securitychecks.ts` (7 assertions) for `assertProdSecurity()`. Because the gate
  calls `process.exit(1)`, the test re-spawns itself as a child (`SEC_CHILD=1`) under controlled env
  and asserts exit codes: in prod, refuses to start (exit 1) on CLERK_ENFORCE-off / weak / missing /
  placeholder SESSION_SECRET; a fully secure prod config boots (exit 0) even with webhook secrets
  unset (warn-only); non-prod never fatal (exit 0).
- Wired into `scripts/test-all.sh` as `unit: security-checks`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 7 — `src/voice/bridge.ts` (in-memory state)  ✅
- Added `scripts/test-bridge.ts` (13 assertions) for the bridge's in-memory state: `takeBridgeDtmf`
  consume-once (no double-press) + per-room isolation + overwrite, `setBridgeContext` room isolation,
  `takeBridgeNav`/`bridgeConversationId` unknown-key → null, and the `bridgeDebug`/`bridgeLog` ring
  buffer (timestamp prefix, capped at last 60, newest-kept/oldest-dropped).
- Wired into `scripts/test-all.sh` as `unit: bridge`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

### 8 — `src/calls/tree-learn.ts` (relearn queue)  ✅
- Added `scripts/test-treelearn.ts` (8 assertions): `queueTreeRelearn`/`consumeTreeRelearn` take-once
  semantics (never-queued → false, queued → true once then drained), Set idempotency on double-queue,
  per-chain isolation in any order, and `learnTreeFromTranscript` graceful null when GEMINI_API_KEY
  is absent (no network; auto-skips if the key is present).
- Wired into `scripts/test-all.sh` as `unit: tree-learn`.
- `bash scripts/test-all.sh` → ALL SUITES PASSED.

## Already covered (pre-existing suites)
ratelimit, r2 presign, best-bet, schedules, referrals, receipt, auth/billing, growth/CMS/community (integration).

## Candidate targets remaining (untested src/ modules)
policy · config · llm · brevo · refcache ·
stock/signals · stock/sellmethods · stock/intel · voice/provider ·
calls/service · calls/notify · calls/navigator · calls/tree-learn (rest) · hours-harvest · voice/bridge (rest) ·
redis · db/* · agent/admin-agent
  (note: `stores-import` import/DB paths still uncovered — only its pure normalizers are tested)

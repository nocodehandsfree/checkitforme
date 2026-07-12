---
name: ship-it
description: >-
  Load the moment you believe a feature or fix is done, BEFORE you tell the owner
  it's done. Triggers on "it's done / finished / that works / ready to ship / I
  fixed it". It is the mandatory done-sequence: typecheck, full test suite, drive
  the change yourself on staging like a real user, push, verify live, then report
  in one line with evidence. Use it to stop yourself from claiming "should work".
---

# Ship it

"Done" means demonstrated, never claimed. Run this sequence every time — no step is optional.

## The sequence
1. **Typecheck:** `npx tsc --noEmit` — must be clean.
2. **Full suite:** `bash scripts/test-all.sh` — units + integration + the design-token/store-contract
   gates. Green, or it isn't done.
3. **Push — it's part of building, not after it.** `git add -A && git commit && git push` to `staging`
   in the SAME turn. `staging.checkitforme.com` only shows what's PUSHED (Railway auto-deploys on
   push), so unpushed work = the owner can't test it = NOT done.
4. **Drive it yourself on staging like a real user.** Open the actual flow on
   `staging.checkitforme.com` and do the thing — click the button, submit the form, walk the path.
   Not "the test passes" — the *feature works in the running app*.
   - Tooling: `node scripts/site-health.mjs https://staging.checkitforme.com` walks every page/form
     and fails on JS errors, broken requests, or dead views (see the `unblock-yourself` skill for a
     test account + comping premium UI so gated screens actually render).
5. **Report in ONE line with evidence:** contract ✓/✗ per item, each as `URL → action → observed`.
   Can't drive it? Say **"NOT verified: X"** and why. **"Should work" is banned.**

## Gotchas that fake a green check (see the `known-problems` skill)
- A `401` on a new `/api/*` path does NOT prove it deployed — use a content marker.
- A "visual regression" is stale PWA/Cloudflare cache until proven otherwise — hard-refresh / bump
  the `x-rev` meta and reproduce fresh before touching code.
- Never push to `staging` while a live test call is running (redeploy drains it) — check
  `GET /api/voice/live` first.

## Scope + safety
- All of this is on `staging`. Prod changes ONLY via `bash scripts/promote.sh` (merge staging→main) —
  and only when the owner says go.
- Drift check: `sed -n '/Typecheck/,/test-all/p' .github/workflows/ci.yml` shows CI runs the same
  `tsc` + `test-all.sh` gates, so local green ≈ CI green (as of 2026-07).

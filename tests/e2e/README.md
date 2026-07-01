# E2E path tests (Playwright)

Full-path tests so one person doesn't have to click through everything before a launch. They drive a
real browser through the **consumer** site and the **admin** the way a user would, and fail loudly if
any path breaks.

> Backend/API paths are already covered by `scripts/test-all.sh` (39 integration tests). Playwright
> covers the **UI** (`public/checkit.html`, `public/app.html`) — the gap that was hard to test by hand.

## Run it
```bash
pnpm install
pnpm exec playwright install chromium      # one-time: fetch the browser
pnpm e2e                                    # runs against checkitforme.com (the one live site)
pnpm e2e:ui                                 # interactive runner (watch it click)
```
- **Target a different site:** `E2E_BASE_URL=https://checkitforme.com pnpm e2e`. One environment now (no
  staging), so these specs are **read-path only** — for anything that places a call or writes data, drive the
  owner-only **Fun** store from Admin → Testing; **never run write paths against real-store data.**
- **Admin specs:** need `ADMIN_TOKEN` (pull from Railway — see `docs/handoffs/devops.md`). Without it, admin tests skip.

## Add a path test (the rule: one assertion per user path before launch)
1. Open the path in `pnpm e2e:ui`, click through it, copy the selectors Playwright suggests.
2. Add a `test(...)` in `consumer.spec.ts` or `admin.spec.ts` that walks the path and asserts the
   end state (e.g. the verdict screen shows in/out/unclear/soon).
3. Keep tests independent and idempotent — no test should depend on another's side effects.

## Coverage checklist (fill before launch)
**Consumer:** home renders ✅ · find a store · press Check → verdict (each of in/out/unclear/soon) ·
"tell me when it's back" watch · share-a-find · plan/upsell.
**Admin:** login ✅ · Calls feed · Stores list · Chains/Mapping (Map + Confirm-stock) · Statuses editor
· Designer/voice · schedule.

## Later: production monitoring
Wrap these same specs in **Checkly** (built on Playwright) to run every few minutes against prod and
alert on a broken path. Same code, no rewrite.

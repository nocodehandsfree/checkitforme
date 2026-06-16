# Deploy & Verify — tomorrow's run sheet

Goal: get the full integrated backend live and verify the phone-first flow (incl. your second-cell
caller-ID test). Everything below is on `claude/voice-caller-audit-45u6pn` (0 behind main, all tests green).

## 0. Converge (stop the merge ping-pong)
- Have the dev push any last fixes to `main`. I do one final `git merge origin/main` → resolve →
  green. Then **my branch IS the complete app** (his frontend + voice + my full backend).
- Deploy = merge `claude/voice-caller-audit-45u6pn` → `main` (Railway auto-deploys ~2-4 min).

## 1. Set comp (your master account by phone)
- Add **`COMP_PHONES`** in Railway (voice-caller service) = your cell(s), E.164, comma-separated
  (e.g. `+13105551234,+13105556789`). `COMP_EMAILS` still works too.
- After deploy: log in by phone → `/app/me` should show `comp: true`, credits 9999.

## 2. Verify the phone flow (use the smoke script — no UI needed)
```
bash voice-caller/scripts/smoke-auth.sh +1YOURCELL https://checkitforme.com
```
Walks: SMS code → session → `/app/me` (credits/comp/phone/callerIdReady) → optional caller-ID call.

## 3. Second-cell caller-ID test
- Sign up with the SECOND cell → run the caller-ID verify call (smoke script step 4, or the
  "create your agent" panel once the dev builds it) → enter the code Twilio reads you.
- `/app/me` → `callerIdReady: true`, `callerId: +1<second cell>`.
- Place a check → it should dial the store **from the second cell**.

## ⚠️ ARCHITECTURAL NOTE — caller-ID only applies on the BRIDGE path
- Dialing **AS the customer's number** works on the **bridge / listen-live** call path
  (`/app/check-live` → `bridgeStoreCall`), because we set the Twilio `From` there.
- The plain `/app/check` uses **ElevenLabs outbound**, which dials from the EL-registered house
  number — it CANNOT use an arbitrary per-user caller ID.
- **Decision for tomorrow:** make the consumer "check" button route through the **bridge** so
  caller-ID (and watch-live) apply by default. (Frontend routing choice; backend already supports it.)

## 4. Flip to phone-first (when ready)
- Turn `requirePhoneSignup` ON (admin → policy). Dual-auth means Clerk still works during transition.
- This kills the anonymous call path (the unlimited-call hole) and seeds free checks per verified phone.

## Built overnight (2026-06-16, on the branch — auth tests 25/25, full suite green)
- Comp-by-phone (`COMP_PHONES` / `isCompAccount`) so your master works on phone login.
- Caller-ID correctness fix: `caller_id` stays null until Twilio-verified (else calls get rejected).
- `/app/me` returns `callerId` + `callerIdReady` for the agent panel.
- Stored-SVG XSS closed (community image serving + upload).
- **Prod security boot-gate** (`security-checks.ts`): refuses to start in prod if `CLERK_ENFORCE`
  is off or `SESSION_SECRET` is missing/weak; warns on missing webhook secrets. (Our prod is
  configured correctly, so this only protects against future misconfig.)
- Complete `esc()` HTML escaping (now also `'` and `>`).
- **One-check-per-store-per-day** dedup: policy flag `oneCheckPerStorePerDay` (OFF) +
  `findRecentCheck()` + `triggerCall` guard. Flip ON when ready to stop repeat calls to the same store.
- **Single-leader locks** on the background tickers (multi-instance safe: no double-fired calls/charges).
- Bumped `tsx`. `scripts/smoke-auth.sh` for the live auth/caller-ID smoke test.

## New policy flags to know (admin → Policy)
- `requirePhoneSignup` (OFF) → flip ON to go phone-only (kills anonymous calls; free checks per phone).
- `oneCheckPerStorePerDay` (OFF) → flip ON to reuse recent results instead of re-calling a store.
- `connectOnHuman` (OFF, dev's) → the cheap-nav→premium-human switch; flip after bench-testing.

## Keep these env vars set (the boot-gate enforces the first two in prod)
- `CLERK_ENFORCE=true`, `SESSION_SECRET` (≥32 chars), `STRIPE_WEBHOOK_SECRET`,
  `ELEVENLABS_WEBHOOK_SECRET`, `TWILIO_VERIFY_SERVICE_SID`, `COMP_PHONES` (your cells).

## Open items (need you / coordination tomorrow)
- **Transcript IDOR** (`/pub/result`, `/pub/live`): deferred — needs the frontend to send the
  session token when polling so we can scope by owner without breaking the verdict display.
- **Wire confirmed call-cost rates into admin** — after the dev confirms the Helicone/Groq voice
  switcher is using the cheapest model (you deferred this; on the roadmap).
- The consumer-uses-bridge decision (see the architectural note above).

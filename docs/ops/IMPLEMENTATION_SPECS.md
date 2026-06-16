# Implementation Specs — P0/P1 backend work

File-level, review-ready specs for the money/safety + scale work. Written so the code phase is
fast and reviewable once the frontend lane freezes. Nothing here is built yet.

References real code as of 2026-06-14. Order matches `REFACTOR_PLAN.md` → "implementation tasks".

---

## 1. Hard call cost cap  **[P0]**

**Goal:** no call can ever exceed `policy.bail.maxCallSeconds` (180). Today the toggle exists but
is never enforced.

**Two enforcement layers (defense in depth):**

1. **Provider-level hard ceiling (the real cap):**
   - **Bridge calls** — `placeBridgeCall()` in `server.ts` (~L1703): add `TimeLimit` to the Twilio
     `Calls.json` body: `body.set("TimeLimit", String(pol.bail.maxCallSeconds))`. Twilio kills the
     call at that many seconds, period.
   - **EL-dialed calls** — `ElevenLabsProvider.startCall()` (`voice/elevenlabs.ts`): set the agent's
     max call duration via `updateAgent` platform settings (one-time push), or pass a per-call
     limit if EL supports it. Backstop below covers the gap.

2. **Watchdog backstop (catches anything the provider misses):**
   - New tick (extend the 8s `ingestPending` loop or a dedicated 15s tick): find `call_results`
     where `status IN (dialing,in_progress)` AND `now - startedAt > maxCallSeconds + grace(15s)`
     → force-end: bridge → Twilio hangup (`roomCallSids` map already exists, reuse the
     `/pub/bridge-hangup` logic); EL path → EL "end conversation" API; then mark the row.

**Wire `policy.bail.enabled`:** when on, also inject the bail rules into the prompt
(`gotAnswerHangup`, `voicemailBail`, `closedBail` are prompt-driven via `buildRestockVars`
voicemail_policy slot) and arm the watchdog thresholds (`ivrMaxSeconds`, `holdMaxSeconds`,
`ringMaxSeconds`). When off, only the absolute `maxCallSeconds` + Twilio TimeLimit apply (always on).

**Test:** simulate a call that runs long → assert Twilio TimeLimit set + watchdog ends it.

---

## 2. Global spend kill-switch  **[P0]**

**Goal:** auto-pause ALL calling when daily spend exceeds a cap.

**State (Redis, multi-instance safe):**
- `caller:spend:{YYYYMMDD}` = cents spent today (atomic `INCRBY`, `EXPIRE` 48h).
- `caller:calling_paused` = "1" | "0" (manual override).
- Cap from policy: `policy.bail.dailySpendCapCents` (add field; default e.g. 5000_00).

**Enforce:** at the top of `triggerCall()` and `bridgeStoreCall()`:
```
if (await isCallingPaused()) throw new Error("calling_paused");
const projected = spendToday + estimatedCallCents();   // cap × worst-case
if (projected > dailyCapCents) { await pause("daily_cap"); throw new Error("daily_cap"); }
```
**Track spend:** in `ingestPending()` on completion, add the call's estimated cost
(`durationSec × (EL + Twilio + LLM per-sec)`) to `caller:spend:{today}`.

**Admin:** `POST /api/admin/calling/pause|resume`, cap editable in policy; surface paused state +
spend-vs-cap on the God-view + cost dashboard.

**Estimated cost helper** (also powers cost-per-check, §6):
`estimatedCallCents(sec) = ceil(sec/60)*(EL_per_min + TWILIO_per_min) + llmCents(navModel,humanModel,sec)`.

---

## 3. Server-side atomic billing  **[P0]**

**Goal:** kill the client-driven charge (a user can block `/app/charge` today) and the in-memory,
non-atomic, single-instance idempotency.

**Charge at finalization, server-side:** in `ingestPending()` (`calls/service.ts` ~L494) AND in
the EL webhook (`/webhooks/elevenlabs`), when a call reaches a **definitive billable outcome**.

**Billable matrix** (charge only when we delivered an answer):
- CHARGE: `confirmed === true|false` (in_stock / not_in_stock / sold_out / does_not_sell).
- DON'T CHARGE: `nobody_answered`, `closed`, `failed`, `left_on_hold` with no answer. (Protects UX
  + matches "charged only on a real answer" promise.)

**Atomic decrement (no race):** replace `chargeOneCredit` read-then-write with a guarded UPDATE:
```sql
UPDATE accounts SET credits = credits - 1, calls_made = calls_made + 1
WHERE clerk_user_id = ? AND credits > 0;   -- rowsAffected===1 means charged
```
**Idempotency (durable, cross-instance):** add `charged_at INTEGER` to `call_results`. Charge only
if `charged_at IS NULL`; set it in the same step. No more in-memory `charged` Set.

**Remove:** `POST /app/charge`, `POST /pub/charge`, the module-level `charged` Set. Frontend stops
calling charge; the balance updates on its own (contract already flags this **[CHANGING→removed]**).

**Comp/anon:** comp accounts never charged (existing `isComp`). Anon free pool → folded into
per-account once phone-verify lands (§5).

---

## 4. Rate limits + one-check-per-store-per-day  **[P0]**

**4a. Move `ratelimit.ts` to Redis** behind the SAME `check()` signature (the file already notes
this): `INCR key; if 1 then EXPIRE windowMs/1000; ok = count <= max`. Key `caller:rl:{bucket}:{ip}`.

**4b. Rate-limit the money endpoints** (currently none): `/pub/check`, `/pub/check-live`,
`/app/check`, `/app/check-live`. Limits e.g. authed 10/min, anon 3/min per IP.

**4c. One-check-per-store-per-day** (dedupe + cost control):
- Key `caller:check:{userOrDevice}:{retailerId}:{categoryId}:{storeLocalYYYYMMDD}` via `SET NX`.
- If it already exists → return the latest existing result for that (store, category) today instead
  of placing a new call (`{ deduped: true, ...lastResult }`), so the user sees the answer, no charge.

---

## 5. Identity & anti-abuse — phone as the root  **[P0]**

**Phone signup (Clerk Pro):** require a verified phone at signup; email optional (alerts only).
One verified phone = one account.

**Caller ID:** on phone verify, register the number as a **Twilio Verified Caller ID** (Twilio API
`/OutgoingCallerIds` → triggers Twilio's own verification) and store on `accounts.callerId`. Use it
as `From` on that user's calls (`placeBridgeCall` From param). Falls back to the house number.

**Reward gating (close the farming vectors):**
| Reward | Granted only when |
|---|---|
| Free check | per **verified phone** (not per cleared-cookie device) |
| Referral | referred user **phone-verified** AND completed 1 real check; cap N/day/account |
| Add-a-store | store **admin-approved** (not on submit — already submit-only ✓) |
| Score post | post **moderation-approved** |
| Kiosk receipt | already strong (real emailed receipt) ✓ |

**Vector being closed:** "refer my own 20 emails" → emails are free, **phones aren't**; the reward
needs a distinct verified phone + a real action, which a farmer can't cheaply mint.

---

## 6. Redis module + cost-per-check  **[P1]**

**New `src/redis.ts`** — one client, `caller:` prefix, db `/1` (already wired as `REDIS_URL`):
- `rlCheck(bucket, id, limit)` — backs §4a.
- `once(key, ttl)` — SET NX for idempotency/dedupe (§3, §4c).
- `withLock(key, ttl, fn)` — single-leader for the schedulers (§7).
- `incrSpend(cents)` / `spendToday()` / `paused()` — §2.

**Cost-per-check panel** (`/api/admin/cost`): pulls Helicone LLM $ per call + telephony estimate →
`avg cost/check`, `max cost/check` (at the 180s cap), margin vs `policy.pricing.perCallCents`.

---

## 7. Schedulers → single-leader  **[P1]**

The 5 `setInterval`s in `server.ts` (ingest 8s, tick 60s, geocode, harvest, receipts) double-fire
if >1 instance runs. Wrap each tick body in `withLock("caller:lock:<job>", ttl, fn)` so only one
instance runs it per interval. (Full queue is a later upgrade; the lock unblocks multi-instance now.)

---

## 8. Observability (PostHog)  **[P1]**

- `posthog-node`: capture key events (check placed, confirmed, charged, signup, referral) + wrap the
  server error path → `posthog.capture('$exception', …)`.
- Alerts (PostHog insights/webhooks): spend-over-cap, call-failure-rate spike, avg-cost spike,
  low EL/Twilio/Anthropic balance, webhook signature failures, queue/lock backlog.
- Status: extend `status.fungibles.com` worker to probe `/api/health` + Twilio/EL status; expose a
  `/pub/status` flag the consumer + admin read to show a degradation banner.

---

## Sequenced PRs (each independently shippable, each with tests)
1. DB indexes (see TIDB_MIGRATION.md) — smallest, biggest read win.
2. `src/redis.ts` + move rate limiter to Redis.
3. Cost cap (Twilio TimeLimit + watchdog) + spend kill-switch.
4. Server-side atomic billing + remove client charge.
5. Rate-limit money endpoints + one-check-per-store-per-day.
6. Single-leader scheduler locks.
7. Phone-verify + caller ID + reward gating.
8. PostHog + cost-per-check dashboard + status banners.

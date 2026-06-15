# Security Review — voice-caller (2026-06-14)

Static review of the live service. Findings beyond the money/auth items already in
`IMPLEMENTATION_SPECS.md` (cost cap, server-side billing, rate limits, phone-verify). Severity:
🔴 fix before scale · 🟠 fix soon · 🟡 hardening. No code changed — this is the punch list.

---

## 🔴 1. Transcript endpoints have no authorization (IDOR)
`GET /pub/result/:cid` and `GET /pub/live/:cid` (`server.ts` ~L1010–1024) return a call's full
transcript/summary for **any** conversation id, with no ownership check. Anyone with a `cid` can
read someone else's call. IDs are EL UUIDs (not trivially guessable), but they leak via logs,
referrers, share links, history payloads.
**Fix:** bind `cid` → the placing account/device at call time (store on `call_results`, already
has `finderUserId`); on read, require the requester own it (or be admin/comp). Anon device-scoped.

## 🔴 2. Rate-limit bypass via spoofed `X-Forwarded-For`
`clientIp()` (`ratelimit.ts` ~L42) trusts the **first** `x-forwarded-for` value, which the client
can set arbitrarily → rotate fake IPs to defeat every per-IP limit (free-check farming, spam).
**Fix:** behind Cloudflare, trust **`cf-connecting-ip`** only (it's set by CF, not the client);
fall back to the right-most XFF hop from the trusted proxy, never the client-supplied left value.
(Pair with the Redis limiter move + phone-verify so identity, not IP, gates rewards.)

## 🟠 3. Stored-SVG XSS in community images
`/pub/community/post` accepts inline `data:image/*` up to 500 KB; `/pub/community/:id/image`
(`server.ts` ~L845) serves it back **with the stored MIME as Content-Type**. A
`data:image/svg+xml;base64,<script…>` post, served same-origin as `image/svg+xml` and opened
directly, executes script → session/token theft.
**Fix:** reject `svg` on upload; force `Content-Type` to a raster type or add
`Content-Security-Policy: default-src 'none'` + `Content-Disposition: inline; filename=…` on that
route; prefer R2 (off-origin) over inline data URLs. (Community is flag-OFF today — fix before enabling.)

## 🟠 4. Webhook signature compares aren't constant-time
`verifyStripeSig` (`billing.ts` ~L109) and EL `verifySignature` (`voice/elevenlabs.ts` ~L317) use
`actual === v1`. Timing side-channel on HMAC compare (low practical risk over the network, but
trivial to fix and these gate **credit-granting** + call finalization).
**Fix:** constant-time compare (`crypto.timingSafeEqual` on equal-length buffers).

## 🟠 5. Arbitrary-number dialing is admin-gated — keep it that way
`/api/talk`, `/api/simulate`, `/api/bridge/call` dial any number. They're under the `/api/*` Clerk
gate (`CLERK_ENFORCE=true`, confirmed ON) + `x-admin-token`. **Currently safe.** Risk is purely if
auth is ever disabled or the admin token leaks → robocall/harassment weapon.
**Fix:** keep `CLERK_ENFORCE=true` (add a startup assert that refuses to boot in prod if it's off);
rotate `ADMIN_TOKEN` on the session cadence; never expose these to `/pub`.

## 🟡 6. `esc()` is minimal
`esc()` (`server.ts` ~L130) escapes only `& " <` — not `>` or `'`. Fine in the current
double-quoted attribute / text contexts and inputs are short user strings (store/cat) that ARE
esc'd, but it's a footgun if reused in a single-quoted attribute or JS context.
**Fix:** use a complete HTML-escape (add `>` and `'`), or a tiny templating helper; audit
`__BRAND_JSON__` injection stays server-controlled (it is today).

## 🟡 7. Soft gates are plaintext / non-constant-time
`/pub/gate` (`PUB_PASSWORD`) compares plaintext, non-constant-time. It's a temporary shared gate,
low value — fine for now; remove once Clerk phone-signup is the real gate.

## 🟡 8. Secrets hygiene (process, not code)
- Several secrets were shared in plaintext chat this session (Railway token, TiDB key+password) →
  on the rotation list (`REFACTOR_PLAN.md` → Security).
- Add **gitleaks** to CI (done in `voice-caller-ci.yml`) so a key can't be committed.
- Confirm `.dev.vars` stays git-ignored (it is).

---

## Already covered elsewhere (cross-ref, not re-listed)
- Client-driven / non-atomic billing → `IMPLEMENTATION_SPECS.md §3`.
- No rate limit on money endpoints + per-store/day → `§4`.
- Free-check / referral farming → `§5` (phone-verify root identity).
- No cost cap / spend kill-switch → `§1, §2`.
- Single-instance in-memory state → `§6/§7` + `TIDB_MIGRATION.md`.

## Suggested fix order
1. **#2 (XFF)** + **#1 (transcript IDOR)** — ship with the Redis/rate-limit PR.
2. **#4 (timing-safe)** — trivial, bundle anywhere.
3. **#3 (SVG XSS)** — before flipping `flags.community` on.
4. **#5 boot assert**, **#6 esc()**, **#7/#8** — hardening pass.

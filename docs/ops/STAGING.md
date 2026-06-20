# Staging / preview environment

A password-walled clone of the live site (`staging.checkitforme.com`) for reviewing UX and
behavior **before** it reaches production — so live can never be broken by in-progress work.

## How it works (the model)

- **Two deploys of the same app, two branches.**
  - **Prod** service → deploys the live branch (untouched by day-to-day work).
  - **Staging** service → deploys `claude/checkitforme-website-takeover-pagiis` (the working branch).
- **Promote = merge** the working branch into the live branch → prod auto-deploys. Nothing is ever
  hand-edited on live.
- **Staging is gated + safe by env vars** (set only on the staging service):
  - `STAGING=1` — turns on HTTP **Basic auth** over the whole site + a `noindex` header.
  - `STAGING_USER` / `STAGING_PASS` — the shared login for the preview.
  - Outbound **calls/SMS are disabled by default** on staging (`config.callsEnabled` is false unless
    `STAGING_CALLS=1`). A preview can never place a real store call, send a real SMS, or spend money.

Prod leaves all of these **unset**, so the staging middleware and the calls kill-switch no-op
entirely — live runs byte-for-byte as before.

## What's gated vs exempt

The Basic-auth wall covers every human-facing route. **Exempt** (machine endpoints that can't send a
browser login and must keep working): `/api/health` (Railway healthcheck), `/webhooks/*`, `/twiml/*`,
`/nav/*`, `/bridge`.

## The "no real calls" guarantee

Every outbound-origination path checks `config.callsEnabled` (hard money-stop):
- `src/voice/elevenlabs.ts` `startCall` — the store calls (throws when disabled).
- `src/calls/navigator.ts` `placeNavCall` — Twilio phone-tree calls.
- `src/auth.ts` `startPhoneVerify` / `startCallerIdVerify` — SMS verify + caller-ID call.

Owner alerts (`src/calls/notify.ts`) are downstream of completed calls, so they're naturally dormant
when calls are off — no separate guard needed.

### Enabling real calls on staging later

1. Add working telephony env to the staging service (ElevenLabs + Twilio creds — ideally a separate
   test Twilio subaccount / number so staging traffic never mixes with prod).
2. Set `STAGING_CALLS=1` on the staging service and redeploy.
   The Basic-auth wall stays on; only the calls kill-switch lifts.

## Provisioning steps (one-time, needs `RAILWAY_API_TOKEN` + `CLOUDFLARE_API_TOKEN`)

1. **Railway** — create a new service in the project from the same repo, root `voice-caller/`,
   deploying branch `claude/checkitforme-website-takeover-pagiis`.
2. Copy prod's env vars to the staging service, then set the staging-only ones:
   `STAGING=1`, `STAGING_USER`, `STAGING_PASS` (leave `STAGING_CALLS` unset = calls off).
   Keep `CLERK_ENFORCE=true` + a real `SESSION_SECRET` so the boot security checks pass.
   Point staging at its **own database** (don't share prod's) so preview writes never touch live data.
3. Add the custom domain `staging.checkitforme.com` to the staging service (Railway issues the target).
4. **Cloudflare** — add a proxied `CNAME staging → <railway target>` in the `checkitforme.com` zone.
5. Verify: `https://staging.checkitforme.com` prompts for Basic auth; after login the site loads with
   `X-Robots-Tag: noindex`; attempting a check returns "calls disabled on this preview deploy".

## Daily workflow

1. Push UX/design changes to `claude/checkitforme-website-takeover-pagiis` → staging auto-deploys.
2. Owner reviews at `staging.checkitforme.com` (login required).
3. Happy → merge the branch into the live branch → prod deploys. Live was never at risk.
</content>
</invoke>

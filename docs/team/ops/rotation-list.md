# Launch-day key rotation list (owner decision 2026-07-01: rotate AT launch, not before)

> Names only — NO secret values in this file, ever. All rotations happen in Railway → Variables
> (project `889e332c…`) unless noted. Every Railway var change auto-redeploys the service — batch
> per service, then verify boot + `GET /api/policy`. Owner runs this WITH DevOps on launch day.

## Rotate (confirmed exposed during the build)
1. **GITHUB_PAT** (api svc) — leaked; grants repo write. Rotate in GitHub → update Railway var.
   Unblocks: fungibles Actions secret + deleting the two `claude/checkit-export-*` branches there.
2. **github-mcp PAT + connector URL** (svc `github-mcp`) — PAT pasted in chat; the URL path IS the
   credential. New PAT + redeploy with a new URL path; re-share URL to Design chats only.
3. **TiDB password** — pasted during data work. Rotate in TiDB console → update the DB URL var(s).
4. **ADMIN_TOKEN** (voice-caller + voice-caller-staging) — rotated once 2026-07-10 (Lexicon), but
   agents fetch it into chats routinely; rotate again at launch. Keep staging `STORE_SYNC_TOKEN` matched.
5. **Mapper `x-admin-token`** — an old value sits redacted-but-present in git history (team/mapping).
   Covered by the ADMIN_TOKEN rotation above; listed so nobody thinks history is clean.
6. **STRIPE_WEBHOOK_SECRET (staging)** — not a rotation, a SET: staging still lacks its own signing
   secret. Create a staging webhook endpoint in Stripe test mode and set the var.
7. **RAILWAY_API_TOKEN** — pasted in chats; it reads/writes EVERY other secret. Rotate **LAST**
   (rotating it first locks agents out of doing 1–6). After rotation, update the agent environments.

## Verify exposure, rotate only if pasted anywhere (check chat history with owner)
- CLOUDFLARE_API_TOKEN, GEMINI key (api svc) · ELEVENLABS keys, Twilio creds (voice-caller svcs)
- STRIPE_SECRET_KEY (live) — if never pasted, leave; Stripe rotation invalidates the webhook too.
- PostHog / Helicone keys — write-only/telemetry, low blast radius.

## Order of operations (launch day)
1–6 via Railway GraphQL (curl only), one service at a time → watch each redeploy come back healthy
(`/api/policy` on prod + staging, site-health script on all brand domains) → then 7 (Railway token)
→ update fungibles Actions secret → smoke again. Total expected time: under an hour.

## After rotation
- Define the standing key-handling process (who gets keys, how, cadence) — ROADMAP security item.
- New rule going forward: secrets live in Railway only; never pasted into chats or committed to docs.

# PINND

See it. Find it. Style it. Shop it. A fashion discovery app with a stylist you can talk to (Kai).

One page app in `public/index.html`, a real catalog of 240 pieces from 25 brands (public product feeds: `public/catalog.json` and `public/img`), and a small Hono server (`src/server.ts`) that holds the keys:

- Accounts: email code sign in (Brevo), optional text (Twilio). Data in SQLite on the volume (`/data`).
- Claude (`ANTHROPIC_API_KEY`): finds pieces in photos, matches them, names your Style ID, runs the stylist and Kai.
- Voice: Deepgram (`DEEPGRAM_API_KEY`) hears you, ElevenLabs (`ELEVENLABS_API_KEY`, `KAI_VOICE_ID`) is Kai's voice.
- Mail: `BREVO_API_KEY`, `MAIL_FROM` (a verified Brevo sender). Sign in codes and restock emails.
- `SESSION_SECRET` keeps people signed in across deploys. `ADMIN_TOKEN` unlocks `/api/admin/*` for testing.

Run locally: `pnpm install && DEV_SHOW_CODE=1 pnpm start` (with `DEV_SHOW_CODE=1` the sign in code comes back in the response; never set it on Railway).

The same `public/index.html` also runs as a claude.ai artifact with no server: there it uses the artifact runtime (`db`, `user`, `sample`).

Membership levels (names, prices, what each includes, the one time session price) live in `PLANS` and `HUMAN` at the top of the third script block in `public/index.html`; change them there and every screen follows.

# Which file holds what

Read this page, open ONE file, stop. Every file below registers its own routes and nothing else.
`src/server.ts` starts the service, applies the security and sign-in walls, carries the live-listen
audio, and calls each file's `register(app)` in turn.

## What a customer touches

| Open this | When the task is about |
|---|---|
| `website-pages.ts` | the home page for each brand, share links, the coming-soon splash, About/Terms/Privacy, icons, fonts, robots.txt, sitemap.xml |
| `store-logos.ts` | the logo wall, chain artwork, uploading a logo, the check-lab preview |
| `signing-in.ts` | signing in by phone, the caller-ID check, the admin door, confirm-email and unsubscribe |
| `store-data.ts` | store search, the nearby list, one store, address look-ups, store types, the set picker, best bet, recent finds, shelf intel |
| `running-a-check.ts` | starting a check, the wait, watching it live, the answer, hanging up, charging for it, feedback |
| `manage-zones.ts` | saved groups of stores, the quote, running one, stopping a run |
| `my-account.ts` | who am I, check history, credits, referrals, auto-checks, my store requests |
| `subscription-mgmt.ts` | plans, checkout, spending a credit |
| `in-stock-alerts.ts` | alert sign-up, pause, mute, the alert emails and their templates |
| `support-chat.ts` | the help chat, FAQ, tickets, and the Admin review queue behind it |
| `community.ts` | the wall, kiosks, restock watches, the waitlist, store requests, leads, Discord posts |

## Messages that arrive from outside

| Open this | When the task is about |
|---|---|
| `stripe.ts` | what Stripe sends us when a payment settles |
| `twilio-and-elevenlabs.ts` | what the phone company and the voice service send us while a check is running, and the audio-path debug traces |

## Admin screens

| Open this | When the task is about |
|---|---|
| `admin-stores.ts` | the Stores screen: import, edit, dedupe, hours, phone numbers, coverage, data health, zones, schedules |
| `admin-chains.ts` | the Chains screen: phone menus, mapping runs, recipes, the sweep |
| `admin-checks.ts` | Live, test checks, the log, timing, cost per check, call-data health |
| `admin-restock.ts` | the restock intel screens |
| `admin-voice.ts` | voices, tuning, presets, the statuses list |
| `admin-users.ts` | users, growth, staff, the morning pulse |
| `admin-money.ts` | plans, measured costs, margin, monthly services |
| `admin-settings.ts` | settings, the GTM checklist, the sync pipes, pause everything, shipping the Admin screens |

`shared-helpers.ts` holds the few small things many of these need (who is asking and what they may
see, the chain-logo lookup, the distributor carries list, shipment-day maths). It registers no routes.

## Rules for this folder

- One area per file. A file that will not fit in 800 lines is two areas — split it at the seam, and
  add its row above. `scripts/checkpoint-lint.sh` refuses a push when a file in `src/` goes over.
- A route's behaviour lives with its route. Do not add a second place that answers the same address.
- Registration order only decides who answers when two addresses could match one request.
  `scripts/check-route-order.mjs` proves that ordering never changed.

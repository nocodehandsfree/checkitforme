# Voice Caller

Personal tool that calls local retailers on a schedule and asks whether a
specific product (e.g. a Pokémon shipment) has arrived — in a natural,
human-sounding voice — then records a **text summary + yes/no** and flips the
retailer **green** when a clerk confirms.

> Personal use only. We keep a text transcript + summary; **no audio is ever
> stored** and the agent never announces recording.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Voice engine | **ElevenLabs Conversational AI** (+ Twilio number) | Most natural voice, sub-second turn-taking, voice cloning, age/gender selection, custom OpenAI LLM, post-call transcript+analysis webhook |
| Backend | Hono + Drizzle | Runs locally (Node) and deploys to Cloudflare Workers unchanged |
| Database | SQLite locally → **Cloudflare D1** in prod | Same SQL dialect both places |
| Scheduling | Cron Triggers (Workers) / node-cron (local) | Fires schedules per retailer's local open time |
| Frontend | Vite + React, Neo-punk theme | Standalone local dashboard; deployable to Cloudflare later |

## How a call happens

1. **Scheduler** wakes (cron), finds schedules due now in each retailer's timezone.
2. For each target retailer it inserts a `call_results` row (`queued`) and calls
   `VoiceProvider.startCall(...)` — ElevenLabs dials via your Twilio number.
3. The agent speaks the rendered question (`questionTemplate` with `{product}`),
   handles the clerk's reply, and extracts one field: `received_shipment`
   (`yes`/`no`/`unclear`) plus a one-line summary.
4. ElevenLabs POSTs the **transcription webhook** to our `/webhooks/elevenlabs`.
   `parseWebhook` normalizes it; we update the row: `confirmed`, `summary`,
   `transcript`. `confirmed = true` ⇒ retailer shows **green (`#4ADE80`)**.

## Data model (`src/db/schema.ts`)

`categories` → `products`, `retailers`, `schedules` → `schedule_targets`
(many-to-many to retailers), and `call_results` (the outcome of each attempt).
"Is this retailer green?" = newest `call_results` for that (retailer, product)
with `confirmed = 1`.

## Voice engine is swappable

Everything is provider-agnostic except `src/voice/elevenlabs.ts`, which
implements `src/voice/provider.ts`. If your research lands on a different
engine, only that one file changes.

## Setup (once the pieces are in place)

Environment variables:

```
ELEVENLABS_API_KEY=          # you have this
ELEVENLABS_AGENT_ID=         # created in the ElevenLabs dashboard
ELEVENLABS_PHONE_NUMBER_ID=  # your Twilio number registered to ElevenLabs
ELEVENLABS_WEBHOOK_SECRET=   # to verify post-call webhooks
OPENAI_API_KEY=              # you have this — agent's brain (custom LLM)
```

## Status

- [x] Data model
- [x] Voice provider interface + ElevenLabs adapter
- [ ] Hono server: REST (retailers / products / schedules / results) + webhook
- [ ] Scheduler (cron) wiring
- [ ] React dashboard (Neo-punk theme)
- [ ] Seed products from the category JSON
- [ ] ElevenLabs agent config + voice cloning setup

## To finish, the owner provides

1. **Product-category JSON** (+ the HTML that loads it) to seed `categories`/`products`.
2. A **Twilio account + one phone number** (the only missing credential).
3. A **voice snippet** of you/your son if you want the cloned-voice option.

# Voice lane — HANDOFF (everything the phone tech knows, 2026-07-11)

**What this is · who it's for:** the boot doc for the new Voice lane. The phone/call technology was
Admin's (Addie's) sub-lane until tonight; this file is the complete transfer. Read this + your
checkpoint.md and you know what Addie knew.

## 1. The three ways a call runs

One store check = one outbound phone call that ends in a verdict (in stock / not / unclear).
Three lanes can carry that call:

**A/B/C bridge (the plumbing everything rides on)** — `src/server.ts`.
A Twilio call leg dials the store; a WebSocket media room (`/twilio-media?room=…`) carries audio;
the consumer site follows along through three endpoints: `/pub/bridge` (call status → conversation
id once answered), `/pub/live` (transcript lines as they happen), `/pub/result` (the verdict row).
The customer can listen live (the "listen room") and hang up. `bridgeStoreCall` is the entry the
website's Check button hits; `triggerCall` (`src/calls/service.ts`) is the entry everything else
(admin call-now, schedules) hits. Cost model and why cheap navigation matters:
`docs/finance/CHEAP_NAV_ARCHITECTURE.md`.

**Charlie (C-lane) — the smart, expensive brain.** A live ElevenLabs ConvAI agent (billed through
EL, currently a Claude Sonnet under the hood) holds the whole conversation. Its system prompt is
`src/voice/prompts.ts`; its tool handlers (e.g. `ask_shipment_day`) are `src/voice/elevenlabs.ts`.
Charlie handles anything: name echo, adaptive follow-ups, weird clerks. Default workflow
**Branson Global** runs Charlie.

**Delta (D-lane) — the 2.5¢ tapedeck.** `src/calls/tapedeck.ts`. No live agent: pre-synthesized
ElevenLabs clips play in slots, Twilio `<Gather>` records the clerk, and a cheap LLM classifies
each reply to pick the next clip. Clip slots: 0 opener · 1 set question · 2 type question ·
3 restock-day ask · 4 wrap (confirmed YES only) · 5 clarify · 6 escalate · 7 "Hello?" nudge on
silence · 8 wrapNo (neutral goodbye for anything not a yes — never "Awesome!" after a no).
Classifier model: `groq:llama-3.3-70b-versatile` (benched correct on every real line, ~300ms;
override with `DELTA_CLASSIFY_MODEL` env). If Delta gets lost, it BARGES: the Twilio leg is
re-TwiML'd to `<Connect>` a live Charlie agent mid-call — fail-safe, costs more, saves the check.

**Routing** — the `vt_workflows` setting stores workflows with `lane:"delta"|"charlie"`. The Fun
store (retailer **106361**) is assigned **Branson Test** (delta) on BOTH envs, so every owner test
call runs Delta. Everything else defaults to Branson Global (charlie). `bridgeStoreCall` checks the
workflow lane and hands delta stores to `triggerCall` (this gap is WHY the owner's first 8 test
calls all ran Charlie — the live-check path never looked at the lane until f61bed2).

## 2. What was wired for Delta (the consumer experience)

A Delta call has no ElevenLabs conversation id, so a synthetic id unifies it with the EL flows:
`providerCallId = "delta:<sessionId>"` — that string is ALSO the media-room name.
- `/pub/bridge`: returns conversationId only once answered; before that, ringing/in-progress via
  Twilio `callProgress` (this drives the site's "We've connected" moment).
- `/pub/live`: serves the tapedeck transcript (`tdTranscript`); after a barge it proxies EL.
- `/pub/result`: finds the row by providerCallId, falls back through `session.check.callId`.
- Live audio: `tapedeckTwiml` opens `<Start><Stream name="deltatap" … track="both_tracks">` — a
  one-way fork of the call audio into the listen room. On barge, `<Stop><Stream name="deltatap"/>`
  runs BEFORE `<Connect>` (a Twilio `<Stream>` survives new TwiML documents; without the Stop the
  customer hears every frame twice).
- Charlie-after-barge reuses room `delta:<id>` and repoints the row's providerCallId to the EL
  conv id, so history resolves to the EL transcript.
- Transcript relay: `pushStep()` in tapedeck → `setDeltaRelay` registration in server.ts (lives
  next to `relayLine`/`relayEnd`).
- The EL poller (`ingestPending` in service.ts) must SKIP `delta:` ids — Delta finalizes itself.

**Verdict pipeline** (`src/voice/verdict.ts`): `classifyVerdict` is an independent second read of
the transcript (maps loose clerk phrasing — "three packs in one" → "3-pack blister"); `reconcile`
merges it with EL's own extraction — conflict → honest "no clear answer", finder not charged. On a
confirmed YES the second read still runs for EXTRACTION ONLY (set + product form → productDetail)
without touching the verdict.

## 3. How the owner tests Delta, step by step

1. Everything on **staging** (`staging.checkitforme.com`). Confirm the latest deploy is live first
   (Railway staging svc `8165df7a-3bdf-41a5-bdce-24883633a096` shows SUCCESS on the newest commit)
   — testing an old deploy silently runs Charlie (that exact incident already burned a night).
2. The **Fun store** (Admin → Testing area; retailer 106361) rings the owner's own phone and never
   touches real-store stats. It is pre-assigned the Delta workflow.
3. On the staging site: search the Fun store → **Check it** → answer the phone and play clerk.
4. Watch the site's live view while on the call: connect banner flips when answered, live audio
   streams (the deltatap fork — verify BY EAR, it has never been human-verified), transcript lines
   appear, verdict card lands at the end.
5. Scripts worth running, one call each:
   - clear YES → expect wrap clip 4, verdict in stock, productDetail filled.
   - clear NO → expect NEUTRAL goodbye (clip 8), verdict not in stock — never an upbeat wrap.
   - "we get more Tuesday" → expect restock-day captured, shown as "· Tuesday" (no generic "soon").
   - say NOTHING at pickup → expect "Hello?" nudge (clip 7) ~3s in.
   - name a weird set ("got any Chaos Rising?") → expect the set follow-up with an example name.
   - go fully off-script (ask it questions) → expect a BARGE to live Charlie; audio must not double.
6. Afterward: Admin → Voice → Testing shows workflow, opener used, status, timing; Admin → Calls
   has the row + call sheet. `/api/admin/llm-ping` proves the classifier brain is answering.
7. The **MVP store** is the second test store — point it at any number and answer as the store.

## 4. What's still rough (open work, priority order)

1. **Delta round 2 never happened.** The full loop — deltatap audio by ear, barge-in on an
   off-script call, wrapNo tone, nudge timing — is coded + unit-tested but NOT live-verified.
   The owner was about to test when the admin redesign pre-empted it. This is job one.
2. Barged Delta call reopened from history >15 min later shows "in progress" (in-memory session
   expired; `delta:<id>` no longer resolves). Rare, accepted for now.
3. Bail library (voicemail bail, IVR caps, got-answer hangup) is UI + policy only — enforcement
   is not wired to live calls. Master switch stays off.
4. A2P SMS approval pending; restock texts stay stubbed until it lands (runbook in admin checkpoint).
5. Name echo + adaptive premium follow-up are Charlie-only by design — don't chase them in Delta.
6. Delta cost write-up into `CHEAP_NAV_ARCHITECTURE.md` never done.

## 5. Every trap (memorize these)

- **Free-tier Gemini in the live path = the "brain unplugged" bug.** Quota 429s make every clerk
  reply classify as "unclear" and the agent repeats itself, then wraps tone-deaf. The llm() gateway
  (`src/llm.ts`) now falls back (gemini/groq → gpt-4o-mini via `withOpenAIFallback`), and the Delta
  classifier is on paid Groq. NEVER put a free-tier key back in a live call path.
- **Cloudflare eats JSON 502s** — llm-ping "502 HTML page" means the app 502'd and CF replaced the
  body, not that Railway is down.
- **Old staging deploy = calls silently run Charlie.** Always confirm the deploy before a test round.
- **Twilio `<Stream>` survives TwiML replacement.** Any new fork must be `<Stop>`ped before a
  `<Connect>` barge or audio doubles.
- **`ingestPending` must skip `delta:` provider ids** — the EL poller will otherwise thrash on them.
- **No dashes in ANY spoken line** (both lanes — prompt rule + clip copy). TTS reads them badly and
  it's a copy law anyway.
- **Delta pre-opener wait is 3s** (was 8s = dead air complaint). Slot 7 nudge covers silent pickups.
- **Keep classifier examples in sync** between tapedeck's prompt and verdict.ts (e.g. the 3-pack
  blister mapping) or the two reads disagree and calls drop to "unclear".
- **Railway/Groq/staging via curl ONLY** — python urllib/requests 403 through the sandbox proxy and
  it looks exactly like "the service is down".
- **Railway deploy status "CRASHED"** right after a push is usually the OLD instance getting
  SIGTERM'd (pnpm ELIFECYCLE) — cosmetic; check the newest deployment, not the loudest.
- **Fun-store rows are owner-only** — they must never leak into real-store stats or the finds feed
  (the god-view filter exists for this; the Feedback tab deliberately shows them unfiltered).

## 6. Where things live

`src/calls/tapedeck.ts` (Delta engine) · `src/calls/service.ts` (triggerCall, ingestPending) ·
`src/voice/prompts.ts` (Charlie brain) · `src/voice/elevenlabs.ts` (EL tools) ·
`src/voice/verdict.ts` (second read + reconcile) · `src/llm.ts` (model gateway, Helicone) ·
`src/server.ts` (bridge, /pub/*, twilio-media, barge, delta relay) · `public/checkit.html`
(consumer live-call UI) · workflows/routing: Admin → Voice → Workflows (vt_workflows setting).
Secrets: Railway variables (see CLAUDE.md — curl one-liner). Model bench + fallback story:
git log around f61bed2 and the 07-11 admin checkpoint.

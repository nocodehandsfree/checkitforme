# Session State — Calls / Cheap-Nav / Agent (2026-06-19)

Backend + call-quality work for the "Check It For Me" demo. Code is committed to branch
`claude/retail-stock-voice-calls-OcyMS` (deploy branch; Railway auto-deploys on push). This doc
captures the **non-code state** (live ElevenLabs agent + DB config) and the **next steps**, so the work
can resume cleanly.

> ⚠️ **ONE SHARED BACKEND.** The consumer front-end (live demo calls via `/check-live`) and the trainer
> both run on the **same** Railway service (`d363a982-…`). **Every backend push restarts the process,
> which kills any live call in progress** (bridge WS drops → clerk hears silence, listener audio cuts).
> **Do NOT deploy while the owner is demoing.** Fix = decouple the trainer onto its own service (planned,
> not done — see Next Steps).

## How to read/write the live config
Owner provides the **Railway project token** each session. With it:
```
curl -s -X POST https://backboard.railway.app/graphql/v2 -H "Authorization: Bearer $RW" -H "Content-Type: application/json" \
  -d '{"query":"{ variables(projectId:\"889e332c-30fe-46e9-a18e-d8de4f7523aa\", environmentId:\"7cbf9327-357a-415e-9031-d1609aead2b4\", serviceId:\"d363a982-e918-4433-b175-defe8faf0ec9\") }"}'
```
→ gives `ADMIN_TOKEN`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`. Then:
- **Live voice tuning:** `PATCH /api/voice-tuning` (x-admin-token) — `{pushPrompt, turnEagerness, turnTimeout, softTimeoutSecs, softTimeoutMsg, speed, stability}`. Verify on the agent itself: `GET https://api.elevenlabs.io/v1/convai/agents/$AG` (turn_timeout + soft_timeout are NOT echoed by getVoiceTuning — read the agent).
- **Chain path / mute:** `PATCH /api/chains/:id` — `{dtmfShortcut, phoneTreeDefault, muted}`.
- **Openers / voice pool:** `PATCH /api/settings` — `{openerVariants, voicePool}`.
- **Trainer:** `POST /api/admin/trainer/document {chainId|retailerId}` → poll `GET /api/admin/trainer/session/:id`. (Trainer sessions are IN-MEMORY → wiped on any deploy.)
- After `pushPrompt`, the EL turn-config is partly reset — re-PATCH the agent's `turn` block (raw EL) to re-assert `turn_timeout`/`soft_timeout`.

## LIVE AGENT (ElevenLabs restock agent) — current
- turn_eagerness **normal** · turn_timeout **10s** · silence_end_call_timeout **120s** · soft_timeout **OFF (-1)**
- speed **0.9** · stability **0.4** · optimize_streaming_latency **3** · LLM **claude-sonnet-4-6**
- Prompt (pushed): single-word menu replies ("Front"/"General", never the long phrase) · greet-only-on-confusion
  (don't say "I'm here" unless the clerk can't tell anyone's there) · one bonus follow-up on a YES
  ("booster packs or a tin — which set?") then end · end the call fast after a clear answer, no double-confirm.
- **Turn-taking history:** patient(too slow)→normal→eager(cut off the clerk)→**normal** (owner's pick: avoid
  clipping the answer). Only 3 EL presets exist (patient/normal/eager); turn_timeout is the only continuous knob.

## CHAINS (DB) — phone-tree paths
- **CVS** (5): voice IVR, **no DTMF** (cleared). Say one word: "No" → "Front" → "General". Robot-aware prompt.
- **Target** (1): keypad, **`2@2,2@4`** (press 2, then 2 → customer service / packs).
- **Barnes & Noble** (14): keypad, **`0@1`** (press 0 once ~1s after connect).
- **Walgreens** (10): keypad, `0@5,0@12,0@19`.
- **MUTED (don't call):** Five Below · Marshalls · Best Buy · TJ Maxx · _CVS Pharmacy at Target.
  (Best Buy/Five Below = national-AI/website dead-ends, found via the trainer. The trainer now REFUSES muted chains.)

## OPENERS / VOICE
- **5 opener variants** in `vt_opener_variants`, global round-robin per call (wired in `buildRestockVars` + `triggerCall`).
  Editable in Admin → Test Bench → "Step 2 · Rotation".
- **Voice pool** set (Jared `qjPJGqj6uXrveZalrrsj`, Branson `6HjmwcEkrRm46qtsvp9k`) **but NOT wired on the live
  bridge** — bridge uses one fixed voice. Per-call voice override needs `conversation_config_override` in the
  bridge init (`bridge.ts` connectEleven, ~line 148) — that override path has a HANG-UP history, so test carefully.
  This is the **personas** build.

## CHEAP-NAV / TRAINER — PROVEN ✅
The "everything cheap until human" model is real and validated on live calls. See `docs/finance/CHEAP_NAV_ARCHITECTURE.md`.
- **Engine:** `src/calls/navigator.ts` ("Tree Trainer") — Twilio `<Gather>` STT + cheap LLM + `<Say>`/`<Play digits>`,
  **zero ElevenLabs**. Dials, navigates, records a recipe (path + seconds + type), hangs up at the human.
- **Nav brain:** `NAV_MODEL = "gemini-2.5-flash-lite"` (was Groq Llama 8B). **The switch was the unlock** — Groq 8B
  navigated menus but missed clear human greetings; **Gemini Flash-Lite nails the human hand-off** and is still cheap.
- **Locked recipes (real calls):**
  - **GameStop** = keypad · **press 1** · ~28s → human ✓
  - **Hot Topic** = direct (person answers) · ~13s → human ✓
- **The remaining build:** the LIVE hand-off — instead of hanging up at the human, splice the call into
  ElevenLabs+Sonnet. The locked recipes become the fast-path. Real telephony change (mid-call Twilio control
  transfer) → must be tested deliberately, NOT during a demo.

## NEXT STEPS (in order)
1. **Decouple the trainer onto its own Railway service** so trainer deploys never restart the demo server.
   (Owner said "can we?" → yes; "don't do it yet" → wait for the go-ahead.) Approach: 2nd Railway service from the
   same repo with a trainer-only start (or a flag), trainer routes there, demo stays on the main service.
2. **Build the live cheap-nav → ElevenLabs hand-off** (the complete cheapest call). Smallest first: keypad chains.
3. **Personas:** wire per-call voice rotation (Jared↔Branson) on the bridge + the broader persona set.
4. **Verify** the website agent's calendar redesign + brand-mark share card (shipped — see recent commits) on
   checkitforme.com.

## Parallel agents (this branch has their work too)
Website (checkit.html result page, calendar, share card), Admin (Test Bench tuning, rotation editor, status
registry), Data/Logos (store logos, chain types). All committed to the same branch and in sync.

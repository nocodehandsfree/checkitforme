# ElevenLabs Agent Tuning — source of truth

The voice agent's behavior (how fast it responds, when it lets the clerk interrupt, voice stability) lives
on **ElevenLabs**, not in this repo's code. This file is the **record** of what's set on each environment so
we know staging vs prod at a glance and can change/promote deliberately.

> ⚠️ These values are LIVE on ElevenLabs. Editing this file does NOT change the agent — run the PATCH below.
> Keep this file in sync whenever you change an agent (update the table + date).

## Which agent each environment uses
The server reads `ELEVENLABS_AGENT_ID` (Railway env var, per service) at boot. **Staging and prod use
DIFFERENT agents on purpose** so we can tune staging without touching prod calls.

| Env | Railway service | `ELEVENLABS_AGENT_ID` |
|---|---|---|
| **staging** (`staging.checkitforme.com`) | `8165df7a-…` | `agent_7301kvvbpy3afssvaqrte3bd6cj3` (clone, tunable) |
| **production** (`checkitforme.com`) | `d363a982-…` | `agent_7501ktapdef5f7e9k9qat8pnz4e7` (original) |

The staging clone was duplicated from the prod agent on 2026-06-23, then tuned (below).

## Current tuning (last updated 2026-06-23)
Knobs that affect responsiveness + interruptions. `conversation_config.turn.*`, `.agent.*`, `.tts.*`.

| Setting | Prod (`…7501ktap`) | Staging (`…7301kvvbpy3`) | What it does |
|---|---|---|---|
| `turn.turn_eagerness` | `normal` | `normal` | How long it waits to be sure the clerk is done before replying. `patient` = fewer false interruptions but SLOWER replies (tried it, too slow). `eager` = snappier but jumpier. |
| `turn.speculative_turn` | `true` | **`false`** | `true` = starts forming its reply before the clerk finishes (snappy, but can jump in early). `false` = waits for a clean end-of-turn (no premature cut-ins). |
| `agent.disable_first_message_interruptions` | `false` | **`true`** | `true` = background noise can't cut off the opening greeting. |
| `turn.interruption_ignore_terms` | `[]` | **11 fillers** | Backchannels ("yeah", "okay", "uh", "um", "yep", …) won't make the agent stop talking. |
| `tts.stability` | `0.4` | `0.4` | Voice steadiness. Higher = steadier/less expressive, less prone to garble on an abrupt interrupt. Owner wants to A/B 0.40 vs 0.55. |
| `turn.turn_timeout` | `10s` | `10s` | Silence before it re-prompts / assumes the turn ended. |
| `vad.background_voice_detection` | `true` | `true` | Filters background voices from being treated as the clerk. |

**Why staging differs:** a test call had background noise interrupting the agent mid-sentence (the "chipmunk"
restart). The staging changes (`speculative_turn=false`, first-message protection, filler ignore-terms) reduce
that without the slowness of `turn_eagerness=patient` (which was reverted to `normal`).

## Read the current settings
```bash
KEY=<ELEVENLABS_API_KEY from Railway>
AGENT=agent_7301kvvbpy3afssvaqrte3bd6cj3   # staging clone (or the prod id)
curl -s "https://api.elevenlabs.io/v1/convai/agents/$AGENT" -H "xi-api-key: $KEY" \
 | python3 -c "import sys,json;cc=json.load(sys.stdin)['conversation_config'];print('turn',cc['turn']);print('agent.dfmi',cc['agent'].get('disable_first_message_interruptions'));print('tts.stability',cc['tts'].get('stability'))"
```

## Change a setting (PATCH — merges, doesn't replace)
```bash
curl -s -X PATCH "https://api.elevenlabs.io/v1/convai/agents/$AGENT" -H "xi-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"conversation_config":{"turn":{"turn_eagerness":"normal","speculative_turn":false},"agent":{"disable_first_message_interruptions":true},"tts":{"stability":0.4}}}'
```
Then update the table above + the date.

## Call script v2 tweaks — staging clone, 2026-06-24 (later)
- **Opening unhurried:** the in-stock opening question is delivered at a calm pace, asked ONCE, then waits
  (no repeat/rephrase on a brief pause) — fixes the agent racing + repeating the first question.
- **"set" said clearly** + **always ask the form:** on a YES it asks the SET, then — whether or not they
  know the set — asks "tin or booster packs?", then wraps. (Previously it wrapped if the set was unknown.)
- **tts.speed 0.9 → 0.85** (slower, clearer delivery).

## Call script (the agent's prompt) — staging clone, 2026-06-24
The conversation prompt lives on the agent (not in repo code). Changed on the **staging clone only**:
- **Name-aware in-stock opening:** if the clerk greets with a first name ("…Bob speaking") → "Hi Bob — do you
  have {{category}} in stock?"; otherwise "Hi — do you have {{category}} in stock?" (replaces the old
  "got any … in on your shipment?" opener).
- **In-stock follow-up = set first:** "do you know which set it is?" → if they name a set → "do you know if
  it comes in a tin or booster packs?" → wrap. If they don't know / won't commit → "ok, thanks anyways —
  have a good one!" and end.
- **Backup for rollback:** the PRE-change prompt is saved at
  `docs/ops/agent-backups/staging-prompt-backup.json`. To roll back: PATCH the clone's
  `conversation_config.agent.prompt.prompt` with the `prompt` field from that file (and `first_message`).
  (ElevenLabs also keeps its own agent version history.)
- **Prod's agent prompt is UNCHANGED** (still the shipment-style opener). Apply the same prompt edits to
  prod's agent only when you've approved the new script on staging.

> Possible lever for the "agent sounds rushed": `conversation_config.tts.optimize_streaming_latency`
> (currently 3 — higher = lower latency but can sound choppy/rushed). Try 1–2 for smoother speech.

## Promoting tuning to production
Code promotion (merging `checkit.html`/server to the prod branch) does **NOT** change the agent — the agent is
an env var. To make prod behave like staging, do ONE of:
1. **PATCH prod's agent** (`…7501ktap`) with the same settings (recommended — keeps prod's own agent), or
2. Point prod's `ELEVENLABS_AGENT_ID` (Railway service `d363a982-…`) at the staging clone.

Do this only after listening to staging and confirming you like it.

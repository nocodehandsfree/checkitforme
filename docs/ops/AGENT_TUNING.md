# ElevenLabs Agent Tuning — source of truth

The voice agent's behavior (how fast it responds, when it lets the clerk interrupt, voice stability) lives
on **ElevenLabs**, not in this repo's code. This file is the **record** of what's set on each agent so we can
change/promote deliberately.

> ⚠️ These values are LIVE on ElevenLabs. Editing this file does NOT change the agent — run the PATCH below.
> Keep this file in sync whenever you change an agent (update the table + date).

## The two agents (one environment now — no staging)
There's **one live environment** (prod, `checkitforme.com`, Railway svc `d363a982-…`). The server reads
`ELEVENLABS_AGENT_ID` at boot. Two ElevenLabs agents still exist from the old split:

| Agent | `ELEVENLABS_AGENT_ID` | State |
|---|---|---|
| **Tuned** (formerly the "staging clone") | `agent_7301kvvbpy3afssvaqrte3bd6cj3` | Has ALL the good v3 script + turn-taking fixes below. |
| **Original** | `agent_7501ktapdef5f7e9k9qat8pnz4e7` | Untuned — still the old shipment-style opener. |

The tuned agent was duplicated from the original on 2026-06-23, then tuned (below).

> ⚠️ **DevOps open question — verify which agent prod points at.** All the good tuning lives on the *tuned*
> agent. If prod's `ELEVENLABS_AGENT_ID` (svc `d363a982-…`) still points at the *original*, none of it is live.
> Read the env var, and either point prod at the tuned agent or PATCH the fixes onto whatever agent prod uses.
> The old references to "staging" below are historical — treat "staging clone" = the **tuned** agent.

## Current tuning (last updated 2026-06-23)
Knobs that affect responsiveness + interruptions. `conversation_config.turn.*`, `.agent.*`, `.tts.*`.

| Setting | Original (`…7501ktap`) | Tuned (`…7301kvvbpy3`) | What it does |
|---|---|---|---|
| `turn.turn_eagerness` | `normal` | `normal` | How long it waits to be sure the clerk is done before replying. `patient` = fewer false interruptions but SLOWER replies (tried it, too slow). `eager` = snappier but jumpier. |
| `turn.speculative_turn` | `true` | **`false`** | `true` = starts forming its reply before the clerk finishes (snappy, but can jump in early). `false` = waits for a clean end-of-turn (no premature cut-ins). |
| `agent.disable_first_message_interruptions` | `false` | **`true`** | `true` = background noise can't cut off the opening greeting. |
| `turn.interruption_ignore_terms` | `[]` | **11 fillers** | Backchannels ("yeah", "okay", "uh", "um", "yep", …) won't make the agent stop talking. |
| `tts.stability` | `0.4` | `0.4` | Voice steadiness. Higher = steadier/less expressive, less prone to garble on an abrupt interrupt. Owner wants to A/B 0.40 vs 0.55. |
| `turn.turn_timeout` | `10s` | `10s` | Silence before it re-prompts / assumes the turn ended. |
| `vad.background_voice_detection` | `true` | `true` | Filters background voices from being treated as the clerk. |

**Why the tuned agent differs:** a test call had background noise interrupting the agent mid-sentence (the
"chipmunk" restart). The tuned changes (`speculative_turn=false`, first-message protection, filler
ignore-terms) reduce that without the slowness of `turn_eagerness=patient` (which was reverted to `normal`).

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

## Call script v3 tweaks — staging clone, 2026-06-24 (latest)
- **Opening wording:** "do you have any {{category}} cards in stock?" (was "do you have {{category}} in stock?").
- **Ask ONCE, never twice:** strengthened — never re-ask the stock question in one call (fixes the agent
  "tripping out" / asking the same question twice quickly).
- **Restock-coming gate:** if they say a shipment/restock is COMING (not buyable now), do NOT ask set/form —
  capture the day and wrap as RESTOCK-INCOMING (never "not in stock today"). Fixes the bug where a "restock
  coming" answer still triggered the set/tin questions and a wrong "not in stock" verdict.
- **tts.speed 0.85 → 0.80** (slower opening) and **turn_eagerness normal → patient** (fewer phantom/duplicate turns).

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

## Making the tuning live in prod
Code (merging `checkit.html`/server) does **NOT** change the agent — the agent is an env var. To make the
live calls use the tuned behavior, do ONE of:
1. Point prod's `ELEVENLABS_AGENT_ID` (Railway svc `d363a982-…`) at the **tuned** agent (`…7301kvvbpy3`), or
2. **PATCH whatever agent prod points at** with the settings + prompt above.

Confirm by placing a Fun-store test call and listening.

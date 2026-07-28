# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-28 THE LIVE CALL RUNTIME — sections 4/5/10 on staging (spec `docs/specs/live-call-runtime/`)
**READ THE SPEC BEFORE TOUCHING ANY OF THIS.** Section 3 (Gate Zero) still gates section 6 (hold).
- **Delta is now ONE CLIP through the bridge**, not a whole-call engine. On a real person: the clip
  plays out the media stream, Charlie is PREWARMED behind it on a DEDICATED joining agent, and his
  I/O stays shut until the clip ends. Early clerk speech lands in the bridge's existing `pending[]`
  and is released whole at the gate. `clip-cache.ts` (μ-law 8kHz, cached — kills the ~7¢/call resynth).
- **THREE SIGNALS end the clip**, first wins: Twilio `mark` · the clip's own length (8 bytes/ms) ·
  `agentPlayingUntil` (re-checked when the length timer lands, so real audio can only DELAY). All
  three miss → backstop opens him at +4s. An early agent is recoverable, a clerk in silence is not.
- **JOINING AGENT, NEVER A PER-CALL OVERRIDE** (that once hung calls up). `scripts/make-midcall-agent.ts`
  clones the live agent + prepends the wait-silently rule. Staging `ELEVENLABS_MIDCALL_AGENT_ID` =
  `agent_2301kyk2rwgyfg8r50xk9enqwy2r`. **UNSET = no clip, exactly today's path.** PROD NOT SET.
- **Clip only when `opts.voiceId` is set** (workflow voice strip) so clip voice == agent voice. No
  voice strip → no clip. Deliberate: we do NOT turn the override path on for calls that send none.
- **THE MAP IS READ ONCE** (`activeMap` → `navPlanFromVersion`, pure + tested). Presses, spoken words
  and `afterPrompt` anchors all come off ONE version. `stageNavPromptPlan` DELETED — it keyed on the
  step-list SHAPE, expired in 10min, died on restart, and could mix two versions on a live call.
  Same read finally gives the runtime STORE EXCEPTIONS and fills `mapVersion` on the receipt.
- **STOP PRESSING KEYS AT A PERSON** (`looksLikeAPerson`): first thing heard is SHORT (≤3.5s) then an
  unbroken wait (≥2.5s) → abandon remaining steps, hand to the conversation. Narrow on purpose: only
  before step 1, only on prompt 1. Kill switch `flags.stopKeysOnHuman` (default ON).
- **DRIVEN, NOT CLAIMED:** `scripts/test-delta-clip.ts` stands up a REAL ws server as the provider +
  a real socket as the carrier, watches both wires. 17 asserts incl. agent-silenced-during-clip and
  no-joining-agent-is-unchanged. 21 listen-nav · 55 mapgraph · 64 map-e2e · 63 receipt. tsc clean.
- **NOT VERIFIED: any real phone call.** The Fun store rings the OWNER'S phone, so I cannot answer one.
  Needs one real Fun call: clip audible, no double greeting, no talk-over, receipt shows 3 charlie_join
  lines + `mapVersion`. **`reportCallDrift` + callId were ALREADY wired** (service.ts roomFinalizers).
- Fun store 106361 moved OFF "Branson Delta Test" (old whole-call Delta) → "Branson Global" on staging.

## Voice/tuning + engine state (verified live 07-21/07-24)
- Default agent both envs **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register, max one "!" · greet-back HARD RULE · set + package question · restock
  ask on any no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Ringback by published tone frequencies (Goertzel 350/440/480/620, median >= .45) so the agent never
  opens on a ringing line; 6 unanswered rings = hang up.
- **MONEY, MEASURED (07-24):** Charlie **$0.00183/s**, billed per SECOND, meters SILENCE — only CLOSING
  the socket saves. Twilio WHOLE MINUTES ($0.0140/min). Baseline 5.2c. Rates in `src/calls/cost.ts`.
- The receipt: `docs/specs/call-receipt/README.md`. EventKind is a CLOSED 16 — detail, never a 17th.
  `room` is the join key. **Unmeasured = NULL, never 0.** NO CONVERSATION AUDIO, ever; OUR OWN CLIPS
  are the one deliberate exception and are cached on purpose (spec rule 3).

## OPEN (priority order)
0. **GATE ZERO — six calls, three each way, before ANY hold work** (spec section 3). Needs the owner
   to play clerk on the Fun store, or a store that is not his phone. Blocks section 6 entirely.
1. **Section 7, the brain on our own account** — Admin switch, fallback ladder, stamp which brain ran.
   Independent of everything else and worth ~5x on that line. Not started.
2. **Section 8, the dropped call** — new status + Spanish in the same commit, never charge, must not
   trip the one-hour block (`findRecentCheck` matches only `completed` — VERIFY on a real drop).
3. `POST /api/admin/map/sweep/start {maxCalls}` east→west, 250 cap. Prove the 46 directs.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/call-now` still rides the OLD direct path — no room, no receipt (spec rule 4 says it must).
- #1 mapping trap: auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable.
- The old whole-call Delta (`tapedeck.ts`) STAYS in the tree and still works — no store points at it.

# VOICE-CALLS — checkpoint (current state)
> The calling engine + voice tuning + phone-tree mapping. `src/voice/` is FROZEN (machine-locked;
> owner-named task + repo-root `.unlock` to open). Charter: handoff.md + MAPPING-MANUAL.md. <=60 lines.

## LAW — ADMIN IS THE RECORD OF TRUTH (owner, absolute): never change a setting behind Admin's back.

## 07-28 THE LIVE CALL RUNTIME — §4/5/10 on staging. READ `docs/specs/live-call-runtime/` FIRST.
> §3 Gate Zero is UNANSWERED and still gates §6 (hold). Nothing here touches hold or handback.
- **Delta is now ONE CLIP through the bridge**, not a whole-call engine. On a real person the clip
  plays out the media stream, Charlie is PREWARMED behind it on a DEDICATED joining agent, and his
  I/O stays shut until it ends. Early clerk speech lands in the existing `pending[]`, released whole
  at the gate. `clip-cache.ts` = μ-law 8kHz + cached, killing the ~7¢/call resynth.
- **THREE SIGNALS end the clip**, first wins: Twilio `mark` · its own length (8 B/ms) · `agentPlayingUntil`
  (re-read when the length timer lands, so real audio can only DELAY). All three miss → backstop at
  +4s: an early agent is recoverable, a clerk in silence is not.
- **JOINING AGENT, NEVER A PER-CALL OVERRIDE** (that once hung calls up). `make-midcall-agent.ts`
  clones the live agent + prepends the wait-silently rule. Staging `ELEVENLABS_MIDCALL_AGENT_ID` =
  `agent_2301kyk2rwgyfg8r50xk9enqwy2r`; **UNSET = no clip, today's path exactly.** PROD NOT SET. Clip
  ONLY when `opts.voiceId` is set (workflow strip) so clip voice == agent voice.
- **Charlie warms up 2s BEFORE the clip ends, not at its start** — a real clip measured **5.1s** and he
  bills from socket open. `prewarmTimer` is kept OUT of `clipTimers` (the gate clears those) or a
  short clip leaves the clerk with NO agent at all.
- **THE MAP IS READ ONCE** (`activeMap` → `navPlanFromVersion`, pure + tested): presses, spoken words
  and `afterPrompt` anchors all off ONE version. `stageNavPromptPlan` DELETED — keyed on step-list
  SHAPE, 10min expiry, died on restart, could mix two versions live. Same read finally gives the
  runtime STORE EXCEPTIONS and fills `mapVersion` on the receipt.
- **STOP PRESSING KEYS AT A PERSON** (`looksLikeAPerson`): first thing heard SHORT (≤3.5s) then an
  unbroken wait (≥2.5s) → abandon remaining steps. Narrow on purpose: only before step 1, only on
  prompt 1. Kill switch `flags.stopKeysOnHuman` (ON).
- **DRIVEN:** `test-delta-clip.ts` = a REAL ws server as the provider + a real socket as the carrier,
  watching both wires. 23 asserts + 21 listen-nav · 55 mapgraph · 64 map-e2e · 63 receipt · 13 bridge.
  `ulaw_8000` PROVEN live (40496 B, 8 B/ms, cache 0ms identical); `navPlanFromVersion` on staging's
  REAL Target + CVS = byte-identical to the chain rows → switching the source moves NO route.
- **NOT VERIFIED: any real phone call** — the Fun store rings the OWNER'S phone. Needs one real call:
  clip audible, no double greeting, no talk-over, receipt shows 3 `charlie_join` lines + `mapVersion`.
  **`reportCallDrift` + callId were ALREADY wired** (service.ts roomFinalizers) — do not rebuild them.
  Fun 106361 moved OFF "Branson Delta Test" (old whole-call Delta) → "Branson Global" on staging.
## Voice/tuning + engine state (verified live 07-21/07-24)
- Default agent both envs **Branson HD `1P1JhCcLzeMmkvLi1BkG`**, speed 0.85, persona off. Prompt rules
  live: no dashes · one register, max one "!" · greet-back HARD RULE · set + package question · restock
  ask on any no · voicemail status · echo gate 520/150. Shipment TIME capture NOT live-verified.
- Ringback by its published tone frequencies (Goertzel 350/440/480/620, median >= .45) so the agent
  never opens on a ringing line; 6 unanswered rings = hang up.
- **MONEY (07-24):** Charlie **$0.00183/s**, per SECOND, meters SILENCE — only CLOSING the socket saves.
  Twilio WHOLE MINUTES ($0.0140/min). Baseline 5.2c. Rates `src/calls/cost.ts`.
- Receipt (`docs/specs/call-receipt/`): EventKind a CLOSED 16 · `room` is the join key · unmeasured =
  NULL never 0 · NO conversation audio ever, our own clips the one cached exception.
## OPEN (priority order)
0. **GATE ZERO — 6 calls, 3 each way, before ANY hold work** (§3). Needs the owner to play clerk, or a
   test store that is NOT his phone. Blocks §6 entirely.
1. **§7 brain on our own account** — Admin switch, fallback ladder, stamp which brain ran. ~5x on that
   line, independent of everything else. Not started.
2. **§8 the dropped call** — new status + Spanish same commit, never charge, must not trip the one-hour
   block (`findRecentCheck` matches only `completed` — VERIFY on a real drop).
3. `POST /api/admin/map/sweep/start {maxCalls}` east→west, 250 cap. Prove the 46 directs.
## Traps
- Never run the full suite for a small change; never deploy while the owner is mid-test-call.
- `/api/call-now` still rides the OLD direct path — no room, no receipt (spec rule 4 says it must).
- Auto-nav 0-hammers when it can't parse → FALSE "no human"; a no-answer ≠ unmappable. Old whole-call
  Delta (`tapedeck.ts`) STAYS in the tree and still works — no store points at it.

# ECHO HANDOFF — read this and you ARE the rehearsal chat, mid stride (2026-08-18 night)

Boot per CLAUDE.md, then read this file, `docs/team/voice-calls/RULES.md` (every line),
`checkpoint.md`, and `docs/team/voice-calls/next-box.md` (the owner's box, most of it now done).
Work on `staging`. Robot store only, never the Fun store. Never push while a check is in the air
(`/api/admin/test-calls?limit=1`). Report every check by its NUMBER.

## WHAT IS DONE, with the check that proves each one
The owner's music box, items 1, 2, 3, 5 and 7, plus tonight's sheet fix:
- **Echo hears hold music by its sound, about a second in.** Proven live on checks 394 and 395:
  "Echo recognised hold music", 1200ms in, dated to the music's own first note.
- **The drop is ONE number, 3 seconds, music the same as silence** (`holdMusicMs` 6000 → 3000 in
  `src/calls/tuning.ts`; it is code-only, not an Admin box). Every music dial since reads its drop
  row 3s GREEN where it used to read 6s red.
- **Scene 21, the swelling music test: THE PILL SAYS PASSED, check 393.** Meter 27s yellow, drop
  row 3s green, answer gap 2s green, handover 1s green, profit 71%.
- **Scene 20, the loud classic music test: the new meter floor is 32 to 34 seconds** (checks 394
  and 395), down from 39 and 43 before the change. Both still red against his 31 line, by 1 to 3
  seconds. Card half passes on both, everything structural green. WHAT IS LEFT IS NOT THE MUSIC:
  the answer gap ran 4s on 394 and 7s on 395 against a 2s green, which is the voice provider taking
  2 to 7 seconds to think up each reply. That is his own-brain plan, outside this box.
- **The advert judge (item 7): 23 of 23 right on the saved recordings**, first wording, nothing
  reworded. `judgeHoldVoice` in `src/voice/verdict.ts`, run after a check settles from the verdict
  tail in `receipt-store.ts`, writes "…was really a recording the store played" (step
  `played_at_us`). Re-runnable for good: `GROQ_API_KEY=… OPENAI_API_KEY=… ./node_modules/.bin/tsx
  scripts/hold-voice-bench.ts` — the recordings are committed inside it, so a reword is re-run on
  the SAME recordings, never on a fresh dial. It has NOT met a live advert dial yet (see below).
- **The check sheet names the reader that really did the work and its real price.** Our Groq key
  never carried llama-3.3-70b, so every check was quietly read by OpenAI's gpt-4o-mini while the
  record printed the Groq name and charged the Groq price. `llmNamed` reports who answered,
  `readBy` carries it, `readCostUsd` prices it, and all three settle doors stamp it. Proven live on
  checks 393, 394, 395: the record now reads `gpt-4o-mini`, cost 207, where it read
  `groq:llama-3.3-70b-versatile`, cost 626. The owner ruled the OpenAI reader stays for now.

## WHAT I THREW AWAY, and why it must not come back (his item 6)
Judging music by how STEADY its loudness is. Per whole line it looked clean; sliding a one-second
window across real speech — the decision the live ear actually makes — it would have called 30 of
106 windows of a real person music and dropped Charlie mid sentence. Measured, then deleted.

## ADDED 08-19 EARLY (this session's second build, before the dials)
- **The listener that hears Staff say they are stepping away now knows 124 phrasings**
  (`saidGoingToCheck`, `src/voice/prompts.ts`), in seven groups, pinned by
  `scripts/test-going-to-check.ts` which is wired into `test-all.sh` so it runs on every build.
  159 of 159 green. It missed most plain ways of saying it before: "please hold", "putting the
  phone down for a sec", "bear with me", "I'll be right back", "hang tight", "one moment".
  THE OTHER HALF OF THAT FILE IS THE SAFETY and matters as much: 35 lines that must never read as
  walking away, because a false yes means the next quiet drops Charlie while Staff are still
  standing there thinking (the 08-08 inversion, which costs the answer). Those negatives are what
  forced every guard in the pattern: "hold on" never matches "hold on TO your receipt", "you hold"
  never matches "we hold those behind the counter", a bare "second"/"minute" never fires so
  "they're in the second aisle" and "it's a minute from here" stay quiet, "see" never matches "see
  you then", and "let me" only fires on a going-to-look verb so "let me know" and "let me tell
  you" stay quiet. ADD to this file whenever a real check shows a new phrasing; never remove.
  NOTE FOR THE PM: the simulation agent's own writeup of its 123 lines is NOT committed anywhere
  in the repo or on any branch (I searched both), so this list was rebuilt from committed sources
  — `docs/team/voice-calls/how-staff-actually-talk.md`, the robot store's scripts, and the real
  lines off checks 383, 384, 386, 391, 393. If their exact 123 turn up, paste them straight in.
- **The owner's wording ruling is in, all three doors in one commit**: Charlie's package question
  is "and is it a pack or a box?" (`prompts.ts`, both variants), the reconnect list in `bridge.ts`
  no longer names the tin, and the robot store's own follow-up scripts in `tapedeck.ts` match.
  The reader that double checks a finished call STILL understands "tin" when Staff say it
  unprompted, and the "ten"/"tin" mishearing rule is untouched, both on purpose.
- **Two suite reds are PRE-EXISTING, proven by stashing my work and re-running**: `workflow-truth`
  ("the restock question is in EVERY live check" — it asserts wording the live prompt has not used
  for a while) and `test-one-question` (2 failed, red on a clean baseline since 08-06). Neither is
  mine; both were red before this session.

## THE DIALS OF 08-19 EARLY (every one by its number)
- **396, scene 23 (phone on the counter, quieter room): THE PILL SAYS PASSED.** Meter 27s yellow,
  drop row 3s green, handover 1s green, profit 70%. Its announce, "Hold on. Let me go look.", is
  one the listener now knows. It had failed at 35s and 45s on earlier dials.
- **397, scene 24 (louder room): THE PILL SAYS PASSED.** Meter 30s yellow, drop 3s green, profit
  68%. Its announce is "Let me put this down a sec and go check.", the exact line that was missed
  on check 386. Test six is green on both halves now.
- **Both dials carry the owner's new sentence on the record**: "and is it a pack or a box".
- **398, scene 22 (the advert inside the music): the after-call reader MET A LIVE CALL and was
  right.** The record reads "One thing Staff seemed to say was really a recording the store played"
  and names the advert line. Echo also stamped "recognised hold music" at 1200ms. THE CARD STILL
  FAILS, exactly as predicted: no hold was ever declared (the advert is a voice, so no listening
  rule can refuse it and its mix never runs 3 unbroken seconds), Charlie ran 46 metered seconds and
  answered the advert. The reader NAMES it; nothing acts on it, because his box said report only,
  never stop a live call. **What the engine should DO with that line is the owner's open ruling.**

## WHAT IS LEFT
1. **Scene 22, the advert in the music, has not been re-dialed.** The judge is proven on its saved
   record but has never run on a fresh dial of it. That is the next dial. Expect the sound rules
   still not to declare a hold there (an advert IS a voice); the judge's line on the record is what
   proves it, and the owner's ruling on what the sheet should DO about it is still open.
2. **Scene 20 cannot make the 31 line** without the own-brain work. Do not shave the music proof to
   get there: 3 seconds is his ruled number and the standing law fences when Charlie's ear switches.
3. Scene 23 (quieter room) fails on the same provider swing; its twin scene 24 passed (check 387).
4. His final judging dials on tests five, six and seven are still his to make.

## TRAPS THAT BIT ME TONIGHT
- **A staging push RESTARTS staging and kills a dial.** I pushed and dialed straight after: the
  harness timed out on the Check button and no check was placed. Push, wait for `/api/health` to
  show your commit, THEN dial.
- Railway builds sat 13+ minutes with three queued. The owner's law: never cancel, never re-queue,
  tell the PM, keep working, read `/api/health` for what staging really serves.
- The waltz (scene 21) never trips the music stamp on a real line: its first 4.6 seconds are single
  plucks with gaps longer than speech has, so the ear reads it as a quiet wait and stops the meter
  on the same 3 seconds. That is correct, not a miss — its drop row is green either way.
- The harness's "the screen and the record say the same thing" red on every dial is the 08-07 screen
  fault, pre-existing, not the card's.

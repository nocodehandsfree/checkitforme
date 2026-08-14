# PM HANDOFF 2026-08-13 — read this and you ARE the last PM, mid-stride

**The moment we are in.** Test one of the owner's twenty, Answer: clear yes, PASSED on check 362
after a week of failures: greeting, Delta, "Yeah.", ONE set question, the answer, Charlie's goodbye,
ended by us at 25s, charged, all five required rows green. The owner judges every check himself on
Admin ▸ Voice ▸ Testing. The loop is LAW: the voice agent dials ONE test, stops, the owner says pass
or fail; fail means fix and dial the SAME test, never the next. Next up: test two, the clear no.
The list he walks with is `docs/specs/testing-page/THE-WALK.md`, built FROM the code.

## THE DOCTRINE THE OWNER AND PM SETTLED — think horizontally, never point-patch
Checks 358, 359, 360 failed three different ways with ONE disease: nobody owns the conversation's
state. Charlie's memory is deleted every time we drop him to save money, the ear knows only loudness,
the reader reads lines as they land, and the glue was little notes written at different moments, so
every fix was a patch on a corner. The owner's words: stop giving point solutions, collapse it.
- **The ledger** (agreed, partly built): ONE memory per check, owned by Echo, derived from the
  record the check already keeps. What we asked, what they answered, what is missing, whose turn.
  Every decision reads it. Never re-invent flags beside it.
- **Behaviour over words, everywhere.** CVS's machine read as a person off a phrase list. The knock
  (keys at pickup), repeats, and stopping-when-we-speak decide person vs recording. A word list can
  never cover Spanish; behaviour needs no language. Unsure NEVER defaults to person; unsure waits.
- **Fail SAFE, not cheap.** When the ledger is unsure a question was answered, Charlie stays on and
  uses his own ears. Sure states save money; unsure states fall back to the old system that worked.

## THE BUILD LADDER (one layer per dial, test one re-proven after each)
1. **DONE, and it is what made 362 pass: THE INVERSION.** Mid conversation, plain quiet NEVER drops
   Charlie. Drops need evidence: Staff's own going-to-check words, hold music, a transfer, or 30s of
   quiet as backstop. Every hold scene has Staff announcing the hold, so the hold savings stand.
   Plus the HONEST ROBOT STORE: a scripted answer only plays after Charlie speaks; on silence it
   says "Hello?" or waits (robotStep used to march on and answered questions nobody asked, check 360).
2. **NEXT: the reconnect brief.** Built AT THE MOMENT he returns, from everything Staff said while he
   was off, handed as THEIR TURN (a note never makes him talk); says what is missing or "nothing is,
   wrap up". Kills the stale note that made him re-ask an answered set question on 360.
3. **THEN: the unsure fallback**, and only then tighten the drop from 6s back toward 3s.

## THE TWO TRACKS (owner's frame, both alive)
- **Track one, now:** ElevenLabs is Charlie's ears+brain+mouth and we make it excellent. The walk
  runs on this box; nothing built for it is thrown away by track two.
- **Track two, the backstop:** Echo's ears + OUR Anthropic brain (5x cheaper; `ourBrain` switch
  exists, blocked only in EL's AGENT product) + EL as MOUTH only via plain text-to-speech in
  Branson's voice (works, proven 07-31; enterprise/PVC not needed for TTS). Owner may run his own
  whisper server later. Build AFTER the walk, behind the SAME ledger, and prove it against the SAME
  twenty tests on the robot store before one real check rides it. Plan two seconds a turn, fight for
  one; the hard piece is knowing Staff FINISHED vs paused. Never mid-walk.

## THE OTHER AGENTS, LIVE NOW
- **Voice agent** (chat "testing sheet round 2"): runs the walk. Charlie's directions were rewritten
  by the owner WITH a repeat rule (repeat the question once when Staff ask; the only allowed twice).
- **Mapper** (fresh chat, was "CVS mapping"): knock built + 3 self-found faults fixed, 57 practice
  checks green. Approved next: the robot store MENU per `docs/specs/mapping-tests/robot-menu.md`
  (owner-approved wording; changed-menu variant: key 0 goes to the PHARMACY, the wrong desk, his
  ruling). Merges ONLY between tests, never while a check is in the air (a deploy drops the call).
  The 13 mapping tests: `docs/specs/mapping-tests/README.md`; only Direct pickup ever dialed live.
- **The reader** swapped 08-13 to groq:llama-3.3-70b-versatile, measured 8/8 by scripts/reader-eval.ts
  (old 8b dies 08-16 and scored 7/8; Groq's suggested gpt-oss-20b failed 4/8). STATUS_READ_USD updated.

## STANDING RULES THAT KEEP BITING
Nothing merges to staging while a check is in the air · a run not pushed did not happen · two tests
per order, never a list · the owner's reply rules are machine-enforced, write facts to a scratch file
and run scripts/check-reply.sh, send EXACTLY the approved text · Delta and tapedeck are the same
thing in his words · Couldn't tell is the worst-case bucket, use No clear answer for never-committed.
Open threads: delete the misspelled `Deepgrm` key on the api service if the owner has not · scene 7's
vague-yes coin flip may be healed by the new reader, re-check when the walk reaches test three.

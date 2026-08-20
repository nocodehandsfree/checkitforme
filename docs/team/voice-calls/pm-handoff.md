# PM HANDOFF — rewritten 08-20 by the second PM chat (9.2MB). The NEXT PM chat boots on this.
## Who you are
PM for the owner's 20-test walk of the calling engine. You AUDIT, you never build engine code.
Every claim from any chat is checked against the call's own record BEFORE it reaches the owner.
ONLY the owner judges a test. Replies to the owner: write the facts to a scratch file, run
`bash scripts/check-reply.sh <file>`, send EXACTLY the approved text. A render carrying a false
fact is NEVER sent — the renderer flips who-did-what, store names and counts, so read every render
line by line against your own notes, then pin only the wrong fact in your draft and re-run.

## OWNER LAWS LEARNED THE HARD WAY (08-19/08-20, all standing)
- **NO LOOPS.** He killed the check-in loop twice, then banned it: "don't have a loop unless I tell
  you." You run when he messages you. One disclosed one-shot wake for a morning report was
  tolerated; nothing else. Never re-arm anything on your own.
- **Prompts for other chats go in a fenced code block** so he can copy-paste. Never as chat prose.
- **Write like he knows nothing.** He said so repeatedly and got angry twice. Short plain sentences,
  no invented labels, no computer speak, no figurative words. Real names always (ElevenLabs is
  ElevenLabs — the reply-lock hook was fixed on 08-19, commit 437a5a7, because agents were hiding
  real names behind "the voice company").
- **WORK SILENTLY** (commit 112da68): text typed between commands reaches his phone unchecked. One
  turn ends in ONE checked reply. A quiet wake-up says exactly "Nothing new since the last check."
- **Judging reads TRUE numbers.** A fix must never change the number that grades it. On 08-19 a
  forgiveness rule rewrote the graded seconds and a 42 second call showed as passed; he was right to
  be furious. Adjustments live BESIDE a number as notes, never inside it.
- **Recordings only where no human can answer back**: the opening question and the walk-away line
  ("Sure, thanks!"). He ripped out the recorded set question and the recorded goodbye — Charlie
  speaks those live. Never propose a recording a person could reply to.
- **NO professional voice clone, NO premade voice.** Charlie's instant clone is his ruling, final.
  Any plan needing a different voice is dead on arrival.
- **The practice store (the robot store that answers itself) and the FUN STORE are different
  stores.** The reply-lock judge has three times demanded the practice store be called "the Fun
  store" — REFUSE every time. The Fun store is his real store with real staff and customers.
- Never push staging while a call is in the air (a push restarts staging and killed check 408).
  Never cancel or re-queue a Railway build. Prod only via `promote.sh` on his word.

## WHERE THE WALK IS (08-20)
- **Test in play: "Hold: music with advert" (scene 22).** Not passed yet. The engine work is done
  and proven; one fault and one ruling remain (below).
- Tests five, six and seven are sheet-green and rehearsed; his final judging dials are still his.
- 13 of the 20 tests have not been walked yet.

## WHAT GOT BUILT 08-19/08-20 (on staging, every number audited against the records)
1. **Hold handling**: when music is recognised, Charlie is dropped and no call audio reaches him.
   Echo keeps listening. He returns only when the WORDS prove a real person (the advert is a voice,
   so sound alone cannot judge it). His awake seconds during a hold are a printed, graded number.
2. **The two part comeback**: his session starts opening on the first sound of a returning voice; he
   says a two word live hello ("Oh, hey!", made fresh each call, never a recording) the moment the
   words prove a person; his full reply follows behind it. First sound went 7.6s to about 2s after
   the person stops talking.
3. **THE BIG ONE — our own brain** (commit 838fbab, `src/voice/ourbrain-session.ts`). ElevenLabs
   refuses a custom brain inside their AGENT product with an instant clone. That refusal does NOT
   cover their plain speech service, which the fresh hello already uses. So we run the conversation
   ourselves and ElevenLabs only speaks each finished line in Charlie's voice. `ourbrain-session.ts`
   speaks their own message protocol so `bridge.ts` cannot tell the lanes apart and every rule runs
   unchanged. Fallback proven in tests: if our side stumbles mid call it hands back to the hosted
   agent, same voice, nothing said out loud. The switch is OFF outside test dials.
   **Check 427: 2.8¢ against 9.5 to 11.9¢ the old way, 89% profit, slowest answer 2s (was 7s), every
   reply stamped with the brain that wrote it. FAILED on one row only.**

## OPEN, WAITING ON THE NEW BUILD CHAT (he is starting a fresh Echo chat)
1. **The silence fault**: after the two word hello, Charlie's full reply never played on check 427
   (the set question, "do you know the name of the set, like Chaos Rising, and is it a pack or a
   box?"). The store worker had to speak first. Echo 3 wrote this down as its next job.
2. **The awake seconds ruling** (he accepted the suggestion): a check passes with up to 8 awake
   seconds during a hold and fails from 9. The old bands (green 3, red 6) are still in the code,
   which is why check 427 failed at 7. The head start costs 4 to 7 awake seconds by design.
3. **The Fun store live test, his order**: ONE staging check dialing the Fun store with the own
   brain switch ON, ONLY while he stands at the phone answering it himself, switch OFF the moment it
   ends. This is the one sanctioned break of the never-dial-the-Fun-store law.
4. Rows 425 and 426 still read `in_progress` on the test-calls list — stale mid-build dial rows.
   Worth a cleanup, not owner-blocking.

## THE MAPPER (separate track, 08-20)
The mapper called CVS Avon 4 times on staging, all "said wrong words", 119 to 147s against its saved
62s recipe (say "no" at 26s, "front" at 38s, "general" at 48s). Its own code was NOT touched by the
big build. Two suspects: the new never-speak-over-a-voice timing rules delaying its words, or CVS
changing their phone menu. The deciding check is WHEN the words played on the recordings. **The
owner handed this to the mapping agent, which knows the fix — do not reopen it unless he asks.**
Production mapper is untouched, zero runs.

## HOW TO AUDIT (unchanged, it works)
`git checkout staging && git pull --rebase`, read the new commits and `echo-handoff.md`. ADMIN_TOKEN
via the curl recipe in `.claude/skills/ship-it/SKILL.md` (curl ONLY; python and WebFetch get 403
through the proxy). `/api/admin/test-calls?limit=5` for the newest rows, then
`/api/admin/receipt/<FULL room uuid>` and read the timeline line by line. `seconds` carries
`charlieConnectedSeconds`, `awakeOnHoldSeconds`, `holdSeconds` and `brain`. `v2.test.meter` carries
the pass and the named fails. `cost.readable` carries the money. Check every build chat's claim
against those numbers before the owner sees a word of it.

## FULL DETAIL
`docs/team/voice-calls/echo-handoff.md` (the build side, every number), `checkpoint.md`,
`docs/STATE.md`, `pm-report.md`, `next-box.md`, `RULES.md` (the 15 never-break rules).

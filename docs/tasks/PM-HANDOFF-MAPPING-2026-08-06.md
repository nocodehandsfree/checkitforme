# PM HANDOFF — MAPPING, 08-06 (verified against the code on staging, not memory)

## WHERE MAPPING STANDS
All three chunks are BUILT, AUDITED AND ON STAGING: 1 the engine · 2 the self-healing loop ·
3 the screens. Every audit round was driven by the PM, not taken on the mapper's word. Last full
run on staging: healing 47 · practice-checks 46 · voice-judge 47 · listen-nav 59 · map-sim 352 ·
resume 21 · mapgraph 62 · map-api 20 · map-e2e 104, all passing, typecheck clean, spec gates ok.

The owner drove ONE mapping check to the Fun store on 08-06 and it worked: mapping reached him,
handed the check to Charlie, they had a conversation, Charlie hung up. The new voice technology is
wired into mapping (`src/calls/charlie-setup.ts`, read by BOTH `bridge-place.ts` and the mapping
hand-off in `server.ts`, so a customer check and a mapping check can never drift apart again).

## THE ONE THING OPEN — boxed to the mapper, NOT yet built
A mapping check skips everything a customer check does at the moment Staff answer, because it sets
`connectOnHuman: false` (Staff are already talking when mapping hands over) and that whole block in
`src/voice/bridge.ts` is gated on it. Four consequences, ONE cause:
1. **Delta never plays** on a mapping check (the clip is played inside that block, ~line 1580).
   The owner hit this live on 08-06 and the check still passed, because Charlie's own rule made him
   speak when the recording did not play.
2. The moment Staff answered is never stamped on the check's record and the hold meter never starts
   (~line 1542), so dropped Charlie and reconnected Charlie may not be measured on a mapping check.
3. The note "the recording did not play, so Charlie asked the question himself" (~line 1643) is in
   there too, so a mapping check never reports that Delta failed.
4. The give-up cap (hang up when Charlie is open and nobody speaks) is set in that block, so a
   mapping check can sit paying for silence.
FIX: at the hand-off, run the SAME code a customer check runs when it finds a person. Pull the
shared part out the way `charlie-setup.ts` was pulled out; never a second copy. Delta must also play
when Staff hand us to a new person. Keep both mapping rules unchanged: Charlie opens right away, and
a mapping check NEVER takes a transfer.

## THE OWNER'S HOLD, 08-06
Echo is mid-test on staging. The mapper builds on his branch, runs his tests there, and pushes
NOTHING. A push restarts staging and kills a live check. The owner says when.

## THE FIRST REAL CVS RUN — after the fix, on the owner's word
Cap that chain at 10 checks for the first run (owner ruled 08-06; the rules already stop on their
own when nothing new wins, the cap is only a runaway guard). Staging only, never production. The
mapper watches it and writes down, in order: the menu's words exactly as heard, the choice taken,
whether a person was reached, what Charlie asked, what Staff said back, whether the department was
proved, what the speed round did. Then Admin > Chains > CVS at phone width, and whether the page
disagrees with what he heard.

## OWNER RULINGS MADE IN THIS CHAT — all built unless noted
- A mapping check never takes a transfer. Riding one proves a desk we cannot name or reach again.
- Proof of the right department is Charlie getting on and Staff speaking to him. Mapping scores
  nothing itself and never judges what Staff said.
- A store that answers differently while the chain's route still works there: keep running the chain
  route, record what it did as "Not used", nothing waits for him, and it counts toward nothing. The
  three-store count was NOT changed (his ruling, against the mapper's proposal).
- A menu choice proven wrong stops being enforced the moment that store is re-mapped. Nothing is
  deleted; the mark stays on file against the map it was learned on.
- Both chain-page buttons ("Start over", "Free doors") are DELETED. He never asked for either.
- Mapped checks wording: no heading for learning the menu — a check reads "Proving department"
  until it is proved, then "Department proved" in green. Speed tries stay yellow until one lands,
  and only the single fastest reads "Speed optimized". Both words are in the Statuses list.
- The one rule that catches every past failure: mapping may know a person answered, and may NEVER
  judge what they said. Their language, a hold, a transfer, the answer are all Charlie's.

## STILL OPEN ELSEWHERE, not the mapper's
- The last step of the rebuild: a customer check still walks a store's menu the OLD way, pressing on
  a stopwatch at the seconds recorded while mapping. Mapping itself has no timer. Tie the two
  together and delete the stopwatch AFTER the owner has watched the new Charlie run a real check.
- Webbie owns two customer sentences: the email when an auto check cannot run because its store
  paused itself (the moment already fires, `onAutoCheckPaused` in `src/calls/healing.ts`), and the
  zone report line saying why a store was skipped. Both English and Spanish, editable in Admin
  wherever alert copy already lives. A paused store comes off the website entirely, so there is no
  paused badge to design.

## HOW THIS PM WORKED, and should keep working
Audit the mapper's diff line by line and RUN every rig personally before telling the owner anything.
Three times the mapper shipped work that passed its own tests and still broke a rule: Spanish
phrases invented inside mapping, a red test pushed quietly, and a screen element the owner named
replaced on the mapper's own judgment. Report unrequested changes to the owner every time, even
when the reasoning is sound.

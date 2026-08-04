# PM HANDOFF — 08-04 (from the Fable PM session, verified against code and live sites, not memory)

## WHAT CLOSED TODAY
- **Charlie's drift is fixed and proven.** His instructions are saved as TWO copies at ElevenLabs:
  one for when he asks the question himself, one for the normal check where Delta's recording asks
  and he joins mid conversation. Updates only ever rewrote copy 1; checks run copy 2, frozen since
  07-28 — that was the asking-twice fault. Now every update writes both (midCallAgentPatch, ONE
  source in src/voice/prompts.ts, asserted byte for byte by scripts/test-prompts.ts) and both were
  pulled back from ElevenLabs and matched word for word.
- **The engine tuning round is live on staging** (PM-audited twice): the person test opens Charlie,
  the loud room drops him, hold cap, who hung up, the recording/warm-up/wrap-up/Spanish written
  down, per-ring lines gone, "Charlie left" gone, "Transferring to [department]" wording. FIVE
  owner numbers in Admin under App, in the one setting production cannot stomp: wrap-up 45s ·
  hold cap 120s · silence before drop 6s · ring wait 90s · check length 240s.
- **The owner's 16 tests are locked in writing**: docs/specs/charlie-behavior/testing-cards.md —
  headline, subhead, and info-bubble copy word for word, plus the final rulings (cost buckets
  Bravo/Foxtrot/Echo/Charlie/Status, tile colors, marker color rule). THAT FILE IS THE LAW.
- **The new check screen is BUILT inside public/app.html** (checkV2Html + MOCK_CHECK_V2, owner
  approved pixel by pixel, open it at admin.checkitforme.com/testing#mockcheck). Echo has the spec:
  wire it to real records, then the engine list (signoff on answer · never repeat a question ·
  Delta replays after a transfer · "Staff hung up" status · the ping crash at bridge.ts ~1157 ·
  record the second read + per-bucket costs).
- Copy guide corrected: money reads in cents (owner reversed the dollars rule).

## HOW TO WORK WITH HIM — earned again today, harder than last time
- His words are the SPEC, not suggestions. When he corrects a card, change exactly what he named.
- One item at a time. NEVER move to the next until he says he is good. Never invent a term; the
  existing names are the language ("the record", "vague answer", "two Charlies" all cost a round).
- Answer his questions BEFORE building. He says "discuss first" and means it.
- Bring one line of when-and-what context with any past fix; he runs many chats and remembers none
  of yours. Tell him nothing he doesn't need. Full plain sentences; he hates dashes.
- Every script you run must force its own exit. A helper process lingered 56 minutes today and he
  watched it the whole time. Check ps before claiming nothing runs.
- Statuses: know the real 18 from /api/statuses before naming any. A missing status is a gap to
  fix, never a question to ask him.

## THE QUEUE (his order)
1. **Echo builds the Testing screen wiring + the engine list** (spec is in the 08-04 PM chat and
   summarized above; testing-cards.md carries every word). Robot store proves each piece.
2. **He grades the 16 tests one at a time** with an agent when the build lands.
3. **Mapper gets Charlie for mapping stores ASAP** — he is waiting on this. Transfer switch stays
   ON globally (mapper needs it); per-chain control is roadmap.
4. **The code rearrangement audit** (claude/refactor-server-routes-zbi8kp, PR #108, ~9,000 moved
   lines, NEVER audited). Route parity → registration order → which routes lost their lock. The
   owner wants the refactor finished soon and asked to be held accountable.

## OPEN FAULTS (all found by the robot store, none fixed)
- **Words after a hold, transfer, or hang-up are thrown away** — the money fault
  (docs/tasks/words-after-a-hold-are-lost.md; robot checks 246/249 prove it).
- **Same words, two answers**: identical recorded line read In stock once, couldn't tell next
  (checks 248 vs 257). The second read is inconsistent.
- **One check wrote four rows** (238-241, one conversation id) — newest-reader gets the unfinished.

## ROADMAP, HIS WORDS, NOT YET SCOPED
- Repo cleanup (untouched files piling in src/ and scripts/) WITH the refactor close-out items:
  request logging · a code index agents are forced to read · three missing Admin buttons (pause all
  calling kill switch, back up database, help-chat banner) · fold two duplicate store addresses ·
  finish or revert the rules-from-comments pass · the "Stop checking" one-store bug (Webbie has it).
- Comps and copy style guides: he reviews, then LOCK so agents cannot add without his approval.
  The comp board is behind his Admin changes — that gap is why comps went wrong today.
- An Admin section where every scenario and everything we tell Charlie sits in dropdowns for his
  review (he is working this with Copper). Charlie's instructions readable in Admin first.
- Charlie instruction tightening (Copper chat): fewer words, more accurate, nuance in his small
  replies so he never sounds the same twice.
- The reply checker: lock any agent reply until it follows the reply rules (he opened a design
  chat for it; conversation first, no building).
- Statuses catch-all screen: unplaceable situations pile up, he mints new statuses from them.
- Remap all stores for speed with the new listening way; production still navigates on timers and
  the new engine stays OFF on production until his promote.
- Admin edits write straight to the real site (roadmap since 08-02, not scoped).
- ElevenLabs blocks our own thinking on the cloned voice (their email pending); running our own
  would cut Charlie's cost hard. §7 of the Charlie record.

## WAITING ON THE OWNER
- The promote (in-stock owner email still sends on the real site; everything since 07-30 is
  staging-only). · Hide the simulated poll rows in Admin feedback (yes/no).

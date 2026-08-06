# The writer cuts a whole part of the answer, and nothing always catches it

**System:** the reply lock (`.claude/hooks/reply-lock.py`) · **Status:** open, found 08-06

## What happens
An agent writes its full answer, the writer rewrites it in the owner's voice, and the
rewrite comes back missing a whole section the owner would have wanted. It happened to
this chat's own reply on 08-06: a reply with three parts came back with two, and the part
it dropped was the second bug that was fixed in the same change.

The writer is TOLD to cut, and that is correct: rule 6 says never tell him things he did
not ask about. The problem is that nothing reliably tells the difference between cutting
a topic he did not ask about and cutting part of the answer to what he DID ask.

## Why nothing catches it
- The word scan and the fact check say nothing about a dropped section, unless the
  dropped part happened to carry a number, a file path or a quote.
- The floor added 08-06 only catches a total collapse (under 15% of the answer kept, or
  under 4 real words). A rewrite that drops one part of three sails past it.
- The meaning pass is the only real judge, and it is a model call: it can be slow, it can
  be unavailable, and when it is, the reply still goes out. The verdict line now says so
  out loud ("the meaning pass was unavailable, read it closely"), which is how this was
  spotted, but saying so is not catching it.

## Done when
1. A rewrite that drops an answer to something the owner actually asked is refused, and
   the agent is told which part went missing.
2. A rewrite that drops a topic he did NOT ask about still passes. Rule 6 is untouched.
3. Proven on real drafts, not invented ones: a draft with three parts where he asked
   about all three (must keep all three), and a draft with three parts where he asked
   about one (may keep one).
4. Whatever the fix is, it must still hold when the meaning pass is unavailable, the same
   way the collapse floor does.

## Do not
Do not close this by making the writer cut less. That reopens the rambling the owner
locked rule 6 to stop.

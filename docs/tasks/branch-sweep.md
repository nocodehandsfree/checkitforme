# Branch sweep — nothing left stranded on a claude/* branch

**What:** List every open `claude/*` branch and its PR (if any). For each, do one of two things:
merge it to staging, or propose killing it. Nothing stays stranded on a branch where the owner can't
see it. (Remote sessions are forced onto `claude/*` branches, so work lands off-staging by default —
this sweep catches it.)
**Done when:** Every open `claude/*` branch is either merged to staging or killed (owner-approved);
zero stranded work, and the list is recorded.
**Lane:** Ops
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```

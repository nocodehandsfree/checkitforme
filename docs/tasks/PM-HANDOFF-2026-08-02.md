# PM HANDOFF — 08-02 night

Owner-approved. Everything here was verified against the real branches and the live sites, not
remembered. The queue is `THE-ORDER-2026-08-02.md`; the law for Charlie is
`docs/specs/charlie-behavior/README.md`.

## YOUR FIRST JOB: what changed about Charlie

A separate chat is comparing the TWO conversation agents in the ElevenLabs account. **The owner has
that report and will hand it to you.** Read it before anything else.

  agent_2301kyk2rwgyfg8r50xk9enqwy2r  "joining mid call"  — staging uses this
  agent_7301kvvbpy3afssvaqrte3bd6cj3  the original        — production uses this

**They have drifted apart.** The joining one has FEWER rules: "wrap up" 3 against 5, "end_call" 6
against 7, "only once" 1 against 2, prompts differ by about 700 characters. On real checks the owner
saw Charlie ask the same question twice when Staff gave a vague answer, and never say goodbye — the
check just stops. Both match the missing rules exactly.

**The deeper question that report must answer:** is `src/voice/prompts.ts` really the single source
for BOTH agents, or was one hand-edited in the dashboard? If it is not the source for both, they will
drift again the moment anybody looks away, and that is the thing to fix — not the symptoms.

Nothing gets built on top of this until the owner has seen the full extent. His words: *"We could be
missing a whole bunch of things that are critical and building on top of a foundation that was
already working."*

## WHO IS WORKING RIGHT NOW
- **New Echo** — the Charlie engine tuning (`echo-build.md` PART 1 + PART 2). Do NOT interrupt him.
  He does NOT build PART 4, the Testing card, in that chat — mapper is in the same Admin file.
- **Mapper** — phase 3, the screens. Parts 1 and 2 are merged to staging.
- **Webbie** — the website, chunk 1. Building on his own branch, holding the merge, comes back to the
  owner first. He also has Admin changes coming and will ask before touching that file.
- **Logo agent** — his own branch, building the piece that makes a logo update everywhere at once.
- **The Charlie comparison chat** — read only, changes nothing.
- **Old Echo** — retiring. His last piece is boxed below; after that he is done.

## LIVE ON STAGING AND AUDITED (08-01/02)
- **The check-life work.** Nothing writes an answer or charges while the phone is still up.
- **Round 2** (the fix list from the PM audit): Charlie only opens for a real person; the two dead
  Admin settings deleted (one did nothing at all, the other switched Charlie ON to an empty line and
  billed for it); our own 5-minute cutoff no longer blamed on the store; being sent back through the
  phone menu now detected. Rig after merge: delta-clip 143 · prompts 108 · check-life 15 · behaved 39
  · bridge 13 · tsc clean.
- **The robot store** — merged, live, PM-audited. Three blockers were raised and fixed: a ceiling of
  12 checks a run, a refusal to dial unless the store really is 106362, and the money assertion made
  able to fail. `node scripts/robot-check.mjs`. **Never raise that ceiling without asking.**
- **Admin** — owner-email Off switch saves, Statuses page works, every Yes button (they all answered
  No), double-tap zoom guard, duplicate status collapsed.
- **Mapping parts 1 and 2.**

## THE BIGGEST OPEN FAULT
**Once Staff put us on hold, nothing they say afterwards is written down.** The robot store found it,
not a human. One check had Staff come back with "yeah, we've got a few" and it was filed as left on
hold; another came back with "I did not see any" and the screen said IN STOCK. Same shape on a
transfer and on a hang-up. `docs/tasks/words-after-a-hold-are-lost.md` ·
`node scripts/robot-check.mjs 5 6 8 9 10` proves the day it is fixed.

## THE QUEUE, THE OWNER'S ORDER
1. Mapping phase 3 · 2. Logo agent's build · 3. Webbie's chunks · 4. The Testing card (fresh chat,
after mapper's screens land) · 5. **The code rearrangement LAST.**

**On the rearrangement** (`claude/refactor-server-routes-zbi8kp`): it takes the main server file from
about 7,400 lines to 600 and splits the rest into `src/routes/`. **Never audited by anyone.** The
claim is "no behaviour change" — attack that: route parity first (a dropped route is a silently
broken feature), then registration order, then which routes lost or gained their lock. The owner
ruled it goes last because half-finished work everywhere plus a re-arranged tree is how a silent
breakage hides.

## WAITING ON THE OWNER
- **A promote:** the in-stock owner email still sends on the real site until he says go. The fix is
  on staging.
- Everything built since 07-30 is staging-only. The new calling engine stays OFF on the real site
  behind its switch regardless of any promote.

## ROADMAP, NOT NOW (owner, 08-02)
**Admin edits go straight to the real site.** A change made in Admin is live to customers
immediately — that is how the Statuses work reached production. The header toggle does not cover it.
Making Admin write staging first, and push when ready, is real work and touches the settings copy.
He wants it on the roadmap, not scoped yet. Related and worth raising with the code agent: the
production settings copy down onto staging **every 60 seconds whether anything changed or not** —
which is why the call tuning numbers must live in `call_tuning` and never `policy_json`.

## HOW THIS OWNER NEEDS TO BE WORKED WITH (earned the hard way)
- **ONE agent at a time.** Two agents that "cannot collide" still means he holds conditions in his
  head across two chats. Do not make him juggle.
- **Never invent.** Twice in two days the PM produced a plausible list instead of saying "this is not
  written down anywhere." Both times he caught it. Search first; if you do not know, say so.
- **Audit everything, including your own fix list.** He asked the PM to re-audit its own findings
  before handing them over and nine of eleven were already fixed. That check saved a wasted chat.
- **Never write or push anything he has not approved.** Plan, agree, then act.
- **Never start a background job he did not ask for.**
- Reply for a phone: the answer first, in his words, one screen, one question, then stop.

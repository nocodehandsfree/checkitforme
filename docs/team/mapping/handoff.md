# Check - Mapping — handoff
**What this is · who it's for:** the Mapping operator. You teach the system the fastest path to a
human at each chain, then lock it as a zero-AI recipe.

- **Lane:** `src/calls/mapper.ts`, `navigator.ts`, `trainer-batch.ts` + the Tree Trainer panel.
  ⚠️ The mapper/voice engine lives on the **prod branch**; current adjustments ship via PR #421.
- **Never touch** `chains.phoneTreeDefault` semantics (drives live-call nav) without DevOps.
- **Owner-approved adjustments** (target customer service, capture the menu tree, same-store retry,
  gate non-callable chains, open-hours only, persist everything): see PR #421 + the prod branch
  `docs/business/CHECKPOINT.md` §7.6.
- Staging never learns from mapping; owner-only test stores never feed it, in any env.

## Current work
Lives in `checkpoint.md` (same folder). Update THAT at every "Checkpoint".

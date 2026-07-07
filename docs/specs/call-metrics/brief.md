# Call metrics + tree speed — know every second and every penny of a call
**What this is · who it's for:** owner's spec (2026-07-07) for call observability + faster trees. Pops + Mapper + Addie.

## Why (owner's words, condensed)
Voice is the core product. The faster we clear a phone tree, the faster the customer gets a result. We must know, per chain: how long the tree takes, which agent model handled it, and what it cost — and never use an expensive model where a cheap one works.

## Build
1. **Wire `chains.avgTreeSeconds` into live calls** — `connectAtSec = avgTreeSeconds` through `buildRestockVars` → `placeBridgeCall`, so ABC opens at the mapped second instead of a VAD guess. (Was a GOTCHAS note; it's a task, now it lives here.)
2. **Per-chain call metrics in Admin:** avg time-to-human · avg human talk time · which lane (Delta vs Charlie barge-in) · time on each model · avg total call length (= customer wait for a status) · cost per call. Delta vs Charlie usage split is the cost story.
3. **Model routing audit:** cheap model (Kayla/consensus checks, status second-opinions) vs expensive (live conversation) — verify no expensive-model use where cheap suffices; show the routing in Admin.
4. **Tree-speed pass per chain:** CVS learned barge-in rules ("front" + "general" beat full phrases; can't barge the first menu). Mapper: capture per-chain barge-in/shortcut rules in the recipe, not just the path.
5. **Delta write-up:** the 2.5¢ Delta lane is explained only at the top of Admin → Chains. Addie: commit the explanation to `docs/finance/CHEAP_NAV_ARCHITECTURE.md` so it survives.

## Also (data accuracy — DD)
- Chain metadata must be right everywhere: score, distributor (→ products carried), hours, store-type chip, muted rules (kiosk-inside-host → call the host; no-direct-line chains muted).
- **Staging↔prod sync gap:** Admin → Chains edits do NOT sync between the two DBs (they're separate by design) — Mapper was reading stale data through no fault of his own. Need: one owner action that applies chain/mapping updates to BOTH envs (or prod = source of truth, staging pulls).

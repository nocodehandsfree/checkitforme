# HOW STORE MAPPING WORKS — the Mapper manual (read FULLY before any task)
> Every claim below is anchored to code. When this file and the code disagree, the code wins —
> tell PM, don't improvise. You NEVER edit `src/voice/` (machine-frozen) or hand-set nav on staging.

## 1. Why mapping exists (the money)
The expensive talker (ElevenLabs voice + Claude brain) must only ever meet a HUMAN. Everything
before the human — rings, menus, holds — is navigated by cheap, deterministic machinery driven by a
per-chain RECIPE that Mapper learns once and locks. Mapping is why a check costs cents. Un-mapped or
wrongly-mapped chains burn money: the talker sits through menus (the CVS incident, the BoxLunch bug).

## 2. The three team members (src/calls/navigator.ts → classifyMode)
- **Alpha** — keypad-only route: recipe presses digits (DTMF).
- **Bravo** — spoken route: recipe SPEAKS menu words via the cheap-TTS barge-in injector.
- **Charlie** — the person-to-person conversation. EVERY call ends in Charlie; Alpha/Bravo are only
  how we reach the human. "Charlie (direct)" = a person answers, no nav at all.

## 3. The recipe (src/calls/recipe.ts — the ONE converter; trainer lock + overnight batch both use it)
- Shape: `{ type, steps:[{action:'press'|'say', value, atSec}], seconds }` — `seconds` = learned
  time-to-human; `atSec` = when we actually pressed/spoke it during mapping (from connect).
- `recipeToDtmf()` → `"2@6"` keypad plan · `recipeToSay()` → `"general@4"` spoken plan ·
  `isDirect()` → no steps = direct.
- **Timing law:** fire each step at its LEARNED atSec, not a flat early time. (Big 5 lesson: a press
  learned at 6s fired at 2s got eaten by a non-buffering IVR and the agent voiced "two" out loud.)
  Early-barge fallback (first at 2s, +3s gaps) only when a step has no learned timing.

## 4. How a live call uses it (src/voice/bridge.ts — FROZEN, read-only for you)
- The keypad plan is scheduled as real carrier DTMF; the say-plan speaks words at their times.
- **Connect-on-human is deterministic:** the talker joins at the learned time-to-human
  ("recipe-timer"). No guessing by ear on mapped chains.
- **The backup ear (VAD) runs ONLY when there is NO nav plan at all** (no timer, no keypad, no
  say-plan) — and always on DIRECT dials, so a stale learned time can never leave a real human
  waiting. This is why a chain wrongly marked "rings direct" makes the agent talk to a phone tree
  (BoxLunch): the ear hears the recording and opens the talker. Fix the DATA, never the engine.
- A hold-timeout (~45s past plan) force-connects so we never strand a caller.

## 5. How mapping happens (src/calls/mapper.ts, tree-learn.ts, trainer endpoints)
- Flow per chain: **document** (plain listen — read the FULL menuPrompts; the human option is often
  LAST) → **press-test** the candidate (barge + confirm:true) → **trainer/lock** stamps the recipe +
  Alpha/Bravo/Charlie label. LOCKED = nothing left to test — stop.
- The overnight batch + single-map produce identical artifacts (same recipe.ts converter).
- Runaway guard: daily cap (`mapper_daily_cap`, default 60). Runs are logged per chain
  (`nav_runs:{chainId}`) so Admin can watch the learner's history.

## 6. The ONE rules (never re-decide these per screen or per chat)
- **Dialable:** `chainDialable()` (recipe.ts) = not muted AND has a real store line (callTarget) AND
  not a site-check chain. Every surface reads this ONE function.
- **`connectAtSecFor()` read-guard:** a stray learned time on a DIRECT chain would mute the agent on
  a live human (the silent-agent bug) — the guard strips it. Write-guard lives in chain PATCH.
- **Tree-mapper SKIPS `ringsDirect` chains** — a stale ringsDirect flag (BoxLunch) needs a FORCED
  remap through the trainer, never a hand edit.
- **No-downgrade guard:** a verify re-measure that comes back SLOWER keeps the faster locked recipe.
- **Mapped chains are untouchable:** chain PATCH + intel seed REFUSE to unflag a mapped chain from
  the call lane without force. Force needs a PM/owner box, and every flip writes its WHY on the row.
- **Map on PROD** (admin.checkitforme.com). Learned nav syncs prod→staging every 3 min — anything
  you hand-set on staging is overwritten. Independents/co-ops default DIRECT in code every boot —
  don't hand-lock them.

## 7. Traps that made past Mappers invent wrong stories
- Auto-nav 0-hammers when it can't parse a menu → FALSE "no human path". NEVER declare a chain dead
  from an auto-caller failure. Document (listen) first, always.
- "No human" across MANY stores + a plain listen capturing NOTHING = bad phone NUMBERS (DD's lane),
  not navigation. Phones come ONLY from the chain's own store locator or the Google Maps pin.
- Some IVRs drop input during the greeting (H-E-B: pressing 0 works only AFTER the greeting plays).
- Never push code or remap while a live call is running (redeploy drains it).
- A no-answer at night ≠ unmappable. Time-of-day matters; stores must be open.

## 8. Where things live
- Recipes/flags: chain rows (Admin → Chains; API `/api/chains`). Runs: `nav_runs:{chainId}`.
- Code (read-only for you): `src/calls/recipe.ts` (converter + rules), `navigator.ts` (learner +
  classify), `mapper.ts` (batch states), `tree-learn.ts`, `src/voice/bridge.ts` (live behavior).
- State + history: `docs/team/mapping/checkpoint.md` (your volatile file) · sweeps + incident detail
  in `docs/team/mapping/report-*.md` + `docs/shared/GOTCHAS.md`.

## 9. Before your first action in ANY session (comprehension gate)
Explain back to the owner/PM, in plain words, (a) why a chain marked "rings direct" that actually
has a tree makes the agent talk to the menu, and (b) when the talker joins on a mapped Bravo chain.
If you cannot, re-read this file. Wrong answers here = you WILL break real calls.

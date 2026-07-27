# THE PHONE-MENU MAP — versions, evidence, confidence, drift
> Built 2026-07-26 to the owner's spec (`03-spec-mapper.md`). Code: `src/calls/mapgraph.ts` (knowledge),
> `map-capture.ts` (one call → knowledge), `sweep.ts` (who we call, in what order), `listen-nav.ts`
> (when a step fires). `src/voice/` was NOT touched. Read `MAPPING-MANUAL.md` first — it still governs.

## 1. What changed and why
The chain row held ONE recipe and overwrote it on every re-map. So: no history, no reason for a
change, no measure of trust (47 of 98 dialable chains had no confidence at all), and a 0-hammer run
("press 0" five times — Safeway 102s, Albertsons, Walgreens, Kohl's + 12 more) was stamped `locked`
with the same authority as a real mapped route. The map now lives in versions with evidence.

## 2. The rules the code enforces
- **A route is proposed, never assumed.** First proven route on an unmapped chain activates (a working
  path beats none). Any route REPLACING a live one waits for approval. A 0-hammer route never
  activates itself.
- **The same route again = confidence, not churn.** Evidence folds into the live version; the faster
  measurement wins (the no-downgrade guard, unchanged).
- **Confidence is computed, never typed.** calls × stores × days × agreement × age.
  1 call = 45 "observed once" · 2 calls/2 stores = 80 · 3 calls/2 days/2 stores = 95 "verified" ·
  two calls that disagree = 40 "needs review" · nothing over 45 days stays "verified".
- **Nothing is deleted.** Replaced versions retire with their evidence; unknowns fold by count.
- **The chain row stays the runtime's truth.** An approved chain-level version stamps it (same columns
  as before). Store-level maps never touch the row — the runtime reads them via `activeMap()`.

## 3. Steps fire on the RECORDING, not the clock
Every mapped step now carries `afterPrompt` — which of the store's recordings it follows — learned
free from the mapping call (each `<Gather>` result IS one finished recording). Live calls wait for
that recording to end. The learned second stays as the floor and the backstop, so listening can only
ever DELAY a step, never lose it. The plan reaches the live call through `stageNavPromptPlan()` keyed
by the exact route, because the bridge's flat "word@seconds" string has nowhere to carry it and
`src/voice/` is frozen.

## 4. Drift costs nothing
Every real check re-measures the map from facts the call already produces: how many recordings
played, when each step fired, whether a step fell back to the clock, whether a human answered. No
speech recognition, no model. Drift lowers confidence immediately and files a review item with the
call attached.

## 5. The sweep (`POST /api/admin/map/sweep/start`)
East → west by the easternmost timezone a chain has stores in, so regional east chains get the 9am
slot and west-coast-only chains come later; national chains sort east and dial whichever store is
open. Inside a band: prove the "answers directly" claims first, then unmapped chains, then re-verify.
Every call still runs through the existing mapper — this only decides whose turn it is. Two passes,
so chains skipped for closed stores come round again. Hard call budget (`sweep_max_calls`, default
250) because mapping calls use Twilio speech recognition (~8.6c each). Never starts on its own.

**Proving "answers directly"**: 46 chains claim it with no call behind the claim. The sweep places one
listen-first call; a recording answering flips the chain into the mapping lane on the same pass (the
BoxLunch failure, caught before a customer pays for it).

## 6. What Admin reads
`GET /api/admin/map/graph` (one row per chain: route in plain words, seconds, confidence + label,
version, drift in 30 days, key-hammer flag) · `GET /api/admin/map/chain/:id` (versions + evidence +
observations + unknowns = the replay trail) · `GET /api/admin/map/unknowns` ·
`POST /api/admin/map/version/:id/approve|reject` · `POST /api/admin/map/unknown/:id` ·
`GET|POST /api/admin/map/sweep…`. Dashboard SCREENS belong to Admin — this side only serves the data.

## 6a. ONE set of recipes, one place (owner 07-26)
"Staging and production should be using the exact same recipes, powered from the Admin and the mapping
section — the ultimate source of truth, like the store data API."

- **Production holds the record.** Admin reads and writes it there; production calls read it there.
- **Staging is a follower.** A mapping call on staging does not keep a private copy: it POSTs what it
  learned to `/api/admin/map/ingest` on the record, and reads the result back through the existing
  learned-nav pull. Approving or rejecting a version forwards the same way (`/api/admin/map/decide`).
- Identity across databases is by chain NAME and store PHONE — the keys store-sync already uses. Ids
  are per-database and would cross-wire.
- **A failed push never loses a call:** the route is written locally, flagged `not-shared` in the
  review queue, and the chain is marked unshared so the read-back cannot overwrite it.
- `src/calls/map-authority.ts` decides which side this environment is on (production, or a linked
  follower via STORE_SYNC_URL + STORE_SYNC_TOKEN — the same pair the store-data pipe uses).

## 6b. What the first real call proved (CVS East La Palma, Anaheim, 07-25 23:10 PT)
Verify replay of the locked route: said "no" @26s, "front" @38s, "general" @48s, transferred at 62s —
**faster than the stored 67s**, route confirmed at a second store, confidence 45 → 65 automatically,
evidence and observation written for replay. Two findings:
1. **A verify replay teaches no recording plan.** It speaks on a timer, so the store's recordings are
   never transcribed and `afterPrompt` stays empty. FIXED: a chain whose map has no recording plan now
   LISTENS first (one pass, known path riding along as the recovery playbook), then replays. And a
   slower listen pass no longer loses its plan — it is grafted onto the live route (the faster seconds
   are still what we ship).
2. **Time-to-human was scored on the recording "Okay, transferring you now", not on a person.** FIXED
   in the mapping lane: a transfer announcement is now its own moment (`transferAtSec`) and the call
   keeps waiting for a real voice, so the learned seconds are when a PERSON spoke. The gap between the
   two is recorded per call as a `transfer-gap` observation — that is the money the paid agent wastes
   today, measured, for Echo to aim the runtime at.

## 6c. Reach a person, hang up, and never run a call that is going nowhere (owner 07-26)
- A mapping call no longer asks the stock question. It hangs up the moment a real voice answers, and
  keeps their greeting as the proof of WHICH desk it reached.
- ROI guards, both enforced inside the call: a hard stop per call (150s, ceiling 165s) and a bounded
  wait after a transfer announcement (40s). Past either, we hang up and record why in plain words
  instead of paying for a call nobody is coming to.

## 6d. ONE writer, so no path can put a recipe on live calls silently (07-27)
`lockRecipeToChain` now stamps the chain row AND records the map version. Every path that locks a
route goes through it: the Admin **Map** button (`/api/admin/trainer/lock`), the overnight batch, the
mapper, the sweep. The Admin button sends only `{chainId, recipe, confidence}`, so the lock finds its
own evidence — `latestNavSessionForChain()` returns the most recent call to that chain that reached a
person, giving the version its store, timing, greeting and recording plan without any Admin change.

## 6e. What the Chains page shows after a call (checked against the live Admin, 07-27)
The page reads the CHAIN ROW, which every lock stamps — so all of this fills in on its own:
status pill Unmapped → Mapped · the step ladder ("Says no" 26s, "Presses 2" 8s) from `navRecipe` ·
"To a person" from `navSeconds` — now a real voice, not the transfer announcement · cost per check
and what the menu costs (both derived from lane + seconds) · the ringing rung · the lane colour ·
"learned <date>" · and the chain list row reading "Bravo 41s".
**Not wired yet (Addie's side, the data is served):** the Menu versions row is hardcoded to "No saved
versions yet" — `/api/admin/map/chain/:id` returns the versions, evidence and history. Confidence,
the review queue and drift have no home on the page yet (`/map/graph`, `/map/unknowns`).

## 7. Fixed on the way past
`lockRecipeToChain` wrote the bare first digit ("4") into `dtmfShortcut`, but the live bridge only
understands the timed form ("2@8,2@16") and plays NOTHING without it — so every chain locked through
the mapper/batch path pressed nothing on live checks (HomeGoods, Big 5, Barnes & Noble, GameStop,
Kohl's, Staples, Burlington, Family Dollar, Academy, Marshalls…). Both writers now use `recipeToDtmf`.

## 8. Tests
`scripts/test-mapgraph.ts` (43 — confidence, hammer detection, what a call teaches, firing rules,
east-first order) · `test-map-e2e.ts` (35 — real DB: backfill → propose → confidence → approve →
drift) · `test-map-api.ts` (13 — the endpoints on a booted server). Existing `test-listen-nav.ts` (15)
and `test-bridge.ts` (13) still green.

# Logo — checkpoint (current state)

_Newest on top. Keep ≤80 lines. Finished items drop off — git keeps history._

## Now
- **Idle — no open logo batch.** Awaiting the owner's next list.
- Branch: `claude/logo-asset-lane-setup-8rx7ep` (restarted from staging after PR #7 merged).

## Last shipped — batch of 5 (07-10/11) ✅ LIVE ON PROD
habitat_restore · unique · metro_market · pak_n_save · payless_foods.
Locked by owner → merged to staging (PR #7, `c99d0ad`) → promoted to main → **verified live on
checkitforme.com, byte-match, showing in Admin**. Cache at `?v=78`.
- metro_market = a copy of the locked mariano_s mark (owner's call — sibling Roundy's brands).
- pak_n_save = vector-traced crisp from the print logo, "Pak 'n"/"$ave" stacked, brand red.
- payless_foods = owner-supplied P-with-leaf mark. unique = official Savers wordmark (® dropped).
- habitat_restore = Habitat house mark, recolored green #54B848. ⚠️ its 748 stores need chain
  name to contain "habitat restore" contiguously to resolve — "Habitat for Humanity ReStore"
  will NOT match. Flag DD if they don't show.

## Owner standing rules (in handoff.md)
- **Promote logos to prod after approval** (Admin = prod data). BUT `promote.sh` ships ALL of
  staging → main — only run it when the staging↔main gap is just logos/safe docs; if another
  lane has in-flight work parked on staging, ping the owner first. (Right now Support + Zones
  work is sitting on staging — not ours to ship.)
- Contact sheets show ONLY the chunk under review — never locked logos as comparison tiles.
- Diff repo vs R2 (`logos.fungibles.com/chain-logos/<slug>.png`) before touching any existing
  logo (walmart.png repo≠R2 today).

## Active cross-lane thread — single source + explicit binding (DD/Webbie own it)
Owner directive 07-11: ONE logo source (kill repo-file vs R2 dupe) + bind logo to the store's
CHAIN, not name-match. No new field needed — `retailers.chainId` already encodes chain vs
individual (null → store-type icon). Owner: **"we're on top of it."** My measured input for them
(offline, all 111,098 staging stores, filesystem resolver only → fuzzy is an UPPER bound since
it can't see the DB `chainId→logoUrl` path):
- 115 exact-slug · ~91,853 fuzzy-name-only · ~19,130 no logo (generic icon).
- Sizing question is DD's: of the ~92k, how many already have a real `chainId` (safe) vs only
  survive on the name-guess (would drop to generic if guess removed). Safest small fix meanwhile
  = anchor the fuzzy match so it can't hit a loose generic word ("unique","pak").

## Blockers
- None. Idle, ready for the next list.

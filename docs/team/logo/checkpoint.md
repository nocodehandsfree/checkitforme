# Logo — checkpoint (current state)

_Newest on top. Keep ≤80 lines. Finished items drop off — git keeps history._

## Now
- **Lane booted + set up.** Created this lane's docs (`handoff.md` stable, this file).
  Walked the pipeline end to end on a throwaway logo — sharp install, iTunes + Wikimedia
  sourcing, flood-fill strip, trim/normalize, and true-52px contact-sheet QA all work.
- **Waiting on the owner's list** of logos to source/restore.

## State of the assets (from STATUS.md)
- 97 chain PNGs live in `public/logos/chains/`; cache is at **`?v=73`**.
- Locked (owner-approved): chunks 1–6a, 7b, 8. 
- Not yet locked / in progress: **6b** (michaels→ollie_s), **7a** (pavilions→ralphs),
  **9** (tractor_supply→winco, 9a done), and the **New-stores** list.
- ⬜ needs owner image: Metro Market, Pak 'n Save, Payless Foods, Unique.

## Process notes (this session)
- Added to `store-logos.md` §6: fetch Commons SVGs via
  `Special:FilePath/<File.svg>` (robust; hand-guessed upload URLs 404), and the app-icon
  "colored box" caveat (Best Buy icon = white text on blue → use the vector mark, not the icon).
- Reusable `process.mjs` (flood/global strip + trim + normalize + wide-flag hint) is in the
  scratch dir. Not committed (scratch only). Rebuild from §6 if scratch is wiped.

## Blockers
- None. Ready for the owner's list.

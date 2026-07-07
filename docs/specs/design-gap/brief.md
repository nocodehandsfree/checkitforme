# Design gap analysis — ONE style guide that matches the live site
**What this is · who it's for:** the plan for making `docs/design/STYLE_GUIDE.md` the single, current source of design truth. Design lane, with owner votes.

## Why
The site shipped changes the original comp never got. Comps, style guide, and live site all disagree slightly; Admin restyle (GTM `admin-redesign`) needs one truth to build against.

## Steps (one Design chat)
1. **Extract reality:** pull the live tokens (colors, type scale, spacing, radii) and component patterns out of `public/checkit.html` as deployed on staging.
2. **Screenshot pass:** capture every page of `staging.checkitforme.com` (use the `scripts/site-health.mjs` page list) and the comp boards (`docs/design/comps/NEW_CHECK_COMPS.html`).
3. **Drift list:** for each element where comp ≠ site, one bullet — element · comp says · site does. Post in the checkpoint as bullets (no tables — owner reads on phone).
4. **Owner votes** per bullet: site wins / comp wins.
5. **Apply votes:** update `STYLE_GUIDE.md` to the voted truth. Archive the comp board to `docs/archive/` as `-SUPERSEDED` (or regenerate a fresh comp that matches the guide 1:1).
6. **Downstream:** the Admin restyle builds `app.html` against the updated STYLE_GUIDE only.

## Done when
- `STYLE_GUIDE.md` matches the live site 1:1 (spot-check 5 pages).
- All logos/brand assets live in `docs/design/brand/` and are listed in its README.
- Comps folder holds exactly ONE current board (everything else archived).

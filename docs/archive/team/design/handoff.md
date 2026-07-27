# Check - Design (CD) — handoff + rules
**What this is · who it's for:** CD's lane. CD works in **Claude Design** (canvas) with the
**"Claude design" connector** on `nocodehandsfree/checkitforme`, branch **`staging`** — the connector
reads files with `get_file_contents` and writes with `create_or_update_file` (pass the file's `sha`
when updating). You design; you never invent tokens; you never touch code — Webbie builds what you deliver.

## Boot — every new chat, in this order, BEFORE any design work
1. This file, then `docs/team/design/checkpoint.md` — current state + traps (the `?skin=v2` gate
   has burned two agents; read the traps).
2. `docs/design/STYLE_GUIDE.md` — the look. Owns every color, type size, spacing, and the
   raised/carved depth system.
3. `docs/design/copy/COPY_STYLE_GUIDE.md` — the voice. Owns EVERY customer-facing word.
4. `docs/design/brand/BRAND.md` — logo + brand colors.
5. List `docs/design/comps/` and read `comps/README.md` — know what boards already exist.

Never design from memory of the site. The guides beat the live site AND your assumptions; think a
guide is wrong? Flag it to the owner — don't freestyle.

## The laws — NOTHING is delivered without these
1. **Every visual choice comes from `STYLE_GUIDE.md` tokens.** The system doesn't cover something?
   Propose an addition and flag it — never quietly invent.
2. **Every word comes from `COPY_STYLE_GUIDE.md`.** Copy baked into old comps is stale — the copy
   guide wins any conflict. Write FINAL copy, never lorem or placeholders.
3. **Every string ships English + Spanish**, both length-checked so neither breaks the layout.
   No dashes inside sentences — write it out. Bottom notifications: ONE line, GRAY pill, never green.
4. **Extend the existing comp language, never contradict it** — and NEVER re-introduce a design the
   owner reverted (checkpoint lists them: no "Legal" link, no sticky header slab, no theme-color, etc.).
5. **The logo, so it's never confused again:** the full logo is the **wordmark "Check"** — the green
   circular checkmark **as the C** + "heck" (the site footer logo). Mark alone:
   `docs/design/brand/check-brandmark.svg`. The favicon `public/logos/check-icon.png` is the APP
   ICON — never an in-page logo. Full pack: `docs/design/brand/checkbrandpack.zip`.

## How work arrives
The owner sends screenshots of the CURRENT spot on the site he wants improved. Treat the screenshot
as "before," design the "after" on canvas per the guides, and ask about anything ambiguous before
polishing. Need live context? `staging.checkitforme.com` **with `?skin=v2`** — the default render is
the retired v1 skin.

## Deliver so Webbie can build it blind
A design is DONE only when one file lands in `docs/design/comps/` (connector write, branch
`staging`, reply with the commit link as proof) containing ALL of:
- The comp itself (HTML mock, or the canvas design rewritten as HTML).
- Exact final copy — every string, EN + ES.
- Token references: which guide colors / type / spacing / components each piece uses.
- Every state that applies: default, hover/active, empty, error, loading, and mobile.
- A short **"Build notes for Webbie"** block: what changes vs live, what stays, anything tricky.
Then update `checkpoint.md` (same folder). If a repo write fails, show the owner the EXACT error —
never hand files back for him to download as the workaround; the pipeline working is part of the job.
(Ignore any other GitHub connector in the chat; only "Claude design" can write.)

## Current work
Lives in `checkpoint.md` (same folder). Update THAT at every "Checkpoint".

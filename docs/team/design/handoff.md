# Check - Design — handoff
**What this is · who it's for:** the Design agent's lane. You design; you never invent tokens.

- **Source of truth (use ONLY these):** `docs/design/STYLE_GUIDE.md` (look), `docs/design/brand/BRAND.md`
  (logo + colors), `docs/design/copy/COPY_STYLE_GUIDE.md` (voice), the comps in `docs/design/comps/`.
- **The logo, so it's never confused again:** the full logo is the **wordmark "Check"** — the green
  circular checkmark **as the C** + "heck" (that's the footer logo on the site). The mark alone =
  `docs/design/brand/check-brandmark.svg`. The favicon `public/logos/check-icon.png` is the APP ICON —
  never use it as an in-page logo. Full pack: `docs/design/brand/checkbrandpack.zip`.
- **Deliver straight to the repo — no downloads, no owner in the middle.** This chat has the
  **"Claude design" connector** (a GitHub write server): read the guides with `get_file_contents`,
  push finished comps into `docs/design/comps/` on branch `staging` with `create_or_update_file`
  (pass the file's `sha` when updating), and reply with the commit link as proof. If a write fails,
  show the exact error — do NOT hand files back to the owner as a workaround; the connector working
  IS part of the job. (Ignore any other GitHub connector in the chat; only "Claude design" can write.)
- Verify on `staging.checkitforme.com`. If the system doesn't cover something, propose it — don't guess.

## Current work
Lives in `checkpoint.md` (same folder). Update THAT at every "Checkpoint".

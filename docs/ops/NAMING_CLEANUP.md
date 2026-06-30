# Naming Cleanup — DevOps lane only

> **Lane:** DevOps / code. **Not copy.** Nothing here is user-visible — these are code identifiers, storage keys, and class names that still say `runner`/`runnr`/`Fungibles`. User-facing wording is handled in the Copy docs (`docs/design/`), kept separate on purpose.
> **Audited:** `public/checkit.html` @ `r85`.

## 1. localStorage keys `runnr_*` → `cifm_*`  (migration already started)

`cifm_token` already exists — finish the rename, but **with a back-compat read + one-time migrate so nobody gets logged out or loses saved history.**

Keys to move: `runnr_authed` · `runnr_lang` · `runnr_history` · `runnr_ref` · `runnr_free_used` · `runnr_device` · `runnr_finds_cache` · `runnr_lead_email`

Pattern:
- **Read:** new key, fall back to old.
- **Write:** new key only.
- **Boot:** one-time copy old→new, then it's seamless.

## 2. Brand key `'runner'` (the apex/default vertical) → neutral key

`BRAND.key === 'runner'` and the apex default. Rename to `'apex'` (or `'checkitforme'`) across `brands.ts` and every `=== 'runner'` check.

## 3. CSS class `.runnerbtn` → `.driverbtn`

It's the driver hand-off button. User-facing text already says "driver / have a local grab it" — just the class name lags.

## 4. Legacy transcript parsing: `"Runnr:"`

Regex normalizes old `Runnr:` transcript lines → `Agent:`. Keep matching old data, but new transcripts shouldn't emit `Runnr:`. (Speaker-label wording — Agent vs Fungie vs Store — is a Copy decision; see the status/transcript notes.)

## 5. Comments / badges mentioning `Runner` / `Fungibles`

Low priority — tidy when you're already in the file.

---

*Explicitly NOT here (Copy's doc): the "Powered by Fungibles" result-foot text and the `brandName()` fallback string. Those are words a user reads → Copy owns them.*

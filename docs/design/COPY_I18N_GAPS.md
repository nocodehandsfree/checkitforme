# Spanish (i18n) gaps — consumer site

> **Audited:** `public/checkit.html` @ `names-r85` (branch `claude/checkitforme-website-takeover-pagiis` — current staging).
> **Method:** every string flips to ES only if it's wrapped in `t()`/`tf()`/`data-i18n` **and** has an `es` key. The `es` map is thorough (551 keys) — so the gaps are **raw English that bypasses `t()`**, not missing translations.
> **Two kinds:** 🟡 *key already exists* — just call `t()`/use the key. 🔴 *new* — wrap it + add an `es` entry.

---

## By screen

### Sign-in / Auth modal (partly English)
- 🔴 `Continue →` button — also reset to English in JS (`auth_send.textContent`)
- 🔴 `Verify →` button — also reset in JS (`auth_verify.textContent`)
- 🔴 `Check your phone` (and the email/code step headings)
- 🟡 error `Enter your 10-digit US cell number.` → key **`err.phone`** exists
- 🟡 error `Enter the 6-digit code` → key **`err.code`** exists
- 🟡 toast `Code re-sent 📲` → key **`auth.resent`** exists
- (`🇺🇸 +1` is fine — not translatable.)

### "Post your score" modal — **fully English (0 i18n)**
- 🔴 `Show the crew` (eyebrow)
- 🔴 `You scored!` (title)
- 🔴 `Snap your score and post it to the community wall.` (body)
- 🔴 labels `Your photo` · `Caption` · `Your name / handle` · `— optional`
- 🔴 placeholder `Pulled a Charizard at the Target on Sunset!`
- 🔴 placeholder `@yourhandle`
- 🔴 button `Post to the wall →` (also JS-reset)
- 🔴 button busy `Uploading…`
- 🔴 errors `Photo is too big (max 12MB)` · `Add a photo first`

### Store-request modal (placeholders only)
- 🔴 placeholder `e.g. Target — Thousand Oaks`
- 🔴 placeholder `Thousand Oaks, CA`
- 🔴 placeholder `address, which products, etc.`

### Schedule modal
- 🔴 placeholder `Enter number` (contact field)

### Report-a-kiosk modal (placeholders)
- 🔴 placeholder `e.g. Albertsons — Sunset Blvd, LA`
- 🔴 placeholder `e.g. sometimes skips the :03 drop`
- (`e.g. :03, :33` is mostly symbols — low priority.)

### Global toasts / errors (JS, hardcoded)
- 🟡 `🎉 Payment received — adding your credits…` → key **`toast.payment`** exists
- 🟡 `Map error — showing the list` → key **`toast.maploading`** exists
- 🟡 `Could not start the call` → key **`toast.callstart.fail`** exists
- 🔴 `🔒 Store is closed — no call placed`
- 🔴 search toast `📍 {place} — stores within {n} mi`
- 🔴 `Community is coming soon`
- 🔴 (master-only, low priority) `📍 Zoom out, roam anywhere, tap to drop a pin`

---

## Fix pattern (for the dev)

- **🟡 existing key:** swap the literal for the key, e.g. `toast('🎉 Payment received…')` → `toast(t('toast.payment','🎉 Payment received — adding your credits…'))`.
- **🔴 new:** wrap it — `el.textContent = t('auth.continue','Continue →')` — and add `'auth.continue':'Continuar →'` to the `es` map. **Heads-up:** JS that *re-sets* `.textContent` after load must use `t()` too, or it stomps the translated value on the first interaction (that's why Continue/Verify/Post-to-wall flash back to English).
- The **Score modal** is the biggest single win — it's 100% raw; wrap the whole block.

Spanish strings for all 🔴 items: Copy will supply on request (same as the status set).

# Admin copy — master doc

> **File:** `public/app.html` (admin, `admin-r44`). **Audience:** the operator (you), not customers.
> **Voice:** follows `docs/business/COPY_STYLE_GUIDE.md` — fewest words, no em-dashes, plain over jargon, friend tone. Admin can read a little more shorthand than the consumer site, but the rules still hold.
> **How to use:** apply the **global sweeps** first (they cover most of the file), then the **by-area** rewrites.

---

## 1. GLOBAL SWEEPS (apply everywhere)

### A. No em-dashes (`—`)
~50+ helper lines and tooltips use " — ". **Replace every ` — ` in copy with `. ` (period), `, ` (comma), or `(…)`** — whichever fits. Most are "X — Y" → "X. Y." The buttons/headers are already clean; this is mostly helper text, tooltips (`title=` / `data-tip=`), and `<option>` labels. (The only `—` to leave is in CSS/JS comments and the `[—–]` regex.)

### B. Jargon → plain (operator still shouldn't have to translate)
| Now | Use |
|---|---|
| `Phone (E.164)` / `Phone number (E.164)` | **`Phone`** (keep the `+13105551234` placeholder — it teaches the format) |
| `COGS` | **`Costs`** (or `Call costs`) |
| `MRR` | **`MRR (monthly)`** — keep the term, gloss it once |
| `IVR` | **`phone menu`** |
| `Keypad shortcut (DTMF)` | **`Keypad shortcut`** (drop "(DTMF)") |
| `phone-tree` / `tree` (as in nav) | **`phone menu`** where it's prose; the "Phone trees" screen can stay as a known operator term if you prefer |
| `ElevenLabs bills…` | fine to keep the vendor name, but say it plainly: **`We're billed for the whole call`** |

### C. Naming
| Now | Use | Why |
|---|---|---|
| `Clerk` (visible label, ~line 1687) | **`Store`** | "Clerk" is retired |
| `the clerk` (test-call toast) | **`you work there`** | see toast below |
| `the agent` (the AI caller) | **`the caller`** | plainer; "agent" is overloaded |
| `Claude` (empty states, e.g. Zones) | **`the Admin dev agent`** | that's the in-app name |
| `Runnr` / `Fungibles` | none in visible copy (only code comments) | DevOps tidy, low priority |

### D. Store-name examples — **no dashes**
Names don't use "Brand — City." Fix the examples:
- `Barnes & Noble — Brentwood` → **`Barnes & Noble Brentwood`**
- JSON example `"Target — Sunset"` → **`"Target Sunset"`**
- Any `Name — Branch` phrasing in helper → drop the dash convention.

### E. "call" vs "check"
Admin is the **operator's** view, so **"call" is correct here** (you place calls). Leave it. ("Check" is the customer's unit on the consumer site only.)

---

## 2. BY AREA — the notable rewrites (beyond the mechanical de-dash)

### Header / chrome
- Page title `Check It For Me — Admin` → **`Check It For Me · Admin`**
- Admin-dev tooltip `Admin dev — add, look up, or fix a store` → **`Admin dev. Add, look up, or fix a store.`**
- Model picker tooltip `Switch the model — Claude / GPT / Gemini` → **`Switch the brain (Claude, GPT, or Gemini)`**

### God View / Money / Bail
- Call-time helper `Time-to-human (phone-tree nav) vs. talk — ElevenLabs bills the whole connected call, so nav + hold is real cost.` → **`Time to reach a person vs. talk time. We're billed for the whole call (ring, menu, hold, talk), so reaching someone is real cost.`**
- `MASTER — enforce bail rules on live calls` → **`Master switch. Enforce bail rules on live calls.`**
- Stat fallbacks show `—` for empty values → use **`·`** or `0` (a lone em-dash reads as a glitch).
- Credit placeholder `Plan size — e.g. 100000` → **`Plan size, e.g. 100000`**

### Stores / Search / Add / Import
- Search placeholder `Search name, city, ZIP — or just pick a filter…` → **`Search name, city, ZIP, or pick a filter…`**
- Add-store name placeholder `Barnes & Noble — Brentwood` → **`Barnes & Noble Brentwood`**
- Phone label `Phone (E.164)` → **`Phone`** (keep `+13105551234` placeholder)
- Import helper `Paste store JSON — upserts by phone; region + timezone come from state…` → **`Paste store JSON. We match on phone; region and timezone come from the state.`** (JSON example: drop the store-name dash)

### Voice / Designer
- Voice-name placeholder `Voice name — e.g. Branson, Jared` → **`Voice name (e.g. Branson)`**
- Beat options: `Normal — snappy, waits for you to finish` → **`Normal (snappy, waits for you to finish)`** · `Eager — fastest replies` → **`Eager (fastest, may cut people off)`** · `Patient — long beat, waits for a clear pause` → **`Patient (long pause, slowest)`**
- Voice model: `Turbo v2 — natural` → **`Turbo v2 (natural)`** · `Flash v2 — fastest, robotic` → **`Flash v2 (fastest, robotic)`**
- Soft-open placeholder `Yeah—hi, I'm here!` → **`Yeah, hi, I'm here!`**
- Rotation helper `Voice rotation is test-only right now — live calls use the single live voice until DevOps enables it.` → **`Voice rotation is test-only right now. Live calls use the single live voice until DevOps turns it on.`**
- Talk-flow options: `Restock — did your shipment include it?` → **`Restock (did your shipment include it?)`** · `Carry — do you even sell it?` → **`Carry (do you sell it at all?)`** · `General — any of it counts` → **`General (any of it counts)`** · `Specific — only that exact set counts` → **`Specific (only that exact set)`**

### Calls / Statuses / Phone trees
- Redirect status `Reached a human — wrong desk (they redirected us)` → **`Reached a person, wrong desk (they redirected us)`**
- `Captured — call back rotates to a fresh store.` → **`Captured. Call back rotates to a fresh store.`**
- `Right desk — they answered the stock question` → **`Right desk (they answered the stock question)`**
- Caller helper `Hard cap on how long the agent talks to a person before wrap` → **`Hard cap on how long the caller talks to a person before wrapping up.`**

### Test call (bench)
- Toast `Calling you — answer like the clerk!` → **`Calling you. Answer like you work there!`**
- Toast `Call placed — answer it!` → **`Call placed. Answer it!`**

### Receipts / Kiosk
- Helper `Only kiosk receipts (Machine ID, or product + total) land here — a normal store / online receipt won't.` → **`Only kiosk receipts land here (a Machine ID, or product + total). A normal store or online receipt won't.`**
- Empty `No receipts yet — they appear here once a shopper emails one in…` → **`No receipts yet. They show up once a shopper emails one in and we can read it.`**

### Zones
- Empty `No zones yet — tell Claude an area and it can build one.` → **`No zones yet. Ask the Admin dev agent to build one.`**

### Designer / personas (scaffold)
- `Loaded — edit, then Save persona to update it` → **`Loaded. Edit, then Save to update it.`**
- `Saved — set it as the default in Calls → Settings…` → **`Saved. Set it as the default in Calls → Settings.`** (the `→` arrow is fine, not an em-dash)

---

## 3. Already good — leave alone
Buttons (`Call zone`, `Mark added`, `Import stores`, `Use for live calls`, `Pause/Resume`, etc.), section headers (`Store intel`, `Schedules`, `Statuses`, `Zones`…), and most toasts are short and on-voice. No change.

---

## Open questions for you
1. **"Phone trees" / "phone tree"** — keep as the operator term, or switch to "phone menu" everywhere? (It's internal-facing, so either works.)
2. Any status/option here that needs *new* copy (not just a tidy)? Send me the situation and I'll write it.

*Apply §1 globally, then §2 by area. Same single-source pattern as the consumer doc.*

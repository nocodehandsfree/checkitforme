# Copy — Status Messages (how the call went)

> **Owner:** Check — Copy. **The single most important customer copy in the product** — the verdict after a call.
> **Where these live:** the **Statuses registry** (DB table `statuses`), *not* the website HTML. The website (`checkit.html` / `checkit-demo.html`) just renders whatever the registry returns from `/pub/statuses`.

---

## How the status of a call is decided

The caller code (`src/voice/elevenlabs.ts`) ends every call by stamping it with **one `statusKey`**. The website looks that key up in the registry and shows its **emoji · label · note · tone/color**.

So to change what a customer reads after a call, you change the **registry row** for that key — in one of three places:

1. **Admin → Statuses** (live, no deploy) — the fastest path. Edit label/note/emoji/tone right there; it updates customers + the Test Bench instantly. **This is how you apply the copy below.**
2. **The seed** `src/db/bootstrap.ts → seedStatuses()` — only sets defaults on a *fresh* database (it's `INSERT … ON CONFLICT DO NOTHING`, so it never overwrites a live row). Update this so new environments start with the good copy. *(DevOps / `src/**`.)*
3. **i18n overrides** `st.<key>` / `stn.<key>` in the page — only for **Spanish** (and any future language). The registry row is English; the page swaps in `t('st.'+key)` / `t('stn.'+key)` when the customer's in ES.

> **Editing the website's `v.*` / `note.*` fallbacks does nothing for these** — those only fire when a call has *no* statusKey, which basically never happens now. Don't waste time there.

---

## The full status set — current → new

Apply each row in **Admin → Statuses**. Fields map 1:1 to that screen: **Emoji · Label · Note · Tone**.

| `key` | Emoji | Label (now → **new**) | Note (now → **new**) | Tone |
|---|---|---|---|---|
| `in_stock` | ✅ | In stock! → ✅ **In stock!** | They have it — go get it. → **They've got it — go grab it.** | in (green) |
| `not_in_stock` | ❌ | Not in stock → ✅ **Not in stock** | They told us they don't have it right now. → ✅ keep | out (red) |
| `sold_out` | 🕐 | Sold out → ✅ **Sold out** | They got some in, but it's already gone — sold out for now. → **They had some — it's gone for now. Worth catching the next drop.** | out (red) |
| `does_not_sell` | 🚫 | They don't carry it → ✅ keep | This store doesn't sell it at all — try a different store. → **This store doesn't sell it — try another.** | out (red) |
| `no_clear_answer` | 🤔 | "Got a 'maybe'" *(live: "Unclear")* → **Couldn't tell** | A human answered but wouldn't commit… → **Someone answered but wouldn't give a straight yes or no. Read the convo and tell us what you think.** | unk (yellow) |
| `nobody_answered` | 📵 | Nobody answered → ✅ keep | No one picked up — no charge. Try again in a bit. → ✅ keep | unk (gray) |
| `voicemail` | 📮 | Got their voicemail → ✅ keep | We reached a recording, not a person — no charge. → ✅ keep | unk (gray) |
| `busy` | 📞 | Line was busy → ✅ keep | Their line was busy — no charge. Try again shortly. → ✅ keep | unk (gray) |
| `ivr_stuck` | 🔢 | Couldn't reach a person → **Couldn't get past the menu** | We got stuck in their phone menu — no charge. → **We got stuck in their phone menu and couldn't reach anyone — no charge.** | unk (gray) |
| `language_barrier` | 🗣️ | Language barrier → **Couldn't understand each other** | We reached someone but couldn't communicate — no charge. → **We got someone, but we couldn't understand each other — no charge.** | unk (gray) |
| `bad_number` | ☎️ | Bad number → **Wrong number** | That number didn't connect — no charge. → **That number didn't connect — no charge. We'll get it fixed.** | unk (gray) |
| `closed` | 🔒 | Store closed → **Store's closed** | They're closed right now — no charge. Try again when they're open. → **They're closed right now — no charge. Try when they're open.** | unk (gray) |
| `failed` | ⚠️ | Call failed → ✅ keep *(or **Something broke** — friendlier)* | Something went wrong on our end — no charge. → ✅ keep | unk (yellow) |

### Two special cases that aren't plain registry rows

- **In stock, product named.** When the call hears the exact product, the in-stock note becomes **"They've got {product} in — go grab it."** (page-side `note.in.named`). Keep that — it's the best version of the win.
- **Restock incoming** (the 🚚 / orange "soon" verdict). This one is **computed on the page**, not a registry row: when a not-in / sold-out call also hears a shipment day, it flips to:
  > 🚚 **Restock incoming** — *Not on the shelf yet — but they said a shipment lands {day}. Be first when it drops.*

  ✅ Keep. **Note for the screenshot:** the tappable **"Restocking"** pill you saw maps to this. If you want it as a first-class, editable registry status (so it shows in the status row + Admin), that's a small add — flag DevOps to add a `restock_incoming` key. Until then it stays page-computed.

---

## Why these changes (the voice read)

- **"Unclear" → "Couldn't tell."** "Unclear" sounds like a system error code. "Couldn't tell" is what a friend would actually say — and it keeps the *"read the convo and tell us what you think"* hook that invites them to weigh in.
- **"Bad number" → "Wrong number," "Language barrier" → "Couldn't understand each other," "Couldn't reach a person" → "Couldn't get past the menu."** Same meaning, zero jargon, and they stop overlapping each other.
- **Every no-result status keeps "— no charge."** That's the promise (*"No answer = no charge"*) showing up exactly when it matters. Don't drop it from any of them.
- **"go grab it" / "next drop" / "we'll get it fixed."** Small, human, texted — not branded.

---

## Spanish (don't forget the twin)

The registry row is English. For each label/note you change, add or update the Spanish in the page's `es` i18n map under `st.<key>` (label) and `stn.<key>` (note). Examples:

| key | `st.<key>` (ES label) | `stn.<key>` (ES note) |
|---|---|---|
| `no_clear_answer` | `No supimos decir` | `Alguien contestó pero no dio un sí o no claro. Lee la conversación y dinos qué opinas.` |
| `ivr_stuck` | `No pasamos del menú` | `Nos quedamos atascados en su menú telefónico y no llegamos a nadie — sin cargo.` |
| `bad_number` | `Número equivocado` | `Ese número no conectó — sin cargo. Lo arreglaremos.` |
| `closed` | `Está cerrado` | `Están cerrados ahora — sin cargo. Intenta cuando abran.` |

(The rest already have ES entries — just match any label/note you change.)

---

## How to apply (recommended order)

1. **You / Admin:** open **Admin → Statuses** and update each row above. ~10 minutes, live immediately, no deploy. This is what changes the staging `/demo` page you screenshotted.
2. **DevOps:** update `seedStatuses()` in `src/db/bootstrap.ts` to the new copy so fresh environments match. (Won't touch live rows — safe.)
3. **Me (Copy) / Website:** add the Spanish `st.*` / `stn.*` entries to the page `es` map.

Want me to prep the DevOps seed block and the Spanish entries as ready-to-paste diffs? Say the word and I'll stage them.

---

*Status messages are the payoff of the whole product — the one screen that says whether we did the job. Worth getting every word right.*

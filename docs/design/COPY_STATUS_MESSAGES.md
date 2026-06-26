# Copy — Status Messages (how the call went)

> **Owner:** Check — Copy. The single most important customer copy in the product — the verdict after a call.
> **Live source (confirmed):** the redesigned result page is **`public/checkit.html` at `names-r83`** on branch **`claude/checkitforme-website-takeover-pagiis`** (the staging the owner screenshotted). *Not* `checkit-demo.html` (stale `r25`), *not* `main`.

---

## Where each line is edited (from the Website dev)

1. **Admin → Statuses editor** — most verdicts. Edit each status's **name + message** there; it's live on next promote. Supports **`{product}`** and **`{store}`** tokens (they fill in live, **bolded**).
2. **In code** (`checkit.html`, r83) — a few **auto-lines** the dev wires by hand: **in-stock · not-in-stock · restock · unclear**. These are computed on the page, so they're not in the Admin editor. → I've flagged exactly these below; **dev wires them.**

## Format rules (hard constraints)

- **2 lines max.** Each sentence is its own line. Keep it to **2 short sentences.**
- **First line short** so it never wraps to a 3rd line on a phone.
- Use **`{store}`** / **`{product}`** where it makes the line concrete (they render bolded).
- Keep **"— no charge"** on every outcome where we didn't get an answer. It's the promise (*"No answer = no charge"*) landing exactly when it matters.

---

## ▶ CODE auto-lines — Website dev wires these (4)

**Home decision:** `in_stock` + `not_in_stock` live in **CODE**, not Admin. Reason: `in_stock` needs the `{product}` → `{category}` fallback (a note in Admin can't do "product if named, else category"), and keeping `not_in_stock` beside it keeps the two headline verdicts consistent + version-controlled. **Don't set notes for these two in Admin** (that would override the code line).

### English
| `key` | Title | Line 1 (short) | Line 2 |
|---|---|---|---|
| `in_stock` | **In stock!** | `{store} has {product} in.`  *(no product → `{store} has {category} in.`)* | `Go grab it before it's gone.` |
| `not_in_stock` | **Not in stock** | `{store} doesn't have {category} in.` | `Want us to watch for the restock?` |
| `restock` | **Restock incoming** | `A shipment lands {day}.` | `Be first when it drops.` |
| `no_clear_answer` | **Couldn't tell** | `Someone answered but wouldn't say yes or no.` | `Read the convo and tell us what you think.` |

### Spanish
| `key` | Title | Line 1 | Line 2 |
|---|---|---|---|
| `in_stock` | **¡En stock!** | `{store} tiene {product}.`  *(no product → `{store} tiene {category}.`)* | `Ve por ello antes de que se agote.` |
| `not_in_stock` | **No está en stock** | `{store} no tiene {category} ahora.` | `¿Te avisamos cuando vuelva?` |
| `restock` | **¡Reabastecimiento en camino!** | `Llega un envío {day}.` | `Sé el primero cuando caiga.` |
| `no_clear_answer` | **No supimos decir** | `Alguien contestó pero no dijo ni sí ni no.` | `Lee la conversación y dinos qué opinas.` |

> **The headline change:** `no_clear_answer` title **"Unclear" → "Couldn't tell."** "Unclear" reads like an error code; "Couldn't tell" is what a friend says — and it keeps the *"tell us what you think"* poll hook. This is the one in the owner's screenshot.

---

## ▶ ADMIN editor — paste these (10)

| `key` | Name (title) | Message line 1 (short) | Message line 2 |
|---|---|---|---|
| `sold_out` | Sold out | `{store} is sold out of {product}.` | `Worth catching the next drop.` |
| `does_not_sell` | They don't carry it | `{store} doesn't sell {product}.` | `Try another store.` |
| `nobody_answered` | Nobody answered | `No one picked up — no charge.` | `Try again in a bit.` |
| `voicemail` | Got their voicemail | `We hit a recording, not a person.` | `No charge — try again later.` |
| `busy` | Line was busy | `Their line was busy — no charge.` | `Try again in a few.` |
| `ivr_stuck` | Couldn't get past the menu | `We got stuck in their phone menu.` | `No charge — try again.` |
| `language_barrier` | Couldn't understand each other | `We got someone on the line.` | `We couldn't understand each other — no charge.` |
| `bad_number` | Wrong number | `That number didn't connect.` | `No charge — we'll get it fixed.` |
| `closed` | Store's closed | `{store} is closed right now.` | `No charge — try when they're open.` |
| `failed` | Something broke | `Something went wrong on our end.` | `No charge — try again.` |

---

## What changed vs. live, and why

- **De-jargoned the misses:** "Bad number" → **Wrong number**, "Language barrier" → **Couldn't understand each other**, "Couldn't reach a person" → **Couldn't get past the menu** (it was overlapping "Nobody answered"). All plain, no overlap.
- **Warmer, not branded:** "go grab it," "next drop," "we'll get it fixed."
- **Every miss keeps "— no charge."**
- **Tokens do the specific work:** `{store}` and `{product}` make each line concrete without us hardcoding category names.

## Spanish

Each name/message that changes needs its `es` twin updated (Admin editor has the same fields per language, or the page `es` map for the code auto-lines). I'll supply the Spanish for any line once these EN versions are approved.

---

## Hand-off status

- **You / dev:** paste the **Admin** table into Admin → Statuses; **dev** wires the **4 code auto-lines** in `checkit.html` (r83). Then promote r83 → prod when ready.
- **Me:** Spanish twins on approval; and I'll keep this file as the source of truth for status copy.

*Status messages are the payoff of the whole product — the one screen that says whether we did the job.*

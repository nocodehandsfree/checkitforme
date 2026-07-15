# Check It For Me — Website Copy Style Guide

**Scope: consumer-facing words only** — the site (`checkit.html`), the book, emails and texts.
The **Admin dashboard has its own guide**: `COPY_STYLE_GUIDE_ADMIN.md` (different reader, different
rules). Names for the product, the AI, and the person at the store are shared across both (see
"Names" below).

## ⛔ Hard rules (owner) — these keep getting violated; non-negotiable
1. **No dashes inside sentences.** No em dashes, no hyphens as connectors. Write the whole sentence out. (CI warns on em dashes in the HTML.)
2. **One line. If it must wrap, the second line is a whole new SENTENCE, never a mid-sentence break.** Default: the whole string fits on one line at its real width on a 390pt phone. If it genuinely needs two lines, write it as two short sentences so the break lands on the period, never mid thought (no "…this / account."). No orphan words. **This holds in Spanish too** (Spanish runs longer, so it wraps first). Test at the actual component width before shipping, not in your head.
3. **Every string ships with its Spanish in the SAME commit** — and the Spanish is length-checked in the layout (Spanish runs longer; it must never break the page, the footer, or push controls off-screen).
4. **Bottom notifications: ONE line, both languages.** Shorten the copy to fit; never wrap. The *look* (color, shape, animation) is Design's call — match the notification component in `STYLE_GUIDE.md`, whatever it is today. This guide owns the words, not the pill color. (It used to say "gray, never green"; that was copy dictating design and it's retired.)
5. **No copy without this guide open. No visual change without STYLE_GUIDE.md + the comp.** (Boot-doc design-fidelity rule; this is the copy half.)

> For any agent (or human) writing words a customer reads. Write to this and you won't need a review.
> Sibling to `BRAND.md` (the logo). This one is the voice. Admin words → `COPY_STYLE_GUIDE_ADMIN.md`.

---

## The voice — one line
Write like a text from the friend who already did the annoying thing for you. Confident, funny, dead simple.

## The bar — every line passes both
1. A 10-year-old gets it in one read.
2. It sounds like a friend texted it, not a brand.

## The spine — never reword
- **Pokémon in stock? We'll check for you.**
- **No answer = no charge.**

(Notice the rhythm: short, parallel, four beats. Tune everything to that.)

---

## The rules
1. **Fewest words** that still carry the meaning.
2. **One thought per line.** Short first beat.
3. **No em-dashes (—).** A period, or nothing. (It's an AI tell, and it kills the cadence.)
4. **Color and image before words**, wherever they can carry the meaning.
5. **Friend voice.** Culture-aware slang in Spanish.
6. **Jobs-clean. A little poetry.** Rhythm and parallel beats over clever.

## Banned
leverage · seamless · empower · solutions · robust · streamline · utilize.
Jargon with no plain gloss: IVR · DTMF · E.164 · COGS · MRR.

---

## Names — get these exact
| Thing | Say | Never |
|---|---|---|
| The product | **Check It For Me** | Fungibles · Runnr · Runner |
| The customer's currency | a **check** | a "call" (see below) |
| The AI that phones stores | **Check AI** | Fungie · Fungibles |
| The person who answers at the store | **Staff** | Clerk · Store |
| Footer / credit | (nothing) | "Powered by Fungibles" |

## check vs call — the unit rule
- **check** = what the customer spends. "free check" · "1 check" · "checks left."
- **call** = the literal phone call. "we call the store" · "the call just finished."
- In doubt? The customer thinks in **checks**.

---

## Status verdicts (how the call went)
Two parts, and they are NOT interchangeable:
- **Headline** (the big verdict line, `.rtitle2`) — the **biggest text on the whole page**. Because it's this large, it carries the verdict alone in **1 to 3 words** and **must never wrap** on a phone. `In stock.` · `Not in stock.` · `Couldn't tell.` · `No answer.` · `Restock incoming.`
- **Subhead** (the smaller line under it, `.rsub`) — one or two short friend-voice sentences. Two lines max, never a third, and if it takes two lines the break lands on the period (second line = second sentence, per hard rule 2). Tokens fill live and bold: `{store}` `{product}` `{category}` `{day}`.
- **Color = meaning:** green go · red no-go · amber unclear · gray neutral. The headline itself takes the verdict's tone color.
- **A green shield = "no charge."** Don't write the words.

*Sizes/weights for the headline and subhead live in `STYLE_GUIDE.md §3` (Design's lane) — this doc owns only the words. The headline was enlarged on 2026-07-15, so keep it shorter than ever: if it could ever run to two lines, cut it.*

## Color = instruction
The eye should read the state before the brain reads the words. Lean on green / red / amber and icons so a glance tells the story. Prefer an image to a sentence.

---

## Examples
✅ `They've got it. Go grab it before it's gone.`
✅ `No one picked up. Try back later.`
✅ `Couldn't tell. Read the convo and tell us what you think.`
✅ `First check's on us.`

🚫 `Unfortunately, we were unable to determine the status — please try again.` (jargon · em-dash · cold)
🚫 `Your call could not be completed.` (it's a *check*, and it's lifeless)
🚫 `Leverage our seamless platform to unlock restock alerts.` (every banned word at once)

## Spanish
Hand-write the fixed UI lines (keeps the voice + the tokens). Machine-translate only the unpredictable stuff (the live call transcript). Same rules: no em-dash, fewest words, slang that fits the reader.

---

## Type, size, color, spacing — not this doc
Sizes/weights/color/radii are **Design's lane**, and there's already one authority: **`docs/design/STYLE_GUIDE.md` §3** (the type scale, the 10.5px eyebrow, the **16px focusable inputs** anti-zoom rule, the color-opacity scale). Conform admin **and** site to that table — don't invent a second scale here. This doc owns the **words**; that one owns the **look**.

*(The "42 different sizes" cleanup means making the admin match Design's scale — not a new set of numbers.)*

---

## The rest of the system
- The look (type, color, spacing, components): `docs/design/STYLE_GUIDE.md`
- The brand mark + colors + logo pack: `docs/design/brand/BRAND.md`
- Approved, in-flight copy edits live on the **prod branch** as `COPY_CHANGES_APPROVED.md` (Website's ship list) — not on staging.

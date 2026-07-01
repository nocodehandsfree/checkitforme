# Check It For Me — Copy Style Guide

> For any agent (or human) writing words a customer reads. Write to this and you won't need a review.
> Sibling to `BRAND.md` (the logo). This one is the voice.

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
| The AI that phones stores | **Fungie** | — |
| The person who answers at the store | **Staff** | Clerk · Store |
| Footer / credit | (nothing) | "Powered by Fungibles" |

## check vs call — the unit rule
- **check** = what the customer spends. "free check" · "1 check" · "checks left."
- **call** = the literal phone call. "we call the store" · "the call just finished."
- In doubt? The customer thinks in **checks**.

---

## Status verdicts (how the call went)
- **Title + 2 lines max.** First line short (never wraps to a 3rd).
- Each sentence on its own line.
- Tokens fill live and bold: `{store}` `{product}` `{category}` `{day}`.
- **Color = meaning:** green go · red no-go · amber unclear · gray neutral.
- **A green shield = "no charge."** Don't write the words.

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

## Type scale — the ONLY sizes allowed
One font (**Inter**). Five roles. Nothing off this list. If a size isn't here, it's a bug. This is the fix for "42 different sizes."

| Role | Size | Weight | Style | Used for |
|---|---|---|---|---|
| **Header** | 26px | 800 | — | Page title (one per screen) |
| **Data** | 22px | 800 | — | The big glance numbers (stat tiles) |
| **Subhead** | 15px | 700 | — | Card titles, section headers |
| **Body** | 13px | 500 | — | Normal text, values, buttons |
| **Caption** | 11px | 600 | UPPERCASE, muted | Labels under stats, helper, eyebrows |

**Weight & emphasis rules**
- **Weights: only 500 (body), 700 (subhead/label), 800 (header/data).** No 400, no 900, no in-betweens.
- **Emphasis = color or weight, never a bigger size.** Go green/amber/red or bump to 700 — don't grow the text.
- **Italic = one job only:** directional hint text inside an input (the little "(optional)" / example line). Nowhere else.
- **Never bold + italic together.**
- Spacing rides a scale too: **4 / 8 / 12 / 16 / 24px.** No 3px, 6px, 13px one-offs.

**Applies to admin *and* site.** The admin drifted worst (42 sizes), but the site has strays too — both conform to this table.

---

## Go deeper
- Everything to ship (consumer site): `docs/design/COPY_CHANGES_APPROVED.md`
- Admin app copy: `docs/design/COPY_ADMIN_MASTER.md`
- Brand mark: `docs/brand/CHECK_BRAND_STYLE_GUIDE.md`

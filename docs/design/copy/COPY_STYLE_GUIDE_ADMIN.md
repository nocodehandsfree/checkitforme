# Check — Admin Copy Style Guide

**Scope: the operator dashboard only** (`admin.checkitforme.com`, source `public/app.html`). This is
the internal control panel the owner and operators run the business from. Consumer words live in the
sibling `COPY_STYLE_GUIDE.md` (the website guide) and follow different rules.

> **For Claude Design (and any agent writing admin labels):** read this before you put words in an
> admin comp. Admin copy is not the friendly consumer voice. Write labels the way a sharp operator
> would, so the comp reads like the real tool. When in doubt, match how the live admin already talks.

---

## Who reads this and how they read it
The reader is the **owner or an operator** who runs calls, curates stores, tunes the voice agent, and
watches the money. They know the system. They want **speed, precision, and density**, not hand
holding. English only. Every screen is live production data, so labels must be exact.

## The voice, one line
**Clear, terse, operator grade.** A good dashboard label is a precise noun or a plain verb, not a
sentence and not a joke. Precision beats charm.

## Website rules that DO carry over
- **Correct names** (shared with the consumer guide): the product is **Check**, the AI is **Check
  AI**, the person who answers at a store is **Staff** (never "clerk"). Use the glossary terms below
  consistently, one word per concept.
- **No wrapped headings, labels, or buttons.** Shorten, don't wrap.
- **One concept, one word.** A "status" is always a status, a "workflow" always a workflow. Never
  invent a second name for a thing that already has one.
- **Say what a control does.** Every control gets a one line plain tooltip (`data-tip`).

## Website rules that DO NOT apply here
- **No Spanish.** Admin is English only. There is no ES parity requirement.
- **No "a 10 year old gets it" / friend voice.** Admins are experts. Terse and technical is correct.
- **Not "fewest words to a fault."** Precision wins. "Connect on human answer" beats a cute short
  label if the short one is ambiguous.
- **Not "color and image before words."** The admin is data first. Numbers, tables, and exact labels
  carry the meaning.
- **The consumer spine lines** ("No answer = no charge", etc.) are marketing. Don't put them in admin
  chrome.
- **The consumer notification rule** does not bind here. Admin toasts have their own look in
  `STYLE_GUIDE.md`.
- **Dashes and ranges are fine** in dense UI (`1–5`, `Mon–Fri`, `Alpha · Bravo · Charlie`). The
  no-dash rule is a consumer voice rule, not an admin one.

## Admin-specific rules
1. **Every control ships a one line tooltip** in plain English that says what it does and what it
   changes. Example, the *Connect on human* toggle: "don't start paying for the agent until a real
   person picks up." The label can be jargon; the tooltip must not be.
2. **Use the real operator vocabulary, and gloss it once.** Terms like tier, workflow, lane, nav,
   recipe, mute, comp are the operator's real language. Use them in labels; explain them once in the
   tooltip or a section intro. Don't dumb them down, don't leave them unexplained.
3. **Numbers are exact and consistent.** Money in cents rounds to `$X.XX`. Durations in `s` / `m`.
   Percentages to one decimal. Pick a unit and keep it across the screen.
4. **Destructive or money-spending actions say so, in the copy.** "Places a REAL call ($)", "Publish
   to Stripe", "Mute (hides from customers everywhere)". The label carries the consequence; the
   confirm dialog restates it.
5. **Empty states tell the operator what to do next**, not just "nothing here." ("No calls yet. Run
   one from Search or Chains.")
6. **Owner-live warnings are copy, not just behavior.** If a save is instantly live for customers,
   the screen should say it near the control.

## Admin glossary (use these exact words in comps and labels)
| Word | Means |
|---|---|
| **check** | one verified stock phone call; the customer's currency |
| **call** | the literal phone call placed to a store |
| **Check AI** | the voice agent that makes the call |
| **Staff** | the person who answers at the store (never "clerk") |
| **status** | an owner-editable verdict (icon + label + color + tone + customer note) |
| **tone** | which bucket a status means: in · out · unclear · restock-soon |
| **workflow** | opener set + voice(s) + tuning + persona + lane; resolves store → chain → default → global |
| **persona** | a named agent personality composed into the call prompt |
| **opener** | the agent's first line, `{category}` templated, rotated |
| **lane** | how a call is handled: **Alpha** keypad nav · **Bravo** voice-menu nav · **Charlie** live agent · **Delta** recorded clips |
| **nav / recipe / locked** | the learned fastest route to a human for a chain |
| **tier** | a store's 1–5 reliability rating (5 Best Chance … 1 hidden) |
| **muted** | a chain hidden from customers everywhere |
| **comp** | a free account that is never charged and bypasses gates |
| **Fun / MVP store** | owner-only test stores; the phone field is the on/off switch |

## The look is Design's
Type, size, color, spacing, the toast style, and the component set live in `STYLE_GUIDE.md`. This
doc owns **words**. When Claude Design ships the new admin comp, it should also update the admin-facing
parts of `STYLE_GUIDE.md` (including the admin toast look) so the guide and the comp match.

---
_Owned by Copy (Copper). Sibling: `COPY_STYLE_GUIDE.md` (consumer). Look: `../STYLE_GUIDE.md`._

# The Translate button shows up because Staff has an accent in their name

**System:** site · **Status:** open, owner-found 2026-08-19 on staging (check result "Restock
incoming", Staff line "Larry Vásquez. How can I help you?"). NOT fixed, noted on his order while he
kept testing.

## What he saw
A check where every word Staff said was English, and the result page still offered **Translate**.
The only non-English thing on the whole page was the á in the name Vásquez.

## His ruling (his words, 08-19)
> "it doesn't matter what the person's name is if the conversations in English that button does not
> show up"

## Where it is
`looksForeign(t)` in `public/checkit.html` (~:6989). Line 2 of it is the fault:

```js
if(/[ñ¿¡áíóúü]/.test(s)) return true;   // ANY one accented letter = "this call was in Spanish"
```

A single accented letter wins outright, so one Spanish surname spoken in a fully English call flips
the page. The word test underneath it (`hits>=2` over hola/gracias/tienda/...) is the sound part and
already needs two real Spanish words.

`showResult` reads it as `foreign` (~:6768) and `canTranslate` (~:6772) puts the button on the
result page; the live conversation header uses the same answer.

## Done when
- A check whose conversation is English shows NO Translate button, whatever the names in it are.
- A real Spanish check still shows it, and the Spanish site still offers English calls translated.
- The proof is both: replay one English check with an accented name and one real Spanish check.

**Shape of the fix (not built, not approved):** keep the word test as the decider; let `¿ ¡ ñ` stay
outright proof (English never uses them, and a name does not carry them), and make the plain accents
`á é í ó ú ü` count only in numbers, e.g. three or more accented words, so one name cannot decide.

**Verify-live output (paste on close):**
```
(none yet)
```

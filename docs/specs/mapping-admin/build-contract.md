# Mapping · the build contract (owner approved 07-30, comps 3a + 3b blessed)

The owner approved comps 3a and 3b in `ADMIN_COMPS.dc.html` plus three final notes (all folded into
the comps). This file is the WHOLE contract: build exactly this, nothing else, no invented words or
elements. Copy voice: a control panel names things and shows state — no "the" in stage names, never
caps lock, icons lucide only. Every string ships its length-checked Spanish in the same commit.

## The engine — three stages, every check graded

The goal is never a department. It is an ANSWER about the product. Department names mean nothing
across chains; a real yes or no from Staff is the only proof of the right door.

**Grading (mechanical, zero human):** every check is graded the moment it ends. Pass = expected menu
heard, our words said, handoff announced, ring heard (or Staff answered and replied). Fail = anything
else, with ONE reason from the fixed list: `not faster` · `wrong department` · `barge didn't work` ·
`said wrong words` · `menu repeated itself` · `menu hung up on us` · `sent to beginning of menu`.
A failed check changes NOTHING — not the menu, not the recipe, not nav time. It is kept, collapsed.

**Fingerprint:** a menu is identified by its opening line. A greeting matching nothing known = a new
condition, filed automatically, quarantined from the main map. Heard twice = real, and only then does
its pill appear on the Menu screen. Night/Spanish/changed menus are all this one mechanism.

1. **Mapping menu** — one store. Listen to everything, answer each question with the FULL phrase when
   it is asked, reach a person, ask about Pokémon. One check proves the wording, a baseline time, and
   the door. Wrong desk → door marked dead, next check takes the next-best door. Staff asked once per
   door, never more. Repeat until wording is settled (same lines heard twice in a row).
2. **Optimizing speed** — SAME store (menu stability), inside its open hours. Hang up on the second
   ring, every check — no Staff, ever. ONE change per check: the short word, or answering earlier IN
   THE MENU'S OWN WORDS **(07-31: NO TIMER, EVER — see Update 4)**. A win becomes the recipe; a loss
   is failed `not faster` and that exact move is blacklisted (bargeSafe already exists — front can
   never be barged at CVS, general can). Nothing new wins = the floor.
3. ~~Proving department — three stores agree = chain locked~~ **(replaced 07-31 — see Updates 2 and 3:
   ONE successful map locks the chain; a new store only when the current store never got us to a
   person.)** A store whose greeting does not fingerprint-match still gets its own branch (store
   exception, exists). Wrong desk during the map → door marked dead, next door, SAME store.

Known facts that must survive: barge rules per step (`bargeSafe`) · re-prompt = repeat the SAME answer
· an offer to connect mid-route is not the handoff (`routeUnfinished`) · a barge tail joins its line
(`TAIL_SEC`/`TAIL_WORDS`) · ring-ended checks write `seconds: null`, never a ring moment.

## The screens (comps 3a + 3b are the truth; 2f note applies)

- **Chain page top, once locked:** the ladder shows ONLY the recipe steps — no menu copy per step —
  each step with the seconds from the LAST successful check. Nav time, Nav cost, Reached staff stay
  AVERAGES. Date reads `Locked` + date and moves only when the recipe changes.
- **Mapped checks (3a):** newest on top; ~~top check's pill = `Recipe winner`~~ **(replaced 07-31 —
  see Update 5: no check says "Recipe winner"; the winner lives in the recipe box and Menu)**. Stage header per card:
  `Mapping menu` / `Optimizing speed` / `Proving department`. Faster/slower vs the check right before,
  said ONCE. No PRODUCED line. Fails collapse to one row, red pill = the reason itself. Last rung of
  an open card says only the colored status words: `Reached staff` (green) or `Admin hung up`
  (yellow) — nothing after them. Pill words come from Statuses + the reason list; an unrecognized
  state renders as a collapsed red row, never a guess.
- **Menu (3b):** the map of doors — each question with its choice pills: taken word in its model's
  color, dead door struck through red, proven door green with a check. Lucide play per line (that
  slice of the saved call audio) and lucide pencil (correction kept, never overwritten). Wording =
  the final locked run, re-listened ONCE with a better transcriber at lock time. NEVER stitched from
  several checks. Foot: `<store> · map recipe locked <date>`. Condition pills only after two hearings.

## DELETE list (removing these IS the build; a gate greps they stay gone)
- `agreedMenu` / `agreedWords` (position-stitched menu voting) — replaced by the single locked run.
- The listen-first block (`s.listenFirst` path) — stage one replaces it.
- The greeting shown on the Recipes card — Menu owns it.
- Any `Set aside` string · any status words not in Statuses + the reason list.
- The mapper's old phase names (`verify`/`listen`/`baseline`/`optimize`) anywhere the owner sees them.

## Updates (07-31, owner approved — a line is ADDED here with its date, never rewritten)

1. Always learn the menu first. Every store we map starts with one full check:
   listen to the whole menu, answer with the full words, reach a person,
   ask about Pokémon. Never skip this, even if we already hold a recipe.

2. One successful map locks it. Reached a person, asked about Pokémon,
   got an answer - proven, locked, done.
   (This replaces the old "three stores must agree" rule.)
   Once we got through to a person, we never need to reach one there again.

3. The only reason to try a new store: the current store never got us
   to a person.

4. Speed comes after the lock, same store, always hanging up before a person.
   NO answer ever fires on a timer - the clock is dead everywhere.
   Fast = answering the moment the menu's own words tell us the question,
   cutting in only where that menu allows it. A menu that won't be cut off
   ("sorry I'm not understanding") is remembered, and we let that question
   finish. That is why the fast way works at every store.

5. When a faster way wins, two things update: the recipe box at the top
   of the page, and the words under Menu. Checks just say their gain,
   like "6s faster".

6. Menu is where I listen and fix words: a play button per line, tap the
   words to edit, the pencil turns into a save button. Menu only.

7. Delete the old mapping box ("Needs your eyes"). Everything lives in:
   the recipe at the top, Mapped checks, and Menu. A run never needs me.

8. A check's story shows every word we said. "sorry I'm not understanding"
   can never appear without the word we said that caused it.

9. "Locked" shows the date the map succeeded. No lock, no date.

10. Nav time ends the instant the desk rings. What happens after
    (Staff picking up, talking) never counts against nav time.

11. The menu's words are sacred. The recipe and Menu can only show what
    the menu actually said. A misheard line gets fixed, never shown wrong.

12. Proof of the right department is Staff answering about Pokémon.
    A yes or a no both count - they acknowledged they have the information.

13. Speed is only compared against the same menu - never against
    a night or Spanish menu.

14. If a store's greeting doesn't match the menu we know, the system
    remaps that store from the start automatically, like a brand new store.

15. Statuses come only from the Statuses list. "Admin hung up" when we
    ended it. Never two statuses that contradict each other, and never
    "nobody answered" when somebody answered.

16. Color law: green only when we reached a person AND confirmed the right
    department. Yellow is neutral. Red is bad.

17. Chains list: model names in plain text, no colored letters. When work
    waits, a red alert icon sits next to the chain name - the words
    "needs review" never appear anywhere.

18. The night menu is a condition, like Spanish. If the menu changes
    mid-mapping (day to night), we run through the new menu as if it's new.
    The system uses the store's open and close times (the pharmacy closes
    before the store does) to assess: "the pharmacy closed - the menu's
    words changed, nothing else." Same store, same way through - only
    what's said changes, and that's what threw us off in the past.

## After the owner says the live page is the record of truth
Delete comps 3a/3b from the board and lock the mapping surfaces (edit-gate) so no agent can change
them without an owner-named task. Not before he says so.

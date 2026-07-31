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
   ring, every check — no Staff, ever. ONE change per check: the short word, or firing earlier. A win
   becomes the recipe; a loss is failed `not faster` and that exact move is blacklisted (bargeSafe
   already exists — front can never be barged at CVS, general can). Nothing new wins = the floor.
3. **Proving department** — the finished recipe at DIFFERENT stores, one ask per store, never the same
   store twice. A real yes/no = locked, dated. Wrong department → recipe keeps its speed, the door
   re-opens, prove again elsewhere. Nobody picks up → next store. Three stores agree = chain locked.
   A store whose greeting does not fingerprint-match gets its own branch (store exception, exists).

Known facts that must survive: barge rules per step (`bargeSafe`) · re-prompt = repeat the SAME answer
· an offer to connect mid-route is not the handoff (`routeUnfinished`) · a barge tail joins its line
(`TAIL_SEC`/`TAIL_WORDS`) · ring-ended checks write `seconds: null`, never a ring moment.

## The screens (comps 3a + 3b are the truth; 2f note applies)

- **Chain page top, once locked:** the ladder shows ONLY the recipe steps — no menu copy per step —
  each step with the seconds from the LAST successful check. Nav time, Nav cost, Reached staff stay
  AVERAGES. Date reads `Locked` + date and moves only when the recipe changes.
- **Mapped checks (3a):** newest on top; top check's pill = `Recipe winner`. Stage header per card:
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

## After the owner says the live page is the record of truth
Delete comps 3a/3b from the board and lock the mapping surfaces (edit-gate) so no agent can change
them without an owner-named task. Not before he says so.

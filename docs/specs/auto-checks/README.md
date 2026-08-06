# Auto-checks — the comps and where they stand (handoff 2026-08-06)

The build contract is `docs/tasks/site-auto-checks.md`. This folder holds the pictures and the
scripts that made them. **The consumer site is frozen: that task file IS the unlock authority.**

## Where the comps stand with the owner

| Picture | State |
|---|---|
| `comp-3-the-list-APPROVED.png` | **APPROVED** (owner 08-05). "The main page that you come to if you have checks already set up." |
| `comp-1-my-checks-row.png` | not approved. The real My checks screen with ONE row added: Auto-checks. |
| `comp-2-saved.png` | **RULED 08-06: BUILD IT.** "don't close the window build the screen that shows that their auto check has been saved and they should have a button there that allows them to jump directly into the auto check homepage where they can see their first check." So: the sheet stays open and flips to this screen, and its button goes straight to the list. **The picture to build from is `comp-2-saved-v2.png`** (`render-saved-v2.mjs`), drawn where it really happens with the CHECK STATUS PAGE behind it; the first one was over the search screen, which is not on this path. Words still open: the title reads "Auto-check is on." and the owner's own word was "saved". |
| `comp-4-report-v1-rejected.png` | **REJECTED** (owner 08-05): "I also don't think this comp looks very good and you could do a better job with a visualization." |
| `comp-4-report-v2.png` | not approved, and the owner has already named what is wrong with it. |

## THE OWNER'S RULING ON THE PICTURE (08-06, his words, do not lose this)

> "I don't understand the circle that you did it's almost assuming that there are 12 checks and three
> have been done and so when we finish all 12 the circle is complete but checks can just go on forever
> so I don't know if you're thinking about how to display the data in the right way"

A ring reads as progress toward a finish line. An auto-check has no finish line, it runs forever, so a
ring filled 3 of 12 is the wrong shape for this data. **The whole set of comps still needs sharpening,
and none of them except the list is approved.** Do not build from these as if they were signed off.

## How the pictures were made (so the next agent can remake them)

Each script drives LIVE staging in Chromium through a curl relay (Chromium cannot reach staging
directly: TLS is blocked, see the site checkpoint), opens the REAL slide-up, and swaps only its
contents. Nothing here is drawn from scratch, which is the point: the sheet, the grab handle, the
icon, the title, the row shape, the switch and the delete button are all the page's own.

```
node docs/specs/auto-checks/render-my-checks-row.mjs
node docs/specs/auto-checks/render-list-saved-report-v1.mjs
node docs/specs/auto-checks/render-report-v2.mjs
```

They write their screenshots to a scratch path near the top of each file. Change that path first.

`docs/design/comps/inbox/AUTO_CHECK_COMPS.dc.html` was the FIRST attempt, hand drawn, and the owner
rejected it on 08-05: "what you're showing me is not an accurate representation of any part of our
system". It was deleted so nobody builds from it. These screenshots replaced it.

## THE PATH, both ways in (owner asked 08-06; `render-the-path.mjs` makes these)

Screens 1 to 3 are the LIVE staging page, driven and photographed, not comps.

**From a check status page** — `path-a1-status-box-closed.png` the box at the bottom, "Don't miss the
restock" · `path-a2-status-box-open.png` opened: "Tell me when it's back" and "Auto-check on shipment
days" · `path-a3-set-it-up.png` the real Auto-check sheet (days, earliest call time, email, TURN ON
AUTO-CHECK) · then `comp-2-saved.png` (not ruled on) · then the list · then the report.
**NOTE, and it is a decision:** the box exists ONLY when the answer was not in stock
(`canNotify = cls!=='in'`, checkit.html 6741). Somebody who hears "In stock" is never offered an
auto-check on that screen.

**From My checks** — `path-b1-my-checks.png` is that screen TODAY, with no auto-checks row on it.
`comp-1-my-checks-row.png` is the same screen with the row added. Then the list, the report, a check.

**SETTLED 08-06:** tapping the row on the approved list opens that store's report. The owner's words:
"if you select any of those you'll be able to go into the details of that". The switch and the delete
button stay taps of their own.

## THE REPORT, take three (owner 08-06 killed the ring)

`comp-4-report-v3-week.png` + `comp-5-report-v3-open.png`, made by `render-report-v3.mjs`. A week of
days like the Activity tab, tap a day, that day's checks list underneath, tap one and it unfolds into
the real check status page with the conversation, the way a store unfolds in a zone report. Built from
the page's own pieces (the Activity bar + row, `deriveVerdict`, `combinedTimelineHTML`); no new strings,
so nothing new needs Spanish. `comp-4-report-v2.png` is dead.

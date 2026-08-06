# Auto-checks — the comps and where they stand (handoff 2026-08-06)

The build contract is `docs/tasks/site-auto-checks.md`. This folder holds the pictures and the
scripts that made them. **The consumer site is frozen: that task file IS the unlock authority.**

## Where the comps stand with the owner

| Picture | State |
|---|---|
| `comp-3-the-list-APPROVED.png` | **APPROVED** (owner 08-05). "The main page that you come to if you have checks already set up." |
| `comp-1-my-checks-row.png` | not approved. The real My checks screen with ONE row added: Auto-checks. |
| `comp-2-saved.png` | **RULED 08-06: BUILD IT.** "don't close the window build the screen that shows that their auto check has been saved and they should have a button there that allows them to jump directly into the auto check homepage where they can see their first check." So: the sheet stays open and flips to this screen, and its button goes straight to the list. |
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

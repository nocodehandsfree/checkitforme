# COMP-EXTRACT.md — how cycles read the comps (saves re-deriving each firing)

The board markup is PLAIN inline-styled HTML inside `docs/style-guide/NEW_CHECK_COMPS.dc.html`
(the .html twin is the JS-bundled viewer — ignore it for extraction). Python: find a screen's
caption text, print the following chunk. Screen captions are `<div>` text like `P3 Hobby · pick
your set`. Legend (all codes) sits at offset ~82k; real frames are `width:390px` divs.

Byte offsets of 390px frames (this file revision): 84723, 95985, 98156, 108093, 121435, 130580, 134376, 138633, 143022, 265366, 548966, 635362, 647435, 666222, 673610, 684641, 689419, 693079, 695805, 701747, 706309, 948333, 957425, 965712, 1019931, 1083403, 1140090, 1195331, 1204487, 1221049, 1229685, 1287449

Known caption anchors: 'One carved track' (S2) · 'P3 Hobby · pick your set' · 'P4 Hobby · pick the
product' · 'R1 Restock panel' · 'SC1 Scores' · 'SC2 Scores · feed' · 'RN2 Runnr' · '6c Checkout'.
Wash-page frames use different bg values — search their captions ('P6', 'L1a', etc) directly.

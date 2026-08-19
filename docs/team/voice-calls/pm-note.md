# PM NOTE — owner rulings waiting for the next build chat (PM, 2026-08-19 ~03:00Z)

## OWNER RULED (03:00Z, his exact words): Charlie's package question becomes
## "and is it a pack or a box?" — tin is removed and the sentence shortened.
- The question wording lives in THREE doors; per Law 11 change them as ONE family, one commit:
  1. `src/voice/prompts.ts:56` — both variants: the ask-only-package line
     ("oh nice, is that packs or a box or a tin?") and the ask-both line
     ("...and is it packs or a box or a tin?"). New wording per his ruling: the ask-both line ends
     "and is it a pack or a box?"; shorten the ask-only-package line to match ("is it a pack or a
     box?").
  2. `src/voice/bridge.ts:1733` — the reconnect list names "whether it is packs, a box or a tin";
     drop the tin there too.
  3. `src/calls/tapedeck.ts:126` — the robot store's own scripted answers reference the old
     wording; keep the scripts answering naturally so tests still run whole.
- Do NOT remove tin from what the READER understands: `src/voice/verdict.ts` productForm keeps
  "tin" (Staff still say it unprompted, and the "10"/"ten" mishearing rule stays). Only the
  QUESTION shortens.
- Prove per ship-it (tsc, the touched tests, one real robot dial showing the new sentence on the
  record), never push while a check is in the air.

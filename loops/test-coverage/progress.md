# Test-coverage loop — progress (append-only)

State on disk (loops.md rule IV). Each iteration appends one line. A fresh run reads this first.

## Done
- ✓ `recipe.ts` — recipeToDtmf / recipeToVoice / isDirect / recipeAnswerPath (11 cases). *(seed iteration, by hand — proves the loop works)*

## 🐛 Findings (real bugs the tests surfaced — logged, NOT fixed here)
- (none yet)

## ⛔ Stops
- (none)

## Next
Per `contract.md` Targets, top of list first → `service.ts` `resolveWorkflow` / `composePersona`.

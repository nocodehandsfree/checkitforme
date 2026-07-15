// Round-robin rotation shared by BOTH call lanes — Charlie (service.ts) and Delta (tapedeck.ts) —
// so a workflow's openers, voices and Delta line variants advance one per call no matter which lane
// places it, and the Workflows page "Reset rotation" button resets everything at once.
// Keys: "opener:<workflow>" · "voice:<workflow>" · "fu:<workflow>:<slot>". In-memory; resets on restart.
const rotCounters = new Map<string, number>();
export function rotatePick<T>(key: string, list: T[]): T | undefined {
  if (!list.length) return undefined;
  const n = (rotCounters.get(key) ?? -1) + 1; rotCounters.set(key, n);
  return list[n % list.length];
}
/** Reset a rotation so the NEXT pick lands on the first item (opener #1) — powers the Workflows
 *  "Reset rotation" button, so a test run is predictable A → B → C instead of mid-cycle. */
export function resetRotation(key: string): void { rotCounters.set(key, -1); }

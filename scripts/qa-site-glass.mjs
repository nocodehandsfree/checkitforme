// qa-site-glass — HARDENS the WEBSITE sheet-glass recipe in public/checkit.html (variant H, design
// checkpoint 2026-07-17, owner-verified on device across an all-day on-phone hunt). This is a LOCK: if a
// future edit reverts any invariant, the ship FAILS before it can reach the site. Notes in the code were
// NOT enough — the recipe was reverted once anyway (cost a full day). This gate is the thing that holds it.
//
// ── HOW TO BUILD A NEW SLIDE-UP SO IT JUST WORKS (read this before adding one) ──
// Every slide-up on the site is a `<div class="overlay" id="...">` with a `.modal` inside, opened by
// adding the `on` class. That's IT. A body-level MutationObserver watches for `.overlay.on` and runs the
// ONE shared placement path (sheetH_on) automatically — you do NOT wire anything up, and there is NO
// "which sheets get the fix" list to add yourself to (that list WAS the bug — new sheets got forgotten).
// Build the new sheet like the others (overlay > modal, toggle `on`) and it inherits the glass for free.
// The only two non-overlay sheets (the call sheet #csheet, the messenger #supWrap) have their own twins of
// this path (csheetH_on / supH_on) — match them if you add another lone sheet.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../public/checkit.html"), "utf8");
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m) => { fail++; console.log(`  ✗ ${m}`); };
const has = (re, m) => (re.test(html) ? ok(m) : no(m));
const absent = (re, m) => (re.test(html) ? no(m) : ok(m));

// 1. Dim is a CONTENT filter on the page, never a full-screen cover layer (a cover kills the iOS glass).
has(/body\.sheetopen[^{]*\{[^}]*filter:\s*brightness/i,
  "dim is a body.sheetopen content filter (never a cover overlay)");
// 2. Short pages get a min-height guard so the under-bar overshoot is never clipped.
has(/body\.sheetopen\s*\{\s*min-height/,
  "body.sheetopen min-height guards short-page clipping");
// 3. On open the sheet overlay becomes ABSOLUTE page-layer content (what lets the iOS glass ghost it).
has(/ov\.style\.position\s*=\s*['"]absolute['"]/,
  "sheetH_on switches the overlay to position:absolute");
// 4. The current scroll offset is captured for the anchor (sheet lands at document-y, not viewport-y).
has(/window\.scrollY/,
  "scroll offset captured for the anchor");
// 5. The sheet box overshoots ~120px under the bar so its surface/rows are what the glass ghosts.
has(/const\s+TAIL\s*=\s*120/,
  "sheet box overshoots ~120px under the bar (TAIL)");
// 6. Background scroll is locked while a sheet is open.
has(/documentElement\.style\.overflow\s*=\s*['"]hidden['"]/,
  "background scroll locked (html+body overflow hidden)");
// 7. A scroll nudge re-snapshots the iOS bar ghost so it shows the sheet, not the stale pre-open page.
has(/function\s+sheetGlassNudge/,
  "sheetGlassNudge re-snapshots the bar ghost (kills 'previous page behind')");
// 8. Close restores layout + unlocks scroll — no stuck locked page (the freeze).
has(/function\s+sheetBodyMaybeUnlock/,
  "close unlocks scroll only when no visible sheet remains (sheetBodyMaybeUnlock)");
// 9. An open sheet whose modal is REPLACED wholesale (delete/rename confirm) is re-placed, not orphaned.
has(/mu\.type\s*===\s*['"]childList['"]/,
  "sheet observer re-places on modal swap (fixes the delete-zone freeze)");
// 10. The flex sheets (zones/hist) get a scroll-end spacer so the last row stays reachable under the bar.
has(/body\.sheetopen\s+#zones\s+\.zf-scroll::after/,
  "zones/hist scroll-end spacer keeps the last row reachable");
// 11. NO hand-kept allowlist gate: every overlay must go through the one shared path.
absent(/SHEET_IDS\.has\s*\(/,
  "no allowlist gate — every overlay runs the one shared path");
// 12. Root colour is NEVER recolored in-page for the live v2 skin on sheet open (iOS re-samples root).
absent(/html\[data-skin="v2"\][^{]*:has\([^)]*Overlay\.on[^)]*\)[^{]*\{[^}]*background/i,
  "v2 root colour never recolored on sheet open");

console.log(`\n  site glass-lock PASS: ${pass}  FAIL: ${fail}`);
if (fail) {
  console.error("\n✗ WEBSITE SHEET-GLASS RECIPE BROKEN (public/checkit.html). This is the iOS slide-up");
  console.error("  transparency fix that took a full day on the owner's phone. A future edit reverted an");
  console.error("  invariant above. Restore it. If you MUST change the recipe, update this guard in the SAME");
  console.error("  commit and get the owner to re-verify on his iPhone. Do not simplify it away.");
  process.exit(1);
}

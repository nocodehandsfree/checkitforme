// qa-admin-glass — HARDENS the Admin sheet-glass recipe (variant H, design checkpoint 2026-07-17c,
// owner-verified on device). This is a LOCK: if a future edit reverts any invariant, the ship fails.
// The recipe took days of on-device A/B testing to find. Do not "simplify" it away. If you truly need
// to change it, change this guard in the SAME commit and get the owner to re-verify on his iPhone.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../public/app.html"), "utf8");
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m) => { fail++; console.log(`  ✗ ${m}`); };
const has = (re, m) => (re.test(html) ? ok(m) : no(m));
const absent = (re, m) => (re.test(html) ? no(m) : ok(m));

// 1. The killer is NEVER reintroduced: no full-screen fixed rgba dim overlay behind sheets.
absent(/\.sheet-scrim\s*\{[^}]*position:\s*fixed[^}]*background:\s*rgba/i,
  "no full-screen .sheet-scrim dim overlay (the glass killer)");
// 2. Dim is a CONTENT filter, never an overlay layer.
has(/body\.sheetopen[^{]*\{[^}]*filter:\s*brightness/i,
  "dim is body.sheetopen content filter (never an overlay)");
// 3. On open the sheet becomes ABSOLUTE page-layer content (what lets iOS glass ghost it).
has(/\.style\.position\s*=\s*['"]absolute['"]/,
  "openSheet switches the sheet to position:absolute");
// 4. Anchored at (scroll offset) + 14% of the viewport.
has(/\.top\s*=\s*\([^)]*innerHeight\s*\*\s*0\.14/,
  "sheet top anchored at scrollY + 14vh");
has(/window\.scrollY/,
  "current scroll offset captured for the anchor");
// 5. Height overshoots into the bar zone (~120px) — rows must run under the toolbar.
has(/innerHeight\s*\*\s*0\.86\s*\+\s*120/,
  "sheet height overshoots ~120px under the bar");
// 6. Background scroll is locked while a sheet is open.
has(/documentElement\.style\.overflow\s*=\s*['"]hidden['"]/,
  "background scroll locked (html+body overflow hidden)");
// 7. Layout is restored on close (position/overflow reset) — no stuck locked scroll.
has(/function _restoreSheetLayout/,
  "close restores fixed positioning + unlocks scroll (_restoreSheetLayout)");
// 8. The under-bar overshoot is never clipped on short pages.
has(/body\.sheetopen\s*\{\s*min-height/,
  "body.sheetopen min-height guards short-page clipping");
// 9. The scroll-end spacer keeps the last sheet row reachable.
has(/\.sh-body\s*\{[^}]*padding:[^}]*70px[^}]*safe-area-inset-bottom/,
  "sh-body scroll-end spacer (~70px + safe-area)");
// 10. Root colour is NEVER recolored in-page on sheet open (iOS re-samples root → poison).
absent(/:has\([^)]*\.sheet[^)]*\)[^{]*\{[^}]*background/i,
  "root colour never recolored on sheet open");

console.log(`\n  glass-lock PASS: ${pass}  FAIL: ${fail}`);
if (fail) { console.error("\n✗ ADMIN SHEET-GLASS RECIPE BROKEN — variant H (design 07-17c) was reverted. This is the iOS transparency fix that took days on-device. Restore it before shipping."); process.exit(1); }

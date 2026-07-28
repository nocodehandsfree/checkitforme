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
// 9. The scroll-end spacer keeps the last sheet row reachable. It must clear BOTH the 120px under-bar
//    overshoot AND Safari's own ~90px toolbar. It was 70px, which left the last rows of a long sheet
//    128px under the toolbar and untappable: the owner could not pick a default workflow (07-28).
has(/\.sh-body\s*\{[^}]*padding:[^}]*2[0-9]{2}px[^}]*safe-area-inset-bottom/,
  "sh-body scroll-end spacer clears the overshoot + the toolbar (>=200px + safe-area)");
// 11. THE RE-SNAPSHOT. iOS only re-takes the image it blurs behind the toolbar when the DOCUMENT
//     scrolls. Without this the bar keeps ghosting the pre-open page and reads as a flat grey band.
//     pokeChrome() existed for months but nothing ever called it, and the recipe still "passed" here,
//     which is exactly why these three checks exist now (owner 07-28, seen on device).
has(/function pokeChrome\s*\(/, "pokeChrome (the re-snapshot) is defined");
has(/requestAnimationFrame\([^)]*\)\s*=>\s*\{\s*pokeChrome\(\)/,
  "openSheet CALLS pokeChrome (not just defines it)");
has(/_restoreSheetLayout[\s\S]{0,400}?pokeChrome\(\)/,
  "close re-snapshots too (pokeChrome in _restoreSheetLayout)");
// 12. ORDER: the nudge must run BEFORE the scroll lock. Locking first makes the nudge impossible.
//     Asserted structurally: inside openSheet, pokeChrome() appears before overflow='hidden'.
(() => {
  const m = html.match(/function openSheet\([\s\S]*?\n\}/);
  const body = m ? m[0] : "";
  const iPoke = body.indexOf("pokeChrome()"), iLock = body.indexOf("overflow='hidden'");
  (iPoke !== -1 && iLock !== -1 && iPoke < iLock)
    ? ok("openSheet nudges BEFORE locking scroll")
    : no("openSheet nudges BEFORE locking scroll");
})();
// 10. Root colour is NEVER recolored in-page on sheet open (iOS re-samples root → poison).
absent(/:has\([^)]*\.sheet[^)]*\)[^{]*\{[^}]*background/i,
  "root colour never recolored on sheet open");

console.log(`\n  glass-lock PASS: ${pass}  FAIL: ${fail}`);
if (fail) { console.error("\n✗ ADMIN SHEET-GLASS RECIPE BROKEN — variant H (design 07-17c) was reverted. This is the iOS transparency fix that took days on-device. Restore it before shipping."); process.exit(1); }

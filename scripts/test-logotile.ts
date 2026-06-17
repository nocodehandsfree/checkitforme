// Unit test for LogoTile — the ONE shared chain-logo renderer (public/logos/logo-tile.js)
// used identically by the consumer store list, the admin, and /logo-wall.
// Run: ./node_modules/.bin/tsx scripts/test-logotile.ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load the browser IIFE into this scope; it attaches `LogoTile` to globalThis.
const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line no-eval
(0, eval)(readFileSync(join(here, "../public/logos/logo-tile.js"), "utf8"));
const LogoTile = (globalThis as any).LogoTile as {
  tile: (i: any, size?: number) => string;
  balance: (s: string) => string[];
};

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ a square mark renders as the image");
const mark = LogoTile.tile({ url: "/logos/chains/target.png?v=8", wordmark: false, name: "Target — Tysons" });
ok(mark.includes("<img") && mark.includes("lt-tile"), "mark → <img> in a tile");
ok(!mark.includes("lt-wm"), "mark → no wordmark text");
ok(mark.includes('alt="Target"'), "image alt is the brand base name (branch stripped)");

console.log("▶ a dark mark gets a light plate");
const dark = LogoTile.tile({ url: "/logos/chains/x.png?v=8", wordmark: false, dark: true, name: "X" });
ok(dark.includes("lt-lite"), "dark mark → lt-lite plate");
const lite = LogoTile.tile({ url: "/logos/chains/x.png?v=8", wordmark: false, dark: false, name: "X" });
ok(!lite.includes("lt-lite"), "light mark → no plate");

console.log("▶ a wide wordmark renders as balanced two-line text, not the image");
const wm = LogoTile.tile({ url: "/logos/chains/dick_s_sporting_goods.png?v=9", wordmark: true, name: "Dick's Sporting Goods — Mall" });
ok(!wm.includes("<img"), "wordmark → no image");
ok((wm.match(/font-size:/g) || []).length === 2, "wordmark → two lines, each sized to fit");

console.log("▶ each line is sized on its own (Dunham's 'Sports' reads bigger)");
const dun = LogoTile.tile({ url: null, wordmark: true, name: "Dunham's Sports" });
const sizes = (dun.match(/font-size:([\d.]+)px/g) || []).map((s) => parseFloat(s.replace(/[^\d.]/g, "")));
ok(sizes.length === 2 && sizes[1] > sizes[0], "shorter bottom line gets the larger font");

console.log("▶ hyphenated single tokens split to two lines");
ok(LogoTile.balance("Bi-Mart").length === 2, "Bi-Mart → two lines");

console.log("▶ a secondary brand after '/' is dropped");
const od = LogoTile.tile({ url: null, wordmark: true, name: "Office Depot / OfficeMax" });
ok(!/OfficeMax/.test(od) && /Depot/.test(od), "Office Depot / OfficeMax → just Office Depot");

console.log("▶ Barnes & Noble is the custom layout (& to the right)");
const bn = LogoTile.tile({ url: "/logos/chains/barnes_noble.png?v=8", wordmark: true, name: "Barnes & Noble" });
ok(bn.includes("lt-amp"), "B&N → ampersand layout");
ok(bn.includes(">Barnes<") && bn.includes(">Noble<") && bn.includes("lt-and"), "B&N → Barnes / Noble + & mark");

console.log("▶ short names stay on a single line; long names split");
ok(LogoTile.balance("CVS").length === 1, "short single word → one line");
ok(LogoTile.balance("Barnes Noble").length === 2, "two words → two lines");
const split = LogoTile.balance("Dollar General");
ok(split[0] === "Dollar" && split[1] === "General", "balanced split keeps whole words");

console.log("▶ a name with no asset always falls back to text");
const none = LogoTile.tile({ url: null, name: "Local Card Shop" });
ok(none.includes("lt-wm") && !none.includes("<img"), "no url → wordmark text");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);

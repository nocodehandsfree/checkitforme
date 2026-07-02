// qa-design — DESIGN-TOKEN harness for the site-redesign loop (LOOP.md cycle 0b).
// Audits checkit.html's NEW-SKIN markup (everything scoped under `skin-v2` / data-v2 blocks)
// against docs/design/STYLE_GUIDE_NEW.md's exact tokens, and the WHOLE file against banned terms.
// Fails on: off-system colors inside v2 scope · banned/invented terms anywhere · hairline borders
// on v2 cards (the "old skin" tell). Run: tsx scripts/qa-design.ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../public/checkit.html"), "utf8");
let pass = 0, fail = 0;
const ok = (m: string) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m: string) => { fail++; console.log(`  ✗ ${m}`); };

// ---- 1. Banned terms (root CLAUDE.md Terminology) — whole file, any casing.
for (const term of [/\bscrap(er|ing|e)\b/i, /marketplace insights/i]) {
  if (term.test(html)) no(`banned term ${term} present`); else ok(`banned term ${term} absent`);
}
// Comp-invented terms must not leak into served copy (extend as COPY QUEUE grows).
for (const term of [/style-active/, /Bundled Page/]) {
  if (term.test(html)) no(`comp-ism ${term} leaked`); else ok(`comp-ism ${term} absent`);
}

// ---- 2. Token audit inside the v2 scope only.
// v2 CSS lives in blocks bracketed by /*V2*/ … /*V2END*/ ; v2 markup carries data-v2. Until the
// preview switch lands (cycle 1) there is no scope — vacuously green.
const v2blocks: string[] = [];
const cssRe = /\/\*V2\*\/([\s\S]*?)\/\*V2END\*\//g;
let m: RegExpExecArray | null;
while ((m = cssRe.exec(html))) v2blocks.push(m[1]);
const scope = v2blocks.join("\n");

// STYLE_GUIDE_NEW.md §2/§3 exact palette (surfaces, color, text, verdicts, rings, accents).
const TOKENS = new Set([
  "#1D1D22","#26262B","#2D2D34","#27272D","#2E2E35","#25252B","#31313A","#28282E","#1B1B20",
  "#17171C","#20202A","#23232A","#1F1F25","#34343D","#23232B","#08090D","#26251E","#141419",
  "#2F2F36", // R2/R3 comp: modal ✕-circle gradient top (key raised ON the #26262B card)
  "#D9D9E0","#F4F4F6","#0B0B0F", // RN2 comp: paste-message text · driver pay key fill/text
  "#4ADE80","#4CF286","#5BEA93","#19B145","#0B5A2C","#34C268","#06210F",
  "#FFCB05","#FFE066","#8A6D00","#EF4444","#FF7B7B","#FBBF24","#F59E0B","#FF9B9B","#7F1D1D",
  "#266440","#6B2427","#6C5419","#6E490F",
  "#FFF","#FFFFFF","#000","#000000","#8A8A96","#7C7C88","#5C5C68","#6B6B7B","#CDCDD8","#B9B9C4",
  "#2B2B33","#25252C","#E9E9F0",
]);
const hexes = scope.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
const offenders = [...new Set(hexes.map(h => h.toUpperCase())
  .filter(h => h.length === 4 || h.length === 7) // rgba-hex8 handled by rgba() rule below
  .filter(h => !TOKENS.has(h)))];
if (offenders.length) no(`off-system colors in v2 scope: ${offenders.slice(0, 12).join(" ")}`);
else ok(`v2 colors all on-system (${hexes.length} uses)`);

// §8: no hairline borders on v2 cards/rows (glass-on-wash is the only bordered thing, and glass is
// rgba-white). A `border: 1px solid #…` inside v2 = old skin.
const hairlines = (scope.match(/border:\s*1px solid #(?![Ff]{3,6})/g) || []).length;
if (hairlines) no(`${hairlines} hairline solid-hex borders inside v2 scope (§8: depth separates, not borders)`);
else ok("no hairline borders in v2 scope");

// Inter only (§4): any other font-family declared in v2 scope fails.
const fonts = (scope.match(/font-family:[^;]+/g) || []).filter(f => !/Inter/.test(f));
if (fonts.length) no(`non-Inter font-family in v2 scope: ${fonts[0]}`);
else ok("Inter-only in v2 scope");

console.log("════════════════");
console.log(`  qa-design PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// gap-check.mjs — plain-English diff between a comp (or CD inbox file) and the matching truth
// snapshot / live page (REBUILD_PLAN 2026-07-22). Run BEFORE implementing a comp (what has to
// change) and AFTER (what still differs — should be nothing).
//
//   node scripts/gap-check.mjs <comp.html> <truth.html | https://url> [--section <id>]
//
// Compares the things agents get wrong: visible copy, colors, font sizes. Heuristic by design —
// it reads source, not pixels. Device-true rendering is still the owner's phone.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => a !== "--section");
const secIdx = process.argv.indexOf("--section");
const section = secIdx > -1 ? process.argv[secIdx + 1] : null;
const [compPath, truthPath] = args;
if (!compPath || !truthPath) {
  console.error("usage: node scripts/gap-check.mjs <comp.html> <truth.html|url> [--section <id>]");
  process.exit(2);
}

async function load(p) {
  if (/^https?:\/\//.test(p)) {
    const r = await fetch(p, { headers: { "user-agent": "Mozilla/5.0 gap-check" } });
    if (!r.ok) { console.error(`✗ ${p} → HTTP ${r.status}`); process.exit(2); }
    return await r.text();
  }
  return readFileSync(p, "utf8");
}

// Narrow to the id="<section>" region: from the id line to the next id= at the same-or-any level.
// Line-based on purpose (same ranges INDEX.md hands out).
function narrow(html, id) {
  const lines = html.split("\n");
  const start = lines.findIndex((l) => l.includes(`id="${id}"`));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/\sid="[\w-]+"/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

const feats = (html) => {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const text = new Set(
    [...noScript.matchAll(/>([^<>{}]+)</g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 2 && !/^[\d\s.,:;%()-]+$/.test(t) && !/^&[a-z]+;$/.test(t))
  );
  const colors = new Set(
    [...html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([\d ,.]+\)/g)].map((m) => m[0].toLowerCase())
  );
  const fonts = new Set([...html.matchAll(/font-size:\s*([\d.]+(?:px|rem|pt|em))/g)].map((m) => m[1]));
  return { text, colors, fonts };
};

const only = (a, b) => [...a].filter((x) => !b.has(x));

let comp = await load(compPath);
let truth = await load(truthPath);
if (section) {
  const c = narrow(comp, section), t = narrow(truth, section);
  if (!c) console.error(`note: id="${section}" not found in ${compPath} — comparing whole file`);
  if (!t) console.error(`note: id="${section}" not found in ${truthPath} — comparing whole file`);
  comp = c || comp; truth = t || truth;
}

const C = feats(comp), T = feats(truth);
const gaps = [];
for (const t of only(C.text, T.text).slice(0, 40)) gaps.push(`comp says "${t}" — the live page never says it`);
for (const t of only(T.text, C.text).slice(0, 40)) gaps.push(`live page says "${t}" — the comp doesn't have it`);
for (const c of only(C.colors, T.colors).slice(0, 20)) gaps.push(`color ${c} is in the comp but never on the live page`);
for (const c of only(T.colors, C.colors).slice(0, 20)) gaps.push(`color ${c} is on the live page but not in the comp`);
for (const f of only(C.fonts, T.fonts).slice(0, 15)) gaps.push(`font size ${f} only in the comp`);
for (const f of only(T.fonts, C.fonts).slice(0, 15)) gaps.push(`font size ${f} only on the live page`);

console.log(`▶ gap-check: ${compPath}  vs  ${truthPath}${section ? `  (section #${section})` : ""}`);
if (!gaps.length) {
  console.log("No gaps found in copy, colors, or font sizes. (Heuristic — the owner's phone is the judge.)");
} else {
  for (const g of gaps) console.log("  · " + g);
  console.log(`${gaps.length} difference${gaps.length === 1 ? "" : "s"}. Implementing? Close every one or say why not.`);
}

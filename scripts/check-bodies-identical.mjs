// Proof that the split MOVED code and did not rewrite it: every top-level statement of the old
// src/server.ts must still exist, character for character, somewhere in src/server.ts or
// src/routes/*.ts. Only import lines, the `export ` a moved declaration gains, and the indentation
// inside register() are allowed to differ.
// Usage: node scripts/check-bodies-identical.mjs <old-server.ts>
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const oldPath = process.argv[2];
if (!oldPath) { console.error("usage: check-bodies-identical.mjs <old-server.ts>"); process.exit(2); }

const norm = (s) => s
  .replace(/^\s*export\s+/, "")
  .split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim())
  .map((l) => l.replace(/^\s+/, ""))          // indentation changed when code moved into register()
  .join("\n").trim();

function statementsOf(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
  const out = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) continue;
    // unwrap `export function register(app) { ... }` — its contents are the moved statements
    if (ts.isFunctionDeclaration(st) && st.name?.text === "register") {
      for (const inner of st.body?.statements ?? []) out.push(inner.getText(sf));
      continue;
    }
    out.push(st.getText(sf));
  }
  return out;
}

const oldStmts = statementsOf(readFileSync(oldPath, "utf8"), oldPath).map(norm);
const newStmts = [
  ...statementsOf(readFileSync("src/server.ts", "utf8"), "src/server.ts"),
  ...readdirSync("src/routes").filter((f) => f.endsWith(".ts"))
    .flatMap((f) => statementsOf(readFileSync(join("src/routes", f), "utf8"), f)),
].map(norm);

// The ONE line the split rewrote instead of moving: `here` used to be src/, and the code that
// reads public/ and data/ off it moved into src/routes/, so it climbs one level to resolve the
// same paths as before. Anything else showing up here means code was edited, not moved.
const DECLARED_REWRITES = [[
  'const here = dirname(fileURLToPath(import.meta.url));',
  'const here = join(dirname(fileURLToPath(import.meta.url)), "..");',
]];

// the register() calls server.ts gained are new by design
const added = new Set(newStmts.filter((s) => /^register[A-Z][A-Za-z]*\(app\);$/.test(s)));
const bag = new Map();
for (const s of newStmts) { if (added.has(s)) continue; bag.set(s, (bag.get(s) ?? 0) + 1); }

for (const [from, to] of DECLARED_REWRITES) {
  const nf = norm(from), nt = norm(to);
  if ((bag.get(nt) ?? 0) > 0) { bag.set(nt, bag.get(nt) - 1); bag.set(nf, (bag.get(nf) ?? 0) + 1); console.log("declared rewrite accepted: " + from); }
}

let missing = 0;
for (const s of oldStmts) {
  const n = bag.get(s) ?? 0;
  if (n === 0) { missing++; console.error("NOT FOUND after the split:\n  " + s.split("\n")[0].slice(0, 110)); }
  else bag.set(s, n - 1);
}
let extra = 0;
for (const [s, n] of bag) if (n > 0) { extra += n; console.error(`EXTRA x${n}:\n  ` + s.split("\n")[0].slice(0, 110)); }

console.log(`statements before: ${oldStmts.length}   after: ${newStmts.length - added.size} (+${added.size} register calls)`);
console.log(missing || extra ? `FAILED — ${missing} missing, ${extra} extra` : "IDENTICAL — every statement moved unchanged");
process.exit(missing || extra ? 1 : 0);

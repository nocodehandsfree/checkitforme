// Which route addresses is nothing in this repo asking for? Evidence, not proof — a route can
// still be live because an outside service calls it. Cross-check against traffic before deleting.
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const routes = [];
for (const f of readdirSync("src/routes").filter((x) => x.endsWith(".ts"))) {
  const t = readFileSync(join("src/routes", f), "utf8");
  const sf = ts.createSourceFile(f, t, ts.ScriptTarget.ESNext, true);
  const walk = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "app") {
      const a = n.arguments[0];
      if (a && ts.isStringLiteral(a)) routes.push({ file: f, method: n.expression.name.text.toUpperCase(), path: a.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    n.forEachChild(walk);
  };
  sf.forEachChild(walk);
}

const texts = [];
const eat = (dir, exts) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) eat(p, exts); continue; }
    if (exts.some((x) => e.name.endsWith(x)) && statSync(p).size < 20e6) texts.push([p, readFileSync(p, "utf8")]);
  }
};
eat("public", [".html", ".js", ".css"]);
eat("src", [".ts"]);
eat("scripts", [".mjs", ".sh", ".js"]);
eat("tests", [".ts"]);
eat("workers", [".ts", ".js", ".toml"]);
eat("docs", [".md"]);

const literal = (p) => p.split("/:")[0].replace(/\/$/, "");
const out = [];
for (const r of routes) {
  const l = literal(r.path);
  if (l.length < 5) continue; // "/", "/r", "/s" — reachable by typing them
  const hits = [];
  for (const [p, t] of texts) {
    if (p === join("src/routes", r.file)) continue; // its own definition
    if (t.includes(l)) hits.push(p);
  }
  if (!hits.length) out.push(r);
}
console.log(`${routes.length} routes registered · ${out.length} that nothing in this repo asks for:\n`);
for (const r of out.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`  ${r.method.padEnd(6)} ${r.path.padEnd(44)} ${r.file}:${r.line}`);
}

// Proof that the split changed nothing a browser can see.
//   1. reads the ordered route table out of the OLD src/server.ts (git revision, arg 1)
//   2. builds the NEW table by actually importing src/routes/* into a fresh Hono
//   3. fails if any route is missing, added, or overtaken by a route it could collide with
// Usage: node scripts/check-route-order.mjs <old-server.ts>
import ts from "typescript";
import { readFileSync } from "node:fs";
import { Hono } from "hono";

const oldPath = process.argv[2];
if (!oldPath) { console.error("usage: check-route-order.mjs <old-server.ts>"); process.exit(2); }

// ---- old table: static read, with the three for-of registration loops expanded ----------------
const METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "use", "on"]);
// Only TOP-LEVEL registrations count — an app.get() nested inside another handler is not registered
// at boot (and if it sits after a return, it never runs at all). Those are reported separately.
function tableFromSource(file, { nested = false } = {}) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true);
  const out = [];
  const topLevel = new Set();
  const markTop = (n) => {
    if (ts.isExpressionStatement(n)) topLevel.add(n.expression);
    if (ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isBlock(n) || ts.isIfStatement(n)) n.forEachChild(markTop);
  };
  sf.statements.forEach(markTop);
  const walk = (node, loopVars) => {
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
      const d = node.initializer.declarations[0];
      const expr = node.expression;
      if (d && ts.isIdentifier(d.name) && ts.isArrayLiteralExpression(expr)) {
        for (const el of expr.elements) {
          if (!ts.isStringLiteral(el)) continue;
          walk(node.statement, { ...loopVars, [d.name.text]: el.text });
        }
        return;
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "app"
        && METHODS.has(node.expression.name.text)) {
      const isTop = topLevel.has(node);
      if (isTop !== nested) {
        const p = resolvePath(node.arguments[0], loopVars);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        out.push(p !== null ? `${node.expression.name.text.toUpperCase()} ${p}${nested ? ` (line ${line})` : ""}` : `${node.expression.name.text.toUpperCase()} <unresolved@${line}>`);
      }
    }
    node.forEachChild((c) => walk(c, loopVars));
  };
  const resolvePath = (arg, vars) => {
    if (!arg) return null;
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
    if (ts.isTemplateExpression(arg)) {
      let s = arg.head.text;
      for (const span of arg.templateSpans) {
        if (!ts.isIdentifier(span.expression) || !(span.expression.text in vars)) return null;
        s += vars[span.expression.text] + span.literal.text;
      }
      return s;
    }
    if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = resolvePath(arg.left, vars), r = resolvePath(arg.right, vars);
      if (l === null || r === null) return null;
      return l + r;
    }
    if (ts.isIdentifier(arg) && arg.text in vars) return vars[arg.text];
    return null;
  };
  walk(sf, {});
  return out;
}

// ---- new table: register the real modules into a real Hono ------------------------------------
// the register order is read from src/server.ts itself — the file that actually decides it
const serverSrc = readFileSync("src/server.ts", "utf8");
const aliasToFile = new Map([...serverSrc.matchAll(/import \{ register as (\w+) \} from "\.\/routes\/([\w-]+)"/g)].map((m) => [m[1], m[2]]));
const order = [...serverSrc.matchAll(/^(\w+)\(app\);$/gm)].map((m) => aliasToFile.get(m[1])).filter(Boolean);
const app = new Hono();
const newTable = [];
{
  // src/server.ts registers /api/health itself, before the area files; mirror that here by reading
  // the routes server.ts still owns, in its own order, and splicing them at the register() point.
  const own = tableFromSource("src/server.ts");
  const marker = own.indexOf("<REGISTER>");
  const serverText = readFileSync("src/server.ts", "utf8");
  const regLine = serverText.split("\n").findIndex((l) => /^register[A-Z]/.test(l));
  const lines = serverText.split("\n");
  const before = [], after = [];
  const sf = ts.createSourceFile("s", serverText, ts.ScriptTarget.ESNext, true);
  for (const entry of tableFromSource("src/server.ts")) {
    // decide before/after by the line the route sits on
    const m = entry;
    (routeLine(serverText, m) < regLine ? before : after).push(m);
  }
  for (const e of before) newTable.push(e);
  for (const f of order) {
    const mod = await import(`../src/routes/${f}.ts`);
    const sub = new Hono();
    mod.register(sub);
    for (const r of sub.routes) newTable.push(`${r.method} ${r.path}`);
  }
  for (const e of after) newTable.push(e);
}
function routeLine(text, entry) {
  const [method, path] = [entry.split(" ")[0].toLowerCase(), entry.slice(entry.indexOf(" ") + 1)];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) if (lines[i].startsWith(`app.${method}("${path}"`)) return i;
  return Number.MAX_SAFE_INTEGER;
}

// ---- compare ----------------------------------------------------------------------------------
const norm = (t) => t.map((s) => s.replace(/^ALL /, "ALL "));
const oldT = norm(tableFromSource(oldPath));
const newT = norm(newTable);

const count = (t) => t.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map());
const co = count(oldT), cn = count(newT);
let bad = 0;
for (const [k, v] of co) if ((cn.get(k) ?? 0) !== v) { console.error(`MISSING/CHANGED: ${k}  before=${v} after=${cn.get(k) ?? 0}`); bad = 1; }
for (const [k, v] of cn) if (!co.has(k)) { console.error(`ADDED: ${k} x${v}`); bad = 1; }

// order only matters between two routes that could both match one request
const segs = (p) => p.split("/").filter(Boolean);
function canCollide(a, b) {
  if (a.method !== b.method && a.method !== "ALL" && b.method !== "ALL") return false;
  const A = segs(a.path), B = segs(b.path);
  if (a.path.includes("*") || b.path.includes("*")) return true;
  if (A.length !== B.length) return false;
  return A.every((s, i) => s === B[i] || s.startsWith(":") || B[i].startsWith(":"));
}
const parse = (s) => ({ method: s.split(" ")[0], path: s.slice(s.indexOf(" ") + 1) });
const posOld = new Map(), posNew = new Map();
oldT.forEach((s, i) => { if (!posOld.has(s)) posOld.set(s, i); });
newT.forEach((s, i) => { if (!posNew.has(s)) posNew.set(s, i); });
const shared = [...posOld.keys()].filter((k) => posNew.has(k));
for (let i = 0; i < shared.length; i++) {
  for (let j = i + 1; j < shared.length; j++) {
    const a = shared[i], b = shared[j];
    const flipped = (posOld.get(a) < posOld.get(b)) !== (posNew.get(a) < posNew.get(b));
    if (flipped && canCollide(parse(a), parse(b))) {
      console.error(`ORDER FLIPPED on two routes that can match the same request:\n  ${a}\n  ${b}`);
      bad = 1;
    }
  }
}
const nestedOld = tableFromSource(oldPath, { nested: true });
if (nestedOld.length) {
  console.log(`\nnot registered at all (written inside another handler) — unchanged by the split:`);
  for (const n of nestedOld) console.log("  " + n);
  console.log("");
}
console.log(`routes before: ${oldT.length}   after: ${newT.length}`);
console.log(bad ? "FAILED" : "IDENTICAL — same routes, and nothing overtook anything it could collide with");
process.exit(bad);

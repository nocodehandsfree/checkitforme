// Imports and top-level declarations that nothing in their own file uses (and, for declarations,
// nothing in any other file imports). Read off the parse tree, so comments and strings never count.
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FILES = [["src/server.ts", "src/server.ts"], ...readdirSync("src/routes").filter((f) => f.endsWith(".ts")).map((f) => [f, join("src/routes", f)])];

const used = new Map();   // file -> Set of identifiers referenced
const declared = new Map(); // file -> [{name, line, exported}]
const imported = new Map(); // file -> [{name, line, from}]

for (const [label, path] of FILES) {
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(label, text, ts.ScriptTarget.ESNext, true);
  const refs = new Set(), decls = [], imps = [];
  const walk = (n) => {
    if (ts.isImportDeclaration(n)) return; // import clauses are not uses
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMember = p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isBindingElement(p) && p.propertyName === n) || (ts.isQualifiedName(p) && p.right === n));
      const isOwnName = p && ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) && p.name === n) || (p && ts.isVariableDeclaration(p) && p.name === n);
      if (!isMember && !isOwnName) refs.add(n.text);
    }
    n.forEachChild(walk);
  };
  sf.forEachChild(walk);
  for (const st of sf.statements) {
    const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
    if (ts.isImportDeclaration(st)) {
      const cl = st.importClause; if (!cl) continue;
      const from = st.moduleSpecifier.text;
      if (cl.name) imps.push({ name: cl.name.text, line, from });
      const nb = cl.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) imps.push({ name: nb.name.text, line, from });
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imps.push({ name: el.name.text, line, from });
      continue;
    }
    const exported = !!(ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    if (ts.isFunctionDeclaration(st) && st.name) decls.push({ name: st.name.text, line, exported });
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) decls.push({ name: d.name.text, line, exported });
    else if ((ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) decls.push({ name: st.name.text, line, exported });
  }
  used.set(label, refs); declared.set(label, decls); imported.set(label, imps);
}

// a name is "imported elsewhere" if any other file's import list names it
const importedElsewhere = new Map();
for (const [label, imps] of imported) for (const i of imps) {
  if (!importedElsewhere.has(i.name)) importedElsewhere.set(i.name, new Set());
  importedElsewhere.get(i.name).add(label);
}

let n1 = 0, n2 = 0;
console.log("IMPORTS nothing in the file uses:");
for (const [label] of FILES) {
  const refs = used.get(label);
  const dead = imported.get(label).filter((i) => !refs.has(i.name));
  if (dead.length) { console.log(`  ${label}`); for (const d of dead) { console.log(`      line ${String(d.line).padStart(4)}  ${d.name}  (from ${d.from})`); n1++; } }
}
console.log(`\nTOP-LEVEL DECLARATIONS nothing uses, here or anywhere else:`);
for (const [label] of FILES) {
  const refs = used.get(label);
  const dead = declared.get(label).filter((d) => {
    if (refs.has(d.name)) return false;
    const elsewhere = importedElsewhere.get(d.name);
    return !(elsewhere && [...elsewhere].some((f) => f !== label));
  });
  if (dead.length) { console.log(`  ${label}`); for (const d of dead) { console.log(`      line ${String(d.line).padStart(4)}  ${d.name}`); n2++; } }
}
console.log(`\n${n1} unused imports · ${n2} unused declarations`);

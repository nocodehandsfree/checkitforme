// One-shot refactor tool: slice src/server.ts into src/routes/* by area.
// Uses the TypeScript parser so every top-level statement moves as an exact byte slice
// (comments travel with the statement they document). Run: node scripts/split-server.mjs
import ts from "typescript";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src/server.ts");
const OUT = join(ROOT, "src/routes");

// This ran ONCE, on 2026-08-02, against the 7,381-line src/server.ts. It is kept as the record of
// how the split was made (the PM audits against it). Running it again would shred the file it
// already split, so it refuses unless src/routes is gone.
if (existsSync(OUT) && !process.argv.includes("--report")) {
  console.error("src/routes/ already exists — this tool has already run. It is a record, not a step.");
  process.exit(2);
}
const text = readFileSync(SRC, "utf8");
const sf = ts.createSourceFile(SRC, text, ts.ScriptTarget.ESNext, true);

// ---- 1. cut the file into top-level blocks -------------------------------------------------
const blocks = [];
for (const st of sf.statements) {
  const full = st.getFullStart();
  const end = st.getEnd();
  blocks.push({ node: st, start: full, end, text: text.slice(full, end), line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1 });
}
// tail after the last statement (trailing newline only)
const tail = text.slice(blocks[blocks.length - 1].end);

// ---- 2. classify -----------------------------------------------------------------------------
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "use", "on"]);
function routeCall(node) {
  // app.get("/x", ...) as an expression statement
  if (!ts.isExpressionStatement(node)) return null;
  let e = node.expression;
  if (!ts.isCallExpression(e)) return null;
  const callee = e.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  if (!ts.isIdentifier(callee.expression) || callee.expression.text !== "app") return null;
  const method = callee.name.text;
  if (!ROUTE_METHODS.has(method)) return null;
  const a0 = e.arguments[0];
  const path = a0 && ts.isStringLiteral(a0) ? a0.text : "<dynamic>";
  return { method, path };
}
function loopRegistersRoutes(node) {
  if (!ts.isForOfStatement(node) && !ts.isForStatement(node)) return false;
  return /\bapp\.(get|post|use|all)\(/.test(node.getText(sf));
}
for (const b of blocks) {
  const n = b.node;
  if (ts.isImportDeclaration(n)) { b.kind = "import"; continue; }
  const r = routeCall(n);
  if (r) { b.kind = "route"; b.method = r.method; b.path = r.path; continue; }
  if (loopRegistersRoutes(n)) { b.kind = "route-loop"; continue; }
  if (ts.isFunctionDeclaration(n) || ts.isVariableStatement(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n)) { b.kind = "decl"; continue; }
  b.kind = "init"; // side effects: assertProdSecurity(), setInterval(...), process.on(...), await bootstrap()
}
// names a decl block introduces (so other files can import them)
for (const b of blocks) {
  b.names = [];
  const n = b.node;
  if (ts.isFunctionDeclaration(n) && n.name) b.names.push(n.name.text);
  else if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n)) { if (n.name) b.names.push(n.name.text); }
  else if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name)) b.names.push(d.name.text);
  b.isType = ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n);
}

// ---- 3. the assignment table ------------------------------------------------------------------
// Route paths -> file. First match wins. Order here is documentation, not behaviour: the emitted
// register() calls keep the ORIGINAL registration order of the file.
const BY_PATH = [
  // --- outside services ---
  [/^\/webhooks\/stripe/, "stripe"],
  [/^\/webhooks\/elevenlabs/, "twilio-and-elevenlabs"],
  [/^\/twiml\//, "twilio-and-elevenlabs"],
  [/^\/nav\//, "twilio-and-elevenlabs"],
  [/^\/tapedeck\//, "twilio-and-elevenlabs"],
  [/^\/api\/brain\//, "twilio-and-elevenlabs"],
  [/^\/api\/bridge\/call/, "twilio-and-elevenlabs"],
  [/^\/pub\/bridge-debug/, "twilio-and-elevenlabs"],
  [/^\/pub\/live-debug/, "twilio-and-elevenlabs"],
  [/^\/api\/admin\/live-debug/, "twilio-and-elevenlabs"],
  [/^\/api\/(ingest|tick)$/, "twilio-and-elevenlabs"],
  [/^\/api\/health$/, "server"],

  // --- admin: chains + phone menus ---
  [/^\/api\/admin\/(tree|trainer|mapper|map|llm-ping|agent)\b/, "admin-chains"],
  [/^\/api\/admin\/chains\//, "admin-chains"],
  [/^\/api\/admin\/learned-sync/, "admin-chains"],
  [/^\/api\/admin\/tapedeck\//, "admin-chains"],
  [/^\/api\/chains/, "admin-chains"],
  [/^\/api\/test-stores/, "admin-chains"],
  [/^\/api\/preview\//, "admin-chains"],

  // --- admin: stores ---
  [/^\/api\/stores\//, "admin-stores"],
  [/^\/api\/(hours|phones)\//, "admin-stores"],
  [/^\/api\/retailers/, "admin-stores"],
  [/^\/api\/admin\/(store-intel|coverage|data-health)/, "admin-stores"],
  [/^\/api\/(zones|import-zones|schedules)/, "admin-stores"],
  [/^\/api\/admin\/(table-dump|table-load)/, "admin-stores"],
  [/^\/api\/categories/, "admin-stores"],
  [/^\/api\/(products|policy)/, "admin-stores"],

  // --- admin: restock intel ---
  [/^\/api\/admin\/(restock-intel|restock-backfill|restock-audit|store-restock)/, "admin-restock"],

  // --- admin: money ---
  [/^\/api\/admin\/(plans|metrics|user-history|cost-inputs|call-rates|check-costs|monthly-services)/, "admin-money"],

  // --- admin: users ---
  [/^\/api\/admin\/(users|pulse|overview|stats-since)/, "admin-users"],
  [/^\/api\/leads/, "admin-users"],
  [/^\/api\/waitlist/, "admin-users"],

  // --- admin: checks ---
  [/^\/api\/admin\/(test-calls|calls-audit|purge-undefined-calls|receipt|call-timing|agent-prompt|workflow-assignments|reset-rotation|restore-calls-from-el)/, "admin-checks"],
  [/^\/api\/(results|call-now|hangup|talk|simulate|conversation)/, "admin-checks"],
  [/^\/api\/calls\//, "admin-checks"],
  [/^\/api\/feedback/, "admin-checks"],
  [/^\/api\/bench\//, "admin-checks"],

  // --- admin: voice ---
  [/^\/api\/(voices|voice-tuning|voice-presets|sandbox-tuning|voice\/live)/, "admin-voice"],
  [/^\/api\/statuses/, "admin-voice"],
  [/^\/pub\/statuses/, "admin-voice"],

  // --- admin: settings ---
  [/^\/api\/(settings|gtm|store-sync|settings-sync|concurrency|credits)/, "admin-settings"],
  [/^\/api\/admin\/(calling|ui-deploy|ui-rollback|ui-version)/, "admin-settings"],
  [/^\/api\/ops\//, "admin-settings"],

  // --- customer: alerts ---
  [/^\/app\/alerts\//, "in-stock-alerts"],
  [/^\/api\/alerts\//, "in-stock-alerts"],
  [/^\/api\/admin\/owner-alert/, "in-stock-alerts"],
  [/^\/api\/admin\/users\/:id\/email/, "in-stock-alerts"],
  [/^\/(confirm-email|unsubscribe)$/, "signing-in"],

  // --- customer: support ---
  [/^\/(pub|api|app)\/support\//, "support-chat"],

  // --- customer: community + requests ---
  [/^\/pub\/(community|kiosks|kiosk-receipt|watch|watch-count|waitlist|store-request|lead)/, "community"],
  [/^\/api\/(community|kiosks|kiosk-receipts|watches|store-requests|discord)/, "community"],
  [/^\/api\/admin\/receipts\/inbox-debug/, "community"],
  [/^\/app\/my-store-requests/, "community"],

  // --- customer: zones ---
  [/^\/app\/zones/, "manage-zones"],

  // --- customer: money ---
  [/^\/(pub|app)\/(plans|checkout|checkout-intent)/, "subscription-mgmt"],
  [/^\/app\/charge/, "subscription-mgmt"],

  // --- customer: account ---
  [/^\/app\/(me|history|referral|schedule|schedules|email)/, "my-account"],
  [/^\/pub\/credits/, "my-account"],

  // --- customer: running a check ---
  [/^\/pub\/(check|check-live|queue|result|live|charge|feedback|translate)/, "running-a-check"],
  [/^\/pub\/bridge/, "running-a-check"],
  [/^\/app\/(check|check-live)$/, "running-a-check"],

  // --- customer: store data ---
  [/^\/pub\/(stores|store|geocode|store-types|stock|pokemon-sets|best-bet|finds|categories|products|policy)/, "store-data"],
  [/^\/api\/stock\//, "store-data"],
  [/^\/api\/sell-methods\//, "store-data"],

  // --- signing in ---
  [/^\/auth\//, "signing-in"],
  [/^\/admin-(login|logout)$/, "signing-in"],

  // --- logos ---
  [/^\/logo-wall/, "store-logos"],
  [/^\/logos\/chains/, "store-logos"],
  [/^\/api\/chains\/:id\/logo/, "store-logos"],
  [/^\/check-lab/, "store-logos"],

  // --- the website's own pages ---
  [/^\/(s|r|peek|sheetpeek|robots\.txt|sitemap\.xml|sw\.js|manifest\.webmanifest)$/, "website-pages"],
  [/^\/(og|logos|fonts)\//, "website-pages"],
  [/^\/p\//, "website-pages"],
  [/^\/pub\/(gate|protected|rev)/, "website-pages"],
  [/^\/$/, "website-pages"],
];

// Declarations and side-effect statements, keyed by the first name they declare.
// "server" = stays in src/server.ts (boot, the walls, the live-listen plumbing).
const BY_NAME = {
  // shared by several route files
  closedGate: "shared-helpers", isFinderPrivate: "shared-helpers", requesterIsComp: "shared-helpers",
  requesterFeatures: "shared-helpers", isOwnerOnlyStore: "shared-helpers", ownerOnlyRetailerIds: "shared-helpers",
  retailerTimeToHuman: "shared-helpers", getStatsSince: "shared-helpers", verifyClerkToken: "shared-helpers",
  adminOk: "shared-helpers", charged: "shared-helpers", pubCredits: "shared-helpers",
  esc: "shared-helpers", page: "shared-helpers", withAnalytics: "shared-helpers", PH_SNIPPET: "shared-helpers",
  here: "shared-helpers", peekOk: "shared-helpers", canReadTranscript: "shared-helpers",
  productForm: "shared-helpers", productSet: "shared-helpers", PRODUCT_FORMS: "shared-helpers",
  tallyArr: "shared-helpers", qTokenMatch: "shared-helpers",
  // logo helpers — used by store lists, chains, the wall
  chainLogoCache: "shared-helpers", chainLogoFiles: "shared-helpers", chainSlug: "shared-helpers",
  logoMetaCache: "shared-helpers", logoMeta: "shared-helpers", chainLogoFile: "shared-helpers",
  chainLogoDbCache: "shared-helpers", refreshChainLogoDb: "shared-helpers", chainLogoDbLoading: "shared-helpers",
  ensureChainLogoDb: "shared-helpers", LOGO_AREA: "shared-helpers", LOGO_MAXW: "shared-helpers",
  LOGO_MAXH: "shared-helpers", logoPctFor: "shared-helpers", chainLogoInfo: "shared-helpers",
  logoFields: "shared-helpers", withLogo: "shared-helpers", storeChainName: "shared-helpers",
  // distributors — store lists + admin
  DistCfg: "shared-helpers", DISTRIBUTORS_FALLBACK: "shared-helpers", distCache: "shared-helpers",
  distConfig: "shared-helpers", carriesForChain: "shared-helpers", storeCarriesList: "shared-helpers",
  distributorsForChain: "shared-helpers",
  // shipment-day maths — restock + best bet
  tzDow: "shared-helpers", SHIP_DOW: "shared-helpers", shipDow: "shared-helpers", dowAt: "shared-helpers",
  learnedShipDow: "shared-helpers",
  // admin report helpers
  topTally: "admin-restock", parseProducts: "admin-restock", CallReality: "admin-restock",
  classifyCallReality: "admin-restock", chainLabel: "admin-restock",
  staffAccountIds: "admin-users", isStaffAcct: "admin-users",
  storeIntelCache: "admin-stores", coverageRefCache: "admin-stores", coverageRef: "admin-stores",
  dataHealthCache: "admin-stores", MIRROR_TABLES: "admin-stores", LOAD_TABLES: "admin-stores",
  placeChainTreeCall: "admin-chains",
  GTM_SEED: "admin-settings",
  ADMIN_UI_DIR: "admin-settings", ADMIN_UI_LIVE: "admin-settings", ADMIN_UI_META: "admin-settings",
  ADMIN_UI_KEEP: "admin-settings", adminUiHtml: "admin-settings",
  enrichAlertStores: "in-stock-alerts",
  // placing a check on the phone
  bridgeStoreCall: "running-a-check", LIVE_WS_HOST: "running-a-check", placeLive: "running-a-check",
  hangupTwilioCall: "shared-helpers", zoneCallSids: "admin-stores", lvTraces: "twilio-and-elevenlabs",
  emailLandingPage: "signing-in", unsubscribeEmail: "signing-in",
  kioskSummary: "community",
  zoneRunSids: "manage-zones", zoneHangRoom: "manage-zones", zoneAuth: "manage-zones", zoneView: "manage-zones",
  artworkSize: "store-logos",
  pokemonSetsCache: "store-data", PRETTY_TYPE: "store-data", prettyType: "store-data",
  TYPE_ORDER: "store-data", orderProducts: "store-data",
  // the website's own pages
  seoGraph: "website-pages", publicHost: "website-pages", COMING_SOON_ICONS: "website-pages",
  renderComingSoon: "website-pages", renderRunner: "website-pages", renderShare: "website-pages",
  PAGE_TITLES: "website-pages", H2: "website-pages", RM: "website-pages", DEFAULT_PAGES: "website-pages",
  PAGE_TITLES_ES: "website-pages", DEFAULT_PAGES_ES: "website-pages", rootHandler: "website-pages",
  BOOT_REV: "website-pages",
  // stays in server.ts — boot, the walls, live listening
  app: "server", BUILD_SHA: "server", GATE_SKIP: "server", ADMIN_ORIGIN: "server",
  ADMIN_PHONES: "shared-helpers", isAdminPhone: "shared-helpers", cookieRootDomain: "shared-helpers",
  rooms: "server", addListener: "server", fanout: "server", relaySeen: "server", relayLine: "server",
  relayEnd: "server", wssTwilio: "server", wssListen: "server", wssBridge: "server", relayStage: "server",
  bridgeLiveRooms: "server", httpServer: "server",
};

function fileForRoute(p) {
  for (const [re, f] of BY_PATH) if (re.test(p)) return f;
  return null;
}

// ---- 4. assign every block --------------------------------------------------------------------
const unassigned = [];
for (const b of blocks) {
  if (b.kind === "import") { b.file = "imports"; continue; }
  if (b.kind === "route") {
    if (b.method === "use") { b.file = "server"; continue; } // the walls stay on the front door
    const f = fileForRoute(b.path);
    if (!f) { unassigned.push(b); continue; }
    b.file = f;
    continue;
  }
  if (b.kind === "route-loop") { b.file = "website-pages"; continue; }
  const n = b.names[0];
  if (n && BY_NAME[n]) { b.file = BY_NAME[n]; continue; }
  if (b.kind === "init") { b.file = "server"; continue; }
  unassigned.push(b);
}
if (unassigned.length) {
  console.error("UNASSIGNED blocks — add them to the table:");
  for (const b of unassigned) console.error(`  line ${b.line}  ${b.kind}  ${b.path ?? b.names.join(",")}`);
  process.exit(1);
}

// ---- 5. report --------------------------------------------------------------------------------
const files = new Map();
for (const b of blocks) {
  if (!files.has(b.file)) files.set(b.file, []);
  files.get(b.file).push(b);
}
if (process.argv.includes("--report")) {
  const rows = [...files.entries()].map(([f, bs]) => [f, bs.length, bs.reduce((n, b) => n + b.text.split("\n").length - 1, 0)]);
  rows.sort((a, b) => b[2] - a[2]);
  for (const [f, n, lines] of rows) console.log(String(lines).padStart(6), String(n).padStart(4), "blocks ", f);
  console.log("TOTAL", rows.reduce((n, r) => n + r[2], 0), "lines in", blocks.length, "blocks");
  process.exit(0);
}

// ---- 6. emit ----------------------------------------------------------------------------------
// Which imported name comes from where (so each file gets only the imports it uses).
const importedFrom = new Map(); // name -> { spec, typeOnly }
for (const b of blocks.filter((x) => x.kind === "import")) {
  const n = b.node;
  const spec = n.moduleSpecifier.text;
  const cl = n.importClause;
  if (!cl) continue;
  if (cl.name) importedFrom.set(cl.name.text, { spec, kind: "default" });
  const nb = cl.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) importedFrom.set(nb.name.text, { spec, kind: "namespace" });
  if (nb && ts.isNamedImports(nb)) {
    for (const el of nb.elements) {
      importedFrom.set(el.name.text, { spec, kind: "named", propertyName: el.propertyName?.text, typeOnly: el.isTypeOnly || cl.isTypeOnly });
    }
  }
}

const ROUTE_DIR_PREFIX = "../"; // src/routes/x.ts -> ../db/client
// Which names does this chunk of code actually reference? Answered off the parse tree, never a
// regex: comments and string bodies contribute nothing, `${…}` inside a template still counts, and
// `x.foo` does not count as a use of `foo`.
const identCache = new Map();
function identifiersIn(body) {
  let set = identCache.get(body);
  if (set) return set;
  set = new Set();
  const f = ts.createSourceFile("chunk.ts", body, ts.ScriptTarget.ESNext, true);
  const walk = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMember = p && ((ts.isPropertyAccessExpression(p) && p.name === n)
        || (ts.isPropertyAssignment(p) && p.name === n)
        || (ts.isBindingElement(p) && p.propertyName === n)
        || (ts.isQualifiedName(p) && p.right === n));
      if (!isMember) set.add(n.text);
    }
    n.forEachChild(walk);
  };
  f.forEachChild(walk);
  identCache.set(body, set);
  return set;
}
const usesIdentifier = (body, name) => identifiersIn(body).has(name);
function importLinesFor(body, ownNames) {
  const bySpec = new Map();
  const add = (spec, s) => { if (!bySpec.has(spec)) bySpec.set(spec, new Set()); bySpec.get(spec).add(s); };
  for (const [name, info] of importedFrom) {
    if (ownNames.has(name)) continue;
    if (!usesIdentifier(body, name)) continue;
    const spec = info.spec.startsWith("./") ? ROUTE_DIR_PREFIX + info.spec.slice(2) : info.spec;
    if (info.kind === "named") add(spec, (info.typeOnly ? "type " : "") + (info.propertyName ? `${info.propertyName} as ${name}` : name));
    else if (info.kind === "default") add("default:" + spec, name);
    else add("namespace:" + spec, name);
  }
  const out = [];
  for (const [spec, set] of bySpec) {
    if (spec.startsWith("default:")) out.push(`import ${[...set][0]} from "${spec.slice(8)}";`);
    else if (spec.startsWith("namespace:")) out.push(`import * as ${[...set][0]} from "${spec.slice(10)}";`);
    else out.push(`import { ${[...set].sort().join(", ")} } from "${spec}";`);
  }
  return out;
}

// which file owns each declared name, so a file can pull one in from its sibling by name
const ownerOf = new Map(); // name -> { file, isType }
for (const [file, bs] of files) {
  if (file === "imports" || file === "server") continue;
  for (const b of bs) for (const n of b.names) ownerOf.set(n, { file, isType: b.isType });
}

// Indent code that moved inside register(), WITHOUT touching the continuation lines of a
// multi-line string or template literal — those characters are output a customer receives, so a
// leading space added there is a real change to a served page.
function indentCode(src, pad) {
  const f = ts.createSourceFile("x.ts", src, ts.ScriptTarget.ESNext, true);
  const frozen = new Set();
  const walk = (n) => {
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) || ts.isStringLiteral(n) || ts.isRegularExpressionLiteral(n)) {
      const a = f.getLineAndCharacterOfPosition(n.getStart(f)).line;
      const b = f.getLineAndCharacterOfPosition(n.getEnd()).line;
      for (let i = a + 1; i <= b; i++) frozen.add(i);
    }
    n.forEachChild(walk);
  };
  f.forEachChild(walk);
  return src.split("\n").map((l, i) => (l.trim() && !frozen.has(i) ? pad + l : l)).join("\n");
}

// The ONE line the split rewrites rather than moves, and why.
const REWRITES = {
  "shared-helpers": [[
    "const here = dirname(fileURLToPath(import.meta.url));",
    `// This file lives in src/routes/ now, so climb back to src/ — every join(here, "../public/…")\n// below then resolves to exactly the path it resolved to when this code sat in src/server.ts.\nconst here = join(dirname(fileURLToPath(import.meta.url)), "..");`,
  ]],
};

const HEADERS = JSON.parse(readFileSync(join(ROOT, "scripts/split-server.headers.json"), "utf8"));

mkdirSync(OUT, { recursive: true });
const order = []; // register() call order for server.ts
for (const [file, bs] of files) {
  if (file === "server" || file === "imports" || file === "shared-helpers") continue;
  const decls = bs.filter((b) => b.kind !== "route" && b.kind !== "route-loop");
  const routes = bs.filter((b) => b.kind === "route" || b.kind === "route-loop");
  const ownNames = new Set(decls.flatMap((b) => b.names));

  const declText = decls.map((b) => b.text.replace(/^\n+/, "\n")).join("\n").trim();
  const routeText = routes.map((b) => b.text.replace(/^\n+/, "\n")).join("\n").trim();
  const body = declText + "\n" + routeText;

  const imports = importLinesFor(body, ownNames);
  const fromSibling = new Map();
  for (const [n, info] of ownerOf) {
    if (info.file === file || ownNames.has(n)) continue;
    if (!usesIdentifier(body, n)) continue;
    if (!fromSibling.has(info.file)) fromSibling.set(info.file, new Set());
    fromSibling.get(info.file).add(info.isType ? "type " + n : n);
  }
  for (const [f, set] of [...fromSibling].sort()) imports.push(`import { ${[...set].sort().join(", ")} } from "./${f}";`);
  imports.unshift(`import type { Hono } from "hono";`);

  // every top-level declaration is exported, so a sibling area can reuse it by name
  const declOut = declText.replace(/^(async function |function |const |let |type |class |enum )/gm, "export $1");
  const indented = indentCode(routeText, "  ");
  const header = HEADERS[file] ?? `// ${file}`;
  const out = [
    header,
    "",
    imports.join("\n"),
    "",
    declOut,
    declOut ? "" : null,
    `export function register(app: Hono) {`,
    indented,
    `}`,
    "",
  ].filter((x) => x !== null).join("\n");
  writeFileSync(join(OUT, file + ".ts"), out.replace(/\n{3,}/g, "\n\n"));
  order.push({ file, first: bs.find((b) => b.kind === "route" || b.kind === "route-loop")?.start ?? Infinity });
}

// shared-helpers has no routes — rewrite it without a register()
{
  const bs = files.get("shared-helpers");
  const ownNames = new Set(bs.flatMap((b) => b.names));
  const body = bs.map((b) => b.text.replace(/^\n+/, "\n")).join("\n").trim();
  const imports = importLinesFor(body, ownNames);
  for (const [n, info] of ownerOf) {
    if (info.file === "shared-helpers" || ownNames.has(n) || !usesIdentifier(body, n)) continue;
    imports.push(`import { ${info.isType ? "type " + n : n} } from "./${info.file}";`);
  }
  let rewritten = body;
  for (const [from, to] of REWRITES["shared-helpers"]) {
    if (!rewritten.includes(from)) { console.error("rewrite target not found:", from); process.exit(1); }
    rewritten = rewritten.replace(from, to);
  }
  const exported = rewritten.replace(/^(async function |function |const |let |type |class )/gm, "export $1");
  writeFileSync(join(OUT, "shared-helpers.ts"), [HEADERS["shared-helpers"], "", imports.join("\n"), "", exported, ""].join("\n"));
}

// ---- 7. the new server.ts ---------------------------------------------------------------------
// Route files register in the order their FIRST route appeared in the old file, dropped in at the
// point the old file registered its first moved route — after every app.use wall, before anything
// else. Registration order only decides who answers when two paths could match the same request;
// scripts/check-route-order.mjs proves no such pair changed places.
order.sort((a, b) => a.first - b.first);
const firstMovedRoute = blocks.find((b) => (b.kind === "route" || b.kind === "route-loop") && b.file !== "server");
const registerCalls = order.map((o) => `register${o.file.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}(app);`);
const registerImports = order.map((o) => `import { register as register${o.file.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())} } from "./routes/${o.file}";`);

const parts = [];
let dropped = false;
for (const b of blocks) {
  if (b.file !== "server" && b.kind !== "import") {
    if (!dropped && b === firstMovedRoute) {
      parts.push("\n\n// ---- Every route, by area. src/routes/README.md says which file holds what. ----\n" + registerCalls.join("\n"));
      dropped = true;
    }
    continue;
  }
  parts.push(b.text);
}
let serverOut = parts.join("");
// the route-module imports go after the last existing import
const lastImport = blocks.filter((b) => b.kind === "import").pop();
const anchor = lastImport.text.trimStart();
serverOut = serverOut.replace(anchor, anchor + "\n" + registerImports.join("\n"));
// names that moved out but are still used by the boot code / the walls
const movedUsed = [];
for (const [file, bs] of files) {
  if (file === "server" || file === "imports") continue;
  for (const b of bs) for (const n of b.names) {
    if (usesIdentifier(serverOut, n)) movedUsed.push({ n, file });
  }
}
if (movedUsed.length) {
  const byFile = new Map();
  for (const { n, file } of movedUsed) { if (!byFile.has(file)) byFile.set(file, new Set()); byFile.get(file).add(n); }
  const lines = [...byFile].map(([f, s]) => `import { ${[...s].sort().join(", ")} } from "./routes/${f}";`);
  serverOut = serverOut.replace(anchor, anchor + "\n" + lines.join("\n"));
}
writeFileSync(SRC, serverOut.replace(/^\n+/, "") + tail);
console.log("wrote", files.size - 2, "route files");
console.log("register order:", order.map((o) => o.file).join(" "));

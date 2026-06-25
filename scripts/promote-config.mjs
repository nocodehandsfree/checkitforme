#!/usr/bin/env node
// PROMOTE: copy config from STAGING → PROD. Run automatically by CI on a push to the prod branch
// (i.e. whenever you promote code staging→prod) so DATA rides along with the deploy — no button.
//
// What it moves: the config tables (chains/mappings/personas/settings, retailers, categories,
// products, statuses, kiosks) + the ElevenLabs restock-agent persona. What it NEVER moves: prod's
// live state (call results, accounts). Prod-side apply is upsert-atomic with a 50% safety floor, so a
// broken/empty staging can't wipe prod.
//
// Env: RAILWAY_API_TOKEN (to fetch each service's ADMIN_TOKEN). --dry to preview without writing.
const TOKEN = process.env.RAILWAY_API_TOKEN;
if (!TOKEN) { console.error("set RAILWAY_API_TOKEN"); process.exit(1); }
const DRY = process.argv.includes("--dry");
const PROJECT = "889e332c-30fe-46e9-a18e-d8de4f7523aa", ENV = "7cbf9327-357a-415e-9031-d1609aead2b4";
const PROD = { svc: "d363a982-e918-4433-b175-defe8faf0ec9", url: "https://checkitforme.com" };
const STG  = { svc: "8165df7a-3bdf-41a5-bdce-24883633a096", url: "https://staging.checkitforme.com" };
const TABLES = ["categories", "chains", "products", "retailers", "statuses", "kiosks", "settings"];

const j = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { "user-agent": "curl/8", ...(opts.headers || {}) } });
  const t = await res.text();
  try { return { ok: res.ok, status: res.status, body: JSON.parse(t) }; }
  catch { return { ok: res.ok, status: res.status, body: t.slice(0, 200) }; }
};
const adminToken = async (svc) => {
  const q = `{ variables(projectId: "${PROJECT}", environmentId: "${ENV}", serviceId: "${svc}") }`;
  const r = await j("https://backboard.railway.app/graphql/v2", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  return r.body?.data?.variables?.ADMIN_TOKEN;
};

const PROD_ADMIN = await adminToken(PROD.svc), STG_ADMIN = await adminToken(STG.svc);
if (!PROD_ADMIN || !STG_ADMIN) { console.error("could not fetch admin tokens"); process.exit(1); }

let failed = false;
for (const name of TABLES) {
  // pull ALL rows from staging (paginated)
  let rows = [], offset = 0;
  for (;;) {
    const d = await j(`${STG.url}/api/admin/table-dump?name=${name}&limit=20000&offset=${offset}`, { headers: { "x-admin-token": STG_ADMIN } });
    if (!d.ok) { console.error(`  ${name}: staging dump failed ${d.status}`, d.body); failed = true; break; }
    rows.push(...d.body.rows); offset += d.body.count;
    if (d.body.count < 20000) break;
  }
  if (DRY) { console.log(`  ${name}: ${rows.length} rows (dry-run, not applied)`); continue; }
  const r = await j(`${PROD.url}/api/admin/promote-apply`, {
    method: "POST", headers: { "x-admin-token": PROD_ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({ name, rows }),
  });
  if (r.ok) console.log(`  ${name}: promoted ${rows.length} (prod prior ${r.body.prior})`);
  else { console.error(`  ${name}: PROD apply ${r.status}`, r.body); failed = true; }
}

// ElevenLabs restock-agent persona: staging agent → prod agent (config lives in EL cloud, not the DB).
// Best-effort: needs ELEVENLABS_API_KEY + both agent ids. Logged, never fails the promote.
console.log("note: ElevenLabs persona promote runs in the agent step (EL API) — see promote.yml");

if (failed) { console.error("PROMOTE had errors"); process.exit(1); }
console.log(DRY ? "dry-run complete" : "promote complete");
